/**
 * 原图四边形的着色器。
 *
 * 用自定义 ShaderMaterial 而不是 MeshBasicMaterial，是因为需要在片元里
 * 按空间场 discard 掉碎片 —— 这是「照片自己解散」的核心。
 *
 * ⚠️ 色彩空间：纹理标为 NoColorSpace（见 ParticleSystem.syncQuad），
 * texture2D 拿到的是原始 sRGB 值，这里**不做任何转换**，直接写给画布
 * 就是正确显示。不要加 `#include <colorspace_fragment>` —— 那会再编码一次，
 * 图像会发灰发白。
 *
 * 粒子那边走的是另一条路（JS 里转成线性 → 着色器输出线性 → 由
 * colorspace_fragment 编码回 sRGB），两条路径最终的显示结果一致。
 */

import { DISSOLVE_GLSL } from "./dissolve";

export const quadVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const quadFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uDissolve;

  varying vec2 vUv;

  ${DISSOLVE_GLSL}

  void main() {
    // 进度越过这个碎块，它就碎掉消失。
    // 粒子用的是同一个场，会在**同一个位置**接手 —— 这才是"解散"，
    // 而不是"淡出"。
    if (snDissolveField(vUv) > uDissolve) discard;

    gl_FragColor = texture2D(uMap, vUv);
  }
`;
