# Shadow Narrative — Testing & Performance

## 1. Testing Layers

### Unit

测试：

- sampling
- particle mapping
- data transforms
- AI output validation
- API validation

### Component

测试：

- controls
- dialogs
- journal
- node interactions

### Integration

测试：

- upload → particle
- memory → theater
- conversation → journal
- persistence

### E2E

使用 Playwright 或等价工具。

## 2. Golden User Journey

```text
打开（Album 斜轴）
→ 拖入一张照片
→ 原图立刻出现
→ 字幕浮现
→ 收藏
→ 沿轴拖拽
→ 点击进入
→ 原图模式
→ Into this moment → 波前从中心扩散成粒子
→ 拖拽旋转
→ 整理成日志
→ 刷新
→ 数据仍在
```

必须可完成。

## 3. Visual Regression

建议保留关键截图：

- Album idle（斜轴）
- Album 焦点切换
- Album → Photo View 的中间态
- Photo View 原图
- 原图 → 粒子的中间态
- Particle focus
- Morph mid-state
- Journal
- Conversation（含字幕）
- Mobile

目标不是像素级冻结所有 WebGL，而是防止明显视觉退化。

## 4. Performance Metrics

至少记录：

- FPS
- average frame time
- dropped frames
- particle count
- draw calls
- renderer pixel ratio
- texture memory（能获取时）
- initial load

## 5. Performance Goals

帧时间预算按**档位**定义，不按设备类型。完整矩阵见 `15-DEVICE_ADAPTATION.md` §4。

| 档位 | 目标帧时间 | 折算帧率 |
|---|---|---|
| Ultra | 16.7ms | 60 FPS |
| High | 16.7ms | 60 FPS |
| Medium | 22ms | ~45 FPS |
| Low | 33ms | 30 FPS |
| Minimal | 33ms | 30 FPS |

不是要求所有设备都达到相同数字 —— 弱设备降档后达到本档预算即为通过。

## 6. Performance Degradation

超过目标时优先降低：

1. 后处理
2. DPR
3. particle count
4. 采样分辨率
5. 转场复杂度
6. 退化为静态照片浏览

不要首先删除核心交互。

完整的降级顺序与**禁止的降级顺序**见 `15-DEVICE_ADAPTATION.md` §5。

## 7. Browser Matrix

至少验证：

- Chrome（**主目标**）
- Edge（**主目标**，与 Chrome 同源）
- Firefox（尽力支持）
- Safari 桌面（尽力支持）

**iOS Safari 不在支持范围**，不需要为它做适配测试，见 `15-DEVICE_ADAPTATION.md` §1。

## 8. Device Matrix

档位矩阵与探测方法见 `15-DEVICE_ADAPTATION.md`。本节只定义**测试用**设备清单。

### 必须覆盖

| 类别 | 具体目标 | 验证方式 |
|---|---|---|
| 高端桌面 | 本机（RTX 3060 + i7-12700H） | 真机 |
| 集显笔记本 | Intel Iris Xe / UHD 620 | **需真机**，无法模拟 |
| 中端 Android | 骁龙 7 系 / 天玑 8000 系 | **需真机**，无法模拟 |
| 低端 Android | 骁龙 4 系或同级 | 可只验 Minimal 档保底 |

### 没有真机时的替代手段（本机情况）

| 手段 | 模拟什么 | 局限 |
|---|---|---|
| `?tier=low` 强制档位 | 各档视觉表现 | 不模拟真实 GPU 瓶颈 |
| DevTools CPU 4x / 6x 节流 | 采样、Hilbert 排序等 CPU 阶段 | **不模拟 GPU 瓶颈** |
| `?dpr=1` | 高 DPR 设备负载 | 同上 |
| DevTools 设备工具栏 | 布局与触摸 | 不代表性能 |

**替代手段不能替代真机。** 集显笔记本与中端 Android 的填充率、带宽瓶颈模拟不出来，
因此上表「需真机」两项不可省略。

## 9. Error Tests

测试：

- invalid image
- oversized image
- corrupted image
- WebGL unavailable
- slow network
- AI timeout
- AI invalid JSON
- storage failure
- database failure

## 10. Reduced Motion

启用系统 reduced motion 后：

- morph 降级
- camera 降级
- particle noise 降级
- 内容仍完整可用

## 11. Performance Rule

如果一个新视觉效果导致普通设备明显掉帧：

先优化，再上线。

## 12. No False Success

“开发服务器能启动”不等于完成。

“页面显示出来”不等于完成。

必须跑完整用户流程。
