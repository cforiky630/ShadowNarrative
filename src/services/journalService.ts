import { ApiError } from "@/lib/apiResponse";
import { prisma } from "@/lib/prisma";
import type { JournalNote } from "@/types";

/**
 * 随笔小记领域服务（Journal Service）。
 *
 * 规格：08-DATA_API_SPEC.md §3（Journal 实体）、§8（随笔小记 API）
 *
 * 模型特征：
 * - 1:1 挂载在照片实体上（`Photo.journal`），作为照片的轻量文字沉淀。
 * - 极简结构：仅保留 `content`（正文）与 `sourceVersion`（乐观锁版本号），
 *   不设长文标题与繁杂状态流。
 * - 框架解耦：不引入 Next.js 框架 API，保持纯领域逻辑。
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
 * 随笔小记状态事实。
 *
 * 服务端仅负责客观推导两个事实，具体 UI 动作（笔/本子图标的切换）由客户端组合判定：
 * 1. `hasMaterial`：用户是否在对话中提供过有效事实信息（对话消息 ≥ 1 条）。
 * 2. `stale`：自笔记上次生成/保存以来，是否产生过更新的用户对话内容。
 */
export interface NoteFacts {
  /** 用户说过至少一句话吗 —— 起稿那颗笔的前提 */
  hasMaterial: boolean;
  /** 笔记比最后一轮对话旧吗（且笔记确实存在）—— 润色那颗笔的前提 */
  noteIsStale: boolean;
}

export async function getNoteFacts(
  photoId: string,
  note: JournalNote | null,
): Promise<NoteFacts> {
  const lastUserMessage = await prisma.conversationMessage.findFirst({
    where: { conversation: { photoId }, role: "user" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!lastUserMessage) return { hasMaterial: false, noteIsStale: false };

  return {
    hasMaterial: true,
    noteIsStale:
      note !== null &&
      lastUserMessage.createdAt.getTime() > new Date(note.updatedAt).getTime(),
  };
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
 * 清空即删除设计：
 *
 * 左下角那个本子图标**只在有内容时出现**（用户定的：一个点开是空白页的入口
 * 就是「点不动的东西」，`TopNavigation` 开头那条）。所以「有一行记录」必须
 * 等价于「有内容」—— 留一行空记录，那个图标就会点开一个空白页。
 *
 * 于是这里把「空」翻译成删除，让那条不变量只在这一个地方维护。
 *
 * 并发写入考量：
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
