"use client";

import { motion } from "motion/react";
import { Settings, SlidersHorizontal } from "lucide-react";
import { useExperience } from "@/store/experience";

/**
 * 左下角的浮球组（`07-UI_PAGE_SPECS.md` §11.2）。
 *
 * 用户 2026-10-10：「参数调整和设置做法一样放在左下……都有时考虑一下他俩
 * 能不能 Q 弹的组合在一起，没有参数调整时分离（按钮组合，不是卡片、内容、
 * 功能组合）」。
 *
 * ── 形态 ────────────────────────────────────────────────────────────
 *
 * **一颗胶囊，两格。** 有粒子时它撑成两格（参数 | 设置），没有粒子时缩回
 * 一颗圆球（只有设置）。
 *
 * ⚠️ **组合的只是按钮。** 两张浮卡各自独立（`SettingsPanel` /
 * `ParticleControls`），内容、功能、开合状态都不合并 —— 用户明确排除了
 * 那一种。这里是「两个入口挨着放」，不是「一个面板装两样东西」。
 *
 * ── 什么时候有两格 ──────────────────────────────────────────────────
 *
 * 判据是 `stage.space === "photo"`，也就是**有粒子的时候** ——
 * 和顶栏那个「参数」入口原先的判据是同一条。相册与时间线上没有粒子，
 * 在那里开参数只会得到一个控制不了任何东西的面板（`TopNavigation` 的注释）。
 *
 * ── 「Q 弹」怎么落 ──────────────────────────────────────────────────
 *
 * 参数那一格收放走 `motion` 的 spring（`05 §7`：UI 微交互归 motion；
 * `16 §2.2` 同样的做法，那里写的理由是「拿起和放下是有重量感的动作」）。
 *
 * ⚠️ 但**回弹幅度刻意压得很小**：`02 §10` 明令「不使用任何 elastic / back 类
 * 回弹曲线」，也不许「大幅 bounce、夸张弹跳、游戏 UI 感」。所以这里的
 * 阻尼比取 0.80 左右 —— 有一点点收不住的余韵，不是弹簧玩具。
 * 再往下调阻尼就会滑进那份清单。
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
