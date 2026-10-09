# Shadow Narrative — Device Adaptation

## 1. 目标设备范围

### 必须流畅支持

| 类别 | 下限 |
|---|---|
| 桌面 | 近 5 年笔记本，**集成显卡**（Intel Iris Xe / UHD 620 级别）到独显 |
| 桌面浏览器 | Chrome / Edge（Chromium 内核），Windows / macOS |
| 移动 | Android Chrome，近 5 年中端及以上（骁龙 7 系 / 天玑 8000 系级别） |

### 尽力而为，不做特殊适配

- iOS Safari —— WebGL 精度差异、显存回收更激进、Worker 内 OffscreenCanvas 缺失
- Firefox / Safari 桌面版

### 明确不支持

- 无 WebGL2 的设备 → 走 §7 静态降级
- 软件渲染（SwiftShader / llvmpipe）→ 走 §7 静态降级
- IE、旧 Edge

## 2. 为什么不能用设备嗅探

设备名、UA、`navigator.deviceMemory` 都会骗人。同一台机器会因为省电模式、是否插电、
浏览器版本而产生数倍差异。

所以采用**三层探测**：

```text
L1 静态特征  →  定上限（渲染器创建前，零成本）
L2 启动微基准 →  定初始档（正式加载照片前，30 帧）
L3 运行时监测 →  动态降档（持续，兜住热节流）
```

## 3. 三层能力探测

### L1 静态特征

渲染器创建**之前**执行，成本接近零。

| 特征 | 取法 | 用途 |
|---|---|---|
| WebGL2 可用性 | `canvas.getContext("webgl2")` | 不可用 → 静态降级 |
| 是否软件渲染 | `WEBGL_debug_renderer_info` 的 `UNMASKED_RENDERER_WEBGL` 含 `SwiftShader` / `llvmpipe` / `Software` | 直接封顶 Minimal |
| `MAX_TEXTURE_SIZE` | `gl.getParameter` | < 4096 → 封顶 Low |
| `MAX_VERTEX_UNIFORM_VECTORS` | `gl.getParameter` | < 256 → 封顶 Medium |
| `navigator.deviceMemory` | GB，仅 Chromium | 辅助判断，**不可单独依据** |
| `navigator.hardwareConcurrency` | 逻辑核心数 | 同上 |
| `devicePixelRatio` | 全局 | 计算真实渲染像素数 |
| `prefers-reduced-motion` | 媒体查询 | 大幅降低动效，见 `04-UX_INTERACTION_SPEC.md` §15 |

**L1 的输出是上限，不是档位。**

### L2 启动微基准

在加载任何照片**之前**跑，否则用户要等大图解码完才知道该用什么档。

```text
N = 20000 个随机点，无纹理
渲染 30 帧
丢弃前 5 帧（着色器编译 + JIT 预热）
取后 25 帧的帧时间 p50
```

| 测得 p50 | 初始档 |
|---|---|
| ≤ 8ms | Ultra |
| ≤ 14ms | High |
| ≤ 24ms | Medium |
| ≤ 33ms | Low |
| > 33ms | Minimal |

最终初始档 = `min(L1 上限, L2 结果)`。

### L3 运行时监测

滚动窗口统计最近 60 帧：

- p90 帧时间 > 当前档位预算 × 1.5，且持续 2 秒 → **降一档**
- **只降不升。** 升档会引起抖动循环（降档 → 变快 → 升档 → 又卡）
- 用户在粒子控制面板手动选过档位后，关闭自动降档

笔记本拔电源、手机发烫导致的性能骤降由这一层兜住。

## 4. 档位矩阵

每档的**性能参数**：

| 档位 | 粒子数 | DPR 上限 | 后处理 | 采样长边 | 目标帧时间 |
|---|---|---|---|---|---|
| Ultra | 150,000 | 2.0 | 开 | 2048 | 16.7ms |
| High | 100,000 | 2.0 | 开 | 1600 | 16.7ms |
| Medium | 50,000 | 1.5 | 关 | 1024 | 22ms |
| Low | 20,000 | 1.0 | 关 | 768 | 33ms |
| Minimal | 8,000 | 1.0 | 关 | 512 | 33ms |

每档的**显存预算**（可自行验算）：

单个粒子的 attribute 占用 = 64 字节：

```text
aPositionA vec3  12B      aColorA vec3  12B      aSizeA  4B
aPositionB vec3  12B      aColorB vec3  12B      aSizeB  4B
aRandom    float  4B      aHilbert   float  4B
```

| 档位 | 粒子 attributes | 源/目标纹理 | 后处理 RT | 合计上限 |
|---|---|---|---|---|
| Ultra | 9.6 MB | 33.5 MB | ~50 MB | **96 MB** |
| High | 6.4 MB | 20.5 MB | ~50 MB | **80 MB** |
| Medium | 3.2 MB | 8.4 MB | 0（关闭） | **16 MB** |
| Low | 1.3 MB | 4.7 MB | 0 | **8 MB** |
| Minimal | 0.5 MB | 2.1 MB | 0 | **4 MB** |

