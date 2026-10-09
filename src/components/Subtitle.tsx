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
  onRetry?: () => void;
}

/** 一句占位的高度，等于一行 text-body（1.7 line-height）。 */
const ONE_LINE = "1.7em";

export function Subtitle({ content, state, onRetry }: SubtitleProps) {
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
          onClick={onRetry}
          className="pointer-events-auto underline-offset-4 hover:text-text-primary/60 hover:underline"
        >
          没能看清这张照片。再看一次？
        </button>
      </p>
    );
  }

  return (
    <p
      // 宽度用 em 不用 ch：`ch` 是数字 0 的宽度，一个汉字约合 2ch，
      // 用 ch 会得到「一行只放得下 17 个字」这种对中文毫无意义的行宽。
      // 26em ≈ 26 个汉字一行，正好是电影字幕的尺度。
      className="text-body mt-2 max-w-[26em] text-center text-balance text-text-primary/85"
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
