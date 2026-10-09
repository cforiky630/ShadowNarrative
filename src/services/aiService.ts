import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/apiResponse";
import { getAiCredentials, type AiCredentials } from "@/lib/secrets";
import type { Claim, PhotoAnalysisPayload, SourceRef } from "@/types";
import { readStoredFile } from "./mediaService";
import { recordSubtitle } from "./conversationService";
import { SYSTEM_PROMPT, USER_INSTRUCTION } from "./aiPrompt";

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

/**
 * 调一次 chat/completions，返回正文。
 *
 * 失败一律抛 `ApiError("AI_UPSTREAM_FAILED")`（08 §5 的 502）。
 * **错误信息里绝不带上游响应原文或 key**（12 §10）。
 */
async function callModel(
  credentials: AiCredentials,
  params: { imageDataUrl: string; extraHint?: string },
): Promise<string> {
  const { apiKey, baseUrl, model } = credentials;

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
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        max_tokens: MAX_TOKENS,
        effort: EFFORT,
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
