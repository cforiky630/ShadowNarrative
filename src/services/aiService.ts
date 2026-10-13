import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/apiResponse";
import { getAiCredentials, type AiCredentials } from "@/lib/secrets";
import type {
  Claim,
  ConversationMessage,
  JournalNote,
  PhotoAnalysisPayload,
  SourceRef,
} from "@/types";
import { readStoredFile } from "./mediaService";
import { appendMessage, listMessages, recordSubtitle } from "./conversationService";
import { getNote, saveNote } from "./journalService";
import {
  CONVERSATION_SYSTEM,
  JOURNAL_SYSTEM,
  SYSTEM_PROMPT,
  USER_INSTRUCTION,
} from "./aiPrompt";

/**
 * AI 服务 —— 调 DeepSeek（09-AI_SPEC.md）。
 *
 * 这个文件**不做框架的事**：不 import `next/server`，不碰 `after()`。
 * 「上传后异步触发」由路由层用 `after()` 完成 —— 见计划的「可抽取约束」。
 *
 * 隐私（09 §17、12 §5、12 §10）：
 *   - 只发当前这一张照片，不发历史、不发 EXIF/GPS
 *   - 日志**不得**记录 API key，也不得记录图片内容或 prompt 全文
 *   - `sentSummary` 记录「发出去了什么」，供界面披露
 */

// ---------------------------------------------------------------------------
// 请求参数（09 §20）
// ---------------------------------------------------------------------------

/**
 * ⚠️ `effort` 必须显式设为 `low`。
 *
 * `deepseek-flash` 默认 `effort: "high"`，会先烧掉大量 reasoning token。
 * 实测：max_tokens=900 时 852 个 token 被 reasoning 吃掉，JSON 被截断在中间
 * （`finish_reason: "length"`）—— 正是 09 §20 警告的那个失败模式。
 */
const EFFORT = "low";

/**
 * 09 §20 要求「max_tokens 设置合理，避免 JSON 被截断在中途」。
 *
 * 注意 reasoning token **也计入** max_tokens，所以这里要按「推理 + 正文」一起给够。
 * 实测 effort=low 时总用量约 800–1200。
 */
const MAX_TOKENS = 4000;

/**
 * 对话那一路的思考强度：**开着，但拧到中档**。
 *
 * 用户 2026-10-11：「ai 对话还是太死板了……**可以开思考限制一下强度和时间就行**」。
 *
 * ⚠️ **字幕那一路必须是 `low`**（上面写了理由：reasoning 会把 JSON 挤断），
 * 而对话和它不一样：不要求 JSON、输出只有一两句话、也没有 30 秒轮询在催。
 * 多花几百毫秒换「接得上话」，这笔账划算。
 *
 * 两道闸都在：时间那道是 `REQUEST_TIMEOUT_MS`（20 秒），
 * token 那道是下面这个数。
 */
const CONVERSATION_EFFORT = "medium";

/**
 * 对话那一路的上限。
 *
 * ⚠️ **和 `MAX_TOKENS` 一样是 4000，不能小。** 第一版给的是 2000 ——
 * 实测 medium 档的推理一把就把那 2000 吃光，`finish_reason: "length"`，
 * 用户收到的是「AI 的回应不完整」（正是 `09 §20` 警告的那个失败模式）。
 * 回复本身只有一两句，给够的是**思考的余量**。
 *
 * ⚠️ 真正卡住「别想太久」的是时间那道闸（`REQUEST_TIMEOUT_MS`，20 秒），
 * 加上提示词里「默认一到三句」那一条 —— 不是这个数。
 */
const CONVERSATION_MAX_TOKENS = 4000;

/**
 * 单次调用超时。必须显著小于客户端的 30 秒轮询预算（08 §10），
 * 否则前端已经放弃、服务端还在跑，用户看到的是「失败」但后台在烧钱。
 */
const REQUEST_TIMEOUT_MS = 20_000;

const DETAIL = "low" as const; // 09 §20 默认值：降采样到 512×512 足够判断有什么人/在哪/什么氛围

// 提示词在 ./aiPrompt.ts —— 产品性格是会被反复调的东西，单独成文件，
// 好让它能脱离服务层单独试验（见该文件的说明）。

// ---------------------------------------------------------------------------
// 输出后过滤（09 §20 第 2 层 —— 文档写明是硬性要求）
// ---------------------------------------------------------------------------

/**
 * 排他性与依赖制造类短语（09 §3 §4.6）。
 * 这些是产品底线，命中就必须重来或降级。
 */
const BANNED_PHRASES = [
  "只有我懂你",
  "只有我了解你",
  "我一直都在等你",
  "我一直在等你",
  "我永远记得你说过的每句话",
  "作为你的 AI 朋友",
  "作为你的朋友",
  "我完全能感受到你的痛苦",
  "我完全理解你的痛苦",
  "不要离开我",
  "别离开我",
];

