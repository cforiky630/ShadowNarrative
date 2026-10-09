"use client";

import { useCallback, useRef, useState } from "react";
import {
  ParticleCanvas,
  type ParticleCanvasHandle,
} from "@/components/ParticleCanvas";
import { DebugOverlay } from "@/components/DebugOverlay";
import type { EngineStats } from "@/engine/particle/ParticleSystem";

/**
 * 粒子调试台。
 *
 * 规格：10-IMPLEMENTATION_PLAN.md Round 2 的独立 Particle Demo。
 *
 * 用途：参考视频已丢失（见 recon/environment.md），视觉方向只能靠现场调参收敛。
 * 这个页面把「猜用户要什么」变成「用户自己调给我看」，是 Round 2 最重要的交付物。
 *
 * 支持的调试参数（15-DEVICE_ADAPTATION.md §9）：
 *   ?tier=ultra|high|medium|low|minimal
 */
export default function ParticleDevPage() {
  const canvasRef = useRef<ParticleCanvasHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [stats, setStats] = useState<EngineStats | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [hasImage, setHasImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const loadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setBusy(true);
      setFileName(file.name);
      try {
        const bitmap = await createImageBitmap(file);
        if (hasImage) {
          await canvasRef.current?.morphTo(bitmap);
        } else {
          await canvasRef.current?.setImage(bitmap);
          setHasImage(true);
        }
        bitmap.close();
      } catch (err) {
        console.error("[dev/particle] 图片加载失败", err);
      } finally {
        setBusy(false);
      }
    },
    [hasImage],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  if (unsupported) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-12">
        <p className="text-meta text-text-primary/55">
          这台设备没有可用的 WebGL2，粒子效果不可用。产品会安静降级为静态浏览。
        </p>
      </main>
    );
  }

  return (
    <main
      className="relative min-h-dvh"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <ParticleCanvas
        ref={canvasRef}
        className="fixed inset-0 block h-full w-full"
        onUnsupported={() => setUnsupported(true)}
        onStats={setStats}
      />

      {/* 空态：极简提示，不做卡片（02-DESIGN_SYSTEM.md §15） */}
      {!hasImage && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-meta fixed inset-0 z-10 flex flex-col items-center justify-center gap-3 text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-80"
          style={{ transitionTimingFunction: "var(--ease-enter)" }}
        >
          <span>拖入一张照片，或者点击选择</span>
          <span className="text-micro opacity-60">
            再拖一张，看沙粒重新排列成另一张
          </span>
          <span className="text-micro opacity-40">
            拖拽旋转 · 滚轮缩放
          </span>
        </button>
      )}

      {/* 已有图片时的控制条 */}
      {hasImage && (
        <div className="fixed bottom-6 right-12 z-30 flex items-center gap-6">
          {busy && (
            <span className="text-micro text-text-primary/40">处理中…</span>
          )}
          {fileName && !busy && (
            <span className="text-micro max-w-[240px] truncate text-text-primary/30">
              {fileName}
            </span>
          )}
          <button
            type="button"
            onClick={() => canvasRef.current?.resetView()}
            className="text-micro text-text-primary/45 transition-opacity duration-[350ms] hover:opacity-90"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            复位视角
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-micro text-text-primary/45 transition-opacity duration-[350ms] hover:opacity-90"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            换一张
          </button>
          <button
            type="button"
            onClick={() => {
              setHasImage(false);
              setFileName(null);
              window.location.reload();
            }}
            className="text-micro text-text-primary/45 transition-opacity duration-[350ms] hover:opacity-90"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            重置
          </button>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 border border-border-subtle" />
      )}

      <DebugOverlay stats={stats} />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadFile(file);
          e.target.value = "";
        }}
      />
    </main>
  );
}
