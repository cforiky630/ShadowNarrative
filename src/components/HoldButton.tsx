"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
// ⚠️ 样式从这个组件里直接 import，**不走 globals.css 的 @import**。
// 那条坑（@import 必须集中在最前面，挂后面的会被静默丢弃）见
// `accordion-gallery.css` 的说明 —— 两个上游组件同一条处理。
import "@/styles/hold-button.css";

/**
 * HoldButton —— 来自 React Bits（https://reactbits.dev）。
 *
 * 「按住不放才生效」的确认按钮：一条液体从左侧漫过来，漫满才触发。
 * 用于**不可逆**的动作，让确认变成一件有重量的事，而不是再点一下。
 *
 * ── 相对上游改了五处，每一处都有理由 ──────────────────────────────
 *
 * 1. **TypeScript。** 项目全量 strict，上游是 JS + 无类型 props。
 *
 * 2. **自定义 CSS 属性那一下要断言。** 上游把 `--hb-radius` 这些直接写在
 *    `style` 里（React 运行时支持），TS 的 `CSSProperties` 不认 ——
 *    断言成 `CSSProperties` 而不是铺成 `any`。
 *
 * 3. **`@layer components`。** 项目其余组件样式都归在这一层里
 *    （见 `components.css`），这份也照办，否则它会盖住 Tailwind 的工具类。
 *
 * 4. **「最新的 release」那个 ref 改在 effect 里赋值。** 上游是在渲染期
 *    直接写 `releaseRef.current = release`，那正是 `react-hooks/refs` 拦的
 *    东西 —— 而且它拦得对：渲染期写的 ref，在严格模式的双渲染下写两次，
 *    读到的可能是被丢弃的那一棵。见 `releaseRef` 那一段。
 *
 * 5. **动画的钟改用 `requestAnimationFrame` 的时间戳**，不再在 `drive` /
 *    `complete` 里调 `performance.now()`。`rAF` 本来就把时间戳递给回调，
 *    而那正是这一帧该用的钟；顺带绕开了 `react-hooks/purity`
 *    （它保守地认为组件体里定义的函数可能在渲染期跑 —— 这两处其实不会）。
 *    起点因此比 `drive()` 被调用晚一帧，察觉不到。
 *
 * 其余逐行为准，**包括那些看起来可以合并的 ref / effect** ——
 * `motion` 与 `timers` 分开是为了卸载时能各自清干净，合并会改变行为。
 *
 * ── 输入方式都接了 ────────────────────────────────────────────────
 *
 * 指针（按住 / 移开取消 / 指针捕获）、键盘（空格与回车，Escape 取消）、
 * 触摸（`pointerType === 'touch'` 时不靠 pointerleave 判断，而是看移动）、
 * 以及窗口失焦 / 标签页隐藏时自动取消。别删其中任何一条：少一条就有一种
 * 输入方式按下去卡在 holding 里出不来。
 */

/** 短于这个时长的松开算「点一下」，走 `onTap`。 */
const TAP_MS = 250;

/** 指针可以漂出按钮多远还不算离开（px）。手指比鼠标抖。 */
const HIT_PAD = 10;

/** 匀速。填充是**进度**，不是过渡 —— 所以它不套缓动曲线。 */
const LINEAR = (t: number) => t;

const EASE_OUT = (t: number) => 1 - Math.pow(1 - t, 3);

export interface HoldButtonProps {
  /** 空闲与按住时显示的字 */
  children?: ReactNode;
  /** 完成之后模糊着浮上来的字 */
  doneLabel?: ReactNode;
  icon?: ReactNode;
  doneIcon?: ReactNode;
  backgroundColor?: string;
  /** 液体的颜色。它的波浪、辉光、焦点环都跟着它 */
  fillColor?: string;
  textColor?: string;
  /** 填充里那层字的颜色 —— 液面越过它时，字的颜色反转 */
  fillTextColor?: string;
  size?: "sm" | "md" | "lg";
  /** 本体、填充、焦点环三者的圆角（px） */
  radius?: number;
  fillDirection?: "right" | "up";
  /** 要按住多久（ms）。填充**匀速**走完这么久 */
  holdTime?: number;
  /** 提前松手或重置时，液体缩回去多快（ms） */
  releaseTime?: number;
  /** 按住时缩多少。1 = 不缩 */
  pressScale?: number;
  wave?: boolean;
  waveAmplitude?: number;
  /** 蓄力时亮起来、完成时跳一下的辉光 */
  glow?: boolean;
  /** 完成态停留多久再回到空闲。0 = 一直留着 */
  resetAfter?: number;
  disabled?: boolean;
  /** 填充漫满的那一帧调一次 */
  onHold?: () => void;
  /** 短于 TAP_MS 松开、且指针没漂远时调 */
  onTap?: () => void;
  className?: string;
}

