import { ApiError, failFrom } from "@/lib/apiResponse";
import { readStoredFile } from "@/services/mediaService";
import { getPhotoDetail } from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";

/**
 * 原图。替代旧的 `/api/media/:id`。
 *
 * 规格：08-DATA_API_SPEC.md §6（`GET /api/photos/:id/file`）、§14（缓存）
 *
 * 文件存在数据目录的 `photos/` 下，不在 `public/` 里，所以必须经这个路由出去 ——
 * 顺带在这里做 ownership 校验。
 */

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    // ownership 校验合成在查询条件里，不做「先查出再判断」的两段式（08 §1）
    const photo = await getPhotoDetail(userId, id);

    // 找不到与不属于当前用户一律 404 —— 不泄露「这个资源存在」（08 §5）
    if (!photo) throw new ApiError("NOT_FOUND", "资源不存在");

    const bytes = await readStoredFile(photo.storageKey);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": photo.mimeType,
        // 文件名是 UUID、内容不变，可以长期缓存（08 §14）
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    // 记录在库里但文件丢了 —— 属于数据不一致，同样按不存在处理
    return failFrom(
      error instanceof ApiError ? error : new ApiError("NOT_FOUND", "资源不存在"),
      "api/photos/[id]/file",
    );
  }
}
