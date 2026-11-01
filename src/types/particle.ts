/**
 * 粒子引擎与性能档位类型定义
 *
 * 来源：docs/specs/
 *   - 性能档位        15-DEVICE_ADAPTATION.md §4
 *   - 粒子参数        06-PARTICLE_ENGINE.md §17
 *   - 粒子预设        06-PARTICLE_ENGINE.md §18
 */

/** 性能档位（15 §4） */

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

/**
 * 粒子数规格设定：
 * 220k 满载约为 6.7ms 帧开销，稳定在 16.7ms 预算内。
 * 粒子数为绝对基准值，视口适配由相机与投影矩阵处理。
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

/** 粒子参数（06 §17） */

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

/** 粒子预设（06 §18） */

export type ParticlePresetName = "calm" | "breeze" | "focus" | "drift";

export const PARTICLE_PRESETS: Readonly<
  Record<ParticlePresetName, Partial<ParticleParams>>
> = {
  /**
   * 预设矩阵（与控制面板 `Calm · Breeze · Focus · Drift` 顺序一致）：
   * - calm（默认首选，排第一位）：静谧微光。高密细腻、呼吸悠长温润，兼顾主体清晰度与沙粒生命感
   * - breeze：晚风拂沙。连贯的空间波浪流场成片起伏，展现微风拂过画面的流动韵律
   * - focus：凝视显影。满密度、细颗粒、极低扰动，如银盐相纸般凝聚五官与光影细节
   * - drift：梦境星尘。颗粒疏朗温润、3D 悬浮与色彩微光更丰盈，如在记忆深处失重漂浮
   */
  calm: {
    density: 0.96,
    size: 1.75,
    motion: 0.32,
    turbulence: 0.12,
    mouseRadius: 0.25,
    mouseForce: 0.32,
    noiseSpeed: 0.85,
    colorVariation: 0.04,
  },
  breeze: {
    density: 0.9,
    size: 1.85,
    motion: 0.48,
    turbulence: 0.34,
    mouseRadius: 0.32,
    mouseForce: 0.42,
    noiseSpeed: 1.25,
    colorVariation: 0.08,
  },
  focus: {
    density: 1.0,
    size: 1.55,
    motion: 0.14,
    turbulence: 0.04,
    mouseRadius: 0.18,
    mouseForce: 0.2,
    noiseSpeed: 0.55,
    colorVariation: 0.0,
  },
  drift: {
    density: 0.78,
    size: 2.05,
    motion: 0.76,
    turbulence: 0.46,
    mouseRadius: 0.38,
    mouseForce: 0.48,
    noiseSpeed: 1.55,
    colorVariation: 0.18,
  },
};

/**
 * 四个预设的起手值 —— 预设没写到的字段就落在这里。
 */
const NEUTRAL_PARAMS: ParticleParams = {
  density: 0.96,
  size: 1.75,
  motion: 0.32,
  turbulence: 0.12,
  mouseRadius: 0.25,
  mouseForce: 0.32,
  noiseSpeed: 0.85,
  colorVariation: 0.04,
};

/**
 * 出厂是哪一档 —— 只有这一个地方说。默认 calm（排在预设列表第一位）。
 */
export const DEFAULT_PRESET: ParticlePresetName = "calm";

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
