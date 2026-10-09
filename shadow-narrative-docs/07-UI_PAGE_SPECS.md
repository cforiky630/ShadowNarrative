# Shadow Narrative — UI & Page Specifications

## 1. 本文档的边界

| 内容 | 在哪 |
|---|---|
| **Album / Library / Photo View / 原图⇄粒子 / 镜头编排** | `16-ALBUM_SPACE.md` |
| 粒度更细的页面状态：粒子态、控制面板、对话、日志、Theater、移动端 | **本文档** |

原版本里定义的「Memory Space」与「Memory Field」两个页面**已废弃**：
前者被 Album 取代，后者与斜轴相册 + Library 功能重复（见 `01-PRODUCT_SPEC.md` §5）。

## 2. Photo Particle State

照片粒子化后的状态。

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

## 4. Conversation

展开后在照片下方出现，**不跳转到另一个页面**（`16-ALBUM_SPACE.md` §9）。

### 第一行是字幕

AI 看到照片后说的第一句话（`09-AI_SPEC.md` §21），视觉上仍然是字幕的样式。

### 之后的对话

- 不用气泡框（`02-DESIGN_SYSTEM.md` §14）
- 极简文本流，低存在感
- 输入框在底部

### 至少允许

- 提问
- 追问
- "整理成日志"
- "补充这段记忆"
- "查看 AI 推测来源"
- 倾听与陪伴式回应
- "先不聊"的退出方式

语气与边界遵守 `09-AI_SPEC.md`：温柔、克制、简短，不使用 emoji 与感叹号，不制造依赖。

**对话不改变显示模式。** 从对话进出的过程中，照片该是原图还是粒子保持不变
（`16-ALBUM_SPACE.md` §8.3）—— 读字的场景不该被切换动画打断。

## 5. Journal

正文阅读宽度：400–600px。

布局：

```text
2025 / 09 / 28

那天晚上很安静。
……

```

正文大留白。

背景粒子极弱。

### 生成

**只由用户主动触发**（`01-PRODUCT_SPEC.md` §9）。AI 不自动写日志。

## 6. Memory Theater

一条分组的完整故事。

### Header

低存在感日期。

### Center

大面积粒子照片/照片。

### Bottom

标题 + 1～3 行摘要。

### Primary action

`View Story →`

## 7. Story

Story 使用 Scene。

每个 Scene：

- visual
- text
- particle state
- optional media

滚动驱动 scene progress。

## 8. 上传

上传发生在 Album（`16-ALBUM_SPACE.md` §5）。本节只规定上传本身的界面。

### 不应该成为普通表单页

拖入图片 / 点击选择 → 图片出现 → 粒子化 → 完。

**不要求用户填任何东西。** 时间从 EXIF 读，读不到就用当前时间；
文字说明以后想写再写。

### 上传后立刻发生

```text
照片以原图出现
    ↓（不等待网络）
后台落库
    ↓
后台发给 AI
    ↓
字幕浮现
```

见 `08-DATA_API_SPEC.md` §6 与 §10。

### 状态

上传过程中显示粒子加载状态，不用大号 spinner（`02-DESIGN_SYSTEM.md` §15）。

## 9. Mobile

底部：

```text
Album | Library | 上传
```

主视觉区域保留足够高度。

Controls 改成底部 sheet。

### 斜轴相册在移动端

- 单指沿轴滑动
- 双指捏合缩放
- 点击进入

**拖入文件在移动端不可用**，必须有点击选择的入口。

## 10. States

每个状态至少考虑：

- default
- loading
- empty
- hover/focus
- error
- reduced-motion
