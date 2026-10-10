"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 进入视口后再揭示。
 *
 * 用户 2026-10-10 要求时间线有「渐显」效果。
 *
 * ⚠️ **不是滚动绑定（scrub）**。React Bits 的 ScrollReveal 用 `scrub: true`，
 * 进度直接等于滚动位置 —— 那必须配 `ease: 'none'`，也就是线性的，
 * 而 `02-DESIGN-SYSTEM.md` §10 明确禁止线性、要求「慢、柔和、有惯性、有阻尼」。
 * 而且 scrub 往回滚会倒放，时间线是要反复上下浏览的，那会变成干扰。
 *
 * 所以这里是**进入触发**：进视口播放一次，然后就是普通元素。
 *
 * 两条硬要求：
 *   - `prefers-reduced-motion` 下**完全不动**（`07 §10` States 里的 reduced-motion）
 *   - 默认只揭示一次。往回滚重播在浏览场景里是噪音
 */
export function useReveal<T extends HTMLElement>(options: {
  /**
   * 提前多少开始。默认在元素进入视口**下缘 12% 之前**就触发 ——
   * 等它真的露出来才开始，看起来像"跳出来"；提前一点才是浮现。
   */
  rootMargin?: string;
} = {}) {
  const rootMargin = options.rootMargin ?? "0px 0px -12% 0px";
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /*
     * prefers-reduced-motion **不在这里处理**，交给 `.sn-reveal` 的媒体查询
     * （src/styles/components.css）。两个理由：
     *
     *   1. 那是「表现」不是「状态」。在 effect 体里同步 setState 会触发级联渲染，
     *      eslint 的 react-hooks/set-state-in-effect 会报错 —— 而且那个报错是对的。
     *   2. 状态路径管不到的东西（比如用户中途改系统偏好）CSS 天然就管得到。
     */
    const observer = new IntersectionObserver(
      (entries) => {
        // setState 在**回调**里是允许的：那是「订阅外部系统后响应变化」，
        // 正是 effect 该做的事
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          observer.disconnect(); // 只揭示一次
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, revealed };
}

/**
 * 揭示时的样式。**只在这里定义一次** —— 各处手写会漂移。
 *
 * 缓动与时长都从 CSS 变量读（`02 §10` 的值定义在 `tokens.css`），
 * 和 `src/lib/gsap.ts` 的做法一致：改 token，这里自动跟随。
 *
 * 模糊参与揭示是刻意的：模糊 → 清晰正是这个产品的语言
 * （原图 ⇄ 粒子、溶解，都是"从不确定到确定"）。
 */
export function revealStyle(revealed: boolean, delayMs = 0): React.CSSProperties {
  return {
    opacity: revealed ? 1 : 0,
    transform: revealed ? "translateY(0)" : "translateY(14px)",
    // 只在未揭示时上模糊。已揭示的元素留着 filter 会让它永远多一层合成
    filter: revealed ? "none" : "blur(6px)",
    transition: [
      `opacity var(--duration-ui) var(--ease-enter) ${delayMs}ms`,
      `transform var(--duration-ui) var(--ease-enter) ${delayMs}ms`,
      // 模糊的退场比位移略慢，让它像"聚焦"而不是"切换"
      `filter var(--duration-scene) var(--ease-enter) ${delayMs}ms`,
    ].join(", "),
  };
}
