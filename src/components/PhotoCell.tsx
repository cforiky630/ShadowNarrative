"use client";

import Link from "next/link";
import { useStage } from "@/components/ExperienceShell";
import type { Photo } from "@/types";

/**
 * 网格里的一张照片 —— 时间线的「这一天的照片」与影册的网格共用这一个。
 *
 * ── 它为什么不只是 <img> ────────────────────────────────────────────
 *
 * **是 Link，但点了不直接走。** 先交给外壳把这张照片从**这个格子**飞进画布
 * （`ExperienceShell.enter`，`16 §11.5`），再换路由。这样「点一张照片」
 * 读起来是同一空间里的一次推进，而不是切页面 —— 而 `16 §8.6` 那条
 * 「不能让人感觉是切换页面」是整个产品最核心的主张。
 *
 * 保留 `Link` 而不是换成 `div + router.push`：**修饰键与中键的语义要留着**。
 * 新标签页打开一张照片是合理的，那时候不该播什么镜头。
 *
 * ⚠️ **缩略图，不是原图**（`08 §6`）。网格里一张约 285 CSS px 宽，
 * 原图在这个尺寸下只是白费内存。画布与 AI 才用原图。
 */
export function PhotoCell({
  photo,
  className,
}: {
  photo: Photo;
  /** 额外的格子样式（尺寸、圆角那些）。网格的列数归调用方 */
  className?: string;
}) {
  const { enter } = useStage();

  return (
    <Link
      href={`/?photo=${photo.id}`}
      onClick={(e) => {
        if (
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          e.button !== 0
        ) {
          return;
        }
        e.preventDefault();
        enter(photo.id, e.currentTarget.getBoundingClientRect());
      }}
      className={
        className ??
        "block overflow-hidden rounded-sm transition-opacity hover:opacity-80"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/photos/${photo.id}/thumbnail`}
        alt=""
        loading="lazy"
        decoding="async"
        className="aspect-[4/3] w-full object-cover"
      />
    </Link>
  );
}
