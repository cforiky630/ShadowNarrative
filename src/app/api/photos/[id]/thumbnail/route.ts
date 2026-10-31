import { ApiError } from "@/lib/apiResponse";
import { getPhotoFileRef } from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";
import { serveStoredFile, storedFileError } from "../serveStoredFile";

/**
 * 缩略图（`08-DATA_API_SPEC.md` §6）。
 *
 * 缓存策略（规格 §14）：
 * - **有缩略图时**：由客户端生成（长边 1024，`lib/makeThumbnail.ts`），
 *   文件名是原图 UUID 的 stem + `.thumb.` + 扩展名，落盘后内容不再变。
 *   返回：
 *     `Cache-Control: private, max-age=31536000, immutable`
 *   用 `private` 是因为这是私人照片，只能进用户自己的浏览器缓存，
 *   不该被局域网代理 / 共享反代存下来。
 * - **没有缩略图落到原图时**：`thumbnailKey` 为 null 的照片（非浏览器上传、
 *   老照片）目前会一直回落到原图。如果将来做一次缩略图回填，同一个 URL
 *   就会「升级」；给 1 年 immutable 会把那次升级永久挡在缓存外。所以回落
 *   分支返回：
 *     `Cache-Control: private, no-cache`
 *   （每次都来向服务器验证；一旦有缩略图了，下次就切过去）。
 */

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 后缀到 Content-Type。
 *
 * 客户端缩略图默认是 WebP（`lib/makeThumbnail.ts` 先试 webp、再退 jpeg），
 * 但这里按后缀判断：以后换 AVIF 或保留原格式，路由不用跟着改。
 */
function thumbnailMimeType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    // ownership 校验合成在查询条件里（08 §1）
    const photo = await getPhotoFileRef(userId, id);

    // 找不到与不属于当前用户一律 404 —— 不泄露「这个资源存在」（08 §5）
    if (!photo) throw new ApiError("NOT_FOUND", "资源不存在");

    if (photo.thumbnailKey) {
      return await serveStoredFile({
        storageKey: photo.thumbnailKey,
        mimeType: thumbnailMimeType(photo.thumbnailKey),
        // `private`：私人照片不进共享缓存（与 `/file` 同一条）
        cacheControl: "private, max-age=31536000, immutable",
      });
    }

    // 回落：原图直出。缓存头见文件头那一段
    return await serveStoredFile({
      storageKey: photo.storageKey,
      mimeType: photo.mimeType,
      cacheControl: "private, no-cache",
    });
  } catch (error) {
    return storedFileError(error, "api/photos/[id]/thumbnail");
  }
}
