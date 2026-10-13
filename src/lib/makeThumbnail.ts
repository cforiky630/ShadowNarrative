"use client";

/**
 * 缩略图 —— 在**浏览器**里生成，随原图一起上传（`08-DATA_API_SPEC.md` §6）。
 *
 * ── 为什么不是服务端生成 ─────────────────────────────────────────────
 *
 * `08 §6` 原先写的是「像素处理属于 Python 图像服务」，而那个理由经不起看：
 * 它真正要解的是 HEIC / RAW（`05 §7`），与缩略图无关 —— 现在只接受
 * jpeg / png / webp / gif 四种（`mediaService.ALLOWED`），**这四种浏览器
 * 本来就都能解、也都能编码**。
 *
 * 服务端的另外两条路都不好：
 *
 *   - `sharp` 是**原生模块**，而 `10-IMPLEMENTATION_PLAN.md` 的 Round 13
 *     封装友好约束第三条点名的就是它（每多一个原生模块，Electron 的封装
 *     就多一份 ABI 重编译与体积的账）
 *   - 纯 JS / WASM 的解码器要按格式各引一份，而 Node 里没有 Canvas，
 *     重采样还得自己写 —— 与 `05 §17`「已有依赖 → 少量工具 → 自己实现」
 *     一条都对不上
 *
 * 而浏览器这条路是**白送的**：照片页为了「不等网络就成型」本来就要
 * `createImageBitmap` 解一次（见 `MemorySpace.acceptFile`），
 * 那张 bitmap 正好可以复用。零新依赖、零原生模块、服务端不花 CPU。
 *
 * 代价是非浏览器上传（`curl`、将来的脚本）没有缩略图 —— 那是**干净的降级**：
 * `thumbnailKey` 落成 null，`/api/photos/:id/thumbnail` 回落到原图，
 * 也就是今天的行为。与 `05 §7` 给 Python 服务定的姿态是同一条。
 */

/**
 * 缩略图长边。
 *
 * 按最吃图的那一处算：相册展开那张的面板宽约 366 CSS px
 * （`max-w-[760px]` 减 7×8px gap，按 `grow = r(n-1)/(1-r)` 分给 8 格）、
 * 高约 342（`AlbumSpace` 的 `h*0.38`，封顶 440）。2× DPR 下约 732×684
 * 设备像素 —— 竖幅照片在 1024 长边下给到 768 宽，正好盖住。
 *
 * 像素数则从 12MP 降到 0.79MP（**1/15**）。相册一次摆 8 张，
 * 这就是「几张没事、几十张吃光内存」（`16 §2.4`）那句话的解法。
 */
const LONG_EDGE = 1024;

/** webp 优先（更小、支持透明），拿不到再试 jpeg。 */
const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.85;

/**
 * 生成一张缩略图。**任何失败都返回 null** —— 它是锦上添花，
 * 绝不能阻塞上传。
 *
 * @param source 传 `File` 时自己解码、用完自己关；传 `ImageBitmap` 时
 *   **不负责关闭**，所有权在调用方（照片页那条路要复用它）。
 */
export async function makeThumbnail(
  source: File | ImageBitmap,
  longEdge = LONG_EDGE,
): Promise<Blob | null> {
  let bitmap: ImageBitmap | null = null;
  let ownsBitmap = false;

  try {
    if (source instanceof ImageBitmap) {
      bitmap = source;
    } else {
      // 默认就应用 EXIF 方向，所以出来的 bitmap 是**正立**的 ——
      // 画进 canvas 之后方向就烘焙进去了，输出不带 EXIF。
      // 这与 `<img>` 的默认行为（`image-orientation: from-image`）一致，
      // 所以缩略图、原图标签、画布三处看到的是同一个朝向。
      bitmap = await createImageBitmap(source);
      ownsBitmap = true;
    }

    const { width, height } = bitmap;
    if (!width || !height) return null;

    // 只缩不放。一张本来就小的图，再放大没有意义。
    const scale = Math.min(1, longEdge / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);

    return (
      (await encode(canvas, "image/webp", WEBP_QUALITY)) ??
      (await encode(canvas, "image/jpeg", JPEG_QUALITY))
    );
  } catch {
    // 解码失败、OffscreenCanvas 不可用、内存不够 —— 一律当作「这张不做缩略图」。
    // 上传本身照旧（`05 §7`：派生资源不可用时降级为原图直出，不阻塞）
    return null;
  } finally {
    if (ownsBitmap) bitmap?.close();
  }
}

/**
 * 编码一版。
 *
 * ⚠️ 规范要求：请求了不支持的 `type` 时 `convertToBlob` **静默回落到
 * `image/png`**，不抛错。而 png 有可能比原图还大 —— 那就不如不做。
 * 所以这里比对返回的 `type`，对不上就算这一版没成功。
 */
async function encode(
  canvas: OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob | null> {
  try {
    const blob = await canvas.convertToBlob({ type, quality });
    return blob.type === type ? blob : null;
  } catch {
    return null;
  }
}
