# Shadow Narrative — Technical Architecture

## 1. Architecture Goal

保持：

- UI 与视觉引擎解耦
- AI 与 UI 解耦
- 数据与视觉状态解耦
- GPU 粒子与 React state 解耦

## 2. Recommended Stack

### 主应用（TypeScript / Next.js）

- Next.js 16
- React 19
- TypeScript strict
- Three.js（原生）
- **GSAP** —— 只用于镜头编排
- **Motion for React** —— 只用于 UI 微交互
- Zustand
- shadcn/ui
- Tailwind CSS 4
- **SQLite + Prisma**（自托管，一个文件，零配置）
- S3-compatible storage（仅当将来需要远端存储时）

### 图像管线（Python，按需）

- FastAPI
- Pillow + `pillow-heif` + `rawpy`
- 本地模型：insightface、CLIP —— 按需引入

**不引入 React Three Fiber**：粒子系统必须用原生 Three.js，理由见 §18。

### 两套动画系统怎么分工

这是 2026-10-09 的决定，用户明确要求「不考虑工作过程，只看结果」。

| 层 | 工具 | 负责 |
|---|---|---|
| 镜头 | GSAP | 相机推进、场景切换、跨元素严格时序 |
| 粒子 | 自研 rAF | 粒子位置、morph、指针场 |
| UI | Motion | 导航、面板滑出、提示 |

**引入 GSAP 的理由**：粒子是自己写的 rAF 循环，**Motion 驱动不了它**。
「相册焦点 → 相机推进 → 原图变粒子 → 进入 Theater」这种多阶段镜头需要在
同一条时间线上同时驱动相机位置、shader uniform 和 DOM 透明度。

**必须共用同一套缓动。** 两套库并存的风险是动效性格分裂，所以 GSAP 的 ease
必须由 `02-DESIGN_SYSTEM.md` §10 的曲线换算，不使用内置的 `power2.out` 这类命名缓动。

### 为什么是两套语言

| 层 | 语言 | 理由 |
|---|---|---|
| CRUD / AI 代理 / 页面 | TypeScript | 前后端共享类型。客户端是重度 WebGL，`Photo` / `Conversation` / `Journal` 的类型写两遍会严重漂移 |
| 图像管线（缩略图 / EXIF / HEIC / RAW） | Python | `pillow-heif` 与 `rawpy` 在 Node 侧没有对等物 |
| 本地智能（人脸聚类 / embedding 检索） | Python | Node 侧生态基本空白 |

**边界必须清楚**：Python 服务不碰业务数据，只做「字节进、字节出」的图像处理与向量计算。
它不连业务数据库，所有持久化由 TypeScript 侧负责。

## 3. Runtime Layers

```text
App Shell
  ↓
Experience State
  ↓
Scene / UI Composition
  ↓
Particle Engine
  ↓
WebGL Renderer
```

## 4. Directory

```text
src/
  app/
  components/
  engine/
    particle/
    scene/
  services/
  store/
  types/
  lib/
  styles/
```

## 5. Particle Engine

```text
engine/particle/
  ParticleSystem
  ParticleMapper
  ParticlePhysics
  ParticleInteraction
  ParticleTransition
  ParticlePerformance
  ParticlePreset
  shaders/
    particle.vert
    particle.frag
```

## 6. Components

```text
components/
  ParticleCanvas
  ParticleControls
  TopNavigation
  MemoryField
  MemoryNode
  MemoryTheater
  MemoryScene
  JournalReader
  MemoryConversation
  MemoryNavigation
  PhotoPicker
  CommandPanel
```

## 7. Services

```text
services/
  photoService          照片 CRUD
  memoryService         分组（可选，不拥有照片）
  mediaService          文件读写与校验，不处理像素
  conversationService
  journalService
  aiService             调 DeepSeek
  backupService         见 18-BACKUP_PROTOCOL.md
  imageService          ← 调用 Python 图像服务（尚未建）
```

### 服务边界

```text
浏览器
  ↓
Next.js Route Handlers（TypeScript）
  ├─→ Prisma → PostgreSQL         业务数据
  ├─→ 对象存储                     原图与派生图
  ├─→ DeepSeek API                 图像理解 / 日志 / 对话
  └─→ Python 图像服务（FastAPI）    缩略图 / EXIF / HEIC / RAW / 向量
```

约束：

- 页面与组件**不得**直接调用 Prisma，必须经过 service 层
- Python 服务**不连业务数据库**，也不持有业务状态
- Python 服务不可用时，降级为「原图直出」，不阻塞上传
- 两服务之间用 HTTP + 共享密钥认证，不使用公网暴露

## 8. Global State

Use Zustand or equivalent.

至少：

```text
currentMemory
selectedMedia
experienceMode
particlePreset
transitionState
uiState
conversationState
performanceTier
```

不要把每一帧的粒子 position 放到 React/Zustand。

GPU/engine 内部维护实时粒子数据。

## 9. State Machine

推荐：

```text
IDLE
  → EXPLORE
  → FOCUS
  → INTERACT
  → ORBIT
  → MORPHING
  → STORY
  → JOURNAL
  → CONVERSATION
```

状态的完整定义见 `04-UX_INTERACTION_SPEC.md` §2。类型定义在 `src/types/index.ts`
的 `ExperienceMode`，三处必须一致。

## 10. Route/Spatial Architecture

路由可以存在，但用户感知上应该是同一空间。

可以使用 App Router 页面路由或状态路由，只要：

- scene transition 连续
- particle canvas 尽量复用
- 当前 memory 不丢失

## 11. Asset Pipeline

每张媒体至少考虑：

```text
original
thumbnail
medium
particle-source
```

## 12. Performance Tiers

档位矩阵、探测方法、降级顺序、显存预算**全部定义在 `15-DEVICE_ADAPTATION.md`**。

本节只保留架构侧约定：

```text
L1 静态特征    → 定上限（渲染器创建前）
L2 启动微基准  → 定初始档（30 帧，正式加载照片前）
L3 运行时监测  → 只降不升，兜住热节流
```

档位值由 `PerformanceTier` 模块管理，与 React 解耦。档位变化通过 Zustand
通知 UI（如 debug overlay），**不进入每帧渲染路径**。

## 13. WebGL Fallback

如果 WebGL 不可用：

- 提供静态/Canvas 简化模式
- 保留照片查看与故事功能
- 不展示坏掉的黑屏

## 14. Error Boundary

至少围绕：

- WebGL scene
- image processing
- AI panel
- persistence layer

## 15. Type Safety

严格 TypeScript。

避免 `any`。

核心数据使用 schema validation。

## 16. Logging

开发环境允许详细日志。

生产环境：

- 不输出用户图片内容
- 不输出 Prompt 中可能包含的敏感文本
- 保留 request id / error type

## 17. Dependency Policy

不要因为一个小动画就增加大型依赖。

优先：

已有依赖
→ 少量工具
→ 自己实现

## 18. Architecture Rule

如果某个实现容易让 React 每帧重渲染粒子系统，禁止采用。
