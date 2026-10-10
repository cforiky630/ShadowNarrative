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
 * 缩略图由**浏览器**生成（`08 §6`），这里只负责校验它、落盘、以及后来读回来。
 * HEIC / RAW 的解码仍然归 Python 图像服务（尚未建）—— 那才是它存在的理由。
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

/**
 * 缩略图允许的格式。**比原图少一个 gif** —— 我们只会生成静态的
 * webp / jpeg，一张动图当缩略图没有意义（而且它不会比原图省内存）。
 */
const THUMBNAIL_ALLOWED: Record<
  string,
  { ext: string; format: ImageInfo["format"] }
> = {
  "image/webp": { ext: "webp", format: "webp" },
  "image/jpeg": { ext: "jpg", format: "jpeg" },
  "image/png": { ext: "png", format: "png" },
};

/**
 * 缩略图的字节上限。长边 1024、质量 0.82 的 webp 通常不到 200KB，
 * 2MB 是一个宽松的护栏 —— 它挡的是「客户端传了一张原图来冒充缩略图」。
 */
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

/**
 * 缩略图的长边上限。`makeThumbnail` 只产 1024，4096 同样是护栏：
 * 一个人为构造的请求不该能把一张 8000px 的图塞进「缩略图」那个字段。
 */
const THUMBNAIL_MAX_EDGE = 4096;

/** 短边下限，与原图那条一致（太小说明不是给人看的图）。 */
const MIN_EDGE = 32;

/** 缩略图文件名的中缀，见 `saveThumbnailFile`。 */
const THUMBNAIL_INFIX = "thumb";


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
  if (info.width < MIN_EDGE || info.height < MIN_EDGE) {
    throw new ApiError("INVALID_INPUT", `图片太小，短边至少 ${MIN_EDGE}px`);
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

/** 缩略图落盘的结果。 */
export interface StoredThumbnailFile {
  storageKey: string;
}

/**
 * 校验并落盘客户端送上来的缩略图（`08 §6`）。
 *
 * ⚠️ **缩略图是本机生成的，但仍然一道校验都不能少。** 它走的是同一条
 * 「不信客户端」的路子（`08 §12`、`12 §2`）—— 请求可以来自任何地方，
 * 不是只有我们那个 `makeThumbnail`。挡的是「拿原图冒充缩略图」和
 * 「塞一张 8000px 的图进来」这两类。
 *
 * **任何一项不过都返回 null，不抛错。** 缩略图是派生资源，缺了它
 * 界面回落到原图（`/api/photos/:id/thumbnail` 的回落分支），
 * 上传本身必须照旧成功 —— 这正是 `05 §7` 给 Python 服务定的姿态。
 *
 * 落盘位置与原图**同目录**，名字取原图的 stem 加 `.thumb.`：
 * `ls` 时一眼看得出归属。这不是契约，只是可读性 ——
 * `08 §16` 的删除本来就是按 key 逐个删的。
 *
 * 这里不建目录：能拿到 `originalStorageKey` 就说明原图刚写进去过，
 * 目录一定在（`08 §6` 的顺序）。
 */
export async function saveThumbnailFile(
  file: File,
  originalStorageKey: string,
): Promise<StoredThumbnailFile | null> {
  const allowed = THUMBNAIL_ALLOWED[file.type];
  if (!allowed) return skipThumbnail(`格式不在允许范围：${file.type || "未知"}`);
  if (file.size <= 0) return skipThumbnail("文件为空");
  if (file.size > THUMBNAIL_MAX_BYTES) {
    return skipThumbnail(`超过 ${Math.round(THUMBNAIL_MAX_BYTES / 1024 / 1024)}MB`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // 同原图：读文件头判断真实格式，不信浏览器给的 MIME（08 §12）
  const info = readImageInfo(bytes);
  if (!info) return skipThumbnail("内容不是可识别的图片");
  if (info.format !== allowed.format) {
    return skipThumbnail(`声明为 ${allowed.format} 但内容是 ${info.format}`);
  }
  if (Math.max(info.width, info.height) > THUMBNAIL_MAX_EDGE) {
    return skipThumbnail("尺寸超出上限");
  }
  if (Math.min(info.width, info.height) < MIN_EDGE) {
    return skipThumbnail(`短边小于 ${MIN_EDGE}px`);
  }

  const stem = path.parse(originalStorageKey).name;
  const storageKey = `${stem}.${THUMBNAIL_INFIX}.${allowed.ext}`;
  const dir = resolvePhotosDir();

  try {
    // turbopackIgnore：见 dataDir.ts 的同名说明 —— 数据目录在项目之外
    await writeFile(path.join(/*turbopackIgnore: true*/ dir, storageKey), bytes);
  } catch (error) {
    // 落盘失败（磁盘满、权限）：同样只记原因码，不记内容（12 §10）
    console.warn(
      "[mediaService] 缩略图跳过：落盘失败",
      (error as NodeJS.ErrnoException).code ?? "",
    );
    return null;
  }

  return { storageKey };
}

/**
 * 缩略图不合格时的统一出口。
 *
 * 记的是**原因**，不是内容 —— `12 §10` 要求运行日志里不出现图片内容。
 * 用 `warn` 而不是 `error`：这是预期内的降级，不是故障。
 */
function skipThumbnail(reason: string): null {
  console.warn(`[mediaService] 缩略图跳过：${reason}`);
  return null;
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
