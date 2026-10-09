# Shadow Narrative — UI & Page Specifications

## 1. Memory Space

### 目标

让用户第一次进入就看到“记忆由粒子组成”的核心体验。

### Desktop Composition

```text
┌───────────────────────────────────────────────┐
│ MEMORY                         Memories Journal│
│                                      Create   │
│                                               │
│                                               │
│               PARTICLE PHOTO                  │
│                                               │
│                                               │
│                    毛毛                       │
│                2025 · 09 · 28                 │
│                                               │
│                 View Memory →                 │
└───────────────────────────────────────────────┘
```

### 必须

- 大面积黑场
- 粒子照片居中
- 导航低存在感
- 当前 Memory 信息简洁
- 不能出现传统 hero 卡片

### 尺寸与透明度（定稿值）

基准视口 1440×900（`02-DESIGN_SYSTEM.md` §16）。字号 token 见该文档 §4。

```text
MEMORY 标识       顶部 32px  ·  左边距 48px  ·  text-micro  ·  opacity 0.55
顶部导航项        顶部 32px  ·  右边距 48px  ·  text-micro  ·  opacity 0.40
                                                             hover/focus → 0.85
粒子照片主视觉     画面高度 55–65%  ·  水平居中  ·  垂直偏上 4%
日期              照片下 24px  ·  text-meta  ·  opacity 0.55
标题              日期下 8px   ·  text-title ·  opacity 0.95
View Memory →     标题下 24px  ·  text-meta  ·  opacity 0.45 → hover 0.90
```

### 「低存在感」的量化定义

- 非交互态 opacity **≤ 0.55**
- 交互态（hover / focus）opacity **≤ 0.90**
- 任何**常驻** UI 元素的 opacity 不得超过 **0.60**，否则会与粒子抢视觉焦点
- 不出现卡片边框、投影、背景色块

这条量化定义同时适用于 `02-DESIGN_SYSTEM.md` §12 的导航与 §13 的 Controls。

## 2. Photo Particle State

默认：

照片由粒子构成。

Hover：

粒子稍微退开。

Pointer：

局部扰动。

Focus：

主体粒子更稳定，周围粒子退让。

## 3. Particle Controls

默认隐藏。

通过一个小型 icon 入口打开右侧 panel。

宽度建议：

320–360px。

内容：

- Density
- Size
- Motion
- Turbulence
- Mouse Force
- Mouse Radius
- Noise Speed
- Color Variation
- Preset
- Reset

## 4. Memory Field

不是图片网格。

视觉：

黑场 + 少量记忆节点。

节点位置可以基于：

- 时间
- 主题
- 关联
- 手工位置

但不要做成复杂可视化图表。

### Hover

节点亮起。

显示：

```text
Title
Date
small preview
```

### Click

Node Focus → Memory Theater。

## 5. Memory Theater

### Header

低存在感日期。

### Center

大面积粒子照片/照片。

### Bottom

标题 + 1～3 行摘要。

### Primary action

`View Story →`

## 6. Story

Story 使用 Scene。

每个 Scene：

- visual
- text
- particle state
- optional media

滚动驱动 scene progress。

## 7. Journal

阅读宽度：400–600px。

布局：

```text
2025 / 09 / 28

毛毛

那天晚上很安静。
毛毛趴在窗边……
```

正文大留白。

背景粒子极弱。

## 8. Memory Conversation

UI：

照片/粒子为背景。

对话文字以漂浮/简洁 panel 表达。

避免传统大量 chat bubbles。

至少允许：

- 提问
- 追问
- “整理成日记”
- “补充这段记忆”
- “查看 AI 推测来源”
- 倾听与陪伴式回应
- “先不聊”的退出方式

语气与边界遵守 `09-AI_SPEC.md`：温柔、克制、简短，不使用 emoji 与感叹号，不制造依赖。

陪伴不能让对话面板抢走画面。照片与粒子始终是背景主体。

## 9. Create

Create 不应该成为普通表单页。

建议：

进入黑色空间 → 拖入图片/点击选择 → 图片出现 → 粒子化 → 询问信息。

信息输入应逐步出现，而不是表单一次全部铺开。

## 10. Photo Upload

支持：

- drag/drop
- file picker
- mobile camera/album

上传过程中显示粒子加载状态。

## 11. Mobile

底部：

```text
Memory | Journal | Create
```

主视觉区域保留足够高度。

Controls 改成底部 sheet。

## 12. States

每页至少考虑：

- default
- loading
- empty
- hover/focus
- error
- reduced-motion
