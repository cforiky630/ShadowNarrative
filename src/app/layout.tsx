import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BottomDock } from "@/components/BottomDock";
import { MotionProvider } from "@/components/MotionProvider";
import { OverlayScrollbar } from "@/components/OverlayScrollbar";
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
        {/* Motion 的按需特性包（`LazyMotion + domAnimation`）。所有 `m.*` 都要在它里面 */}
        <MotionProvider>
          <TopNavigation />
          {children}
          {/* 时间线 / 影册右侧那根细滚动条。原生条已在 globals.css 里藏掉 */}
          <OverlayScrollbar />
          {/*
            控制坞与全局浮层：
            设置与粒子参数控制面板作为全局浮层挂载于根布局，由左下角胶囊控制坞（BottomDock）统一触发。
          */}
          <BottomDock />
          <SettingsPanel />
          <ParticleControls />
        </MotionProvider>
      </body>
    </html>
  );
}
