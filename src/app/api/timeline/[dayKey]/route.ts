import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import { setDayTheme } from "@/services/timelineService";
import { getLocalUserId } from "@/services/userService";

/**
 * 某一天的主题名。
 *
 * `PATCH /api/timeline/:dayKey`，`:dayKey` 是 `YYYY-MM-DD`（**本地日历日**）。
 *
 * 传空字符串表示清除。写入后 `source` 变成 `user` —— 它不再是 AI 提炼的
 * 那句话了（`09 §6` 的证据模型要求区分来源）。
 */

type RouteParams = { params: Promise<{ dayKey: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { dayKey } = await params;
    const userId = await getLocalUserId();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_INPUT", "请求体必须是 JSON");
    }
    if (typeof body !== "object" || body === null) {
      throw new ApiError("INVALID_INPUT", "请求体必须是对象");
    }

    const input = body as Record<string, unknown>;
    if (typeof input.title !== "string") {
      throw new ApiError("INVALID_INPUT", "title 必须是字符串（空字符串表示清除）");
    }
    // 主题名是显示在时间轴上的短标签，不该是无长度上限的自由文本
    if (input.title.length > 40) {
      throw new ApiError("INVALID_INPUT", "主题名不超过 40 个字");
    }

    await setDayTheme(userId, dayKey, input.title);

    const trimmed = input.title.trim();
    return ok({
      dayKey,
      title: trimmed || null,
      titleSource: trimmed ? ("user" as const) : null,
    });
  } catch (error) {
    return failFrom(error, "api/timeline/[dayKey] PATCH");
  }
}
