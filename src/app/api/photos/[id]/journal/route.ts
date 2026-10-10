import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import { runJournalNote } from "@/services/aiService";
import { canGenerateNote, getNote, saveNote } from "@/services/journalService";
import { getPhotoDetail } from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";

/**
 * 随笔小记（`08-DATA_API_SPEC.md` §8）。
 *
 * 它与照片 1:1。名字是用户 2026-10-10 定的：**随笔小记**，不是「日志」——
 * 而且它是**轻**的东西，所以这里没有标题、没有起草/定稿那层仪式。
 *
 * ⚠️ **GET 的 `data.note` 可以是 `null`** —— 那张照片还没有笔记。这不是错误，
 * 就像 `subtitle` 也可以是 null 一样。同一份 `data` 里带着 `canGenerate`：
 * 「那颗笔现在该不该出现」由服务端算（见 `journalService.canGenerateNote`），
 * 客户端算不了 —— 它得同时知道笔记和对话，而这两样在两个地方取。
 *
 * 三条都要先 `getPhotoDetail(userId, id)` 做 ownership：查询条件里带着 userId
 * （`08 §1`），越权与不存在都返回 null（`08 §5` 不区分，不泄露「它存在但你没权限」）。
 *
 * 不需要 `connection()`：动态段 `[id]` 本身就是请求数据，这条路由不会被预渲染
 * （对比 `api/timeline` 那个没有参数的，它必须显式挡一下）。
 */

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    const photo = await getPhotoDetail(userId, id);
    if (!photo) throw new ApiError("NOT_FOUND", "照片不存在");

    const note = await getNote(id);
    return ok({ note, canGenerate: await canGenerateNote(id, note) });
  } catch (error) {
    return failFrom(error, "api/photos/[id]/journal GET");
  }
}

/**
 * 保存用户自己写/改的正文。
 *
 * `sourceVersion` 是可选的：带上就做并发检测，与库里不一致返回 409（`08 §8`），
 * 防止「AI 润色」把用户手改过的字盖掉。不带就直接写 —— 那条路是「我知道
 * 我在覆盖什么」。
 *
 * ⚠️ **正文传空白 = 删掉这条随笔小记。** 左下角那个本子图标只在有内容时出现，
 * 所以「有这一行」必须等价于「有内容」（见 `journalService.saveNote`）。
 *
 * 响应里 `data` 同样是 `JournalNote | null`。
 */
export async function PATCH(request: Request, { params }: RouteParams) {
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
    if (typeof body !== "object" || body === null) {
      throw new ApiError("INVALID_INPUT", "请求体必须是对象");
    }

    const input = body as Record<string, unknown>;

    if (typeof input.content !== "string") {
      throw new ApiError("INVALID_INPUT", "content 必须是字符串");
    }

    let expectedVersion: number | undefined;
    if ("sourceVersion" in input && input.sourceVersion !== undefined) {
      if (typeof input.sourceVersion !== "number") {
        throw new ApiError("INVALID_INPUT", "sourceVersion 必须是数字");
      }
      expectedVersion = input.sourceVersion;
    }

    const saved = await saveNote({
      photoId: id,
      content: input.content,
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
    });

    return ok(saved);
  } catch (error) {
    return failFrom(error, "api/photos/[id]/journal PATCH");
  }
}

/**
 * 那颗笔按下去：**起稿或润色**。
 *
 * 客户端不用说是哪一种 —— 服务端看有没有现存那一行就知道
 * （没有 = 起稿，有 = 润色，把现稿也当素材喂进去，见 `aiService.runJournalNote`）。
 * 少一个得由前端维护、还可能过期的参数。
 *
 * ⚠️ **不进 `after()`。** 和对话一样：用户按了那颗笔就在等这篇东西，
 * 它必须当场回。上传/重试那条路才走 `after()`（那边没人在等）。
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getLocalUserId();

    const photo = await getPhotoDetail(userId, id);
    if (!photo) throw new ApiError("NOT_FOUND", "照片不存在");

    return ok(await runJournalNote({ photoId: id }));
  } catch (error) {
    return failFrom(error, "api/photos/[id]/journal POST");
  }
}
