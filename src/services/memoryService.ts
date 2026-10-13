import { ApiError } from "@/lib/apiResponse";
import { prisma } from "@/lib/prisma";
import type { MemoryDetail, MemorySummary } from "@/types";
import {
  byPhotoTimeDesc,
  PHOTO_SELECT,
  toPhoto,
} from "./photoService";

/**
 * 影册 —— 用户自己分的那些集合（`08 §9`；`01 §4` 里它叫 Memory）。
 *
 * ── 三个空间各切一刀 ─────────────────────────────────────────────────
 *
 * ```text
 * Album（第一屏）   我挑出来的      收藏
 * 时间线            我拍过的全部    按天
 * 影册              我自己归的      用户命名、用户放照片
 * ```
 *
 * ⚠️ **界面上一律「影册」，代码里叫 `Memory`** —— 理由见
 * `prisma/schema.prisma` 那条注释。
 *
 * ⚠️ **删影册不删照片**（`08 §4`）：这张表只是关系，级联只带走关系行。
 * 这条是产品里少有的「删了不心疼」的操作，所以界面上那道门也比照片删除轻
 * （两步，不长按）—— 见 `MemoryAlbum`。
 *
 * 与其余 service 同一条边界：**不 import 框架 API**（`05 §7`），
 * 每个函数第一个参数是 `userId`（`08 §1`）。
 */

// ---------------------------------------------------------------------------
// 架子
// ---------------------------------------------------------------------------

/**
 * 架子上那几十册。
 *
 * ⚠️ **一次把该用户的全部 `MemoryPhoto` 取回来在 JS 里分组，不做 N 次查询。**
 * 架子那格要的是「组内拍摄时间最新的前几张」，而那个 coalesce
 * （`takenAt` 缺则回落 `createdAt`）**没法用 Prisma 的 `orderBy` 表达** ——
 * 与 `albumService` / `timelineService` 里那份说明是同一件事，
 * 值也就共用同一个 `photoService.photoTime`。
 *
 * 精选规模下一册几十张、几十册，两条查询的事。照片库或影册多到这一步扛不住
 * 时，该加的是 `Memory.coverPhotoId` 这种预先落下的字段，而不是先上 N+1。
 */
export async function listMemories(userId: string): Promise<MemorySummary[]> {
  const memories = await prisma.memory.findMany({
    where: { userId },
    // 最近动过的在前 —— 刚往里加过照片的那一册就在第一眼
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      photos: selectCoverRows,
    },
  });

  return memories.map((m) => ({
    id: m.id,
    title: m.title,
    count: m.photos.length,
    coverIds: pickCoverIds(m.photos),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }));
}

