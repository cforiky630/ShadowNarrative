"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ParticleCanvas,
  type ParticleCanvasHandle,
} from "@/components/ParticleCanvas";
import { ParticleControls } from "@/components/ParticleControls";
import { DebugOverlay } from "@/components/DebugOverlay";
import { SAMPLE_MEMORY } from "@/lib/sampleMemory";
import type { MemorySummary } from "@/services/memoryService";
import type { EngineStats } from "@/engine/particle/ParticleSystem";

/**
 * Memory Space —— 首页的客户端部分。
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

const FILL_HEIGHT = 0.60;
const OFFSET_Y = 0.04;
/** 云占 60% 且上移 4% ⇒ 下边缘约在 76%，文字从 78% 起排 */
const TEXT_TOP = "78%";

interface MemorySpaceProps {
  memory: MemorySummary | null;
}

export function MemorySpace({ memory }: MemorySpaceProps) {
  const canvasRef = useRef<ParticleCanvasHandle>(null);
  const router = useRouter();

  const [stats, setStats] = useState<EngineStats | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * 记住「画布上现在显示的是哪张图」。
   *
   * 不能用「只跑一次」的 boolean ref 守卫：StrictMode 下 effect 会跑两遍
   * （挂载 → 清理 → 再挂载），第一遍的 fetch 被 cleanup 取消，第二遍又被
   * 那个已经置位的 ref 挡掉，结果是图片永远不加载。
   *
   * 改成比对 URL：第二次挂载时 loadedUrl 仍是 null，会正常加载；
   * 上传之后 router.refresh() 带来新 URL 时也不会重复 setImage
   * （acceptFile 里已经把它标记过了），避免重置用户刚调好的视角。
   */
  const loadedUrlRef = useRef<string | null>(null);

  const hasRealMemory = memory?.cover != null;
  const imageUrl = hasRealMemory
    ? `/api/media/${memory.cover!.mediaId}`
    : SAMPLE_MEMORY.imageUrl;
  const title = memory?.title ?? SAMPLE_MEMORY.title;
  const date = formatDate(memory?.memoryDate ?? null) ?? SAMPLE_MEMORY.date;

  useEffect(() => {
    if (loadedUrlRef.current === imageUrl) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error(String(res.status));
        const bitmap = await createImageBitmap(await res.blob());
        if (cancelled) {
          bitmap.close();
          return;
        }
        loadedUrlRef.current = imageUrl;
        await canvasRef.current?.setImage(bitmap);
        bitmap.close();
      } catch {
        // 示例图或首张照片加载失败不是致命问题，页面保持空态即可
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  /** 拖入照片 → 先本地成型（即时反馈），再上传落库。 */
  const acceptFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setNotice("只支持图片文件");
        return;
      }
      setBusy(true);
      setNotice(null);

      try {
        // 先用本地文件直接 Morph —— 不等网络往返，手感即时
        const bitmap = await createImageBitmap(file);
        await canvasRef.current?.morphTo(bitmap);
        bitmap.close();

        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/memories", {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? "上传失败");
        }

        // 画布上已经是这张图了，先把它标记为「已加载」，
        // 免得下面的 refresh 带来新 URL 后又 setImage 一次、把视角重置掉。
        const body = (await res.json().catch(() => null)) as {
          data?: { memory?: { cover?: { mediaId?: string } } };
        } | null;
        const newMediaId = body?.data?.memory?.cover?.mediaId;
        if (newMediaId) loadedUrlRef.current = `/api/media/${newMediaId}`;

        // 让服务端把新的 memory 数据带回来，刷新标题等元信息
        router.refresh();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "上传失败");
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const onViewChange = useCallback((isRotated: boolean) => {
    setRotated(isRotated);
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
        if (file) void acceptFile(file);
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

      {/* 左下角：旋转提示 / 复位 / 上传状态 */}
      <div className="text-micro absolute bottom-8 left-12 z-10 flex items-center gap-5">
        {!rotated && !busy && !notice && (
          <span className="pointer-events-none text-text-primary/25">
            拖入照片 · 拖拽旋转
          </span>
        )}
        {rotated && (
          <button
            type="button"
            onClick={() => canvasRef.current?.resetView()}
            className="text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-85"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            复位视角
          </button>
        )}
        {busy && (
          <span className="pointer-events-none text-text-primary/40">
            保存中…
          </span>
        )}
        {notice && (
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-text-primary/55 underline-offset-4 hover:underline"
          >
            {notice}
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

/** 02-DESIGN_SYSTEM.md §4 的日期格式：2025 · 09 · 28 */
function formatDate(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y} · ${m} · ${day}`;
}
