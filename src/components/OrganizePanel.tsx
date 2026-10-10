"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, X } from "lucide-react";
import { isImeKey } from "@/lib/keyboard";
import type { Photo } from "@/types";

/**
 * 整理这一册的照片 —— **产品里第一个多选交互**（`07 §12`）。
 *
 * ── 为什么只有一个入口，而不是「加照片」+「移出照片」 ────────────────
 *
 * 那两个是**同一件事的两面**：这张照片属不属于这一册。分成两个入口，人会
 * 以为那是两件事，而它们共用同一个网格、同一套多选、同一个「完成」。
 *
 * ```text
 * 不在册的   点一下 → 待加入（细环 + ✓）
 * 在册的     压暗、角上写「已在册」，点一下 → 待移出（细环 + −）
 * 底部       加入 3 · 移出 1                        [ 完成 ]
 * ```
 *
 * ⚠️ **「已在册」那几格必须点得动。** 第一版想的是「压暗且点不动」，
 * 那正是 `TopNavigation` 开头那条要挡的「点不动的东西」—— 而且它会把
 * 「那我要怎么移出」变成一个没有答案的问题。现在答案就在原地。
 *
 * ⚠️ 待移出**要按「完成」才生效**，加上格子上明写着「已在册」，
 * 所以误触是可逆、也看得出来的。
 *
 * ── 用户 2026-10-11 定的一条口径 ─────────────────────────────────────
 *
 * 「相册里的删除既然不是真删除那就叫**移出**」—— 照片本身一张不动
 * （文件、对话、随笔小记全在），只是不在这册里了。
 */

/** 一次取多少张。60 大约是一屏半，够触发下一次预取 */
const PAGE_SIZE = 60;

/**
 * 取一页 —— **纯函数，不碰 state**。
 *
 * 分成「取」与「落」两步是为了一条 lint 规则（`react-hooks/set-state-in-effect`）：
 * 挂载那一趟必须让**第一个 setState 发生在 await 之后**，否则就是
 * 「在 effect 体里同步改状态」，会触发一轮多余的级联渲染。那一条拦得对 ——
 * 与 `store/experience.ts` 里 `setStage` 那段说的是同一件事。
 */
