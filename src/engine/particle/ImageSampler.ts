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

/**
 * 亮度权重（06 §6）。
 *
 * 文档写的是 brightness ↑ → density **slightly** ↑ —— 是**轻微**调整，不是强对比。
 *
 * 第一版用了 wMin=0.15 / gamma=1.6，亮暗密度比约 6:1，结果暗部几乎不留粒子，
 * 一张整体偏暗的照片会读成「黑矩形里有一团光」而不是照片，直接违反 §25 的
 * 「照片必须可识别」。现在收到约 1.7:1，暗部仍能撑起轮廓。
 */
const W_MIN = 0.5;
const GAMMA = 1.2;

/** 06 §4：z 轴极轻微层次，±0.02（越亮越靠前） */
const Z_LAYER = 0.02;

/**
 * 粒子层的基础厚度（±），转起来时的体积感。
 *
 * 画布支持像建模软件一样 3D 旋转，而零厚度的平面转侧就会变成一条线。
 * 厚度只影响侧视，正视时 z 不参与投影，所以**不影响照片的可识别度**
 * （06 §4）—— 也就是说这一组参数可以放得比较开，不必像密度那样保守。
 *
 * ⚠️ 2026-10-10 起它只是一个**基数**，实际厚度还会被下面三件事调制，
 * 见 `particleZ`。用户那天要的是「厚度加一点随机、主体部分厚一点」。
 */
const Z_THICKNESS = 0.085;

/**
 * 最薄的地方也保留这么多基础厚度。
 *
 * 不设成 0 是有意的：调制的三项（亮度、起伏、贴边）叠加起来如果没有下限，
 * 画面某个角落会整块塌成零厚度的纸片，转过去就是一个洞。
 */
const Z_BULK_MIN = 0.45;

/** 低频起伏的空间频率（按归一化坐标，长边 -1..1，所以约 9 个格子） */
const Z_RELIEF_FREQ = 4.5;

/** 贴边收薄：边界处厚度收到基础值的这个比例 */
const Z_EDGE_FLOOR = 0.28;

/** 从边界往内多宽的范围内完成收薄（占半宽的比例） */
const Z_EDGE_BAND = 0.3;

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
    positions[i * 3 + 2] = particleZ(x, y, l, halfW, halfH);

    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
    luma[i] = l;
  }

  return { positions, colors, luma, count, aspect };
}

/**
 * 单个粒子的 z。
 *
 * 规格：`06-PARTICLE_ENGINE.md` §4 的 z 一段（2026-10-10 重写）。
 *
 * 用户那天的原话是「厚度也可以加一点点随机或者主体部分厚」——
 * 原先的 `random(±1) * Z_THICKNESS + luma * Z_LAYER` 意味着：
 *
 *   · 整块是**均匀厚度**的一条板，转起来像一块切好的豆腐
 *   · 亮的暗的只差 0.02 的前后，主体根本立不出来
 *   · 画面四边是刀切的一样齐
 *
 * 现在厚度是**三个因子的乘积**：
 *
 * ```text
 * spread = 基础厚度 × 体量 × 贴边收薄
 *           体量   = Z_BULK_MIN + (1-Z_BULK_MIN) × (0.65×亮度 + 0.35×起伏)
 *             ├─ 亮度：主体（亮的、有细节的地方）厚，暗部压薄 ← 「主体部分厚」
 *             └─ 起伏：低频值噪声，让整块面有厚有薄、看不出规律 ← 「加一点随机」
 *           贴边收薄：越靠近画面边缘越薄                ← 「边缘别这么规则」
 * ```
 *
 * z 仍然对每个粒子再加一个**随机的正负偏移**（下面那个 `Math.random()`），
 * 否则同一处的粒子会全部躺在同一个平面上，那还是板。
 *
 * 放大 z 是**安全**的：`06 §4` 已论证厚度只影响侧视，正视角下 z 不参与
 * 投影 —— 所以这一组参数怎么调都不会伤到「照片可识别」这条底线。
 */
function particleZ(
  x: number,
  y: number,
  l: number,
  halfW: number,
  halfH: number,
): number {
  // 低频起伏：0..1，空间上连续
  const relief = reliefNoise(x, y, Z_RELIEF_FREQ);

  // 体量：主体厚、暗部薄，再叠一点无规律的厚薄
  const bulk = Z_BULK_MIN + (1 - Z_BULK_MIN) * (0.65 * l + 0.35 * relief);

  // 贴边收薄。用「到最近的边」的归一化距离：0 = 贴着边框，1 = 正中
  const edge = Math.min(1 - Math.abs(x) / halfW, 1 - Math.abs(y) / halfH);
  const edgeFade =
    Z_EDGE_FLOOR +
    (1 - Z_EDGE_FLOOR) * smooth01(Math.max(0, edge) / Z_EDGE_BAND);

  const spread = Z_THICKNESS * bulk * edgeFade;

  return (Math.random() * 2 - 1) * spread + (l - 0.5) * Z_LAYER;
}

/** 0..1 的 smoothstep，两端导数为 0（06 §10 要的就是这种「柔和落定」） */
function smooth01(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** 整数坐标 → 0..1 的稳定哈希（值噪声的角点） */
function hash2(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * 低频值噪声。空间上平滑，所以读起来是「整块面有厚薄」而不是「粒子乱跳」。
 *
 * ⚠️ **刻意不用「把整张图模糊一遍」**：那要多 O(像素) 一趟，而这个在
 * 归一化坐标上做的值噪声每个粒子只查四次哈希。而且模糊出来的是**照片的**
 * 大块面，会和亮度那一项重复 —— 这里要的是照片**没有**的那层起伏。
 */
function reliefNoise(x: number, y: number, freq: number): number {
  const fx = x * freq;
  const fy = y * freq;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth01(fx - ix);
  const ty = smooth01(fy - iy);

  const n00 = hash2(ix, iy);
  const n10 = hash2(ix + 1, iy);
  const n01 = hash2(ix, iy + 1);
  const n11 = hash2(ix + 1, iy + 1);

  const top = n00 + (n10 - n00) * tx;
  const bottom = n01 + (n11 - n01) * tx;
  return top + (bottom - top) * ty;
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
