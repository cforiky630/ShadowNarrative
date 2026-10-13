"use client";

import { useEffect, useState } from "react";
import { DockCard } from "@/components/DockCard";
import { SettingsForm } from "@/components/SettingsForm";
import { useExperience } from "@/store/experience";
import type { SettingsView } from "@/types";

/**
 * 设置浮卡（`07-UI_PAGE_SPECS.md` §11）。
 *
 * 用户 2026-10-10：「设置做成组件，不用单页」→ 之后又把它和粒子参数
 * 一起收进了左下角那颗胶囊（`BottomDock`）。**入口现在是胶囊上的齿轮那一格**，
 * 这个组件只剩卡片本身。
 *
 * 卡片的外壳（开合、遮罩、Esc、焦点、滚动）在 `DockCard` —— 与粒子参数
 * 共用一套。这里只负责「取一次设置、填进表单」。
 *
 * ⚠️ **设置不进 `01 §5` 那 7 个体验状态**（§11.1）：它是体验之外的配置层，
 * 「不能让人感觉是切换页面」那条约束不适用于它 —— 但它也不是页面，
 * 是一张从球那儿长出来的浮卡。
 */

export function SettingsPanel() {
  const open = useExperience((s) => s.ui.settingsOpen);
  const setOpen = useExperience((s) => s.setSettingsOpen);
  const [view, setView] = useState<SettingsView | null>(null);
  const [failed, setFailed] = useState(false);

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

  return (
    <DockCard label="设置" open={open} onClose={() => setOpen(false)}>
      {failed && (
        <p className="text-meta px-6 pb-6 text-text-primary/60">
          读不到设置。关掉再开一次试试。
        </p>
      )}
      {!failed && !view && (
        <p className="text-meta px-6 pb-6 text-text-primary/35">读取中…</p>
      )}
      {view && <SettingsForm initial={view} />}
    </DockCard>
  );
}
