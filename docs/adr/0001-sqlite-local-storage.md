# 1. 使用本地 SQLite 替换 PostgreSQL 实现零运维单机自托管

- **状态**：已采纳 (Accepted)
- **日期**：2026-10-09
- **决策者**：项目架构组
- **相关规格**：`docs/specs/08-DATA_API_SPEC.md §2`、`docs/specs/17-SELF_HOSTING.md §3`

## 背景与问题

最初设计依赖外置 PostgreSQL 服务。但在个人单机私有记忆产品的定位下，要求用户或体验者预先配置并运行 PostgreSQL 服务极大增加了自托管与部署门槛。

## 决策

1. 将数据库引擎全面切换为 SQLite（基于 Prisma 7 的 `@prisma/adapter-better-sqlite3` 驱动）。
2. 数据库文件固定存储于本地数据目录（默认 `<项目根>/.data/shadow-narrative.db`，由 `src/lib/dataDir.ts` 单一真源推导）。
3. 所有实体表（Photo, Memory, DayTheme, UserSettings）保留 `userId` 外键和索引，保持多租户扩展性。

## 影响

- 正面：用户只需 `npm run setup` 即可一键跑通，无需安装配置任何数据库服务。
- 差异：SQLite 不支持原生 Enum（通过 TS 联合类型约束）、JSON 支持有限（应用层解析）、LIKE 默认区分大小写（需指定 `COLLATE NOCASE`）。
