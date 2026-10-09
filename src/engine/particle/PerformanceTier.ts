/**
 * 性能档位探测
 *
 * 规格：15-DEVICE_ADAPTATION.md §3
 *
 * 本文件只负责 L1（静态特征）与 L3（运行时监测）。
 * L2（启动微基准）需要渲染器，放在 ParticleSystem 里跑。
 *
 * 设计原则：不做设备嗅探。UA、设备名、deviceMemory 都会骗人 ——
 * 同一台机器会因为省电模式、是否插电、浏览器版本产生数倍差异。
 */

import { TIER_ORDER, type PerformanceTier } from "@/types";

// ---------------------------------------------------------------------------
// L1 静态特征
// ---------------------------------------------------------------------------

export interface CapabilityProbe {
  /** WebGL2 是否可用。false → 走静态降级（15 §7） */
  webgl2: boolean;
  /** 是否软件渲染（SwiftShader / llvmpipe）。true → 封顶 Minimal */
  software: boolean;
  maxTextureSize: number;
  maxVertexUniformVectors: number;
  deviceMemory: number | null;
  hardwareConcurrency: number;
  dpr: number;
  /** 只影响动效幅度，不影响档位 */
  reducedMotion: boolean;
}

const SOFTWARE_RENDERER_HINTS = [
  "swiftshader",
  "llvmpipe",
  "software",
  "basic render",
  "microsoft basic",
];

export function probeCapabilities(): CapabilityProbe {
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const base: CapabilityProbe = {
    webgl2: false,
    software: false,
    maxTextureSize: 0,
    maxVertexUniformVectors: 0,
    deviceMemory:
      typeof navigator !== "undefined" &&
      "deviceMemory" in navigator &&
      typeof (navigator as { deviceMemory?: number }).deviceMemory === "number"
        ? ((navigator as { deviceMemory?: number }).deviceMemory ?? null)
        : null,
    hardwareConcurrency:
      typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 4) : 4,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    reducedMotion,
  };

  if (typeof document === "undefined") return base;

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) return base;

  base.webgl2 = true;

  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  if (dbg) {
    const renderer = String(
      gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "",
    ).toLowerCase();
    base.software = SOFTWARE_RENDERER_HINTS.some((h) => renderer.includes(h));
  }

  base.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  base.maxVertexUniformVectors = gl.getParameter(
    gl.MAX_VERTEX_UNIFORM_VECTORS,
  ) as number;

  // 探测用的上下文立即释放，避免占用一个 WebGL context 名额
  gl.getExtension("WEBGL_lose_context")?.loseContext();

  return base;
}

/**
 * L1 的输出是**上限**，不是档位。
 * 返回 null 表示不该走粒子路径，应静态降级（15 §7）。
 */
export function tierCeiling(probe: CapabilityProbe): PerformanceTier | null {
  if (!probe.webgl2) return null;
  if (probe.software) return "minimal";

  let ceiling: PerformanceTier = "ultra";

  // 每遇到一个限制就往下压，取最严格的那个
  const cap = (t: PerformanceTier) => {
    if (TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(ceiling)) ceiling = t;
  };

  if (probe.maxTextureSize < 4096) cap("low");
  if (probe.maxVertexUniformVectors < 256) cap("medium");

  // deviceMemory 只作辅助，不单独定档（15 §3 L1 表格已注明）
  if (probe.deviceMemory !== null && probe.deviceMemory <= 4) cap("medium");

  return ceiling;
}

/** 取两个档位中较低的那个 */
export function minTier(
  a: PerformanceTier,
  b: PerformanceTier,
): PerformanceTier {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b;
}

// ---------------------------------------------------------------------------
// L3 运行时监测
// ---------------------------------------------------------------------------

/**
 * 滚动窗口统计最近 WINDOW 帧的 p90 帧时间。
 * 超过预算 × 1.5 且持续 SUSTAIN_MS 才降档 —— 单帧尖峰不触发。
 *
 * 只降不升：升档会引起「降档 → 变快 → 升档 → 又卡」的抖动循环（15 §3 L3）。
 */
export class RuntimeMonitor {
  private readonly samples: Float32Array;
  private cursor = 0;
  private filled = 0;
  private overSinceMs: number | null = null;
  private framesSinceEval = 0;

  private static readonly WINDOW = 60;
  private static readonly EVAL_EVERY = 15;
  private static readonly SUSTAIN_MS = 2000;
  private static readonly OVER_FACTOR = 1.5;

  constructor(private budgetMs: number) {
    this.samples = new Float32Array(RuntimeMonitor.WINDOW);
  }

  setBudget(budgetMs: number): void {
    this.budgetMs = budgetMs;
    this.reset();
  }

  reset(): void {
    this.cursor = 0;
    this.filled = 0;
    this.overSinceMs = null;
    this.framesSinceEval = 0;
  }

  /**
   * 每帧调用。
   * @returns true 表示应当降档；调用方负责真正降档并调用 reset()
   */
  push(frameMs: number, nowMs: number): boolean {
    this.samples[this.cursor] = frameMs;
    this.cursor = (this.cursor + 1) % RuntimeMonitor.WINDOW;
    if (this.filled < RuntimeMonitor.WINDOW) this.filled++;

    // 窗口没满不评估 —— 开局几帧必然偏慢
    if (this.filled < RuntimeMonitor.WINDOW) return false;

    if (++this.framesSinceEval < RuntimeMonitor.EVAL_EVERY) return false;
    this.framesSinceEval = 0;

    const p90 = this.percentile(0.9);

    if (p90 > this.budgetMs * RuntimeMonitor.OVER_FACTOR) {
      if (this.overSinceMs === null) {
        this.overSinceMs = nowMs;
      } else if (nowMs - this.overSinceMs >= RuntimeMonitor.SUSTAIN_MS) {
        return true;
      }
    } else {
      this.overSinceMs = null;
    }

    return false;
  }

  /** 当前 p90 帧时间，供 debug overlay 显示 */
  p90(): number {
    return this.filled === 0 ? 0 : this.percentile(0.9);
  }

  private percentile(p: number): number {
    const n = this.filled;
    const sorted = Array.prototype.slice
      .call(this.samples, 0, n)
      .sort((a: number, b: number) => a - b);
    const i = Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))));
    return sorted[i];
  }
}
