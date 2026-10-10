"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { motion } from "motion/react";
import type { ConversationMessage } from "@/types";

/**
 * 对话 —— `PhotoOverlay` 里的**那一面**（`16-ALBUM_SPACE.md` §9、`08 §7`）。
 *
 * ⚠️ **2026-10-10 拆过一次。** 在这之前它是整个浮层（自带全屏遮罩、居中、
 * 点空白收起、Esc）。随笔小记那一面要用**同一层遮罩、同一条窄栏**，所以
 * 遮罩与退出都搬去了 `PhotoOverlay`，这里只剩那一条列。
 * 于是「对话 ⇄ 随笔小记」是**换内容**，不是叠两层（底下是还在跑的画布，
 * 两层实时模糊既重又糊）。
 *
 * ⚠️ **`pointer-events` 会被继承。** 照片页的 `<main>` 是 `none` 的（指针要
 * 穿透到画布，否则拖拽旋转失效），而浮层在 `main` 里 —— 整层由 `PhotoOverlay`
 * 开 `pointer-events-auto` 兜住。
 *  * 不显式开回来的话它会连指针一起继承成 `none`：鼠标穿过浮层直接打到画布上，
 * 于是「还能拖粒子，而且点不了聊天框」（用户 2026-10-10 报的正是这个）。
 * 判据不是「谁看着像要能点」，而是**它在不在那个 `none` 的子树里**。
 *
 * ── 形态是用户 2026-10-10 定的 ──────────────────────────────────────
 *
 * > 只有粒子界面能进入对话…点击那条主题盖上一层浮层背景（这个浮层是全屏的
 * > 遮罩）实时模糊，然后对话、对话入场要有逐条从下面上来的效果
 *
 * 三条都落实了：
 *
 * 1. **入口只在粒子态**（`MemorySpace` 按 `displayMode` 决定），
 *    字幕正下方有一条呼吸的线暗示可点（`.sn-hint`）。
 * 2. **全屏遮罩 + 实时模糊** —— 现在那一层在 `PhotoOverlay` 里。
 * 3. **逐条从下面上来**：每条 `initial={{ y: 18 }}`，按序号错开。
 *    ⚠️ 只有**打开时已有的那些**参与错开，新发的那条延迟是 0 ——
 *    否则聊到第二十条时，每说一句都要等一秒才看见。
 *
 * ── 两条规格约束 ────────────────────────────────────────────────────
 *
 * - **不用气泡**（§9）。AI 的话是正文，用户的话更淡，靠明暗分层，
 *   没有边框、没有背景块。字幕就是列表的第一条（`08 §3`：不做两套数据）。
 * - 那句「照片会离开这台机器」**不在这儿**：用户当天要求浮层干净，它留在
 *   设置卡里（`12 §5`、`07 §11.3`）。见下面输入区那段注释。
 */

interface ConversationPanelProps {
  photoId: string;
  /**
   * 用户刚说了一句。
   *
   * ⚠️ 这一条是给**对话那一面那颗笔**用的：随笔小记已经写过之后，只有
   * 「又聊了几轮」才该让笔回来（用户 2026-10-10 定的）。判据在
   * `PhotoOverlay` 那边算，这里只负责把「刚说过一句」报上去。
   */
  onUserMessaged?: () => void;
}

/**
 * 一条消息的长度上限。
 *
 * ⚠️ 与 `aiService.MESSAGE_MAX_CHARS` 是同一个数，但**不能 import 过来** ——
 * 那个模块 import 了 prisma，拉进客户端就是把整个服务端打进 bundle。
 * 所以这里抄一份，两边一起改。（服务端那道是权威的，这里只是别让用户白打。）
 */
const MAX_CHARS = 2000;

