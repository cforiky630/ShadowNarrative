"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * 悬浮滚动条 —— 替掉时间线 / 影册右侧那根系统画的滚动条。
 *
 * ── 为什么不用原生滚动条 ────────────────────────────────────────────
 *
 * 用户 2026-10-31：「把那两个页面右侧的原生丑滚动条去掉、换成贴合主题的
 * 嵌入式滚动条」。Windows 的经典滚动条常驻、有槽、有箭头，和这个产品的
 * 深色沉浸界面是两套东西；`--text-primary` 那套亮度层次它一样都不认。
 *
 * 所以：原生滚动条在 `globals.css` 里整个藏掉（`scrollbar-width: none`），
 * 这里画一根 3px 的细条贴在右边缘，颜色、圆角、透明度都走项目 token。
 * 它**不占布局** —— 这正是「嵌入式」的意思，也是藏掉原生滚动条之后
 * 视口宽度不再随页面是否可滚动而变化的原因（画布因此不会在换页时 resize）。
 *
 * ── 行为 ────────────────────────────────────────────────────────────
 *
 * - 只有内容真的超出视口时才出现；不超出就整个不渲染
 * - 位置与长度按滚动进度实时算
 * - 可以拖：按的是那一小段，拖的是整页（`scrollTo`）
 * - **自动隐藏**（用户 2026-10-31）：滚动 / 缩放 / 换页时淡入，停手
 *   `HIDE_AFTER_MS` 之后淡出；指针停在细条上或正在拖时一直留着
 * - 键盘 / 滚轮 / 触控板照旧，原生滚动行为一点没改
 *
 * ⚠️ **只在文档滚动上生效。** 页面里的滚动容器（对话、整理面板、网格）
 * 原本就带 `.sn-noscrollbar`，各自藏掉了原生条；它们不需要第二根。
 */

/** 距右边缘。和左下那颗胶囊的 `left-6` 同一条内缩 */
const RIGHT_INSET = 6;
/** 可拖的热区宽度。视觉上只有 3px，但 3px 太难点 —— 热区透明 */
const HIT_WIDTH = 18;
/** 细条本身 */
const THUMB_WIDTH = 3;
/** 再短也要能看见、能按住 */
const MIN_THUMB = 32;
/** 停手之后多久淡出 */
const HIDE_AFTER_MS = 1200;

interface Thumb {
  scrollable: boolean;
  top: number;
  height: number;
}

const HIDDEN: Thumb = { scrollable: false, top: 0, height: 0 };

export function OverlayScrollbar() {
  const pathname = usePathname();
  const [thumb, setThumb] = useState<Thumb>(HIDDEN);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);

  const drag = useRef<{
    startY: number;
    startScroll: number;
    perPx: number;
  } | null>(null);
  /** 指针停在细条上时不自动收 —— 收掉就再也够不着了 */
  const hovering = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  /**
   * 亮一下，然后安排自动隐藏。
   *
   * 拖动中、悬停中不安排 —— 这两种状态下把它收掉都是把人手里的东西抽走。
   * 判据用 ref（`drag.current` / `hovering`）而不是 state：计时器是在
   * 「按下 / 进入」那一刻排的，闭包里的 state 可能已经过期。
   */
  const bump = useCallback(() => {
    clearHideTimer();
    setVisible(true);
    hideTimer.current = setTimeout(() => {
      if (!drag.current && !hovering.current) setVisible(false);
    }, HIDE_AFTER_MS);
  }, [clearHideTimer]);

  const measure = useCallback(() => {
    const doc = document.documentElement;
    const viewport = window.innerHeight;
    const total = Math.max(doc.scrollHeight, document.body.scrollHeight);

    if (total <= viewport + 1) {
      clearHideTimer();
      setThumb((prev) => (prev.scrollable ? HIDDEN : prev));
      setVisible(false);
      return;
    }

    const track = Math.max(1, viewport - RIGHT_INSET * 2);
    const height = Math.max(
      MIN_THUMB,
      Math.round(track * Math.min(1, viewport / total)),
    );
    const maxScroll = Math.max(1, total - viewport);
    const maxTop = Math.max(1, track - height);
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    const top = Math.round(RIGHT_INSET + progress * maxTop);

    setThumb((prev) =>
      prev.scrollable && prev.top === top && prev.height === height
        ? prev
        : { scrollable: true, top, height },
    );
    bump();
  }, [bump, clearHideTimer]);

  useEffect(() => {
    /*
     * 首帧与换页都用 rAF 排一次，而不是在 effect 体里同步 setState ——
     * `react-hooks/set-state-in-effect` 拦的就是后者，而且它拦得对：
     * 那会在一次渲染里再触发一轮级联渲染。
     */
    let raf = requestAnimationFrame(measure);

    const onScroll = () => measure();
    const onResize = () => measure();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    // 内容高度可能晚一步才定（图片解码、揭示动画、路由数据到达）
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(document.body);

    return () => {
      cancelAnimationFrame(raf);
      clearHideTimer();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [measure, pathname, clearHideTimer]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const doc = document.documentElement;
    const viewport = window.innerHeight;
    const total = Math.max(doc.scrollHeight, document.body.scrollHeight);
    const track = Math.max(1, viewport - RIGHT_INSET * 2);
    const height = Math.max(
      MIN_THUMB,
      Math.round(track * Math.min(1, viewport / total)),
    );
    const maxTop = Math.max(1, track - height);
    const perPx = Math.max(1, total - viewport) / maxTop;

    drag.current = {
      startY: e.clientY,
      startScroll: window.scrollY,
      perPx,
    };
    clearHideTimer();
    setVisible(true);
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 合成事件 / 个别环境下没有活动指针时可以捕获失败；拖拽本身照旧
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    window.scrollTo(0, d.startScroll + (e.clientY - d.startY) * d.perPx);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // 指针已经被系统收走时释放会抛；不影响结束拖拽
    }
    bump();
  };

  if (!thumb.scrollable) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-y-0 right-0 z-30 transition-opacity duration-200"
      style={{
        width: HIT_WIDTH + RIGHT_INSET,
        opacity: visible ? 1 : 0,
        pointerEvents: "none",
      }}
    >
      <div
        className="group pointer-events-auto absolute cursor-grab touch-none"
        style={{
          right: 0,
          top: thumb.top,
          width: HIT_WIDTH,
          height: thumb.height,
          // 淡出之后不能再吃指针 —— 那会变成一条看不见的点击屏障
          pointerEvents: visible ? "auto" : "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerEnter={() => {
          hovering.current = true;
          clearHideTimer();
          setVisible(true);
        }}
        onPointerLeave={() => {
          hovering.current = false;
          if (!drag.current) bump();
        }}
      >
        <span
          className={`absolute inset-y-0 right-1.5 rounded-full transition-opacity duration-200 ${
            dragging ? "opacity-80" : "opacity-25 group-hover:opacity-60"
          }`}
          style={{
            width: THUMB_WIDTH,
            background: "var(--text-primary)",
          }}
        />
      </div>
    </div>
  );
}
