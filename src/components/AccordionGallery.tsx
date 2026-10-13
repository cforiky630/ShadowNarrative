"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { EASE, ensureGsap } from "@/lib/gsap";
// ⚠️ 样式从这个组件里直接 import，**不走 globals.css 的 @import**。
// 那份文件顶部写着一条踩过的坑：@import 必须全部集中在最前面，
// 否则解析器会**静默丢弃**后面的。实测把这份挂在 components.css 之后就
// 正好被丢掉 —— `.ag-panel` 一条规则都没进样式表，而控制台一声不响。
// 组件自己 import 由构建器管，不受那条规则约束，也更贴合「上游来的
// 组件自带样式」这件事。
import "@/styles/accordion-gallery.css";

/**
 * AccordionGallery —— 来自 React Bits（https://reactbits.dev）。
 *
 * 一列照片并排，当前那张展开、其余收成细条，收起的还带一点 3D 侧转。
 * 样式在 `src/styles/accordion-gallery.css`（走 `globals.css` 那个入口，
 * 因为项目的 `@import` 全部集中在最前面 —— 见那个文件顶部的说明）。
 *
 * ── 相对上游改了四处，每一处都有理由 ──────────────────────────────
 *
 * 1. **TSX。** 项目全量 TypeScript，上游是 JSX。
 *
 * 2. **`ref` 回调改成块体。** 上游写的是 `ref={el => (a.current[i] = el)}`
 *    —— 箭头函数**简明体**会把这个赋值的结果**返回**出去。React 19 起，
 *    ref 回调返回非清理函数的值会被警告（它要拿返回值当 cleanup）。
 *    改成 `{ ... }` 就不返回了。这是上游在 React 19 上的一个真问题。
 *
 * 3. **默认缓动换成项目 token 里的 `sn-enter`**（原为 `power3.out`）。
 *    `16 §11.2` 明令不许用 GSAP 内置的命名缓动，否则两套动画库的
 *    「性格」会分裂。`ensureGsap()` 在模块加载时就把 token 里的曲线
 *    注册成 `sn-*`，所以这里直接引用是安全的。
 *
 * 4. **加了 `onActivate`。** 上游点已展开的那张什么都不做（有 link 就跳转）。
 *    我们不要外链 —— 点已展开的那张要进照片页（`16 §3.3`）。
 *    Enter 一并走同一条路。
 *
 * 其余逐行为准，包括那些看起来可以合并的 `useEffect` —— 它们分管
 * 「尺寸量到了重排一次」和「active 变了重排一次」，合并会改变首帧行为。
 */

export interface AccordionGalleryItem {
  image: string;
  label?: string;
  link?: string;
  alt?: string;
}

export interface AccordionGalleryProps {
  items?: AccordionGalleryItem[];
  /** 载入时展开哪一张，免得第一眼看着像坏的 */
  defaultIndex?: number;
  accentColor?: string;
  overlayColor?: string;
  textColor?: string;
  /** 展开的动画时长（秒） */
  duration?: number;
  ease?: string;
  /** 面板缩放时内部图片的漂移强度，0 关掉 */
  parallax?: number;
  /** 收起的面板转多少度。展开的那张是平的 */
  tilt?: number;
  /** 标题条与文字之间的延迟（秒） */
  stagger?: number;
  trigger?: "hover" | "click";
  showLabels?: boolean;
  grayscale?: boolean;
  /**
   * 收起的面板模糊多少 px，展开的那张是清晰的（0 关掉）。
   *
   * 上游没有这一项 —— 它靠 `grayscale` 表达「这张不在焦点上」。
   * 用户 2026-10-10 用一个更好的办法替掉了去色：
   * 「未选中别用黑白吧，用模糊会好点，黑白跟死了一样」。
   * 照片是内容不是装饰，抽掉颜色等于把它变成灰块。
   *
   * 走和上游 `--ag-gray` 同一套机制：GSAP 插值一个无单位的自定义属性，
   * CSS 那边乘 `1px` 用。
   */
  blur?: number;
  height?: number;
  gap?: number;
  radius?: number;
  /** 展开的那张占整行的比例（0.2 – 0.9） */
  expandRatio?: number;
  orientation?: "horizontal" | "vertical";
  className?: string;
  /**
   * 点了/回车了**已经展开的那一张**。
   *
   * 上游没有这个口子：它把 `i === active` 的点击留给 `<a href>` 去跳转。
   * 我们不需要外链，需要的是「点开的那张进照片页」。
   */
  onActivate?: (index: number) => void;
}