export function ConversationPanel({
  photoId,
  onUserMessaged,
}: ConversationPanelProps) {
  const [messages, setMessages] = useState<ConversationMessage[] | null>(null);
  /**
   * 打开时已有的条数。只有它们参与入场错开 —— 见文件头的说明。
   * 用 state 不用 ref：它参与渲染，而 ref 在渲染期读会被 lint 拦下（对，该拦）。
   */
  const [initialCount, setInitialCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/photos/${photoId}/conversation`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error();
    const body = (await res.json()) as { data: ConversationMessage[] };
    setMessages(body.data);
    return body.data;
  }, [photoId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await load();
        // 只有第一次进来才记住这个数 —— 重取（发送失败后对账）不该重置它
        if (!cancelled) setInitialCount((n) => (n === 0 ? list.length : n));
      } catch {
        if (!cancelled) setFailed("读不到对话");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // 新消息进来就滚到底
  useEffect(() => {
    if (messages?.length) {
      endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [messages?.length]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setFailed(null);
    setDraft("");

    // 乐观：先把这句挂上去。服务端也存了一份，id 用临时的
    setMessages((prev) => [
      ...(prev ?? []),
      {
        id: `local-${Date.now()}`,
        role: "user",
        content: text,
        sourceRefs: null,
        isSubtitle: false,
        createdAt: new Date().toISOString(),
      },
    ]);

    /*
     * 报给 `PhotoOverlay`：现在多了一句用户说的话。
     *
     * 放这儿而不是发送成功之后 —— 服务端**在调模型之前**就把用户那句话落库了
     * （见下面的对账注释），所以「说过」这件事在请求发出去的那一刻就已经成立，
     * 失败了也一样。而那颗笔的判据正是「有没有比笔记更新的对话」。
     */
    onUserMessaged?.();

    try {
      const res = await fetch(`/api/photos/${photoId}/conversation/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "没能送出去");
      }

      const body = (await res.json()) as { data: ConversationMessage };
      setMessages((prev) => [...(prev ?? []), body.data]);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "没能送出去");
      /*
       * 对账。**服务端在调模型之前就把用户那句话落库了** ——
       * 所以模型失败时，那句话其实已经在库里。只报错不重取的话，
       * 用户再点一次发送就会把同一句存两遍。
       */
      await load().catch(() => {
        // 连重取都失败，说明服务端整个不通；错误已经报出去了
      });
    } finally {
      setSending(false);
    }
  }, [draft, sending, photoId, load, onUserMessaged]);

  const list = messages ?? [];

  return (
    /*
      这里只渲染**那一列**。

      ⚠️ 遮罩、居中、点空白收起、Esc 都归 `PhotoOverlay`（2026-10-10 拆的）——
      随笔小记那一面要用**同一层遮罩、同一条窄栏**，两套各写一份的话
      「换内容」就会变成「跳一下」，而且会叠出两层实时模糊。
      那一层底下就是还在跑的画布，叠两层既重又糊。

      列本身仍然是「一块居中的窄栏」（用户 2026-10-10：「对话更集中于中心区域，
      对话式聊天」）—— 一开始做成「文字贴顶、输入贴底」的分栏，那是 IM 客户端的
      骨架，一屏只有两句话时中间是空的，读起来像没加载完。
      现在消息和输入挨在一起，高度封顶，超出在内部滚。
    */
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // 用 spring 而不是写一条 cubic-bezier：`16 §11.2` 不许把曲线抄进代码，
      // 而 spring 本来就不需要 token 里的曲线
      transition={{ type: "spring", stiffness: 180, damping: 26 }}
      className="flex max-h-[78dvh] min-h-0 w-full min-w-0 flex-1 flex-col"
    >
        <div className="sn-noscrollbar min-h-0 flex-1 overflow-y-auto">
          {list.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 240,
                  damping: 30,
                  // 只有开场那批错开；新消息立刻到位
                  delay: i < initialCount ? i * 0.06 : 0,
                }}
                className={
                  m.isSubtitle
                    ? "text-body text-text-primary/85"
                    : m.role === "user"
                      ? // 我说的靠右（用户 2026-10-10）。不用气泡（§9）——
                        // 靠**对齐 + 明暗**分层就够了，加个框就变成 IM 了
                        "text-body mt-7 ml-auto max-w-[85%] text-right text-text-primary/40"
                      : "text-body mt-7 text-text-primary/90"
                }
              >
                {m.content}
              </motion.div>
            ))}

            {sending && (
              <p className="text-body mt-7 text-text-primary/25">…</p>
            )}

            {failed && (
              <p className="text-meta mt-7 text-text-primary/55" role="status">
                {failed}
              </p>
            )}

            {messages === null && !failed && (
              <p className="text-meta text-text-primary/30">…</p>
            )}

            <div ref={endRef} />
        </div>

        {/* 输入区。低存在感（§9）—— 只有一条下划线，紧贴在消息下面 */}
        <div className="mt-7">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="border-border-subtle flex items-baseline gap-4 border-b pb-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              placeholder="说点什么"
              maxLength={MAX_CHARS}
              className="text-body flex-1 bg-transparent text-text-primary/90 outline-none placeholder:text-text-primary/20"
            />
            {/*
              ⚠️ 原先这里是一个 **`说` 字**。用户 2026-10-10：
              「输入框右边的发送用一个「说」字也太离谱了，改好看点」。

              换成 `lucide-react` 的 `ArrowUp` —— 与产品里其余图标同一套语言
              （16px / `strokeWidth 1.6`，和 `Settings` / `Star` /
              `SlidersHorizontal` 一致）。**不用纸飞机（`Send`）**：
              那个形状比这个产品吵，而且它在这里表达的是「提交」不是「寄出去」。

              纯图标没有文字，所以 `aria-label` 是它唯一的自解释 ——
              键盘和读屏器都靠它。
            */}
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="发送"
              className="text-text-primary shrink-0 self-center opacity-40 transition-opacity duration-[350ms] hover:opacity-85 disabled:opacity-20"
              style={{ transitionTimingFunction: "var(--ease-enter)" }}
            >
              <ArrowUp size={16} strokeWidth={1.6} aria-hidden />
            </button>
          </form>

          {/*
            ⚠️ 这里**刻意没有**那句「照片会发给模型服务商」的披露。
            用户 2026-10-10：「界面下面不用那句注释」—— 对话浮层要干净。

            `12 §5` 要的那句话仍然在，只是**只在设置面板里**（`07 §11.3`：
            必须写在界面上，不能只活在文档里）。那里是用户决定
            「要不要让照片离开这台机器」的地方 —— 开关和那句话挨在一起才有用，
            摆在每次对话的下面只是重复，还占着最底下那行。
          */}
        </div>
      </motion.div>
  );
}
