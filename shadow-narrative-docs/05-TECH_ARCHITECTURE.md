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
  ExperienceShell        ★ 画布的所有者，(experience) 路由组的 layout 挂它
  ParticleCanvas
  ParticleControls       粒子参数浮卡（左下，07 §3）
  BottomDock             ★ 左下那颗胶囊：参数 | 设置 两格（07 §11.2）
  DockCard               上面两张卡共用的外壳
  SettingsPanel          设置浮卡（07 §11）
  TopNavigation
  MemorySpace            Photo View 的**文字层**，不含画布
  TimelineSpace          时间线（取代 Library 抽屉，16 §6）
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

（上面这份清单里有一半还没建，是早期规划留下的；**下面这条规则是现行的**。）

### 6.1 画布归 ExperienceShell，不归任何一条路由

> 2026-10-10 定。起因是「从时间线点进一张照片」读起来像硬跳转。

`ParticleCanvas` 必须长在**路由之上** —— `src/app/(experience)/layout.tsx`
里的 `ExperienceShell`。理由：

**路由换掉时画布不能卸载。** 长在 `MemorySpace` 里的时候，路由一换它就随
组件树一起销毁重建：屏幕先空白（动态路由的 Suspense fallback），
再黑屏一段（挂载 + 取原图）。这就是「硬跳转」的全部来源。

放进 layout 之后，`/` 与 `/timeline` 都是它的孩子，换路由只换孩子。
于是时间线和照片页不是两个页面，是**同一个空间的两个状态** ——
`01-PRODUCT_SPEC.md` §5、`16-ALBUM_SPACE.md` §8.6。

三条随之而来的纪律：

1. **画布全局只能有一个。** 两个引擎 = 两份 WebGL 上下文 + 两个 rAF 循环。
2. **`MemorySpace` 不再碰画布**，它只剩文字层。它通过 `useStage()` 拿句柄，
   做外壳管不了的事（拖入照片的 `morphTo`、删除的 `setMode`、`resetView`）。
3. **画布藏着的时候要 `paused`。** 它在所有路由上都存在，
   不停掉的话时间线上会有 15 万粒子在没人看的地方跑满一个核。

### 6.2 层叠：靠 `pointer-events`，不靠 `z-index`

画布层的底色是**实心**的（它得盖住时间线，粒子之间是透明的）。这带来一个
容易踩空的地方：

> **画布层一旦被抬到 `main` 之上，`main` 里那些 z-index 更小的文字
> （日期、字幕）就会被整块压在它底下 —— 而画布有实心底色，症状是「文字全没了」。**
> 反过来，如果把路由内容的外层包一层带 `opacity` 动画的 div，
> 那层会变成**层叠上下文**、整棵子树被归到「块级内容」那一拨，
> 同样落到画布底下 —— 症状一模一样，根因却是另一个。

而画布**必须**收得到指针（OrbitControls 直接挂在 canvas 元素上）。所以：

- 画布层**不加 z-index**，画在底；`main`（`relative`，DOM 在后）自然压在它上面
- `main` 自己 `pointer-events: none` —— 指针穿透到画布
- 该点的东西各自 `pointer-events: auto`：文字层的按钮、`ParticleControls`、
  左下角操作区
- 拖入照片的监听挂 `window`（`main` 收不到 `dragover`）
- 画布层藏在时间线上时也要 `pointer-events: none`，否则会挡住叠放的左右滑动

**别用 z-index 去解这个问题** —— 那是把指针和绘制当成两件事，而它们是同一套层叠。

#### 透明度效果能放在哪

结论：**只能放在 `main` 里面，而且只能放在已经带正 z-index 的定位后代上**
（典型是 `MemorySpace` 的文字层，`absolute z-10`）。

那种元素在根层叠上下文里属于「正 z-index 的定位后代」，永远排在最后的
一步 —— 也就是永远在画布之上。它淡自己的，不会掉下去。