const DEFAULT_ITEMS: AccordionGalleryItem[] = [
  { image: "https://picsum.photos/id/1015/900/1200", label: "Canyon" },
  { image: "https://picsum.photos/id/1018/900/1200", label: "Ridgeline" },
  { image: "https://picsum.photos/id/1039/900/1200", label: "Falls" },
  { image: "https://picsum.photos/id/1043/900/1200", label: "Harbour" },
  { image: "https://picsum.photos/id/1044/900/1200", label: "Skyline" },
];

export default function AccordionGallery({
  items = DEFAULT_ITEMS,
  defaultIndex = 2,
  accentColor = "#ffffff",
  overlayColor = "#060010",
  textColor = "#ffffff",
  height = 460,
  gap = 10,
  radius = 16,
  expandRatio = 0.52,
  orientation = "horizontal",
  duration = 0.6,
  ease = EASE.enter,
  parallax = 0.5,
  tilt = 8,
  stagger = 0.06,
  trigger = "hover",
  showLabels = true,
  grayscale = true,
  blur = 0,
  className = "",
  onActivate,
}: AccordionGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const mediaRefs = useRef<(HTMLElement | null)[]>([]);
  const barRefs = useRef<(HTMLElement | null)[]>([]);
  const textRefs = useRef<(HTMLElement | null)[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const firstRunRef = useRef(true);
  const mediaSizeRef = useRef(320);

  const vertical = orientation === "vertical";
  const count = items.length;
  const [active, setActive] = useState(
    Math.min(Math.max(defaultIndex, 0), Math.max(count - 1, 0)),
  );

  const prefersReduced =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const applyLayout = useCallback(
    (animate: boolean) => {
      const panels = panelRefs.current;
      if (!panels.length) return;

      const r = Math.min(Math.max(expandRatio, 0.2), 0.9);
      const grow = count > 1 ? (r * (count - 1)) / (1 - r) : 1;
      const mediaSize = mediaSizeRef.current;

      tlRef.current?.kill();
      const dur = animate && !prefersReduced ? duration : 0;
      const tl = gsap.timeline();

      panels.forEach((panel, i) => {
        if (!panel) return;
        const isActive = i === active;
        const media = mediaRefs.current[i];
        const bar = barRefs.current[i];
        const text = textRefs.current[i];

        const rot = isActive ? 0 : i < active ? tilt : -tilt;
        const rotProp = vertical ? { rotateX: -rot } : { rotateY: rot };

        tl.to(panel, { flexGrow: isActive ? grow : 1, ...rotProp, duration: dur, ease }, 0);

        if (media) {
          const drift = Math.max(-1.5, Math.min(1.5, active - i));
          const shift = drift * parallax * mediaSize * 0.06;
          const gray = grayscale ? (isActive ? 0 : 1) : 0;
          tl.to(
            media,
            {
              xPercent: -50,
              yPercent: -50,
              x: vertical ? 0 : isActive ? 0 : shift,
              y: vertical ? (isActive ? 0 : shift) : 0,
              "--ag-gray": gray,
              "--ag-dim": isActive ? 0 : 0.35,
              "--ag-blur": isActive ? 0 : blur,
              duration: dur,
              ease,
            },
            0,
          );
        }

        if (showLabels && bar && text) {
          if (isActive) {
            tl.to(
              [bar, text],
              { opacity: 1, x: 0, duration: dur, ease, stagger: prefersReduced ? 0 : stagger },
              0,
            );
          } else {
            tl.to([bar, text], { opacity: 0, x: -14, duration: dur * 0.6, ease }, 0);
          }
        }
      });

      tlRef.current = tl;
    },
    [
      active,
      count,
      expandRatio,
      duration,
      ease,
      vertical,
      tilt,
      parallax,
      grayscale,
      blur,
      showLabels,
      stagger,
      prefersReduced,
    ],
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const total = vertical ? rect.height : rect.width;
      const usable = Math.max(total - gap * (count - 1), 120);
      const size = Math.max(
        140,
        usable * Math.min(Math.max(expandRatio, 0.2), 0.9) * 1.22,
      );
      mediaSizeRef.current = size;
      el.style.setProperty("--ag-media-size", `${size}px`);
      applyLayout(!firstRunRef.current);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyLayout, gap, count, expandRatio, vertical]);

  useEffect(() => {
    applyLayout(!firstRunRef.current);
    firstRunRef.current = false;
  }, [applyLayout]);

  useEffect(
    () => () => {
      tlRef.current?.kill();
    },
    [],
  );

  const handleEnter = (i: number) => {
    if (trigger === "hover") setActive(i);
  };

  const handleClick = (i: number, e: React.MouseEvent) => {
    if (i !== active) {
      e.preventDefault();
      setActive(i);
      return;
    }
    // 已经展开的那张：交给调用方（上游这里是留给 <a href> 的）
    onActivate?.(i);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i + 1) % count);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i - 1 + count) % count);
    } else if (e.key === "Enter") {
      // 和点击同一条路：展开的那张进照片页，没展开的先展开
      e.preventDefault();
      if (i === active) onActivate?.(i);
      else setActive(i);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`accordion-gallery${vertical ? " accordion-gallery--vertical" : ""}${
        className ? ` ${className}` : ""
      }`}
      style={
        {
          "--ag-accent": accentColor,
          "--ag-overlay": overlayColor,
          "--ag-text": textColor,
          "--ag-gap": `${gap}px`,
          "--ag-radius": `${radius}px`,
          height: vertical ? `${Math.round(height * 1.6)}px` : `${height}px`,
        } as React.CSSProperties
      }
      role="list"
      aria-label="照片手风琴"
    >
      {items.map((item, i) => {
        const isActive = i === active;
        const Tag: React.ElementType = item.link ? "a" : "div";
        return (
          <Tag
            key={i}
            ref={(el: HTMLElement | null) => {
              panelRefs.current[i] = el;
            }}
            className={`ag-panel${isActive ? " ag-panel--active" : ""}`}
            style={{ borderRadius: `${radius}px` }}
            href={item.link || undefined}
            onClick={(e: React.MouseEvent) => handleClick(i, e)}
            onMouseEnter={() => handleEnter(i)}
            onFocus={() => setActive(i)}
            onKeyDown={(e: React.KeyboardEvent) => handleKeyDown(i, e)}
            role="listitem"
            tabIndex={0}
            aria-current={isActive ? "true" : undefined}
            aria-label={item.label}
          >
            <span className="ag-panel__frame">
              <span
                className="ag-panel__media"
                ref={(el: HTMLElement | null) => {
                  mediaRefs.current[i] = el;
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt={item.alt || item.label || ""} draggable="false" />
              </span>
              <span className="ag-panel__overlay" aria-hidden="true" />
            </span>
            {showLabels && (
              <span className="ag-panel__label" aria-hidden="true">
                <span
                  className="ag-panel__bar"
                  ref={(el: HTMLElement | null) => {
                    barRefs.current[i] = el;
                  }}
                />
                <span
                  className="ag-panel__text"
                  ref={(el: HTMLElement | null) => {
                    textRefs.current[i] = el;
                  }}
                >
                  {item.label}
                </span>
              </span>
            )}
          </Tag>
        );
      })}
    </div>
  );
}

/*
 * 缓动要在建时间线之前注册好。
 * `ensureGsap()` 把 tokens.css 里的曲线换算成 `sn-enter` / `sn-exit` /
 * `sn-morph`，重复调用是幂等的；放模块顶层是为了保证它早于任何一次
 * `gsap.timeline()`。
 */
ensureGsap();
