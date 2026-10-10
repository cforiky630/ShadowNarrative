"use client";

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
 * 2026-10-09 删掉了 `/journal` 与 `/create` —— **两个路由都不存在**，点进去是 404。
 * 它们是上一版设计留下的：`Journal` 在 `01-PRODUCT_SPEC.md` §5 里是体验状态
 * （从照片主动触发进入），不是顶层导航目的地；`Create` 在任何文档里都没有定义。
 *
 * 2026-10-10 加了「时间线」—— 用户定的新空间，**取代** `16-ALBUM_SPACE.md` §6
 * 的 Library 抽屉（不并存）。
 *
 * 有意的：**入口宁可少，也不要留点不动的**。Album（第一屏）还是 Round 5 的事。
 *
 * ── 2026-10-10：左上角的「返回」搬走了 ────────────────────────────────
 *
 * 原先粒子模式的出口和 `MEMORY` 叠在同一格交叉淡化（`16 §8.6`）。
 * 用户的原话是「放左上角交互不顺畅」—— 点进去的按钮在画面正下方，
 * 要出来却得跑到屏幕对角去找。
 *
 * 现在出口在 `MemorySpace` 里，和「Into this moment」同一格。
 * `16 §8.6` 里真正要紧的部分（不加箭头图标、不换文字样式、用溶解同一条缓动）
 * 仍然成立，只是换了格子。
 */
const NAV_ITEMS = [
  { href: "/", label: "Memories" },
  { href: "/timeline", label: "时间线" },
] as const;

export function TopNavigation() {
  const pathname = usePathname();
  const setControlsOpen = useExperience((s) => s.setControlsOpen);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between px-12 pt-8">
      {/* 左上角：常驻的空间入口。
          这里已经不承担「返回」了 —— 那是 MemorySpace 里那一格的事，
          见本文件顶部的说明。 */}
      <div className="pointer-events-auto relative">
        <Link
          href="/"
          className="text-micro block text-text-primary/55 transition-opacity duration-[350ms] hover:opacity-100 focus-visible:opacity-100"
          style={{ transitionTimingFunction: "var(--ease-enter)" }}
        >
          MEMORY
        </Link>
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
