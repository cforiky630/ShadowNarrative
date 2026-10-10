import { ExperienceShell } from "@/components/ExperienceShell";

/**
 * 记忆体验的路由组。
 *
 * 括号是 Next 的路由组语法：**不影响 URL**。`(experience)/page.tsx` 还是 `/`，
 * `(experience)/timeline/page.tsx` 还是 `/timeline`。
 *
 * ── 为什么要这一层 ──────────────────────────────────────────────────
 *
 * 2026-10-10：粒子画布从 `MemorySpace` 提到了这里，因为**它必须在路由切换时
 * 存活**。长在任何一条路由的组件树里，路由一换它就卸载重建 ——
 * 那正是「时间线 → 照片」读起来像硬跳转、还夹一段空白的原因。
 *
 * 放进 layout，两条路由就都是它的孩子：换路由换掉的是孩子，画布不动。
 * 于是时间线和照片页不是两个页面，是同一个空间的两个状态 ——
 * `01-PRODUCT_SPEC.md` §5。
 *
 * ⚠️ **设置页刻意不在这个组里**（`07-UI_PAGE_SPECS.md` §11.1）。
 * 它是体验之外的配置层，是唯一允许长成普通页面的地方，
 * 没有理由陪着挂一块 WebGL 画布一起跑。
 */
export default function ExperienceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ExperienceShell>{children}</ExperienceShell>;
}
