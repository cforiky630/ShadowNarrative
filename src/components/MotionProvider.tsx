"use client";

import { LazyMotion, domAnimation } from "motion/react";
import type { ReactNode } from "react";

/**
 * Motion 的按需特性包。
 *
 * 项目里用到 Motion 的只有三处（BottomDock、ConversationPanel、NotePanel），
 * 而且只用了 `opacity / y / spring` —— 没有 layout、drag、AnimatePresence。
 * 完整 `motion` 组件会把整套特性打进首屏；`LazyMotion + domAnimation` 只带
 * 这一档，配合 `m.*` 组件，API 与效果完全等价。
 *
 * ⚠️ `strict` 是有意的：以后谁再把 `motion.div` 写回来，开发期会直接报错，
 * 而不是悄悄把整套特性重新拉进 bundle。新增 Motion 用法时：
 *   1. 用 `m.*`，不要用 `motion.*`
 *   2. 需要 layout / drag 时，先换 `domMax` 并在这里写清理由
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
