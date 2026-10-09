/**
 * Shadow Narrative — 核心类型
 *
 * 来源：shadow-narrative-docs/
 *   - 体验状态机      04-UX_INTERACTION_SPEC.md §2
 *   - 性能档位        15-DEVICE_ADAPTATION.md §4
 *   - 粒子参数        06-PARTICLE_ENGINE.md §17
 *   - 粒子预设        06-PARTICLE_ENGINE.md §18
 *   - 领域模型        08-DATA_API_SPEC.md §2
 */

// ---------------------------------------------------------------------------
// 体验状态机（04 §2）
// ---------------------------------------------------------------------------

/**
 * 体验状态机。
 *
 * 定义在 04-UX_INTERACTION_SPEC.md §2 与 05-TECH_ARCHITECTURE.md §9，三处必须一致。
 * 原设计里的 SCATTER / ASSEMBLE 两个阶段已随「原地滑动」的转场决定取消。
 */
export type ExperienceMode =
  | "rest"
  | "explore"
  | "focus"
  | "interact"
  | "orbit"
  | "morphing"
  | "story"
  | "journal"
  | "conversation";

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

export const TIER_SPECS: Readonly<Record<PerformanceTier, TierSpec>> = {
  ultra: {
    particleCount: 150_000,
    maxDpr: 2.0,
    postProcessing: true,
    sampleLongEdge: 2048,
    frameBudgetMs: 16.7,
  },
  high: {
    particleCount: 100_000,
    maxDpr: 2.0,
    postProcessing: true,
    sampleLongEdge: 1600,
    frameBudgetMs: 16.7,
  },
  medium: {
    particleCount: 50_000,
    maxDpr: 1.5,
    postProcessing: false,
    sampleLongEdge: 1024,
    frameBudgetMs: 22,
  },
  low: {
    particleCount: 20_000,
    maxDpr: 1.0,
    postProcessing: false,
    sampleLongEdge: 768,
    frameBudgetMs: 33,
  },
  minimal: {
    particleCount: 8_000,
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

/** 默认值同时定义在 04-UX_INTERACTION_SPEC.md §5 与 06-PARTICLE_ENGINE.md §8 */
export const DEFAULT_PARTICLE_PARAMS: ParticleParams = {
  density: 1.0,
  size: 1.6,
  motion: 0.35,
  turbulence: 0.12,
  mouseRadius: 0.22,
  mouseForce: 0.35,
  noiseSpeed: 1.0,
  colorVariation: 0.0,
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

// ---------------------------------------------------------------------------
// 粒子预设（06 §18）
// ---------------------------------------------------------------------------

export type ParticlePresetName = "calm" | "breeze" | "focus" | "drift";

export const PARTICLE_PRESETS: Readonly<
  Record<ParticlePresetName, Partial<ParticleParams>>
> = {
  calm: {
    density: 1.0,
    size: 1.6,
    motion: 0.35,
    turbulence: 0.12,
    mouseRadius: 0.22,
    mouseForce: 0.35,
    noiseSpeed: 1.0,
  },
  breeze: {
    density: 1.0,
    size: 1.6,
    motion: 0.6,
    turbulence: 0.2,
    mouseRadius: 0.28,
    mouseForce: 0.45,
    noiseSpeed: 1.4,
  },
  focus: {
    density: 1.0,
    size: 1.5,
    motion: 0.18,
    turbulence: 0.06,
    mouseRadius: 0.16,
    mouseForce: 0.22,
    noiseSpeed: 0.7,
  },
  drift: {
    density: 0.85,
    size: 1.8,
    motion: 0.75,
    turbulence: 0.3,
    mouseRadius: 0.32,
    mouseForce: 0.3,
    noiseSpeed: 1.8,
  },
};

// ---------------------------------------------------------------------------
// 领域模型（08 §2）—— Round 3 起使用，先定义形状
// ---------------------------------------------------------------------------

export interface Memory {
  id: string;
  userId: string;
  title: string | null;
  summary: string | null;
  location: string | null;
  memoryDate: string | null;
  coverMediaId: string | null;
  particlePresetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  memoryId: string;
  storageKey: string;
  thumbnailKey: string | null;
  mediumKey: string | null;
  particleSourceKey: string | null;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: string;
}
