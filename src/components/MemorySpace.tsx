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
import { useExperience } from "@/store/experience";

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
  /** 删除是两步确认：第一次点击进入待确认，不弹模态框（07 §1 不要重 UI） */
  const [confirmDelete, setConfirmDelete] = useState(false);
  /**
   * 显示模式。
   *
   * 进入照片默认**原图**（`16-ALBUM_SPACE.md` §8.1），点「翻开这一天」才切粒子。
   * 状态不持久化 —— 每次进入都是原图，这样粒子的第一次出现才有分量。
   */
  const displayMode = useExperience((s) => s.displayMode);
  const setDisplayMode = useExperience((s) => s.setDisplayMode);
  // 每次进入照片都从原图开始（§8.1：状态不持久化）
  useEffect(() => {
    setDisplayMode("photo");
  }, [setDisplayMode]);

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
        // 注意：不 close() —— 所有权转给引擎，贴图会引用它（见 ParticleSystem.setImage）
        await canvasRef.current?.setImage(bitmap);
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
        // 先用本地文件直接成型 —— 不等网络往返，手感即时
        // 不 close()：所有权转给引擎
        const bitmap = await createImageBitmap(file);
        await canvasRef.current?.morphTo(bitmap);

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

  // 进入待确认后 4 秒自动撤回，避免按钮一直停在危险状态
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  /** 删除当前记忆。顺序由服务端保证：先删文件再删记录（08 §15）。 */
  const handleDelete = useCallback(async () => {
    if (!memory) return;
    setBusy(true);
    setNotice(null);

    try {
      const res = await fetch(`/api/memories/${memory.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "删除失败");
      }

      // 先直接回到原图，**不播过渡** —— 接下来要换图，
      // 让模式过渡和换图同时发生会互相打架（旧图会先溶解一遍）
      canvasRef.current?.setMode("photo", { immediate: true });
      setDisplayMode("photo");

      // 画布回到内置示例 —— 不能留着一张已经不在数据库里的照片
      const sampleRes = await fetch(SAMPLE_MEMORY.imageUrl);
      const bitmap = await createImageBitmap(await sampleRes.blob());
      loadedUrlRef.current = SAMPLE_MEMORY.imageUrl;
      await canvasRef.current?.setImage(bitmap);

      setConfirmDelete(false);
      router.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "删除失败");
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }, [memory, router, setDisplayMode]);

  const onViewChange = useCallback((isRotated: boolean) => {
    setRotated(isRotated);
  }, []);

  /**
   * 翻开这一天：溶解 + 专注推近（`16-ALBUM_SPACE.md` §8.3、§8.5）。
   *
   * **没有手动切回的入口** —— 出口是左上角的「返回」（§8.6）。
   * 把这件事做成一个双向开关，就把它说成了显示选项，
   * 而它其实是一次关于记忆的动作（§8.4）。
   */
  const enterParticle = useCallback(() => {
    setDisplayMode("particle");
  }, [setDisplayMode]);

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
          onClick={enterParticle}
          aria-hidden={displayMode === "particle"}
          tabIndex={displayMode === "particle" ? -1 : 0}
          className="text-meta pointer-events-auto mt-6 text-text-primary/45 hover:opacity-90 focus-visible:opacity-90"
          style={{
            // 与溶解同一条缓动和时长，让它的退场成为镜头的一部分
            // 而不是控件突然消失（16-ALBUM_SPACE.md §8.6）
            opacity: displayMode === "photo" ? 1 : 0,
            transition: "opacity var(--duration-morph) var(--ease-morph)",
            pointerEvents: displayMode === "photo" ? "auto" : "none",
          }}
        >
          翻开这一天
        </button>
      </div>

      {/* 左下角：旋转提示 / 复位 / 删除 / 状态。
          删除放在这里而不是紧挨 View Memory → —— 主操作的旁边不该放破坏性动作。 */}
      <div className="text-micro absolute bottom-8 left-12 z-10 flex items-center gap-5">
        {busy && (
          <span className="pointer-events-none text-text-primary/40">
            处理中…
          </span>
        )}

        {notice && (
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-text-primary/60 underline-offset-4 hover:underline"
          >
            {notice}
          </button>
        )}

        {!busy && !notice && (
          <>
            {rotated ? (
              <button
                type="button"
                onClick={() => canvasRef.current?.resetView()}
                className="text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-85"
                style={{ transitionTimingFunction: "var(--ease-enter)" }}
              >
                复位视角
              </button>
            ) : (
              <span className="pointer-events-none text-text-primary/25">
                拖入照片 · 拖拽旋转
              </span>
            )}

            {hasRealMemory && memory && (
              // 面板没有强调色，所以用「提亮」而非红色来表达危险：
              // 深色背景上接近纯白是最抢眼的，这是这套配色表达「注意」的方式
              <button
                type="button"
                onClick={
                  confirmDelete ? handleDelete : () => setConfirmDelete(true)
                }
                aria-live={confirmDelete ? "polite" : undefined}
                className="transition-opacity duration-[200ms]"
                style={{
                  opacity: confirmDelete ? 0.95 : 0.4,
                  transitionTimingFunction: "var(--ease-enter)",
                }}
              >
                {confirmDelete ? "确认删除？" : "删除"}
              </button>
            )}
          </>
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
