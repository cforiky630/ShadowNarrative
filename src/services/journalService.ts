import { ApiError } from "@/lib/apiResponse";
import { prisma } from "@/lib/prisma";
import type { JournalNote } from "@/types";

/**
 * 随笔小记。
 *
 * 规格：`08-DATA_API_SPEC.md` §3（`Journal`）、§8（API）
 *
 * **它挂在照片上，1:1**（`Photo.journal`）。名字是用户 2026-10-10 定的：
 * 随笔小记，不是「日志」—— 而且它是**轻**的东西，不是长文日志。
 * 所以这里只有「正文」和「版本」，没有标题、没有起草/定稿那层仪式。
 *
 * 与 `conversationService` 同一条边界：**不 import 框架 API**——
 * 所有 service 都要能整体挪到独立进程而不改函数体（`05 §7`）。
 */

/** 出库时收敛形状。加字段时只改这一处，不要在两处各写一份映射 */
const NOTE_SELECT = {
  id: true,
  content: true,
  sourceVersion: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toNote(row: {
  id: string;
  content: string;
  sourceVersion: number;
  createdAt: Date;
  updatedAt: Date;
}): JournalNote {
  return {
    id: row.id,
    content: row.content,
    sourceVersion: row.sourceVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 读这张照片的随笔小记。没有就返回 null —— 不是错误。 */
export async function getNote(photoId: string): Promise<JournalNote | null> {
  const row = await prisma.journal.findUnique({
    where: { photoId },
    select: NOTE_SELECT,
  });
  return row ? toNote(row) : null;
}

/**
 * 那颗笔（起稿 / 润色）现在该不该出现。
 *
 * 用户 2026-10-10 定的规矩：「首次生成只能在对话那里」，而且
 * 「**又多了几轮对话后**再让 AI 润色的时候是笔的图标」。合起来是两条：
 *
 * ```text
 * 说过话吗          没有 → 不给。没有可整理的素材，硬写只能编（01 §9）
 * 有笔记吗          没有 → 给（起稿）
 * 有，但比最后一轮对话旧 → 给（润色）
 * 有，而且不比对话旧   → 不给
 * ```
 *
 * ⚠️ **由服务端算，不由客户端算。** 客户端要算这一条得同时知道笔记和对话，
 * 而这两样在两个不同的地方取；分散算的结果是「刚生成完那边还是旧状态」。
 */
export async function canGenerateNote(
  photoId: string,
  note: JournalNote | null,
): Promise<boolean> {
  const lastUserMessage = await prisma.conversationMessage.findFirst({
    where: { conversation: { photoId }, role: "user" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!lastUserMessage) return false;
  if (!note) return true;

  return lastUserMessage.createdAt.getTime() > new Date(note.updatedAt).getTime();
}

export interface SaveNoteInput {
  photoId: string;
  /** 正文。**空白 = 删掉这条**，见下 */
  content: string;
  /**
   * 传了就做并发检测：与库里存的版本不一致 → 抛 `CONFLICT`（`08 §5` 的 409）。
   *
   * ⚠️ **AI 那条路不传** —— 它是用户按了那颗笔才跑的一次重写，
   * 没有「谁先谁后」的问题。传了反而会在「刚打开面板、还没读到最新版本」
   * 时误报冲突。这个参数是给**用户手改**那条路用的。
   */
  expectedVersion?: number;
}

/**
 * 写这张照片的随笔小记。返回写完之后的那一条；**正文被清空时返回 null**。
 *
 * ── 为什么清空 = 删除 ──────────────────────────────────────────────
 *
 * 左下角那个本子图标**只在有内容时出现**（用户定的：一个点开是空白页的入口
 * 就是「点不动的东西」，`TopNavigation` 开头那条）。所以「有一行记录」必须
 * 等价于「有内容」—— 留一行空记录，那个图标就会点开一个空白页。
 *
 * 于是这里把「空」翻译成删除，让那条不变量只在这一个地方维护。
 *
 * ── 为什么是 upsert ───────────────────────────────────────────────
 *
 * 第一次写要能建行（AI 起稿那条路，以及用户在一个还没有笔记的照片上手写）。
 * 用 `upsert` 而不是「先查再建」：并发下后者会撞 `photoId` 的唯一约束。
 */
export async function saveNote(
  input: SaveNoteInput,
): Promise<JournalNote | null> {
  const content = input.content.trim();

  if (!content) {
    // 清空 = 删掉。用 deleteMany 而不是 delete —— 那一行本来就可能不在，
    // delete 在不存在时会抛 P2025，而「它已经没了」正是我们要的结果（08 §16 同一条）
    await prisma.journal.deleteMany({ where: { photoId: input.photoId } });
    return null;
  }

  const existing = await prisma.journal.findUnique({
    where: { photoId: input.photoId },
    select: { id: true, sourceVersion: true },
  });

  if (
    existing &&
    input.expectedVersion !== undefined &&
    existing.sourceVersion !== input.expectedVersion
  ) {
    throw new ApiError(
      "CONFLICT",
      "这条随笔小记在别处被改过了，先看看最新的再改",
      { currentVersion: existing.sourceVersion },
    );
  }

  const row = await prisma.journal.upsert({
    where: { photoId: input.photoId },
    create: { photoId: input.photoId, content },
    // 版本每次写入都 +1 —— 它记的是「改了几次」，不是「AI 改了几次」
    // （原来那行的注释写的是「每次 AI 重写 +1」，与用法对不上）
    update: { content, sourceVersion: { increment: 1 } },
    select: NOTE_SELECT,
  });

  return toNote(row);
}
