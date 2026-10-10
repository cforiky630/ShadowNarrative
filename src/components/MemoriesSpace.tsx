"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { isImeKey } from "@/lib/keyboard";
import { useExperience } from "@/store/experience";
import type { MemorySummary } from "@/types";

/**
 * 影册的架子 —— `/memories`（`07 §12`）。
 *
 * 用户 2026-10-11 定的这个空间：「memorys 这个页面……有相簿模块可以新建相簿
 * （**这里叫影册**）」，「**分组是用户自己分**，就像相册一样使用」。
 *
 * 三个空间各切一刀，架子是第三刀：
 *
 * ```text
 * Album（第一屏）   我挑出来的      收藏
 * 时间线            我拍过的全部    按天
 * 影册              我自己归的      这一屏
 * ```
 *
 * ── 每一格是一组缩略图，不是一张封面 ─────────────────────────────────
 *
 * 用户 2026-10-11：「**每一册都是一组缩略图作为一个入口**，点开才是对应的
 * 影册」。一张说不出这一册里都有些什么，四张能 —— 与 iOS 相册的封面同一个
 * 道理。拼法见 `AlbumCover`。
 *
 * ⚠️ **不搬时间线那个可拖的叠放**（`PhotoStack`）—— 用户同日那句
 * 「这种册可能单册照片偏多不太适合那个滑动，不然压力太大」。
 * 架子这一格是**静的**：它只是个入口，点开才是内容。
 *
 * ── 文案的调子 ───────────────────────────────────────────────────────
 *
 * 用户 2026-10-11：「**所有的文字都不要太白话了，很 low 啊**」。
 * 所以这一屏上不留解释性的句子 —— 入口自己会说话，说明留给文档。
 * 结构性动作（新建）走英文，与 `Timeline` / `Back` / `Into this moment`
 * 同一条（`02 §12`）。
 */

interface MemoriesSpaceProps {
  albums: MemorySummary[];
}

