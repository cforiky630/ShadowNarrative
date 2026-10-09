import { NextResponse } from "next/server";
import {
  createMemoryWithPhoto,
  getLatestMemory,
  getLocalUserId,
} from "@/services/memoryService";
import { UploadError } from "@/services/mediaService";

/**
 * Memory 集合。
 *
 * 规格：08-DATA_API_SPEC.md §4
 *
 * POST 是**一次性**的「照片 → Memory」：同时建记录与落盘，失败时回滚，
 * 不留孤儿记录（08 §15）。所以这里用 multipart 而不是文档里的两步
 * （先 POST /api/memories 再 POST /api/media/upload）—— 两步流程下
 * 上传失败会留下一个空 Memory，需要额外的清理逻辑。
 */

export async function GET() {
  const userId = await getLocalUserId();
  const latest = await getLatestMemory(userId);
  return NextResponse.json({ data: latest ? [latest] : [], meta: {} });
}

export async function POST(request: Request) {
  const userId = await getLocalUserId();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("INVALID_INPUT", "请求体必须是 multipart/form-data", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return errorResponse("INVALID_INPUT", "缺少 file 字段", 400);
  }

  const title = asOptionalString(form.get("title"));
  const location = asOptionalString(form.get("location"));
  const memoryDate = asOptionalDate(form.get("memoryDate"));

  try {
    const created = await createMemoryWithPhoto({
      userId,
      file,
      title,
      location,
      memoryDate,
    });

    const memory = await getLatestMemory(userId);

    return NextResponse.json(
      { data: { ...created, memory }, meta: {} },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return errorResponse(error.code, error.message, error.status);
    }
    console.error("[api/memories] 创建失败", error);
    return errorResponse("INTERNAL", "创建失败", 500);
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

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}
