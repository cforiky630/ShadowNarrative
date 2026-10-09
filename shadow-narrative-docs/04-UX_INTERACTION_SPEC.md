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
ORBIT
MORPHING
STORY
JOURNAL
CONVERSATION
```

### ORBIT

用户拖拽把照片当成有体积的物体转起来（`06-PARTICLE_ENGINE.md` §15）。

- 只由用户主动发起，默认永远是正视角
- 有惯性、有阻尼
- 必须能一键复位回正视角
- 与 EXPLORE / INTERACT 正交：旋转过程中指针场依然生效

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

### 默认参数（定稿值）

```text
mouseRadius   = 0.22     归一化坐标，约屏幕短边 22%
mouseForce    = 0.35
falloff       = 1 - smoothstep(0, radius, r)
turbulence    = 0.12     常驻弱湍流，非指针触发
damping       = 高
```

指针场在顶点着色器内实现，**无状态**。指针连续移动时粒子平滑进退，满足「不跳变」。

允许用户通过粒子控制面板调整 `mouseRadius` 与 `mouseForce`，范围：

```text
mouseRadius   0.05 – 0.50
mouseForce    0.00 – 1.00
```

实现细节见 `06-PARTICLE_ENGINE.md` §8。

## 6. Click Rules

点击照片：进入 Focus。

再次点击/明确动作：进入 Memory Theater。

点击背景：不应意外退出；只有明确的关闭区域或 ESC 才退出沉浸层。

## 7. ESC Rules

ESC 顺序：

1. 关闭浮层（控制面板 / Library 抽屉）
2. 退出 Conversation
3. 退出 Journal
4. 退出 Story
5. 返回 Album

**不适用**：原图 ⇄ 粒子的模式切换不进 ESC 栈 —— 它是同一页面内的显示状态，
不是一层可以被"退出"的东西。要回原图请点模式标签。

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
- pinch（斜轴相册里用于沿轴缩放前进）

移动端不能简单复制 mousemove。

## 10. Navigation

主导航保持低存在感。

页面/状态切换优先通过视觉空间转场完成。

## 11. Transition Rules

时长使用 `02-DESIGN_SYSTEM.md` §9 的 motion token，缓动用 `--ease-morph`。

| 转场 | 机制 | 时长 | token |
|---|---|---|---|
| Photo → Photo | Particle Morph（原地滑动，见 `06-PARTICLE_ENGINE.md` §12） | 1200ms | `--duration-morph` |
| Field → Theater | Node Focus → particle converge → Theater | 800ms | `--duration-scene` |
| Theater → Journal | 背景粒子减弱，文字层级增强 | 800ms | `--duration-scene` |
| Journal → Conversation | 文字空间保持，加入当前 Memory 的视觉源 | 350ms | `--duration-ui` |
| Conversation → Theater | AI 对话退到背景，照片重新成为主体 | 350ms | `--duration-ui` |

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

### 降级档位下的转场

Low / Minimal 档或 `prefers-reduced-motion` 时，`Photo → Photo` 缩短到 **600ms**，
且滑动中段的拂动幅度减半，但**必须保留粒子位置插值**，不得退化成 fade。
详见 `06-PARTICLE_ENGINE.md` §12 与 `15-DEVICE_ADAPTATION.md` §5。

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
