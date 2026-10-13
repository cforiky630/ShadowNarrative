# Domain Docs

工程类 skill 探索本仓库代码时，如何消费这里的领域文档。

## 探索之前先读这些

- 根目录 **`GLOSSARY.md`**，或
- 根目录 **`GLOSSARY-MAP.md`**（若存在）：它指向每个上下文各自的 `GLOSSARY.md`，挑与当前题目相关的读。
- **`docs/adr/`**：读与你要动的区域相关的 ADR。多上下文仓库另需查 `src/<context>/docs/adr/` 里的上下文级决策。

这些文件不存在就**静默跳过**。不要指出它们缺席，也不要提前建议创建。`/domain-modeling` skill（经 `/grill-with-docs` 与 `/improve-codebase-architecture` 到达）会在术语或决策真正被敲定时惰性创建它们。

## 文件结构

单上下文仓库（绝大多数仓库）：

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `GLOSSARY-MAP.md`）：

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## 本仓库

本仓库是**单上下文**。除上面两份外，另有一套产品与规格文档在 `shadow-narrative-docs/`（19 篇编号文档 + `recon/environment.md`），根目录 `HANDOFF.md` 是交接说明。那套文档描述**要做成什么**；`GLOSSARY.md` 与 `docs/adr/` 记录**术语与已定决策**，两者不互相替代。

## 用 glossary 的词汇

当你的产出要命名一个领域概念时（issue 标题、重构提案、假设、测试名），用 `GLOSSARY.md` 里定义的词。不要漂到 glossary 明确避免的同义词上。

需要的概念还不在 glossary 里，这本身是个信号：要么你在发明项目不用的说法（重新考虑），要么那里确实有个缺口（记下来交给 `/domain-modeling`）。

## ADR 冲突要摆到明面上

如果你的产出与某个既有 ADR 矛盾，明确说出来，不要悄悄覆盖：

> _与 ADR-0007（事件溯源的订单）冲突，但值得重开，因为……_
