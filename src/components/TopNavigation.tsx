"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useExperience } from "@/store/experience";

/**
 * 顶部导航。
 *
 * 规格：02-DESIGN_SYSTEM.md §12、07-UI_PAGE_SPECS.md §1
 *   - 低存在感：非交互态 opacity 0.40，hover/focus 0.85
 *   - text-micro，字距 +0.08em
 *   - 顶部 32px，左右边距 48px
 *
 * 粒子模式时左上角的 MEMORY 让位给「返回」（16-ALBUM_SPACE.md §8.6）。
 *
 * ⚠️ 「返回」**不能做成导航栏的返回按钮**。用户 2026-10-09 的要求是
 * 「不要让人感觉是切换页面」—— 而带箭头的返回恰恰是页面导航的通用符号。
 * 所以：
 *   - 不加箭头图标
 *   - 复用 MEMORY 完全相同的文字样式，而不是控件的样式
 *   - 用与溶解**同一条缓动和时长**交叉淡化，让它成为这个镜头的一部分，
 *     而不是突然出现的 chrome
 */
/**
 * 顶部导航的空间入口。
 *
 * 2026-10-09 删掉了 `/journal` 与 `/create` —— **两个路由都不存在**，点进去是 404。
 * 它们是上一版设计留下的：`Journal` 在 `01-PRODUCT_SPEC.md` §5 里是体验状态
 * （从照片主动触发进入），不是顶层导航目的地；`Create` 在任何文档里都没有定义。
 *
 * 现在只剩 `Memories`，看着稀疏，但这是产品的真实状态 ——
 * Album / Library 属于 Round 5/6，等真做出来再加。
 * 有意的：**入口宁可少，也不要留点不动的**。
 */
const NAV_ITEMS = [{ href: "/", label: "Memories" }] as const;

/** 与溶解同步的交叉淡化 */
const CROSSFADE = "opacity var(--duration-morph) var(--ease-morph)";

export function TopNavigation() {
  const pathname = usePathname();
  const setControlsOpen = useExperience((s) => s.setControlsOpen);
  const displayMode = useExperience((s) => s.displayMode);
  const setDisplayMode = useExperience((s) => s.setDisplayMode);

  const inParticle = displayMode === "particle";

  /**
   * 交叉淡化时的焦点交接。
   *
   * 隐藏的那一个用 `inert`（而不是 `aria-hidden` + `tabIndex`）：浏览器在
   * aria-hidden 警告里推荐的就是它，而且不会造出「焦点留在 aria-hidden 里面」
   * 那种自相矛盾的状态 —— 那正是控制台那条警告的来源。
   *
   * 但 `inert` 是立刻生效的：点「返回」的瞬间按钮自己也 inert 了，浏览器会把
   * 焦点丢回 body。所以先记一笔，等状态落定后把焦点交给接替它的 MEMORY，
   * 否则键盘用户按一下「返回」就被送回文档开头。
   */
  const memoryRef = useRef<HTMLAnchorElement>(null);
  const handoffToMemory = useRef(false);

  useEffect(() => {
    if (!handoffToMemory.current) return;
    handoffToMemory.current = false;
    memoryRef.current?.focus();
  }, [inParticle]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between px-12 pt-8">
      {/* 左上角：MEMORY 与「返回」叠在同一位置交叉淡化。
          不做瞬间替换 —— 那会读成"换了一页"。
          隐藏的那个走 inert：既从辅助技术里消失，也无法被 Tab 到，
          还不会触发浏览器的「aria-hidden 挡住了焦点」保护。 */}
      <div className="pointer-events-auto relative">
        <Link
          ref={memoryRef}
          href="/"
          inert={inParticle}
          className="text-micro block text-text-primary/55 transition-opacity duration-[350ms] hover:opacity-100 focus-visible:opacity-100"
          style={{
            opacity: inParticle ? 0 : 1,
            transition: CROSSFADE,
            pointerEvents: inParticle ? "none" : "auto",
          }}
        >
          MEMORY
        </Link>

        <button
          type="button"
          onClick={() => {
            handoffToMemory.current = true;
            setDisplayMode("photo");
          }}
          inert={!inParticle}
          className="text-micro absolute left-0 top-0 text-text-primary/55 hover:opacity-100 focus-visible:opacity-100"
          style={{
            opacity: inParticle ? 1 : 0,
            transition: CROSSFADE,
            pointerEvents: inParticle ? "auto" : "none",
          }}
        >
          返回
        </button>
      </div>

      <nav className="pointer-events-auto flex items-center gap-6">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="text-micro text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
              style={{ transitionTimingFunction: "var(--ease-enter)" }}
            >
              {item.label}
            </Link>
          );
        })}

        {/* 粒子控制面板入口。默认隐藏面板，这里只给一个低存在感的开关。 */}
        <button
          type="button"
          onClick={() => setControlsOpen(true)}
          aria-label="粒子参数"
          className="text-micro text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
          style={{ transitionTimingFunction: "var(--ease-enter)" }}
        >
          参数
        </button>

        {/*
          设置刻意**不放进 NAV_ITEMS**：那个数组是「空间」，而设置不在
          `01-PRODUCT_SPEC.md` §5 的 7 个体验状态里 —— 它是体验之外的配置层
          （07-UI_PAGE_SPECS.md §11.1）。放在最外侧，与其余入口分开。
        */}
        <Link
          href="/settings"
          aria-current={pathname === "/settings" ? "page" : undefined}
          className="text-micro text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
          style={{ transitionTimingFunction: "var(--ease-enter)" }}
        >
          设置
        </Link>
      </nav>
    </header>
  );
}
