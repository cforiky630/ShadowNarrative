import type { Photo } from "@/types";

/**
 * 缩略图 blob → 它在 multipart 里的文件名。
 *
 * 服务端**不看**这个名字（它按 `file.type` 与文件头判断真实格式，
 * 落盘的扩展名也由自己推导），给个合理的名字只是为了调试时
 * 在抓包里一眼认得出。
 */
const THUMB_NAME: Record<string, string> = {
  "image/webp": "thumb.webp",
  "image/jpeg": "thumb.jpg",
  "image/png": "thumb.png",
};

/**
 * 上传一张照片（`08 §6`，`POST /api/photos`）。
 *
 * 抽出来是因为**现在有两个地方要上传**：照片页（`MemorySpace`）和相册
 * （`AlbumSpace`）。`16-ALBUM_SPACE.md` §5 规定相册是上传的地方 ——
 * 而它必须是：`/` 现在是相册，相册空的时候如果没有上传入口，
 * 用户就再也进不来了。
 *
 * 这里只管 HTTP。本地即时反馈（照片页的 `morphTo`、相册的占位卡）
 * 由调用方自己安排 —— 那是各自的表现，不是上传的一部分。
 *
 * `thumbnail` 是**可选**的：由调用方用 `makeThumbnail` 生成（`08 §6`）。
 * 生成失败就传 null —— 服务端会回落成「原图直出」，上传照旧成功。
 *
 * 失败时抛 `Error`，`message` 是服务端给的那句人话（`08 §5` 的错误格式），
 * 不是状态码。
 */
export async function uploadPhoto(
  file: File,
  thumbnail?: Blob | null,
): Promise<Photo> {
  if (!file.type.startsWith("image/")) {
    throw new Error("只支持图片文件");
  }

  const form = new FormData();
  form.append("file", file);
  if (thumbnail) {
    form.append(
      "thumbnail",
      thumbnail,
      THUMB_NAME[thumbnail.type] ?? "thumb.webp",
    );
  }

  const res = await fetch("/api/photos", { method: "POST", body: form });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? "上传失败");
  }

  const body = (await res.json().catch(() => null)) as {
    data?: Photo;
  } | null;

  if (!body?.data?.id) throw new Error("上传失败");
  return body.data;
}
