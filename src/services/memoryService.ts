import { prisma } from "@/lib/prisma";
import { saveUpload } from "./mediaService";

/**
 * Memory 领域服务。
 *
 * 规格：08-DATA_API_SPEC.md §4
 *
 * 多租户约束（08 §3，强制）：所有查询都必须带 userId 条件，
 * 不做「先查出再判断」的两段式。
 */

/** 单用户阶段的本地用户 id。接入登录后由会话提供。 */
export const LOCAL_USER_ID = "local";

/**
 * 取得（必要时创建）本地用户。
 *
 * 产品当前是单用户，但 schema 已经按多租户写，所以这里也走 User 表，
 * 而不是在代码里硬编码一个字符串 —— 将来接登录时不用改数据模型。
 */
export async function getLocalUserId(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { id: LOCAL_USER_ID },
    create: { id: LOCAL_USER_ID, name: "Local" },
    update: {},
    select: { id: true },
  });
  return user.id;
}

export interface MemorySummary {
  id: string;
  title: string | null;
  summary: string | null;
  location: string | null;
  memoryDate: Date | null;
  updatedAt: Date;
  cover: {
    mediaId: string;
    width: number;
    height: number;
  } | null;
}

/** 首页用的查询：取最近更新的一条 Memory 及其封面。 */
export async function getLatestMemory(
  userId: string,
): Promise<MemorySummary | null> {
  const memory = await prisma.memory.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      summary: true,
      location: true,
      memoryDate: true,
      updatedAt: true,
      coverMediaId: true,
      media: {
        select: { id: true, width: true, height: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!memory) return null;

  // 封面优先用显式指定的；没有就退回第一张媒体。
  // coverMediaId 刻意不建外键（见 schema 注释），所以这里要容错。
  const cover =
    memory.media.find((m) => m.id === memory.coverMediaId) ??
    memory.media[0] ??
    null;

  return {
    id: memory.id,
    title: memory.title,
    summary: memory.summary,
    location: memory.location,
    memoryDate: memory.memoryDate,
    updatedAt: memory.updatedAt,
    cover: cover
      ? { mediaId: cover.id, width: cover.width, height: cover.height }
      : null,
  };
}

/** 供 08 §3 的 ownership 校验复用。找不到与不属于自己一律返回 false。 */
export async function assertOwnership(
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const found = await prisma.memory.findFirst({
    where: { id: memoryId, userId },
    select: { id: true },
  });
  return found !== null;
}

export interface CreatedMemory {
  memoryId: string;
  mediaId: string;
}

/**
 * 用一张照片创建一条 Memory。
 *
 * 先建 Memory 再上传，是为了拿到 memoryId 去关联 MediaAsset。
 * 上传失败时把空 Memory 删掉 —— 不留孤儿记录（08 §15）。
 */
export async function createMemoryWithPhoto(params: {
  userId: string;
  file: File;
  title?: string | null;
  memoryDate?: Date | null;
  location?: string | null;
}): Promise<CreatedMemory> {
  const memory = await prisma.memory.create({
    data: {
      userId: params.userId,
      title: params.title?.trim() || null,
      memoryDate: params.memoryDate ?? null,
      location: params.location?.trim() || null,
    },
    select: { id: true },
  });

  try {
    const media = await saveUpload({ memoryId: memory.id, file: params.file });

    await prisma.memory.update({
      where: { id: memory.id },
      data: { coverMediaId: media.id },
    });

    return { memoryId: memory.id, mediaId: media.id };
  } catch (error) {
    await prisma.memory.delete({ where: { id: memory.id } }).catch(() => {});
    throw error;
  }
}
