"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Minus, Square, X } from "lucide-react";

/**
 * 顶部沉浸式浮岛导航栏（融合 Folia 桌面端无边框临顶呼出交互）。
 *
 * 交互与视觉特征：
 * 1. **平时彻底隐形（Zero Distraction）**：
 *    默认 `opacity: 0` 且不干扰画面，粒子、照片与画廊直通视口最顶端。
 * 2. **鼠标临顶浮现（Hover-to-Reveal with Frosted Glass）**：
 *    指针靠近屏幕顶部（`clientY <= 44`）或键盘聚焦进入顶栏时，以 `--duration-ui`
 *    缓动平滑滑入暗色毛玻璃顶栏（`backdrop-blur` + 微光底边）；
 *    指针离开顶部区域后延迟 `1000ms` 平滑淡出，避免指针轻扫时闪烁。
 * 3. **桌面端无边框拖拽与窗口三键（Frameless Window Controls）**：
 *    在 Electron 桌面封装环境下自动启用窗口拖拽区（`-webkit-app-region: drag`，
 *    非最大化时预留顶部 3px 系统缩放边缘）与右上角极简窗口控制三键（最小化、最大化/还原、关闭）；
 *    在普通 Web 浏览器访问时自动隐藏窗口三键，零副作用。
 */

interface DesktopWindowApi {
  isDesktop?: boolean;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    snDesktop?: DesktopWindowApi;
    electronAPI?: DesktopWindowApi;
  }
}

const NAV_ITEMS = [
  { href: "/timeline", label: "Timeline" },
  { href: "/memories", label: "Memories" },
] as const;

/** 触发呼出的顶部感应高度（px） */
const REVEAL_ZONE_Y = 44;
/** 触发收起判定的离开高度（px） */
const LEAVE_ZONE_Y = 56;
/** 指针离开顶部后延迟多久收起（ms） */
const HIDE_DELAY_MS = 1000;

function getDesktopApi(): DesktopWindowApi | undefined {
  if (typeof window === "undefined") return undefined;
  return window.snDesktop ?? window.electronAPI;
}

let maximizedStoreValue = false;

