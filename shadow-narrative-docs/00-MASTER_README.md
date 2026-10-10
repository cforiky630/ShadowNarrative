# Shadow Narrative — Agent Master README

> **目的：** 本文档集是 Shadow Narrative 项目的唯一开发基准。Agent 必须按照本文档规定的顺序读取全部 Markdown，再开始编码。

## 0. 项目一句话

**Shadow Narrative 是一个把照片、粒子、时间、故事、AI 与随笔小记融合在一个黑色沉浸式空间中的个人数字记忆产品。**

不是普通相册，不是后台，不是 ChatGPT 套壳，也不是商业化平台。

核心感受：

> **我进入了自己的记忆，而不是打开了一个网站。**

**产品边界：本项目是个人/私有的数字记忆体验产品，不包含支付、订阅、会员、广告、电商、商业套餐、企业售卖、多租户商业化或其他变现机制。任何新增需求都不得默认扩展到这些方向。**

## 1. 原始愿景锚点（不可偏离）

本项目最重要的视觉和产品锚点来自参考视频所体现的体验方向。即使后续没有视频文件，Agent 也必须始终遵守以下描述：

- 深黑背景、大片留白、极简白色文字。
- **第一屏是斜轴相册**：收藏的照片沿一条斜轴排在 3D 空间里，不是平铺网格。
- 照片不是普通卡片，而是由大量微小的沙粒一样的粒子组成。
- 进入一张照片先看到**真实的原图**，点「Into this moment」才变成粒子。
- 鼠标/触摸接近照片时，粒子会产生柔和的空间扰动。
- 照片 A → 沙粒重新排列 → 照片 B 是核心转场，而不是普通淡入淡出。
- 照片可以被当成一个有体积的物体，像建模软件一样拖着转起来看。
- **上传一张照片，AI 就开口说一句话**，以字幕的形式浮在照片下方。
- 右侧可出现轻量粒子参数控制面板，但默认隐藏，不抢画面。
- 记忆浏览、随笔小记、AI 对话应该像同一空间的不同状态。
- AI 不是产品主角；AI 是帮助用户理解、整理、讲述记忆的辅助者，也是一个温柔、安静的心灵好友（详见 `09-AI_SPEC.md`）。
- UI 极少、弱存在感；照片与粒子才是主体。
- 整体气质安静、克制、电影感、有呼吸感，而不是炫技式 3D 展厅。
- 3D 旋转是**用户主动发起**的探索动作，不是默认展示方式。默认视角永远是正对照片；
  只有用户拖拽时才转起来，并且随时可以复位。

### 严格禁止的视觉漂移

不要把产品改造成：

- 彩色 AI 商业化平台
- 普通瀑布流相册
- Notion/文档管理器
- ChatGPT 克隆
- 游戏化星球
- 满屏玻璃拟态
- 大量卡片、按钮、标签
- 炫目的霓虹赛博朋克
- 强烈的 3D 科幻 Dashboard

**斜轴相册可以有「在空间里穿行」的感觉，但它不是一个炫目的 3D 展厅。**

## 2. 强制读取顺序

必须按下列顺序完整读取：

```text
00-MASTER_README.md
01-PRODUCT_SPEC.md
02-DESIGN_SYSTEM.md
03-REFERENCE_COMPONENTS.md
04-UX_INTERACTION_SPEC.md
05-TECH_ARCHITECTURE.md
06-PARTICLE_ENGINE.md
07-UI_PAGE_SPECS.md
08-DATA_API_SPEC.md
09-AI_SPEC.md
10-IMPLEMENTATION_PLAN.md
11-TESTING_PERFORMANCE.md
12-SECURITY_PRIVACY.md
13-DEPLOYMENT.md
14-QA_ACCEPTANCE.md
15-DEVICE_ADAPTATION.md
16-ALBUM_SPACE.md
17-SELF_HOSTING.md
18-BACKUP_PROTOCOL.md
```

## 3. 读取规则

1. 不允许只读取自己认为“有用”的文件。
2. 在读取完 `00-18` 前，不开始大规模编码。
3. 如果文档之间存在冲突，以以下优先级处理：
   - `00-MASTER_README.md` 的原始愿景约束
   - `02-DESIGN_SYSTEM.md` 的视觉规则
   - `06-PARTICLE_ENGINE.md` 的粒子核心规则
   - `15-DEVICE_ADAPTATION.md` 的性能与降级策略
   - `07-UI_PAGE_SPECS.md` 的页面规则
   - 其他工程实现规则
