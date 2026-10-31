/**
 * 粒子引擎与性能档位类型定义
 *
 * 来源：docs/specs/
 *   - 性能档位        15-DEVICE_ADAPTATION.md §4
 *   - 粒子参数        06-PARTICLE_ENGINE.md §17
 *   - 粒子预设        06-PARTICLE_ENGINE.md §18
 */

// ---------------------------------------------------------------------------
// 性能档位（15 §4）
// ---------------------------------------------------------------------------

export type PerformanceTier = "ultra" | "high" | "medium" | "low" | "minimal";

/** 档位矩阵。改这里必须同步 15-DEVICE_ADAPTATION.md §4。 */
export interface TierSpec {
  /** 粒子数 */
  readonly particleCount: number;
  /** devicePixelRatio 上限 */
  readonly maxDpr: number;
  /** 是否启用后处理（bloom / grain / vignette） */
  readonly postProcessing: boolean;
  /** 采样纹理长边 */
  readonly sampleLongEdge: number;
  /** 目标帧时间（ms）。降级判定以此为准。 */
  readonly frameBudgetMs: number;
}

/*
 * ⚠️ 粒子数 2026-10-10 整体上调（Ultra 150k → 220k）。
 *
 * 依据是实测的余量，不是估计：150k 在 RTX 3060 上是 4.2ms / 240fps，
 * 而 Ultra 的预算是 16.7ms —— 有四倍空间躺在那里没用上。
 * 上调后 220k 约 6.7ms，仍在预算内，而画面细密得多。
 *
 * ⚠️ 粒子数是绝对值，不随视口大小变。所以窄窗口下同样多的粒子会显得
 * 更密。要按屏幕密度调，那是另一件事（15 §4 的档位是设备能力，不是视口）。
 */
export const TIER_SPECS: Readonly<Record<PerformanceTier, TierSpec>> = {
  ultra: {
    particleCount: 220_000,
    maxDpr: 2.0,
    postProcessing: true,
    sampleLongEdge: 2048,
    frameBudgetMs: 16.7,
  },
  high: {
    particleCount: 150_000,
    maxDpr: 2.0,
    postProcessing: true,
    sampleLongEdge: 1600,
    frameBudgetMs: 16.7,
  },
  medium: {
    particleCount: 75_000,
    maxDpr: 1.5,
    postProcessing: false,
    sampleLongEdge: 1024,
    frameBudgetMs: 22,
  },
  low: {
    particleCount: 30_000,
    maxDpr: 1.0,
    postProcessing: false,
    sampleLongEdge: 768,
    frameBudgetMs: 33,
  },
  minimal: {
    particleCount: 12_000,
    maxDpr: 1.0,
    postProcessing: false,
    sampleLongEdge: 512,
    frameBudgetMs: 33,
  },
};

/** 降档顺序，从高到低 */
export const TIER_ORDER: readonly PerformanceTier[] = [
  "ultra",
  "high",
  "medium",
  "low",
  "minimal",
];

// ---------------------------------------------------------------------------
// 粒子参数（06 §17）
// ---------------------------------------------------------------------------

export interface ParticleParams {
  /** 相对档位上限的粒子数比例，0–1。1 = 用满本档上限。 */
  density: number;
  /** 粒子基础尺寸（px，逻辑像素） */
  size: number;
  /** 常驻漂移强度 */
  motion: number;
  /** 湍流强度 */
  turbulence: number;
  /** 指针场半径，归一化坐标（04 §5） */
  mouseRadius: number;
  /** 指针场强度（04 §5） */
  mouseForce: number;
  /** 噪声时间缩放 */
  noiseSpeed: number;
  /** 颜色随机扰动幅度 0–1 */
  colorVariation: number;
}

// ---------------------------------------------------------------------------
// 粒子预设（06 §18）
// ---------------------------------------------------------------------------

export type ParticlePresetName = "calm" | "breeze" | "focus" | "drift";

export const PARTICLE_PRESETS: Readonly<
  Record<ParticlePresetName, Partial<ParticleParams>>
> = {
  /**
   * 四个预设 2026-10-11 全部重调过一遍。
   *
   * 数量与尺寸是一对，一起看才不会走样：屏幕上"有多少东西"大约正比于
   * density × size²。所以四个预设是沿着一条曲线排的 —— 颗粒越粗，
   * 数量越少，铺满画面的程度大致不变，变的是质地：
   *
   * focus   最细最多   像一张很清楚的沙画
   * calm    中等       那层沙
   * breeze  偏粗偏少   软一点、活一点
   * drift   最粗最少   像悬浮的尘（默认）
   */
  focus: {
    density: 1.0,
    size: 1.5,
    motion: 0.15,
    turbulence: 0.05,
    mouseRadius: 0.16,
    mouseForce: 0.22,
    noiseSpeed: 0.6,
  },
  calm: {
    density: 0.95,
    size: 1.8,
    motion: 0.35,
    turbulence: 0.12,
    mouseRadius: 0.22,
    mouseForce: 0.35,
    noiseSpeed: 1.0,
  },
  breeze: {
    density: 0.88,
    size: 1.95,
    motion: 0.62,
    turbulence: 0.22,
    mouseRadius: 0.3,
    mouseForce: 0.45,
    noiseSpeed: 1.45,
  },
  drift: {
    density: 0.8,
    size: 2.1,
    motion: 0.82,
    turbulence: 0.32,
    mouseRadius: 0.34,
    mouseForce: 0.3,
    noiseSpeed: 1.8,
  },
};

/**
 * 四个预设的起手值 —— 预设没写到的字段就落在这里。
 */
const NEUTRAL_PARAMS: ParticleParams = {
  density: 1.0,
  size: 1.8,
  motion: 0.35,
  turbulence: 0.12,
  mouseRadius: 0.22,
  mouseForce: 0.35,
  noiseSpeed: 1.0,
  colorVariation: 0.0,
};

/**
 * 出厂是哪一档 —— 只有这一个地方说。默认 drift。
 */
export const DEFAULT_PRESET: ParticlePresetName = "drift";

/**
 * 默认参数。由 DEFAULT_PRESET 推出来（起手值 + 那一档的覆盖）。
 */
export const DEFAULT_PARTICLE_PARAMS: ParticleParams = {
  ...NEUTRAL_PARAMS,
  ...PARTICLE_PRESETS[DEFAULT_PRESET],
};

export const PARTICLE_PARAM_RANGES: Readonly<
  Record<keyof ParticleParams, { min: number; max: number; step: number }>
> = {
  density: { min: 0.05, max: 1.0, step: 0.01 },
  size: { min: 0.5, max: 4.0, step: 0.1 },
  motion: { min: 0.0, max: 1.0, step: 0.01 },
  turbulence: { min: 0.0, max: 0.6, step: 0.01 },
  mouseRadius: { min: 0.05, max: 0.5, step: 0.01 },
  mouseForce: { min: 0.0, max: 1.0, step: 0.01 },
  noiseSpeed: { min: 0.0, max: 3.0, step: 0.05 },
  colorVariation: { min: 0.0, max: 1.0, step: 0.01 },
};
