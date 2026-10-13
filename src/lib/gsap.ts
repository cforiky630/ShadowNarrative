"use client";

import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";

/**
 * GSAP 初始化与缓动换算。
 *
 * 规格：`16-ALBUM_SPACE.md` §11.2
 *
 * 项目里同时存在两套动画库：
 *   GSAP  —— 镜头编排（相机、场景切换、跨元素时序）
 *   Motion —— UI 微交互（导航、面板、提示）
 *
 * 风险是动效性格分裂。所以这里**从 `02-DESIGN_SYSTEM.md` §10 的曲线换算**，
 * 不使用 GSAP 内置的 `power2.out` 这类命名缓动。
 *
 * 换算不是抄一遍数字 —— 是运行时从 CSS 自定义属性里读 `--ease-*`。
 * 改了 `src/styles/tokens.css`，GSAP 自动跟随，不会漂移。
 */

let registered = false;

/** `cubic-bezier(0.16, 1, 0.3, 1)` → `0.16,1,0.3,1`（CustomEase 要的格式） */
function readBezier(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  const m = raw.match(/cubic-bezier\(([^)]+)\)/);
  return m ? m[1].replace(/\s+/g, "") : fallback;
}

export function ensureGsap(): typeof gsap {
  if (registered) return gsap;
  registered = true;

  gsap.registerPlugin(CustomEase);

  // 与 tokens.css 的 --ease-* 一一对应
  CustomEase.create("sn-enter", readBezier("--ease-enter", "0.16,1,0.3,1"));
  CustomEase.create("sn-exit", readBezier("--ease-exit", "0.4,0,0.2,1"));
  CustomEase.create("sn-morph", readBezier("--ease-morph", "0.65,0,0.35,1"));

  return gsap;
}

/**
 * 时长，单位**秒**（GSAP 用秒，CSS 用毫秒）。
 * 数值必须与 `tokens.css` 的 `--duration-*` 一致。
 */
export const DUR = {
  micro: 0.2,
  ui: 0.35,
  scene: 0.8,
  morph: 1.2,
  story: 1.0,
} as const;

/** 缓动名，与 `ensureGsap` 里注册的一致 */
export const EASE = {
  enter: "sn-enter",
  exit: "sn-exit",
  morph: "sn-morph",
} as const;
