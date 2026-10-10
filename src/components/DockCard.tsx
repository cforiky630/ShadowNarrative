"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 从左下那颗胶囊长出来的浮卡。
 *
 * 用户 2026-10-10 定了左下角的形态（`BottomDock`）：一颗胶囊两格，
 * 点哪一格就从胶囊那儿长出一张卡。设置和粒子参数**共用这一层外壳**
 * （开合动画、遮罩、Esc、焦点交接、滚动），各自只提供标题与内容。
 *
 * ⚠️ **共用的只有外壳。** 用户明确说过组合的是「按钮，不是卡片、内容、
 * 功能组合」—— 两张卡的内容各归各，谁也不认识谁。这里抽出来的原因只有一个：
 * 两套一样的外壳摆在一起等于两份会各自漂移的动效性格（`05 §7` 对动画
 * 说过同一件事，只是发生在卡片上）。
 *
 * ── 三条不能丢的纪律 ────────────────────────────────────────────────
 *
 * 1. **不换页、不出暗色遮罩**（`07 §11.2`）：卡片就从胶囊那儿长出来，
 *    底下的照片还在。点空白处收起 —— 那一层是透明的，只是接点击。
 * 2. **收起时 `inert`**：键盘和读屏器都够不着，但它**仍然挂载** ——
 *    卸载了就没法播收起那一段。
 * 3. **焦点要还回去**：收起还给它原来待的那颗球。不还的话键盘用户每关
 *    一次都得从文档开头重新 Tab 一遍。
 */

interface DockCardProps {
  /** 既是 `aria-label`，也是卡片头上那行字 */
  label: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function DockCard({ label, open, onClose, children }: DockCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  /** 打开前焦点在谁身上 —— 收起时还给它（就是胶囊上那一格） */
  const openerRef = useRef<HTMLElement | null>(null);

  // Esc 收起（04-UX_INTERACTION_SPEC.md §7 的退出顺序第一层）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      openerRef.current?.focus();
      openerRef.current = null;
      return;
    }
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // 卡片里第一个可聚焦的元素就是关闭按钮
    cardRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [open]);

  return (
    <>
      {/*
        点空白处收起。

        `z-[39]` 比胶囊（`z-40`）**低一层** —— 这样重复点同一颗球就是
        开/关的切换，而不是被这层挡住。它同时压在页面内容之上，
        所以卡片开着的时候底下的东西点不到（`07 §11.2` 要的「不换页」，
        但不等于「还能隔着卡片点东西」）。
      */}
      {open && (
        <div
          aria-hidden
          onClick={onClose}
          className="pointer-events-auto fixed inset-0 z-[39]"
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-label={label}
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
        className="border-border-faint fixed bottom-20 left-6 z-40 flex max-h-[min(76dvh,700px)] w-[min(380px,calc(100vw-3rem))] origin-bottom-left flex-col overflow-hidden rounded-2xl border shadow-2xl outline-none backdrop-blur-2xl"
        style={{
          backgroundColor: "var(--glass-strong)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          opacity: open ? 1 : 0,
          // 从胶囊那儿长出来：origin 定在左下角，所以是「展开」不是「淡入」
          transform: open ? "scale(1)" : "scale(0.92) translateY(6px)",
          pointerEvents: open ? "auto" : "none",
          transition:
            "opacity var(--duration-ui) var(--ease-enter), transform var(--duration-ui) var(--ease-enter)",
        }}
      >
        <header className="flex shrink-0 items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-micro tracking-[0.08em] text-text-primary/70">
            {label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="收起"
            className="text-meta text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            ×
          </button>
        </header>

        {/* min-h-0 是给这一层能真正滚动用的 —— flex 子项默认不收缩 */}
        <div className="sn-noscrollbar min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
