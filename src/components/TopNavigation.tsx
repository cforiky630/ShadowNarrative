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
/*
 * 顶栏的空间入口。
 *
 * 2026-10-09 删掉了 `/journal` 与 `/create` —— **两个路由都不存在**，点进去是 404。
 *
 * 2026-10-10 加了「时间线」—— 用户定的新空间，**取代** `16-ALBUM_SPACE.md` §6
 * 的 Library 抽屉（不并存）。
 *
 * 2026-10-10 又删掉了「Memories」。两个原因：它指向 `/`，而 `/` 现在是相册
 * —— 和左上角的项目名**同一条去路**，两个入口摆在一起是重复的；
 * 而且用户说它「暂时还没做，后续做图库的效果」。按本文件一直守的那条
 * **入口宁可少，也不要留点不动的**，先撤下来。图库做出来时再加回来，
 * 那时它指的应该是 `01 §5` 的 Memory Theater 那一族，不是相册。
 */
const NAV_ITEMS = [
  { href: "/timeline", label: "时间线" },
] as const;

export function TopNavigation() {
  const pathname = usePathname();
  const setControlsOpen = useExperience((s) => s.setControlsOpen);
  /** 有粒子的地方才有参数可调 —— 见下面那个入口的说明 */
  const inPhoto = useExperience((s) => s.stage.space === "photo");

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
          className="text-micro block text-text-primary/55 transition-opacity duration-[350ms] hover:opacity-100 focus-visible:opacity-100"
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
              className="text-micro text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
              style={{ transitionTimingFunction: "var(--ease-enter)" }}
            >
              {item.label}
            </Link>
          );
        })}

        {/*
          粒子控制面板入口。**只在照片空间出现。**

          它是粒子参数的入口，而相册与时间线上根本没有粒子 —— 在那里点开
          只会得到一个控制不了任何东西的面板。按这个文件一直守的那条
          「入口宁可少，也不要留点不动的」，没粒子的时候它就不该在。

          `space` 由各空间组件声明（`stage.space` 的注释里有完整理由）；
          从时间线推入照片时 `enter()` 会**先**把它置成 `photo`，
          所以飞行途中这个入口已经在淡入了。
        */}
        {inPhoto && (
          <button
            type="button"
            onClick={() => setControlsOpen(true)}
            aria-label="粒子参数"
            className="text-micro text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            参数
          </button>
        )}

        {/*
          设置**从这里搬走了**（2026-10-10）。用户要求「设置做成组件，
          不用单页，用一个齿轮图标放到右下角悬浮」—— 现在是
          `SettingsPanel`，挂在根布局上，入口只有那颗齿轮。

          规格没变的部分：它仍然不进 `NAV_ITEMS`（那个数组是「空间」），
          也仍然**不混进照片旁边**（`07 §11.1`）。变的是形态。
        */}
      </nav>
    </header>
  );
}
