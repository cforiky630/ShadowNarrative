"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 顶部导航。
 *
 * 规格：02-DESIGN_SYSTEM.md §12、07-UI_PAGE_SPECS.md §1
 *   - 低存在感：非交互态 opacity 0.40，hover/focus 0.85
 *   - text-micro，字距 +0.08em
 *   - 顶部 32px，左右边距 48px
 *
 * ── 右上角只剩一个空间入口 ──────────────────────────────────────────
 *
 * 2026-10-09 删掉了 `/journal` 与 `/create` —— **两个路由都不存在**，
 * 点进去是 404；2026-10-10 又删掉「Memories」—— 它指向 `/`，和左上角的
 * 项目名是同一条去路，而用户说它「暂时还没做，后续做图库的效果」。
 * 图库做出来时再加回来，那时它指的应该是 `01 §5` 的 Memory Theater 那一族，
 * 不是相册。
 *
 * 守的是同一条：**入口宁可少，也不要留点不动的。**
 *
 * ⚠️ **2026-10-10：`参数` 从这里搬走了。** 用户要求「参数调整和设置做法
 * 一样放在左下」，它现在是左下角那颗胶囊上的第一格（`BottomDock`）。
 * 判据没变 —— 有粒子的地方才有参数可调 —— 只是换了地方，而且现在由胶囊
 * 自己按 `stage.space` 决定那一格在不在。
 *
 * ⚠️ 同一天 `时间线` 改成了 `Timeline`。这一列是**空间的名字**，而空间名
 * 一直是英文（`02 §12` 的 `MEMORY` / `Memories`），`Into this moment`、
 * `Back`、四个预设也都是英文 —— 只夹着一个中文项，反倒是它不协调。
 *
 * ── 左上角是项目名，也是唯一的「回第一屏」 ──────────────────────────
 *
 * 用户 2026-10-10：「最左边那个 memory 改成项目名，点击跳转到画廊界面」。
 * 在那之前它还兼过粒子模式的出口（和 `MEMORY` 叠在同一格交叉淡化），
 * 后来那个出口搬进了 `MemorySpace`，与「Into this moment」同一格
 * （`16 §8.6`）—— 点进去的门在画面正下方，出口不该跑到屏幕对角去找。
 */
const NAV_ITEMS = [
  { href: "/timeline", label: "Timeline" },
] as const;

export function TopNavigation() {
  const pathname = usePathname();

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between px-12 pt-8">
      {/*
        左上角：**项目名**，点它回画廊。

        用户 2026-10-10：「最左边那个 memory 改成项目名，点击跳转到画廊界面」。
        所以这里不再是 `MEMORY` 这个空间名 —— 它是品牌的落点，
        落在第一屏（`/`，相册）上，和顶栏右侧那些「去哪个空间」的入口不同。

        这里也不承担「返回」了 —— 那是 MemorySpace 里那一格的事，
        见本文件顶部的说明。
      */}
      <div className="pointer-events-auto relative">
        <Link
          href="/"
          className="text-micro block text-text-primary opacity-55 transition-opacity duration-[350ms] hover:opacity-100 focus-visible:opacity-100"
          style={{ transitionTimingFunction: "var(--ease-enter)" }}
        >
          Shadow Narrative
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
              className="text-micro text-text-primary opacity-40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
              style={{ transitionTimingFunction: "var(--ease-enter)" }}
            >
              {item.label}
            </Link>
          );
        })}

        {/*
          粒子参数**从这里搬走了**（2026-10-10）。用户要求「参数调整和设置
          做法一样放在左下」—— 它现在是左下角那颗胶囊上的第一格
          （`BottomDock`），卡片是 `ParticleControls`。

          判据没变，只是换了地方：**有粒子的地方才有参数可调**。胶囊自己
          按 `stage.space === "photo"` 决定那一格在不在。
        */}
      </nav>
    </header>
  );
}
