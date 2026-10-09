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
const NAV_ITEMS = [
  { href: "/", label: "Memories" },
  { href: "/journal", label: "Journal" },
  { href: "/create", label: "Create" },
] as const;

/** 与溶解同步的交叉淡化 */
const CROSSFADE = "opacity var(--duration-morph) var(--ease-morph)";

export function TopNavigation() {
  const pathname = usePathname();
  const setControlsOpen = useExperience((s) => s.setControlsOpen);
  const displayMode = useExperience((s) => s.displayMode);
  const setDisplayMode = useExperience((s) => s.setDisplayMode);

  const inParticle = displayMode === "particle";

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between px-12 pt-8">
      {/* 左上角：MEMORY 与「返回」叠在同一位置交叉淡化。
          不做瞬间替换 —— 那会读成"换了一页"。 */}
      <div className="pointer-events-auto relative">
        <Link
          href="/"
          aria-hidden={inParticle}
          tabIndex={inParticle ? -1 : 0}
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
          onClick={() => setDisplayMode("photo")}
          aria-hidden={!inParticle}
          tabIndex={inParticle ? 0 : -1}
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
      </nav>
    </header>
  );
}
