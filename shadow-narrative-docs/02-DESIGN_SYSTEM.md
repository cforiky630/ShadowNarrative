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

### 类型层级（定稿值）

区间已收敛为单一取值。这些值同时定义在 `src/styles/tokens.css`，两处必须一致。

```text
Display   64px / 1.00 / -0.02em / 300
Title     36px / 1.10 / -0.01em / 400
Body      18px / 1.70 /  0      / 400
Meta      13px / 1.40 / +0.02em / 400
Micro     11px / 1.30 / +0.08em / 400
```

格式：`字号 / 行高 / 字距 / 字重`

- Display 用 300 字重，是「克制」气质的主要来源
- Micro 的字距 +0.08em 用于大写导航项（如 `MEMORIES` `JOURNAL`）
- 不是所有页面都必须用到 Display 上限

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
200ms
```

### UI

```text
350ms
```

### Scene

```text
800ms
```

### Particle Morph

```text
1200ms
```

### Story

```text
1000ms
```

这些值同时定义在 `src/styles/tokens.css`（`--duration-*`），两处必须一致。

## 10. Motion Easing & Character

动效必须「慢、柔和、有惯性、有阻尼」——这要求缓动曲线本身是平滑收敛的，
而不是线性或带回弹的。

```text
--ease-enter   cubic-bezier(0.16, 1, 0.30, 1)    柔和落定，无回弹
--ease-exit    cubic-bezier(0.40, 0, 0.20, 1)    安静退场
--ease-morph   cubic-bezier(0.65, 0, 0.35, 1)    对称，克制
```

- 元素**进入**用 `--ease-enter`
- 元素**离开**用 `--ease-exit`
- 粒子转场、场景切换用 `--ease-morph`
- 不使用 `linear`，不使用任何 `elastic` / `back` 类回弹曲线

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
Shadow Narrative                              Timeline
```

左边是**项目名**，点它回第一屏（相册）。右边是**空间**的名字，目前只有
`Timeline` 一个。

⚠️ **空间名一律用英文**（用户 2026-10-10：「时间线改成英文」）。这一列本来
就是空间名，而空间名一直是英文（更早的 `MEMORY` / `Memories`），
`Into this moment`、`Back`、四个粒子预设也都是英文 —— 只夹着一个中文项，
反倒是它不协调。

⚠️ 历史：`/journal` 与 `/create` 在 2026-10-09 删掉（**路由不存在**，点进去
是 404），`Memories` 在 2026-10-10 删掉（它指向 `/`，和左上角的项目名是同
一条去路）。守的是同一条：**入口宁可少，也不要留点不动的。**

⚠️ **参数与设置不在这里**（2026-10-10 搬走）。它们是工具不是空间 ——
在左下角那颗胶囊上（`07 §11.2` 的入口、`07 §3` 的粒子参数）。

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
