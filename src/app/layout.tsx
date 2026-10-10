import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BottomDock } from "@/components/BottomDock";
import { ParticleControls } from "@/components/ParticleControls";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TopNavigation } from "@/components/TopNavigation";
import "./globals.css";

/**
 * Inter 走 next/font 自托管，不产生外部请求（13-fonts.md）。
 * 中文回退字体由系统提供，见 02-DESIGN_SYSTEM.md §4 的字体栈。
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shadow Narrative",
  description: "把照片、粒子、时间与故事融合在一个黑色沉浸式空间里的个人记忆产品。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={inter.variable}>
      <body className="bg-background text-text-primary antialiased">
        <TopNavigation />
        {children}
        {/*
          ── 左下角那一组（用户 2026-10-10）─────────────────────────────
          设置与粒子参数都挂在根布局上，因为它们是**浮层**而不是路由
          （用户原话：「设置做成组件，不用单页」）。放在这里它们在所有页面上
          都在，入口只有左下角那一处 —— 不混进照片旁边（`07 §11.1`）。

          入口是**一颗胶囊**（`BottomDock`）：有粒子时撑成两格、没有时缩回
          一格。两张卡各自独立（`DockCard` 只是共用的外壳）—— 用户明确说过
          组合的是「按钮，不是卡片、内容、功能组合」。
        */}
        <BottomDock />
        <SettingsPanel />
        <ParticleControls />
      </body>
    </html>
  );
}
