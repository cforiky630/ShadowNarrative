"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ParticleCanvas,
  type ParticleCanvasHandle,
} from "@/components/ParticleCanvas";
import { ParticleControls } from "@/components/ParticleControls";
import { DebugOverlay } from "@/components/DebugOverlay";
import { Subtitle } from "@/components/Subtitle";
import { SAMPLE_MEMORY } from "@/lib/sampleMemory";
import type { AiState, PhotoDetail } from "@/types";
import type { EngineStats } from "@/engine/particle/ParticleSystem";
import { useExperience } from "@/store/experience";

/**
 * Photo View —— 首页的客户端部分。
 *
 * 规格：07-UI_PAGE_SPECS.md §1、16-ALBUM_SPACE.md §7.1
 *
 * 尺寸表（16 §7.1，基准视口 1440×900）：
 *   照片主体     画面高度 55–65% · 水平居中 · 垂直偏上 4%
 *   日期         照片下 24px · text-meta · opacity 0.55
 *   字幕         日期下 8px   ← **占用原来"标题"的位置**
 *   操作区       字幕下 24px
 *
 * 「字幕占用原来标题的位置」是 16 §7.1 明确写的：那里原来放记忆标题，
 * 现在放 AI 的第一句话 —— 因为它才是用户最想看到的东西。
 *
 * 不能出现传统 hero 卡片：没有边框、没有投影、没有背景块。
 */

const FILL_HEIGHT = 0.60;
const OFFSET_Y = 0.04;
/** 云占 60% 且上移 4% ⇒ 下边缘约在 76%，文字从 78% 起排 */
const TEXT_TOP = "78%";

/** 轮询间隔与上限（08 §10：800ms 一次，最多 30 秒） */
const POLL_INTERVAL_MS = 800;
const POLL_TIMEOUT_MS = 30_000;

interface MemorySpaceProps {
  photo: PhotoDetail | null;
}

