import { connection } from "next/server";
import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import { createMemory, listMemories } from "@/services/memoryService";
import { getLocalUserId } from "@/services/userService";

/**
 * 影册集合（`08-DATA_API_SPEC.md` §9）。
 *
 * 界面上一律叫**影册**，代码里叫 `Memory` —— 理由在
 * `prisma/schema.prisma` 的那条注释上、以及 `types.MemorySummary`。
 *
 * userId 照旧只由服务端解析（`12 §4`），不从请求里读。
 */

/**
 * 架子：全部影册 + 各自一张封面。
 *
 * ⚠️ **必须在 `try` 之外，也必须在查询之前。**
 *
 * 这个 handler 不读请求、也没有 `params`，所以构建时会被预渲染 ——
 * 而 better-sqlite3 是**同步驱动**，查询在预渲染阶段真的会执行
 * （那时 `NODE_ENV=production`，数据目录解析到 `~/.shadow-narrative`，
 * 目录不存在 → 直接抛错）。
 *
 * 而 `connection()` 是**靠抛出**来终止预渲染的，放进 `try` 里那个信号会被
 * `catch` 当成业务失败。完整说明在 `api/timeline/route.ts`。
 */
export async function GET() {
  await connection();

  try {
    const userId = await getLocalUserId();
    return ok(await listMemories(userId));
  } catch (error) {
    return failFrom(error, "api/memories GET");
  }
}

/**
 * 新建一册。body: `{ title }`。
 *
 * 名字**必填**（schema 里 `title` 非空）：架子上一格读的就是它，
 * 没有名字的一册在界面上是一块说不出是什么的东西。空的返回 400，不是
 * 建一个「未命名」出来。
 */
export async function POST(request: Request) {
  try {
    const userId = await getLocalUserId();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_INPUT", "请求体必须是 JSON");
    }

    const title =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).title
        : undefined;

    return ok(await createMemory(userId, title));
  } catch (error) {
    return failFrom(error, "api/memories POST");
  }
}
