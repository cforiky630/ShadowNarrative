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

          {/*
            ⚠️ **照片会发给模型服务商这件事，写在这两句话里，不另起一段。**

            `12 §5` / `09 §21.2` 要的「界面上必须告知照片会被发送」仍然成立 ——
            只是它现在说的是**这个开关的行为**，而不是一段免责声明。

            2026-10-10 之前这里另有一段「无论开关怎么设，照片都会离开这台机器」。
            用户否掉了：「硬性要求和界面无关、写这些干啥」。那句和上面这句
            摆在一起是**自相矛盾**的 —— 上面说「开才会发」、下面说「怎么设都会
            离开」，读起来像法律声明，不像界面。

            判据：界面上的字按「**用户在这里要读什么**」定，不按「文档要求
            我们披露什么」定。事实照旧说全（去了第三方），只是不再单开一段。
          */}
          <p className="text-meta mt-4 text-text-primary/45">
            {view.autoAnalyze
              ? "上传后照片会自动发给模型服务商分析，字幕随后浮现。"
              : "关掉之后，照片只在你点「看一眼」时才发给模型服务商。"}
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

        {/*
          ⚠️ 这里原本还有一个「本机」小节，讲 `SN_HOST` 默认只监听 127.0.0.1。
          2026-10-10 删掉了。

          理由不是那句话不重要，而是**它和这个面板无关**：面板上没有任何东西
          能改监听地址，它是 `17 §6` 的一个环境变量。用户的原话是
          「硬性要求和界面无关、写这些干啥」。

          它该待的地方是**读得到那个变量地方** —— `17 §6` 已经把风险写全了，
          真去改 `0.0.0.0` 的人一定是在改环境变量，也一定会读到那一节。
          摆在设置面板里，它只是一段谁也动不了的告示。
        */}
      </div>
    </div>
  );
}