async function fetchPhotoPage(cursor: string | null): Promise<{
  photos: Photo[];
  nextCursor: string | null;
}> {
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) qs.set("cursor", cursor);
  const res = await fetch(`/api/photos?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error();
  const body = (await res.json()) as {
    data: Photo[];
    meta: { nextCursor: string | null };
  };
  return { photos: body.data, nextCursor: body.meta.nextCursor };
}

interface OrganizePanelProps {
  albumId: string;
  albumTitle: string;
  /** 这一册现在有哪几张。**取一次就不变了** —— 会话中途的归属由选择状态表达 */
  initialInAlbum: string[];
  onClose: () => void;
}

export function OrganizePanel({
  albumId,
  albumTitle,
  initialInAlbum,
  onClose,
}: OrganizePanelProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  /** 进来时就在册里的那些。`useState` 只为了拿一份稳定的引用 */
  const [inAlbum] = useState(() => new Set(initialInAlbum));
  const [add, setAdd] = useState<Set<string>>(new Set());
  const [remove, setRemove] = useState<Set<string>>(new Set());

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [end, setEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** 落一页。挂载那趟与翻页那趟共用 */
  const applyPage = useCallback(
    (page: { photos: Photo[]; nextCursor: string | null }) => {
      setPhotos((prev) => [...prev, ...page.photos]);
      setCursor(page.nextCursor);
      if (!page.nextCursor) setEnd(true);
    },
    [],
  );

  // 第一页。⚠️ 第一个 setState 在 `await` 之后 —— 见 `fetchPhotoPage` 的说明
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await fetchPhotoPage(null);
        if (!cancelled) applyPage(page);
      } catch {
        if (!cancelled) setError("读不到照片");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPage]);

  /**
   * 翻下一页。**由观察器触发**，不是 effect 体里同步调的 ——
   * 那是一个外部系统的回调，在它里面改状态天经地义。
   *
   * `cursor` 为 null 且 `end` 为 false 是「第一页还在路上」，这里直接让开。
   */
  const loadMore = useCallback(async () => {
    if (loading || end || !cursor) return;
    setLoading(true);
    try {
      applyPage(await fetchPhotoPage(cursor));
    } catch {
      setError("读不到照片");
    } finally {
      setLoading(false);
    }
  }, [loading, end, cursor, applyPage]);

  /*
   * 滚到底就再取一页。
   *
   * `root` 指到这个面板自己（它是那个滚动容器）—— 不指的话观察的是视口，
   * 而这一层是 `fixed inset-0`，两者恰好重合，但那是巧合，不是契约。
   */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { root: scrollRef.current, rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  /*
   * Esc 退出。
   *
   * ⚠️ **先过 `isImeKey`** —— 这个面板里当下没有输入框，但
   * `DockCard` 那次的教训是「每个按键处理器都该先问这一句」：
   * 界面上有没有输入框是会变的，而这一句的代价是零（`lib/keyboard.ts`）。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isImeKey(e)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = useCallback(
    (id: string) => {
      if (saving) return;
      const [from, to] = inAlbum.has(id)
        ? ([remove, setRemove] as const)
        : ([add, setAdd] as const);
      const next = new Set(from);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      to(next);
    },
    [inAlbum, add, remove, saving],
  );

  const commit = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (add.size) {
        const res = await fetch(`/api/memories/${albumId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoIds: [...add] }),
        });
        if (!res.ok) throw new Error("没能加进去");
      }

      // 一张一张移。移出是幂等的单张操作（`08 §9`），
      // 而为了它专门开一个批量接口不值得 —— 一次整理里移出的通常是个位数
      for (const photoId of remove) {
        const res = await fetch(
          `/api/memories/${albumId}/photos/${photoId}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("没能移出来");
      }

      onClose();
      router.refresh();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "没能保存");
    }
  }, [saving, add, remove, albumId, onClose, router]);

  /*
   * 汇总条上的那两个记号。
   *
   * 用 `+3 −1` 而不是「加入 3 张 · 移出 1 张」—— 加与减本来就是这一屏
   * 唯一的两种动作，符号比句子短，也比句子准确
   * （用户 2026-10-11：「所有的文字都不要太白话了」）。
   */
  const summary = [
    add.size ? `+${add.size}` : null,
    remove.size ? `−${remove.size}` : null,
  ]
    .filter(Boolean)
    .join("  ");

  return (
    <div
      ref={scrollRef}
      role="dialog"
      aria-modal="true"
      aria-label={`整理「${albumTitle}」的照片`}
      className="sn-noscrollbar fixed inset-0 z-40 overflow-y-auto overscroll-contain px-6 pt-24 pb-32"
      // 实心，不做半透明 —— 与时间线那个网格同一条：在全屏的阅读层上，
      // 底下透出来读起来像渲染瑕疵，不像氛围
      style={{ background: "var(--background)" }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        title="关闭"
        className="text-text-primary fixed top-24 right-12 flex h-7 w-7 items-center justify-center opacity-40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
        style={{ transitionTimingFunction: "var(--ease-enter)" }}
      >
        <X size={16} strokeWidth={1.6} aria-hidden />
      </button>

      <div className="mx-auto max-w-[980px]">
        {/*
          这一屏只留一个身份标识，不留解释性的话
          （用户 2026-10-11：「所有的文字都不要太白话了」）。
          两种状态各有自己的样子 —— 压暗 + 「已在册」 + 环 —— 用不着写说明书。
        */}
        <p className="text-micro mb-6 text-text-primary/45">{albumTitle}</p>

        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-6">
          {photos.map((photo) => {
            const owned = inAlbum.has(photo.id);
            const picked = owned ? remove.has(photo.id) : add.has(photo.id);
            return (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => toggle(photo.id)}
                  aria-pressed={picked}
                  aria-label={
                    owned
                      ? picked
                        ? "移出这一张"
                        : "这张已在册，点一下移出"
                      : picked
                        ? "取消选中"
                        : "选中这一张"
                  }
                  className="relative block w-full cursor-pointer overflow-hidden rounded-sm"
                  style={{
                    // 选中的环用 inset box-shadow 而不是 ring ——
                    // 不依赖 Tailwind 的 ring 在 v4 里的写法，而且它压在图上，
                    // 不占布局
                    boxShadow: picked
                      ? "inset 0 0 0 2px color-mix(in oklab, var(--text-primary) 85%, transparent)"
                      : undefined,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/photos/${photo.id}/thumbnail`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={`aspect-square w-full object-cover transition-opacity duration-[350ms] ${
                      owned ? "opacity-35" : "opacity-100"
                    }`}
                  />

                  {owned && (
                    <span className="text-micro absolute bottom-1 left-1.5 text-text-primary/55">
                      已在册
                    </span>
                  )}

                  {picked && (
                    <span
                      className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full"
                      style={{ background: "var(--text-primary)" }}
                    >
                      {owned ? (
                        <Minus
                          size={11}
                          strokeWidth={2}
                          aria-hidden
                          style={{ color: "var(--background)" }}
                        />
                      ) : (
                        <Check
                          size={11}
                          strokeWidth={2}
                          aria-hidden
                          style={{ color: "var(--background)" }}
                        />
                      )}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div ref={sentinelRef} className="h-12" />

        {/*
          第一页还在路上时也要有个东西 —— 那句 `…` 的判据是
          「一张都还没有」，不是 `loading`（第一页那一趟刻意不碰 `loading`，
          见 `fetchPhotoPage`）。
        */}
        {(loading || (!photos.length && !end && !error)) && (
          <p className="text-meta text-center text-text-primary/25">…</p>
        )}
        {error && (
          <p className="text-meta text-center text-text-primary/60" role="status">
            {error}
          </p>
        )}
        {end && !photos.length && !error && (
          <p className="text-meta text-center text-text-primary/35">
            还没有照片。
          </p>
        )}
      </div>

      {/*
        底部那条。**只在有改动时才是实心的** —— 没选任何东西时 `Done`
        仍然在（它是出口，不是提交）。
      */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center px-6 pt-16 pb-8"
        style={{
          background:
            "linear-gradient(to top, var(--background) 55%, transparent)",
        }}
      >
        <div className="pointer-events-auto flex items-baseline gap-8">
          <span className="text-meta text-text-primary/45">{summary}</span>
          <button
            type="button"
            disabled={saving}
            onClick={() => void commit()}
            className="text-meta text-text-primary opacity-70 underline-offset-4 transition-opacity duration-[350ms] hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
            style={{
              transitionTimingFunction: "var(--ease-enter)",
              textDecorationLine: summary ? "underline" : "none",
            }}
          >
            {saving ? "…" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
