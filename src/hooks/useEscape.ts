"use client";

import { useEffect, useRef } from "react";
import { isImeKey } from "@/lib/keyboard";

/**
 * window 级的 Esc 关闭。
 *
 * 这个产品里 Esc 有六处在 window 上监听（DockCard、照片页的删除待确认、
 * 整理面板、日期面板、对话浮层、时间线的网格画廊）。每一处都要先问
 * `isImeKey` —— 中文输入法组字时的 Esc 是「取消候选」，不是「关掉这一层」
 * （`lib/keyboard.ts` 有完整说明）。
 *
 * 抽成一个 hook 的理由不是省几行，而是**让「先问输入法」成为默认**：
 * 以后新加一层浮层时，漏掉那一句的概率小得多。
 *
 * ⚠️ 只管 window 级监听。输入框自己的 `onKeyDown`（时间线起名、影册改名、
 * 新建影册）不走这里 —— 它们的 Esc 有各自的语义（退回编辑前的值、取消新建）。
 *
 * @param enabled 为 false 时不注册（例如面板没开）
 * @param onEscape 关闭动作。用 ref 持有，换回调不会重新注册监听
 */
export function useEscape(enabled: boolean, onEscape: () => void): void {
  const latest = useRef(onEscape);
  useEffect(() => {
    latest.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isImeKey(e)) latest.current();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
