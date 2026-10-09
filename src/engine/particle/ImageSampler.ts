/**
 * 图像 → 粒子点集采样
 *
 * 规格：06-PARTICLE_ENGINE.md §5（算法）、§6（亮度权重）、§4（坐标映射）
 *
 * 关键点：
 *   - 采样数量恰好等于目标粒子数，不多不少（固定粒子池，方便 Morph 配对）
 *   - 用「分层逆变换」而不是纯随机采样 —— 纯随机会结块，产生明显疏密不均
 *   - 亮度权重有下限 wMin，否则暗部丢粒子、人物轮廓消失
 */

/** 06 §6 */
const W_MIN = 0.15;
const GAMMA = 1.6;

/** 06 §4：z 轴极轻微层次，±0.02（越亮越靠前） */
const Z_LAYER = 0.02;

/**
 * 粒子层的厚度（±）。
 *
 * 画布支持像建模软件一样 3D 旋转，而零厚度的平面转侧就会变成一条线。
 * 给每个粒子一个随机 z 偏移，转起来才有体积，像一块沙做的浮雕。
 * 厚度只影响侧视，正视时 z 不参与投影，所以不会影响照片的可识别度。
 */
const Z_THICKNESS = 0.07;

/**
 * sRGB → 线性。
 *
 * getImageData 给的是 sRGB 编码值，但着色器必须输出线性值，
 * 由 Three 的 colorspace_fragment 再转回 sRGB。
 * 少了这一步照片会明显发暗发灰。
 */
function srgbToLinear(c: number): number {
  return c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export interface SampleResult {
  /** 位置，交错 [x0,y0,z0, x1,y1,z1, ...]，归一化坐标，长边落在 -1..1 */
  positions: Float32Array;
  /** 颜色，交错 [r0,g0,b0, ...]，0..1 */
  colors: Float32Array;
  /** 每个点的亮度 0..1，用于尺寸微调 */
  luma: Float32Array;
  /** 实际点数（等于传入的 count，除非图全透明） */
  count: number;
  /** 原始宽高比 w/h */
  aspect: number;
}

const supportsOffscreen =
  typeof OffscreenCanvas !== "undefined" &&
  typeof OffscreenCanvas.prototype.getContext === "function";

/** 按档位把长边缩到 sampleLongEdge，但从不放大。 */
export function scaledSize(
  width: number,
  height: number,
  longEdge: number,
): { w: number; h: number } {
  const longest = Math.max(width, height);
  if (longest <= longEdge) return { w: width, h: height };
  const k = longEdge / longest;
  return { w: Math.max(1, Math.round(width * k)), h: Math.max(1, Math.round(height * k)) };
}

/**
 * 采样主函数。同步执行 —— 调用方负责在合适的时机跑（大图会占用主线程几十毫秒）。
 *
 * 之所以不做成分片异步：采样耗时可控（2048 长边约 4M 像素，实测在 100ms 量级），
 * 而分片会显著复杂化代码。若真成为瓶颈，再挪到 Worker（06 §22）。
 */
export function sampleImage(
  bitmap: ImageBitmap,
  count: number,
  sampleLongEdge: number,
): SampleResult {
  const aspect = bitmap.width / bitmap.height;
  const { w, h } = scaledSize(bitmap.width, bitmap.height, sampleLongEdge);

  const canvas = supportsOffscreen
    ? new OffscreenCanvas(w, h)
    : document.createElement("canvas");
  if (!supportsOffscreen) {
    (canvas as HTMLCanvasElement).width = w;
    (canvas as HTMLCanvasElement).height = h;
  }

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("ImageSampler: 无法创建 2D 上下文");

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h).data;
  const pixels = w * h;

  // --- 权重 + 累积分布（06 §6）---
  const cdf = new Float64Array(pixels);
  const lumaBuf = new Float32Array(pixels);
  let acc = 0;
  let lastNonZero = -1;

  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    const a = data[o + 3];

    let wgt = 0;
    let luma = 0;
    if (a > 0) {
      // Rec.709
      luma = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
      // wMin 是硬性下限：纯暗部也必须留粒子，否则轮廓会消失
      wgt = W_MIN + (1 - W_MIN) * Math.pow(luma, GAMMA);
      // 透明像素按不透明处理时也要考虑 alpha，避免边缘半透明处过密
      if (a < 255) wgt *= a / 255;
    }

    lumaBuf[i] = luma;
    acc += wgt;
    cdf[i] = acc;
    if (wgt > 0) lastNonZero = i;
  }

  const total = acc;

  // 全透明图（或极端情况）：退化为均匀采样，保证仍返回 count 个点
  if (total <= 0 || lastNonZero < 0) {
    return uniformSample(aspect, count);
  }

  // --- 分层逆变换采样（06 §5 step 5）---
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const luma = new Float32Array(count);

  const slice = total / count;

  // 坐标映射（06 §4）：保持宽高比，长边落在 -1..1
  const halfW = aspect >= 1 ? 1 : aspect;
  const halfH = aspect >= 1 ? 1 / aspect : 1;

  for (let i = 0; i < count; i++) {
    const target = i * slice + Math.random() * slice;
    const idx = lowerBound(cdf, target, pixels);
    const px = idx % w;
    const py = (idx / w) | 0;

    // 像素中心，映射到 -1..1
    const u = (px + 0.5) / w; // 0..1
    const v = (py + 0.5) / h; // 0..1

    const x = (u * 2 - 1) * halfW;
    // 图像 y 向下，世界 y 向上，翻转
    const y = -((v * 2 - 1) * halfH);

    const o = idx * 4;
    // 着色器要线性值，这里就转好，避免每帧在片元着色器里做 pow
    const r = srgbToLinear(data[o] / 255);
    const g = srgbToLinear(data[o + 1] / 255);
    const b = srgbToLinear(data[o + 2] / 255);
    const l = lumaBuf[idx];

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    // 亮度决定在层内的前后，随机分量提供旋转时的体积感
    positions[i * 3 + 2] =
      (Math.random() * 2 - 1) * Z_THICKNESS + (l - 0.5) * Z_LAYER;

    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
    luma[i] = l;
  }

  return { positions, colors, luma, count, aspect };
}

/** 二分查找第一个 >= target 的 cdf 下标 */
function lowerBound(cdf: Float64Array, target: number, len: number): number {
  let lo = 0;
  let hi = len - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 全透明图的退路：均匀铺满，不让调用方拿到 0 个点。 */
function uniformSample(aspect: number, count: number): SampleResult {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const luma = new Float32Array(count);

  const halfW = aspect >= 1 ? 1 : aspect;
  const halfH = aspect >= 1 ? 1 / aspect : 1;
  const cols = Math.ceil(Math.sqrt(count * aspect));
  const rows = Math.ceil(count / cols);

  for (let i = 0; i < count; i++) {
    const cx = i % cols;
    const cy = (i / cols) | 0;
    positions[i * 3] = ((cx + 0.5) / cols) * 2 * halfW - halfW;
    positions[i * 3 + 1] = -(((cy + 0.5) / rows) * 2 * halfH - halfH);
    positions[i * 3 + 2] = 0;
    colors[i * 3] = 1;
    colors[i * 3 + 1] = 1;
    colors[i * 3 + 2] = 1;
    luma[i] = 0.5;
  }
  return { positions, colors, luma, count, aspect };
}
