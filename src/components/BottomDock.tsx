"use client";

import { motion } from "motion/react";
import { Settings, SlidersHorizontal } from "lucide-react";
import { useExperience } from "@/store/experience";

/**
 * 左下角底部导航胶囊（07-UI_PAGE_SPECS.md §11.2）。
 *
 * ── 交互形态与按需展现 ────────────────────────────────────────────────
 * - 动态胶囊两格布局：
 *   在单张照片粒子态（`stage.space === "photo"`）呈现「参数 | 设置」双格；
 *   在相册与时间线（无粒子交互）时收缩为单格（仅保留「设置」悬浮球）。
 * - 独立卡片：
 *   胶囊仅作为紧凑入口组合，所呼出的 `ParticleControls` 与 `SettingsPanel`
 *   为各自独立的互斥浮卡，不合并内容与内部状态。
 *
 * ── 弹簧微动效规范（02-DESIGN_SYSTEM.md §10）──────────────────────────
 * 参数格的收放采用 motion spring 缓动：
 * 阻尼比严格控制在 ~0.80（stiffness: 500, damping: 34），产生微弱收束惯性，
 * 严格禁止过大的 bounce 或夸张回弹，符合沉浸克制的设计基调。
 */

/** 每一格的边长。就是原先那颗球的 `h-11 w-11`（44px）。 */
const SEGMENT = 44;

/**
 * 收放用的弹簧。
 *
 * `stiffness 500 / mass 0.9` 的临界阻尼约是 `2√(k·m) ≈ 42.4`，
 * 取 34 相当于阻尼比 0.80 —— 明显欠阻尼但只余一点点。**不要再往下调**，
 * 见文件头关于 `02 §10` 的说明。
 */
const SPRING = { type: "spring", stiffness: 500, damping: 34, mass: 0.9 } as const;

export function BottomDock() {
  /** 有粒子可调吗。由各空间在挂载时声明（`stage.space` 的注释里有完整理由） */
  const inPhoto = useExperience((s) => s.stage.space === "photo");
  const controlsOpen = useExperience((s) => s.ui.controlsOpen);
  const settingsOpen = useExperience((s) => s.ui.settingsOpen);
  const setControlsOpen = useExperience((s) => s.setControlsOpen);
  const setSettingsOpen = useExperience((s) => s.setSettingsOpen);

  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-40">
      <div
        className="border-border-faint pointer-events-auto flex items-center overflow-hidden rounded-full border backdrop-blur-xl"
        style={{
          backgroundColor: "var(--glass-strong)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {/*
          参数那一格。

          ⚠️ 收起来时**光靠宽度 0 是不够的** —— 键盘仍然 Tab 得到里面那个
          按钮（它在 DOM 里、也 focusable），于是相册上会出现一个看不见的
          焦点落点。`inert` 一并把它移出 Tab 顺序和辅助技术的树。
        */}
        <motion.div
          initial={false}
          animate={{ width: inPhoto ? SEGMENT + 1 : 0, opacity: inPhoto ? 1 : 0 }}
          transition={SPRING}
          inert={!inPhoto}
          className="flex shrink-0 items-center overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setControlsOpen(!controlsOpen)}
            aria-label="粒子参数"
            aria-expanded={controlsOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center transition-opacity duration-[350ms] hover:opacity-100 focus-visible:opacity-100"
            style={{
              opacity: controlsOpen ? 1 : 0.55,
              transitionTimingFunction: "var(--ease-enter)",
            }}
          >
            <SlidersHorizontal size={16} strokeWidth={1.6} aria-hidden />
          </button>

          {/*
            两格之间那条极淡的分隔线。
            放在**这一格里面**、跟着宽度一起被裁 —— 否则它自己还得再收一次，
            而 1px 的元素做宽度动画会抖。
          */}
          <span
            aria-hidden
            className="h-5 w-px shrink-0"
            style={{ background: "var(--border-subtle)" }}
          />
        </motion.div>

        <button
          type="button"
          onClick={() => setSettingsOpen(!settingsOpen)}
          aria-label={settingsOpen ? "收起设置" : "打开设置"}
          aria-expanded={settingsOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center transition-opacity duration-[350ms] hover:opacity-100 focus-visible:opacity-100"
          style={{
            opacity: settingsOpen ? 1 : 0.55,
            transitionTimingFunction: "var(--ease-enter)",
          }}
        >
          <Settings size={16} strokeWidth={1.6} aria-hidden />
        </button>
      </div>
    </div>
  );
}
