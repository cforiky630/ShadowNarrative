import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocalUserId } from "@/services/memoryService";
import { resolveStoragePath } from "@/services/mediaService";

/**
 * 提供媒体文件。
 *
 * 文件存在 .data/uploads 下，不在 public 里，所以必须经这个路由出去 ——
 * 顺带在这里做 ownership 校验。
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getLocalUserId();

  // ownership 校验放在查询条件里，不做「先查出再判断」的两段式（08 §3）
  const asset = await prisma.mediaAsset.findFirst({
    where: { id, memory: { userId } },
    select: { storageKey: true, mimeType: true },
  });

  // 找不到与不属于当前用户一律 404 —— 不泄露「这个资源存在」（08 §3）
  if (!asset) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "资源不存在" } },
      { status: 404 },
    );
  }

  try {
    const bytes = await readFile(resolveStoragePath(asset.storageKey));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        // 文件名是 UUID，内容不会变，可以长期缓存
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // 记录在库里但文件丢了 —— 属于数据不一致，按不存在处理
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "资源不存在" } },
      { status: 404 },
    );
  }
}