/** emoji / 各类图形符号（09 §3：不应该使用 emoji）。 */
const EMOJI = /\p{Extended_Pictographic}/u;

/** 全角感叹号与半角感叹号。句末一律用"。"（09 §3）。 */
const EXCLAMATION = /[!！]/;

/**
 * 检查一句话违反了哪几条语气规范。
 * 返回空数组表示通过。
 */
export function findToneViolations(text: string): string[] {
  const found: string[] = [];
  if (EMOJI.test(text)) found.push("含 emoji");
  if (EXCLAMATION.test(text)) found.push("含感叹号");
  for (const phrase of BANNED_PHRASES) {
    if (text.includes(phrase)) found.push(`含排他性表述「${phrase}」`);
  }
  return found;
}

/**
 * 兜底净化：来不及重新生成时，用确定性手段把明显违规的部分去掉。
 *
 * 只处理能安全机械替换的（emoji、感叹号）。排他性表述无法靠替换修好
 * —— 那会改变整句话的意思，所以交给调用方降级。
 */
function scrub(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[!！]+/g, "。")
    .replace(/。{2,}/g, "。")
    .replace(/\s+([。，、])/g, "$1")
    .trim();
}

/**
 * 硬性截到最多 `max` 句（09 §21.6：字幕最多两句）。
 *
 * 这是**确定性保证**，不指望模型每次都听话。它是字幕不是段落 ——
 * 超出一句话就变成在照片下面贴了一篇文章，破坏 16 §7.1 的构图。
 */
export function limitSentences(text: string, max: number): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // 在句末标点处切分，标点跟随前一句
  const parts = trimmed.match(/[^。！？!?…]+[。！？!?…]+|[^。！？!?…]+$/g);
  if (!parts) return trimmed;
  return parts.slice(0, max).join("").trim();
}

/**
 * 语气守卫：先重生成，再净化，最后降级。
 *
 * 顺序不能反过来 —— 能重生成就别用净化，净化会把一句话打散。
 */
async function guardSubtitle(
  initial: string,
  regenerate: (hint: string) => Promise<string>,
  description: string,
): Promise<string> {
  let candidate = initial;
  let violations = findToneViolations(candidate);

  if (violations.length > 0) {
    // 重生成一次，把违规点明确告诉模型
    try {
      candidate = await regenerate(violations.join("；"));
      violations = findToneViolations(candidate);
    } catch {
      // 重生成失败不该让整次分析失败 —— 下面还有净化与降级两级
    }
  }

  if (violations.length === 0) return limitSentences(candidate, 2);

  // 排他性表述无法靠机械替换修好 → 直接降级
  const unfixable = violations.some((v) => v.startsWith("含排他性表述"));
  if (unfixable) {
    return limitSentences(degradeSubtitle(description), 2);
  }

  const scrubbed = scrub(candidate);
  if (findToneViolations(scrubbed).length === 0) return limitSentences(scrubbed, 2);

  return limitSentences(degradeSubtitle(description), 2);
}

/**
 * 降级文案。
 *
 * 必须是**只对这张照片成立**的东西，否则降级本身就成了 09 §21.4 说的空话。
 * 先试分析描述的第一句 —— 那是 AI 明确观察到的内容；实在没有才退回极短的一句
 * （09 §21.3 允许"只看到很少 → 可以只说很短"）。
 */
function degradeSubtitle(description: string): string {
  const first = limitSentences(description.trim(), 1);
  if (first.length >= 4 && findToneViolations(first).length === 0) return first;
  return "嗯，这张。";
}

// ---------------------------------------------------------------------------
// 结构校验（09 §20：必须用 schema 校验，失败重试 1 次，仍失败返回 502）
// ---------------------------------------------------------------------------

/** 手写校验，不引 zod —— 保持零新依赖（05 §17 依赖策略）。 */
function isClaim(value: unknown): value is Claim {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  const sourceOk =
    c.source === "observed" || c.source === "user" || c.source === "inferred";
  return (
    ("value" in c) &&
    sourceOk &&
    typeof c.confidence === "number" &&
    Number.isFinite(c.confidence)
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

const emptyClaim = (): Claim => ({ value: null, source: "inferred", confidence: 0 });

/**
 * 校验并规范化 09 §8 的图像理解结构。
 *
 * 未知字段丢弃、缺字段补默认值 —— 但不接受「结构根本不是对象」这种
 * 彻底跑偏的结果（那说明模型没在按格式回答，应该重试）。
 */
function normalizeAnalysis(value: unknown): PhotoAnalysisPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const a = value as Record<string, unknown>;

  if (typeof a.description !== "string") return null;

  return {
    description: a.description,
    people: stringArray(a.people),
    objects: stringArray(a.objects),
    location: isClaim(a.location) ? a.location : emptyClaim(),
    date: isClaim(a.date) ? a.date : emptyClaim(),
    events: stringArray(a.events),
    // 情绪一律按推测处理（09 §6）——即使模型给了别的 source 也不信它
    emotions: Array.isArray(a.emotions)
      ? a.emotions.filter(isClaim).map((c) => ({ ...c, source: "inferred" as const }))
      : [],
    visualKeywords: stringArray(a.visualKeywords),
    uncertainties: stringArray(a.uncertainties),
  };
}

function normalizeSourceRefs(value: unknown): SourceRef[] | null {
  if (!Array.isArray(value)) return null;
  const refs = value.filter(
    (v): v is SourceRef =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as SourceRef).field === "string",
  );
  return refs.length > 0 ? refs : null;
}

