# Shadow Narrative — Particle Engine Specification

## 1. Core Role

Particle Engine 是 Shadow Narrative 的核心视觉资产。

必须支持：

1. Image → Particle
2. Particle interaction
3. Particle recovery
4. Particle → Particle morph
5. Particle → image assembly
6. Scene transition
7. Performance degradation

## 2. Recommended Rendering Model

推荐：

- Three.js
- BufferGeometry / Points
- custom attributes
- ShaderMaterial 或 RawShaderMaterial
- Instancing（场景适合时）

## 3. Particle Buffer

基础 attribute：

```text
position: vec3
color: vec3
size: float
random: float
```

可选：

```text
velocity: vec3
opacity: float
noiseSeed: float
targetOffset: vec3
```

## 4. Coordinate Mapping

图片以 normalized coordinate 映射到 3D 平面。

建议：

- 保持图片宽高比
- 以视觉中心对齐
- 在 z 轴加入非常轻微层次

不做强透视畸变。

## 5. Sampling

图片采样不等于每个像素一个粒子。

根据：

- 设备性能
- 图片宽高
- 目标视觉密度

动态采样。

建议：

```text
High   100k–150k
Medium 50k–100k
Low    10k–50k
```

最终以实际性能测试为准。

## 6. Luminance-aware Density

可根据 luminance 调整粒子存在概率：

```text
brightness ↑ → density slightly ↑
dark region  → density slightly ↓
```

但不能破坏人物/主体轮廓。

## 7. Particle Life

每个粒子应该有细微：

- noise
- drift
- phase
- velocity damping

表现为“呼吸”。

## 8. Mouse Field

推荐逻辑：

```text
r = distance(particle.xy, pointer.xy)
falloff = 1 - smoothstep(0, radius, r)
force = direction * strength * falloff
```

推荐默认：

- radius：中等
- strength：弱
- damping：高

## 9. Touch Field

触摸以：

- 当前指针位置
- 速度
- touch phase

驱动 interaction。

快速滑动可以产生更明显但仍可控的扰动。

## 10. Recovery

恢复目标：

```text
position → targetPosition
velocity → 0
```

使用：

- spring
- damping
- exponential smoothing

不得 snap。

## 11. Particle Morph

每一个 particle 具有：

```text
sourcePosition
sourceColor
sourceSize

targetPosition
targetColor
targetSize
```

Morph progress：

```text
0 → 1
```

位置可：

```text
mix(source, target, easing)
```

中间阶段加入少量：

- scatter
- noise
- z excursion

但不能变成爆炸。

## 12. Morph Phases

```text
PREPARE
SCATTER
FREE
REMAPPING
ASSEMBLE
SETTLE
```

## 13. Morph Matching

如果两张图片粒子数量不同：

- 采用固定粒子 buffer
- 对目标采样进行 resample
- 多余 source 粒子向邻近 target / ambient field 汇聚
- 缺失 target 通过 source 邻域插值

不能在转场中大量创建/销毁 GPU buffer。

## 14. Camera

默认保持非常平的摄影语言。

可有：

- tiny parallax
- tiny dolly
- tiny scale

避免：

- 大幅旋转
- 游戏镜头
- VR 展厅感

## 15. Post Processing

允许非常轻的：

- bloom
- vignette
- grain
- blur

但必须可关闭。

后处理不是必须项。

## 16. Particle Controls

支持：

```text
Density
Size
Motion
Turbulence
Mouse Radius
Mouse Force
Noise Speed
Color Variation
```

还可以有：

```text
Preset
Reset
```

## 17. Preset

至少预留：

```text
Calm
Breeze
Focus
Drift
```

默认：Calm。

## 18. Debug Mode

开发模式支持：

- FPS
- particle count
- draw calls
- renderer pixel ratio
- current preset
- current mode
- GPU tier

生产隐藏。

## 19. Resize

必须处理：

- viewport resize
- DPR
- image aspect
- camera aspect
- buffer scaling

避免频繁重新创建大型 geometry。

## 20. Visibility / Tab Blur

页面不可见时：

- 降低动画频率
- 降低噪声更新
- 必要时暂停高成本后处理

## 21. Web Worker / Offscreen

不是第一阶段必需。

只有在性能测试证明 CPU 采样成为瓶颈时再使用。

## 22. Mobile

移动端默认降低：

- particle count
- DPR
- post process

仍保持照片可识别。

## 23. 最低视觉验收

必须满足：

- 单张照片可识别
- 鼠标靠近有明显但柔和的反馈
- 移开后自然恢复
- A→B Morph 不像 fade
- 粒子不会形成脏乱噪点
- 动画停止后没有明显跳帧