后处理开关造成 High → Medium 之间约 60MB 的断崖，这是**有意的**：
弱设备首先该丢的就是 bloom 和 grain。

## 5. 降级顺序

严格按此顺序。先降视觉影响最小的。

```text
1. 关后处理（bloom / grain / vignette）   ← 省最多资源，视觉影响最小
2. 降 DPR（2.0 → 1.5 → 1.0）              ← 画面变软，但不改变构图
3. 降粒子数（按 §4 跳档）
4. 降采样分辨率（重新采样纹理）
5. 简化转场（缩短 Morph 时长，拂动幅度减半）
6. 退化为静态照片浏览（无粒子）
```

### 禁止的降级顺序

| 禁止 | 原因 |
|---|---|
| 先降粒子数再降 DPR | 粒子数先掉会让照片提前变糊，破坏「照片可识别」这条底线 |
| 任何阶段先删指针反馈 | 那是产品的核心手感，宁可少粒子 |
| 跳过步骤直接跳档 | 会造成视觉跳变 |

## 6. 各档位的视觉保底要求

**Minimal 档也必须全部满足**（对应 `06-PARTICLE_ENGINE.md` §25）：

- [ ] 照片仍可识别，不糊成一团噪点
- [ ] 指针/触摸仍有反馈（哪怕只是轻微的亮度响应）
- [ ] 转场仍不是淡入淡出（至少保留粒子位置插值）
- [ ] 静止时不抖动
- [ ] 深色背景上没有明显色带

**Low 及以上**还必须：

- [ ] 鼠标场有明确的 repel 手感
- [ ] Morph 有可感知的中间过渡，不是 fade

**Ultra / High** 还必须：

- [ ] 拖拽可旋转、滚轮可缩放、可一键复位回正视角
- [ ] 旋转到侧视时粒子层有厚度，不是一条零厚度的线

## 7. 静态降级（无 WebGL2 或软件渲染）

- 不显示黑屏或错误页
- 直接展示照片 + 故事文字 + 日志
- 转场用极简淡入淡出（此时允许，因为没有粒子）
- **保留全部信息功能**：浏览、阅读、日志、对话

顶部**不要**出现「你的设备不支持」这类挫败性文案。安静降级即可。

## 8. 特殊场景

### 后台标签 / 页面不可见

- `document.hidden` 为真时停止 RAF
- 回到前台时先跑 5 帧预热再恢复渲染，避免首帧卡顿

### 热节流与省电

- 掉电状态（`navigator.getBattery()` 可用时）→ 直接降一档
- 连续掉帧由 L3 兜住
- 电池信息**只用于性能**，不做任何其他推断，不发送

### WebGL context lost / restored

- 监听 `webglcontextlost`（`preventDefault()`）与 `webglcontextrestored`
- lost：暂停 RAF，标记状态，不清空 React 状态
- restored：重建 renderer / geometry / textures，恢复到当前 Memory 与粒子预设
- 重建期间显示粒子聚拢式 loading（`04-UX_INTERACTION_SPEC.md` §12）

### 低内存

- `performance.memory` 可用时监测（仅 Chromium）
- 超阈值时释放非当前 Memory 的纹理缓存
- 不预加载下一张图的粒子源

## 9. 验证方法

### 本机是中高端，只能模拟

本机实测为 RTX 3060 + i7-12700H，属高端设备，因此中低端必须靠模拟。

开发模式必须实现以下查询参数（**Round 2 就要有**）：

| 参数 | 作用 |
|---|---|
| `?tier=ultra\|high\|medium\|low\|minimal` | 强制档位，绕过 L1/L2/L3 |
| `?dpr=1` | 强制低 DPR，模拟高 DPR 设备的负载 |
| `?post=off` | 强制关后处理 |

配合浏览器能力：

| 手段 | 位置 | 模拟什么 |
|---|---|---|
| CPU 节流 | DevTools → Performance → CPU 4x / 6x | 采样、Hilbert 排序等 CPU 阶段 |
| 设备工具栏 | DevTools | 布局与触摸，**不代表 GPU 性能** |

**这些手段的局限**：DevTools 的 CPU 节流不模拟 GPU 瓶颈。中端手机的填充率与带宽瓶颈
模拟不出来。**因此真机验证不可省略。**

### 真机验证清单（有条件时）

- [ ] 中端 Android（骁龙 7 系或同级）Chrome
- [ ] 集显 Windows 笔记本（Iris Xe / UHD）
- [ ] 记录：初始档位、10 秒后的档位、平均帧时间、是否触发降档

## 10. 与其他文档的关系

- `06-PARTICLE_ENGINE.md` §5 讲粒子数与采样，本文档定义档位矩阵与阈值
- `11-TESTING_PERFORMANCE.md` 定义测试矩阵与性能指标
- `02-DESIGN_SYSTEM.md` §9–10 定义动效时长与缓动曲线
- `04-UX_INTERACTION_SPEC.md` §14–15 定义无障碍与 reduced-motion 要求
- `05-TECH_ARCHITECTURE.md` §12 是本文档的架构侧引用
