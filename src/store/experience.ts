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
  type ParticleParams,
  type ParticlePresetName,
  type PerformanceTier,
  type Photo,
} from "@/types";

interface UiState {
  /** 粒子控制面板是否展开。默认隐藏（07-UI_PAGE_SPECS.md §3）。 */
  controlsOpen: boolean;
  /** 调试 overlay。生产环境强制关闭（06 §19）。 */
  debugOpen: boolean;
}

// ---------------------------------------------------------------------------
// 舞台（ExperienceShell）
// ---------------------------------------------------------------------------

/** 视口坐标的矩形。进入动画的起点，FLIP 用。 */
export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 画布那一层的状态。
 *
 * ── 为什么这些必须放在全局 ──────────────────────────────────────────
 *
 * 2026-10-10：画布从 `MemorySpace` 提到了 `(experience)` 路由组的 layout 里
 * （`ExperienceShell`），它**不再属于任何一条路由**。于是两件事必须跨子树传递：
 *
 *   1. 时间线（`/timeline`）点一张照片时，要驱动一个不在它这棵子树里的画布
 *   2. 画布不卸载 ⇒ 「该显示哪张」「这一层可不可见」没有天然的归属者
 *
 * 这正是这一层存在的理由：路由换掉时画布**存活**，所以
 * 「时间线 → 照片」不再是切页面，是同一个空间里的两个状态
 * （`01-PRODUCT_SPEC.md` §5、`16-ALBUM_SPACE.md` §8.6）。
 */
export interface StageState {
  /** 画布上该是哪张照片。null = 还没有（空态，外壳回落到内置示例图） */
  photoId: string | null;
  /**
   * 进入动画的起点（视口坐标）。
   *
   * 非 null 有两个含义，它们是同一件事的两面：
   *   - 外壳：正在把这张照片从 `origin` 推到它在画布里的位置（FLIP）
   *   - 路由内容：正在退场，透明度归零
   * 动画结束后归 null，两边同时恢复。
   */
  origin: StageRect | null;
  /**
   * 画布那一层可见。
   *
   * 平时由路由决定（在 `/` 就可见），但**进入动画期间由动画自己接管** ——
   * 它要等飞行过半才亮起来。早了整张照片会先于缩略图出现，成了叠影。
   *
   * 单独一个字段而不是从 `pathname` 现推，就是因为这半秒里它与路由是不同步的。
   */
  canvasShown: boolean;
  /** 设备跑不了 WebGL2（15 §7）。外壳判定，路由页面据此走静态降级 */
  unsupported: boolean;
  /** 相机偏离了正视角。照片页左下角的「复位视角」据此显示 */
  rotated: boolean;
}

interface ExperienceState {
  // --- 状态机 ---
  mode: ExperienceMode;
  setMode: (mode: ExperienceMode) => void;

  // --- 当前照片 ---
  currentPhoto: Photo | null;
  setCurrentPhoto: (photo: Photo | null) => void;

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
   *
   * 放在全局是因为**它跨越了两棵不相邻的子树**：写它的是照片页的文字层
   * （那一格里的「Into this moment / 返回」，`16 §8.6`），读它的是
   * `ExperienceShell` 里的画布 —— 画布在 layout 里，不在页面里。
   */
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;

  // --- 无障碍 ---
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;

  // --- 舞台 ---
  stage: StageState;
  setStage: (patch: Partial<StageState>) => void;

  // --- UI ---
  ui: UiState;
  setControlsOpen: (v: boolean) => void;
  setDebugOpen: (v: boolean) => void;
}

export const useExperience = create<ExperienceState>((set, get) => ({
  mode: "rest",
  setMode: (mode) => set({ mode }),

  currentPhoto: null,
  setCurrentPhoto: (currentPhoto) => set({ currentPhoto }),

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

  stage: {
    photoId: null,
    origin: null,
    canvasShown: false,
    unsupported: false,
    rotated: false,
  },
  setStage: (patch) => set((s) => ({ stage: { ...s.stage, ...patch } })),

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
