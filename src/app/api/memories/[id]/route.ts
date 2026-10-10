import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import { deleteMemory, renameMemory } from "@/services/memoryService";
import { getLocalUserId } from "@/services/userService";

/**
 * 一册本身（`08 §9`）：改名、删册。
 *
 * ⚠️ **这里没有 GET。** 一册的内容由服务端组件（`memories/[id]/page.tsx`）
 * 直接走 service 渲染，不经 API；改完用 `router.refresh()` 取新的。
 * 加一条只为对称的 GET，就是多一条要维护、却没人走的诊断路径。
 *
 * 动态段 `[id]` 本身就是请求数据，所以这几条**不会被预渲染**，
 * 不需要 `connection()`（对比同目录上一级的 `GET /api/memories`）。
 */

type RouteParams = { params: Promise<{ id: string }> };

/** 改名。body: `{ title }` */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
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

    const changed = await renameMemory(userId, id, title);
    if (!changed) throw new ApiError("NOT_FOUND", "没有这一册");

    return ok(null);
  } catch (error) {
    return failFrom(error, "api/memories/[id] PATCH");
  }
}

/**
 * 删掉这一册。
 *
 * ⚠️ **照片一张都不动**（`08 §4`）：`MemoryPhoto` 只是关系，
 * 级联带走的是那几行关系。这一条是产品里少有的「删了不心疼」的操作 ——
 * 界面上那道门也因此比照片删除轻（两步，不长按）。
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    const deleted = await deleteMemory(userId, id);
    if (!deleted) throw new ApiError("NOT_FOUND", "没有这一册");

    return ok(null);
  } catch (error) {
    return failFrom(error, "api/memories/[id] DELETE");
  }
}