function subscribeMaximized(onStoreChange: () => void): () => void {
  const api = getDesktopApi();
  if (!api) return () => {};
  void api
    .isMaximized()
    .then((val) => {
      if (maximizedStoreValue !== val) {
        maximizedStoreValue = val;
        onStoreChange();
      }
    })
    .catch(() => {});
  return api.onMaximizedChange((val) => {
    if (maximizedStoreValue !== val) {
      maximizedStoreValue = val;
      onStoreChange();
    }
  });
}

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function TopNavigation() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDesktop = useSyncExternalStore(
    () => () => {},
    () => Boolean(getDesktopApi()?.isDesktop),
    () => false,
  );

  const isMaximized = useSyncExternalStore(
    subscribeMaximized,
    () => maximizedStoreValue,
    () => false,
  );

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const reveal = useCallback(() => {
    clearHideTimer();
    setVisible(true);
  }, [clearHideTimer]);

  const scheduleHide = useCallback(() => {
    if (hoveredRef.current || focusedRef.current) return;
    if (hideTimerRef.current !== null) return;
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      if (!hoveredRef.current && !focusedRef.current) {
        setVisible(false);
      }
    }, HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (e.clientY <= REVEAL_ZONE_Y) {
        reveal();
      } else if (e.clientY > LEAVE_ZONE_Y && !hoveredRef.current) {
        scheduleHide();
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      clearHideTimer();
    };
  }, [reveal, scheduleHide, clearHideTimer]);

  return (
    <>
      {/* 隐形边缘感应带：即使窗口刚获焦或指针直接贴边滑入，也能第一时间唤醒顶栏 */}
      {!visible && (
        <div
          aria-hidden
          onPointerEnter={reveal}
          className="fixed inset-x-0 top-0 z-50 h-2.5"
        />
      )}

      <header
        onPointerEnter={() => {
          hoveredRef.current = true;
          reveal();
        }}
        onPointerLeave={() => {
          hoveredRef.current = false;
          scheduleHide();
        }}
        onFocusCapture={() => {
          focusedRef.current = true;
          reveal();
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            focusedRef.current = false;
            scheduleHide();
          }
        }}
        className="fixed inset-x-0 top-0 z-50 flex h-11 items-center justify-between border-b border-border-faint px-6 select-none"
        style={{
          backgroundColor:
            "color-mix(in oklab, var(--background) 68%, transparent)",
          backdropFilter: "blur(20px) saturate(120%)",
          WebkitBackdropFilter: "blur(20px) saturate(120%)",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(-8px)",
          pointerEvents: visible ? "auto" : "none",
          transition:
            "opacity var(--duration-ui) var(--ease-enter), transform var(--duration-ui) var(--ease-enter)",
        }}
      >
        {/*
          桌面端无边框窗口拖拽层：
          非最大化状态下预留最顶部 3px 给系统上边缘拉伸缩放手柄，其余区域支持按住拖动窗口与双击最大化。
        */}
        {isDesktop && (
          <div
            aria-hidden
            className={`sn-app-drag absolute inset-x-0 bottom-0 ${
              isMaximized ? "top-0" : "top-[3px]"
            }`}
          />
        )}

        {/* 左侧：品牌标识（点击回首屏画廊） */}
        <div className="sn-app-no-drag relative z-10 flex items-center">
          <Link
            href="/"
            className="text-micro block text-text-primary opacity-65 transition-opacity duration-[350ms] hover:opacity-100 focus-visible:opacity-100"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            Shadow Narrative
          </Link>
        </div>

        {/* 右侧：空间导航 + 桌面端窗口控制三键 */}
        <div className="sn-app-no-drag relative z-10 flex items-center gap-6">
          <nav className="flex items-center gap-6">
            {NAV_ITEMS.map((item) => {
              const active = isCurrent(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`text-micro text-text-primary transition-opacity duration-[350ms] hover:opacity-95 focus-visible:opacity-95 ${
                    active ? "opacity-95" : "opacity-45"
                  }`}
                  style={{ transitionTimingFunction: "var(--ease-enter)" }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {isDesktop && (
            <>
              <span
                aria-hidden
                className="h-3.5 w-px shrink-0"
                style={{ background: "var(--border-subtle)" }}
              />

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void getDesktopApi()?.minimize()}
                  aria-label="最小化"
                  className="text-text-primary flex h-7 w-8 items-center justify-center rounded-md opacity-45 transition-all duration-[200ms] hover:bg-white/[0.06] hover:opacity-95 focus-visible:opacity-95"
                  style={{ transitionTimingFunction: "var(--ease-enter)" }}
                >
                  <Minus size={14} strokeWidth={1.5} aria-hidden />
                </button>

                <button
                  type="button"
                  onClick={() => void getDesktopApi()?.toggleMaximize()}
                  aria-label={isMaximized ? "向下还原" : "最大化"}
                  className="text-text-primary flex h-7 w-8 items-center justify-center rounded-md opacity-45 transition-all duration-[200ms] hover:bg-white/[0.06] hover:opacity-95 focus-visible:opacity-95"
                  style={{ transitionTimingFunction: "var(--ease-enter)" }}
                >
                  {isMaximized ? (
                    <RestoreIcon />
                  ) : (
                    <Square size={11} strokeWidth={1.5} aria-hidden />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void getDesktopApi()?.close()}
                  aria-label="关闭窗口"
                  className="text-text-primary flex h-7 w-8 items-center justify-center rounded-md opacity-45 transition-all duration-[200ms] hover:bg-white/[0.1] hover:opacity-100 focus-visible:opacity-100"
                  style={{ transitionTimingFunction: "var(--ease-enter)" }}
                >
                  <X size={14} strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            </>
          )}
        </div>
      </header>
    </>
  );
}

/** 窗口已最大化时的双叠框还原图标（12×12，1.5px 线宽，与 lucide 图标语言统一） */
function RestoreIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 2.25H9.75V8" />
      <rect x="2.25" y="4" width="5.75" height="5.75" rx="0.75" />
    </svg>
  );
}
