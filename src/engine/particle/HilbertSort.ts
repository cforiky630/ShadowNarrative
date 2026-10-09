/**
 * Hilbert 空间填充曲线 —— A→B 粒子对应关系
 *
 * 规格：06-PARTICLE_ENGINE.md §14
 *
 * 问题：A 的 N 个点与 B 的 N 个点如果按任意顺序配对，粒子会各自飞向远处的目标，
 * 结果是「噪点爆炸」，而不是「云重新聚拢成另一张照片」。
 *
 * 方案：Hilbert 曲线的关键性质是「空间邻近 ⇒ 索引邻近」。把两个点集各自按
 * Hilbert index 排序后，同一秩位置上的点在空间上大致相邻，于是每个粒子走最短路
 * 径，整体呈现「云重新组织」。
 *
 * 本文件是纯函数，不依赖 Three.js 或 DOM。
 */

/** 坐标量化阶数。2^16 = 65536 网格。 */
export const HILBERT_ORDER = 16;
const GRID = 1 << HILBERT_ORDER; // 65536

/**
 * 把归一化坐标（−1..1）量化到 16 位网格。
 *
 * 越界输入会被 clamp，非有限值（NaN / Infinity）归到 0 —— 不抛错。
 * 采样在边界上偶尔产生 NaN 是可能的，而一个 NaN 足以让整个排序退化，
 * 所以这里必须堵死，不能靠调用方保证。
 */
export function quantize(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const t = (v + 1) * 0.5; // -1..1 → 0..1
  const i = Math.floor(t * (GRID - 1));
  return i < 0 ? 0 : i > GRID - 1 ? GRID - 1 : i;
}

/**
 * (x, y) → Hilbert index。
 *
 * 标准 xy2d 算法，索引范围 0 .. 2^(2*order)-1。
 * order=16 时返回值可达 2^32，因此在 JS 里用普通 number（2^53 内精确）。
 */
export function hilbertIndex(x: number, y: number, order = HILBERT_ORDER): number {
  let d = 0;
  let rx: number;
  let ry: number;
  let tx = x;
  let ty = y;

  for (let s = 1 << (order - 1); s > 0; s >>= 1) {
    rx = (tx & s) > 0 ? 1 : 0;
    ry = (ty & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);

    // 旋转象限
    if (ry === 0) {
      if (rx === 1) {
        tx = s - 1 - tx;
        ty = s - 1 - ty;
      }
      const t = tx;
      tx = ty;
      ty = t;
    }
  }

  return d;
}

/** Hilbert index → (x, y)。用于自检与调试。 */
export function hilbertPoint(
  d: number,
  order = HILBERT_ORDER,
): { x: number; y: number } {
  let rx: number;
  let ry: number;
  let t = d;
  let x = 0;
  let y = 0;

  for (let s = 1; s < 1 << order; s <<= 1) {
    rx = 1 & (t >> 1);
    ry = 1 & (t ^ rx);

    // 旋转
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }

    x += s * rx;
    y += s * ry;
    t >>= 2;
  }

  return { x, y };
}

/**
 * 对一组点按 Hilbert index 排序，返回排序后的索引排列。
 *
 * 不做原地排序 —— 调用方通常需要同时重排 position / color / size 多个数组，
 * 用返回的排列去 gather 更清晰，也避免把原始数据打乱。
 */
export function hilbertOrder(
  xs: Float32Array,
  ys: Float32Array,
  count: number,
): Uint32Array {
  const indices = new Uint32Array(count);
  const keys = new Float64Array(count);

  for (let i = 0; i < count; i++) {
    indices[i] = i;
    keys[i] = hilbertIndex(quantize(xs[i]), quantize(ys[i]));
  }

  // 按 key 升序排索引。Uint32Array.prototype.sort 支持比较器且是原地排序。
  indices.sort((a, b) => keys[a] - keys[b]);

  return indices;
}

/**
 * 窗口化最近邻交换 —— Hilbert 排序的退路。
 *
 * 规格：06-PARTICLE_ENGINE.md §14「退路」
 *
 * 若 Hilbert 排序后仍有个别粒子长距离飞行，在小窗口内做局部优化。
 * 只在小窗口内交换，保证 O(N·K) 而非 O(N²)。
 *
 * @param a        A 的点（已排序）
 * @param b        B 的点（已排序，会被交换调整）
 * @param window   窗口大小 K，默认 64
 * @returns        交换次数，用于调试
 */
export function windowedNearestNeighbor(
  a: Float32Array,
  b: Float32Array,
  window = 64,
): number {
  const n = a.length / 2;
  let swaps = 0;

  for (let i = 0; i < n; i++) {
    const ax = a[i * 2];
    const ay = a[i * 2 + 1];

    let bestJ = i;
    let bestD = Infinity;

    const end = Math.min(i + window, n);
    for (let j = i; j < end; j++) {
      const dx = ax - b[j * 2];
      const dy = ay - b[j * 2 + 1];
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        bestJ = j;
      }
    }

    if (bestJ !== i) {
      const tx = b[i * 2];
      const ty = b[i * 2 + 1];
      b[i * 2] = b[bestJ * 2];
      b[i * 2 + 1] = b[bestJ * 2 + 1];
      b[bestJ * 2] = tx;
      b[bestJ * 2 + 1] = ty;
      swaps++;
    }
  }

  return swaps;
}
