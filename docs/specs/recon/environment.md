# Shadow Narrative — 开发环境记录

> 实测时间：2026-10-09
> 本文件记录**实际环境**，与 `13-DEPLOYMENT.md`（规格）区分开。

## 1. 操作系统与工具链

| 项 | 实测值 |
|---|---|
| OS | Windows 11 Pro，build 26300 |
| Node.js | v24.18.0 |
| npm | 12.0.2 |
| pnpm / yarn | **未安装**（用 npm） |
| Docker | **未安装** |
| git | 2.55.0.windows.3 |
| Python | 未在 PATH（不影响本项目） |

## 2. 数据库

| 项 | 实测值 |
|---|---|
| PostgreSQL | **18.6** |
| 安装路径 | `E:\PostgreSQL\18\` |
| Windows 服务 | `postgresql-x64-18`（运行中） |
| 监听 | `0.0.0.0:5432` |
| 认证方式 | `scram-sha-256`（全部连接，含 localhost） |
| psql | `E:\PostgreSQL\18\bin\psql.exe`（**不在 PATH**） |
| 项目库 | `shadow_narrative`，owner `shadow_narrative` |
| 编码 / 时区 | UTF8 / Asia/Shanghai |
| 角色权限 | `LOGIN` + **`CREATEDB`**（Prisma migrate 需要建影子库，见 §6.6） |
| 监听范围 | ⚠️ `0.0.0.0:5432`（**监听所有网卡**，非仅 localhost） |

初始化脚本：`scripts/setup-db.sql`（用 `-v pw=<密码>` 传参，不含明文密码）

建表：`npx prisma migrate dev`。迁移文件在 `prisma/migrations/`。

### ⚠️ 安全提示：监听范围 + 弱密码

服务监听在 `0.0.0.0:5432`，即同一网络内任何机器都能尝试连接；而当前角色密码为
弱密码。本地单人开发可接受，但若要降低风险，推荐把监听收窄到本机：

```
# E:\PostgreSQL\18\data\postgresql.conf
listen_addresses = 'localhost'
```

改完重启 `postgresql-x64-18` 服务。这样即使密码简单，外部也无法连接。

## 3. 硬件

| 项 | 实测值 |
|---|---|
| CPU | Intel Core i7-12700H，14 核 / 20 线程 |
| RAM | 15.7 GB |
| 独显 | **NVIDIA GeForce RTX 3060 Laptop GPU**（4GB，驱动 32.0.16.1656） |
| 核显 | Intel Iris Xe Graphics（驱动 32.0.101.7088） |

⚠️ **混合显卡**：浏览器可能默认跑在 Iris Xe 上。跑粒子性能测试前，必须在
NVIDIA 控制面板 → 3D 设置 → 程序设置中，把 Chrome/Edge 指定为「高性能 NVIDIA 处理器」。
否则测出来的数据是核显的，没有参考价值。

## 4. 浏览器

| 浏览器 | 版本 | 定位 |
|---|---|---|
| Chrome | 155.0.8059.39 | **主目标** |
| Edge | 154.0.4258.62 | **主目标**（Chromium 同源） |
| Firefox | 未安装 | 尽力支持 |
| Safari / iOS Safari | 不适用 | **不背这个包**（见 `15-DEVICE_ADAPTATION.md`） |

## 5. 工程栈实测版本

```
next          16.4.0     （Turbopack，Cache Components 开启）
react         19.3.0
typescript    5.x        （strict）
tailwindcss   4.x        （CSS-first，@theme 配置）
three         0.186.1
postprocessing 6.39.5
zustand       5.0.15
motion        14.0.0
prisma        7.10.0     （仅安装，未落库）
@prisma/client 7.10.0
```

## 6. 已知环境坑

### 6.1 `%APPDATA%\nextjs-nodejs` 是重定向文件夹 → Next 构建报 EXDEV

**现象**：

```
Error: EXDEV: cross-device link not permitted, rename
'C:\Users\Administrator\AppData\Roaming\nextjs-nodejs\Config\config.json.549507444'
-> 'C:\Users\Administrator\AppData\Roaming\nextjs-nodejs\Config\config.json'
```

**原因**：`C:\Users\Administrator\AppData\Roaming\nextjs-nodejs` 是一个重定向目录
（reparse point），真实目标在 `C:\WpSystem\...\Packages\Claude_...\LocalCache\Roaming\`。
Next.js 写全局配置时用的是「临时文件 + 原子 rename」，跨重定向边界 rename 会返回 EXDEV。

**影响范围**：只在 Claude 桌面应用的沙箱环境内出现。在普通 PowerShell / cmd 里
直接跑 `npm run build` 不受影响。

**绕行**：把 `APPDATA` 指向一个普通目录即可。

```bash
APPDATA='C:\Users\Administrator\.cache\appdata' npm run build
```

**永久方案（可选，未执行）**：删除该重定向目录，让 Windows 重建为普通目录：

```powershell
Remove-Item "C:\Users\Administrator\AppData\Roaming\nextjs-nodejs" -Force -Recurse
```

### 6.2 npm 12 默认拦截 install scripts

npm 12 起，依赖的 install / postinstall 脚本默认被拦截，需要显式批准。本项目实测被拦截 3 个：

| 包 | 脚本 | 是否影响 |
|---|---|---|
| `unrs-resolver` | postinstall | **不影响** —— 实测 `npm run lint` 正常通过 |
| `prisma` | preinstall | 未落库阶段不影响 |
| `@prisma/engines` | postinstall | 未落库阶段不影响；**Round 6 启用 Prisma 前需批准** |

审查与批准：

```bash
npm install-scripts ls
npm install-scripts approve prisma @prisma/engines
```

### 6.3 `npm audit` 报 9 个 high 漏洞 —— 均不可利用

| 漏洞链 | 路径 | 判断 |
|---|---|---|
| `braces` ReDoS | `eslint-config-next` → `fast-glob` → `micromatch` → `braces` | 仅开发期 lint 工具 |
| `deepmerge-ts` 栈溢出 | `prisma` → `@prisma/config` | 仅 CLI，且需攻击者控制配置 |
| `mysql2` 凭据泄漏 / 解压炸弹 | `prisma` 内置 | **本项目用 PostgreSQL，该驱动永不加载** |

**不要跑 `npm audit fix --force`** —— 它会把 Prisma 降级到 6.x，是破坏性变更。

### 6.4 目录名含大写导致 create-next-app 无法原地初始化

`Shadow-Narrative` 含大写字母，npm 包名规范不允许。已采用的方案是脚手架建到
临时目录再合并。后续如需重建，同样处理。

**最终状态**：项目根目录已改为全小写的 `shadow-narrative`
（Windows 上大小写改名要两步走：先改成临时名，再改成目标名，
直接改会被当成「移动到自身的子目录」而失败）。

注意：**npm 只读 `package.json` 的 `name` 字段**，目录名不影响包的合法性，
只影响 `create-next-app` 这类工具的一次性校验。

### 6.5 `.cmd` 脚本必须是纯 ASCII

`scripts/dev-claude-preview.cmd` 第一版写了中文注释，结果 `cmd.exe` 在中文 Windows 上
按 OEM 代码页（GBK）读取 `.cmd`，UTF-8 的中文注释被拆错字节，**其中一部分被当成命令执行**，
报出一堆「不是内部或外部命令」，脚本整体跑飞。

**规则：`.cmd` / `.bat` 只写 ASCII 注释。** 需要中文说明就放在同目录的 `.md` 里。

### 6.6 Prisma 7 是破坏性版本，网上大部分示例都不能直接用

本项目用 Prisma **7.10.0**，与 6.x 的写法差异很大。踩到的三处：

**① `datasource` 不再接受 `url`**

```
Error code: P1012
The datasource property `url` is no longer supported in schema files.
```

连接串移到 `prisma.config.ts`，运行时则通过 driver adapter 传给 PrismaClient：

```ts
// prisma.config.ts
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";
config({ path: ".env.local" });   // Prisma 不自动读 .env.local
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