4. 如果技术实现与视觉体验冲突，优先保护视觉体验，但不得以明显性能崩溃为代价。
5. 可以优化实现方式，但不能改变产品核心体验。

## 4. 文档职责

| 文件 | 职责 |
|---|---|
| 01 | 产品定位、用户流程、MVP 边界 |
| 02 | 色彩、排版、间距、动效与视觉 Token |
| 03 | 组件库和参考网站的正确使用方法 |
| 04 | 交互状态、输入、手势、转场逻辑 |
| 05 | 技术架构、目录、状态、模块边界 |
| 06 | WebGL/Three.js 粒子核心 |
| 07 | 每个页面的布局、状态和交互 |
| 08 | 数据模型、API、文件资源和持久化 |
| 09 | AI Prompt Contract、结构化输出和可信度 |
| 10 | 分阶段开发顺序与每轮完成标准 |
| 11 | 测试、性能、视觉回归和浏览器检查 |
| 12 | 安全、隐私、上传与 AI 风险 |
| 13 | 本地、预览、生产部署与环境变量 |
| 14 | 最终完整验收清单 |
| 15 | 设备能力探测、性能档位矩阵与降级策略 |
| 16 | 斜轴相册、Library、Photo View、原图⇄粒子切换 |
| 17 | 自托管交付形态、数据目录、AI 凭据 |
| 18 | 备份协议（只定协议，不实现后端） |

## 5. 默认技术决策

默认采用：

- Next.js 16 + React 19
- TypeScript strict
- **Three.js（原生，不用 React Three Fiber）** —— 理由见 `05-TECH_ARCHITECTURE.md` §18
- WebGL Shader
- Zustand
- **GSAP** —— 只用于镜头编排（`16-ALBUM_SPACE.md` §11）
- Motion for React —— 只用于 UI 微交互
- shadcn/ui
- Tailwind CSS 4
- **SQLite + Prisma**（自托管，一个文件，零配置）
- **备份后端用 PostgreSQL**（协议见 `18-BACKUP_PROTOCOL.md`）
- **Python + FastAPI**（仅图像管线，见 `05-TECH_ARCHITECTURE.md` §2）

如果项目已有成熟技术栈，Agent 可以保留现有技术，只要不破坏本项目的核心架构边界。

## 6. 核心空间

产品只需要理解为 **7 个主要体验状态**：

1. Album
2. Photo View
3. Photo Particle
4. Conversation
5. Journal
6. Library
7. Memory Theater

这些不是 7 个割裂的网站页面，而是同一个空间的不同状态。
详细规格见 `16-ALBUM_SPACE.md`。

## 7. 核心链路

```text
进入 Shadow Narrative
    ↓
Album（斜轴相册，收藏的照片）
    ↓
拖拽沿轴移动，焦点落在某张
    ↓
点击 → 相机推进
    ↓
Photo View（原图模式）
    ↓
点「Into this moment」 → 原图变粒子
    ↓
拖拽旋转 / 指针扰动
    ↓
字幕 / Conversation
    ↓
（用户主动）整理成随笔小记
    ↓
返回 Album
```

## 8. 开发顺序

先完成：

1. Particle Engine ✅
2. Photo → Particle ✅
3. Particle Interaction ✅
4. Particle Morph ✅
5. 原图 ⇄ 粒子切换
6. Photo View
7. 斜轴相册（Album）
8. Library 抽屉
9. 字幕与 AI 对话
10. 随笔小记
11. 收藏与影册
12. SQLite 迁移与自托管形态
13. 备份（`18-BACKUP_PROTOCOL.md`）
14. Mobile
15. Performance
16. Visual Polish

## 9. Agent 工作方式

每一轮开发前：

- 读取对应文档
- 检查现有代码
- 识别本轮目标
- 不提前扩大范围

每一轮结束后：

- 运行项目
- 检查 console
- 检查主要交互
- 检查性能
- 说明已完成内容
- 记录遗留项

## 10. 最重要的判断标准

如果用户第一次打开页面，第一眼注意到的是按钮、菜单和卡片，而不是照片与粒子，说明实现失败。

如果用户感觉“我正在浏览一个普通相册”，说明实现失败。

如果用户感觉“我正在进入一段记忆”，方向正确。

## Agent 开始指令

**先完整读取 `01-14`，建立项目理解，再进入 `10-IMPLEMENTATION_PLAN.md` 的 Round 0。不要跳步。**
