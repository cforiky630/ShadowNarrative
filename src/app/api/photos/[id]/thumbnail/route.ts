import { ApiError, failFrom } from "@/lib/apiResponse";
import { readStoredFile } from "@/services/mediaService";
import { getPhotoDetail } from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";

/**
 * 缩略图（`08-DATA_API_SPEC.md` §6）。
 *
 * 相册、时间线、进入照片时的飞行图都取这个地址；**原图只有画布
 * 与 AI 用**（粒子要按像素采样，`16 §8.1` 要「清晰可辨认的原图」）。
 *
 * ── 没有缩略图时**回落原图**，不是 404 ─────────────────────────────
 *
 * 缩略图是**可选**的派生资源：非浏览器上传没有（`08 §6`）、
 * 老照片没有、将来回填之前也没有。让这里回落，调用方就永远只需要
 * 一个地址，不必在四个地方各写一遍判断。
 *
 * 这也是 `05 §7` 给 Python 服务定的那个姿态的同一条：
 * 派生资源不可用时降级为「原图直出」，不报错。
 *
 * ── 两段的缓存头**必须不一样** ──────────────────────────────────────
 *
 * 缩略图的文件名是服务端生成的 UUID，内容永不改变 ⇒ `immutable`。
 *
 * 而回落分支覆盖的是**同一个 URL 现在给原图、将来可能给缩略图**
 * （回填那天）。用 `immutable` 会把那天永久挡在缓存外面 ——
 * 浏览器一年内都不会再来问一次。所以这一条走 `no-cache`，
 * 代价是没有缩略图的照片每次都要重下原图，那是眼下 2 张照片的规模。
 *
 * 不需要 `connection()`：动态段 `[id]` 本身就是请求数据，这条路由
 * 不会被预渲染（对比 `api/timeline` 那个没有参数的）。
 */

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 缩略图的 Content-Type。
 *
 * **从扩展名推**，因为它没有单独一列存 mime —— 而扩展名是我们自己在
 * `saveThumbnailFile` 里按允许集合派生的（`.webp` / `.jpg` / `.png`），
 * 不是客户端给什么就用什么。加一列只为存这三个值里的一个，
 * 不值得动 schema（`18 §3` 的快照键名要跟着改）。
 */
const MIME_BY_EXT: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  png: "image/png",
};

function thumbnailMimeType(storageKey: string): string {
  const ext = storageKey.slice(storageKey.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    // ownership 校验合成在查询条件里，不做「先查出再判断」的两段式（08 §1）
    const photo = await getPhotoDetail(userId, id);

    // 找不到与不属于当前用户一律 404 —— 不泄露「这个资源存在」（08 §5）
    if (!photo) throw new ApiError("NOT_FOUND", "资源不存在");

    if (photo.thumbnailKey) {
      const bytes = await readStoredFile(photo.thumbnailKey);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": thumbnailMimeType(photo.thumbnailKey),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // 回落：原图直出。缓存头见文件头那一段
    const bytes = await readStoredFile(photo.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": photo.mimeType,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    // 记录在库里但文件丢了 —— 属于数据不一致，同样按不存在处理
    return failFrom(
      error instanceof ApiError ? error : new ApiError("NOT_FOUND", "资源不存在"),
      "api/photos/[id]/thumbnail",
    );
  }
}
