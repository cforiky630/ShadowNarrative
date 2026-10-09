/**
 * 溶解场 —— 原图 ⇄ 粒子切换时四边形与粒子**共用**的空间场。
 *
 * 用户 2026-10-09 定下的形态：**从中间开始，向外扩散**。
 *   图片从中间开始消失，同时粒子从中间开始渲染。
 *
 * 所以场的主体是「到中心的半径」，不是二维噪声。
 * 但纯半径会变成一个机械的圆，所以在波前上叠了一点噪声让它不规则。
 *
 * 为什么必须共用：
 *   四边形在 `d < uDissolve` 的地方 discard，粒子在 `d < uDissolve`
 *   的地方出现。两者严丝合缝互补，看起来才是「照片自己解散」；
 *   各用各的场、或者用整体透明度淡入淡出，看到的就是两件独立的事叠在一起。
 *
 * 为什么用世界坐标而不是 UV：
 *   UV 空间被图片宽高比拉伸，在那里算半径得到的是椭圆。
 *   世界坐标天然是等比空间，半径才是圆的。
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

  // worldXY: 粒子云平面上的坐标（中心为原点）
  // maxR:    中心到最远角的距离，用来归一化
  //
  // 返回 0（中心）→ 1（最远角）
  float snDissolveField(vec2 worldXY, float maxR) {
    vec2 n = worldXY / maxR;
    float radius = length(n);

    // 波前扰动：振幅 0.30 是调过的 —— 再大就不像「从中间扩散」，
    // 再小就是一个机械的圆
    float wobble = (snNoise(n * 5.0) - 0.5) * 0.30;

    return clamp(radius + wobble, 0.0, 1.0);
  }
`;
