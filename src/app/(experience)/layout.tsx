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
 * ⚠️ 设置不在任何路由里（2026-10-10 起）。它是根布局上的 `SettingsPanel`
 * —— 一张从右下角悬浮球长出来的浮卡，所以它**同时**在体验页和别的页面上，
 * 不属于这个组也不属于别的组。`07 §11.1` 里「设置是唯一允许长成普通页面的
 * 地方」那条已经作废：现在整个产品一个普通页面都没有。
 */
export default function ExperienceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ExperienceShell>{children}</ExperienceShell>;
}
