/**
 * Hilbert 曲线自检。
 *
 * 这是全项目最关键的一个算法（06-PARTICLE_ENGINE.md §14），
 * A→B Morph 的质量完全取决于它，所以单独留一个可重复执行的验证脚本。
 *
 * 运行：node scripts/verify-hilbert.mjs
 * 它直接 import TypeScript 源文件，依赖 Node 24 的原生类型剥离。
 */

import {
  hilbertIndex,
  hilbertPoint,
  quantize,
  hilbertOrder,
  windowedNearestNeighbor,
} from "../src/engine/particle/HilbertSort.ts";

let failures = 0;
const fail = (msg) => {
  console.log("  ✗ " + msg);
  failures++;
};

// ---------------------------------------------------------------------------
console.log("[1] order=3 时必须是哈密顿路径（相邻格曼哈顿距离恒为 1）");
{
  const order = 3;
  const n = 1 << order;
  const cells = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) cells.push({ x, y, d: hilbertIndex(x, y, order) });

  cells.sort((a, b) => a.d - b.d);

  const lo = cells[0].d;
  const hi = cells[cells.length - 1].d;
  console.log(`  d 范围 ${lo}..${hi}（期望 0..${n * n - 1}）`);
  if (lo !== 0 || hi !== n * n - 1) fail("d 范围不对");

  const unique = new Set(cells.map((c) => c.d));
  if (unique.size !== n * n) fail(`d 不是双射，唯一值 ${unique.size}/${n * n}`);

  let jumps = 0;
  for (let i = 1; i < cells.length; i++) {
    const md =
      Math.abs(cells[i].x - cells[i - 1].x) + Math.abs(cells[i].y - cells[i - 1].y);
    if (md !== 1) jumps++;
  }
  console.log(`  非相邻跳转 ${jumps} / ${cells.length - 1}`);
  if (jumps > 0) fail("存在非相邻跳转，不是连续路径");
}

// ---------------------------------------------------------------------------
console.log("\n[2] xy2d 与 d2xy 必须互逆");
{
  const order = 4;
  const n = 1 << order;
  let bad = 0;
  for (let d = 0; d < n * n; d++) {
    const p = hilbertPoint(d, order);
    if (hilbertIndex(p.x, p.y, order) !== d) bad++;
  }
  console.log(`  往返失败 ${bad} / ${n * n}`);
  if (bad > 0) fail("xy2d 与 d2xy 不互逆");
}

// ---------------------------------------------------------------------------
console.log("\n[3] 生产参数 order=16 下的排序质量与耗时");
{
  const N = 120_000; // Ultra 档粒子数
  const xs = new Float32Array(N);
  const ys = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    xs[i] = Math.random() * 2 - 1;
    ys[i] = Math.random() * 2 - 1;
  }

  const t0 = performance.now();
  const perm = hilbertOrder(xs, ys, N);
  const t1 = performance.now();
  console.log(`  hilbertOrder ${N.toLocaleString()} 点耗时 ${(t1 - t0).toFixed(1)}ms`);
  if (perm.length !== N) fail("排列长度不对");

  // 排序后相邻秩的空间距离应远小于未排序时的顺序
  let sortedDist = 0;
  for (let i = 1; i < N; i++) {
    const a = perm[i];
    const b = perm[i - 1];
    sortedDist += Math.hypot(xs[a] - xs[b], ys[a] - ys[b]);
  }
  let naiveDist = 0;
  for (let i = 1; i < N; i++) {
    naiveDist += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  const ratio = sortedDist / naiveDist;
  console.log(`  相邻秩平均距离  排序后 ${(sortedDist / N).toFixed(4)}  vs  未排序 ${(naiveDist / N).toFixed(4)}`);
  console.log(`  比值 ${ratio.toFixed(4)} —— 远小于 1 才说明排序有效`);
  if (ratio >= 1) fail("排序没有带来空间局部性改善");
}

// ---------------------------------------------------------------------------
console.log("\n[4] 窗口化最近邻交换必须降低总飞行距离");
{
  const N = 4000;
  const A = new Float32Array(N * 2);
  const B = new Float32Array(N * 2);
  // B 故意错位：把排序后的点打乱一小段，模拟 Hilbert 排序没完全对齐的情况
  for (let i = 0; i < N; i++) {
    A[i * 2] = Math.random() * 2 - 1;
    A[i * 2 + 1] = Math.random() * 2 - 1;
  }
  const perm = hilbertOrder(A.filter((_, k) => k % 2 === 0), A.filter((_, k) => k % 2 === 1), N);
  for (let i = 0; i < N; i++) {
    B[i * 2] = A[perm[i] * 2];
    B[i * 2 + 1] = A[perm[i] * 2 + 1];
  }
  // 局部扰动
  for (let i = 0; i < N - 1; i += 97) {
    const t = B[i * 2];
    B[i * 2] = B[(i + 1) * 2];
    B[(i + 1) * 2] = t;
    const t2 = B[i * 2 + 1];
    B[i * 2 + 1] = B[(i + 1) * 2 + 1];
    B[(i + 1) * 2 + 1] = t2;
  }

  const total = (arr) => {
    let s = 0;
    for (let i = 0; i < N; i++) s += Math.hypot(A[i * 2] - arr[i * 2], A[i * 2 + 1] - arr[i * 2 + 1]);
    return s;
  };

  const before = total(B);
  const swaps = windowedNearestNeighbor(A, B, 64);
  const after = total(B);
  console.log(`  交换 ${swaps} 次，总距离 ${before.toFixed(1)} → ${after.toFixed(1)}`);
  if (after > before) fail("交换后总距离反而变大");
}

// ---------------------------------------------------------------------------
console.log("\n[5] quantize 必须 clamp 越界输入而不是抛错");
{
  const cases = [-2, -1, 0, 0.5, 1, 2, NaN];
  let bad = 0;
  for (const v of cases) {
    const q = quantize(v);
    if (!Number.isFinite(q) || q < 0 || q > 65535) {
      console.log(`  quantize(${v}) = ${q}`);
      bad++;
    }
  }
  if (bad > 0) fail("quantize 产生了越界值");
  else console.log("  全部落在 0..65535");
}

console.log(
  failures === 0
    ? "\n✅ 全部通过 —— Hilbert 对应关系可以放心用于 Morph"
    : `\n❌ ${failures} 项失败`,
);
process.exit(failures ? 1 : 0);
