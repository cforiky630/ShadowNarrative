import { NextResponse } from "next/server";
import {
  DeletionIncompleteError,
  deleteMemory,
  getLocalUserId,
} from "@/services/memoryService";

/**
 * 单条 Memory。
 *
 * 规格：08-DATA_API_SPEC.md §4
 *
 * 目前只实现 DELETE —— GET / PATCH 在对应功能（Memory Theater、编辑）落地时再补，
 * 不做没有调用方的接口。
 */

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getLocalUserId();

  try {
    const deleted = await deleteMemory(userId, id);

    // 不存在与不属于当前用户一律 404 —— 不泄露「这个资源存在」（08 §3）
    if (!deleted) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "记忆不存在" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: { id }, meta: {} });
  } catch (error) {
    if (error instanceof DeletionIncompleteError) {
      // 文件没删干净，记录被刻意保留 —— 这不是「删除失败」，而是「删除未完成」，
      // 客户端应该提示重试而不是以为删掉了
      console.error("[api/memories/:id] 删除未完成", error.failedKeys);
      return NextResponse.json(
        {
          error: {
            code: "DELETION_INCOMPLETE",
            message: error.message,
            requestId: crypto.randomUUID(),
          },
        },
        { status: 500 },
      );
    }

    console.error("[api/memories/:id] 删除失败", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL",
          message: "删除失败",
          requestId: crypto.randomUUID(),
        },
      },
      { status: 500 },
    );
  }
}
