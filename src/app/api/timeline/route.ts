import { connection } from "next/server";
import { failFrom, ok } from "@/lib/apiResponse";
import { getTimeline } from "@/services/timelineService";
import { getLocalUserId } from "@/services/userService";

/**
 * 时间轴。
 *
 * 规格：08-DATA_API_SPEC.md §17。用户 2026-10-10 定的新空间，
 * 取代 `16-ALBUM_SPACE.md` §6 的 Library。
 * ⚠️ 规格尚未更新，落地前要改 `16 §6`、`01 §5`、`07`。
 *
 * userId 照旧只由服务端解析（`12 §4`），不从请求里读。
 */
export async function GET() {
  /**
   * ⚠️ **必须在 try 之外，也必须在查询之前。**
   *
   * 两个坑叠在一起：
   *
   * 1. 这个 handler 不读请求、也没有 params，所以构建时会被预渲染。
   *    而 better-sqlite3 是**同步驱动**，查询在预渲染阶段真的会执行
   *    （那时 NODE_ENV=production，数据目录解析到 ~/.shadow-narrative，
   *    目录不存在 → 直接抛错）。Next 文档专门列了这个场景：
   *    "Queries from synchronous database drivers like better-sqlite3
   *     complete during prerendering."（04-functions/connection.md）
   *
   * 2. **connection() 是靠「抛出」来终止预渲染的**。把它放进 try 里，
   *    那个终止信号会被 catch 当成业务失败，构建时照报「未预期的失败」。
   *    它不属于业务错误，不能进错误处理。
   *
   * 另注：`export const dynamic = "force-dynamic"` 在这里没用 ——
   * 项目开了 cacheComponents，Next 16 已移除该配置项。
   */
  await connection();

  try {
    const userId = await getLocalUserId();
    return ok(await getTimeline(userId));
  } catch (error) {
    return failFrom(error, "api/timeline GET");
  }
}
