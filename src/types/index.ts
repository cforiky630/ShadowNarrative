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

/*
 * ⚠️ 粒子数 2026-10-10 整体上调（Ultra 150k → 220k）。
 *
 * 依据是实测的余量，不是估计：150k 在 RTX 3060 上是 **4.2ms / 240fps**，
 * 而 Ultra 的预算是 16.7ms —— 有四倍空间躺在那里没用上。
 * 上调后 220k 约 6.7ms，仍在预算内，而画面细密得多。
 *
 * ⚠️ 粒子数是**绝对值**，不随视口大小变。所以窄窗口下同样多的粒子会显得
 * 更密。要按屏幕密度调，那是另一件事（`15 §4` 的档位是设备能力，不是视口）。
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

/**
 * 默认值同时定义在 04-UX_INTERACTION_SPEC.md §5 与 06-PARTICLE_ENGINE.md §8。
 *
 * ⚠️ `size` 2026-10-10 由 1.6 提到 **1.8** —— 与粒子数一起调的，但幅度
 * **故意比数量小**。两者在画面上的作用相反：
 *
 *   · 数量上去 → 细节被解出来更多，照片读得更清，**颗粒感还在**
 *   · 尺寸上去 → 把空隙填掉，画面变滑 —— 到某个点沙粒就没了
 *
 * 实测：220k @ 1.95 已经读成「一张略软的照片」而不是「沙做的照片」；
 * 1.8 保住了颗粒。所以数量是主杠杆，尺寸只是跟着挪一点（用户的原话
 * 也是「大小**稍微**也大一些」）。
 */
export const DEFAULT_PARTICLE_PARAMS: ParticleParams = {
  density: 1.0,
  size: 1.8,
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
    size: 1.8,
    motion: 0.35,
    turbulence: 0.12,
    mouseRadius: 0.22,
    mouseForce: 0.35,
    noiseSpeed: 1.0,
  },
  breeze: {
    density: 1.0,
    size: 1.8,
    motion: 0.6,
    turbulence: 0.2,
    mouseRadius: 0.28,
    mouseForce: 0.45,
    noiseSpeed: 1.4,
  },
  focus: {
    density: 1.0,
    size: 1.8,
    motion: 0.18,
    turbulence: 0.06,
    mouseRadius: 0.16,
    mouseForce: 0.22,
    noiseSpeed: 0.7,
  },
  drift: {
    density: 0.85,
    size: 2.0,
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
 * 设置浮卡的数据（`07 §11`）。
 *
 * ⚠️ `aiKeyConfigured` 是布尔值而不是 key —— 服务端**从不回传** key 本身。
 * 能回传就说明它出现在某个响应里过，那它就会进日志、进浏览器缓存、进抓包（12 §10）。
 *
 * ⚠️ 2026-10-10 删掉了三个字段：
 *   - `autoAnalyze`（用户定「自动分析只能开」）
 *   - `aiKeyFromEnv`（用户定「不提供默认的」—— key 只剩 `secrets.json` 一个来源）
 *   - `secretsPath`（**绝对**路径是这台机器的实现细节，封装成 app 之后
 *     那个前缀就不成立了；界面上只说「数据目录里的 secrets.json」）
 */
export interface SettingsView {
  /** `secrets.json` 里配了 key —— 这是设置卡唯一能改的那份 */
  aiKeyConfigured: boolean;
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
