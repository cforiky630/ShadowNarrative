import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/apiResponse";
import { prisma } from "@/lib/prisma";
import type { AiState, Photo, PhotoDetail, SourceRef } from "@/types";
import {
  removeStoredFiles,
  savePhotoFile,
  saveThumbnailFile,
} from "./mediaService";

/**
 * 照片领域服务 —— 主实体（08 §3）。
 *
 * 多租户约束（08 §1 硬约束 #1，强制）：**所有查询都带 userId 条件**，
 * 不做「先查出再判断」的两段式。找不到与不属于自己一律当作不存在，
 * 不泄露「这个资源存在」（08 §5 —— 404 不区分这两种情况）。
 */

/**
 * 客户端可见的字段。刻意不含 userId —— 客户端不需要，也不该拿。
 *
 * 导出给 timelineService 复用：**不要写第二份映射**。两份拷贝一定会在
 * 加字段时漂移，而漂移的那一份不会报错，只会让某些界面少一个字段。
 */
export const PHOTO_SELECT = {
  id: true,
  storageKey: true,
  thumbnailKey: true,
  contentHash: true,
  mimeType: true,
  width: true,
  height: true,
  byteSize: true,
  takenAt: true,
  caption: true,
  favorite: true,
  aiState: true,
  aiError: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PhotoSelect;

export type PhotoRow = Prisma.PhotoGetPayload<{ select: typeof PHOTO_SELECT }>;

/** 库里是 String（SQLite 没有 enum），出库时收敛回联合类型。 */
function toAiState(value: string): AiState {
  return value === "done" || value === "failed" ? value : "pending";
}

export function toPhoto(row: PhotoRow): Photo {
  return {
    ...row,
    aiState: toAiState(row.aiState),
    takenAt: row.takenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 分页上限（08 §11）。默认不要一次返回全部照片。 */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export interface PhotoListPage {
  photos: Photo[];
  /** 下一页的游标；为 null 表示到底了 */
  nextCursor: string | null;
}

export interface CreatePhotoInput {
  userId: string;
  file: File;
  /**
   * 客户端生成的缩略图（`08 §6`）。**可选** —— 非浏览器上传没有它，
   * 或者它不合格时，`thumbnailKey` 落成 null，界面回落原图。
   */
  thumbnail?: File | null;
  takenAt?: Date | null;
  caption?: string | null;
}

/**
 * 上传一张照片。
 *
 * 顺序按 08 §6，**不可交换**：校验 → 真实格式 → dimensions → contentHash →
 * 落盘 → 建记录。前四步与落盘在 `savePhotoFile` 里。
 *
 * 缩略图紧跟在原图之后落盘、在建记录之前 —— 记录里要带 `thumbnailKey`。
 * 它是**派生资源**：校验不过或落盘失败都只当作「这张没有缩略图」，
 * 绝不影响上传（`05 §7` 的降级姿态）。
 *
 * 这里补的是第 8 步前的收尾：记录建失败时把已落盘的**两个**文件都删掉 ——
 * 否则留下谁也查不到的孤儿文件（08 §1 硬约束 #2）。
 *
 * ⚠️ **不在这里触发 AI**（第 8 步）。AI 的触发写在路由层，因为那需要
 * `after()` —— 框架 API 不得进入 service（见计划的「可抽取约束」）。
 * 本函数只负责让记录以 `aiState = "pending"` 落地。
 */
export async function createPhoto(input: CreatePhotoInput): Promise<Photo> {
  const stored = await savePhotoFile(input.file);

  const thumbnail = input.thumbnail
    ? await saveThumbnailFile(input.thumbnail, stored.storageKey)
    : null;

  try {
    const row = await prisma.photo.create({
      data: {
        userId: input.userId,
        storageKey: stored.storageKey,
        thumbnailKey: thumbnail?.storageKey ?? null,
        contentHash: stored.contentHash,
        mimeType: stored.mimeType,
        width: stored.width,
        height: stored.height,
        byteSize: stored.byteSize,
        /*
         * 拍摄时间：**显式传的优先，其次 EXIF，最后 null**（`08 §6`）。
         *
         * `input.takenAt` 是客户端在表单里带的 —— 它会盖过 EXIF，因为
         * 用户手动写的时间就是比相机时钟可信。两者都没有就留 null，
         * 排序时回落到 `createdAt`（`08 §3`）。
         *
         * EXIF 读取在 `savePhotoFile` 里做（字节已经在手上，不必再读一遍盘）。
         */
        takenAt: input.takenAt ?? stored.takenAt ?? null,
        caption: input.caption?.trim() || null,
        aiState: "pending",
      },
      select: PHOTO_SELECT,
    });

    return toPhoto(row);
  } catch (error) {
    // 记录没建成，落盘的东西不能留 —— 两阶段删除的同一条道理（08 §16）。
    // 缩略图也要删：它不会进备份（18 §2），没人知道该删它
    await removeStoredFiles([
      stored.storageKey,
      ...(thumbnail ? [thumbnail.storageKey] : []),
    ]);
    throw error;
  }
}

/**
 * 取一张照片的完整视图，含字幕与「有没有随笔小记」。
 *
 * `aiState` 让客户端知道还要不要继续轮询（08 §10），
 * `subtitle` 就是要显示在照片下方的那句话。
 *
 * ⚠️ `hasNote` **只回答在不在，不带正文** —— 照片页只需要据此决定左下角
 * 那个本子图标出不出现，而正文可能很长。真要点开时再走
 * `GET /api/photos/:id/journal`（与对话取消息同一条路）。
 */
export async function getPhotoDetail(
  userId: string,
  photoId: string,
): Promise<PhotoDetail | null> {
  const row = await prisma.photo.findFirst({
    where: { id: photoId, userId },
    select: {
      ...PHOTO_SELECT,
      conversation: {
        select: {
          messages: {
            where: { isSubtitle: true },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              id: true,
              role: true,
              content: true,
              sourceRefs: true,
              isSubtitle: true,
              createdAt: true,
            },
          },
        },
      },
      // 只要 id：判断在不在
      journal: { select: { id: true } },
    },
  });

  if (!row) return null;

  const { conversation, journal, ...photoRow } = row;
  const message = conversation?.messages[0] ?? null;

  return {
    ...toPhoto(photoRow),
    subtitle: message
      ? {
          id: message.id,
          role: message.role === "user" ? "user" : "assistant",
          content: message.content,
          sourceRefs: parseSourceRefs(message.sourceRefs),
          isSubtitle: message.isSubtitle,
          createdAt: message.createdAt.toISOString(),
        }
      : null,
    hasNote: journal !== null,
  };
}

/** sourceRefs 在库里是 String（SQLite 的 Json 支持有限，08 §2）。 */
function parseSourceRefs(raw: string | null): SourceRef[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SourceRef[]) : null;
  } catch {
    return null;
  }
}

