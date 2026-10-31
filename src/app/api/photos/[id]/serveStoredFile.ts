import { ApiError, failFrom } from "@/lib/apiResponse";
import { openStoredFile } from "@/services/mediaService";

/**
 * 把一个已落盘的文件流式送出。
 *
 * `/file` 与 `/thumbnail` 的骨架原本各写了一遍：`stat` → 流 → 三个响应头。
 * 抽在这里是因为它们**必须一致**——少一个 `Content-Length` 或换一个缓存头，
 * 只会在一处出问题，而调用方以为两条路一样。
 *
 * 只做「送字节」：ownership 校验留在各路由里（两条路的查询列不同），
 * 缓存策略由调用方给（缩略图与原图的 `immutable / no-cache` 不一样）。
 */
export async function serveStoredFile(args: {
  storageKey: string;
  mimeType: string;
  cacheControl: string;
}): Promise<Response> {
  const { body, size } = await openStoredFile(args.storageKey);

  return new Response(body, {
    headers: {
      "Content-Type": args.mimeType,
      "Content-Length": String(size),
      "Cache-Control": args.cacheControl,
    },
  });
}

/**
 * 文件路由的统一错误出口。
 *
 * - `ApiError`（如 404 找不到记录）原样渲染
 * - `ENOENT`：记录还在、盘上没了 —— 按不存在处理（数据不一致里最轻的那种）
 * - 其余（权限、磁盘 I/O）**保持 500**，不伪装成 404。否则真正的故障在界面上
 *   永远只表现为「这张照片不见了」，没人会去查。
 */
export function storedFileError(error: unknown, context: string): Response {
  if (error instanceof ApiError) return failFrom(error, context);

  const errno = (error as NodeJS.ErrnoException)?.code;
  return failFrom(
    errno === "ENOENT" ? new ApiError("NOT_FOUND", "资源不存在") : error,
    context,
  );
}
