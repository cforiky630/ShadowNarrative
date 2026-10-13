"use client";

import { useCallback, useState } from "react";
import type { SettingsView } from "@/types";

/**
 * 设置的内容。
 *
 * 规格：07-UI_PAGE_SPECS.md §11
 *
 * ⚠️ **它不是一个页面，也不是一张卡。** 2026-10-10 用户要求「设置做成组件，
 * 不用单页」，之后又把它和粒子参数一起收进了左下角那颗胶囊（`BottomDock`）。
 * 所以这里只渲染内容本身 —— 没有 `<main>`、没有卡片外壳、没有开合动画，
 * 那些是 `SettingsPanel`（外壳是 `DockCard`）的事。
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

        {/*
          ⚠️ **这里原本有一个 `AI` 小节标题、一句「上传后照片会自动发给模型
          服务商分析」，更早还有一个「自动分析」开关。**

          2026-10-10 用户依次拿掉了它们：「自动分析只能开，直接去掉这个设置」
          →「AI 和下面那句话都去掉」。

          去掉的**不是「AI 这件事」**—— 下面三行说的全是它（API key、存在哪、
          当前用哪个模型）。去掉的是**一句陈述**：那句话说的事情，用户上传
          一张照片就知道了，摆在设置里只是每次打开都要重读一遍。

          于是 `12 §5` 那条「界面上必须告知照片会被发送给模型」在界面上
          **不再有落点**。那是用户的决定，不是遗漏 —— 规格里已经照改，
          见 `07 §11.3`。
        */}

        {/* --- API key --- */}
        <div className="mt-2 flex items-baseline justify-between gap-8">
          <span className="text-body text-text-primary/85">API key</span>

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
          `17 §4`：key 存 secrets.json，不进数据库、不进日志。

          用户 2026-10-10：「apikey 那里不提供默认的，说一下存在哪就行」，
          紧接着又补了一句「**那个路径显示相对路径吧，后面封装成 app**」。

          所以这里**不出现绝对路径**。绝对路径是这台机器的实现细节 ——
          `F:\...\.data\secrets.json` 封装成桌面 app 之后那个前缀就不成立了
          （数据目录会变成 `app.getPath('userData')`，见 `10` 的 Round 13）。
          服务端因此**也不再回传路径**，`SettingsView` 里那个 `secretsPath`
          一并删了 —— 传过去也只是为了显示，显示不了就不必传。

          留下的是「数据目录里的 secrets.json」，它对开发态和封装态**都成立**。

          环境变量那条回退也在同一天删了（见 `src/lib/secrets.ts` 的文件头），
          所以不再有「由环境变量提供」这个状态，也就不必再解释
          「点清除为什么没用」——那个反常正是两个来源造成的。
        */}
        <p className="text-meta mt-6 text-text-primary/45">
          存在数据目录里的 secrets.json，不进数据库、不进日志。
        </p>
        <p className="text-meta mt-2 text-text-primary/30">
          当前用 {view.aiModel}（{view.aiBaseUrl}）
        </p>

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
