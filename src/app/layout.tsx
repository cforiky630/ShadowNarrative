import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
      </body>
    </html>
  );
}
