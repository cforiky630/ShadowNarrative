import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import {
  deletePhoto,
  getPhotoDetail,
  markAnalysisFailed,
  updatePhoto,
} from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";

/**
 * 单张照片。
 *
 * 规格：08-DATA_API_SPEC.md §6
 *
 * Next 16 起 `params` 是 Promise，必须 await。
 */

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 轮询超时（08 §10）：800ms 一次、最多 30 秒。
 *
 * 超过这个时间还是 pending，就说明那次分析没跑完（进程重启、上游卡住等），
 * 由**服务端**兜底改判失败 —— 客户端无权写 aiState。
 */
const STALE_PENDING_MS = 30_000;

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    const photo = await getPhotoDetail(userId, id);
    if (!photo) throw new ApiError("NOT_FOUND", "照片不存在");

    /*
     * 卡住的 pending 兜底改判。
     *
     * ⚠️ 2026-10-10 起**无条件**做这件事。原先它只在开了自动分析时做 ——
     * 因为那时候关掉开关后 `pending` 的含义是「还没发出去，等用户点」，
     * 不是失败（`09 §21.2`）。用户定了「自动分析只能开」之后那个状态不存在了，
     * `pending` 只剩一个意思：正在分析。
     */
    if (photo.aiState === "pending") {
      /**
       * 比的是 **updatedAt 而不是 createdAt**。
       *
       * `resetAnalysisState` 会触发 `@updatedAt`，所以这个时间戳的语义是
       * 「上一次有进展是什么时候」。用 createdAt 会出问题：手动重试一张很久
       * 以前上传的照片时，createdAt 不会更新，第一次轮询就会立刻被误判成超时，
       * 重试永远不可能成功。
       */
      const sinceProgress = Date.now() - new Date(photo.updatedAt).getTime();

      if (sinceProgress > STALE_PENDING_MS) {
        const reason = "分析超时，没有拿到结果";
        await markAnalysisFailed(userId, id, reason);
        return ok({ ...photo, aiState: "failed" as const, aiError: reason });
      }
    }

    return ok(photo);
  } catch (error) {
    return failFrom(error, "api/photos/[id] GET");
  }
}

/** 只允许改 caption / favorite / takenAt（08 §6）。 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_INPUT", "请求体必须是 JSON");
    }

    if (typeof body !== "object" || body === null) {
      throw new ApiError("INVALID_INPUT", "请求体必须是对象");
    }

    const input = body as Record<string, unknown>;
    const patch: Parameters<typeof updatePhoto>[2] = {};

    if ("caption" in input) {
      if (input.caption !== null && typeof input.caption !== "string") {
        throw new ApiError("INVALID_INPUT", "caption 必须是字符串或 null");
      }
      patch.caption = input.caption as string | null;
    }
    if ("favorite" in input) {
      if (typeof input.favorite !== "boolean") {
        throw new ApiError("INVALID_INPUT", "favorite 必须是布尔值");
      }
      patch.favorite = input.favorite;
    }
    if ("takenAt" in input) {
      if (input.takenAt !== null && typeof input.takenAt !== "string") {
        throw new ApiError("INVALID_INPUT", "takenAt 必须是 ISO 日期字符串或 null");
      }
      if (input.takenAt === null) {
        patch.takenAt = null;
      } else {
        const parsed = new Date(input.takenAt);
        if (Number.isNaN(parsed.getTime())) {
          throw new ApiError("INVALID_INPUT", "takenAt 不是合法日期");
        }
        patch.takenAt = parsed;
      }
    }

    if (Object.keys(patch).length === 0) {
      throw new ApiError("INVALID_INPUT", "没有可更新的字段");
    }

    return ok(await updatePhoto(userId, id, patch));
  } catch (error) {
    return failFrom(error, "api/photos/[id] PATCH");
  }
}

/** 删除。顺序由服务端保证：先删文件再删记录（08 §16）。 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    await deletePhoto(userId, id);
    return ok({ id });
  } catch (error) {
    return failFrom(error, "api/photos/[id] DELETE");
  }
}
