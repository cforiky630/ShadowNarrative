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
  DEFAULT_PRESET,
  PARTICLE_PRESETS,
  TIER_ORDER,
  type DisplayMode,
  type ParticleParams,
  type ParticlePresetName,
  type PerformanceTier,
} from "@/types";

interface UiState {
  /** 粒子控制面板是否展开。默认隐藏（07-UI_PAGE_SPECS.md §3）。 */
  controlsOpen: boolean;
  /**
   * 设置浮卡是否展开（`07 §11`）。
   *
   * 2026-10-10 从 `SettingsPanel` 的局部 state 提到这里：那一颗球现在和
   * 「参数」共用左下角的一颗胶囊（`BottomDock`），入口和卡片不在同一棵
   * 子树里了 —— 和 `controlsOpen` 当初被提上来的理由是同一条。
   */
  settingsOpen: boolean;
  /** 调试 overlay。生产环境强制关闭（06 §19）。 */
  debugOpen: boolean;
}

/** 舞台状态（ExperienceShell） */

/** 视口坐标的矩形。进入动画的起点，FLIP 用。 */
export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 画布与跨空间舞台状态。
 *
 * 架构设计约束（01 §5、16 §8.6）：
 * 画布（ParticleCanvas）提升至 `(experience)` 路由组的 layout（ExperienceShell），
 * 不随具体路由页面的卸载而重建，从而保证「时间线/相册 ⇄ 照片」平滑过渡、零空白帧。
 */
export interface StageState {
  /**
   * 当前所在的空间模式。
   *
   * ⚠️ 关键约束：
   * 空间不能根据 `pathname` 推导，因为相册与单张照片页的 pathname 均为 `/`
   * （Photo View 依靠 `?photo=<id>` 查询参数区分）。
   * 各空间组件（AlbumSpace / MemorySpace / TimelineSpace / MemoriesSpace）
   * 必须在挂载时显式调用 `setStage({ space })` 声明自身状态。
   */
  space: "album" | "photo" | "timeline" | "memories" | null;
  /**
   * 进入照片空间前的来源路径（例如 `/timeline`、`/memories/cuid...` 或 `/`）。
   *
   * 确保「从哪进入，点击返回就回到哪」的双向导航一致性（16-ALBUM_SPACE.md §8.6）。
   * `null` 表示直接访问或刷新页面，此时默认返回首屏相册。
   */
  entryFromHref: string | null;
  /** 画布上该是哪张照片。null = 还没有（相册、空态） */
  photoId: string | null;
  /**
   * 当前所在上下文的照片序列 ID 列表（相册 / 时间线 / 影册）。
   * 供粒子态下键盘 `←` / `→` 触发同境漫游（Hilbert `morphTo`）使用。
   */
  sequenceIds: string[];
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
  // 粒子参数
  params: ParticleParams;
  setParam: <K extends keyof ParticleParams>(
    key: K,
    value: ParticleParams[K],
  ) => void;
  applyPreset: (name: ParticlePresetName) => void;
  resetParams: () => void;
  /** 当前匹配的预设；用户手动改过参数后为 null */
  activePreset: ParticlePresetName | null;

  // 性能档位
  /** L1+L2 探测得到的初始档 */
  tier: PerformanceTier;
  /** L3 运行时降档。只降不升，见 15-DEVICE_ADAPTATION.md §3 */
  degradeTier: () => void;
  /** 用户是否手动选过档位。选过后关闭自动降档。 */
  tierPinnedByUser: boolean;
  setTier: (tier: PerformanceTier, byUser?: boolean) => void;

  // 显示模式
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

  // 无障碍
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;

  // 舞台
  stage: StageState;
  setStage: (patch: Partial<StageState>) => void;

  // UI
  ui: UiState;
  setControlsOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setDebugOpen: (v: boolean) => void;
}

export const useExperience = create<ExperienceState>((set, get) => ({
  params: { ...DEFAULT_PARTICLE_PARAMS },
  /*
   * 默认高亮预设与 DEFAULT_PRESET 保持一致，确保初始参数与面板状态同步。
   */
  activePreset: DEFAULT_PRESET,
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
      // 「恢复默认」回的就是出厂那一档，不是某一个固定名字
      activePreset: DEFAULT_PRESET,
    }),

  tier: "medium",
  tierPinnedByUser: false,
  setTier: (tier, byUser = false) =>
    set((s) => ({ tier, tierPinnedByUser: byUser || s.tierPinnedByUser })),
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
    space: null,
    entryFromHref: null,
    photoId: null,
    origin: null,
    canvasShown: false,
    unsupported: false,
    rotated: false,
    sequenceIds: [],
  },
  setStage: (patch) =>
    set((s) => {
      const stage = { ...s.stage, ...patch };

      /*
       * 离开有粒子的空间时把粒子参数卡收起来。
       *
       * 它的入口是左下胶囊上的「参数」那一格，而那一格只在
       * `space === "photo"` 时存在（`BottomDock`）。不收的话，切到相册
       * 或时间线之后会留下一张**没有入口、也关不掉**的浮卡。
       *
       * 放在这里而不是某个 effect 里：`setStage` 是**唯一**改 `space` 的
       * 地方，而 effect 里同步 setState 会触发级联渲染
       * （`react-hooks/set-state-in-effect` 会拦，那个拦是对的）。
       *
       * 只在真的要改的时候才带上 `ui` —— zustand 是浅合并，每次都新建一个
       * `ui` 对象会让每次 `setStage`（包括 `rotated`、`photoId` 那些）
       * 都触发一轮重渲染。
       */
      if (stage.space !== "photo" && s.ui.controlsOpen) {
        return { stage, ui: { ...s.ui, controlsOpen: false } };
      }
      return { stage };
    }),

  ui: { controlsOpen: false, settingsOpen: false, debugOpen: false },
  /*
   * 两张浮卡**互斥**：它们都从左下那颗胶囊往上长、占的是同一块地方，
   * 同时开着就是两张卡叠在一起。
   *
   * 互斥写在这里而不是各自的点击处理里 —— 那样得写两遍，而且将来
   * 多一个入口（快捷键、顶栏）就会漏一处。
   */
  setControlsOpen: (controlsOpen) =>
    set((s) => ({
      ui: {
        ...s.ui,
        controlsOpen,
        settingsOpen: controlsOpen ? false : s.ui.settingsOpen,
      },
    })),
  setSettingsOpen: (settingsOpen) =>
    set((s) => ({
      ui: {
        ...s.ui,
        settingsOpen,
        controlsOpen: settingsOpen ? false : s.ui.controlsOpen,
      },
    })),
  setDebugOpen: (debugOpen) => set((s) => ({ ui: { ...s.ui, debugOpen } })),
}));