// ---------------------------------------------------------------------------
// 上游调用
// ---------------------------------------------------------------------------

interface DeepSeekChoice {
  finish_reason?: string;
  message?: { content?: string | null };
}

interface DeepSeekResponse {
  choices?: DeepSeekChoice[];
  usage?: { completion_tokens?: number };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  /** 纯文本，或 OpenAI 的多模态 content 数组（看图那条路用数组） */
  content: string | Array<Record<string, unknown>>;
}

/**
 * 调一次 chat/completions，返回正文。
 *
 * 抽出来是因为现在有**两个调用方**：看图（理解 + 字幕）和对话。
 * 之前只有一个，那层抽象是空的，所以合回去过一次；两个就不是了。
 *
 * 失败一律抛 `ApiError("AI_UPSTREAM_FAILED")`（08 §5 的 502）。
 * **错误信息里绝不带上游响应原文或 key**（12 §10）。
 */
async function chatCompletion(
  credentials: AiCredentials,
  params: {
    messages: ChatMessage[];
    json?: boolean;
    maxTokens?: number;
    /**
     * 思考强度。默认跟随 `EFFORT`（那一档是为「要 JSON 的那几条路」定的）。
     * 对话那一路单独调高 —— 见 `CONVERSATION_EFFORT`。
     */
    effort?: string;
  },
): Promise<string> {
  const { apiKey, baseUrl, model } = credentials;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        // 只有需要结构化输出的那条路才强制 JSON —— 对话要的是人话
        ...(params.json ? { response_format: { type: "json_object" } } : {}),
        max_tokens: params.maxTokens ?? MAX_TOKENS,
        effort: params.effort ?? EFFORT,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // 超时 / 断网。只记类型，不记请求内容
    console.error("[aiService] 上游请求失败", (error as Error).name);
    throw new ApiError("AI_UPSTREAM_FAILED", "AI 暂时没有回应");
  }

  if (!response.ok) {
    // 只记状态码 —— 上游错误体可能回显请求内容（12 §10）
    console.error("[aiService] 上游返回", response.status);
    throw new ApiError("AI_UPSTREAM_FAILED", "AI 暂时没有回应");
  }

  let body: DeepSeekResponse;
  try {
    body = (await response.json()) as DeepSeekResponse;
  } catch {
    throw new ApiError("AI_UPSTREAM_FAILED", "AI 的回应无法解析");
  }

  const choice = body.choices?.[0];

  /**
   * `finish_reason: "length"` 表示被 max_tokens 截断 —— JSON 一定是残的。
   * 官方还明确说明「偶尔会返回空内容」。两种都当作失败，交给上层重试。
   */
  if (choice?.finish_reason === "length" || !choice?.message?.content) {
    throw new ApiError("AI_UPSTREAM_FAILED", "AI 的回应不完整");
  }

  return choice.message.content;
}

/** 看图那条路的消息构造。09 §20 要求 prompt 里出现 "json" 字样并给出示例。 */
async function callModel(
  credentials: AiCredentials,
  params: { imageDataUrl: string; extraHint?: string },
): Promise<string> {
  const userContent: Array<Record<string, unknown>> = [
    {
      type: "image_url",
      image_url: { url: params.imageDataUrl, detail: DETAIL },
    },
    {
      type: "text",
      text: params.extraHint
        ? `${USER_INSTRUCTION}\n\n上一次的回答有问题：${params.extraHint}。请重新给一版，仍然用 json 格式。`
        : USER_INSTRUCTION,
    },
  ];

  return chatCompletion(credentials, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    json: true,
  });
}

/** 从正文里取 JSON。模型偶尔会用 ```json 围栏包起来。 */
function parseJsonObject(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // 退一步：截取第一个 { 到最后一个 }，容忍前后的解释性文字
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* 落到下面统一抛错 */
      }
    }
    throw new ApiError("AI_UPSTREAM_FAILED", "AI 的回应不是合法 json");
  }
}

// ---------------------------------------------------------------------------
// 对外：分析一张照片的字节
// ---------------------------------------------------------------------------

export interface AnalyzeResult {
  payload: PhotoAnalysisPayload;
  subtitle: string;
  sourceRefs: SourceRef[] | null;
  model: string;
  sentSummary: string;
}

/**
 * 把一张图片交给模型，得到图像理解 + 字幕。
 *
 * 一次调用同时产出两者 —— 分两次会把同一张图传两遍，且字幕失去 analysis 的依托。
 *
 * 这个函数是**纯 I/O**：不进数据库、不碰框架。持久化在 `runPhotoAnalysis`。
 */
