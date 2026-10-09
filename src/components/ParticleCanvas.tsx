"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  ParticleSystem,
  type DisplayMode,
  type EngineStats,
} from "@/engine/particle/ParticleSystem";
import { selectEffectiveTier, useExperience } from "@/store/experience";
import type { PerformanceTier } from "@/types";

export interface ParticleCanvasHandle {
  setImage: (bitmap: ImageBitmap) => Promise<void>;
  morphTo: (bitmap: ImageBitmap) => Promise<void>;
  /** 原图 ⇄ 粒子。见 `16-ALBUM_SPACE.md` §8 */
  setMode: (mode: DisplayMode, options?: { immediate?: boolean }) => void;
  /** 回到正视角。旋转是探索，但用户需要随时能回到「照片」。 */
  resetView: () => void;
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
}: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ParticleSystem | null>(null);
  const [ready, setReady] = useState(false);

  const params = useExperience((s) => s.params);
  const tier = useExperience(selectEffectiveTier);
  const tierOverride = useExperience((s) => s.tierOverride);
  const reducedMotion = useExperience((s) => s.reducedMotion);
  const setTier = useExperience((s) => s.setTier);

  // 回调放进 ref，既能拿到最新的，又不会因为它们变化而重建引擎。
  // 只在 effect 里写 —— React 19 的 lint 规则禁止在渲染期访问 ref.current。
  const onStatsRef = useRef(onStats);
  const onUnsupportedRef = useRef(onUnsupported);
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => {
    onStatsRef.current = onStats;
    onUnsupportedRef.current = onUnsupported;
    onViewChangeRef.current = onViewChange;
  }, [onStats, onUnsupported, onViewChange]);

  useImperativeHandle(
    ref,
    () => ({
      setImage: async (bitmap: ImageBitmap) => {
        await engineRef.current?.setImage(bitmap);
        engineRef.current?.start();
      },
      morphTo: async (bitmap: ImageBitmap) => {
        await engineRef.current?.morphTo(bitmap);
      },
      setMode: (mode, options) => {
        engineRef.current?.setMode(mode, options);
      },
      resetView: () => {
        engineRef.current?.resetView();
      },
    }),
    [],
  );

  // --- 引擎生命周期：只创建一次 ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    const engine = new ParticleSystem({
      canvas,
      // 直接读 store 的当前值，不经过 ref —— 避免 init 时序依赖
      params: useExperience.getState().params,
      tierOverride: readTierOverride(),
      fillHeight,
      offsetY,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onUnsupported: () => onUnsupportedRef.current?.(),
      onStats: (s) => onStatsRef.current?.(s),
      onViewChange: (r) => onViewChangeRef.current?.(r),
      // 引擎自己降档时回报给 store，让 UI（debug overlay、控制面板）同步
      onTierChange: (t) => setTier(t),
    });
    engineRef.current = engine;

    // 开发期把引擎挂到 window，方便在 devtools 里检查状态（06 §19 debug mode）
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __snEngine?: ParticleSystem }).__snEngine = engine;
    }

    void engine.init().then((initialTier) => {
      if (cancelled) {
        engine.dispose();
        return;
      }
      if (initialTier === null) return; // onUnsupported 已触发
      setReady(true);
    });

    return () => {
      cancelled = true;
      engine.dispose();
      engineRef.current = null;
    };
    // setTier 是 zustand 的稳定引用，不需要进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 参数下发 ---
  useEffect(() => {
    engineRef.current?.setParams(params);
  }, [params]);

  // --- 档位下发（用户手动选择或强制参数）---
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !ready) return;
    if (engine.currentTier !== tier) engine.setTier(tier);
  }, [tier, ready, tierOverride]);

  // --- 无障碍：跟随系统 reduced motion ---
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => useExperience.getState().setReducedMotion(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // --- 把 reduced-motion 的变化下发给引擎（只影响动效，不影响档位）---
  useEffect(() => {
    engineRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  // --- 尺寸 ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const ro = new ResizeObserver(() => engineRef.current?.resize());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [ready]);

  // --- 指针 ---
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
