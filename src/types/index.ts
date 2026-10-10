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
// 显示模式（16-ALBUM_SPACE.md §8）
// ---------------------------------------------------------------------------

/**
 * 原图 ⇄ 粒子。
 *
 * 放在全局状态而不是局部 state：写它的是照片页的文字层
 * （那一格里的「Into this moment / 返回」，`16 §8.6`），而读它的是
 * `ExperienceShell` 里的画布 —— 画布在 layout 里、不在页面里，两棵子树不相邻。
 */
export type DisplayMode = "photo" | "particle";

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
// 领域模型（08 §3）
// ---------------------------------------------------------------------------

/**
 * AI 处理状态（08 §3）。
 *
 * SQLite 不支持 enum，所以库里是 String；取值集合在这里约束，
 * 应用层负责校验 —— 这是 08 §2 定下的三处写法差异之一。
 */
export type AiState = "pending" | "done" | "failed";

/** 信息来源。情绪永远只能是 inferred（09 §6）。 */
export type EvidenceSource = "observed" | "user" | "inferred";

/**
 * 带来源与置信度的取值（09 §6 §7）。
 *
 * 置信度低时不得当作事实使用。
 */
export interface Claim<T = string> {
  value: T | null;
  source: EvidenceSource;
  confidence: number;
}

/** AI 看图结果（09 §8）。存在 `PhotoAnalysis.payload` 里，是 JSON 字符串。 */
export interface PhotoAnalysisPayload {
  description: string;
  people: string[];
  objects: string[];
  location: Claim;
  date: Claim;
  events: string[];
  /** 每一项都按 Emotion Inferred 处理 —— 情绪不写成事实 */
  emotions: Claim[];
  visualKeywords: string[];
  uncertainties: string[];
}

/** 消息里标注的证据来源（09 §6）。 */
export interface SourceRef {
  field: string;
  source: EvidenceSource;
  confidence: number;
}

/**
 * 照片 —— 主实体（08 §3）。
 *
 * 这是**客户端可见**的形状：不含 `userId`（由服务端解析，客户端不需要也不该拿）。
 * 字段名与 08 §3 保持一致 —— 18 §3 的快照清单要求键名一一对应。
 */
export interface Photo {
  id: string;
  storageKey: string;
  thumbnailKey: string | null;
  contentHash: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  /** EXIF 拍摄时间。没有就为 null，排序时用 createdAt 兜底 */
  takenAt: string | null;
  caption: string | null;
  favorite: boolean;
  aiState: AiState;
  aiError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sourceRefs: SourceRef[] | null;
  /** 字幕就是对话的第一条（09 §21.1）—— 不做两套数据 */
  isSubtitle: boolean;
  createdAt: string;
}

/**
 * 照片 + 它的字幕。
 *
 * 轮询 `GET /api/photos/:id` 拿的就是这个：`aiState` 让客户端知道还要不要继续等，
 * `subtitle` 直接就是要显示在照片下方的那句话。
 */
export interface PhotoDetail extends Photo {
  subtitle: ConversationMessage | null;
}

/** 分组（08 §3）。可选，不拥有照片 —— 删分组不删照片。 */
export interface Memory {
  id: string;
  title: string | null;
  summary: string | null;
  memoryDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 设置页的数据（07 §11）。
 *
 * ⚠️ `aiKeyConfigured` 是布尔值而不是 key —— 服务端**从不回传** key 本身。
 * 能回传就说明它出现在某个响应里过，那它就会进日志、进浏览器缓存、进抓包（12 §10）。
 */
export interface SettingsView {
  autoAnalyze: boolean;
  /** `secrets.json` 里配了 key —— 这是设置页唯一能改的那份 */
  aiKeyConfigured: boolean;
  /**
   * `secrets.json` 没配，但环境变量（`.env.local`）在供应 —— 开发期的回退。
   * 必须和上面那个分开报，否则用户点「清除」会发现状态没变，像是坏了。
   */
  aiKeyFromEnv: boolean;
  aiBaseUrl: string;
  aiModel: string;
}

// ---------------------------------------------------------------------------
// Timeline（用户 2026-10-10 定的空间）
// ---------------------------------------------------------------------------

/**
 * 时间轴上的一天。
 *
 * `title` 与 `titleSource` **必须分开**：主题名默认由 AI 从当天照片提炼，
 * 点击可改。改过之后它就不再是 AI 说的了 —— `09 §6` 的证据模型要求
 * AI 产出的东西标出来源，不标就等于让 AI 的话冒充用户自己写的。
 */
export interface TimelineDay {
  /** "YYYY-MM-DD"，**本地日历日**（见 DayTheme 的 schema 注释） */
  dayKey: string;
  title: string | null;
  /** null 表示这天还没有主题名 */
  titleSource: "ai" | "user" | null;
  /** 这天最晚的拍摄时间，倒序排列用 */
  photos: Photo[];
}
