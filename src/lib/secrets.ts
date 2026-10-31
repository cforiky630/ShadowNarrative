import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolveDataDir, resolveSecretsPath } from "./dataDir";

/**
 * 本机凭据与密钥管理。
 *
 * 规格：17-SELF_HOSTING.md §3 §4、18-BACKUP_PROTOCOL.md §7、12-SECURITY_PRIVACY.md §10
 *
 * AI 凭据与备份令牌持久化在 `<数据目录>/secrets.json`，严格不进入数据库与运行日志。
 *
 * 凭据管理原则：
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
  const trimmed = apiKey.trim();

  /*
   * ⚠️ **读-改-写必须串行。** 设置卡与（将来的）备份配置都可能同时改这份
   * 文件，两个并发请求各自读到旧版本、各自写回，后写的会把先写的那个字段
   * 抹掉。队列在进程内保证一次只有一个「读 → 改 → 写」。
   */
  await updateSecrets((current) => {
    const next: Secrets = { ...current };
    if (trimmed) {
      next.aiApiKey = trimmed;
    } else {
      delete next.aiApiKey;
    }
    return next;
  });
}

/**
 * 写盘队列。一次只跑一个「读 → 改 → 写」。
 *
 * 队列本身不能因为某一次失败就断掉 —— 失败的那次把拒绝交给调用方，
 * 队列继续接下一单。
 */
let writeQueue: Promise<void> = Promise.resolve();

function updateSecrets(mutate: (current: Secrets) => Secrets): Promise<void> {
  const run = writeQueue.then(async () => {
    const current = await readSecrets();
    await writeSecretsAtomic(mutate(current));
  });
  writeQueue = run.catch(() => {});
  return run;
}

/**
 * 落盘 secrets.json（17 §3：0600，只有本用户可读）。
 *
 * ⚠️ **原子写。** 直接 `writeFile` 到目标文件时，进程在写一半崩掉会留下
 * 一份残缺 JSON；`readSecrets` 又会把坏文件吞成 `{}` —— 于是 AI key 与
 * 备份令牌静默消失，而界面上只是「未配置」。先写同目录临时文件再 `rename`
 * 覆盖：同目录内的 rename 是原子的（POSIX），Windows 的 MoveFileEx 也带
 * REPLACE_EXISTING，读者要么看到旧版本、要么看到新版本。
 *
 * 同时保证数据目录存在 —— 首次运行时设置页可能先于 `npm run setup` 被打开。
 */
async function writeSecretsAtomic(secrets: Secrets): Promise<void> {
  await mkdir(resolveDataDir(), { recursive: true });
  const target = resolveSecretsPath();
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(secrets, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(tmp, target);
}