/**
 * 取最近上传的一张照片。首页用。
 *
 * 排序用 `createdAt`（导入时间）而不是 `takenAt`：首页要的是「我刚放进去的那张」。
 * 斜轴相册按拍摄时间排、且要在 takenAt 缺失时回落到 createdAt —— 那是 Round 5 的事。
 */
export async function getLatestPhoto(
  userId: string,
  options: { favorite?: boolean } = {},
): Promise<Photo | null> {
  const row = await prisma.photo.findFirst({
    where: {
      userId,
      ...(options.favorite === undefined ? {} : { favorite: options.favorite }),
    },
    orderBy: { createdAt: "desc" },
    select: PHOTO_SELECT,
  });

  return row ? toPhoto(row) : null;
}

/**
 * 游标分页列表（08 §11）。不用 offset —— 上传新照片会让 offset 结果错位。
 *
 * 排序带 `id` 次级键：同一毫秒内建的两条记录，只按 createdAt 排是不稳定的，
 * 而游标分页要求顺序确定。
 */
export async function listPhotos(
  userId: string,
  options: { cursor?: string | null; limit?: number; favorite?: boolean } = {},
): Promise<PhotoListPage> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const rows = await prisma.photo.findMany({
    where: {
      userId,
      ...(options.favorite === undefined ? {} : { favorite: options.favorite }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1, // 多取一条用来判断还有没有下一页
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: PHOTO_SELECT,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    photos: page.map(toPhoto),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/** PATCH 允许改的字段（08 §6）。其余一律忽略，不做静默透传。 */
export interface UpdatePhotoInput {
  caption?: string | null;
  favorite?: boolean;
  takenAt?: Date | null;
}

/** 改 caption / favorite / takenAt，返回完整照片。 */
export async function updatePhoto(
  userId: string,
  photoId: string,
  input: UpdatePhotoInput,
): Promise<Photo> {
  // ownership 与更新合成一次查询：用 updateMany 带 userId 条件，
  // 避免「先校验再更新」之间被插入的窗口
  const data: Prisma.PhotoUpdateManyMutationInput = {};
  if ("caption" in input) data.caption = input.caption?.trim() || null;
  if ("favorite" in input) data.favorite = input.favorite;
  if ("takenAt" in input) data.takenAt = input.takenAt ?? null;

  const result = await prisma.photo.updateMany({
    where: { id: photoId, userId },
    data,
  });

  if (result.count === 0) {
    throw new ApiError("NOT_FOUND", "照片不存在");
  }

  const row = await prisma.photo.findFirst({
    where: { id: photoId, userId },
    select: PHOTO_SELECT,
  });

  // updateMany 命中了就不可能查不到；这里的抛错是防御，不是预期路径
  if (!row) throw new ApiError("NOT_FOUND", "照片不存在");
  return toPhoto(row);
}

/**
 * 删除一张照片及其全部资源。
 *
 * 规格：08 §16 —— **两阶段，顺序不可交换：先删文件，再删记录。**
 *
 * 反过来的话，文件删除失败时记录已经没了，那些文件就再也没人知道该删 ——
 * 成为永远查不到的孤儿。按现在的顺序，最坏情况是留下一条指向缺失文件的记录，
 * 这是看得见、可修复的。
 *
 * 数据库侧的 analysis / conversation / journal / 分组关系靠 schema 的
 * `onDelete: Cascade` 带走。
 */
export async function deletePhoto(
  userId: string,
  photoId: string,
): Promise<void> {
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, userId },
    select: { id: true, storageKey: true, thumbnailKey: true },
  });

  // 不存在或不属于当前用户，一律当作没找到（08 §5）
  if (!photo) throw new ApiError("NOT_FOUND", "照片不存在");

  // --- 阶段一：删文件 ---
  const keys = [photo.storageKey, photo.thumbnailKey].filter(
    (k): k is string => Boolean(k),
  );
  const failed = await removeStoredFiles(keys);

  // 有文件没删掉就停在这里，**不要往下删记录**
  if (failed.length > 0) {
    throw new ApiError(
      "DELETION_INCOMPLETE",
      `有 ${failed.length} 个文件删除失败，已保留数据库记录以免产生孤儿文件`,
      { failedKeys: failed },
    );
  }

  // --- 阶段二：删记录（级联带走附属） ---
  await prisma.photo.delete({ where: { id: photoId } });
}

// ---------------------------------------------------------------------------
// AI 状态（08 §3、08 §10）
// ---------------------------------------------------------------------------

/** 轮询超时后由服务端兜底标记失败。客户端无权写 aiState。 */
export async function markAnalysisFailed(
  userId: string,
  photoId: string,
  reason: string,
): Promise<void> {
  await prisma.photo.updateMany({
    where: { id: photoId, userId },
    data: { aiState: "failed", aiError: reason },
  });
}

export async function resetAnalysisState(
  userId: string,
  photoId: string,
): Promise<void> {
  await prisma.photo.updateMany({
    where: { id: photoId, userId },
    data: { aiState: "pending", aiError: null },
  });
}
