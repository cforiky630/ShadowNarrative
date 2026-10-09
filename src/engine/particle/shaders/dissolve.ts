/**
 * 溶解场 —— 原图 ⇄ 粒子切换时四边形与粒子**共用**的空间随机场。
 *
 * 为什么必须共用：
 *   四边形在 `d > uDissolve` 的地方 discard 掉，粒子在 `d > uDissolve`
 *   的地方出现。两者严丝合缝互补，看起来才是「照片碎成沙粒」；
 *   如果各用各的随机数，或者干脆用整体透明度做交叉淡入淡出，
 *   看到的就是「照片淡出 + 一堆粒子淡入」——两件独立的事叠在一起，
 *   像叠了两张图。
 *
 * 为什么不用纯白噪声：
 *   纯白噪声看起来像静电，不像「碎成小块」。用 value noise（哈希 + 平滑插值）
 *   才有团块感 —— 先裂成大块，再从大块碎成小块。
 */

export const DISSOLVE_GLSL = /* glsl */ `
  float snHash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float snNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = snHash21(i);
    float b = snHash21(i + vec2(1.0, 0.0));
    float c = snHash21(i + vec2(0.0, 1.0));
    float d = snHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // 两个尺度叠加：大团块决定碎裂的走向，细节让边缘不规整。
  // 系数之和为 1，保证结果仍在 0..1。
  float snDissolveField(vec2 uv) {
    return snNoise(uv * 7.0) * 0.62 + snNoise(uv * 19.0) * 0.38;
  }
`;
