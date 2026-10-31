import type { SourceRef } from "@/types";

/**
 * 消息里的证据来源（`09 §6`）。
 *
 * 库里存的是**应用层写进去的 JSON 字符串**（SQLite 的 Json 支持有限，`08 §2`）。
 * 解析不了说明数据坏了，但不该让整个响应失败 —— 证据来源缺失，比看不到
 * 字幕 / 对话轻得多。
 *
 * ⚠️ **只有这一份。** `conversationService` 与 `photoService` 曾各抄一遍，
 * 逻辑一样、注释不一样；再分头改就一定会漂。
 */
export function parseSourceRefs(raw: string | null): SourceRef[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SourceRef[]) : null;
  } catch {
    return null;
  }
}
