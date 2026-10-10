import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import exifr from "exifr";
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
  /**
   * EXIF 里的拍摄时间。没有就是 null，业务层回落到 `createdAt`（`08 §3`）。
   *
   * 在这里返回而不是让调用方再读一遍文件：字节已经在手上了，
   * 再读一次就是白读一遍磁盘（`savePhotoFile` 里刚 `arrayBuffer()` 过）。
   */
  takenAt: Date | null;
}

/**
 * 校验并落盘一个上传文件（08 §6 的前六步）。
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

  /*
   * --- 4. EXIF 拍摄时间 ---
   *
   * 放在校验**之后**：被拒的文件不该白解一遍 EXIF。
   * 放在 contentHash 之前只是顺路 —— 两者互不影响。
   */
  const exifTakenAt = await readExifTakenAt(bytes);

  // --- 5. contentHash ---
  // 明文字节的 SHA-256。用作本地身份与完整性校验。
  // ⚠️ 备份上行时**不能**直接用它当 blob id（会有确认预言机），
  //    须经 HMAC-SHA256(用户密钥, 它) 变换 —— 见 18 §2 与 schema 注释。
  const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

  // --- 6. 落盘 ---
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
    takenAt: exifTakenAt,
  };
}

/**
 * 从图片字节里读拍摄时间（`08 §13`；`08 §6` 要求「缺省时尝试从 EXIF 读」）。
 *
 * 用户 2026-10-10 问「照片的时间优先读照片附带的信息怎么样」——
 * 查下来这条路**从来没实现过**：`takenAt` 只从表单字段取，而客户端从来不传，
 * 于是每张照片的 `takenAt` 永远是 null、全部回落到导入时间。
 * 规格里写了，代码里没有。
 *
 * ── 三个必须守住的点 ────────────────────────────────────────────────
 *
 * 1. **只 pick 三个日期字段。** exifr 默认把整块 EXIF 都解出来，
 *    那里面**有 GPS** —— 而 `12 §3` 与 `08 §13` 明确要求 GPS 默认不落库。
 *    只 pick 日期，GPS 连解析都不会发生（顺带也快得多）。
 *
 * 2. **EXIF 的时间没有时区。** `DateTimeOriginal` 就是一串「相机本地时间」，
 *    exifr 按**运行机器的本地时区**把它变成 Date。这与
 *    `timelineService.toDayKey` 用的「服务器本地时区」是同一套约定
 *    （单机自托管下服务器就是用户所在的地方，`17 §1`），所以两者不打架。
 *    将来要支持多时区，这里和那里得一起改。
 *
 * 3. **读不出来不能失败。** 截图、微信导出的图、被编辑过的图都可能没有 EXIF。
 *    上传是主流程，EXIF 只是锦上添花 —— 一律返回 null，让业务层回落
 *    `createdAt`（`08 §3`）。
 */
async function readExifTakenAt(bytes: Uint8Array): Promise<Date | null> {
  try {
    const parsed = (await exifr.parse(bytes, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
    })) as
      | { DateTimeOriginal?: Date; CreateDate?: Date; ModifyDate?: Date }
      | undefined;

    // 优先原始拍摄时间；CreateDate 是数字化时间，ModifyDate 最后兜底
    const raw =
      parsed?.DateTimeOriginal ?? parsed?.CreateDate ?? parsed?.ModifyDate;
    if (!raw) return null;

    const date = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(date.getTime())) return null;

    /*
     * 挡掉明显错的：**未来的时间**。
     *
     * 相机时钟没设过是常事，而一个 2035 年的时间戳会让这张照片永远排在
     * 相册最前面 —— 比没有时间更糟。只挡未来，不挡「太旧」：
     * 老照片（扫描胶片、旧手机导出的）本来就可能是几十年前的。
     */
    if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;

    return date;
  } catch {
    return null;
  }
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
