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

import { DISSOLVE_GLSL } from "./dissolve";

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
uniform float uDissolve;
uniform float uMaxR;
uniform vec2  uHalfSizeA;
uniform vec2  uHalfSizeB;
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

${DISSOLVE_GLSL}

void main() {
  // 滑动进度
  // smoothstep 本身是 ease-in-out，起步与收尾都慢，符合 02 §10「慢、柔和、有惯性」
  float m = smoothstep(P_SLIDE_IN, P_SLIDE_OUT, uProgress);

  vec3 pos = mix(aPositionA, aPositionB, m);
  vec2 halfSize = mix(uHalfSizeA, uHalfSizeB, m);

  vec3 jitter = vec3(
    sin(aRandom * 31.7),
    cos(aRandom * 47.3),
    sin(aRandom * 13.1)
  );

  // 滑动中段的拂动
  // 中段最大、两端归零，所以不会破坏 A 与 B 两端的位置。
  // 幅度很小（约云宽的 2%）：目的是让过程像沙粒拂过，而不是机械插值。
  // 用户明确要求「原地滑动」，所以这里刻意不做整体散开。
  float lift = sin(m * 3.14159265);
  pos += jitter * lift * uScatter * 0.045;
  pos.z += lift * uScatter * 0.05;

  // 溶解（照片 ⇄ 粒子）
  // 与原图四边形共用同一个 snDissolveProgress 空间场：
  // 1. appear (0.0 → 0.55) 让粒子在原图尚未淡出前就已在原像素位置就位，无缝承接；
  // 2. settle (0.18 → 1.0) 让呼吸、湍流、Z 轴起伏与边缘沙化散逸在原图淡出后柔顺展开，
  //    返回原图时则先收拢归位再与原图融为一体，彻底消除爆裂圆环与黑边断层。
  float localT = snDissolveProgress(pos.xy, halfSize, uDissolve);
  float appear = smoothstep(0.0, 0.55, localT);
  float settle = smoothstep(0.18, 1.0, localT);

  // 转化中段极轻的微风起伏（两端严格归零）
  float breeze = sin(localT * 3.14159265);
  pos.xy += jitter.xy * breeze * 0.012;
  pos.z  += jitter.z  * breeze * 0.024;
  pos.z  *= settle;

  // 粒子态边缘有机沙化与羽化：
  // 消除刀切矩形硬边与 90° 尖角，使外缘粒子随随机阈值渐次稀疏、微缩并向外轻柔逸散
  float rawEdgeDist = snEdgeDist(pos.xy, halfSize);
  float edgeWave = (snNoise(pos.xy * 3.0 + vec2(1.7, 4.3)) - 0.5) * 0.11
                 + (snNoise(pos.xy * 6.8 + vec2(8.1, 2.9)) - 0.5) * 0.055;
  float dEdge = rawEdgeDist + edgeWave;

  float edgeCutoff = aRandom * 0.18;
  float edgeKeep   = smoothstep(edgeCutoff - 0.03, edgeCutoff + 0.11, dEdge);
  float edgeAlpha  = mix(1.0, edgeKeep, settle);
  float edgeSize   = mix(1.0, mix(0.52, 1.0, smoothstep(0.0, 0.22, dEdge)), settle);

  float outerBand  = 1.0 - smoothstep(-0.04, 0.24, rawEdgeDist);
  vec2  outwardDir = normalize(pos.xy / max(halfSize, vec2(1e-4)) + vec2(1e-5));
  vec2  sandDrift  = (outwardDir + jitter.xy * 0.55) * outerBand * outerBand * (0.015 + 0.038 * aRandom);
  pos.xy += sandDrift * settle;

  // 记录未加扰动前的基准平面位置，供流场空间相位使用
  vec2 baseXY = pos.xy;

  // 呼吸（06 §7）—— 个体微浮与立体呼吸，随 settle 渐入
  float ph = aRandom * 6.2831853;
  float breatheTime = uTime * (0.42 * uNoiseSpeed);
  pos += vec3(
    sin(breatheTime + ph) + 0.45 * cos(breatheTime * 0.63 + baseXY.y * 2.5 + ph),
    cos(breatheTime * 0.84 + ph * 1.7) + 0.45 * sin(breatheTime * 0.57 + baseXY.x * 2.5 + ph),
    sin(breatheTime * 0.61 + ph * 0.6) * 1.6
  ) * (0.0052 * uMotion * settle);

  // 连贯流场（湍流 / 微风）：
  // 不加整周随机乱相（仅保留 0.15 微差避免机械同步），让相邻粒子顺着同一股气流的波峰波谷成片起伏
  float waveTime = uTime * (0.68 * uNoiseSpeed);
  float waveSeed = ph * 0.15;
  vec2 flowWave = vec2(
    sin(waveTime + baseXY.y * 3.0 + cos(baseXY.x * 2.2 + waveTime * 0.6) + waveSeed),
    cos(waveTime * 0.86 - baseXY.x * 3.0 + sin(baseXY.y * 2.2 + waveTime * 0.5) + waveSeed)
  );
  pos.xy += flowWave * (uTurbulence * 0.024 * settle);
  pos.z  += sin(waveTime * 0.92 + baseXY.x * 2.6 + baseXY.y * 2.2 + waveSeed) * (uTurbulence * 0.055 * settle);

  // 指针场（06 §8）
  // 柔钟形衰减 + 轻微切向旋流 + Z 轴托起，使指针拂过如指尖划过细沙而非顶出死板圆洞
  vec2  d       = pos.xy - uPointer;
  float r       = length(d);
  float falloff = 1.0 - smoothstep(0.0, uMouseRadius, r);
  float softFalloff = falloff * falloff * (0.72 + 0.56 * aRandom);
  vec2  radialDir = normalize(d + vec2(1e-6));
  vec2  swirlDir  = vec2(-radialDir.y, radialDir.x);
  pos.xy += (radialDir + swirlDir * 0.24) * uMouseForce * softFalloff * 0.14 * settle;
  pos.z  += uMouseForce * softFalloff * 0.075 * settle;

  // 输出
  vColor = mix(aColorA, aColorB, m);

  // 色彩扰动：每个粒子在自己的颜色上做一点偏移，让画面更像沙粒而不是印刷网点。
  // 幅度刻意压得很小 —— 06 §3 要求粒子颜色必须来自照片本身，不能加统一滤镜。
  vec3 chroma = vec3(
    sin(aRandom * 41.0),
    cos(aRandom * 37.0),
    sin(aRandom * 53.0)
  );
  vColor = clamp(vColor + chroma * uColorVariation * 0.12 * settle, 0.0, 1.0);

  // 颗粒天然粗细微差与微弱呼吸明暗，赋予细沙与微尘的真实光学层次
  float grainSize = mix(1.0, 0.86 + 0.28 * fract(aRandom * 17.3), settle);
  float shimmer   = 1.0 + sin(uTime * 1.35 * uNoiseSpeed + ph * 2.3) * (0.08 * uMotion * settle);

  // m=0 与 m=1 两端保持相同的不透明度基准，消除 settleMorph 重置 uProgress 时的亮度跳变
  vAlpha = clamp(uOpacity * appear * edgeAlpha * shimmer * (1.0 - 0.10 * lift), 0.0, 1.0);
  if (vAlpha <= 0.001) {
    gl_PointSize = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float size = mix(aSizeA, aSizeB, m);
  gl_PointSize = uSize * uDpr * size * edgeSize * grainSize;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const particleFragmentShader = /* glsl */ `
varying vec3  vColor;
varying float vAlpha;

void main() {
  if (vAlpha <= 0.001) discard;

  // 圆形柔核软边点：核心温润通透、边缘自然消融，兼具细颗粒的锐度与大颗粒的空气感
  vec2  c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;

  float a = smoothstep(0.5, 0.18, d);

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
