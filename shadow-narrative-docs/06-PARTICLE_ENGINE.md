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

**不使用 React Three Fiber 承载粒子系统。** 理由见 `05-TECH_ARCHITECTURE.md` §18。

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

完整布局见 §11。每个粒子常驻显存 64 字节。

## 4. Coordinate Mapping

图片以 normalized coordinate 映射到 3D 平面。

建议：

- 保持图片宽高比
- 以视觉中心对齐
- 在 z 轴加入非常轻微层次

不做强透视畸变。

## 5. Sampling

图片采样**不等于**每个像素一个粒子。

### 采样算法

```text
1. createImageBitmap(blob)                        浏览器解码
2. 画进 OffscreenCanvas，长边缩到档位采样长边（见 15 §4）
3. getImageData → 遍历像素，按 §6 计算权重 w
4. 构建累积分布 cdf[i] = cdf[i-1] + w[i]
5. 分层逆变换采样（stratified inverse transform）取恰好 N 个点：
     把 [0, total) 均分成 N 段
     t_i = i * (total / N) + rand() * (total / N)
     在 cdf 上二分查找定位像素
6. 坐标映射到 normalized 平面（§4）
```

**为什么用分层逆变换而不是纯随机采样**：纯随机采样会结块，产生明显的疏密不均。
分层采样保证概率空间上均匀覆盖，同时仍尊重亮度权重。

### 粒子数

粒子数由**性能档位**决定，不写死。见 `15-DEVICE_ADAPTATION.md` §4：

```text
Ultra 150k / High 100k / Medium 50k / Low 20k / Minimal 8k
```

## 6. Luminance-aware Density

粒子权重按亮度调整：

```text
luminance = 0.2126*R + 0.7152*G + 0.0722*B     Rec.709
w = wMin + (1 - wMin) * pow(luminance / 255, gamma)

wMin  = 0.15    暗部权重下限，防止轮廓丢失
gamma = 1.6     越大越偏向亮部
```

规则：

- `alpha == 0` 的像素权重为 **0**（透明背景不产生粒子）
- `wMin > 0` 是硬性要求，纯暗部也必须留粒子，否则人物/主体轮廓会消失
- 不要只按亮度取阈值（threshold），那会产生硬边

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

### 默认参数

```text
mouseRadius   = 0.22    归一化坐标，约屏幕短边 22%
mouseForce    = 0.35
falloffCurve  = smoothstep
```

在顶点着色器内实现，无状态。指针连续移动时粒子平滑进退，满足「不跳变」。

若手感不足（缺少惯性），升级路径见 `05-TECH_ARCHITECTURE.md`：改为 GPGPU FBO ping-pong，
在 GPU 上维护速度状态。

## 9. Touch Field

触摸以：

- 当前指针位置
- 速度
- touch phase

驱动 interaction。

快速滑动可以产生更明显但仍可控的扰动。

## 10. Recovery

目标：

```text
position → targetPosition
velocity → 0
```

### 定案方案：指数平滑（exponential smoothing）

```text
pos = lerp(pos, target, 1 - exp(-k * dt))
k = 6.0
```

收敛速度：约 0.17 秒到 63%，约 0.5 秒到 95%。

**为什么选指数平滑而不是弹簧**：

- 永不超调（弹簧会过冲，视觉上像抖动）
- 无状态、无累积误差
- 帧率无关（用 `1 - exp(-k*dt)` 而非固定 lerp 系数）

**不得 snap。** 任何情况下位置都必须连续变化。

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

### 完整 attribute 布局

单个 `BufferGeometry`，全部常驻显存，**转场过程中零 buffer 重建**：

```text
aPositionA   vec3    起点位置
aPositionB   vec3    终点位置
aColorA      vec3    起点颜色
aColorB      vec3    终点颜色
aSizeA       float   起点尺寸
aSizeB       float   终点尺寸
aRandom      float   每粒子随机种子，驱动呼吸相位
aHilbert     float   空间排序后的秩，用于调试与排序校验
```

### Uniform

```text
uProgress      float   Morph 进度 0→1
uScatter       float   SCATTER 阶段强度 0→1
uTime          float   秒，驱动呼吸噪声
uPointer       vec2    指针位置，归一化坐标
uMouseRadius   float
uMouseForce    float
uDpr           float
uOpacity       float   全局透明度，用于转场淡出
```

## 12. Morph Phases

```text
PREPARE
SCATTER
FREE
REMAPPING
ASSEMBLE
SETTLE
```

### 时间预算（总时长 1200ms，对应 `02-DESIGN_SYSTEM.md` 的 morph token）

| 阶段 | 起止 | 做什么 |
|---|---|---|
| PREPARE | 0–80ms | 冻结输入，准备目标缓冲，不移动粒子 |
| SCATTER | 80–380ms | 向外散开 + z excursion + 噪声 |
| FREE | 380–560ms | 无目标自由漂浮 |
| REMAPPING | 560–620ms | 交换 source/target 缓冲（§14 的排序在此生效） |
| ASSEMBLE | 620–1060ms | 向目标收敛（§10 的指数平滑） |
| SETTLE | 1060–1200ms | 阻尼到静止 |

### 降级版本

Low / Minimal 档或 `prefers-reduced-motion` 时：

