import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveDataDir, resolveSecretsPath } from "./dataDir";

/**
 * 本机凭据与密钥管理。
 *
 * 规格：17-SELF_HOSTING.md §3 §4、18-BACKUP_PROTOCOL.md §7、12-SECURITY_PRIVACY.md §10
 *
 * AI 凭据与备份令牌持久化在 `<数据目录>/secrets.json`，严格不进入数据库与运行日志。
 *
 * ── 凭据管理原则 ──────────────────────────────────────────────────────
 * 1. 单一凭据来源：
 *    所有运行时 AI 凭据（API Key / Base URL / Model）统一来源于 `secrets.json`，
 *    不设环境变量回退逻辑，确保 UI 状态与底层配置完全一致。
 * 2. 最小权限文件存储：
 *    `secrets.json` 写入时设置文件权限为 `0600`（仅当前系统用户可读写）。
 * 3. 敏感信息防泄露：
 *    对外 API（如设置面板读取接口）仅暴露「是否已配置」的布尔状态，绝不回传 Key 明文。
 */

export interface Secrets {
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
  backupEndpoint?: string;
  backupToken?: string;
}

/** 没配 base URL / 模型时用哪个。写在 `secrets.json` 里的值优先。 */
const DEFAULT_AI_BASE_URL = "https://api.deepseek.com";
const DEFAULT_AI_MODEL = "deepseek-flash";

/** 读 secrets.json。文件不存在或坏掉都返回空对象 —— 不该让应用起不来。 */
export async function readSecrets(): Promise<Secrets> {
  try {
    const raw = await readFile(resolveSecretsPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Secrets;
  } catch {
    return {};
  }
}

export interface AiCredentials {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * 取 AI 凭据。没配 key 就返回 null —— 调用方据此降级，
 * 而不是拿一个空 key 去撞上游。
 *
 * 来源**只有** `secrets.json` 一处（见文件头）。
 */
export async function getAiCredentials(): Promise<AiCredentials | null> {
  const secrets = await readSecrets();
  const apiKey = secrets.aiApiKey?.trim();
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: secrets.aiBaseUrl?.trim() || DEFAULT_AI_BASE_URL,
    model: secrets.aiModel?.trim() || DEFAULT_AI_MODEL,
  };
}

/**
 * 设置卡读取的公共 AI 状态：仅返回配置状态，不泄露 Key 明文（12-SECURITY_PRIVACY.md §10）。
 */
export async function getAiPublicInfo(): Promise<{
  configured: boolean;
  baseUrl: string;
  model: string;
}> {
  const secrets = await readSecrets();

  return {
    configured: Boolean(secrets.aiApiKey?.trim()),
    baseUrl: secrets.aiBaseUrl?.trim() || DEFAULT_AI_BASE_URL,
    model: secrets.aiModel?.trim() || DEFAULT_AI_MODEL,
  };
}

/**
 * 写入 AI key。空字符串表示**清除**。
 *
 * 读-改-写而不是整份覆盖：secrets.json 里还有备份令牌与端到端加密密钥
 * （17 §3、18 §7），整份覆盖会把它们抹掉。
 */
export async function setAiApiKey(apiKey: string): Promise<void> {
  const current = await readSecrets();
  const trimmed = apiKey.trim();

  const next: Secrets = { ...current };
  if (trimmed) {
    next.aiApiKey = trimmed;
  } else {
    delete next.aiApiKey;
  }

  await writeSecrets(next);
}

/**
 * 落盘 secrets.json（17 §3：0600，只有本用户可读）。
 *
 * 同时保证数据目录存在 —— 首次运行时设置页可能先于 `npm run setup` 被打开。
 */
async function writeSecrets(secrets: Secrets): Promise<void> {
  await mkdir(resolveDataDir(), { recursive: true });
  await writeFile(
    resolveSecretsPath(),
    `${JSON.stringify(secrets, null, 2)}\n`,
    { mode: 0o600 },
  );
}
