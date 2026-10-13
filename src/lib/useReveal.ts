"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
 *
 * ── ⚠️ 2026-10-11：从 `useRef` + effect 改成了**回调 ref** ──────────
 *
 * 旧写法是 `const ref = useRef(null)` + 一个 `[rootMargin]` 的 effect 去
 * `observer.observe(ref.current)`。它有个洞：**effect 只在挂载时跑一次**，
 * 而那一下 `ref.current` 可能是 `null`（元素还没渲染出来）—— 于是
 * `if (!el) return` 直接退出，**观察器再也不会被建起来**，`revealed` 永远是
 * `false`，而 `revealStyle(false)` 就是 `opacity: 0`。
 *
 * 这不是理论问题：相册首屏在**一张照片都没有**的时候渲染的是空态，
 * 画廊那一层根本不在 DOM 里。用户往空态里拖进一张照片，`all.length` 从 0
 * 变成 1、组件切到画廊分支 —— 但那个 effect 不会重跑，于是**整屏是黑的**
 * （用户 2026-10-11 报的「拖进去一张照片不会更新，还是黑屏，刷新才出现」；
 * 刷新之所以好使，是因为那一次挂载时画廊已经在 DOM 里了）。
 *
 * 回调 ref 天然没有这个洞：**元素什么时候挂上来，观察器就什么时候建**。
 * 「元素中途被换掉 / 迟一步出现」这一类用法因此不必各自打补丁。
 */
export function useReveal<T extends HTMLElement>(options: {
  /**
   * 提前多少开始。默认在元素进入视口**下缘 12%** 之前就触发 ——
   * 等它真的露出来才开始，看起来像"跳出来"；提前一点才是浮现。
   */
  rootMargin?: string;
} = {}) {
  const rootMargin = options.rootMargin ?? "0px 0px -12% 0px";
  const [revealed, setRevealed] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  /** 已经揭示过就不再观察。放 ref 里是为了让下面那个回调的引用保持稳定 */
  const revealedRef = useRef(false);

  /*
   * 回调 ref。
   *
   * ⚠️ 依赖只有 `rootMargin` —— **不要把 `revealed` 放进来**：那会让回调
   * 每次揭示都换一个引用，React 于是先以 `null` 调它一遍、再以元素调一遍，
   * 白白断开重连一次。
   */
  const ref = useCallback(
    (el: T | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!el || revealedRef.current) return;

      /*
       * `prefers-reduced-motion` **不在这里处理**，交给 `.sn-reveal` 的媒体查询
       * （src/styles/components.css）。两个理由：
       *
       *   1. 那是「表现」不是「状态」。在 effect 体里同步 setState 会触发级联渲染，
       *      eslint 的 react-hooks/set-state-in-effect 会报错 —— 而且那个报错是对的。
       *   2. 状态路径管不到的东西（比如用户中途改系统偏好）CSS 天然就管得到。
       */
      const observer = new IntersectionObserver(
        (entries) => {
          // setState 在**回调**里是允许的：那是「订阅外部系统后响应变化」，
          // 正是它该做的事
          if (entries.some((e) => e.isIntersecting)) {
            revealedRef.current = true;
            setRevealed(true);
            observer.disconnect(); // 只揭示一次
          }
        },
        { rootMargin },
      );

      observer.observe(el);
      observerRef.current = observer;
    },
    [rootMargin],
  );

  // 卸载时断开。元素离开时回调 ref 会被以 `null` 调一次，但组件整体卸载时
  // 那一下不保证发生（父子同时走），所以再兜一道
  useEffect(() => () => observerRef.current?.disconnect(), []);

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
