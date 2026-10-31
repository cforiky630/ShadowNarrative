"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type {
  DisplayMode,
  EngineStats,
  ParticleSystem,
} from "@/engine/particle/ParticleSystem";
import { useExperience } from "@/store/experience";
import type { PerformanceTier } from "@/types";

export interface ParticleCanvasHandle {
  setImage: (bitmap: ImageBitmap) => Promise<void>;
  morphTo: (bitmap: ImageBitmap) => Promise<void>;
  /** 原图 ⇄ 粒子。见 `16-ALBUM_SPACE.md` §8 */
  setMode: (mode: DisplayMode, options?: { immediate?: boolean }) => void;
  /** 回到正视角。旋转是探索，但用户需要随时能回到「照片」。 */
  resetView: (options?: { immediate?: boolean }) => void;
  /**
   * 照片此刻在视口里的矩形。给「从时间线推入」算 FLIP 终点用。
   * 引擎还没装上图时为 null。
   */
  photoScreenRect: () => { x: number; y: number; w: number; h: number } | null;
}

interface ParticleCanvasProps {
  ref?: Ref<ParticleCanvasHandle>;
  className?: string;
  /** 粒子云占视口高度的比例。首页用约 0.62，给下方文字留位置（07 §1）。 */
  fillHeight?: number;
  /** 垂直偏移，视口高度的比例。正数把画面往上推（07 §1 要求 4%）。 */
  offsetY?: number;
  /** 设备不支持 WebGL2 / 软件渲染时触发，调用方应走静态降级（15 §7） */
  onUnsupported?: () => void;
  onStats?: (s: EngineStats) => void;
  /** 视角在「正对」与「已旋转」之间切换时触发 */
  onViewChange?: (rotated: boolean) => void;
  /**
   * 引擎初始化完成（档位已定、可以 `photoScreenRect()`）。
   *
   * 外壳用它等「飞行终点的计算能力」—— 懒加载之后引擎不是同步存在的，
   * 没就绪时 `photoScreenRect()` 返回 null，飞行会被直接跳过。
   */
  onReady?: () => void;
  /**
   * 停掉渲染循环。
   *
   * 2026-10-10：画布搬进 `(experience)/layout` 之后，它**在所有路由上都在**——
   * 包括时间线。时间线是纯 DOM 空间，画布那一层只是藏起来（opacity 0），
   * 不停的话 15 万粒子会一直在没人看的地方跑满一个核。
   * 改动之前画布只存在于照片页，不存在这个问题 —— 所以这是这次改动**带来的**账。
   */
  paused?: boolean;
}

/**
 * 粒子画布的 React 外壳。
 *
 * 职责边界（05-TECH_ARCHITECTURE.md §18）：
 *   这里只做三件事 —— 挂载引擎、把 store 的「意图」下发、把指针转成归一化坐标。
 *   引擎内部按自己的 RAF 循环跑，React 不参与渲染路径，也从不因为粒子而重渲染。
 */