/** 打开一册。不存在或不属于当前用户都返回 null（`08 §5` 不区分，不泄露） */
export async function getMemory(
  userId: string,
  memoryId: string,
): Promise<MemoryDetail | null> {
  const memory = await prisma.memory.findFirst({
    where: { id: memoryId, userId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      photos: {
        select: { photo: { select: PHOTO_SELECT } },
      },
    },
  });
  if (!memory) return null;

  return {
    id: memory.id,
    title: memory.title,
    photos: memory.photos
      .map((link) => link.photo)
      .sort(byPhotoTimeDesc)
      .map(toPhoto),
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 改这一册本身
// ---------------------------------------------------------------------------

/** 名字的长度上限。够写「2024 年在厦门的那几天」，又不至于把架子撑破 */
const TITLE_MAX_CHARS = 60;

/**
 * 校验并收敛名字。空白 → 抛 `INVALID_INPUT`。
 *
 * ⚠️ 名字是**必填**的（schema 里 `title` 非空）：架子上一格读的就是它，
 * 没有名字的一册在界面上是一块说不出是什么的东西。
 */
function cleanTitle(title: unknown): string {
  if (typeof title !== "string") {
    throw new ApiError("INVALID_INPUT", "名字必须是字符串");
  }
  const trimmed = title.trim();
  if (!trimmed) throw new ApiError("INVALID_INPUT", "给它起个名字");
  if (trimmed.length > TITLE_MAX_CHARS) {
    throw new ApiError("INVALID_INPUT", `名字最多 ${TITLE_MAX_CHARS} 个字`);
  }
  return trimmed;
}

export async function createMemory(
  userId: string,
  title: unknown,
): Promise<MemorySummary> {
  const memory = await prisma.memory.create({
    data: { userId, title: cleanTitle(title) },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  return {
    ...memory,
    count: 0,
    coverIds: [],
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}

/** 改名。不属于当前用户 → false */
export async function renameMemory(
  userId: string,
  memoryId: string,
  title: unknown,
): Promise<boolean> {
  const clean = cleanTitle(title);

  // updateMany 而不是 update：条件里能带 userId，越权与不存在都落到 count 0
  // （`08 §1`：不做「先查出再判断」）
  const { count } = await prisma.memory.updateMany({
    where: { id: memoryId, userId },
    data: { title: clean },
  });
  return count > 0;
}

/**
 * 删掉这一册。**照片一张都不动**（`08 §4`）—— 级联只带走 `memory_photos`
 * 里那几行关系。
 */
export async function deleteMemory(
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const { count } = await prisma.memory.deleteMany({
    where: { id: memoryId, userId },
  });
  return count > 0;
}

// ---------------------------------------------------------------------------
// 册里的照片
// ---------------------------------------------------------------------------

/** 一次最多加多少张。多选面板分页每页 60，跨几页选也够用了 */
const ADD_LIMIT = 500;

export interface AddPhotosResult {
  /** 这次真加进去几张 */
  added: number;
  /** 加完之后这一册有几张 */
  count: number;
}

/**
 * 往这一册里加照片。**返回这次真加进去几张** —— 已经在册里的会被跳过。
 *
 * ── 两个必须自己做的事 ───────────────────────────────────────────────
 *
 * **① 排重。** SQLite **不支持 `createMany({ skipDuplicates: true })`**
 * （Prisma 只在 Postgres / MySQL / SQLServer 上支持它），硬写会撞
 * `memory_photos` 的主键约束。所以先求出差集再建 —— 两条查询，
 * 没有异常处理，而且顺手给出「这次加进去几张」这个界面上要说的数。
 *
 * **② 认一遍这些照片是谁的。** ⚠️ 不校验的话，一个手写的请求就能把不相干的
 * `photoId` 塞进自己的影册 —— 那是一条**越权写入**，不是参数不合法。
 * 查询条件里带上 `userId`（`08 §1`）。
 */
export async function addPhotos(
  userId: string,
  memoryId: string,
  photoIds: unknown,
): Promise<AddPhotosResult | null> {
  if (!Array.isArray(photoIds) || photoIds.some((v) => typeof v !== "string")) {
    throw new ApiError("INVALID_INPUT", "photoIds 必须是字符串数组");
  }
  const ids = [...new Set(photoIds as string[])].slice(0, ADD_LIMIT);

  const memory = await prisma.memory.findFirst({
    where: { id: memoryId, userId },
    select: { id: true },
  });
  if (!memory) return null;

  const owned = ids.length
    ? await prisma.photo.findMany({
        where: { userId, id: { in: ids } },
        select: { id: true },
      })
    : [];

  const already = owned.length
    ? await prisma.memoryPhoto.findMany({
        where: { memoryId, photoId: { in: owned.map((p) => p.id) } },
        select: { photoId: true },
      })
    : [];

  const skip = new Set(already.map((row) => row.photoId));
  const toAdd = owned.filter((p) => !skip.has(p.id)).map((p) => p.id);

  if (toAdd.length) {
    await prisma.memoryPhoto.createMany({
      data: toAdd.map((photoId) => ({ memoryId, photoId })),
    });
  }

  const count = await prisma.memoryPhoto.count({ where: { memoryId } });
  return { added: toAdd.length, count };
}

/** 把一张照片从这一册里移出。**照片本身一张不动** */
export async function removePhoto(
  userId: string,
  memoryId: string,
  photoId: string,
): Promise<boolean> {
  // 先认这一册是不是他的（关系表自己没有 userId）
  const memory = await prisma.memory.findFirst({
    where: { id: memoryId, userId },
    select: { id: true },
  });
  if (!memory) return false;

  const { count } = await prisma.memoryPhoto.deleteMany({
    where: { memoryId, photoId },
  });
  return count > 0;
}

// ---------------------------------------------------------------------------
// 内部
// ---------------------------------------------------------------------------

/**
 * 架子只需要「哪张当封面」，所以这一层查询不把照片整行拉回来。
 *
 * `createdAt` 与 `takenAt` 都取是为了在 JS 里算 `photoTime` ——
 * 那个回落规则在 `photoService` 里有单一的一份。
 */
const selectCoverRows = {
  select: {
    photo: { select: { id: true, takenAt: true, createdAt: true } },
  },
} as const;

type CoverLink = {
  photo: { id: string; takenAt: Date | null; createdAt: Date };
};

/**
 * 架子那一格用哪几张 —— 组内**拍摄时间最新的前 4 张**。
 *
 * ⚠️ 是「一组」不是「一张」（用户 2026-10-11：「每一册都是一组缩略图作为
 * 一个入口」）。一张说不出这一册里都有些什么，四张能。
 *
 * 空册 → `[]`。上限定在 4 是因为架子那格的版式最多摆四张（见 `AlbumCover`）。
 */
const COVER_LIMIT = 4;

function pickCoverIds(links: CoverLink[]): string[] {
  return [...links]
    .sort((a, b) => byPhotoTimeDesc(a.photo, b.photo))
    .slice(0, COVER_LIMIT)
    .map((link) => link.photo.id);
}