```ts
// src/lib/prisma.ts
new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
```

需要 `@prisma/adapter-pg` + `pg`，两者版本必须与 `prisma` 对齐。

**② migrate 需要建影子库的权限**

```
Error: P3014  Prisma Migrate could not create the shadow database.
```

`migrate dev` 会建一个临时库来校验迁移。应用角色默认没有建库权限，需要：

```sql
ALTER ROLE shadow_narrative CREATEDB;
```

**③ npm 12 会拦截 Prisma 的 install scripts**

同 §6.2。不批准的话引擎二进制不会下载，migrate 会失败：

```
npm install-scripts approve prisma @prisma/engines
```

### 6.7 Prisma 不读 `.env.local`

Prisma CLI 只自动加载 `.env`，而本项目统一用 `.env.local`（Next 也读它）。
为了不维护两份配置，`prisma.config.ts` 里显式 `config({ path: ".env.local" })`。

## 7. 环境验证结果

| 检查项 | 结果 |
|---|---|
| `npm run dev` 启动 | ✅ 通过（HTTP 200，`.env.local` 已加载） |
| `npm run build` | ✅ 通过 |
| `npm run lint` | ✅ 通过 |
| `npm run typecheck` | ✅ 通过 |
| 数据库连接 | ✅ 通过（以 `shadow_narrative` 角色连上，UTF8） |
| Chrome 指定独显 | ⏳ 需人工在 NVIDIA 控制面板设置 |

## 8. 待人工确认

1. NVIDIA 控制面板把 Chrome/Edge 指定为独显
2. 可选：把 PostgreSQL 监听收窄到 localhost（见 §2 安全提示）
