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
 */

import { DISSOLVE_GLSL } from "./dissolve";

export const quadVertexShader = /* glsl */ `
  varying vec2 vWorld;
  varying vec2 vUv;

  void main() {
    // vWorld 传世界坐标而不是 UV：UV 空间被图片宽高比拉伸，
    // 在那里算半径得到的是椭圆。见 dissolve.ts 的说明。
    vWorld = position.xy;
    // vUv 用的是几何体上那份**已翻转**的 UV（修 Three 对 ImageBitmap
    // 跳过 UNPACK_FLIP_Y 的问题，见 ParticleSystem.syncQuad）
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const quadFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uDissolve;
  uniform float uMaxR;
  uniform vec2  uHalfSize;

  varying vec2 vWorld;
  varying vec2 vUv;

  ${DISSOLVE_GLSL}

  void main() {
    vec4 tex = texture2D(uMap, vUv);
    if (uDissolve <= 0.001) {
      gl_FragColor = tex;
      return;
    }

    // 随局部转化进度平滑淡出原图，与同位置显形的粒子层无缝交接，不产生二值圆洞
    float localT = snDissolveProgress(vWorld, uHalfSize, uDissolve);
    float quadAlpha = 1.0 - smoothstep(0.10, 0.88, localT);
    if (quadAlpha <= 0.001) discard;

    gl_FragColor = vec4(tex.rgb, tex.a * quadAlpha);
  }
`;
