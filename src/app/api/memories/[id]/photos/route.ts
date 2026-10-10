import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import { addPhotos } from "@/services/memoryService";
import { getLocalUserId } from "@/services/userService";

/**
 * 往这一册里加照片（`08 §9`）。body: `{ photoIds: string[] }`。
 *
 * 这是「整理照片」那张面板按「完成」时走的加法那一半 —— 另一半是
 * `DELETE .../photos/:photoId`。两个方向都在这一个 resource 上，
 * 因为它们改的是同一件事：这张照片属不属于这一册。
 *
 * 返回 `{ added, count }`：`added` 是**这次真加进去几张**（已经在册里的被跳过），
 * `count` 是加完之后这一册有几张。
 *
 * 排重与「这些照片是不是他的」都在 `addPhotos` 里，那两段是这块的要害 ——
 * 尤其是第二条：不校验就是一条越权写入，不是参数不合法。
 */

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_INPUT", "请求体必须是 JSON");
    }

    const photoIds =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).photoIds
        : undefined;

    const result = await addPhotos(userId, id, photoIds);
    if (!result) throw new ApiError("NOT_FOUND", "没有这一册");

    return ok(result);
  } catch (error) {
    return failFrom(error, "api/memories/[id]/photos POST");
  }
}
