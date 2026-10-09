# Shadow Narrative — Technical Architecture

## 1. Architecture Goal

保持：

- UI 与视觉引擎解耦
- AI 与 UI 解耦
- 数据与视觉状态解耦
- GPU 粒子与 React state 解耦

## 2. Recommended Stack

- Next.js
- React
- TypeScript strict
- Three.js
- React Three Fiber（如适合）
- Motion for React
- Zustand
- shadcn/ui
- Tailwind CSS / CSS Modules
- PostgreSQL + Prisma（持久化阶段）
- S3-compatible storage（生产阶段）

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
  imageService
  mediaService
  memoryService
  diaryService
  conversationService
  aiService
```

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
  → SCATTER
  → MORPHING
  → ASSEMBLE
  → STORY
  → JOURNAL
  → CONVERSATION
```

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

```text
High
Medium
Low
```

根据：

- device pixel ratio
- renderer capabilities
- particle count
- average frame time

动态选择。

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
