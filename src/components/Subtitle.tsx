"use client";

import type { AiState } from "@/types";

/**
 * 字幕 —— AI 看到照片后说的第一句话。
 *
 * 规格：09-AI_SPEC.md §21、16-ALBUM_SPACE.md §7.1
 *
 * 它是**字幕不是气泡**（09 §21.1）：没有边框、没有投影、没有背景块
 * （07 §1 明令不能出现传统卡片），像电影字幕一样安静地浮现。
 *
 * 位置：占原来「标题」的位置 —— 日期下 8px，操作区之上（16 §7.1）。
 * 用的字阶是 `text-body`：比日期（text-meta）重要，而不是原来标题那种 36px
 * —— 16 §7.1 说它是「text-title 之外的次级层级」。
 */

interface SubtitleProps {
  content: string | null;
  state: AiState;
  /**
   * ⚠️ 2026-10-10 删掉了 `awaitingManualTrigger` 与它那一整个分支
   * （「看一眼」）。用户定了「自动分析只能开」，于是 `pending` 只剩
   * 「正在分析中」一个含义，不会再有「照片还没发出去、等用户点」那种状态。
   */
  /** 重新请求一次分析。现在只剩**失败重试**这一个用途。 */
  onRequest?: () => void;
  /**
   * 这时候字幕**可以点开对话**。
   *
   * 用户 2026-10-10：**只有粒子界面能进入对话**，而且字幕上要有暗示它可点
   * 的东西。所以这个开关由 `MemorySpace` 按 `displayMode` 传进来。
   *
   * 暗示的样式是 `.sn-hint`（`components.css`）—— 一条**字幕正下方的线**，
   * 哑光地呼吸，另有一道高亮从左到右扫过去。
   *
   * ⚠️ 它最早是一圈 `outline` 呼吸边框。用户那天换掉了它：
   * 「做成下面一条线带有从左到右的动态高亮怎么样，但整体哑光或呼吸」——
   * 框住的是整个文字块，而字幕长短不一，框总显得比内容大一圈；
   * 一条线的长度永远等于这一行字。
   */
  interactive?: boolean;
  onOpen?: () => void;
}

/** 一句占位的高度，等于一行 text-body（1.7 line-height）。 */
const ONE_LINE = "1.7em";

/** 主体文字的样式。可点与不可点共用一套 —— 点开前后不该换一种字 */
const BODY_CLASS =
  "text-body mt-2 block max-w-[26em] text-center text-balance text-text-primary/85";

export function Subtitle({
  content,
  state,
  onRequest,
  interactive = false,
  onOpen,
}: SubtitleProps) {
  // 失败：一行低存在感的文案 + 点击重试。不弹提示、不用红色 ——
  // 这套配色里表达「注意」的方式是提亮，不是染色。
  if (state === "failed" && !content) {
    return (
      <p
        className="text-meta mt-2 text-center text-text-primary/35"
        style={{ minHeight: ONE_LINE }}
      >
        <button
          type="button"
          onClick={onRequest}
          className="pointer-events-auto underline-offset-4 hover:text-text-primary/60 hover:underline"
        >
          没能看清这张照片。再看一次？
        </button>
      </p>
    );
  }

  /*
   * 可点的那一版。**用 <button> 而不是给 <p> 挂 onClick** ——
   * 键盘、焦点环、读屏器的「按钮」角色都是白送的。
   *
   * ⚠️ 只在 `interactive && content` 时才算数：粒子态下字幕可能还没到
   * （先翻了粒子、分析还没回来），那时候点是点不出东西的。
   */
  if (interactive && content) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className={`${BODY_CLASS} sn-hint pointer-events-auto`}
        style={{
          minHeight: ONE_LINE,
          // 与溶解同一条缓动（16 §11.2：缓动运行时从 CSS 变量读，不抄数字）
          transition:
            "opacity var(--duration-morph) var(--ease-morph), transform var(--duration-morph) var(--ease-morph)",
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <p
      // 宽度用 em 不用 ch：`ch` 是数字 0 的宽度，一个汉字约合 2ch，
      // 用 ch 会得到「一行只放得下 17 个字」这种对中文毫无意义的行宽。
      // 26em ≈ 26 个汉字一行，正好是电影字幕的尺度。
      className={BODY_CLASS}
      style={{
        minHeight: ONE_LINE,
        // 与溶解同一条缓动和时长，让浮现成为镜头的一部分而不是文字突然出现
        // （16 §11.2：缓动是运行时从 CSS 变量读的，不是抄数字）
        opacity: content ? 1 : 0,
        transform: content ? "translateY(0)" : "translateY(4px)",
        transition:
          "opacity var(--duration-morph) var(--ease-morph), transform var(--duration-morph) var(--ease-morph)",
      }}
      // 轮询期间不算「更新」，避免屏幕阅读器反复播报
      aria-live={state === "pending" ? "off" : "polite"}
    >
      {content ?? ""}
    </p>
  );
}
