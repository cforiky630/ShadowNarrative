"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { JournalNote } from "@/types";

/**
 * 随笔小记 —— `PhotoOverlay` 里的**那一面**（`07-UI_PAGE_SPECS.md` §5）。
 *
 * 没有遮罩、没有居中、没有 Esc，那些都归外壳（与 `ConversationPanel` 同一条）。
 * 这里只管「日期 + 可编辑的正文」。
 *
 * ── 版式 ────────────────────────────────────────────────────────────
 *
 * ```text
 * 2025 · 09 · 28
 *
 * （正文）
 * ```
 *
 * **日期就是它的标识。** `07 §5` 定的版式是「日期 + 正文」—— 没有标题。
 * 这也和它的定性一致：用户说它是**轻**的东西，不是长文日志。
 *
 * ── 为什么没有「保存」按钮 ──────────────────────────────────────────
 *
 * 打字停下 ~0.7 秒自动存，卸载时把没存完的那一版再送一次。
 *
 * 一开始的设计是「失焦保存 + 有改动才出现保存键」，那样有个洞：**Esc 关掉时
 * 组件是卸载的，`blur` 根本不会触发** —— 最后一句就没了。要么让外壳去调它的
 * 保存函数（多一层 ref 传递），要么自动存。
 *
 * 自动存更简单，也更符合它的定性：一个轻的东西不该让用户惦记「我存了没有」。
 * 界面上那行状态字（保存中 / 已保存）是全部的存在感。
 */

/** 打字停下多久就存。太短会在输入法组字时反复发请求，太长会丢掉最后一口气 */
const SAVE_DEBOUNCE_MS = 700;

interface NotePanelProps {
  photoId: string;
  /** `2025 · 09 · 28`（`02 §4` 的日期格式）。null = 这张照片没有时间 */
  date: string | null;
  note: JournalNote | null;
  /**
   * 存完之后把新的（或 null）交回外壳。
   *
   * ⚠️ 外壳要靠它决定**左下角那个本子图标在不在** —— 正文被清空 = 这条
   * 随笔小记没了 = 那个入口也该消失（用户定的：一个点开是空白页的入口
   * 就是「点不动的东西」）。
   */
  onSaved: (note: JournalNote | null) => void;
}

export function NotePanel({ photoId, date, note, onSaved }: NotePanelProps) {
  const [draft, setDraft] = useState(note?.content ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  /** 已经落库的那一版。与 `draft` 不同就是「有没存的东西」 */
  const savedRef = useRef(note?.content ?? "");
  /** 落库那一版的 `sourceVersion`。带上它做并发检测（`08 §8`） */
  const versionRef = useRef<number | undefined>(note?.sourceVersion);
  /** 还没存下去的那一版。卸载时靠它把最后一次改动送出去 */
  const pending = useRef<string | null>(null);

  useEffect(() => {
    const next = draft.trim();
    pending.current = next === savedRef.current.trim() ? null : draft;
    if (pending.current === null) return;

    const t = setTimeout(() => {
      void (async () => {
        setState("saving");
        setError(null);
        try {
          const saved = await patchNote(photoId, draft, versionRef.current);
          savedRef.current = saved?.content ?? "";
          versionRef.current = saved?.sourceVersion;
          pending.current = null;
          setState("saved");
          onSaved(saved);
        } catch (err) {
          setState("idle");
          setError(err instanceof Error ? err.message : "没能保存");
        }
      })();
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [draft, photoId, onSaved]);

  useEffect(
    () => () => {
      /*
       * 卸载时把没存完的那一版再送一次 —— **fire-and-forget**。
       *
       * 组件已经走了，但请求会照常跑完（浏览器不会因为组件卸载就取消一个
       * 已经发出的 fetch），所以最后一句不会丢。
       *
       * ⚠️ 这一趟**不带 `sourceVersion`**：它是「我刚打的字」的兜底，
       * 而它跑的时候组件已经没了，409 报给谁看都不是。这里要的是
       * last-write-wins —— 用户自己最后那几下按键本来就该压过一切。
       */
      if (pending.current !== null) void patchNote(photoId, pending.current);
    },
    [photoId],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: "spring", stiffness: 180, damping: 26 }}
      /*
        ⚠️ **`min-h-[50dvh]` 是必须的，不是留白。**
        `<textarea>` 默认只有 **2 行**高，而这一列的高度是内容撑起来的 ——
        `flex-1` 在没有剩余空间时什么也不做，于是记事区就只有两行
        （用户 2026-10-10 一眼看出来的：「笔记显示就两行不合适吧」）。
        给列一个下限，`flex-1` 才有东西可以撑开。
        `07 §5` 要的「大留白」也正好落在这个区间里。
      */
      className="flex max-h-[78dvh] min-h-[50dvh] w-full min-w-0 flex-1 flex-col"
    >
      {/* 日期当标题（`07 §5`）。低存在感 —— 它是标识，不是内容 */}
      {date && <p className="text-meta shrink-0 text-text-primary/45">{date}</p>}

      {/*
        正文。**样式做成和正文一模一样** —— 无边框、无背景块、无控件感。
        `02 §13` 说表单控件只在设置卡里出现，而这里它不是控件，是内容本身：
        用户要看到的是「我写的那段字」，不是「一个输入框里的字」。
      */}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        // 空的时候自动聚焦：那是「来写点什么」的邀请；已经有字就不抢焦点，
        // 免得一打开就跳出个光标像是要改它
        autoFocus={!note?.content}
        spellCheck={false}
        placeholder="写点什么"
        className="text-body sn-noscrollbar mt-5 min-h-0 flex-1 resize-none bg-transparent text-text-primary/90 outline-none placeholder:text-text-primary/20"
      />

      {/* 状态与出错。都极淡 —— 一个轻的东西不该为存盘这件事拉起存在感 */}
      <div className="mt-6 flex shrink-0 items-baseline gap-4">
        {error ? (
          <span className="text-micro text-text-primary/60" role="status">
            {error}
          </span>
        ) : (
          state !== "idle" && (
            <span className="text-micro text-text-primary/25">
              {state === "saving" ? "保存中…" : "已保存"}
            </span>
          )
        )}
      </div>
    </motion.div>
  );
}

/**
 * 写一次后台。放在模块层而不是组件里，是为了卸载那次兜底也能用 ——
 * 那时候组件的 state 已经没了。
 *
 * 不带 `sourceVersion` 就是不校验版本（见上面卸载那段注释）。
 */
async function patchNote(
  photoId: string,
  content: string,
  sourceVersion?: number,
): Promise<JournalNote | null> {
  const res = await fetch(`/api/photos/${photoId}/journal`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      ...(sourceVersion === undefined ? {} : { sourceVersion }),
    }),
  });

  const body = (await res.json().catch(() => null)) as {
    data?: JournalNote | null;
    error?: { message?: string };
  } | null;

  if (!res.ok) throw new Error(body?.error?.message ?? "没能保存");
  return body?.data ?? null;
}
