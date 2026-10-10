/**
 * 键盘事件里那一类**不属于界面**的按键。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────
 *
 * 用中文（以及日文、韩文）输入法打字时，**Esc 是「取消这次候选」、
 * Enter 是「选这个候选」**。组字期间那两个键是输入法的，不是给界面的 ——
 * 但 `keydown` 照样冒到 `window`，于是：
 *
 * - 在对话里按一下 Esc 取消候选 → **整层浮层关掉**，聊到一半的东西没了
 * - 在随笔小记里按 Esc → 同上
 * - 在时间线给某一天起名时按 Esc → 名字没了、编辑态退出
 *
 * 用户 2026-10-10 报的就是第一条：「对话也总是会被打断」。**「总是」是对的** ——
 * 用中文打字的人一天要取消几十次候选。
 *
 * ── 判据两条都要 ──────────────────────────────────────────────────────
 *
 * 1. `isComposing` —— 标准字段，组字期间为 `true`
 * 2. `keyCode === 229` —— 有些浏览器（尤其 Safari）在组字**结束那一下**才发
 *    事件，那时 `isComposing` 已经是 `false`，只剩这个老字段还写着
 *    「这一下是输入法的」。`key === "Process"` 是同一件事的新写法
 *
 * ⚠️ **React 合成事件上没有 `isComposing`。** 它只搬一部分字段过来，
 * 而 `isComposing` 不在那份名单里 —— 所以写 `onKeyDown` 的那些地方
 * （对话的输入框、两个起名框）拿到的是 `undefined`。真值在
 * `e.nativeEvent` 上，这个函数替调用方去那儿取。
 * **这一条是实测出来的**：影册的改名框里，组字中的 Esc 照旧把编辑态退了。
 *
 * ⚠️ **每个按键处理器都该先问这一句**，哪怕它所在的界面当下「不可能有输入框」。
 * 那是会变的（设置卡就加过又删过输入框），而这一句的代价是零。
 */

/** 只用到这几个字段，原生事件与 React 合成事件都满足 */
interface KeyLike {
  isComposing?: boolean;
  keyCode?: number;
  key?: string;
  /** React 合成事件带的原生事件 —— 那个上面才有真的 `isComposing` */
  nativeEvent?: unknown;
}

export function isImeKey(e: KeyLike): boolean {
  const native = e.nativeEvent as KeyLike | undefined;
  const src = native && typeof native === "object" ? native : e;

  return (
    src.isComposing === true || src.keyCode === 229 || src.key === "Process"
  );
}
