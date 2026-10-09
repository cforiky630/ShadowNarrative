import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { readImageInfo, type ImageInfo } from "@/lib/imageDimensions";

/**
 * 媒体上传与存储。
 *
 * 规格：08-DATA_API_SPEC.md §5（上传流程）、§11（校验规则）
 *
 * ⚠️ 尚未实现的部分：08 §5 第 4 步「生成派生版本」（thumbnail / medium /
 * particleSource）。按 05-TECH_ARCHITECTURE.md §7 的分工，像素处理属于
 * **Python 图像服务**，而该服务尚未建（决策是等真要用 HEIC / RAW / 聚类时再起）。
 * 在那之前只存原图，三个派生字段保持 null。
 */

/** 本地存储根目录。生产环境应替换为 S3 兼容对象存储（08 §13）。 */
const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

/** 单文件上限 25MB */
const MAX_BYTES = 25 * 1024 * 1024;

/** 允许的 MIME 与对应的扩展名。两边必须同时匹配。 */
const ALLOWED: Record<string, { ext: string; format: ImageInfo["format"] }> = {
  "image/jpeg": { ext: "jpg", format: "jpeg" },
  "image/png": { ext: "png", format: "png" },
  "image/webp": { ext: "webp", format: "webp" },
  "image/gif": { ext: "gif", format: "gif" },
};

export class UploadError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export interface SavedMedia {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
}

/**
 * 校验并保存一个上传文件，同时写入 MediaAsset 记录。
 *
 * 校验顺序不可交换（08 §5）：先挡明显不合法的，再做需要读字节的检查。
 */
export async function saveUpload(params: {
  memoryId: string;
  file: File;
}): Promise<SavedMedia> {
  const { memoryId, file } = params;

  // --- 1. MIME / 大小 / 扩展名 ---
  const allowed = ALLOWED[file.type];
  if (!allowed) {
    throw new UploadError(
      `不支持的格式：${file.type || "未知"}`,
      "UNSUPPORTED_MEDIA",
      415,
    );
  }

  if (file.size <= 0) {
    throw new UploadError("文件为空", "INVALID_INPUT", 400);
  }
  if (file.size > MAX_BYTES) {
    throw new UploadError(
      `文件超过 ${Math.round(MAX_BYTES / 1024 / 1024)}MB 上限`,
      "PAYLOAD_TOO_LARGE",
      413,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // --- 2. 真实格式校验（不能只信浏览器给的 MIME，08 §11）---
  const info = readImageInfo(bytes);
  if (!info) {
    throw new UploadError(
      "文件内容不是可识别的图片，或被截断",
      "UNSUPPORTED_MEDIA",
      415,
    );
  }
  if (info.format !== allowed.format) {
    throw new UploadError(
      `声明为 ${allowed.format} 但内容实际是 ${info.format}`,
      "UNSUPPORTED_MEDIA",
      415,
    );
  }

  // --- 3. 尺寸合理性 ---
  if (info.width < 32 || info.height < 32) {
    throw new UploadError("图片太小，短边至少 32px", "INVALID_INPUT", 400);
  }
  if (info.width > 20000 || info.height > 20000) {
    throw new UploadError("图片尺寸超出上限", "INVALID_INPUT", 400);
  }

  // --- 4. 派生版本：待 Python 图像服务接入 ---

  // --- 5. 落盘 ---
  const key = `${randomUUID()}.${allowed.ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, key), bytes);

  // --- 6. 写记录 ---
  const asset = await prisma.mediaAsset.create({
    data: {
      memoryId,
      storageKey: key,
      mimeType: file.type,
      width: info.width,
      height: info.height,
      byteSize: file.size,
      // metadataJson 只放白名单字段。GPS 默认不写入（08 §12）。
      metadataJson: { format: info.format },
    },
    select: {
      id: true,
      storageKey: true,
      width: true,
      height: true,
      mimeType: true,
      byteSize: true,
    },
  });

  return asset;
}

/** 把存储键解析为磁盘上的绝对路径。 */
export function resolveStoragePath(storageKey: string): string {
  // 防目录穿越：storageKey 由服务端生成，但仍然不该相信任何外部输入
  const safe = path.basename(storageKey);
  return path.join(UPLOAD_DIR, safe);
}
