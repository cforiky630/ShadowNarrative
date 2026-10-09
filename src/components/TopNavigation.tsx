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
 */
const NAV_ITEMS = [
  { href: "/", label: "Memories" },
  { href: "/journal", label: "Journal" },
  { href: "/create", label: "Create" },
] as const;

export function TopNavigation() {
  const pathname = usePathname();
  const setControlsOpen = useExperience((s) => s.setControlsOpen);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between px-12 pt-8">
      <Link
        href="/"
        className="text-micro pointer-events-auto text-text-primary/55 transition-opacity duration-[350ms] hover:opacity-100 focus-visible:opacity-100"
        style={{ transitionTimingFunction: "var(--ease-enter)" }}
      >
        MEMORY
      </Link>

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
