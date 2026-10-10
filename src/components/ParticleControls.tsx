"use client";

import { DockCard } from "@/components/DockCard";
import {
  PARTICLE_PARAM_RANGES,
  type ParticleParams,
  type ParticlePresetName,
} from "@/types";
import { useExperience } from "@/store/experience";

/**
 * 粒子参数浮卡。
 *
 * 规格：`07-UI_PAGE_SPECS.md` §3、`02-DESIGN_SYSTEM.md` §14（Glass UI）
 *   - 默认隐藏
 *   - 不抢画面：**不出暗色遮罩**，粒子始终是主体
 *
 * ── 2026-10-10 换了形态 ─────────────────────────────────────────────
 *
 * 原先是右侧滑出的 340px 抽屉。用户那天要求「参数调整和设置做法一样
 * 放在左下」—— 于是入口（原顶栏的「参数」）搬进了左下角的胶囊
 * （`BottomDock`），面板也跟着改成**从胶囊往上长的浮卡**，与设置共用
 * `DockCard` 那层外壳。
 *
 * ⚠️ `07 §3` 里「宽度 320–360px」那条随形态一起作废 —— 现在是
 * `DockCard` 的 `min(380px, 100vw-3rem)`。文档要跟着改。
 *
 * ⚠️ **内容一个字没动**：八个滑块、四个预设、恢复默认，以及它们底下的
 * store 全都照旧。用户明确说过组合的只是「按钮，不是卡片、内容、功能」。
 *
 * Esc、点空白收起、焦点交接、滚动全在 `DockCard` 里 —— 这里不再重复。
 * 原先这个组件自己写了一份，两张卡各写一份就是两份会漂移的动效性格。
 *
 * 挂载点在**根布局**（`app/layout.tsx`），和设置一样 —— 它是一张全局浮层，
 * 不属于任何一条路由。这也是它不再受照片页 `<main>` 那个
 * `pointer-events: none` 影响的原因（那个坑见 `05 §6.2` 与 `MemorySpace`）。
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

  return (
    <DockCard label="粒子参数" open={open} onClose={() => setOpen(false)}>
      {/* px-8 pb-12 与 SettingsForm 同一套内距，两张卡的行距才对得齐 */}
      <div className="px-8 pb-12">
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
    </DockCard>
  );
}
