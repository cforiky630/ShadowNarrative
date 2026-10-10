"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, PenLine } from "lucide-react";
import { ConversationPanel } from "@/components/ConversationPanel";
import { NotePanel } from "@/components/NotePanel";
import type { JournalNote } from "@/types";

/**
 * 照片页的浮层 —— **一层遮罩，两面**。
 *
 * ── 两面 ────────────────────────────────────────────────────────────
 *
 * | 从哪进 | 落在哪一面 |
 * |---|---|
 * | 字幕（只在粒子态） | 对话 |
 * | 左下角那个本子 / 那颗笔 | 随笔小记 |
 *
 * 两面**在同一个遮罩里换内容，不叠两层** —— 与 `DockCard` 那两张卡是同一条：
 * 长在同一块地方的两个东西是互斥的，不是叠着的。而且这一层底下就是还在跑的
 * 画布，叠两层实时模糊既重又糊，Esc 也会变成两处各关一次。
 *
 * ⚠️ **状态都在这儿**（消息在 `ConversationPanel` 自己那儿，笔记在这儿）。
 * 「那颗笔该不该出现」要同时看笔记和对话 —— 分散到两个组件各算各的，
 * 刚生成完那边就还是旧状态。
 *
 * ⚠️ **根元素 `pointer-events-auto` 是必须的。** 照片页的 `<main>` 是
 * `pointer-events: none`（指针要穿透到画布，否则拖拽旋转失效），而这个属性
 * **会被继承** —— 不显式开回来的话，鼠标会穿过浮层打到画布上：
 * 「还能拖粒子，而且点不了聊天框」（用户 2026-10-10 报的正是这个）。
 */

type Face = "conversation" | "note";

interface PhotoOverlayProps {
  photoId: string;
  /** `2025 · 09 · 28`（`02 §4` 的日期格式）。null = 这张照片没有时间 */
  date: string | null;
  /** 从哪一面进来 */
  initialFace: Face;
  /**
   * 现在是粒子态吗。
   *
   * ⚠️ 决定随笔小记那一面**要不要给「回到对话」**。对话只能从粒子界面进
   * （`16` 硬约束 #10）—— 所以原图态下从本子进来读笔记时不给这个出口，
   * 那与「先把这一天翻开，才谈得上跟它说话」是同一条。
   */
  canChat: boolean;
  onClose: () => void;
  /**
   * 随笔小记「在 / 不在」变了。
   *
   * 外壳（`MemorySpace`）靠它决定**左下角那个本子图标出不出现** ——
   * 用户定的：那个图标只在有内容时才有（一个点开是空白页的入口就是
   * 「点不动的东西」）。正文被清空 = 那条笔记没了 = 图标也该消失。
   */
  onNoteChange: (exists: boolean) => void;
}

