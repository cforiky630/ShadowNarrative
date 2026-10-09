/**
 * 粒子着色器
 *
 * 规格：06-PARTICLE_ENGINE.md
 *   §7  呼吸
 *   §8  鼠标场
 *   §11 Morph 属性
 *   §12 阶段时间预算
 *
 * 与文档的差异（用户 2026-10-09 的产品决定，实现优先）：
 *   原 §11/§12 设计的是「先散成云、再重新聚拢」的六阶段转场。
 *   用户要求改为**原地滑动** —— 粒子从 A 的位置直接滑到 B 的位置，不离开原位，
 *   看起来是沙粒重新排列而不是爆开重组。因此 SCATTER / FREE 两个阶段被取消，
 *   只保留滑动中段极小的拂动，避免退化成机械位移。
 *   文档 06 需要同步更新。
 */

/**
 * 滑动区间在 uProgress(0..1) 上的位置，由 06 §12 的毫秒预算换算（总时长 1200ms）。
 *
 *   PREPARE  0–80ms     → 0.000 – 0.067  不移动
 *   SLIDE    80–1060ms  → 0.067 – 0.883  从 A 滑到 B
 *   SETTLE   1060–1200ms→ 0.883 – 1.000  阻尼到静止
 */
const PHASES = /* glsl */ `
const float P_SLIDE_IN  = 0.067;
const float P_SLIDE_OUT = 0.883;
`;

export const particleVertexShader = /* glsl */ `
${PHASES}

attribute vec3  aPositionA;
attribute vec3  aPositionB;
attribute vec3  aColorA;
attribute vec3  aColorB;
attribute float aSizeA;
attribute float aSizeB;
attribute float aRandom;

uniform float uProgress;
uniform float uScatter;
uniform float uTime;
uniform vec2  uPointer;
uniform float uMouseRadius;
uniform float uMouseForce;
uniform float uSize;
uniform float uMotion;
uniform float uTurbulence;
uniform float uNoiseSpeed;
uniform float uColorVariation;
uniform float uDpr;
uniform float uOpacity;

varying vec3  vColor;
varying float vAlpha;

void main() {
  // --- 滑动进度 ---
  // smoothstep 本身是 ease-in-out，起步与收尾都慢，符合 02 §10「慢、柔和、有惯性」
  float m = smoothstep(P_SLIDE_IN, P_SLIDE_OUT, uProgress);

  vec3 pos = mix(aPositionA, aPositionB, m);

  vec3 jitter = vec3(
    sin(aRandom * 31.7),
    cos(aRandom * 47.3),
    sin(aRandom * 13.1)
  );

  // --- 滑动中段的拂动 ---
  // 中段最大、两端归零，所以不会破坏 A 与 B 两端的位置。
  // 幅度很小（约云宽的 2%）：目的是让过程像沙粒拂过，而不是机械插值。
  // 用户明确要求「原地滑动」，所以这里刻意不做整体散开。
  float lift = sin(m * 3.14159265);
  pos += jitter * lift * uScatter * 0.045;
  pos.z += lift * uScatter * 0.05;

  // --- 呼吸（06 §7）---
  float ph = aRandom * 6.2831853;
  pos += vec3(
    sin(uTime * 0.35 * uNoiseSpeed + ph),
    cos(uTime * 0.29 * uNoiseSpeed + ph * 1.7),
    sin(uTime * 0.21 * uNoiseSpeed + ph * 0.6)
  ) * (0.0045 * uMotion);

  // --- 湍流 ---
  pos.xy += vec2(
    sin(uTime * 1.10 * uNoiseSpeed + pos.y * 4.0 + ph),
    cos(uTime * 0.90 * uNoiseSpeed + pos.x * 4.0 + ph)
  ) * (uTurbulence * 0.012);

  // --- 指针场（06 §8）---
  // 无状态：位移只是当前位置与指针的函数。指针连续移动时粒子平滑进退，
  // 移开后 falloff 自然回落到 0，不需要额外的恢复积分。
  vec2  d       = pos.xy - uPointer;
  float r       = length(d);
  float falloff = 1.0 - smoothstep(0.0, uMouseRadius, r);
  pos.xy += normalize(d + vec2(1e-6)) * uMouseForce * falloff * 0.16;

  // --- 输出 ---
  vColor = mix(aColorA, aColorB, m);

  // 色彩扰动：每个粒子在自己的颜色上做一点偏移，让画面更像沙粒而不是印刷网点。
  // 幅度刻意压得很小 —— 06 §3 要求粒子颜色必须来自照片本身，不能加统一滤镜。
  vec3 chroma = vec3(
    sin(aRandom * 41.0),
    cos(aRandom * 37.0),
    sin(aRandom * 53.0)
  );
  vColor = clamp(vColor + chroma * uColorVariation * 0.12, 0.0, 1.0);

  // B 略实一点，让「落定」这一步有收束感
  vAlpha = uOpacity * (0.72 + 0.28 * m);

  float size = mix(aSizeA, aSizeB, m);
  gl_PointSize = uSize * uDpr * size;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const particleFragmentShader = /* glsl */ `
varying vec3  vColor;
varying float vAlpha;

void main() {
  // 圆形软边点。方点会让整张照片看起来像马赛克。
  vec2  c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;

  float a = smoothstep(0.5, 0.26, d);

  gl_FragColor = vec4(vColor, a * vAlpha);

  // 必须在设置 gl_FragColor 之后引入，否则颜色空间转换作用在上一个值上
  #include <colorspace_fragment>
}
`;

/** uProgress 的缓动。JS 侧调用，让滑动的时间分布是非线性的。 */
export function easeMorphProgress(t: number): number {
  // 对称的 easeInOutCubic —— 起步与收尾都慢
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
