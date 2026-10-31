/**
 * 键盘事件过滤工具：识别并排除输入法（IME）组字过程中的按键。
 *
 * 核心背景与交互约束：
 *
 * 在使用 CJK（中/日/韩）输入法时：
 * - Esc 键语义为「取消输入法当前候选」，而非「关闭上层浮层/退出编辑」。
 * - Enter 键语义为「确认输入法当前候选」，而非「提交表单/发送消息」。
 * 若未进行 IME 拦截，keydown 事件冒泡至 window 会误触发浮层关闭或空提交：
 * 导致对话面板、随笔小记遮罩层或时间线改名输入框被意外关闭。
 *
 * 双重判定依据：
 *
 * 1. `isComposing === true`：标准 W3C 字段，处于 IME 组字期间。
 * 2. `keyCode === 229` 或 `key === "Process"`：针对部分浏览器（如 Safari）在
 *    组字结束瞬间派发事件时 `isComposing` 已提前置 false 的边缘情况进行兜底。
 *
 * ⚠️ React 合成事件（SyntheticEvent）兼容说明：
 * React 未直接在合成事件顶层同步 `isComposing`，必须读取 `e.nativeEvent.isComposing`。
 *
 * 约束：所有监听 Esc / Enter 的全局或组件级按键处理器，均应优先调用 `isImeKey(e)`
 * 进行守卫过滤。
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
