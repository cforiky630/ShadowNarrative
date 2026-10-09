import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "@/lib/apiResponse";
import { resolvePhotosDir } from "@/lib/dataDir";
import { readImageInfo, type ImageInfo } from "@/lib/imageDimensions";

/**
 * 媒体存储：文件读写与校验。
 *
 * 职责边界（05 §7）：**不处理像素**，只做「字节进、字节出」。
 * 缩略图 / HEIC / RAW 属于 Python 图像服务（尚未建），所以 08 §6 里的
 * `thumbnailKey` 目前一律为 null，由浏览器缩放原图顶上。
 *
 * 这个模块**不碰数据库** —— 建记录是 photoService 的事。分开是为了让
 * 08 §6 那八步顺序里「先落盘、后建记录」的回滚责任落在一处。
 */

/** 单文件上限 25MB（08 §12） */
const MAX_BYTES = 25 * 1024 * 1024;

/** 允许的 MIME 与对应扩展名、真实格式。三者必须同时吻合。 */
const ALLOWED: Record<string, { ext: string; format: ImageInfo["format"] }> = {
  "image/jpeg": { ext: "jpg", format: "jpeg" },
  "image/png": { ext: "png", format: "png" },
  "image/webp": { ext: "webp", format: "webp" },
  "image/gif": { ext: "gif", format: "gif" },
};

export interface StoredPhotoFile {
  storageKey: string;
  /** `sha256:<hex>`，与 18 §3 快照清单里的形式一致 */
  contentHash: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
}

/**
 * 校验并落盘一个上传文件（08 §6 的第 1–5 步）。
 *
 * 校验顺序不可交换：先挡明显不合法的（不读字节），再做需要读字节的检查。
 * 任何一步失败都抛 `ApiError`，此时**磁盘上不会留下任何东西**。
 *
 * ⚠️ 不要信任浏览器给的 MIME。声明与内容不符直接拒（08 §12）。
 */
export async function savePhotoFile(file: File): Promise<StoredPhotoFile> {
  // --- 1. MIME / 大小 / 扩展名 ---
  const allowed = ALLOWED[file.type];
  if (!allowed) {
    throw new ApiError(
      "UNSUPPORTED_MEDIA",
      `不支持的格式：${file.type || "未知"}`,
    );
  }
  if (file.size <= 0) {
    throw new ApiError("INVALID_INPUT", "文件为空");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiError(
      "PAYLOAD_TOO_LARGE",
      `文件超过 ${Math.round(MAX_BYTES / 1024 / 1024)}MB 上限`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // --- 2. 真实格式（读文件头，不信浏览器） ---
  const info = readImageInfo(bytes);
  if (!info) {
    throw new ApiError(
      "UNSUPPORTED_MEDIA",
      "文件内容不是可识别的图片，或被截断",
    );
  }
  if (info.format !== allowed.format) {
    throw new ApiError(
      "UNSUPPORTED_MEDIA",
      `声明为 ${allowed.format} 但内容实际是 ${info.format}`,
    );
  }

  // --- 3. 尺寸合理性 ---
  if (info.width < 32 || info.height < 32) {
    throw new ApiError("INVALID_INPUT", "图片太小，短边至少 32px");
  }
  if (info.width > 20000 || info.height > 20000) {
    throw new ApiError("INVALID_INPUT", "图片尺寸超出上限");
  }

  // --- 4. contentHash ---
  // 明文字节的 SHA-256。用作本地身份与完整性校验。
  // ⚠️ 备份上行时**不能**直接用它当 blob id（会有确认预言机），
  //    须经 HMAC-SHA256(用户密钥, 它) 变换 —— 见 18 §2 与 schema 注释。
  const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

  // --- 5. 落盘 ---
  // turbopackIgnore：见 dataDir.ts 的同名说明 —— 数据目录在项目之外，
  // 不是随源码打包的资源
  const storageKey = `${randomUUID()}.${allowed.ext}`;
  const dir = resolvePhotosDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ dir, storageKey), bytes);

  return {
    storageKey,
    contentHash,
    mimeType: file.type,
    width: info.width,
    height: info.height,
    byteSize: file.size,
  };
}

/** 把存储键解析为磁盘上的绝对路径。 */
export function resolveStoragePath(storageKey: string): string {
  // 防目录穿越：storageKey 由服务端生成，但仍然不该相信任何外部输入
  const safe = path.basename(storageKey);
  // turbopackIgnore：同 savePhotoFile，数据目录在项目之外
  return path.join(/*turbopackIgnore: true*/ resolvePhotosDir(), safe);
}

/** 读回原图字节。供文件路由与 AI 调用复用。 */
export async function readStoredFile(storageKey: string): Promise<Buffer> {
  return readFile(resolveStoragePath(storageKey));
}

/**
 * 删除若干文件，返回**删除失败**的键。
 *
 * ENOENT 不算失败 —— 目标状态（文件不存在）已经达成（08 §16 第 3 步）。
 * 调用方负责在返回值非空时中止后续的删记录动作。
 */
export async function removeStoredFiles(
  keys: readonly string[],
): Promise<string[]> {
  const failed: string[] = [];

  for (const key of keys) {
    try {
      await unlink(resolveStoragePath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") failed.push(key);
    }
  }

  return failed;
}
