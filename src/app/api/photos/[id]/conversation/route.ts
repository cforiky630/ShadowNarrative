import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import { listMessages } from "@/services/conversationService";
import { getPhotoDetail } from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";

/**
 * 一段对话的全部消息（`08 §7`）。
 *
 * **字幕天然是第一条**（`08 §3`：字幕就是对话的第一条，不做两套数据），
 * 所以展开对话时不需要把字幕单独拼进去 —— 它已经在列表里了。
 *
 * 不需要 `connection()`：动态段 `[id]` 本身就是请求数据，
 * 这条路由不会被预渲染（对比 `api/settings`、`api/timeline` 那两个没有参数的，
 * 它们必须显式挡一下，否则 better-sqlite3 会在构建时真的去查库）。
 */

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    // ownership 与存在性校验。不区分「不存在」与「不属于你」（08 §1、§5）
    const photo = await getPhotoDetail(userId, id);
    if (!photo) throw new ApiError("NOT_FOUND", "照片不存在");

    return ok(await listMessages(id));
  } catch (error) {
    return failFrom(error, "api/photos/[id]/conversation GET");
  }
}
