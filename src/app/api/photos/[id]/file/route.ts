import { ApiError, failFrom } from "@/lib/apiResponse";
import { openStoredFile } from "@/services/mediaService";
import { getPhotoFileRef } from "@/services/photoService";
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
    const photo = await getPhotoFileRef(userId, id);

    // 找不到与不属于当前用户一律 404 —— 不泄露「这个资源存在」（08 §5）
    if (!photo) throw new ApiError("NOT_FOUND", "资源不存在");

    // 流式输出，不把整张原图读进内存
    const { body, size } = await openStoredFile(photo.storageKey);

    return new Response(body, {
      headers: {
        "Content-Type": photo.mimeType,
        "Content-Length": String(size),
        /*
         * 文件名是 UUID、内容不变，可以长期缓存（08 §14）。
         * 用 `private` 不用 `public`：这是私人照片，只该进用户自己的浏览器
         * 缓存，不该被共享代理 / 中间缓存存下来。
         */
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return failFrom(error, "api/photos/[id]/file");
    }
    /*
     * 记录还在、盘上没了 → 按不存在处理（数据不一致里最轻的那种）。
     * 但**别把其余错误也伪装成 404**（权限、磁盘 I/O）—— 那样真正的故障
     * 在界面上永远只表现为「这张照片不见了」，没人会去查。
     */
    const errno = (error as NodeJS.ErrnoException)?.code;
    return failFrom(
      errno === "ENOENT" ? new ApiError("NOT_FOUND", "资源不存在") : error,
      "api/photos/[id]/file",
    );
  }
}