export async function analyzeImage(params: {
  bytes: Buffer;
  mimeType: string;
}): Promise<AnalyzeResult> {
  // 凭据来自 secrets.json（回退环境变量）。没配就明确失败，
  // 而不是拿空 key 去撞上游（17 §4）
  const credentials = await getAiCredentials();
  if (!credentials) {
    throw new ApiError("AI_UPSTREAM_FAILED", "AI 未配置");
  }

  const dataUrl = `data:${params.mimeType};base64,${params.bytes.toString("base64")}`;

  const parsed = await requestParsed(dataUrl, credentials);

  return {
    payload: parsed.payload,
    subtitle: parsed.subtitle,
    sourceRefs: parsed.sourceRefs,
    model: credentials.model,
    // 09 §17：不把 EXIF/GPS 塞进 prompt。这里如实记录到底发出去了什么
    sentSummary: `原图字节（${params.mimeType}，detail=${DETAIL}），未附带 EXIF / GPS / 历史记录`,
  };
}

/**
 * 请求 + 校验 + 语气守卫。
 *
 * 09 §20 的三条硬性要求在这里落地：schema 校验、**校验失败重试 1 次**、
 * 仍失败抛 502 让客户端降级（不显示半截结果）。
 */
async function requestParsed(
  dataUrl: string,
  credentials: AiCredentials,
): Promise<{
  payload: PhotoAnalysisPayload;
  subtitle: string;
  sourceRefs: SourceRef[] | null;
}> {
  let lastProblem = "格式不正确";

  // 第一次 + 重试一次
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let raw: string;
    try {
      raw = await callModel(credentials, {
        imageDataUrl: dataUrl,
        ...(attempt === 0 ? {} : { extraHint: `上一次的 json ${lastProblem}` }),
      });
    } catch (error) {
      // 网络 / 超时 / 截断：也重试一次
      if (attempt === 0) {
        lastProblem = "没解析出来";
        continue;
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = parseJsonObject(raw);
    } catch {
      lastProblem = "不是合法的 json";
      continue;
    }

    if (typeof parsed !== "object" || parsed === null) {
      lastProblem = "顶层不是对象";
      continue;
    }

    const obj = parsed as Record<string, unknown>;
    const payload = normalizeAnalysis(obj.analysis);
    if (!payload) {
      lastProblem = "缺少 analysis.description";
      continue;
    }
    if (typeof obj.subtitle !== "string" || !obj.subtitle.trim()) {
      lastProblem = "缺少 subtitle";
      continue;
    }

    const subtitle = await guardSubtitle(
      obj.subtitle,
      async (hint) => {
        const again = await callModel(credentials, {
          imageDataUrl: dataUrl,
          extraHint: hint,
        });
        const againObj = parseJsonObject(again) as Record<string, unknown>;
        return typeof againObj.subtitle === "string" ? againObj.subtitle : "";
      },
      payload.description,
    );

    if (!subtitle) {
      lastProblem = "subtitle 为空";
      continue;
    }

    return {
      payload,
      subtitle,
      sourceRefs: normalizeSourceRefs(obj.sourceRefs),
    };
  }

  // 两次都没拿到可用结果 —— 08 §5 的 502，客户端降级文案，不显示半截结果
  throw new ApiError("AI_UPSTREAM_FAILED", "AI 没有给出可用的回应");
}

// ---------------------------------------------------------------------------
// 对外：完整流程（读图 → 分析 → 落库 → 更新状态）
// ---------------------------------------------------------------------------

/**
 * 分析一张照片并把结果落库。
 *
 * 由路由层在 `after()` 里调用 —— 上传响应不等它（08 §6 第 8 步、08 §10）。
 *
 * 成功后：
 *   - 写 `PhotoAnalysis`（payload / model / sentSummary）
 *   - 写 `ConversationMessage(isSubtitle: true)` —— 字幕就是对话的第一条（09 §21.1）
 *   - `aiState = "done"`
 *
 * 失败后：`aiState = "failed"` + `aiError`，等用户手动重试（08 §10）。
 * **本函数不抛错给调用方** —— 它跑在响应之后，没有人在等它的异常。
 */
