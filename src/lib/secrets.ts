import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveDataDir, resolveSecretsPath } from "./dataDir";

/**
 * 本机凭据。
 *
 * 规格：17-SELF_HOSTING.md §3 §4、18-BACKUP_PROTOCOL.md §7、12-SECURITY_PRIVACY.md §10
 *
 * AI key 与备份令牌存在 `<数据目录>/secrets.json`，**不进数据库、不进日志**。
 * 这在本架构下是必然的：服务端就是用户的机器，不存在「平台替你付钱」的模式，
 * 也没有中间方能看到你的 key（17 §4）。
 *
 * 环境变量是**开发期的回退**。两者都设置时以 secrets.json 为准 ——
 * 它才是设置页写入的位置（17 §4），也才是自托管用户的配置入口。
 */

export interface Secrets {
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
  backupEndpoint?: string;
  backupToken?: string;
}

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

/** secrets.json 里的非空值优先，其次环境变量。 */
function pick(secretValue: string | undefined, envName: string): string | undefined {
  const fromSecrets = secretValue?.trim();
  if (fromSecrets) return fromSecrets;
  const fromEnv = process.env[envName]?.trim();
  return fromEnv || undefined;
}

export interface AiCredentials {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * 取 AI 凭据。没配 key 就返回 null —— 调用方据此降级，
 * 而不是拿一个空 key 去撞上游。
 */
export async function getAiCredentials(): Promise<AiCredentials | null> {
  const secrets = await readSecrets();
  const apiKey = pick(secrets.aiApiKey, "AI_API_KEY");
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: pick(secrets.aiBaseUrl, "AI_BASE_URL") ?? "https://api.deepseek.com",
    model: pick(secrets.aiModel, "AI_MODEL") ?? "deepseek-flash",
  };
}

/**
 * 设置页需要的 AI 信息：**只回答「配没配」，不回传 key 本身**。
 *
 * 不该拿到明文 —— 能显示就说明它出现在某个响应里过，那它就会进日志、
 * 进浏览器缓存、进任何一次抓包（12 §10）。
 *
 * `configured` 与 `fromEnv` 必须分开报：设置页只能改 `secrets.json`，
 * 而环境变量是另一条回退路径。合成一个布尔值的话，用户点了「清除」会发现
 * 什么都没变（环境变量还在供应），看起来像坏了。
 */
export async function getAiPublicInfo(): Promise<{
  configured: boolean;
  fromEnv: boolean;
  baseUrl: string;
  model: string;
}> {
  const secrets = await readSecrets();
  const fromSecrets = Boolean(secrets.aiApiKey?.trim());

  return {
    configured: fromSecrets,
    fromEnv: !fromSecrets && Boolean(process.env.AI_API_KEY?.trim()),
    baseUrl: pick(secrets.aiBaseUrl, "AI_BASE_URL") ?? "https://api.deepseek.com",
    model: pick(secrets.aiModel, "AI_MODEL") ?? "deepseek-flash",
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
