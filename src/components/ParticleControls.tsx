"use client";

import { useEffect } from "react";
import {
  PARTICLE_PARAM_RANGES,
  type ParticleParams,
  type ParticlePresetName,
} from "@/types";
import { useExperience } from "@/store/experience";

/**
 * 粒子控制面板。
 *
 * 规格：07-UI_PAGE_SPECS.md §3、02-DESIGN_SYSTEM.md §14（Glass UI）
 *   - 默认隐藏
 *   - 右侧滑出，320–360px
 *   - 不抢画面：不加暗色遮罩，粒子始终是主体
 */

const PARAMS: Array<{ key: keyof ParticleParams; label: string }> = [
  { key: "density", label: "密度" },
  { key: "size", label: "尺寸" },
  { key: "motion", label: "漂移" },
  { key: "turbulence", label: "湍流" },
  { key: "mouseRadius", label: "指针半径" },
  { key: "mouseForce", label: "指针强度" },
  { key: "noiseSpeed", label: "噪声速度" },
  { key: "colorVariation", label: "色彩扰动" },
];

const PRESETS: Array<{ key: ParticlePresetName; label: string }> = [
  { key: "calm", label: "Calm" },
  { key: "breeze", label: "Breeze" },
  { key: "focus", label: "Focus" },
  { key: "drift", label: "Drift" },
];

export function ParticleControls() {
  const open = useExperience((s) => s.ui.controlsOpen);
  const setOpen = useExperience((s) => s.setControlsOpen);
  const params = useExperience((s) => s.params);
  const setParam = useExperience((s) => s.setParam);
  const applyPreset = useExperience((s) => s.applyPreset);
  const resetParams = useExperience((s) => s.resetParams);
  const activePreset = useExperience((s) => s.activePreset);

  // Esc 关闭浮层（04-UX_INTERACTION_SPEC.md §7 的退出顺序第一层）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <>
      {/* 透明点击捕捉层。刻意不做暗色遮罩 —— 那会把粒子压暗，破坏「粒子才是主体」。
          但拖拽旋转仍然可用，因为这一层只在面板打开时拦截点击。 */}
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30"
        />
      )}

      <aside
        role="dialog"
        aria-label="粒子参数"
        inert={!open}
        className="fixed right-0 top-0 z-30 flex h-dvh w-[340px] flex-col border-l border-border-faint bg-glass-strong backdrop-blur-2xl"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform var(--duration-ui) var(--ease-enter)",
          backgroundColor: "var(--glass-strong)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <header className="flex items-center justify-between px-8 pb-6 pt-8">
          <span className="text-micro text-text-primary/55">粒子参数</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭"
            className="text-meta text-text-primary/40 transition-opacity duration-[200ms] hover:opacity-85 focus-visible:opacity-85"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {/* 预设 */}
          <div className="mb-8">
            <p className="text-micro mb-3 text-text-primary/35">预设</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const on = activePreset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.key)}
                    className="text-micro rounded-pill border px-3 py-1.5 transition-opacity duration-[200ms]"
                    style={{
                      borderColor: on
                        ? "var(--border-subtle)"
                        : "var(--border-faint)",
                      opacity: on ? 0.9 : 0.45,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 参数 */}
          <div className="flex flex-col gap-5">
            {PARAMS.map(({ key, label }) => {
              const r = PARTICLE_PARAM_RANGES[key];
              const value = params[key];
              return (
                <label key={key} className="block">
                  <span className="text-micro flex items-baseline justify-between">
                    <span className="text-text-primary/50">{label}</span>
                    <span className="text-text-primary/35 tabular-nums">
                      {value.toFixed(2)}
                    </span>
                  </span>
                  <input
                    type="range"
                    className="sn-range mt-2"
                    min={r.min}
                    max={r.max}
                    step={r.step}
                    value={value}
                    aria-label={label}
                    onChange={(e) =>
                      setParam(key, Number.parseFloat(e.target.value))
                    }
                  />
                </label>
              );
            })}
          </div>

          <button
            type="button"
            onClick={resetParams}
            className="text-micro mt-10 text-text-primary/40 transition-opacity duration-[200ms] hover:opacity-85"
          >
            恢复默认
          </button>
        </div>
      </aside>
    </>
  );
}
