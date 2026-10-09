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

初始化脚本：`scripts/setup-db.sql`

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

## 7. 环境验证结果

| 检查项 | 结果 |
|---|---|
| `npm run dev` 启动 | 待验证（见 §8） |
| `npm run build` | ✅ 通过 |
| `npm run lint` | ✅ 通过 |
| `npm run typecheck` | ✅ 通过 |
| 数据库连接 | ⏳ 待 `scripts/setup-db.sql` 执行后验证 |
| Chrome 指定独显 | ⏳ 需人工在 NVIDIA 控制面板设置 |

## 8. 待人工确认

1. 执行 `scripts/setup-db.sql` 建库建角色
2. NVIDIA 控制面板把 Chrome/Edge 指定为独显
3. `npm run dev` 后浏览器打开 `localhost:3000` 确认页面正常
