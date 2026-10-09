import { after } from "next/server";
import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import { runPhotoAnalysis } from "@/services/aiService";
import { getPhotoDetail, resetAnalysisState } from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";

/**
 * 手动触发分析 / 重试。
 *
 * 规格：08-DATA_API_SPEC.md §10（超时后允许用户手动重试）、09 §21.2
 *
 * 两条路径会用到它：
 *   1. 自动分析失败或超时之后，用户点一下重试
 *   2. `autoAnalyze` 关掉时，这是**唯一**把照片发出去的入口
 *      —— 关掉自动分析的意义就是「照片只在我主动要求时才离开这台机器」
 *
 * 与上传一样走 `after()`：不在响应里等 AI。客户端照旧轮询 §10。
 */

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    // ownership 与存在性校验（不泄露「这个资源存在」，08 §5）
    const photo = await getPhotoDetail(userId, id);
    if (!photo) throw new ApiError("NOT_FOUND", "照片不存在");

    // 先回到 pending，客户端立刻能观察到状态变化并开始轮询
    await resetAnalysisState(userId, id);

    after(() => runPhotoAnalysis({ userId, photoId: id }));

    return ok({ id, aiState: "pending" as const });
  } catch (error) {
    return failFrom(error, "api/photos/[id]/analyze POST");
  }
}
