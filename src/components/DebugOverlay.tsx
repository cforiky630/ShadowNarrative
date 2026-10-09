"use client";

import type { EngineStats } from "@/engine/particle/ParticleSystem";

/**
 * 开发期调试覆盖层。
 *
 * 规格：06-PARTICLE_ENGINE.md §19
 *   FPS / particle count / draw calls / DPR / preset / mode / GPU tier
 *
 * 生产环境不渲染（调用方负责判断）。
 */
export function DebugOverlay({ stats }: { stats: EngineStats | null }) {
  if (!stats) return null;

  const rows: Array<[string, string]> = [
    ["fps", String(stats.fps)],
    ["frame", `${stats.frameMs}ms`],
    ["p90", `${stats.p90Ms}ms`],
    ["particles", stats.particleCount.toLocaleString()],
    ["draw calls", String(stats.drawCalls)],
    ["dpr", stats.dpr.toFixed(2)],
    ["tier", stats.tier],
  ];

  return (
    <div className="text-micro pointer-events-none fixed bottom-6 left-12 z-30 flex flex-col gap-1 font-mono text-text-primary/45">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <span className="w-20 opacity-60">{k}</span>
          <span className="text-text-primary/80">{v}</span>
        </div>
      ))}
    </div>
  );
}