export function ParticleCanvas({
  ref,
  className,
  fillHeight = 1,
  offsetY = 0,
  onUnsupported,
  onStats,
  onViewChange,
  onReady,
  paused = false,
}: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ParticleSystem | null>(null);
  /*
   * 引擎（连同 three）是按需加载的独立 chunk，不进首屏 JS。
   * 加载完成之前，句柄上的异步方法（setImage / morphTo）要**排队**而不是
   * 静默丢弃 —— 以前引擎是同步创建的，调用方（外壳、拖入照片）从没遇到过
   * 「引擎还没有」的窗口，这里把这个窗口补成「等一下再执行」。
   * 卸载或加载失败时 resolve 为 null。
   */
  const enginePromiseRef = useRef<Promise<ParticleSystem | null>>(
    Promise.resolve(null),
  );
  const [ready, setReady] = useState(false);

  const params = useExperience((s) => s.params);
  const tier = useExperience((s) => s.tier);
  const reducedMotion = useExperience((s) => s.reducedMotion);
  const displayMode = useExperience((s) => s.displayMode);
  const setTier = useExperience((s) => s.setTier);

  // 回调放进 ref，既能拿到最新的，又不会因为它们变化而重建引擎。
  // 只在 effect 里写 —— React 19 的 lint 规则禁止在渲染期访问 ref.current。
  const onStatsRef = useRef(onStats);
  const onUnsupportedRef = useRef(onUnsupported);
  const onViewChangeRef = useRef(onViewChange);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onStatsRef.current = onStats;
    onUnsupportedRef.current = onUnsupported;
    onViewChangeRef.current = onViewChange;
    onReadyRef.current = onReady;
  }, [onStats, onUnsupported, onViewChange, onReady]);

  useImperativeHandle(
    ref,
    () => ({
      setImage: async (bitmap: ImageBitmap) => {
        const engine = await enginePromiseRef.current;
        await engine?.setImage(bitmap);
        engine?.start();
      },
      morphTo: async (bitmap: ImageBitmap) => {
        const engine = await enginePromiseRef.current;
        await engine?.morphTo(bitmap);
      },
      setMode: (mode, options) => {
        if (engineRef.current) {
          engineRef.current.setMode(mode, options);
        } else {
          void enginePromiseRef.current.then((e) => e?.setMode(mode, options));
        }
      },
      resetView: (options) => {
        if (engineRef.current) {
          engineRef.current.resetView(options);
        } else {
          void enginePromiseRef.current.then((e) => e?.resetView(options));
        }
      },
      photoScreenRect: () => engineRef.current?.photoScreenRect() ?? null,
    }),
    [],
  );

  // 引擎生命周期管理
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let engine: ParticleSystem | null = null;

    const enginePromise = import("@/engine/particle/ParticleSystem")
      .then(({ ParticleSystem }) => {
        // 动态加载期间已经卸载（含 StrictMode 的首轮 effect）：不创建
        if (cancelled) return null;

        engine = new ParticleSystem({
          canvas,
          // 直接读 store 的当前值，不经过 ref —— 避免 init 时序依赖
          params: useExperience.getState().params,
          tierOverride: readTierOverride(),
          fillHeight,
          offsetY,
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches,
          onUnsupported: () => onUnsupportedRef.current?.(),
          onStats: (s) => onStatsRef.current?.(s),
          onViewChange: (r) => onViewChangeRef.current?.(r),
          // 引擎自己降档时回报给 store，让 UI（debug overlay、控制面板）同步
          onTierChange: (t) => setTier(t),
        });
        engineRef.current = engine;

        // 开发期把引擎挂到 window，方便在 devtools 里检查状态（06 §19 debug mode）
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as { __snEngine?: ParticleSystem }).__snEngine =
            engine;
        }
        return engine;
      })
      .catch(() => {
        // chunk 加载失败：和设备不支持 WebGL 一样走静态降级（15 §7）
        if (!cancelled) onUnsupportedRef.current?.();
        return null;
      });
    enginePromiseRef.current = enginePromise;

    void enginePromise.then(async (created) => {
      if (!created) return;
      const initialTier = await created.init();
      if (cancelled) {
        created.dispose();
        return;
      }
      if (initialTier === null) return; // onUnsupported 已触发
      setReady(true);
      onReadyRef.current?.();
    });

    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
      enginePromiseRef.current = Promise.resolve(null);
    };
    // setTier 是 zustand 的稳定引用，不需要进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 参数下发
  useEffect(() => {
    engineRef.current?.setParams(params);
  }, [params]);

  // 档位更新
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !ready) return;
    if (engine.currentTier !== tier) engine.setTier(tier);
  }, [tier, ready]);

  // 渲染模式下发
  // 引擎自己会判重，模式没变就不播动画；所以初次挂载不会有多余的过渡。
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !ready) return;
    if (engine.currentMode !== displayMode) engine.setMode(displayMode);
  }, [displayMode, ready]);

  // 无障碍动态适配
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => useExperience.getState().setReducedMotion(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // 下发 reduced-motion 标志
  // 引擎异步创建，`ready` 之后要再下发一次，保证加载期间的变化不丢
  useEffect(() => {
    engineRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion, ready]);

  // 视口尺寸适配
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const ro = new ResizeObserver(() => engineRef.current?.resize());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [ready]);

  /*
   * 停/走渲染循环。
   *
   * `stop()` 只是把 `running` 置 false，循环尾巴上的
   * `if (this.running) requestAnimationFrame(...)` 就不再排下一帧；
   * `start()` 会重置 `lastFrameMs`，所以恢复时不会有一帧带着巨大的 dt。
   * 这是引擎本来就有的公开开关，不是新加的行为。
   */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !ready) return;
    if (paused) engine.stop();
    else engine.start();
  }, [paused, ready]);

  // 指针坐标转换
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      engineRef.current?.setPointerScreen(nx, ny);
    };
    const onLeave = () => engineRef.current?.clearPointer();

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointercancel", onLeave);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointercancel", onLeave);
    };
  }, [ready]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      // 触摸时不要触发浏览器的滚动与缩放手势，否则拖动会被抢走
      style={{ touchAction: "none" }}
    />
  );
}

/**
 * 读取 `?tier=` 强制档位（15-DEVICE_ADAPTATION.md §9）。
 *
 * 直接读 window.location，不走 Next 的 searchParams ——
 * 后者会把这个组件拖进 Suspense 边界，而这里只需要一个开发期的调试开关。
 */
function readTierOverride(): PerformanceTier | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("tier");
  if (!raw) return null;
  const allowed: PerformanceTier[] = ["ultra", "high", "medium", "low", "minimal"];
  return allowed.includes(raw as PerformanceTier)
    ? (raw as PerformanceTier)
    : null;
}
