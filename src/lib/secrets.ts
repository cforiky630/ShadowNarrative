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
 * ⚠️ **2026-10-10：环境变量那条回退删了。**
 *
 * 用户的原话是「apikey 那里不提供默认的，说一下存在哪就行」。原先
 * `secrets.json` 的非空值优先、其次读 `AI_API_KEY` / `AI_BASE_URL` /
 * `AI_MODEL` —— 那是开发期图省事留下的第二条路。
 *
 * 问题不在于多一条路，而在于**它让设置卡说不出真话**：key 可以从两个地方来，
 * 卡片就得回答「配没配」「是不是来自环境变量」「点清除为什么没用」三个问题，
 * 而这三个问题里没有一个和用户要做的事有关。现在只有一个来源，
 * 卡片只回答一件事：**配好了没有**。
 *
 * 所以 `05 §7` 那句「base URL 与模型名都从 `secrets.json` 读」
 * 从今天起是字面意义上的事实，不再有一条没写出来的旁路。
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
 * 设置卡需要的 AI 信息：**只回答「配没配」，不回传 key 本身**。
 *
 * 不该拿到明文 —— 能显示就说明它出现在某个响应里过，那它就会进日志、
 * 进浏览器缓存、进任何一次抓包（12 §10）。
 *
 * ⚠️ 2026-10-10 删掉了 `fromEnv`。那个字段存在的唯一理由是「key 有两个
 * 来源，合成一个布尔值会让用户点『清除』时以为坏了」—— 现在只有一个来源，
 * 它就没有存在的意义了，见文件头。
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
