"use client";

import { useCallback, useRef, useState } from "react";

/**
 * 视口进入揭示 Hook（渐显动效）。
 *
 * 规格：docs/specs/02-DESIGN_SYSTEM.md §10、07-UI_PAGE_SPECS.md §10
 *
 * ── 设计原则 ──────────────────────────────────────────────────────────
 * - 进入触发（One-shot）：元素进入视口触发一次平滑过渡，不绑定滚动位置（非 scrub）。
 * - 减弱动效支持：在 prefers-reduced-motion 环境下保持静态可见，不产生位移与过渡。
 */
export function useReveal<T extends HTMLElement>(options: {
  rootMargin?: string;
} = {}) {
  const rootMargin = options.rootMargin ?? "0px 0px -12% 0px";
  const [revealed, setRevealed] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const revealedRef = useRef(false);

  const ref = useCallback(
    (el: T | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!el || revealedRef.current) return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            revealedRef.current = true;
            setRevealed(true);
            observer.disconnect();
          }
        },
        { rootMargin },
      );

      observer.observe(el);
      observerRef.current = observer;
    },
    [rootMargin],
  );

  return { ref, revealed };
}

/**
 * 配合 useReveal 的内联样式辅助函数。
 */
export function revealStyle(
  revealed: boolean,
  delayMs = 0,
): { opacity: number; transform: string; transition: string } {
  return {
    opacity: revealed ? 1 : 0,
    transform: revealed ? "translateY(0)" : "translateY(16px)",
    transition: `opacity var(--duration-page) var(--ease-enter) ${delayMs}ms, transform var(--duration-page) var(--ease-enter) ${delayMs}ms`,
  };
}
