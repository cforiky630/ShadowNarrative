"use client";

import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { SettingsForm } from "@/components/SettingsForm";
import type { SettingsView } from "@/types";

/**
 * 设置：左下角一颗悬浮的球，点开从球那儿长出一张浮卡（`07 §11`）。
 *
 * 用户 2026-10-10：「设置做成组件，不用单页，用一个齿轮图标来做」
 * →「做成悬浮的，类似 nextjs 左下角那个开发球的类型就很不错：
 * 点击就展开设置模块，直接悬浮在界面」。
 *
 * ── 形态 ────────────────────────────────────────────────────────────
 *
 * 照 Next.js 那个开发指示器：**常驻一颗小球**，点开时界面**不换页**、
 * 不出遮罩、内容不动，卡片就在球的正上方长出来（`transform-origin`
 * 定在左下角，所以它是「从球那儿展开」而不是「淡入」）。
 *
 * 与之前那版侧的抽屉不同：抽屉是占满整条右边、把界面压扁；
 * 浮卡只占一角，底下的照片还在。这是用户要的那一种。
 *
 * 图标用 lucide 的 `Settings`（就是齿轮）。项目因为收藏那颗星已经装了
 * `lucide-react`，不必再去外面找素材 —— 同一个库里的图标风格才是统一的。
 *
 * ── 位置为什么是左下角 ──────────────────────────────────────────────
 *
 * 照片页左下角已经有一组文字（复位视角 / 删除），所以球放在**最角上**
 * （`left-6 bottom-6`，球占 24–68px），那一组挪到 `left-20` 给它让位。
 * 相册的操作行在内容流里、居中，不占角落。
 */

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SettingsView | null>(null);
  const [failed, setFailed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // 打开时才取。`view` 拿到之后就不再重复取 —— 改完的值由表单自己维护
  useEffect(() => {
    if (!open || view) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { data: SettingsView };
        if (!cancelled) setView(body.data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, view]);

  // Esc 关闭（`04 §7` 的退出顺序第一层，和其余浮层同一个约定）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-40">
      {/*
        点空白处收起。挂在这一层而不是整屏，是为了不挡住球本身 ——
        球在 z 上压着它，重复点球就是开/关的切换。
      */}
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="pointer-events-auto fixed inset-0 -z-10"
        />
      )}

      {/*
        浮卡。**始终挂载**，靠 opacity + scale 开合 —— 卸载就没法播收起那一段了。
        收起时 `inert` + `pointer-events: none`，键盘和指针都够不着它。

        `transform-origin` 定在左下角，所以它是从球那儿**长出来**的。
      */}
      <div
        ref={cardRef}
        role="dialog"
        aria-label="设置"
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
        className="border-border-faint bg-glass-strong pointer-events-auto absolute bottom-14 left-0 flex max-h-[min(70dvh,620px)] w-[min(380px,calc(100vw-3rem))] origin-bottom-left flex-col overflow-hidden rounded-2xl border shadow-2xl outline-none backdrop-blur-2xl"
        style={{
          backgroundColor: "var(--glass-strong)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          opacity: open ? 1 : 0,
          transform: open ? "scale(1)" : "scale(0.92) translateY(6px)",
          pointerEvents: open ? "auto" : "none",
          // 收起时慢一点、且先等指针事件失效，免得卡片还没缩完就点不到了
          transition:
            "opacity var(--duration-ui) var(--ease-enter), transform var(--duration-ui) var(--ease-enter)",
        }}
      >
        <header className="flex shrink-0 items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-micro tracking-[0.08em] text-text-primary/70">
            设置
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="收起"
            className="text-meta text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-85"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            ×
          </button>
        </header>

        {/* min-h-0 是给这一层能真正滚动用的 —— flex 子项默认不收缩 */}
        <div className="sn-noscrollbar min-h-0 flex-1 overflow-y-auto">
          {failed && (
            <p className="text-meta px-6 pb-6 text-text-primary/60">
              读不到设置。关掉再开一次试试。
            </p>
          )}
          {!failed && !view && (
            <p className="text-meta px-6 pb-6 text-text-primary/35">读取中…</p>
          )}
          {view && <SettingsForm initial={view} />}
        </div>
      </div>

      {/*
        球。低存在感 —— 它常驻在画面上，抢眼就违背「UI 是空气」（`02 §1`）。
        hover / 展开时提亮，靠透明度而不是换色。
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "收起设置" : "打开设置"}
        aria-expanded={open}
        className="border-border-faint bg-glass-strong pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-xl transition-opacity duration-[350ms]"
        style={{
          backgroundColor: "var(--glass-strong)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          opacity: open ? 1 : 0.55,
          transitionTimingFunction: "var(--ease-enter)",
        }}
      >
        <Settings size={16} strokeWidth={1.6} aria-hidden />
      </button>
    </div>
  );
}
