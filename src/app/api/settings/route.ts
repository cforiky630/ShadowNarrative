import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import { getAiPublicInfo, setAiApiKey } from "@/lib/secrets";
import { getLocalUserId, getSettings, setAutoAnalyze } from "@/services/userService";
import type { SettingsView } from "@/types";

/**
 * 设置。
 *
 * 规格：07-UI_PAGE_SPECS.md §11、09 §21.2、12 §5、17 §4 §6
 *
 * 两条边界：
 *   1. **凭据不进数据库**（17 §4）。`autoAnalyze` 是业务设置，存 UserSettings；
 *      AI key 只写 `secrets.json`。这也是分成两条写入路径的原因
 *   2. **key 永远不回传**。这里只有 `aiKeyConfigured` 布尔值。
 *      能回传就说明它出现在某个响应里过 —— 那它就会进日志、进浏览器缓存、进抓包。
 *
 * userId 照旧只由服务端解析（12 §4）。
 */

async function readView(userId: string): Promise<SettingsView> {
  const [settings, ai] = await Promise.all([
    getSettings(userId),
    getAiPublicInfo(),
  ]);

  return {
    autoAnalyze: settings.autoAnalyze,
    aiKeyConfigured: ai.configured,
    aiKeyFromEnv: ai.fromEnv,
    aiBaseUrl: ai.baseUrl,
    aiModel: ai.model,
  };
}

export async function GET() {
  try {
    return ok(await readView(await getLocalUserId()));
  } catch (error) {
    return failFrom(error, "api/settings GET");
  }
}

/** 只允许改这两样。其余字段一律忽略，不做静默透传。 */
export async function PATCH(request: Request) {
  try {
    const userId = await getLocalUserId();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_INPUT", "请求体必须是 JSON");
    }
    if (typeof body !== "object" || body === null) {
      throw new ApiError("INVALID_INPUT", "请求体必须是对象");
    }

    const input = body as Record<string, unknown>;

    if ("autoAnalyze" in input) {
      if (typeof input.autoAnalyze !== "boolean") {
        throw new ApiError("INVALID_INPUT", "autoAnalyze 必须是布尔值");
      }
      await setAutoAnalyze(userId, input.autoAnalyze);
    }

    if ("aiApiKey" in input) {
      if (typeof input.aiApiKey !== "string") {
        throw new ApiError("INVALID_INPUT", "aiApiKey 必须是字符串");
      }
      const key = input.aiApiKey.trim();
      // 含空白的 key 一定不是 key。更重要的一点：它会拼进
      // `Authorization: Bearer <key>` 这个请求头 —— 里面有一个换行就是header 注入。
      if (key && /\s/.test(key)) {
        throw new ApiError("INVALID_INPUT", "API key 里不该有空白字符");
      }
      // 空字符串 = 清除
      await setAiApiKey(key);
    }

    if (!("autoAnalyze" in input) && !("aiApiKey" in input)) {
      throw new ApiError("INVALID_INPUT", "没有可更新的字段");
    }

    return ok(await readView(userId));
  } catch (error) {
    return failFrom(error, "api/settings PATCH");
  }
}
