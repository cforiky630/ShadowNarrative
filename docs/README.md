# Shadow Narrative 文档体系

本项目所有设计、技术架构与协作规范统一归集在 `docs/` 目录下。

## 目录层级

```text
docs/
├── specs/                  # 产品与技术全套规格说明 (19 篇核心规格 + recon 避坑调研)
│   ├── MANIFEST.md         # 规格阅读顺序清单
│   ├── 00-MASTER_README.md # 核心愿景锚点与禁止漂移清单
│   ├── 01-PRODUCT_SPEC.md  # 产品定位与体验流
│   ├── 02-DESIGN_SYSTEM.md # 设计系统与视觉 Token
│   ├── 05-TECH_ARCHITECTURE.md # 技术架构与分层约束
│   ├── 06-PARTICLE_ENGINE.md   # WebGL 粒子引擎规范
│   ├── 08-DATA_API_SPEC.md     # 数据模型与 API 契约
│   ├── 09-AI_SPEC.md           # AI 伴随者设定与提示词体系
│   ├── 10-IMPLEMENTATION_PLAN.md # 迭代计划与验收状态
│   └── recon/                  # 环境与依赖踩坑记录 (environment.md)
│
├── agents/                 # Agent 协作与流程规范
│   ├── domain.md           # 领域文档阅读规范
│   ├── issue-tracker.md    # GitHub Issue 与 spec 操作指引
│   └── triage-labels.md    # Issue triage 角色与标签规范
│
└── adr/                    # 架构决策记录 (Architecture Decision Records，见 adr/README.md)
```

## 阅读指南

1. **整体上下文理解**：先读根目录 [`HANDOFF.md`](../HANDOFF.md)（交接说明与最新手感迭代），再读 [`docs/specs/MANIFEST.md`](specs/MANIFEST.md) 引导的 19 份规格。
2. **重大技术与产品决策**：查阅 [`docs/adr/`](adr/README.md) 了解 SQLite、粒子解耦、常驻单例画布等决策依据。
3. **产品与视觉底线**：请始终以 [`docs/specs/00-MASTER_README.md`](specs/00-MASTER_README.md) 和 [`docs/specs/02-DESIGN_SYSTEM.md`](specs/02-DESIGN_SYSTEM.md) 为准绳，严禁视觉与产品形态漂移。
4. **Agent 协作约定**：遵循 [`docs/agents/`](agents/) 下的治理规范。
