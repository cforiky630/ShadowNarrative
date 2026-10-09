# Shadow Narrative — Design System

## 1. Visual Direction

核心词：

`Dark / Minimal / Cinematic / Immersive / Quiet / Particle / Memory`

核心原则：

> **UI 是空气，照片和粒子才是主体。**

## 2. Color Tokens

### Background

```css
--background: #050505;
--surface: #080808;
--surface-elevated: #0B0B0B;
```

### Text

```css
--text-primary: #F5F5F5;
--text-secondary: #8A8A8A;
--text-tertiary: #555555;
```

### Border

```css
--border-subtle: rgba(255,255,255,0.08);
--border-faint: rgba(255,255,255,0.05);
```

### Glass

```css
--glass: rgba(255,255,255,0.04);
--glass-strong: rgba(255,255,255,0.07);
```

## 3. Particle Color

粒子颜色优先来自照片本身。

默认不要给整个粒子系统添加统一的蓝/紫/粉色滤镜。

允许非常轻微的亮度、饱和度和对比度校正，但必须保持照片自身色彩。

## 4. Typography

建议字体栈：

```css
font-family:
  Inter,
  "MiSans",
  "HarmonyOS Sans SC",
  "Source Han Sans SC",
  system-ui,
  sans-serif;
```

### 建议类型层级

```text
Display      48–72px / 0.95–1.05
Title        28–44px / 1.1
Body         16–20px / 1.6–1.8
Meta         11–14px / 1.4
Micro        10–12px / 1.3
```

不是所有页面都必须使用这些上限。

### 日期

优先：

```text
2025 · 09 · 28
```

或：

```text
2025 / 09 / 28
```

## 5. Spacing Scale

使用 4px 基础网格：

```text
4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64 / 80 / 96 / 128
```

沉浸页面优先使用 48px 以上的留白。

## 6. Radius

整体不要大量圆角卡片。

```text
Small: 8px
Medium: 12px
Large: 20px
Pill: 999px
```

主要空间元素可以没有边框和圆角。

## 7. Glow

Glow 只用来表达：

- 当前焦点
- 粒子节点
- Hover
- Loading
- 特殊状态

不要让整屏发光。

## 8. Blur

Blur 是氛围工具，不是装饰品。

推荐：

```text
8px–24px
```

控制面板可以更高，但必须避免文字变糊。

## 9. Motion Tokens

### Micro

```text
150–250ms
```

### UI

```text
250–450ms
```

### Scene

```text
600–1000ms
```

### Particle Morph

```text
800–1800ms
```

### Story

```text
1000ms+
```

这些是视觉建议，不是硬编码。

## 10. Motion Character

动画需要：

- 慢
- 柔和
- 有惯性
- 有阻尼
- 有延迟
- 有层级

避免：

- 线性移动
- 快速闪现
- 大幅 bounce
- 夸张弹跳
- 游戏 UI 感

## 11. Layering / Z-index

建议：

```text
Base background: 0
Particle canvas: 1
Scene content: 10
Soft UI: 20
Panels: 30
Dialogs: 40
Critical overlay: 50
```

## 12. Navigation

顶部导航必须低存在感。

桌面：

```text
MEMORY                         Memories Journal Create
```

默认低透明度，Hover/Focus 时增强。

## 13. Controls

主要操作尽量使用：

- Icon button
- Text link
- Subtle pill
- Small floating control

避免大按钮。

## 14. Glass UI

允许出现：

- Particle Controls
- Conversation panel
- Command surface
- Secondary drawers

但不得把全站做成玻璃盒子。

## 15. Empty / Loading

Empty：黑色空间 + 少量粒子 + 极简提示。

Loading：粒子缓慢聚拢，不使用大号 spinner。

## 16. Responsive Tokens

Desktop 主设计：1440×900。

建议断点：

```text
Mobile < 768
Tablet 768–1199
Desktop >= 1200
```

Mobile 必须重新设计交互，而不是纯缩放。