export function MemorySpace({ photo }: MemorySpaceProps) {
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
   * 字幕与 AI 状态。
   *
   * 初值来自服务端（重新打开照片时字幕要立刻在，不能先空着再等轮询），
   * 之后由轮询接管。
   */
  const [subtitle, setSubtitle] = useState<string | null>(
    photo?.subtitle?.content ?? null,
  );
  const [aiState, setAiState] = useState<AiState>(photo?.aiState ?? "done");

  /**
   * 当前正在显示哪张照片。
   *
   * 不能直接用 `photo.id`：上传之后本地已经切到新照片了，但 `router.refresh()`
   * 要等一个来回才把新的服务端数据送回来。这中间的窗口里如果拿旧的 `photo.id`
   * 去轮询，会问到上一张照片上去。
   */
  const [activeId, setActiveId] = useState<string | null>(photo?.id ?? null);

  /** 上一次从服务端看到的照片 id。用来判断「服务端数据变了没有」。 */
  const serverIdRef = useRef<string | null>(photo?.id ?? null);

  /**
   * 服务端数据到达时同步本地状态 —— **但只在照片真的换了的时候**。
   *
   * 如果无条件同步，`router.refresh()` 带回来的那次渲染（此时分析还没跑完，
   * aiState 还是 pending、字幕还是空）会把轮询刚拿到的字幕覆盖掉。
   */
  useEffect(() => {
    const serverId = photo?.id ?? null;
    if (serverId === serverIdRef.current) return;

    serverIdRef.current = serverId;
    setActiveId(serverId);
    setSubtitle(photo?.subtitle?.content ?? null);
    setAiState(photo?.aiState ?? "done");
  }, [photo]);

  /**
   * 显示模式。
   *
   * 进入照片默认**原图**（16 §8.1），点「翻开这一天」才切粒子。
   * 状态不持久化 —— 每次进入都是原图，这样粒子的第一次出现才有分量。
   */
  const displayMode = useExperience((s) => s.displayMode);
  const setDisplayMode = useExperience((s) => s.setDisplayMode);
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

  const imageUrl = activeId
    ? `/api/photos/${activeId}/file`
    : SAMPLE_MEMORY.imageUrl;

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

  /**
   * 轮询 AI 结果（08 §10）。
   *
   * 首选轮询而不是让上传请求挂着等 AI —— 那样慢、会超时、失败后照片处于半状态。
   * 30 秒还没结果就停；服务端也会在同一个阈值上兜底改判 failed。
   */
  useEffect(() => {
    if (!activeId || aiState !== "pending") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    const poll = async () => {
      if (cancelled) return;

      if (Date.now() > deadline) {
        setAiState("failed");
        return;
      }

      try {
        const res = await fetch(`/api/photos/${activeId}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const body = (await res.json()) as {
            data?: {
              aiState?: AiState;
              subtitle?: { content?: string } | null;
            };
          };
          const next = body.data;
          if (cancelled) return;

          if (next?.subtitle?.content) setSubtitle(next.subtitle.content);
          if (next?.aiState && next.aiState !== "pending") {
            setAiState(next.aiState);
            return; // 终态，停止轮询
          }
        }
      } catch {
        // 网络抖动不该中断整个等待 —— 交给下一次 tick
      }

      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeId, aiState]);

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
        // 先用本地文件直接成型 —— 不等网络往返，手感即时。
        // 「上传后立刻看到原图，不等网络」是 Round 7 的验收项。
        // 不 close()：所有权转给引擎
        const bitmap = await createImageBitmap(file);
        await canvasRef.current?.morphTo(bitmap);

        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/photos", {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? "上传失败");
        }

        const body = (await res.json().catch(() => null)) as {
          data?: { id?: string };
        } | null;
        const newId = body?.data?.id;

        if (newId) {
          // 画布上已经是这张图了，先把它标记为「已加载」，
          // 免得下面 refresh 带来新数据后又 setImage 一次、把视角重置掉。
          loadedUrlRef.current = `/api/photos/${newId}/file`;
          // 换照片 → 旧字幕必须立刻清掉，否则新照片下面挂着上一张的话
          setActiveId(newId);
          setSubtitle(null);
          setAiState("pending");
        }

        // 让服务端把新的照片数据带回来（日期等元信息）
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

  /** 删除当前照片。顺序由服务端保证：先删文件再删记录（08 §16）。 */
  const handleDelete = useCallback(async () => {
    if (!activeId) return;
    setBusy(true);
    setNotice(null);

    try {
      const res = await fetch(`/api/photos/${activeId}`, { method: "DELETE" });
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

      setActiveId(null);
      setSubtitle(null);
      setAiState("done");
      setConfirmDelete(false);
      serverIdRef.current = null;
      router.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "删除失败");
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }, [activeId, router, setDisplayMode]);

  /** 手动重试分析（08 §10）。也是关掉自动分析后唯一的发送入口（09 §21.2）。 */
  const handleRetry = useCallback(async () => {
    if (!activeId) return;
    setSubtitle(null);
    setAiState("pending");

    try {
      const res = await fetch(`/api/photos/${activeId}/analyze`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("重试失败");
    } catch {
      setAiState("failed");
    }
  }, [activeId]);

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

  const hasPhoto = activeId !== null;
  const date = formatDate(photo?.takenAt ?? photo?.createdAt ?? null);

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
        className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center px-6"
        style={{ top: TEXT_TOP }}
      >
        <p className="text-meta text-text-primary/55">
          {date ?? SAMPLE_MEMORY.date}
        </p>

        {/* 字幕占原来标题的位置（16 §7.1）。还没有真实照片时退回内置示例的标题。 */}
        {hasPhoto ? (
          <Subtitle
            content={subtitle}
            state={aiState}
            onRetry={() => void handleRetry()}
          />
        ) : (
          <h1 className="text-title mt-2 text-text-primary/95">
            {SAMPLE_MEMORY.title}
          </h1>
        )}

        {/* 收起用 inert，不用 aria-hidden + tabIndex：元素自己还带着焦点时
            aria-hidden 会被浏览器挡下来并打警告，inert 则是阻止聚焦本身，
            不会出现那种自相矛盾的状态（同一个模式在 TopNavigation 里）。
            消失后焦点落在 body —— 此时文档里第一个可聚焦元素正好是左上角的
            「返回」，一次 Tab 就到，顺着「翻开这一天」之后的意图走。 */}
        <button
          type="button"
          onClick={enterParticle}
          inert={displayMode === "particle"}
          className="text-meta pointer-events-auto mt-6 text-text-primary/45 hover:opacity-90 focus-visible:opacity-90"
          style={{
            // 与溶解同一条缓动和时长，让它的退场成为镜头的一部分
            // 而不是控件突然消失（16 §8.6）
            opacity: displayMode === "photo" ? 1 : 0,
            transition: "opacity var(--duration-morph) var(--ease-morph)",
            pointerEvents: displayMode === "photo" ? "auto" : "none",
          }}
        >
          翻开这一天
        </button>
      </div>

      {/* 左下角：旋转提示 / 复位 / 删除 / 状态。
          删除放在这里而不是紧挨主操作 —— 主操作的旁边不该放破坏性动作。 */}
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

            {hasPhoto && (
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
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y} · ${m} · ${day}`;
}