export function MemoriesSpace({ albums }: MemoriesSpaceProps) {
  const setStage = useExperience((s) => s.setStage);
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * 声明这是影册空间。
   *
   * ⚠️ **每个空间都必须声明一次**（`stage.space` 的注释里有完整理由）。
   * 漏掉的话画布那一层不会收起来 —— 它不透明度还是 1、还压在最上面，
   * 一层实心黑盖住整页（`TimelineSpace` 踩过）。
   */
  useEffect(() => {
    setStage({ space: "memories", photoId: null });
  }, [setStage]);

  const create = useCallback(async () => {
    const title = draft.trim();
    if (!title || busy) return;

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const body = (await res.json().catch(() => null)) as {
        data?: { id: string };
        error?: { message?: string };
      } | null;
      if (!res.ok || !body?.data) {
        throw new Error(body?.error?.message ?? "没能建起来");
      }

      setCreating(false);
      setDraft("");
      /*
       * 直接进这一册，**并且把整理照片那张面板打开**。
       *
       * 这是用户描述的那条路（「新建相簿 → 把这一批放进去」）——
       * 刚建完的一册里什么都没有，停在一个空册上等于多问一句
       * 「然后呢」。`?organize=1` 就是这一句「然后」。
       */
      router.push(`/memories/${body.data.id}?organize=1`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "没能建起来");
    } finally {
      setBusy(false);
    }
  }, [draft, busy, router]);

  return (
    <main className="min-h-dvh px-12 pt-32 pb-32">
      <div className="mx-auto w-full max-w-[880px]">
        <header className="mb-10 flex items-baseline justify-between gap-6">
          <h1 className="text-micro tracking-[0.08em] text-text-primary/45">
            影册
          </h1>

          {/*
            新建。**图标，不是文字**（用户 2026-10-11：「按钮用图标吧」）——
            与进入某一册之后右上角那两个同一套（16px / `strokeWidth 1.6`）。
            建的时候它变成 ×，给这个输入框一个明面上的出口（除了 Esc 与空着走开）。
          */}
          <button
            type="button"
            onClick={() => {
              if (creating) {
                setDraft("");
                setCreating(false);
              } else {
                setDraft("");
                setCreating(true);
              }
            }}
            aria-label={creating ? "取消" : "New Collection"}
            title={creating ? "取消" : "New Collection"}
            className="text-text-primary flex h-7 w-7 shrink-0 items-center justify-center opacity-40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            {creating ? (
              <X size={16} strokeWidth={1.6} aria-hidden />
            ) : (
              <Plus size={16} strokeWidth={1.6} aria-hidden />
            )}
          </button>
        </header>

        {creating && (
          <div className="mb-10">
            <input
              // 点了「新建」就是为了起名，自动聚焦是对的
              autoFocus
              value={draft}
              placeholder="New Collection"
              disabled={busy}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                // 空着走开 = 算了。有字才提交（失焦提交与 Enter 同一条路）
                if (draft.trim()) void create();
                else setCreating(false);
              }}
              onKeyDown={(e) => {
                // 组字中的 Enter / Esc 是输入法的，不是你的（`lib/keyboard.ts`）
                if (isImeKey(e)) return;
                if (e.key === "Enter") void create();
                if (e.key === "Escape") {
                  setDraft("");
                  setCreating(false);
                }
              }}
              className="text-body w-full border-0 border-b border-border-subtle bg-transparent pb-2 text-text-primary/95 outline-none placeholder:text-text-primary/25 focus:border-text-primary/40"
            />
          </div>
        )}

        {notice && (
          <p className="text-meta mb-6 text-text-primary/60" role="status">
            {notice}
          </p>
        )}

        {albums.length === 0 && !creating ? (
          <p className="text-meta text-text-primary/35">还没有影册</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
            {albums.map((album) => (
              <li key={album.id}>
                <Link
                  href={`/memories/${album.id}`}
                  className="group block transition-opacity duration-[350ms] hover:opacity-80 focus-visible:opacity-80"
                  style={{ transitionTimingFunction: "var(--ease-enter)" }}
                >
                  <AlbumCover ids={album.coverIds} />
                  <p className="text-meta mt-3 truncate text-text-primary/85">
                    {album.title}
                  </p>
                  <p className="text-micro mt-1 text-text-primary/30">
                    {album.count} 张
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

/**
 * 架子那一格的拼图。
 *
 * 固定的 4:3 框里按张数换拼法 —— 一直是**一张大图**读起来最像相册，
 * 所以能摆几张就摆几张，最多四张：
 *
 * ```text
 * 1 张      2 张       3 张        4 张
 * ┌────┐   ┌──┬──┐   ┌─────┐    ┌──┬──┐
 * │    │   │  │  │   │     │    │  │  │
 * │    │   │  │  │   ├──┬──┤    ├──┼──┤
 * └────┘   └──┴──┘   └──┴──┘    └──┴──┘
 * ```
 *
 * 空册是一个虚线的空框 —— **不装假封面**，随便拿一张顶上会让人以为
 * 那一册就是那张照片。
 */
function AlbumCover({ ids }: { ids: string[] }) {
  if (ids.length === 0) {
    return (
      <div
        aria-hidden
        className="aspect-[4/3] w-full rounded-sm border border-dashed"
        style={{ borderColor: "var(--border-subtle)" }}
      />
    );
  }

  /** 第 0 张在 3 张时横跨上半 —— 「一大多小」是最好认的那种拼法 */
  const span = (index: number) => {
    if (ids.length === 1) return "col-span-2 row-span-2";
    if (ids.length === 2) return "row-span-2";
    if (ids.length === 3 && index === 0) return "col-span-2";
    return "";
  };

  return (
    <div className="grid aspect-[4/3] w-full grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden rounded-sm">
      {ids.map((id, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={id}
          src={`/api/photos/${id}/thumbnail`}
          alt=""
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${span(index)}`}
        />
      ))}
    </div>
  );
}
