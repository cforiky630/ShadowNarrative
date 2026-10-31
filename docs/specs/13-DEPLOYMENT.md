# Shadow Narrative — Deployment & Environment

> **本文档规范开发环境、依赖基准与构建流程。**
> 最终用户的自托管交付形态见 `17-SELF_HOSTING.md`（本项目主线）。

## 1. Local Development

```text
Node.js LTS       推荐 v20+ / 实测 v24.18.0
npm               实测 12.0.2
Python (可选)     图像服务（仅在处理 HEIC/RAW 原图解码时引入，见 05 §7）
```

依赖版本以 `package-lock.json` 为准。

⚠️ npm 12 起默认拦截依赖的 install scripts。`better-sqlite3`、`prisma` 等依赖已在 `package.json` 的 `allowScripts` 中白名单授权。详细避坑见 `recon/environment.md` §6.2。

### 数据存储

**应用本身采用本地嵌入式 SQLite**（详见 `08-DATA_API_SPEC.md` §2、ADR 0001），不需要安装或运行任何外部数据库服务：
* 数据库文件物理路径统一由 `src/lib/dataDir.ts` 推导（`<数据目录>/shadow-narrative.db`）。
* 照片文件物理存储在 `<数据目录>/photos/`。
* 远端备份协议（`18-BACKUP_PROTOCOL.md`）独立于本地应用，若进行远端备份联调可使用独立外部存储或 PostgreSQL 模拟备份目标端。

本地环境初始化统一使用项目脚本：

```bash
npm run setup
```

该命令具备幂等性，自动创建数据目录、执行 Prisma 迁移并生成 `secrets.json` 模板。

### 数据库迁移

```bash
npm run db:migrate   # 开发期创建并执行迁移
npm run db:deploy    # 部署并应用已有迁移
```

迁移历史文件位于 `prisma/migrations/`。

## 2. Commands

系统在 `package.json` 与 `README.md` 中提供标准工程命令：

```bash
npm run dev          # 启动本地开发服务 (带 Turbopack 编译)
npm run build        # 生产环境打包构建
npm run start        # 运行生产构建产物
npm run lint         # ESLint 代码风格与静态分析
npm run typecheck    # TypeScript 全量严格类型校验 (tsc --noEmit)
npm run setup        # 本地数据目录与数据库环境初始化
npm run db:migrate   # Prisma 数据库结构迁移
```

CI 检查必须保证 `typecheck`、`lint` 与 `build` 全部通过。

## 3. Environment Variables

系统严格遵循本地主权与凭据解耦原则，环境变量配置与 `.env.example` 保持完全一致：

```bash
# --- 应用基础配置 ---
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- 自托管配置（见 17-SELF_HOSTING.md §6）---
# SN_DATA_DIR=            # 自定义持久化数据目录，默认 ~/.shadow-narrative（开发环境默认 <项目根>/.data）
# PORT=3000               # HTTP 服务端口，默认 3000
# SN_HOST=127.0.0.1       # 服务监听地址，默认仅监听本机 127.0.0.1
# SN_BACKUP_ENDPOINT=     # 远端备份服务地址，不填则关闭备份同步
```

### 关键约束

1. **没有 `DATABASE_URL`**：数据库为本地 SQLite，位置由 `src/lib/dataDir.ts` 动态解析推导，应用代码与 Prisma CLI 共享同一套路径解析逻辑，避免两端库路径错位。
2. **没有 `AI_API_KEY` 环境变量**：所有 AI 鉴权凭据统一持久化于 `<数据目录>/secrets.json`，由用户在界面设置浮卡中配置，不通过环境变量传递，杜绝凭据随代码或环境泄漏。
3. **前缀隔离**：仅 `NEXT_PUBLIC_` 前缀的变量会编译进入前端客户端包，严禁将私密配置附加该前缀。

## 4. Storage

系统持久化资源拓扑：

* **开发环境**：存储收敛于 `<项目根>/.data/`（已被 `.gitignore` 完整忽略）。
* **生产环境**：默认解析至当前用户主目录 `~/.shadow-narrative`。
* **自定义路径**：启动时通过 `SN_DATA_DIR` 环境变量覆盖。
* 原图持久化于 `<数据目录>/photos/<id>.<ext>`，由浏览器预生成的缩略图持久化于 `<数据目录>/photos/<id>.thumb.webp`。

## 5. Database

技术选型：

**SQLite + Prisma 7 (@prisma/adapter-better-sqlite3)**

* 本地单文件存储，零运维成本。
* 通过 `better-sqlite3` 原生驱动实现高吞吐读写。
* Prisma Client 在应用启动时以 Driver Adapter 模式挂载单例实例。

## 6. Deployment

核心交付模式：

* **本地自托管（Primary Target）**：以 Node.js Standalone 模式独立运行，或封装为自托管系统守护进程。详见 `17-SELF_HOSTING.md`。
* **私有 VPS 部署**：在 Linux / Windows 服务器上直接以 Node 服务运行，配合反向代理提供访问。

## 7. CI Pipeline

持续集成（CI）阶段标准检查链：

```text
npm ci
npm run lint
npm run typecheck
npm run build
```

## 8. Production Checklist

- 数据目录物理路径及写入权限确认（`SN_DATA_DIR`）
- SQLite 数据库完成迁移（`npm run db:deploy`）
- `secrets.json` 设置 0600 文件安全读写权限
- AI 接口凭据在设置面板中完成注入校验
- 监听地址安全防护（默认 `SN_HOST=127.0.0.1`，仅对受信环境开放局域网绑定）
