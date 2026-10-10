"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { OrganizePanel } from "@/components/OrganizePanel";
import { PhotoCell } from "@/components/PhotoCell";
import { isImeKey } from "@/lib/keyboard";
import { useExperience } from "@/store/experience";
import type { MemoryDetail } from "@/types";

/**
 * 一册打开的样子 —— `/memories/<id>`（`07 §12`）。
 *
 * ── 点一张照片就是进照片那一页 ───────────────────────────────────────
 *
 * 用户 2026-10-11：「影册里的照片点开也是进照片那个页」。所以这里**不做
 * 自己的看图层**，走的是与时间线那个网格同一个 `PhotoCell` ——
 * 从格子飞进画布，落点 `/?photo=<id>`，`Back` 回这一册
 * （`Back` 去哪由 `stage.entryFromHref` 决定，它记的就是这一页的路径）。
 *
 * ── 三个动作 ─────────────────────────────────────────────────────────
 *
 * 用户 2026-10-11：「**改名保持现在这种，整理和删除是按钮**」，
 * 「按钮……放在进入某一册后的**页面右上**」。所以：
 *
 * ```text
 * 猫猫                            [▦]  [🗑]      ← 整理 / 删除，右上角一排
 * ────────────────────────────────────────
 * ┌────┐┌────┐┌────┐
 * │    ││    ││    │   …
 * └────┘└────┘└────┘
 *
 * 12 张
 * ```
 *
 * - **改名**：点名字就地改（不变 —— 名字就是这一册的标识，改它的入口
 *   没有第二个地方可放）
 * - **整理**：`ImagePlus`，开那张多选面板（加与移出都在里面）
 * - **删除**：`Trash2`，两步。⚠️ 第二下**换成文字**「只删这一册」——
 *   一个图标说不出「照片都留着」，而那一刻正是需要说话的时候
 *
 * ⚠️ **删册不用 `HoldButton`。** 那次长按是给「不可逆」定的（照片文件真删了，
 * `08 §16`）。删一册只断关系、照片全在，重建一册就行 —— 同一道门用在
 * 两件分量不同的事上，门本身就不值钱了。所以这里是两步点击，四秒没再碰
 * 就自己收回。
 *
 * ⚠️ **文案不留解释性的句子**（用户 2026-10-11：「所有的文字都不要太白话了」）。
 *
 * ── 为什么「整理」只有一个入口 ───────────────────────────────────────
 *
 * 加与移出是同一件事的两面（这张照片属不属于这一册），共用同一个网格、
 * 同一套多选、同一个 `Done`。分成两个入口，人会以为那是两件事。
 * 细节在 `OrganizePanel`。
 */

/** 进了待确认之后，多久没再碰它就自己收回 */
const CONFIRM_IDLE_MS = 4000;

interface MemoryAlbumProps {
  album: MemoryDetail;
  /**
   * 一进来就把整理面板打开。
   *
   * 来自 `?organize=1` —— 架子上刚新建完一册就带着它过来（见 `MemoriesSpace`）。
   */
  openOrganize: boolean;
}

