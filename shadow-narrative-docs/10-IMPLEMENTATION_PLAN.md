# Shadow Narrative — Implementation Plan / Agent Runbook

## 总原则

按 Round 0 → Round 8 执行。

每轮完成后先运行、检查，再进入下一轮。

不要一次性实现全部产品。

## Round 0 — Design & Technical Recon

### 读取

优先复查：

00–09。

### 输出

```text
/docs/architecture.md
/docs/design-decisions.md
/docs/design-system.md
/docs/particle-plan.md
```

### 必须回答

- 粒子系统如何实现
- Photo → Particle 如何实现
- Morph 如何实现
- React/Three 如何分工
- 页面状态如何共享
- Local-first 还是 Backend-first
- 性能风险在哪里

### 验收

没有技术路线冲突。

## Round 1 — Foundation

完成：

- Next.js/React
- TypeScript
- routing
- Zustand
- Motion
- Three.js/R3F
- design tokens
- shadcn 基础 primitive
- app shell

验收：

页面可运行，视觉不是默认模板。

## Round 2 — Particle Engine

只专注：

- image loading
- sampling
- buffer
- shader
- points
- mouse field
- recovery
- performance tiers

必须完成一个独立 Particle Demo。

验收：

一张真实图片可以变成粒子，并可互动。

## Round 3 — Morph + Memory Space

完成：

- Photo A
- Particle scatter
- Particle morph
- Photo B
- 首页
- navigation
- particle controls

验收：

首页第一次打开就体现项目独特性。

## Round 4 — Field + Theater

完成：

- Memory Field
- Memory Nodes
- Node Focus
- Memory Theater
- Story scene system

验收：

Field → Theater 是连续空间体验。

## Round 5 — Journal + Conversation

完成：

- Journal
- Mock AI
- Conversation UI
- generate diary interaction
- evidence/source UI

验收：

AI 不像普通 ChatGPT。

AI 的陪伴语气符合 `09-AI_SPEC.md` 第 3–5 节（温柔、简短、有边界）。

## Round 6 — Data + Real AI

完成：

- database
- storage
- media persistence
- memory CRUD
- diary CRUD
- conversations
- AI image understanding
- AI diary generation

验收：

刷新后数据还在。

## Round 7 — Mobile + Performance

完成：

- touch
- responsive
- reduced motion
- WebGL fallback
- performance tiers
- image optimization

验收：

移动端不是简单缩放。

## Round 8 — Visual Polish

禁止增加大功能。

只做：

- spacing
- typography
- particle density
- transition
- glow
- blur
- cursor
- loading
- empty
- error
- mobile polish

### Final rule

删除任何不必要的 UI。

让画面更安静。

## 每轮完成模板

```text
Round:
Completed:
Changed files:
New files:
Run command:
Verification:
Performance:
Visual result:
Known issues:
Next round:
```
