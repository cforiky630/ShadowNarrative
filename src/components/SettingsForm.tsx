"use client";

import { useCallback, useState } from "react";
import type { SettingsView } from "@/types";

/**
 * 设置的内容。
 *
 * 规格：07-UI_PAGE_SPECS.md §11
 *
 * ⚠️ **它不再是一个页面。** 2026-10-10 用户要求「设置做成组件，不用单页」，
 * 现在装在 `SettingsPanel` 里、从右侧滑出，入口是右下角那颗悬浮的齿轮。
 * 所以这里只渲染内容本身 —— 没有 `<main>`、没有页头、没有最小高度，
 * 那些都是外壳（`SettingsPanel`）的事。
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
          throw new Error(payload?.error?.message ?? "没能保存");
        }
        const payload = (await res.json()) as { data: SettingsView };
        setView(payload.data);
        return true;
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "没能保存");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const toggleAutoAnalyze = useCallback(() => {
    // 乐观更新：这是个开关，等一个来回才动会显得卡
    setView((v) => ({ ...v, autoAnalyze: !v.autoAnalyze }));
    void patch({ autoAnalyze: !view.autoAnalyze });
  }, [patch, view.autoAnalyze]);

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

        {/* --- AI --- */}
        <section className="mt-16">
          <h2 className="text-micro text-text-primary/40">AI</h2>

          <div className="mt-8 flex items-baseline justify-between gap-8">
            <span className="text-body text-text-primary/85">自动分析</span>
            <button
              type="button"
              onClick={toggleAutoAnalyze}
              disabled={busy}
              aria-pressed={view.autoAnalyze}
              className="text-body shrink-0 text-text-primary/85 underline-offset-4 hover:underline focus-visible:underline disabled:opacity-40"
            >
              {view.autoAnalyze ? "开" : "关"}
            </button>
          </div>

          <p className="text-meta mt-4 text-text-primary/45">
            {view.autoAnalyze
              ? "上传后照片会自动发给模型分析，字幕随后浮现。"
              : "关掉之后，照片只在你点「看一眼」的时候才发出去。"}
          </p>

          {/*
            09 §21.2 与 12 §5 要求这句话必须出现在界面上，不能只活在文档里。
            它说的是一件开关改变不了的事，所以单独一段、比上面那句更重。

            2026-10-10 用户：「设置界面留一些必要的说明就行了」——
            原先后面还跟着「这是『服务端 AI』的本来面目，不是设置能改变的」，
            那是文档里的**推理**，不是用户要读的信息。去掉。
          */}
          <p className="text-meta mt-6 text-text-primary/55">
            无论开关怎么设，照片都会离开这台机器，发给模型服务商。
          </p>

          {/* --- API key --- */}
          <div className="mt-14 flex items-baseline justify-between gap-8">
            <span className="text-body text-text-primary/85">API key</span>

            <span className="flex shrink-0 items-baseline gap-4">
              <span className="text-meta text-text-primary/45">
                {view.aiKeyConfigured
                  ? "已配置"
                  : view.aiKeyFromEnv
                    ? "由环境变量提供"
                    : "未配置"}
              </span>

              {!editingKey && (
                <button
                  type="button"
                  onClick={() => setEditingKey(true)}
                  className="text-meta text-text-primary/45 underline-offset-4 hover:text-text-primary/85 hover:underline focus-visible:underline"
                >
                  {view.aiKeyConfigured ? "更换" : "填入"}
                </button>
              )}

              {view.aiKeyConfigured && !editingKey && !confirmClear && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="text-meta text-text-primary/45 underline-offset-4 hover:text-text-primary/85 hover:underline focus-visible:underline"
                >
                  清除
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
                  确认清除？
                </button>
              )}
            </span>
          </div>

          {editingKey && (
            <div className="mt-6">
              <label className="text-meta block text-text-primary/45" htmlFor="ai-key">
                粘贴 key，保存后不再显示
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
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingKey(false);
                    setKeyDraft("");
                  }}
                  className="text-meta text-text-primary/45 underline-offset-4 hover:underline"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/*
            环境变量那一份只在开发期出现。它**必须**说明「清除清不到它」——
            不说的话用户点「清除」会发现状态没变，看起来像坏了
            （`src/lib/secrets.ts` 的 `getAiPublicInfo` 把两者分开报，就是为了这个）。
          */}
          {view.aiKeyFromEnv && (
            <p className="text-meta mt-6 text-text-primary/45">
              这个 key 来自 .env.local 的 AI_API_KEY（开发期的回退）。
              这里填一个会覆盖它，「清除」清不到它。
            </p>
          )}

          {/*
            `17 §4`：key 存 secrets.json，不进数据库、不进日志。

            「服务端不回传 key、所以这里没有显示明文」那半句删了 ——
            它是那条规矩的**理由**，属于代码注释；而输入框上面那句
            「粘贴 key，保存后不再显示」已经把该让用户知道的说完了。
          */}
          <p className="text-meta mt-6 text-text-primary/45">
            存在本机 secrets.json，不进数据库、不进日志。
          </p>
          <p className="text-meta mt-2 text-text-primary/30">
            当前用 {view.aiModel}（{view.aiBaseUrl}）
          </p>
        </section>

        {/* --- 本机 --- */}
        <section className="mt-20">
          <h2 className="text-micro text-text-primary/40">本机</h2>
          {/*
            17 §6 要求这句话必须写在设置页里，不能只写在文档里。

            末句「真要局域网访问，请自己承担这个风险」删了（用户 2026-10-10：
            「设置界面留一些必要的说明就行了」）—— 前半句已经把风险说完了，
            那句只是重复。
          */}
          <p className="text-meta mt-8 text-text-primary/55">
            这个服务默认只监听 127.0.0.1。改成 0.0.0.0 等于把整个照片库暴露在
            局域网上 —— 它没有任何鉴权，谁连上都能看、都能删。
          </p>
        </section>
      </div>
    </div>
  );
}