export function PhotoOverlay({
  photoId,
  date,
  initialFace,
  canChat,
  onClose,
  onNoteChange,
}: PhotoOverlayProps) {
  const [face, setFace] = useState<Face>(initialFace);
  const [note, setNote] = useState<JournalNote | null>(null);
  /** 那颗笔该不该在。**服务端算的** —— 客户端算不了（见上面的注释） */
  const [canGenerate, setCanGenerate] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/photos/${photoId}/journal`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          data: { note: JournalNote | null; canGenerate: boolean };
        };
        if (cancelled) return;
        setNote(body.data.note);
        setCanGenerate(body.data.canGenerate);
      } catch {
        if (!cancelled) setError("读不到随笔小记");
      } finally {
        // 失败也要放行 —— 否则整层浮层是空的，用户连对话都进不去
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  // Esc 关掉整层（`04 §7` 的退出顺序第一层）。**两面共用一个** ——
  // 叠两层的话同一个按键会触发两个监听
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** 那颗笔按下去：起稿或润色。服务端看有没有现存那一行自己判断是哪种。 */
  const generate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/photos/${photoId}/journal`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as {
        data?: JournalNote;
        error?: { message?: string };
      } | null;
      if (!res.ok || !body?.data) {
        throw new Error(body?.error?.message ?? "AI 没写出可用的东西");
      }
      setNote(body.data);
      // 刚写完，笔记一定不比对话旧 —— 那颗笔该收起来了
      setCanGenerate(false);
      onNoteChange(true);
      // 刚起的那一稿就在随笔小记那一面里，直接翻过去让他改
      setFace("note");
    } catch (err) {
      setError(err instanceof Error ? err.message : "没能起稿");
    } finally {
      setGenerating(false);
    }
  }, [generating, photoId, onNoteChange]);

  const handleSaved = useCallback(
    (saved: JournalNote | null) => {
      setNote(saved);
      // 值没变时 React 自己会跳过重渲染，这里不必再判一次
      onNoteChange(saved !== null);
    },
    [onNoteChange],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={face === "conversation" ? "与这张照片对话" : "随笔小记"}
      className="pointer-events-auto fixed inset-0 z-[15] flex items-center justify-center px-12"
      style={{
        /*
         * 实时模糊：底下就是画布，粒子还在跑，所以这片模糊是活的。
         *
         * ⚠️ 用户 2026-10-10：「模糊度不要太高、要勉强能辨认背景」。
         * 一开始是 28px + 72% 底色，糊成一块，照片彻底没了 ——
         * 那样这片遮罩就只是「另一个界面」，不是「照片还在后面」。
         * 现在 14px + 60%：背景勉强认得出，而文字仍然压得住。
         */
        backgroundColor:
          "color-mix(in oklab, var(--background) 60%, transparent)",
        backdropFilter: "blur(14px) saturate(115%)",
        WebkitBackdropFilter: "blur(14px) saturate(115%)",
      }}
      onClick={(e) => {
        // 点列之外的空白收起。列是子元素，点里面的东西不会冒到这里
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 外层 580 = 窄栏 520 + 间距 20 + 那颗笔 ~28，窄屏靠 min-w-0 把栏让出来 */}
      <div className="flex w-full max-w-[580px] flex-col gap-6">
        <div className="flex items-end gap-5">
          {loaded &&
            (face === "conversation" ? (
              <ConversationPanel
                photoId={photoId}
                /*
                 * 刚说过一句 → 那颗笔该在。
                 *
                 * ⚠️ **不加 `if (note)`。** 没有笔记时它同样该在 —— 那正是
                 * 「首次生成」那条路。而服务端给初值时用的是「至少说过一句」
                 * 这条判据，所以刚打开时 `canGenerate` 是 false，说完第一句
                 * 才翻过来。
                 *
                 * 有笔记时也成立：刚说的这句比笔记新 → 该润色了。
                 */
                onUserMessaged={() => setCanGenerate(true)}
              />
            ) : (
              <NotePanel
                photoId={photoId}
                date={date}
                note={note}
                onSaved={handleSaved}
              />
            ))}

          {/*
            右边那一格 —— **同一格里任何时刻只显示得下一个动作**
            （`16 §8.6` 的做法，原图 ⇄ 粒子那一格也是这么办的）。

            - 对话那一面：那颗**笔**（起稿 / 润色）。只在它该在的时候出现，
              判据见下。
            - 随笔小记那一面：**回到对话**。用户 2026-10-10 报的正是这里 ——
              「生成笔记后回不去对话，只能点外面回粒子页」。而 `16 §8.6`
              早就写着「进得去的门就是出得来的门」：既然是从对话走过来的，
              出口就得在同一层遮罩里。

            ⚠️ **「回到对话」只在粒子态给**（`canChat`）：对话只能从粒子界面进
            是 `16` 的硬约束 #10。原图态下从本子进来读笔记，那一格就空着 ——
              读改一篇已经写下的东西不需要先「翻开」这一天。
          */}
          {face === "conversation"
            ? canGenerate && (
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={generating}
                  aria-label="整理成随笔小记"
                  title={
                    note
                      ? "让它把新聊到的补进去"
                      : "让它把这段收成一篇随笔小记"
                  }
                  className="text-text-primary mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center opacity-40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85 disabled:opacity-40"
                  style={{ transitionTimingFunction: "var(--ease-enter)" }}
                >
                  {generating ? (
                    <span className="text-meta" aria-hidden>
                      …
                    </span>
                  ) : (
                    <PenLine size={16} strokeWidth={1.6} aria-hidden />
                  )}
                </button>
              )
            : canChat && (
                <button
                  type="button"
                  onClick={() => setFace("conversation")}
                  aria-label="回到对话"
                  title="回到对话"
                  className="text-text-primary mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center opacity-40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
                  style={{ transitionTimingFunction: "var(--ease-enter)" }}
                >
                  <MessageCircle size={16} strokeWidth={1.6} aria-hidden />
                </button>
              )}
        </div>

        {error && (
          <p className="text-meta text-text-primary/60" role="status">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
