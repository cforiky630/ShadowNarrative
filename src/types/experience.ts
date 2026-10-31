/**
 * 显示模式
 *
 * 来源：docs/specs/16-ALBUM_SPACE.md §8
 *
 * 原 `ExperienceMode`（rest / explore / focus / …）是 Round 1 的状态机模型，
 * 实现里从未被读写过 —— 2026-10-31 随死代码一起删掉。真正的模式只分两层：
 * 「原图 ⇄ 粒子」（本文件）与「哪个空间」（`store/experience.ts` 的 `stage.space`）。
 */

/**
 * 原图 ⇄ 粒子。
 *
 * 放在全局状态而不是局部 state：写它的是照片页的文字层
 * （那一格里的「Into this moment / 返回」，16 §8.6），而读它的是
 * `ExperienceShell` 里的画布 —— 画布在 layout 里、不在页面里，两棵子树不相邻。
 */
export type DisplayMode = "photo" | "particle";