**不能放在 `.sn-content` 或 `main` 上**：它们是 `static` / `z-auto` 的整屏块，
一带上 `opacity < 1`（或挂一条 opacity 动画）就成了层叠上下文，
整棵子树被归到「块级内容」那一拨，沉到 `fixed` 的画布之下 ——
而画布有实心底色，症状就是日期字幕整个消失。

> 判据不是「哪一层看着顺眼」，而是**这个元素在根层叠上下文里走第几步**。


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
  ├─→ Prisma → SQLite              业务数据（08 §2）
  ├─→ 对象存储                     原图与派生图
  ├─→ DeepSeek API                 图像理解 / 日志 / 对话
  └─→ Python 图像服务（FastAPI）    缩略图 / EXIF / HEIC / RAW / 向量
```

约束：

- 页面与组件**不得**直接调用 Prisma，必须经过 service 层
- Python 服务**不连业务数据库**，也不持有业务状态
- Python 服务不可用时，降级为「原图直出」，不阻塞上传
- 两服务之间用 HTTP + 共享密钥认证，不使用公网暴露

### 为什么 AI 不做成独立的 Python 服务（2026-10-10 决定）

用户提过一个方案：把 AI 抽出去用单独的后端 + Python 处理，理由是「方便管理模型接入」
和「防止封装给别人用之后逆向密钥」。**结论是不做**。两条理由要分开看，因为它们
其实指向不同的答案。

#### 「防止逆向密钥」在本地服务上不成立

如果 Python 服务跑在**用户自己的机器**上（桌面 app 的形态必然如此），
那 key 也必须在用户机器上 —— 它只是换了个地方待着：

- 放在文件里 → 用户能读
- 编译进二进制 → `strings` 能捞出来
- 走网络 → 本地代理能截

**想真正保护一把共享的 key，唯一的办法是让它不落到客户端上** ——
也就是走一个**你自己控制的中转服务**。那不是「抽成 Python 服务」，
那是「多一台服务器」，而代价是**你要替所有用户付 token**。
`18 §1` 把「服务端 AI」列为非目标，挡的正是这个。

> 现在每个用户用自己的 key（`17 §4`）。**这种情况下根本不存在「我的密钥」可供逆向。**

#### 「方便管理模型接入」这条，缝已经有了

`aiService` 的 base URL 与模型名都从 `secrets.json` 读（`AI_BASE_URL` / `AI_MODEL`），
而请求走的是 **OpenAI 兼容的 `/chat/completions`**。所以：

| 想换什么 | 怎么改 |
|---|---|
| 别的厂商 | 改 `AI_BASE_URL` + `AI_MODEL` |
| 自己跑的本机模型（Ollama / llama.cpp / vLLM） | 同样是改 `AI_BASE_URL` |
| 自己的中转服务 | 还是改 `AI_BASE_URL` |

**不需要抽任何东西出来。**

#### 另外两条具体的反对理由

- **类型漂移**。§2 已经定过：CRUD / **AI 代理** / 页面用 TypeScript，
  因为「`Photo` / `Conversation` / `Journal` 的类型写两遍会严重漂移」。
  AI 的输出直接喂给 `PhotoAnalysis.payload` → `Conversation` → `Journal`，
  跨语言边界就是给这个漂移开一道口子
- **打包代价**。Round 13 定了 Electron 封装，而 Node 是 Electron **自带的**
  （`ELECTRON_RUN_AS_NODE`，零额外体积）。再塞一个 Python 运行时意味着
  PyInstaller sidecar、每个平台单独构建、体积再涨几十 MB ——
  直接把「封装不能难」这条推翻

#### 什么时候会重新考虑

如果以后真的要**分发一把共享的 key**，正确做法是加一个**你自己控制的
OpenAI 兼容中转**。因为客户端说的本来就是 OpenAI 那一套，接上它**只是改
`AI_BASE_URL`**，不是重写。届时唯一要算清楚的是「替所有人付 token」这笔账。

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