export async function runPhotoAnalysis(params: {
  userId: string;
  photoId: string;
}): Promise<void> {
  const photo = await prisma.photo.findFirst({
    where: { id: params.photoId, userId: params.userId },
    select: { id: true, storageKey: true, mimeType: true },
  });

  if (!photo) return;

  try {
    const bytes = await readStoredFile(photo.storageKey);
    const result = await analyzeImage({
      bytes,
      mimeType: photo.mimeType,
    });

    await prisma.photoAnalysis.upsert({
      where: { photoId: photo.id },
      create: {
        photoId: photo.id,
        payload: JSON.stringify(result.payload),
        model: result.model,
        sentSummary: result.sentSummary,
      },
      update: {
        payload: JSON.stringify(result.payload),
        model: result.model,
        sentSummary: result.sentSummary,
      },
    });

    await recordSubtitle({
      photoId: photo.id,
      content: result.subtitle,
      sourceRefs: result.sourceRefs,
    });

    await prisma.photo.update({
      where: { id: photo.id },
      data: { aiState: "done", aiError: null },
    });

  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "分析过程出错了";

    // 只记类型与消息，不记图片内容或 prompt（12 §10）
    console.error("[aiService] 分析失败", photo.id, message);

    await prisma.photo
      .update({
        where: { id: photo.id },
        data: { aiState: "failed", aiError: message },
      })
      .catch(() => {
        // 连状态都写不进去说明库有问题，没有更多可做的
      });
  }
}

// ---------------------------------------------------------------------------
// 对话（Round 8）
// ---------------------------------------------------------------------------

/**
 * 带进 prompt 的历史最多几条。
 *
 * `09 §17`：不把整个用户历史都发送给模型。这个上限连同「只发当前这一张」
 * 一起，是那条要求的具体落实 —— 一段关于单张照片的对话本来也不会很长，
 * 真超了就从最早的开始丢（字幕那条留着，因为它是上下文的地基）。
 */
const HISTORY_LIMIT = 20;

/** 用户一条消息的长度上限。超了直接拒（`08 §5` 的 `INVALID_INPUT`） */
export const MESSAGE_MAX_CHARS = 2000;

/**
 * 用户说了一句，让 AI 回一句（Round 8，`09 §9`–§11）。
 *
 * ── 与 `runPhotoAnalysis` 的三处不同，每一处都是有意的 ──────────────
 *
 * 1. **不进 `after()`。** 用户在等这句话。它是一次有超时的同步请求，
 *    失败就直接告诉他 —— 而不是像上传那样标个状态让他轮询。
 *
 * 2. **输出不解析 JSON。** `09 §11` 要的是「一到三句人话」，为一句人话
 *    套一层 JSON 是没必要的仪式。代价是 `sourceRefs` 留空 ——
 *    **这是刻意的**：`09 §6` 说「尽可能」标来源，而给一句自由回应
 *    **编**一个来源比不标更糟。证据模型的牙在别处：图像理解的
 *    `PhotoAnalysisPayload`（每个 Claim 带 source + confidence），
 *    以及随笔小记的 `factsUsed` / `inferences`。
 *
 * 3. **失败时用户那句话不会丢。** 先落库再调模型 —— 模型挂了，
 *    他说过的话还在，点一下就能重来。
 *
 * 发送范围见下面那段注释。
 */
