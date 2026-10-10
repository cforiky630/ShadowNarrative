import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import { removePhoto } from "@/services/memoryService";
import { getLocalUserId } from "@/services/userService";

/**
 * 把一张照片从这一册里**移出**（`08 §9`）。
 *
 * ⚠️ 不叫删除。**照片本身一张不动** —— 文件、对话、随笔小记全在，
 * 只是不在这册里了（`08 §4`）。用户 2026-10-11 专门定了这个字：
 * 不是真删除的，就不要叫删除。
 *
 * DELETE 而不是 PATCH：删的是「这一册 × 这一张」那行关系本身，
 * 而且它是幂等的 —— 移出两次第二次返回 404 而不是报错意义上的失败。
 */

type RouteParams = { params: Promise<{ id: string; photoId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id, photoId } = await params;
    const userId = await getLocalUserId();

    // 两种「没删成」在这里合并：册子不是他的，或那张本来就不在册里
    const removed = await removePhoto(userId, id, photoId);
    if (!removed) throw new ApiError("NOT_FOUND", "这一册里没有这张");

    return ok(null);
  } catch (error) {
    return failFrom(error, "api/memories/[id]/photos/[photoId] DELETE");
  }
}