export function MemoryAlbum({ album, openOrganize }: MemoryAlbumProps) {
  const setStage = useExperience((s) => s.setStage);
  const router = useRouter();
  const pathname = usePathname();

  const [title, setTitle] = useState(album.title);
  const [draft, setDraft] = useState(album.title);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [organizing, setOrganizing] = useState(openOrganize);

  // 与架子同一句：每个空间都必须声明一次（`stage.space` 的注释里有理由）
  useEffect(() => {
    setStage({ space: "memories", photoId: null });
  }, [setStage]);

  /*
   * 待确认是有寿命的。
   *
   * 它没有别的退出路径（不像照片那个删除还有「点到别处 / Esc」），
   * 所以必须自己收回 —— 否则它就一直挂在那儿，等一个路过的点击。
   */
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), CONFIRM_IDLE_MS);
    return () => clearTimeout(t);
  }, [confirming]);

  const commitTitle = useCallback(async () => {
    const next = draft.trim();
    if (next === title || saving) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/memories/${album.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "没能改名");
      }
      setTitle(next);
      setDraft(next);
      setEditing(false);
      // 架子上那一格读的是服务端给的 title，刷新一次才跟着变
      router.refresh();
    } catch (err) {
      // 保存失败就停在编辑态 —— 用户的输入不能丢
      setNotice(err instanceof Error ? err.message : "没能改名");
    } finally {
      setSaving(false);
    }
  }, [draft, title, saving, album.id, router]);

  const removeAlbum = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/memories/${album.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "没能删掉");
      }
      // 回架子去。这一册已经不存在了，留在原地只会是一个 404
      router.push("/memories");
      router.refresh();
    } catch (err) {
      setDeleting(false);
      setConfirming(false);
      setNotice(err instanceof Error ? err.message : "没能删掉");
    }
  }, [deleting, album.id, router]);

  /** 面板关掉时顺手把 `?organize=1` 从地址栏抹掉 —— 刷新不该又弹一次 */
  const closeOrganize = useCallback(() => {
    setOrganizing(false);
    if (openOrganize) router.replace(pathname, { scroll: false });
  }, [openOrganize, router, pathname]);

  return (
    <main className="min-h-dvh px-12 pt-32 pb-32">
      <div className="mx-auto w-full max-w-[880px]">
        <header className="mb-10 flex items-center justify-between gap-8">
          <div className="flex min-w-0 items-baseline gap-6">
            {/*
              ⚠️ **这一层必须有自己的出口**（用户 2026-10-11：「进入影册以后
              出不来了」）。

              架子上那一格是**进得来的一道门**，可进来之后原先只剩顶栏那个
              「Memories」—— 而那正是**你已经在的那个空间**，40% 的亮度读起来
              是「你在这儿」，不是「上一级」。整理面板一开，它更是整个被盖住。

              这与照片页为什么要有 `Back` 是同一条（硬约束 #11、
              `16 §8.6`）：**进得去的门就是出得来的门。**

              文案与照片页那个**逐字相同、样式也相同**（`Back`、不带箭头、
              不带下划线、0.45 底 hover 提亮）—— 同一条规矩：它是一项
              **导航的字**，不是控件，而且**不按去向改名**。
              位置不同（那里在底下那一行，这里在标题左）只因为这一页是
              一条会滚动的列表，出口压在滚动区之下就等于没有。
            */}
            <Link
              href="/memories"
              className="text-meta shrink-0 text-text-primary opacity-45 transition-opacity duration-[350ms] hover:opacity-90 focus-visible:opacity-90"
              style={{ transitionTimingFunction: "var(--ease-enter)" }}
            >
              Back
            </Link>

            {editing ? (
              <input
                autoFocus
                value={draft}
                disabled={saving}
                maxLength={60}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commitTitle()}
                onKeyDown={(e) => {
                  // 组字中的 Enter / Esc 是输入法的，不是你的（`lib/keyboard.ts`）
                  if (isImeKey(e)) return;
                  if (e.key === "Enter") void commitTitle();
                  if (e.key === "Escape") {
                    setDraft(title);
                    setEditing(false);
                  }
                }}
                className="text-body min-w-0 flex-1 border-0 border-b border-border-subtle bg-transparent pb-1 text-text-primary/95 outline-none focus:border-text-primary/40"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft(title);
                  setEditing(true);
                }}
                title="点一下改"
                className="text-body min-w-0 truncate text-left underline-offset-4 hover:underline"
              >
                {title}
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-5">
            <button
              type="button"
              onClick={() => setOrganizing(true)}
              aria-label="整理照片"
              title="整理照片"
              className="text-text-primary flex h-7 w-7 items-center justify-center opacity-40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
              style={{ transitionTimingFunction: "var(--ease-enter)" }}
            >
              <ImagePlus size={16} strokeWidth={1.6} aria-hidden />
            </button>

            {/*
              删掉这一册。**照片一张都不动**（`08 §4`）。

              ⚠️ 进待确认之后**换成文字**：一个图标说不出「只删这一册」，
              而那一刻正是需要说话的时候。用户 2026-10-11 定的调子是
              「所有的文字都不要太白话了」—— 所以那句话短到只有五个字。
            */}
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                if (confirming) void removeAlbum();
                else setConfirming(true);
              }}
              aria-label="删除这一册"
              title={confirming ? undefined : "删除这一册"}
              className={
                confirming
                  ? "text-micro text-text-primary whitespace-nowrap opacity-70 transition-opacity duration-[350ms] hover:opacity-100 focus-visible:opacity-100"
                  : "text-text-primary flex h-7 w-7 items-center justify-center opacity-40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85 disabled:opacity-30"
              }
              style={{ transitionTimingFunction: "var(--ease-enter)" }}
            >
              {deleting ? (
                <span className="text-meta" aria-hidden>
                  …
                </span>
              ) : confirming ? (
                "只删这一册"
              ) : (
                <Trash2 size={16} strokeWidth={1.6} aria-hidden />
              )}
            </button>
          </div>
        </header>

        {notice && (
          <p className="text-meta mb-6 text-text-primary/60" role="status">
            {notice}
          </p>
        )}

        {album.photos.length === 0 ? (
          <p className="text-meta text-text-primary/35">空</p>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {album.photos.map((photo) => (
              <li key={photo.id}>
                <PhotoCell photo={photo} />
              </li>
            ))}
          </ul>
        )}

        <p className="text-micro mt-10 text-text-primary/30">
          {album.photos.length} 张
        </p>
      </div>

      {organizing && (
        <OrganizePanel
          albumId={album.id}
          albumTitle={title}
          /*
           * ⚠️ 传 `key`：换一册时要把面板的选择状态整个重来。
           * 带着上一册的勾选进新一册，是一眼看不出来的脏状态。
           */
          key={album.id}
          initialInAlbum={album.photos.map((p) => p.id)}
          onClose={closeOrganize}
        />
      )}
    </main>
  );
}