- 跳过 z excursion
- 跳过 FREE 阶段
- 总时长缩短到 600ms
- **仍必须保留 PREPARE → SCATTER → ASSEMBLE → SETTLE**，否则会退化成 fade

## 13. Morph Matching

如果两张图片粒子数量不同：

- 采用固定粒子 buffer
- 对目标采样进行 resample
- 多余 source 粒子向邻近 target / ambient field 汇聚
- 缺失 target 通过 source 邻域插值

不能在转场中大量创建/销毁 GPU buffer。

**本项目采用固定粒子池**：统一用当前档位的 N，目标图重新采样到 N。
因此 source 与 target 数量恒等，不存在多余/缺失的情况。

## 14. A→B Correspondence（核心）

**这是整个粒子引擎最容易做错的地方。**

### 问题

A 的 N 个点与 B 的 N 个点如果按任意顺序配对，粒子会各自飞向远处的目标，
结果是「噪点爆炸」，而不是「云重新聚拢成另一张照片」。

### 方案：Hilbert 空间填充曲线排序

Hilbert 曲线的关键性质是**空间邻近 ⇒ 索引邻近**。按它排序后，两个点集的同一秩
位置在空间上大致相邻，于是每个粒子走的是最短路径。

```text
1. 坐标量化到 16 位网格
     gx = clamp(floor((x + 1) * 0.5 * 65535), 0, 65535)
     gy = clamp(floor((y + 1) * 0.5 * 65535), 0, 65535)

2. 计算 Hilbert index d（u32）
     见 d2xy / xy2d 标准算法（Wikipedia: Hilbert curve）

3. 对 A 与 B 各自按 d 升序排序

4. 按秩配对：
     A_sorted[i]  ↔  B_sorted[i]
```

排序结果直接决定 GPU buffer 的写入顺序：

```text
aPositionA[i] = A_sorted[i]
aPositionB[i] = B_sorted[i]
```

### 退路：窗口化最近邻交换

若 Hilbert 排序后仍有明显的长距离飞行，做一次局部优化：

```text
对 i 从 0 到 N-1：
  在 [i, i+K) 窗口内找使 |A_sorted[i] - B_sorted[j]| 最小的 j
  交换 B_sorted[i] 与 B_sorted[j]
K = 64
```

只在小窗口内交换，保证 O(N·K) 而非 O(N²)。

### 验收

`06` §25 的最低视觉验收里，「A→B Morph 不像 fade」这条**本质上是在验收本节的排序质量**。

## 15. Camera

默认保持非常平的摄影语言。

可有：

- tiny parallax
- tiny dolly
- tiny scale

避免：

- 大幅旋转
- 游戏镜头
- VR 展厅感

### 量化

```text
parallax   ≤ 视口宽 2%
dolly      ≤ 3% 景深方向位移
scale      ≤ 1.02 倍
旋转       0（不使用）
```

## 16. Post Processing

允许非常轻的：

- bloom
- vignette
- grain
- blur

但必须可关闭。

后处理不是必须项。

**性能上后处理是最大单项开销**（约 50MB 显存 + 大量带宽），因此它是降级链的第一步，
见 `15-DEVICE_ADAPTATION.md` §5。

## 17. Particle Controls

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

## 18. Preset

至少预留：

```text
Calm
Breeze
Focus
Drift
```

默认：Calm。

## 19. Debug Mode

开发模式支持：

- FPS
- particle count
- draw calls
- renderer pixel ratio
- current preset
- current mode
- GPU tier

生产隐藏。

必须同时支持 `15-DEVICE_ADAPTATION.md` §9 的强制档位参数：
`?tier=` / `?dpr=` / `?post=`。

## 20. Resize

必须处理：

- viewport resize
- DPR
- image aspect
- camera aspect
- buffer scaling

避免频繁重新创建大型 geometry。

## 21. Visibility / Tab Blur

页面不可见时：

- 降低动画频率
- 降低噪声更新
- 必要时暂停高成本后处理

具体处理见 `15-DEVICE_ADAPTATION.md` §8。

## 22. Web Worker / Offscreen

不是第一阶段必需。

只有在性能测试证明 CPU 采样成为瓶颈时再使用。

⚠️ iOS Safari 在 Worker 内不支持 OffscreenCanvas，但本项目不背 iOS Safari 的包
（见 `15-DEVICE_ADAPTATION.md` §1）。

## 23. Mobile

移动端默认降低：

- particle count
- DPR
- post process

仍保持照片可识别。

具体档位见 `15-DEVICE_ADAPTATION.md` §4。

## 24. Performance Tiers

档位矩阵、探测方法、降级顺序、显存预算 **全部定义在 `15-DEVICE_ADAPTATION.md`**。

本节只留架构侧的引用：

```text
L1 静态特征 → 上限
L2 启动微基准 → 初始档
L3 运行时监测 → 只降不升
```

## 25. 最低视觉验收

必须满足：

- 单张照片可识别
- 鼠标靠近有明显但柔和的反馈
- 移开后自然恢复
- A→B Morph 不像 fade
- 粒子不会形成脏乱噪点
- 动画停止后没有明显跳帧

**每一条在 Minimal 档下也必须成立**（见 `15-DEVICE_ADAPTATION.md` §6）。
