import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import { runConversationReply } from "@/services/aiService";
import { getPhotoDetail } from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";

/**
 * 说一句，拿回 AI 的回应（`08 §7`、Round 8）。
 *
 * ⚠️ **和上传、重试那两条路不一样：这里不进 `after()`。**
 * 用户在等这句话，它必须当场回。慢一点没关系，但「等一个轮询周期再看」
 * 不是对话该有的样子。
 *
 * 用户那句话在 `runConversationReply` 里**先落库再调模型** ——
 * 上游挂了，他说过的话还在，点一下就能重来。
 *
 * 响应里没有 `meta.model`（`08 §7` 的示例里有）：那要多读一次 `secrets.json`，
 * 而客户端并不用它。`ok()` 仍然会给出 `meta: {}`，形状与 `§5` 一致。
 */

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    const photo = await getPhotoDetail(userId, id);
    if (!photo) throw new ApiError("NOT_FOUND", "照片不存在");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_INPUT", "请求体必须是 JSON");
    }

    const content =
      typeof body === "object" && body !== null && "content" in body
        ? (body as { content?: unknown }).content
        : undefined;

    if (typeof content !== "string") {
      throw new ApiError("INVALID_INPUT", "content 必须是字符串");
    }

    const reply = await runConversationReply({ photoId: id, content });

    return ok(reply);
  } catch (error) {
    return failFrom(error, "api/photos/[id]/conversation/messages POST");
  }
}
