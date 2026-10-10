import { connection } from "next/server";
import { ApiError, failFrom, ok } from "@/lib/apiResponse";
import { getAiPublicInfo, setAiApiKey } from "@/lib/secrets";
import type { SettingsView } from "@/types";

/**
 * 设置。
 *
 * 规格：07-UI_PAGE_SPECS.md §11、12 §5、17 §4 §6
 *
 * 两条边界：
 *   1. **凭据不进数据库**（17 §4）。AI key 只写 `secrets.json` ——
 *      它是这个 handler 现在**唯一**写的东西
 *   2. **key 永远不回传**。这里只有 `aiKeyConfigured` 布尔值。
 *      能回传就说明它出现在某个响应里过 —— 那它就会进日志、进浏览器缓存、进抓包。
 *
 * ⚠️ **2026-10-10：`autoAnalyze` 没了。** 用户定「自动分析只能开」，
 * 于是开关、`UserSettings.autoAnalyze` 那一列、这条路由的 PATCH 分支一起删掉。
 *
 * userId 照旧只由服务端解析（12 §4）。
 */

async function readView(): Promise<SettingsView> {
  const ai = await getAiPublicInfo();

  return {
    aiKeyConfigured: ai.configured,
    secretsPath: ai.secretsPath,
    aiBaseUrl: ai.baseUrl,
    aiModel: ai.model,
  };
}

export async function GET() {
  /**
   * ⚠️ 必须在 try 之外，见 api/timeline/route.ts 的详细说明 —— 对这条路由
   * 尤其要紧：`connection()` 是**靠抛出**终止预渲染的，那个抛出不是业务错误，
   * 被 catch 吞掉就等于把终止信号当成了失败。
   *
   * ⚠️ 2026-10-10 之后这条路由**不再碰数据库**（删掉 `autoAnalyze` 之后，
   * 它只读 `secrets.json`），所以 timeline 那条「better-sqlite3 同步驱动会在
   * 预渲染时真的查库」的理由在这里不适用了。
   *
   * 但 `connection()` 仍然要留：**读运行时文件一样不能发生在预渲染期**。
   * 这里还比别处更隐蔽一层 —— 读 secrets.json 的失败被 `readSecrets` 吞掉，
   * 所以**不会报错**，只会静默固化一个构建时的设置快照。
   */
  await connection();

  try {
    return ok(await readView());
  } catch (error) {
    return failFrom(error, "api/settings GET");
  }
}

/** 只允许改 AI key。其余字段一律忽略，不做静默透传。 */
export async function PATCH(request: Request) {
  try {
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

    if (!("aiApiKey" in input)) {
      throw new ApiError("INVALID_INPUT", "没有可更新的字段");
    }
    if (typeof input.aiApiKey !== "string") {
      throw new ApiError("INVALID_INPUT", "aiApiKey 必须是字符串");
    }

    const key = input.aiApiKey.trim();
    // 含空白的 key 一定不是 key。更重要的一点：它会拼进
    // `Authorization: Bearer <key>` 这个请求头 —— 里面有一个换行就是 header 注入。
    if (key && /\s/.test(key)) {
      throw new ApiError("INVALID_INPUT", "API key 里不该有空白字符");
    }
    // 空字符串 = 清除
    await setAiApiKey(key);

    return ok(await readView());
  } catch (error) {
    return failFrom(error, "api/settings PATCH");
  }
}
