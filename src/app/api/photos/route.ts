import { after } from "next/server";
import { ApiError, created, failFrom, ok } from "@/lib/apiResponse";
import { runPhotoAnalysis } from "@/services/aiService";
import { createPhoto, listPhotos } from "@/services/photoService";
import { getLocalUserId, getSettings } from "@/services/userService";

/**
 * 照片集合。
 *
 * 规格：08-DATA_API_SPEC.md §6、§11
 *
 * ⚠️ userId 只由 `getLocalUserId()` 解析，**绝不从请求里读**。
 * 本产品没有鉴权（17 §6），客户端传来的 userId 不构成 ownership 校验（12 §4）。
 */

/**
 * 列表，游标分页（08 §11）。
 *
 * `?favorite=true` 供斜轴相册用；`?cursor=<id>&limit=<n>` 翻页。
 * 默认不一次返回全部照片。
 */
export async function GET(request: Request) {
  try {
    const userId = await getLocalUserId();
    const params = new URL(request.url).searchParams;

    const favoriteParam = params.get("favorite");
    const limitParam = params.get("limit");

    const page = await listPhotos(userId, {
      cursor: params.get("cursor"),
      limit: limitParam ? Number(limitParam) : undefined,
      // 只在显式传了 favorite 时过滤 —— 不传 = 全部
      ...(favoriteParam === null ? {} : { favorite: favoriteParam === "true" }),
    });

    return ok(page.photos, { nextCursor: page.nextCursor });
  } catch (error) {
    return failFrom(error, "api/photos GET");
  }
}

/**
 * 上传（08 §6）。
 *
 * 服务端顺序不可交换：校验 → 真实格式 → dimensions → contentHash → 落盘 → 建记录，
 * 全部在 `createPhoto` 里。这里是第 8 步的收尾。
 *
 * 响应 `201` 且**不包含 AI 结果** —— 字幕晚于响应到达，客户端按 §10 轮询。
 * 所以分析用 `after()` 触发：**不阻塞响应**，用户立刻看到原图。
 */
export async function POST(request: Request) {
  try {
    const userId = await getLocalUserId();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError("INVALID_INPUT", "请求体必须是 multipart/form-data");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError("INVALID_INPUT", "缺少 file 字段");
    }

    /*
     * 缩略图由**客户端**生成（`08 §6`）。它是可选的：非浏览器上传没有它，
     * 或者带了但不合格时，`createPhoto` 会把它落成 null，界面回落原图。
     * 无论哪种，上传都必须成功 —— 派生资源不该拦住主流程。
     */
    const thumbnail = form.get("thumbnail");

    const photo = await createPhoto({
      userId,
      file,
      thumbnail: thumbnail instanceof File ? thumbnail : null,
      takenAt: asOptionalDate(form.get("takenAt")),
      caption: asOptionalString(form.get("caption")),
    });

    // 09 §21.2：可以在设置里关掉自动分析。
    // 关掉之后照片要由用户点一下才会被发出去 —— 用户需要知道自己是什么时候
    // 把照片发出去的（12 §5）。
    const settings = await getSettings(userId);
    if (settings.autoAnalyze) {
      // `after` 在响应发出之后才跑（next/server，15.1 起稳定）。
      // 框架 API 只出现在路由层 —— services 不得依赖它。
      after(() => runPhotoAnalysis({ userId, photoId: photo.id }));
    }

    return created(photo);
  } catch (error) {
    return failFrom(error, "api/photos POST");
  }
}

// ---------------------------------------------------------------------------

function asOptionalString(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asOptionalDate(v: FormDataEntryValue | null): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
