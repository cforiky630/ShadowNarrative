/**
 * 体验状态。
 *
 * 重要约束（05-TECH_ARCHITECTURE.md §8 / §18）：
 * 这里只存「意图」，不存每帧粒子数据。
 * 粒子位置、速度、GPU buffer 全部由引擎内部维护，绝不经过 React。
 */

"use client";

import { create } from "zustand";
import {
  DEFAULT_PARTICLE_PARAMS,
  PARTICLE_PRESETS,
  TIER_ORDER,
  TIER_SPECS,
  type DisplayMode,
  type ExperienceMode,
  type Memory,
  type ParticleParams,
  type ParticlePresetName,
  type PerformanceTier,
} from "@/types";

interface UiState {
  /** 粒子控制面板是否展开。默认隐藏（07-UI_PAGE_SPECS.md §3）。 */
  controlsOpen: boolean;
  /** 调试 overlay。生产环境强制关闭（06 §19）。 */
  debugOpen: boolean;
}

interface ExperienceState {
  // --- 状态机 ---
  mode: ExperienceMode;
  setMode: (mode: ExperienceMode) => void;

  // --- 当前记忆 ---
  currentMemory: Memory | null;
  setCurrentMemory: (memory: Memory | null) => void;

  // --- 粒子参数 ---
  params: ParticleParams;
  setParam: <K extends keyof ParticleParams>(
    key: K,
    value: ParticleParams[K],
  ) => void;
  applyPreset: (name: ParticlePresetName) => void;
  resetParams: () => void;
  /** 当前匹配的预设；用户手动改过参数后为 null */
  activePreset: ParticlePresetName | null;

  // --- 性能档位 ---
  /** L1+L2 探测得到的初始档 */
  tier: PerformanceTier;
  /** 强制档位（?tier= 查询参数），非空时覆盖自动档位 */
  tierOverride: PerformanceTier | null;
  /** L3 运行时降档。只降不升，见 15-DEVICE_ADAPTATION.md §3 */
  degradeTier: () => void;
  /** 用户是否手动选过档位。选过后关闭自动降档。 */
  tierPinnedByUser: boolean;
  setTier: (tier: PerformanceTier, byUser?: boolean) => void;
  setTierOverride: (tier: PerformanceTier | null) => void;

  // --- 显示模式 ---
  /**
   * 原图 ⇄ 粒子（`16-ALBUM_SPACE.md` §8）。
   *
   * 状态不持久化 —— 每次进入照片都是 `photo`，由 MemorySpace 挂载时重置。
   * 放在全局是因为左上角的「返回」在 TopNavigation 里。
   */
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;

  // --- 无障碍 ---
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;

  // --- UI ---
  ui: UiState;
  setControlsOpen: (v: boolean) => void;
  setDebugOpen: (v: boolean) => void;
}

export const useExperience = create<ExperienceState>((set, get) => ({
  mode: "rest",
  setMode: (mode) => set({ mode }),

  currentMemory: null,
  setCurrentMemory: (currentMemory) => set({ currentMemory }),

  params: { ...DEFAULT_PARTICLE_PARAMS },
  activePreset: "calm",
  setParam: (key, value) =>
    set((s) => ({
      params: { ...s.params, [key]: value },
      // 手动改过参数就不再算「当前是某个预设」
      activePreset: null,
    })),
  applyPreset: (name) =>
    set({
      params: { ...DEFAULT_PARTICLE_PARAMS, ...PARTICLE_PRESETS[name] },
      activePreset: name,
    }),
  resetParams: () =>
    set({
      params: { ...DEFAULT_PARTICLE_PARAMS },
      activePreset: "calm",
    }),

  tier: "medium",
  tierOverride: null,
  tierPinnedByUser: false,
  setTier: (tier, byUser = false) =>
    set((s) => ({ tier, tierPinnedByUser: byUser || s.tierPinnedByUser })),
  setTierOverride: (tierOverride) => set({ tierOverride }),
  degradeTier: () => {
    const { tier, tierPinnedByUser } = get();
    if (tierPinnedByUser) return; // 用户手动选过后不再自动降档
    const i = TIER_ORDER.indexOf(tier);
    if (i < 0 || i === TIER_ORDER.length - 1) return; // 已是最低档
    set({ tier: TIER_ORDER[i + 1] });
  },

  reducedMotion: false,
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),

  displayMode: "photo",
  setDisplayMode: (displayMode) => set({ displayMode }),

  ui: { controlsOpen: false, debugOpen: false },
  setControlsOpen: (controlsOpen) =>
    set((s) => ({ ui: { ...s.ui, controlsOpen } })),
  setDebugOpen: (debugOpen) => set((s) => ({ ui: { ...s.ui, debugOpen } })),
}));

// ---------------------------------------------------------------------------
// 派生选择器
//
// 用 useExperience(selectEffectiveTier) 这种形式调用。
// 不要把「计算属性方法」放进 store —— 函数引用不变，档位变化时不会触发重渲染。
// ---------------------------------------------------------------------------

export type ExperienceStore = ReturnType<typeof useExperience.getState>;

/** 实际生效的档位：强制档位优先于自动档位 */
export const selectEffectiveTier = (
  s: ExperienceStore,
): PerformanceTier => s.tierOverride ?? s.tier;

/** 实际粒子数 = 档位上限 × density */
export const selectParticleCount = (s: ExperienceStore): number =>
  Math.round(
    TIER_SPECS[selectEffectiveTier(s)].particleCount * s.params.density,
  );
