import { prisma } from "@/lib/prisma";
import type { ConversationMessage, SourceRef } from "@/types";

/**
 * 对话服务。
 *
 * 规格：08 §3（Conversation / ConversationMessage）、09 §21.1
 *
 * **字幕就是对话的第一条**，不做两套数据 —— 一份内容，两种呈现：
 * 照片下方安静浮现（默认），展开对话后就是列表里的第一条。
 * `isSubtitle` 只决定它以什么形式呈现，不决定它存在哪里。
 */

function toMessage(row: {
  id: string;
  role: string;
  content: string;
  sourceRefs: string | null;
  isSubtitle: boolean;
  createdAt: Date;
}): ConversationMessage {
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    sourceRefs: parseSourceRefs(row.sourceRefs),
    isSubtitle: row.isSubtitle,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseSourceRefs(raw: string | null): SourceRef[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SourceRef[]) : null;
  } catch {
    // 库里存的是应用层写进去的 JSON；解析不了说明数据坏了，
    // 但不该让整个响应失败 —— 证据来源缺失比看不到字幕轻得多
    return null;
  }
}

export interface RecordSubtitleInput {
  photoId: string;
  content: string;
  sourceRefs?: SourceRef[] | null;
}

/**
 * 写入（或替换）一张照片的字幕。
 *
 * **替换而不是追加**：手动重试会让 AI 再跑一次，追加的话字幕会越堆越多，
 * 破坏「字幕就是第一条」这个不变量。
 *
 * 替换时**保留原 createdAt** —— 否则重试后字幕会跳到对话末尾，
 * 而它必须始终是第一条。
 */
export async function recordSubtitle(
  input: RecordSubtitleInput,
): Promise<ConversationMessage> {
  const conversation = await prisma.conversation.upsert({
    where: { photoId: input.photoId },
    create: { photoId: input.photoId },
    update: {},
    select: { id: true },
  });

  const existing = await prisma.conversationMessage.findFirst({
    where: { conversationId: conversation.id, isSubtitle: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true },
  });

  if (existing) {
    const updated = await prisma.conversationMessage.update({
      where: { id: existing.id },
      data: {
        content: input.content,
        sourceRefs: input.sourceRefs
          ? JSON.stringify(input.sourceRefs)
          : null,
      },
      select: MESSAGE_SELECT,
    });
    return toMessage(updated);
  }

  const created = await prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: input.content,
      sourceRefs: input.sourceRefs ? JSON.stringify(input.sourceRefs) : null,
      isSubtitle: true,
    },
    select: MESSAGE_SELECT,
  });

  return toMessage(created);
}

const MESSAGE_SELECT = {
  id: true,
  role: true,
  content: true,
  sourceRefs: true,
  isSubtitle: true,
  createdAt: true,
} as const;

/**
 * 一段对话的全部消息，按时间正序。
 *
 * Round 8 展开对话时用 —— 字幕天然就在列表首位（09 §21.1）。
 */
export async function listMessages(
  photoId: string,
): Promise<ConversationMessage[]> {
  const rows = await prisma.conversationMessage.findMany({
    where: { conversation: { photoId } },
    orderBy: { createdAt: "asc" },
    select: MESSAGE_SELECT,
  });

  return rows.map(toMessage);
}

/**
 * 追加一条消息（Round 8）。
 *
 * ⚠️ **和 `recordSubtitle` 不是一回事，别合并。**
 * 字幕是**替换**（只有一条，且必须永远是第一条，`09 §21.1`）；
 * 对话是**追加**，用户和 AI 说的话只增不改。
 *
 * `Conversation` 表 1:1 挂在照片上，不预建 —— 没有对话的照片本来就该
 * 一条记录都没有。`upsert` 是为了让「用户在第一句话之前就打开了面板」
 * 这种情况也能写进去。
 *
 * `sourceRefs` 留空是**刻意的**：见 `aiService.runConversationReply` 里的说明 ——
 * 不编造来源比标一个假的来源更符合 `09 §6`。
 */
export async function appendMessage(input: {
  photoId: string;
  role: "user" | "assistant";
  content: string;
}): Promise<ConversationMessage> {
  const conversation = await prisma.conversation.upsert({
    where: { photoId: input.photoId },
    create: { photoId: input.photoId },
    update: {},
    select: { id: true },
  });

  const row = await prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      role: input.role,
      content: input.content,
      isSubtitle: false,
    },
    select: MESSAGE_SELECT,
  });

  return toMessage(row);
}
