# Shadow Narrative — Self-Hosting

本文档定义 Shadow Narrative 交付给最终用户的形态。

## 1. 形态

**一个跑在用户自己机器上的 Node 服务，用浏览器访问。**

```text
用户机器
├── Node 服务（Next.js，本地端口）
│   └── http://localhost:3000
├── 数据目录
│   ├── shadow-narrative.db       SQLite
│   └── photos/                   照片文件
└── 浏览器（访问 localhost）
```

用户不需要装数据库服务、不需要 Docker、不需要账号。

## 2. 为什么是自托管

| 原因 | 说明 |
|---|---|
| **隐私** | 照片和文字全程不出这台机器 |
| **零成本** | 没有服务器账单，没有账号体系要维护 |
| **零配置** | SQLite 一个文件，没有要装要配要常驻的数据库服务 |

### 代价（必须承认）

| 代价 | 缓解 |
|---|---|
| 用户要装 Node | `17 §5` 的首次运行流程压到三步；以后可加 Docker 镜像 |
| 跨设备不方便 | 靠**备份 + 恢复**（`18-BACKUP_PROTOCOL.md`），不做实时同步 |
| 没有自动更新 | 手动拉新版本、跑迁移 |
| AI 需要用户自己的 key | 这是必然的 —— 见 §4 |

## 3. 数据目录

```text
<数据目录>/
├── shadow-narrative.db       SQLite 主库
├── photos/                   原图
│   └── <uuid>.<ext>
├── backup-state.json         备份游标与远程映射（见 18 §6）
└── secrets.json              AI key / 备份令牌 / 端到端加密密钥（0600 权限）
```

### 位置

| 场景 | 路径 |
|---|---|
| 开发 | 项目根目录下的 `.data/` |
| 自托管运行 | 由环境变量 `SN_DATA_DIR` 指定，默认 `<用户主目录>/.shadow-narrative/` |

**整个目录可以整体打包搬走** —— 这是最朴素也最可靠的迁移与备份方式，
不依赖任何协议。`18-BACKUP_PROTOCOL.md` 解决的是"增量上云"，不是"换机器"。

### 权限

`secrets.json` 必须只在用户可读（Unix `0600`）。Windows 上依赖用户目录的默认 ACL。

## 4. AI 凭据

**每个用户用自己的 DeepSeek API key。**

这在本架构下是必然的：
- 服务端就是用户的机器，不存在"平台替你付钱"的模式
- 也没有中间方能看到你的 key

配置入口：设置页 → AI → 填入 key。存进 `secrets.json`，不进数据库、不进日志。

> 与 `12-SECURITY_PRIVACY.md` §10 一致：日志不得记录 key。

## 5. 首次运行

```bash
git clone <repo>
cd shadow-narrative
npm install
npm run setup      # 建数据目录、跑迁移、生成初始配置
npm start
```

然后浏览器打开 `http://localhost:3000`。

`npm run setup` 需要做的事：

```text
1. 解析 SN_DATA_DIR（未设置则用默认位置）
2. 创建目录结构
3. 执行 prisma migrate deploy
4. 若无 secrets.json，生成模板
5. 打印数据目录位置与访问地址
```

## 6. 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `SN_DATA_DIR` | `~/.shadow-narrative` | 数据目录 |
| `PORT` | `3000` | 监听端口 |
| `SN_HOST` | `127.0.0.1` | 监听地址 |
| `SN_BACKUP_ENDPOINT` | 空 | 备份后端地址，不填则禁用备份 |
| `NODE_ENV` | `production` | — |

### 关于 `SN_HOST`

**默认只监听 `127.0.0.1`。** 改成 `0.0.0.0` 等于把整个照片库暴露在局域网上，
而本产品**没有任何鉴权**（单用户自托管，登录只用于备份）。

文档和界面都不主动引导用户去改它。真要局域网访问，那是用户自己的决定，
必须自己承担风险 —— 设置页里要把这句话写出来。

## 7. 数据库迁移

用 Prisma migrate。

```bash
npm run db:migrate      # 开发：migrate dev
npm run db:deploy       # 自托管运行：migrate deploy
```

**迁移文件必须入库。** 用户升级时只跑 `db:deploy`，不重新生成。

破坏性迁移（删列、改类型）必须带数据搬迁脚本，不能只写 DDL。

## 8. 备份与恢复

两种，用途不同：

| 方式 | 用途 | 说明 |
|---|---|---|
| **整目录打包** | 换机器、灾难恢复 | 停服务 → 打包 `SN_DATA_DIR` → 新机器解压。不需要协议 |
| **增量上云** | 日常备份到自己的后端 | 见 `18-BACKUP_PROTOCOL.md` |

整目录打包是**最后一道保险**，任何情况下都成立，不依赖代码是否正确。

## 9. 与 13-DEPLOYMENT 的关系

| 文档 | 管什么 |
|---|---|
| `13-DEPLOYMENT.md` | **开发环境**：本机开发、CI、构建 |
| 本文档 | **交付形态**：用户拿到手之后怎么跑 |

13 里关于云托管平台（Vercel / Cloudflare）的部分对自托管形态不适用，
保留是因为它仍然描述了"部署一个 Next.js 应用"的通用知识。
两处冲突时以本文档为准。
