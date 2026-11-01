"use client";

import { useCallback, useState } from "react";
import type { SettingsView } from "@/types";

/**
 * 设置的内容。
 *
 * 规格：07-UI_PAGE_SPECS.md §11
 *
 * 设置面板表单内容组件，挂载于 DockCard 浮卡外壳内，由左下角胶囊控制坞触发。
 *
 * ⚠️ **界面上的字只留「用户在这里要读什么」。** 见 `07 §11.3` ——
 * 那一节记着判据和两处「为什么」，免得又把文档层面的披露要求搬回来。
 *
 * 视觉：`02-DESIGN_SYSTEM.md` §13 说主要操作用 text link / subtle pill，
 * §14 的玻璃盒清单里**没有**设置，`07 §11.5` 要求无卡片、无边框、无背景块。
 * 所以这里全是文字，靠透明度分层 —— 和产品其余部分同一套语言。
 *
 * 唯一比别处多的东西是输入框。按 §11.5：表单控件只在这里出现，不外溢到体验里。
 */

interface SettingsFormProps {
  initial: SettingsView;
}

export function SettingsForm({ initial }: SettingsFormProps) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(payload?.error?.message ?? "保存失败");
        }
        const payload = (await res.json()) as { data: SettingsView };
        setView(payload.data);
        return true;
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "保存失败");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const saveKey = useCallback(async () => {
    const ok = await patch({ aiApiKey: keyDraft });
    if (ok) {
      setKeyDraft("");
      setEditingKey(false);
    }
  }, [keyDraft, patch]);

  const clearKey = useCallback(async () => {
    const ok = await patch({ aiApiKey: "" });
    if (ok) setConfirmClear(false);
  }, [patch]);

  return (
    <div className="px-8 pb-12">
      <div className="w-full">
        {notice && (
          <p className="text-meta mt-8 text-text-primary/70" role="status">
            {notice}
          </p>
        )}

        {/* API key */}
        <div className="mt-2 flex items-baseline justify-between gap-8">
          <span className="text-body text-text-primary/85">API Key</span>

          <span className="flex shrink-0 items-baseline gap-4">
            <span className="text-meta text-text-primary/45">
              {view.aiKeyConfigured ? "已配置" : "未配置"}
            </span>

            {!editingKey && (
              <button
                type="button"
                onClick={() => setEditingKey(true)}
                className="text-meta text-text-primary/45 underline-offset-4 hover:text-text-primary/85 hover:underline focus-visible:underline"
              >
                {view.aiKeyConfigured ? "Change" : "Configure"}
              </button>
            )}

            {view.aiKeyConfigured && !editingKey && !confirmClear && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="text-meta text-text-primary/45 underline-offset-4 hover:text-text-primary/85 hover:underline focus-visible:underline"
              >
                Clear
              </button>
            )}

            {confirmClear && (
              <button
                type="button"
                onClick={clearKey}
                disabled={busy}
                aria-live="polite"
                className="text-meta text-text-primary/95 underline-offset-4 hover:underline disabled:opacity-40"
              >
                Confirm Clear
              </button>
            )}
          </span>
        </div>

        {editingKey && (
          <div className="mt-6">
            <label className="text-meta block text-text-primary/45" htmlFor="ai-key">
              输入 API Key，保存后自动隐藏
            </label>
            <input
              id="ai-key"
              type="password"
              value={keyDraft}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setKeyDraft(e.target.value)}
              className="text-body mt-3 w-full border-0 border-b border-border-subtle bg-transparent pb-2 text-text-primary/95 outline-none focus:border-text-primary/40"
            />
            <div className="mt-4 flex items-baseline gap-5">
              <button
                type="button"
                onClick={saveKey}
                disabled={busy || !keyDraft.trim()}
                className="text-meta text-text-primary/85 underline-offset-4 hover:underline disabled:opacity-30"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingKey(false);
                  setKeyDraft("");
                }}
                className="text-meta text-text-primary/45 underline-offset-4 hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className="text-meta mt-6 text-text-primary/45">
          密钥仅保存在本地 secrets.json，不写入数据库或日志。
        </p>
        <p className="text-meta mt-2 text-text-primary/30">
          当前模型：{view.aiModel}（{view.aiBaseUrl}）
        </p>
      </div>
    </div>
  );
}
