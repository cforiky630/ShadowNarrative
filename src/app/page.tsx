"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ParticleCanvas,
  type ParticleCanvasHandle,
} from "@/components/ParticleCanvas";
import { ParticleControls } from "@/components/ParticleControls";
import { DebugOverlay } from "@/components/DebugOverlay";
import { SAMPLE_MEMORY } from "@/lib/sampleMemory";
import { useExperience } from "@/store/experience";
import type { EngineStats } from "@/engine/particle/ParticleSystem";

/**
 * Memory Space —— 首页
 *
 * 规格：07-UI_PAGE_SPECS.md §1
 *
 * 尺寸表（07 §1 定稿值，基准视口 1440×900）：
 *   粒子照片主视觉   画面高度 55–65% · 水平居中 · 垂直偏上 4%
 *   日期             照片下 24px · text-meta · opacity 0.55
 *   标题             日期下 8px · text-title · opacity 0.95
 *   View Memory →    标题下 24px · text-meta · opacity 0.45 → hover 0.90
 *
 * 不能出现传统 hero 卡片：没有边框、没有投影、没有背景块。
 */

/** 粒子云占视口高度的比例，取 07 §1「55–65%」的中值 */
const FILL_HEIGHT = 0.60;
/** 垂直偏上 4%（07 §1） */
const OFFSET_Y = 0.04;
/**
 * 文字块的起始位置。
 * 云占 60% 且上移 4% ⇒ 下边缘约在 76%，这里从 78% 起排，
 * 相当于「照片下 24px」的量级。
 */
const TEXT_TOP = "78%";

export default function Home() {
  const canvasRef = useRef<ParticleCanvasHandle>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  const currentMemory = useExperience((s) => s.currentMemory);
  const setCurrentMemory = useExperience((s) => s.setCurrentMemory);

  // 首次进入加载内置示例记忆（3B 会换成数据库查询）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(SAMPLE_MEMORY.imageUrl);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        if (cancelled) {
          bitmap.close();
          return;
        }
        await canvasRef.current?.setImage(bitmap);
        bitmap.close();
        setCurrentMemory({
          id: "sample",
          userId: "local",
          title: SAMPLE_MEMORY.title,
          summary: null,
          location: null,
          memoryDate: null,
          coverMediaId: null,
          particlePresetId: null,
          createdAt: "",
          updatedAt: "",
        });
      } catch {
        // 示例图加载失败不是致命问题，页面保持空态即可
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setCurrentMemory]);

  // 用户拖入自己的照片：仅本次会话有效，不落库（3B 才做持久化）
  const loadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      const bitmap = await createImageBitmap(file);
      await canvasRef.current?.morphTo(bitmap);
      bitmap.close();
      useExperience.getState().setCurrentMemory({
        id: "dropped",
        userId: "local",
        title: file.name.replace(/\.[^.]+$/, ""),
        summary: null,
        location: null,
        memoryDate: null,
        coverMediaId: null,
        particlePresetId: null,
        createdAt: "",
        updatedAt: "",
      });
    } catch {
      // 解码失败就静默保持原图
    }
  }, []);

  // 拖拽旋转过一次就不再提示
  const onViewChange = useCallback((isRotated: boolean) => {
    setRotated(isRotated);
    if (isRotated) setHintVisible(false);
  }, []);

  if (unsupported) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-12">
        <p className="text-meta text-text-primary/55">
          这台设备没有可用的 WebGL2，粒子效果不可用。安静降级为静态浏览。
        </p>
      </main>
    );
  }

  const title = currentMemory?.title ?? SAMPLE_MEMORY.title;
  const date = SAMPLE_MEMORY.date;

  return (
    <main
      className="relative min-h-dvh overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void loadFile(file);
      }}
    >
      <ParticleCanvas
        ref={canvasRef}
        className="fixed inset-0 block h-full w-full"
        fillHeight={FILL_HEIGHT}
        offsetY={OFFSET_Y}
        onUnsupported={() => setUnsupported(true)}
        onStats={setStats}
        onViewChange={onViewChange}
      />

      {/* 文字层。指针事件默认穿透，只有按钮自己接收 —— 否则会挡住拖拽旋转。 */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center"
        style={{ top: TEXT_TOP }}
      >
        <p className="text-meta text-text-primary/55">{date}</p>
        <h1 className="text-title mt-2 text-text-primary/95">{title}</h1>
        <button
          type="button"
          className="text-meta pointer-events-auto mt-6 text-text-primary/45 transition-opacity duration-[350ms] hover:opacity-90 focus-visible:opacity-90"
          style={{ transitionTimingFunction: "var(--ease-enter)" }}
        >
          View Memory →
        </button>
      </div>

      {/* 旋转提示与复位。默认只显示提示，转过之后换成复位。 */}
      <div className="text-micro pointer-events-none absolute bottom-8 left-12 z-10 flex items-center gap-5">
        {hintVisible && !rotated && (
          <span className="text-text-primary/25">拖拽旋转 · 滚轮缩放</span>
        )}
        {rotated && (
          <button
            type="button"
            onClick={() => {
              canvasRef.current?.resetView();
              setHintVisible(false);
            }}
            className="pointer-events-auto text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-85"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            复位视角
          </button>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-20 border border-border-subtle" />
      )}

      <ParticleControls />

      {process.env.NODE_ENV !== "production" && <DebugOverlay stats={stats} />}
    </main>
  );
}
