/**
 * 领域模型与实体数据契约
 *
 * 来源：docs/specs/
 *   - 领域模型        08-DATA_API_SPEC.md §2、§3
 *   - AI 理解与证据    09-AI_SPEC.md §6、§7、§8
 *   - 设置卡视图      07-UI_PAGE_SPECS.md §11
 *   - 时间轴与影册    07-UI_PAGE_SPECS.md §12、08-DATA_API_SPEC.md §9、§17
 */

/** 基础状态与证据模型 (08 §3, 09 §6) */

/**
 * AI 处理状态（08 §3）。
 *
 * SQLite 不支持 enum，所以在库中为 String；取值集合在此约束。
 */
export type AiState = "pending" | "done" | "failed";

/** 信息来源。情绪永远只能是 inferred（09 §6）。 */
export type EvidenceSource = "observed" | "user" | "inferred";

/**
 * 带来源与置信度的取值（09 §6 §7）。
 * 置信度低时不得当作事实使用。
 */
export interface Claim<T = string> {
  value: T | null;
  source: EvidenceSource;
  confidence: number;
}

/** AI 看图结果（09 §8）。存在 PhotoAnalysis.payload 里，是 JSON 字符串。 */
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

/** 核心业务实体 (08 §3) */

/**
 * 照片 —— 主实体（08 §3）。
 *
 * 这是客户端可见的形状：不含 userId（由服务端解析）。
 * 字段名与 08 §3 保持严格一致。
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
 * 随笔小记（08 §3 的 Journal）。
 * 核心特征：轻量随笔记录，仅保留正文与版本，无长文标题与定稿仪式。
 */
export interface JournalNote {
  id: string;
  content: string;
  /** 每次写入 +1。PATCH 带上它，不一致 → 409（08 §8） */
  sourceVersion: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 照片 + 它的字幕 + 有没有随笔小记。
 * 轮询 GET /api/photos/:id 拿的就是这个。
 */
export interface PhotoDetail extends Photo {
  subtitle: ConversationMessage | null;
  /** 这张照片有没有随笔小记。仅表示存在性，不携带冗长正文 */
  hasNote: boolean;
}

/** 影册实体 (01 §4, 08 §9) */

/**
 * 架子上的影册摘要。
 */
export interface MemorySummary {
  id: string;
  title: string;
  /** 这一册里有几张。空册是 0 */
  count: number;
  /** 架子上那一格用的一组缩略图（最多 4 张） */
  coverIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 某一册详情。照片按拍摄时间倒序排列。
 */
export interface MemoryDetail {
  id: string;
  title: string;
  photos: Photo[];
  createdAt: string;
  updatedAt: string;
}

/** 设置与时间线 (07 §11, 08 §17) */

/**
 * 设置浮卡的数据（07 §11）。
 */
export interface SettingsView {
  /** secrets.json 里配了 key —— 设置卡唯一能改的那份 */
  aiKeyConfigured: boolean;
  aiBaseUrl: string;
  aiModel: string;
}

/**
 * 时间轴上的一天。
 */
export interface TimelineDay {
  /** "YYYY-MM-DD"，本地日历日 */
  dayKey: string;
  title: string | null;
  /** null 表示这天还没有主题名 */
  titleSource: "ai" | "user" | null;
  /** 这天最晚的拍摄时间，倒序排列用 */
  photos: Photo[];
}
