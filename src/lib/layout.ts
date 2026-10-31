/**
 * 页面外壳布局常量（02-DESIGN_SYSTEM.md §16）。
 *
 * 统一所有滚动类内容页面（时间线、影册架子、单册浏览、多选整理面板）的内边距与最大栏宽，
 * 消除跨空间切换时的页面跳动与视觉突兀感。
 *
 * 布局规则：
 * - 基础规格：`max-w-[880px]` + `px-12` + `pt-32 pb-32`。
 * - 轴心对齐：时间线以栏中心为脊柱，收窄栏宽两端留白，不影响轴线与内容坐标。
 * - 面板一致：整理面板采用相同规格覆盖在对应单册上，开合时保持内容无横向位移。
 * - 顶栏对齐：横向 `px-12` 与全局顶栏品牌标识（Shadow Narrative）严格左对齐。
 *
 * ⚠️ 舞台豁免：
 * 首屏相册（AlbumSpace）与单张照片页（Photo View）为沉浸式满屏舞台，
 * 尺寸遵循媒体框比例自适应，不套用固定栏宽。
 */

/** 页面的内边距。整理照片那张面板只要这一半（它自己是 `fixed` 的整屏层） */
export const PAGE_PAD = "px-12 pt-32 pb-32";

/** 页面外壳：整屏高 + `PAGE_PAD`。给 `<main>` 用 */
export const PAGE_SHELL = `min-h-dvh ${PAGE_PAD}`;

/** 页面里那一栏。与 `PAGE_SHELL` 配套 */
export const PAGE_INNER = "mx-auto w-full max-w-[880px]";
