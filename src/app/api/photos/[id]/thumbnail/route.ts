import { ApiError } from "@/lib/apiResponse";
import { getPhotoFileRef } from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";
import { serveStoredFile, storedFileError } from "../serveStoredFile";

/**
 * 缩略图（`08-DATA_API_SPEC.md` §6）。
 *
 * 缓存策略（规格 §14）：
 * - **有缩略图时**：尺寸固定（小边 512px）、文件名是带尺寸后缀的 UUID
 *   （如 `uuid_512.webp`）、内容不可变。返回：
 *     `Cache-Control: private, max-age=31536000, immutable`
 *   用 `private` 是因为这是私人照片，只能进用户自己的浏览器缓存，
 *   不该被局域网代理 / 共享反代存下来。
 * - **没有缩略图落到原图时**：原图可能在被异步缩略图生成器处理完之后
 *   就「升级」为有缩略图。此时如果给 1 年 immutable，浏览器在升级后
 *   很长时间内都不会再来问，用户界面就会一直加载原图。因此回落到原图时返回：
 *     `Cache-Control: private, no-cache`
 *   （每次都来向服务器验证 ETag / 状态；一旦有缩略图了，下次就切过去）。
 */

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 后缀到 Content-Type。
 *
 * Sharp 默认打成 WebP（`08 §6`、`lib/makeThumbnail.ts`），但如果
 * 后面换成 AVIF 或保留原格式，只看后缀就能给出正确的媒体类型，
 * 客户端按标准渲染即可。
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