type Phase = "idle" | "holding" | "done";
type InputKind = "pointer" | "key" | null;

export default function HoldButton({
  children = "Hold to delete",
  doneLabel = "Deleted",
  icon = null,
  doneIcon = null,
  backgroundColor = "#27272a",
  fillColor = "#5227FF",
  textColor = "#f5f5f5",
  fillTextColor = "#ffffff",
  size = "md",
  radius = 14,
  fillDirection = "right",
  holdTime = 2000,
  releaseTime = 200,
  pressScale = 0.97,
  wave = true,
  waveAmplitude = 6,
  glow = true,
  resetAfter = 1200,
  disabled = false,
  onHold,
  onTap,
  className = "",
}: HoldButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [input, setInput] = useState<InputKind>(null);
  const phaseRef = useRef<Phase>("idle");
  const inputRef = useRef<InputKind>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{
    pointerId: number | null;
    start: number;
    rect: DOMRect | null;
  }>({ pointerId: null, start: 0, rect: null });
  const timers = useRef<{ complete: ReturnType<typeof setTimeout> | 0; reset: ReturnType<typeof setTimeout> | 0 }>(
    { complete: 0, reset: 0 },
  );
  const hintId = useId();

  const go = (next: Phase, kind: InputKind = null) => {
    phaseRef.current = next;
    inputRef.current = kind;
    setPhase(next);
    setInput(kind);
  };

  const clearTimers = () => {
    clearTimeout(timers.current.complete || undefined);
    clearTimeout(timers.current.reset || undefined);
  };

  const motion = useRef({ raf: 0, p: 0, from: 0, to: 0, start: 0 });
  const drive = (to: number, duration: number, ease: (t: number) => number) => {
    const m = motion.current;
    cancelAnimationFrame(m.raf);
    m.from = m.p;
    m.to = to;
    /*
     * ⚠️ 起点取**第一帧的时间戳**，不调 `performance.now()`（上游是调的）。
     *
     * 两件事一起解决：`requestAnimationFrame` 本来就把时间戳递给回调，
     * 那正是这一帧该用的钟；而且组件体里调 `performance.now()` 会被
     * `react-hooks/purity` 拦下 —— 它保守地认为组件体里定义的函数可能在渲染期跑。
     *
     * 代价是动画起点比 `drive()` 被调用的那一刻晚一帧（≤16ms），察觉不到。
     */
    m.start = 0;
    const step = (now: number) => {
      if (m.start === 0) m.start = now;
      const t = duration > 0 ? Math.min(1, (now - m.start) / duration) : 1;
      m.p = m.from + (m.to - m.from) * ease(t);
      buttonRef.current?.style.setProperty("--hb-p", m.p.toFixed(4));
      if (t < 1) {
        m.raf = requestAnimationFrame(step);
        return;
      }
      m.raf = 0;
      if (m.to === 1) complete(now - gesture.current.start);
    };
    m.raf = requestAnimationFrame(step);
  };

  /**
   * 填充漫满了。
   *
   * @param elapsed 这一按已经过去多久（ms）。由 `drive` 从 rAF 的时间戳算好
   *   传进来 —— **不在这里调 `performance.now()`**，理由同 `drive`。
   *   漏帧时那条 `setTimeout` 兜底传的是名义时长，因为它管的就是「时间到了、
   *   但帧没跑够」这种情况。
   */
  const complete = (elapsed: number) => {
    if (phaseRef.current !== "holding") return;
    if (elapsed < holdTime - 50) return;
    clearTimers();
    go("done", inputRef.current);
    onHold?.();
    if (resetAfter > 0) {
      timers.current.reset = setTimeout(() => {
        go("idle");
        drive(0, releaseTime, EASE_OUT);
      }, resetAfter);
    }
  };

  const begin = (kind: "pointer" | "key") => {
    if (disabled || phaseRef.current !== "idle") return false;
    const button = buttonRef.current;
    if (!button) return false;
    gesture.current.start = performance.now();
    gesture.current.rect = button.getBoundingClientRect();
    go("holding", kind);
    drive(1, holdTime, LINEAR);
    // 兜底：万一 rAF 被节流到跑不完，时间到了也得收场
    timers.current.complete = setTimeout(
      () => complete(holdTime),
      holdTime + 100,
    );
    return true;
  };

  const release = ({ drifted = false }: { drifted?: boolean } = {}) => {
    if (phaseRef.current !== "holding") return;
    clearTimers();
    const held = performance.now() - gesture.current.start;
    go("idle");
    drive(0, releaseTime, EASE_OUT);
    if (!drifted && held < TAP_MS) onTap?.();
  };
  /**
   * 「最新的 release」。
   *
   * ⚠️ 上游是在**渲染期**直接赋值（`releaseRef.current = release`），
   * 那正是 `react-hooks/refs` 拦的东西 —— 而且它拦得对：渲染期写的 ref
   * 在严格模式的双渲染下会写两次，读到的可能是被丢弃的那一棵的。
   *
   * 改到 effect 里赋值（不写依赖数组，每次渲染后同步一次），
   * 语义不变：下面那个 window `blur` 的监听不必因为 `release` 每次重建
   * 而反复解绑重绑。
   */
  const releaseRef = useRef(release);
  useEffect(() => {
    releaseRef.current = release;
  });

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !e.isPrimary || gesture.current.pointerId !== null) return;
    if (!begin("pointer")) return;
    gesture.current.pointerId = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 指针捕获在个别环境下会抛（比如元素已经卸载）。不该因此中断按住
    }
  };

  const endPointer = (
    e: ReactPointerEvent<HTMLButtonElement>,
    options?: { drifted?: boolean },
  ) => {
    if (e.pointerId !== gesture.current.pointerId) return;
    gesture.current.pointerId = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // 同 setPointerCapture：释放失败不影响后续判断
    }
    release(options);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== gesture.current.pointerId) return;
    const r = gesture.current.rect;
    if (!r) return;
    const out =
      e.clientX < r.left - HIT_PAD ||
      e.clientX > r.right + HIT_PAD ||
      e.clientY < r.top - HIT_PAD ||
      e.clientY > r.bottom + HIT_PAD;
    if (out) endPointer(e, { drifted: true });
  };

  const handlePointerLeave = (e: ReactPointerEvent<HTMLButtonElement>) => {
    // 触摸不靠 pointerleave 判断 —— 手指抬起来才算离开，滑动不该取消
    if (e.pointerType !== "touch") endPointer(e, { drifted: true });
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      if (inputRef.current === "key") release({ drifted: true });
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!e.repeat) begin("key");
    }
  };

  const handleKeyUp = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (inputRef.current === "key") release();
    }
  };

  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) return undefined;
    const measure = () => {
      button.style.setProperty("--hb-w", `${button.offsetWidth}px`);
      button.style.setProperty("--hb-h", `${button.offsetHeight}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(button);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (phase !== "holding") return undefined;
    // 窗口失焦 / 切走标签页时取消 —— 否则回来它已经自己完成了
    const cancel = () => releaseRef.current({ drifted: true });
    const onVisibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase]);

  useEffect(() => {
    const t = timers.current;
    const m = motion.current;
    return () => {
      clearTimeout(t.complete || undefined);
      clearTimeout(t.reset || undefined);
      cancelAnimationFrame(m.raf);
    };
  }, []);

  const direction = fillDirection === "up" ? "up" : "right";
  const labels = (
    <>
      <span className="hold-button__idle" aria-hidden={phase === "done"}>
        {icon ? <span className="hold-button__icon">{icon}</span> : null}
        {children}
      </span>
      <span className="hold-button__done" aria-hidden={phase !== "done"}>
        {doneIcon ? <span className="hold-button__icon">{doneIcon}</span> : null}
        {doneLabel}
      </span>
    </>
  );

  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled}
      className={`hold-button hold-button--${size}${className ? ` ${className}` : ""}`}
      data-phase={phase}
      data-input={input ?? undefined}
      data-direction={direction}
      data-glow={glow ? "true" : undefined}
      aria-describedby={hintId}
      style={
        {
          "--hb-radius": `${radius}px`,
          "--hb-bg": backgroundColor,
          "--hb-fill": fillColor,
          "--hb-text": textColor,
          "--hb-fill-text": fillTextColor,
          "--hb-hold": `${holdTime}ms`,
          "--hb-cycles": holdTime / 1100,
          "--hb-release": `${releaseTime}ms`,
          "--hb-press": pressScale,
          "--hb-wave": `${wave ? waveAmplitude : 0}px`,
        } as CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => endPointer(e)}
      onPointerCancel={(e) => endPointer(e, { drifted: true })}
      onLostPointerCapture={(e) => endPointer(e, { drifted: true })}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="hold-button__pulse" aria-hidden="true" />
      <span className="hold-button__label">{labels}</span>
      <span className="hold-button__clip" aria-hidden="true">
        <span className="hold-button__fill">
          <span className="hold-button__label hold-button__label--fill">
            {labels}
          </span>
        </span>
        <span className="hold-button__crest" aria-hidden="true">
          <span className="hold-button__label hold-button__label--fill">
            {labels}
          </span>
        </span>
      </span>
      {/*
        读屏器拿不到「液体漫到哪了」，所以只能把要求写出来 ——
        这是这个控件唯一可访问的说明。
      */}
      <span id={hintId} className="hold-button__sr">
        按住 {Math.round(holdTime / 100) / 10} 秒以确认
      </span>
    </button>
  );
}
