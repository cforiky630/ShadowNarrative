/**
 * 体验状态机与显示模式
 *
 * 来源：docs/specs/
 *   - 体验状态机      04-UX_INTERACTION_SPEC.md §2 与 05-TECH_ARCHITECTURE.md §9
 *   - 显示模式        16-ALBUM_SPACE.md §8
 */

/**
 * 体验状态机。
 *
 * 定义在 04-UX_INTERACTION_SPEC.md §2 与 05-TECH_ARCHITECTURE.md §9，三处必须一致。
 * 原设计里的 SCATTER / ASSEMBLE 两个阶段已随「原地滑动」的转场决定取消。
 */
export type ExperienceMode =
  | "rest"
  | "explore"
  | "focus"
  | "interact"
  | "orbit"
  | "morphing"
  | "story"
  | "journal"
  | "conversation";

/**
 * 原图 ⇄ 粒子。
 *
 * 放在全局状态而不是局部 state：写它的是照片页的文字层
 * （那一格里的「Into this moment / 返回」，16 §8.6），而读它的是
 * `ExperienceShell` 里的画布 —— 画布在 layout 里、不在页面里，两棵子树不相邻。
 */
export type DisplayMode = "photo" | "particle";
