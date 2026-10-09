# Shadow Narrative — UX & Interaction Specification

## 1. Interaction Philosophy

用户不应该学习“如何操作网站”。

用户应该通过接近、点击、滚动、拖动，自然探索记忆。

## 2. Global Interaction Modes

```text
REST
EXPLORE
FOCUS
INTERACT
SCATTER
MORPHING
ASSEMBLE
STORY
JOURNAL
CONVERSATION
```

## 3. Pointer Rules

### Rest

粒子轻微呼吸。

### Hover / Explore

粒子感受到 pointer field。

### Focus

周围粒子略微退开，为标题和内容让出空间。

### Interact

鼠标/触摸产生局部扰动。

### Exit

粒子恢复，不跳变。

## 4. Scroll Rules

滚动不只是页面推进，而是 Story progress。

滚动影响：

- camera
- particle target
- text opacity
- text position
- image scale
- blur
- scene progress

## 5. Pointer Field

支持：

- attract
- repel
- ripple
- turbulence

默认行为：柔和 repel + mild turbulence。

## 6. Click Rules

点击照片：进入 Focus。

再次点击/明确动作：进入 Memory Theater。

点击背景：不应意外退出；只有明确的关闭区域或 ESC 才退出沉浸层。

## 7. ESC Rules

ESC 顺序：

1. 关闭浮层
2. 退出 Conversation
3. 退出 Journal
4. 退出 Story
5. 返回 Memory Field

## 8. Keyboard

```text
Esc       退出当前状态
ArrowLeft 上一张/上一 Scene
ArrowRight 下一张/下一 Scene
Space     允许暂停/继续可暂停动画
```

## 9. Touch

支持：

- tap
- drag
- swipe
- pinch（适合 Memory Field 时）

移动端不能简单复制 mousemove。

## 10. Navigation

主导航保持低存在感。

页面/状态切换优先通过视觉空间转场完成。

## 11. Transition Rules

### Photo → Photo

Particle Morph。

### Field → Theater

Node Focus → particle converge → Theater。

### Theater → Journal

背景粒子减弱，文字层级增强。

### Journal → Conversation

文字空间保持，加入当前 Memory 的视觉源。

### Conversation → Theater

AI 对话退到背景，照片重新成为主体。

## 12. Loading Interaction

不是转圈等待。

应显示非常少量粒子从中心聚拢，再形成图片或节点。

## 13. Hover Text

Hover 信息不要一直存在。

只有焦点附近的 Node 才显示：

- title
- date
- optional preview

## 14. Accessibility

必须支持：

- keyboard focus
- reduced motion
- readable contrast
- aria labels
- focus trap in dialog

Reduced motion 开启后：

粒子仍可保留极轻漂浮，但关闭大幅 morph 与镜头移动。

## 15. Reduced Motion

`prefers-reduced-motion: reduce` 时：

- 降低 noise
- 降低 camera movement
- 缩短/跳过复杂 morph
- 保留清晰的信息状态
