/**
 * 溶解与边界场 —— 原图 ⇄ 粒子切换时四边形与粒子**共用**的空间场与圆角边缘度量。
 *
 * 设计形态：
 *   1. **消除中心圆孔割裂**：不再以中心单点半径做二值切割（那会在主体正中挖出
 *      一圈突兀的圆洞），而是以等物理宽度的圆角边界向内推进，并叠加双倍频（fBm）
 *      有机云雾噪声与宽频带（BAND = 0.42）柔性过渡，如微风拂过般由外向内自然沙化，
 *      返回原图时则由核心向外凝聚还原。
 *   2. **四边与四角物理等宽**：在世界坐标下依据 `halfSize` 计算圆角矩形有向距离，
 *      消除直角的生硬感，供粒子态边缘散逸与羽化共用。
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

  float snFbm(vec2 p) {
    float v = 0.65 * snNoise(p);
    v += 0.35 * snNoise(p * 2.15 + vec2(5.2, 1.3));
    return v;
  }

  // 计算点到圆角相框边界的向内归一化距离：
  // 0 = 恰在圆角边界上，< 0 = 落在被圆角削去的直角外侧，1 = 画面中心
  float snEdgeDist(vec2 worldXY, vec2 halfSize) {
    float shortHalf = max(min(halfSize.x, halfSize.y), 1e-4);
    float cornerR = 0.14 * shortHalf;
    vec2 q = abs(worldXY) - (halfSize - vec2(cornerR));
    float sdBox = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - cornerR;
    return -sdBox / shortHalf;
  }

  // 计算当前位置在 uDissolve(0..1) 下的局部转化进度 (0 = 原图态, 1 = 粒子态)
  float snDissolveProgress(vec2 worldXY, vec2 halfSize, float uDissolve) {
    float edgeDist = clamp(snEdgeDist(worldXY, halfSize), 0.0, 1.0);
    float cloud = snFbm(worldXY * 2.3 + vec2(3.7, 9.2));

    // 外缘与云雾低谷处数值小（先沙化），画面核心数值大（后沙化 / 返回时先凝聚）
    float field = clamp(edgeDist * 0.56 + cloud * 0.44, 0.0, 1.0);

    // 宽频带柔性过渡，彻底消除硬切圆环
    const float BAND = 0.42;
    float start = field * (1.0 - BAND);
    return smoothstep(start, start + BAND, uDissolve);
  }
`;
