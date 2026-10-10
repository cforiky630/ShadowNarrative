"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MessageCircle, NotebookText, PenLine } from "lucide-react";
import { ConversationPanel } from "@/components/ConversationPanel";
import { NotePanel } from "@/components/NotePanel";
import { isImeKey } from "@/lib/keyboard";
import type { JournalNote } from "@/types";

/**
 * 照片页的浮层 —— **一层遮罩，两面**。
 *
 * ── 两面 ────────────────────────────────────────────────────────────
 *
 * | 从哪进 | 落在哪一面 |
 * |---|---|
 * | 字幕（只在粒子态） | 对话 |
 * | 左下角那个「随笔」 | 随笔小记 |
 *
 * 两面**在同一个遮罩里换内容，不叠两层** —— 与 `DockCard` 那两张卡是同一条：
 * 长在同一块地方的两个东西是互斥的，不是叠着的。而且这一层底下就是还在跑的
 * 画布，叠两层实时模糊既重又糊，Esc 也会变成两处各关一次。
 *
 * ── 右边那一格：谁在什么时候出现 ────────────────────────────────────
 *
 * 用户 2026-10-10 定的（含当天最后那次修正：「对话界面可以进入已有的笔记……
 * **只有没有笔记的时候**才会在对话界面出现按钮，**AI 润色按钮应该在笔记页面**」）：
 *
 * ```text
 * 对话那一面     还没有笔记 → 笔（起稿）
 *                有笔记了   → 本子（进随笔小记去读、去改）
 * 随笔小记那一面  回到对话（粒子态才给，16 硬约束 #10）
 *                笔记比最后一轮对话旧 → 笔（润色），加在「回到对话」上面
 * 两颗笔共同      这一轮回答还没落地 → 都先不出现（用户 2026-10-10）
 * ```
 *
 * 一句话：**笔是 AI 动笔（起稿 / 润色），本子是读和写（不参与）。**
 * 两个图标把两种动作分开，不会认错。
 *
 * ⚠️ **润色那颗笔不在对话那一面。** 它在笔记这一面：那时你要看的是
 * 「新聊到的有没有补进去」，而这篇正文就在眼前 —— 按了它，改的就是你正在读的
 * 这一篇，不必先切回去。对话那一面在有笔记之后换成入口，两处不重复。
 *
 * ⚠️ **出口在最下。** 随笔小记那一面可能是两颗图标（润色 + 回到对话），
 * 顺序不能让它们互相让位：`回到对话` 压在底下，润色那颗加在它上面 ——
 * 这样笔出现或消失时，出口不动（与 `16 §7.2` 里 `Back` 始终在那一行最后
 * 是同一条：**出口在边上，不随状态挪**）。
 *
 * ⚠️ **状态都在这儿**（消息在 `ConversationPanel` 自己那儿，笔记和那两个事实
 * 在这儿）。「哪颗笔该出现」要同时看笔记和对话，分散到两个组件各算各的，
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
   * （`16` 硬约束 #10）—— 所以原图态下从「随笔」进来读笔记时不给这个出口，
   * 那与「先把这一天翻开，才谈得上跟它说话」是同一条。
   */
  canChat: boolean;
  onClose: () => void;
  /**
   * 随笔小记「在 / 不在」变了。
   *
   * 外壳（`MemorySpace`）靠它决定**左下角那个「随笔」出不出现** ——
   * 用户定的：那个入口只在有内容时才有（一个点开是空白页的入口就是
   * 「点不动的东西」）。正文被清空 = 那条笔记没了 = 入口也该消失。
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
  /** 用户说过话吗。**服务端给的两个事实之一** —— 见路由的说明 */
  const [hasMaterial, setHasMaterial] = useState(false);
  /** 笔记比最后一轮对话旧吗。同上 */
  const [noteIsStale, setNoteIsStale] = useState(false);
  /**
   * 打开这一趟之后，用户**刚刚**又说了话。
   *
   * 那两个事实是**打开时**取的那一份，而说话这件事发生在之后 ——
   * 不记这一笔的话，用户在对话里说了两轮，那颗润色的笔要等下次打开才出现。
   * 生成成功后清回 false（新写的那一版比所有消息都新）。
   */
  const [spoke, setSpoke] = useState(false);
  /**
   * 这一轮 AI 正在回答。**两颗笔都要等它落地**（用户 2026-10-10：
   * 「ai 本轮回答完之前不能润色」）。
   *
   * 为什么连**起稿**那颗也等：素材是「这段对话」，回答还在路上就动笔，
   * 这一轮 AI 说的话织不进去 —— 而它两秒后就要到了。同一条理由，
   * 一个条件，不必分两套。
   *
   * ⚠️ 这条只在客户端守得住：服务端没有「正在回答」这个状态可查
   * （见 `ConversationPanel` 那个 prop 的说明）。
   */
  const [replying, setReplying] = useState(false);
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
          data: {
            note: JournalNote | null;
            hasMaterial: boolean;
            noteIsStale: boolean;
          };
        };
        if (cancelled) return;
        setNote(body.data.note);
        setHasMaterial(body.data.hasMaterial);
        setNoteIsStale(body.data.noteIsStale);
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
      /*
       * ⚠️ **组字中的 Esc 不是给你的。**
       *
       * 用中文输入法打字时 Esc 是「取消这次候选」，而它照样冒到 `window` ——
       * 少了这一句，取消一次候选就把整层浮层关掉，聊到一半的东西没了
       * （用户 2026-10-10：「对话也总是会被打断」）。「总是」是对的：
       * 用中文打字的人一天要取消几十次候选。
       *
       * 判据两条都要，见 `lib/keyboard.ts`。
       */
      if (e.key === "Escape" && !isImeKey(e)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * 那颗笔按下去：**起稿或润色**。服务端看有没有现存那一行自己判断是哪种，
   * 客户端不必说（`08 §8`）。
   */
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
      // 刚写完的这一版比所有消息都新 —— 两颗笔都该收起来了
      setSpoke(false);
      setNoteIsStale(false);
      onNoteChange(true);
      // 刚起的那一稿就在随笔小记那一面里，直接翻过去让他改
      setFace("note");
    } catch (err) {
      setError(err instanceof Error ? err.message : "没能写出来");
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

  /**
   * 起稿那颗笔：还没有笔记，有内容可整理（`01 §9`：没有他的话就只能编），
   * 而且**这一轮回答已经落地**。
   */
  const showDraft = !note && (hasMaterial || spoke) && !replying;
  /** 润色那颗笔：有笔记，那篇比最后一轮对话旧，而且这一轮回答已经落地 */
  const showPolish = note !== null && (noteIsStale || spoke) && !replying;

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
      /*
       * ⚠️ **`onPointerDown`，不是 `onClick`。**
       *
       * 用 `click` 有个会「打断对话」的洞：**按下在列里、松开在列外**时，
       * 浏览器把 `click` 派发给两者**最近的共同祖先** —— 也就是这一层
       * 根节点，于是 `target === currentTarget` 成立、整层关掉。
       * 用鼠标选一段字、手一抖拖出去就中招（实测过）。
       *
       * `pointerdown` 没有这个问题：「按下时指针在哪」是明确的，
       * 从列里按下去的那一下根本不会到这里。
       *
       * 这也和其余两处收起（`DockCard`、删除的待确认）同一条 ——
       * 它们的注释里写着「按下就该有反应，等到抬起已经慢了一拍」。
       */
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}    >
      {/* 外层 580 = 窄栏 520 + 间距 20 + 右边那一格 ~28，窄屏靠 min-w-0 把栏让出来 */}
      <div className="flex w-full max-w-[580px] flex-col gap-6">
        <div className="flex items-end gap-5">
          {loaded &&
            (face === "conversation" ? (
              <ConversationPanel
                photoId={photoId}
                /*
                 * 刚说过一句。不写这一笔的话，那颗笔要等下次打开才出现 ——
                 * 而「首次生成只能在对话那里」（用户定的），说话与起稿
                 * 本该是紧接着的两下。
                 */
                onUserMessaged={() => setSpoke(true)}
                /*
                 * ⚠️ **直接传 `setReplying`，不要包一层箭头。**
                 * 它会被 `send` 的闭包一直握到请求结束 —— 那时候这一面
                 * 可能已经卸载了（用户翻去随笔小记），而这一句仍然要能
                 * 把「回答落地了」报回来。`setState` 本身是稳定的。
                 */
                onReplyingChange={setReplying}
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
            右边那一格。两种动作**不并排**：同一格里任何时刻只显示得下一个动作
            （`16 §8.6` 的做法，原图 ⇄ 粒子那一格也是这么办的）——
            只有随笔小记那一面在「笔记旧了」时才多一颗润色，而那两颗是竖排，
            出口照旧在最下（见文件头）。
          */}
          <div className="mb-0.5 flex shrink-0 flex-col items-center gap-3">
            {face === "conversation" ? (
              note ? (
                <SlotButton
                  label="随笔小记"
                  hint="读一读、改一改"
                  onClick={() => setFace("note")}
                >
                  <NotebookText size={16} strokeWidth={1.6} aria-hidden />
                </SlotButton>
              ) : (
                showDraft && (
                  <SlotButton
                    label="整理成随笔小记"
                    hint="让它把这段收成一篇随笔小记"
                    disabled={generating}
                    onClick={() => void generate()}
                  >
                    <PenButtonContent generating={generating} />
                  </SlotButton>
                )
              )
            ) : (
              <>
                {showPolish && (
                  <SlotButton
                    label="让 AI 润色"
                    hint="让它把新聊到的补进去，你自己写的字保留"
                    disabled={generating}
                    onClick={() => void generate()}
                  >
                    <PenButtonContent generating={generating} />
                  </SlotButton>
                )}
                {canChat && (
                  <SlotButton
                    label="回到对话"
                    hint="回到对话"
                    onClick={() => setFace("conversation")}
                  >
                    <MessageCircle size={16} strokeWidth={1.6} aria-hidden />
                  </SlotButton>
                )}
              </>
            )}
          </div>
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

/**
 * 右边那一格里的图标按钮。四处共用一套：16px、`strokeWidth 1.6`，
 * 与 `Settings` / `SlidersHorizontal` / `Star` 同一套语言（`16 §7.2` 那个
 * 「图标都长一样」的规矩）。
 *
 * ⚠️ 提亮走**元素本身的 opacity**，不走颜色透明度 —— 后者与 `hover:opacity-*`
 * 叠在一起会把 hover 的方向反过来（底色越淡越"亮"，越 hover 越暗）。
 */
function SlotButton({
  label,
  hint,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // 纯图标，没有文字 —— `aria-label` 是它唯一的自解释
      aria-label={label}
      title={hint ?? label}
      className="text-text-primary flex h-7 w-7 shrink-0 items-center justify-center opacity-40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85 disabled:opacity-40"
      style={{ transitionTimingFunction: "var(--ease-enter)" }}
    >
      {children}
    </button>
  );
}

/** 那颗笔 —— 跑的时候换成省略号，免得「按了没反应」 */
function PenButtonContent({ generating }: { generating: boolean }) {
  if (generating) {
    return (
      <span className="text-meta" aria-hidden>
        …
      </span>
    );
  }
  return <PenLine size={16} strokeWidth={1.6} aria-hidden />;
}