export async function runConversationReply(params: {
  photoId: string;
  content: string;
}): Promise<ConversationMessage> {
  const content = params.content.trim();
  if (!content) throw new ApiError("INVALID_INPUT", "说点什么");
  if (content.length > MESSAGE_MAX_CHARS) {
    throw new ApiError("INVALID_INPUT", `一条最多 ${MESSAGE_MAX_CHARS} 个字`);
  }

  const photo = await prisma.photo.findUnique({
    where: { id: params.photoId },
    select: { id: true, storageKey: true, mimeType: true },
  });
  if (!photo) throw new ApiError("NOT_FOUND", "照片不存在");

  // 先落用户这句。模型失败也不能把他说过的话弄丢
  await appendMessage({ photoId: photo.id, role: "user", content });

  // 凭据来自 secrets.json（回退环境变量）。没配就明确失败，
  // 而不是拿空 key 去撞上游（17 §4）
  const credentials = await getAiCredentials();
  if (!credentials) {
    throw new ApiError("AI_UPSTREAM_FAILED", "AI 未配置");
  }

  const history = await listMessages(photo.id);
  const recent = history.slice(-HISTORY_LIMIT);

  /*
   * 这一轮要不要把图片一起发出去。
   *
   * 用户 2026-10-10：「不要每次都发图片」。
   * **只在第一轮发** —— 模型必须真的看过这张照片才有东西可说；
   * 之后不发，靠**历史**加上面那段「你之前记下的」。
   *
   * 判据是「这段对话里 AI 回过话没有」（字幕不算）。所以上游失败之后重试，
   * 仍然是第一轮，图还会再发一次 —— 那次本来就该重发。
   */
  const isFirstTurn = !history.some(
    (m) => !m.isSubtitle && m.role === "assistant",
  );

  const analysis = await prisma.photoAnalysis.findUnique({
    where: { photoId: photo.id },
    select: { payload: true },
  });

  /*
   * 发送范围（`12 §5`、`09 §17`）：**当前这一张照片 + 这段对话**。
   * 不发别的照片、不发历史相册、不发 EXIF/GPS。
   */
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        CONVERSATION_SYSTEM +
        photoContext(analysis?.payload ?? null, isFirstTurn),
    },
  ];

  for (const [index, m] of recent.entries()) {
    const isLast = index === recent.length - 1;

    if (isFirstTurn && isLast && m.role === "user") {
      /*
       * 图挂在**最后一条**上 —— 也就是用户刚说的那句。
       * 读文件也放在这个分支里：不发图的那几轮就不必去读一遍盘。
       */
      const bytes = await readStoredFile(photo.storageKey);
      messages.push({
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${photo.mimeType};base64,${bytes.toString("base64")}`,
              detail: DETAIL,
            },
          },
          { type: "text", text: m.content },
        ],
      });
    } else {
      messages.push({ role: m.role, content: m.content });
    }
  }

  /*
   * 只记「这一轮发了什么**类型**的东西」，不记任何内容（`12 §10`）。
   * 它同时也是「图片到底发了没有」的唯一可观测量 —— 那件事没有别的办法验。
   *
   * 放在调用**之前**：失败了也要留下「这一轮本打算发什么」。
   */
  console.info(
    `[aiService] 对话 ${photo.id}：历史 ${recent.length} 条，本轮${isFirstTurn ? "含" : "不含"}图片`,
  );

  const raw = await replyWithFallback(credentials, messages);
  const reply = await guardReply(credentials, messages, raw);

  return appendMessage({ photoId: photo.id, role: "assistant", content: reply });
}

/**
 * 对话那一次调用：**先开着思考，实在不行就降下来重来一次**。
 *
 * ── 为什么要有那一趟兜底 ─────────────────────────────────────────────
 *
 * 用户 2026-10-11 要的是「**开思考，限制一下强度和时间**」。实测下来，
 * medium 档确实让回复活了一点（同一段对话，思考开着之后从「复述他的话 +
 * 一个问句」变成了接得住话的短句），但它是**有代价**的：
 *
 * - 慢：实测 1.2s – 6.3s（`effort: low` 那条路是 0.3 – 0.6s）
 * - 而且**偶尔想过头**：推理把 max_tokens 吃光，`finish_reason: "length"`，
 *   用户收到的是「AI 的回应不完整」。实测四次里中了一次
 *
 * 聊天里偶尔弹一个错是不能接受的 —— 所以超预算时**降一档重来**：
 * `effort: low` 那条路又快又稳（字幕一直用它），代价只是这一条回复平淡些。
 * **平淡比报错好。**
 *
 * ⚠️ 只对「上游失败」兜底，别的错误照旧往上抛（网络、鉴权、限流不是
 * 降档能解决的）。
 */
async function replyWithFallback(
  credentials: AiCredentials,
  messages: ChatMessage[],
): Promise<string> {
  try {
    return await chatCompletion(credentials, {
      messages,
      // 对话是唯一一条**开着思考**的路：见 `CONVERSATION_EFFORT`
      effort: CONVERSATION_EFFORT,
      maxTokens: CONVERSATION_MAX_TOKENS,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "AI_UPSTREAM_FAILED") {
      throw error;
    }
    // 只记类型，不记内容（12 §10）
    console.warn("[aiService] 对话思考超预算，降档重试");
    return chatCompletion(credentials, { messages });
  }
}

/**
 * 接在对话系统提示后面的「这张照片」一段。
 *
 * ⚠️ **第一句必须说清楚这一轮有没有图。** 不说的话，模型会以为自己还在看图，
 * 于是编出画面里的细节去回答 —— 那正是 `01 §9` 最不能容忍的那种编造
 * （也是字幕那条路反复摔过的坑：滑成图注 / 滑成抒情）。
 *
 * 第一轮之后没有图，就给**上一次看它的结果**（`PhotoAnalysis.payload`）——
 * 那是同一个模型写的，比让它凭上下文猜可靠得多。
 */
function photoContext(payloadRaw: string | null, withImage: boolean): string {
  const lines: string[] = [
    withImage
      ? "这一轮你能看到照片本身。"
      : "这一轮**看不到照片**，只能靠下面这段你之前看它时记下的内容。不要描述你没见过的细节，不知道就说不知道。",
  ];

  if (payloadRaw) {
    try {
      const p = JSON.parse(payloadRaw) as PhotoAnalysisPayload;
      const noted: string[] = [];
      if (p.description) noted.push(`画面里客观有什么：${p.description}`);
      if (p.people?.length) noted.push(`人：${p.people.join("、")}`);
      if (p.objects?.length) noted.push(`物件：${p.objects.join("、")}`);
      if (p.events?.length) noted.push(`可能发生：${p.events.join("、")}`);
      if (p.uncertainties?.length) {
        noted.push(`当时就没把握：${p.uncertainties.join("、")}`);
      }
      if (noted.length) {
        lines.push("", "你之前记下的：", ...noted.map((l) => `- ${l}`));
        /*
         * ⚠️ 这句话是必需的。不加的话模型会把这个内部说法讲给用户听 ——
         * 实测出现过「记下的内容里没有这一条」，而用户根本不知道有什么
         * 「记下的内容」。**这是提示词的措辞漏到对话里**，不是模型自己编的。
         */
        lines.push(
          "",
          "（以上都是你自己知道的，不要向用户提起它的来源，也不要复述这份清单。）",
        );
      }
    } catch {
      // payload 坏了就当没有 —— 它只是上下文，不该让这一轮对话失败
    }
  }

  return `\n\n${lines.join("\n")}`;
}

/**
 * 输出后过滤（`09 §20`）—— 和字幕那条路同一套判据，但**不解析 JSON**。
 *
 * 违反语气规范就带着提示重来一次；还是不行就**确定性**地净化 + 截断，
 * 不指望模型听话（`09 §20` 的原话）。
 *
 * 净化之后什么都不剩的话**抛错**，不回一句万能的客套 ——
 * 那种句子对任何照片、任何对话都成立，正是这个产品最不想要的东西
 * （`01 §9`：AI 不替用户定义这段记忆是什么）。
 */
async function guardReply(
  credentials: AiCredentials,
  messages: ChatMessage[],
  raw: string,
): Promise<string> {
  let text = raw.trim();
  const violations = findToneViolations(text);

  if (violations.length > 0) {
    try {
      text = (
        await chatCompletion(credentials, {
          messages: [
            ...messages,
            { role: "assistant", content: text },
            {
              role: "user",
              content: `刚才那句有问题：${violations.join("；")}。请重说一遍，仍然只回应我说的事。`,
            },
          ],
        })
      ).trim();
    } catch {
      // 重试失败就用第一版。带一点瑕疵的一句，也比什么都没有强
    }
  }

  // 4 句是硬上限（§11 说默认 1–3 句、最多 4 段），截断是兜底不是目标
  const cleaned = limitSentences(scrub(text), 4).trim();
  if (!cleaned) {
    throw new ApiError("AI_UPSTREAM_FAILED", "AI 没说出什么，再试一次");
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// 随笔小记（Round 8 后半）
// ---------------------------------------------------------------------------

/**
 * 发给模型的对话上限。
 *
 * 这个上限与 `HISTORY_LIMIT` 不是一回事：那个管的是**对话上下文**（最近 20 条
 * 够接住话头），这里管的是**素材** —— 一篇随笔小记要从整段对话里取事实，
 * 掐掉开头就等于丢掉最早说的那些。
 *
 * 单张照片的对话天然有界，所以给到 100；真超了也只是极端情况下的兜底。
 *
 * ⚠️ 与 `09 §17`「不把整个用户历史发送给模型」不冲突：那条说的是**所有照片**的
 * 历史。这里是**当前这一张**的对话。
 */
const NOTE_MATERIAL_LIMIT = 100;

/**
 * 把这段对话收成一篇随笔小记（Round 8 后半）。
 *
 * 用户按那颗笔时调用。它与 `runConversationReply` 有三处不同，每一处都有理由：
 *
 * 1. **输出走 JSON。** `09 §12` 要的是一篇正文加两层证据（`factsUsed` /
 *    `inferences`）——「哪些是他说的、哪些是我猜的」必须分得开，那是 `09 §6`
 *    证据模型在这条路上的落点
 * 2. **它自己判断这一遍是起稿还是润色**（看有没有现存那一行），不看客户端传
 *    什么 —— 少一个得由前端维护、还可能过期的参数
 * 3. **存下来再返回。** 用户按的那一下要的是**一篇成文**，不是一次建议；
 *    存下来他就能直接在面板里改
 *
 * 这里**不发原图** —— 那笔钱 `runPhotoAnalysis` 已经花过，而它当时看懂了什么
 * 就存在 `PhotoAnalysis.payload` 里（`09 §17`：只发当前这一张也不需要重复发）。
 */
export async function runJournalNote(params: {
  photoId: string;
}): Promise<JournalNote> {
  const photo = await prisma.photo.findUnique({
    where: { id: params.photoId },
    select: { id: true },
  });
  if (!photo) throw new ApiError("NOT_FOUND", "照片不存在");

  const credentials = await getAiCredentials();
  if (!credentials) throw new ApiError("AI_UPSTREAM_FAILED", "AI 未配置");

  const [analysis, messages, existing] = await Promise.all([
    prisma.photoAnalysis.findUnique({
      where: { photoId: photo.id },
      select: { payload: true },
    }),
    listMessages(photo.id),
    getNote(photo.id),
  ]);

  /*
   * 一条用户说过的话都没有，就没有可整理的东西 —— 只有「AI 看过这张照片」。
   *
   * ⚠️ 这一条不是省一次调用，是守住 `01 §9`：**AI 不能替用户定义这段记忆
   * 是什么**。没有他自己的话，模型只能把看图结果改写成第一人称，
   * 那不是随笔小记，是伪造的记忆。
   */
  if (!messages.some((m) => m.role === "user")) {
    throw new ApiError("INVALID_INPUT", "还没有什么可整理的 —— 先说两句");
  }

  const material = messages.slice(-NOTE_MATERIAL_LIMIT);

  const messagesForModel: ChatMessage[] = [
    {
      role: "system",
      content:
        JOURNAL_SYSTEM +
        journalContext(analysis?.payload ?? null, existing?.content ?? null),
    },
    ...material.map((m) => ({ role: m.role, content: m.content })),
    // 最后这一句是必须的：对话最后一条多半是**用户说的**，不收尾的话模型
    // 会去回应那一句，而不是写这篇随笔小记
    { role: "user", content: "现在把上面这些收成一篇随笔小记，按 json 格式回答。" },
  ];

  return writeNoteFromModel(credentials, photo.id, messagesForModel);
}

/**
 * 接在随笔小记系统提示后面的**素材**。
 *
 * 与 `photoContext` 同一个做法（都拼在系统提示之后），但它不提醒「这一轮有
 * 没有图」—— 这条路本来就不发图。
 *
 * ⚠️ 与 `photoContext` 一样，末尾那句「不要向用户提起它的来源」是必需的：
 * 不加的话模型会把「你看这张照片时记下的」这种**内部说法**讲给用户听。
 */
function journalContext(
  payloadRaw: string | null,
  existingContent: string | null,
): string {
  const lines: string[] = [];

  if (payloadRaw) {
    try {
      const p = JSON.parse(payloadRaw) as PhotoAnalysisPayload;
      const noted: string[] = [];
      if (p.description) noted.push(`画面里客观有什么：${p.description}`);
      if (p.people?.length) noted.push(`人：${p.people.join("、")}`);
      if (p.objects?.length) noted.push(`物件：${p.objects.join("、")}`);
      if (p.events?.length) noted.push(`可能发生：${p.events.join("、")}`);
      if (p.uncertainties?.length) {
        noted.push(`当时就没把握：${p.uncertainties.join("、")}`);
      }
      if (noted.length) {
        lines.push("你看这张照片时记下的：", ...noted.map((l) => `- ${l}`));
        lines.push(
          "",
          "（这些是你自己知道的，不要向用户提起它的来源，也不要复述这份清单。）",
        );
      }
    } catch {
      // payload 坏了就当没有 —— 它只是素材，不该让这一遍失败
    }
  }

  if (existingContent) {
    lines.push(
      "",
      "下面是这篇随笔小记的**现稿**（用户改过）：",
      "",
      existingContent,
      "",
      "保住他的措辞，你只把新聊到的织进去。不要重写。",
    );
  }

  return lines.length ? `\n\n${lines.join("\n")}` : "";
}

/** 调模型 → 校验 → 语气守卫 → 落库。抽出来是为了「重生成一次」能复用。 */
async function writeNoteFromModel(
  credentials: AiCredentials,
  photoId: string,
  messagesForModel: ChatMessage[],
): Promise<JournalNote> {
  let lastProblem = "格式不正确";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const withHint =
      attempt === 0
        ? messagesForModel
        : messagesForModel.map((m, i) =>
            i === messagesForModel.length - 1
              ? {
                  ...m,
                  content: `${String(m.content)}\n\n上一次的 json ${lastProblem}。`,
                }
              : m,
          );

    let raw: string;
    try {
      raw = await chatCompletion(credentials, { messages: withHint, json: true });
    } catch (error) {
      if (attempt === 0) {
        lastProblem = "没解析出来";
        continue;
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = parseJsonObject(raw);
    } catch {
      lastProblem = "不是合法的 json";
      continue;
    }

    const obj = parsed as Record<string, unknown>;
    if (typeof obj.content !== "string" || !obj.content.trim()) {
      lastProblem = "缺少 content";
      continue;
    }

    const content = guardNote(obj.content);
    if (!content) {
      lastProblem = "content 是空的";
      continue;
    }

    const saved = await saveNote({ photoId, content });
    // saveNote 在正文为空时返回 null，而上面已经挡掉空了 —— 这里的兜底只是防御
    if (!saved) throw new ApiError("AI_UPSTREAM_FAILED", "没能把它存下来");
    return saved;
  }

  throw new ApiError("AI_UPSTREAM_FAILED", "AI 没写出可用的东西");
}

/**
 * 输出后过滤（`09 §20` 第 2 层）—— 和另外两条路同一套判据，但**不截句**。
 *
 * ⚠️ 不截句是有意的：字幕有「最多两句」的硬约束（`09 §21.6`），随笔小记没有 ——
 * 它是随笔，`aiPrompt` 里已经写了「宁短勿长」，再在外面按句数砍会把一篇
 * 收在最后一句的话砍掉。
 *
 * 净化之后什么都不剩就返回空串，让调用方重试。
 */
function guardNote(raw: string): string {
  const violations = findToneViolations(raw);
  // 排他性表述改不掉（机械替换会改变整句意思），而这篇是要留下来的文字：
  // 宁可让调用方重生成一次
  if (violations.some((v) => v.startsWith("含排他性表述"))) return "";
  return scrub(raw).trim();
}
