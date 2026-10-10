# Shadow Narrative — Implementation Plan / Agent Runbook

## 总原则

按 Round 执行。**每轮完成后先运行、检查，再进入下一轮。**

不要一次性实现全部产品。

**进度**：Round 0–4、7、10 已完成（见各标题的 ✅）。下一步是 Round 5。

Round 10 是**提前**做的 —— 它是 Round 5/6/7/8/9 的地基（那几轮全都写在新 schema
上，照原顺序做会让每一轮都建在错的数据模型上）。Round 7 跟在它后面一起做了。

## Round 0 — Design & Technical Recon ✅

产出架构、设计、粒子方案三份决策文档。已完成。

## Round 1 — Foundation ✅

Next.js 16 + React 19 + TS strict + Tailwind 4 + 设计 token + 目录骨架。已完成。

## Round 2 — Particle Engine ✅

采样、Hilbert 对应关系、着色器、指针场、性能档位。
`/dev/particle` 调试台。已完成。

## Round 3 — Morph + 首页 ✅

原地滑动转场、OrbitControls 旋转、粒子厚度、首页版式、控制面板。
已完成。

---

## Round 4 — 原图 ⇄ 粒子 ✅

这是新架构的第一个改动：现在只有粒子，需要先有「原图」这一层。

完成：

- 贴图四边形渲染（原图）
- 双模式共存与交叉切换（`16-ALBUM_SPACE.md` §8）
- 手动切换入口
- GSAP 引入与缓动换算（`16-ALBUM_SPACE.md` §11.2）
- 原图模式关闭旋转；切回时相机平滑转正（§8.5）

验收：

- 进入照片默认是**清晰的原图**，不是粒子
- 按钮文案是「Into this moment」
- 点击后波前**从中心**向外扩散，1200ms 内完成
- **同一时刻同一位置只显示照片或粒子中的一种** —— 没有交叉淡入淡出
- 切换可逆、可打断

实测（第一版用噪声溶解 + 交叉淡入淡出，被用户否掉后改为中心扩散）：
`uDissolve` 一个数同时驱动四边形 discard 与粒子出现，两者数学上互补，
不存在对不齐的可能。

## Round 5 — Album（第一屏）✅ 2026-10-10 完成，但形态与计划不同

> **做完了，但三处不是按原计划做的。** 记在这里，免得以后有人对着
> 下面那份「完成」清单找不存在的代码。

**落实情况：**

| 原计划的「完成」 | 实际 |
|---|---|
| 斜轴排布（`§2`） | ❌ **换成 React Bits 的 AccordionGallery**（一列并排、当前那张展开）。用户当天定的 |
| 沿轴导航（拖拽 / 滚轮 / 方向键） | ❌ 随之改成手风琴的 hover / 点击 / 方向键 |
| 焦点判定与视觉强调 | ✅ 展开的那张就是焦点，且有明确强调（§3.2 要的「一眼看出是哪张」） |
| 边缘粒子化 + 焦点窗口（`§2.3`/`§2.4`） | ❌ **一整条作废** —— 用户拍板「相册不要粒子效果」 |
| 点击进入的镜头（`§11.3`） | ✅ 点展开的那张 → 从它在屏幕上的位置飞进照片页（FLIP）。见 `16 §11.5` |
| 运行时调参入口 | ❌ 随斜轴一起删掉了（手风琴的参数有合理默认值，不必现场收敛） |

**验收：**

- ✅ 不是平铺网格
- ✅ 收起的那张有明确景深（更小、更暗、**模糊**）
- ➖ 「40 张时粒子总数不随张数增长」—— 随粒子一起作废
- ✅ 焦点在哪张无歧义

**新增的、计划里没有的：**

- `/` 的含义改写：**不带 `?photo=` 是相册，带 `?photo=<id>` 是 Photo View**
- `services/albumService.ts`：首屏取哪几张的规则（固定量、优先收藏、装不下给「看全部」）
- 收藏入口（原计划在 Library 抽屉里，那个抽屉作废了）
- 空态与上传入口（`§4`/`§5`）

**没做完 / 留给后面的：**

- **「看全部」暂时指向 `/timeline`** —— 用户说「memorys 板块还没做，
  以后准备做成全部照片库」。那个板块做出来之后这里改指它
- **缩略图 —— 2026-10-10 已补。** 原先 `thumbnailKey` 从没生成过，
  首屏加载的是原图。现在改由**客户端生成、服务端校验落盘**（`08 §6`），
  相册 / 时间线 / 飞行图三处都换过去了。
  ⚠️ **已有照片不回填**，走 `/thumbnail` 的回落分支（行为与改动前一致）
- `albumService` 的 `SCAN_LIMIT = 400` —— 照片库变大前要改成游标分页

## Round 6 — Library 抽屉 ❌ 已作废

**不要做这一轮。** 用户 2026-10-10 定了**时间线**取代 Library，不并存；
时间线本身已经实现（见 `16 §1`、`08 §17`）。

原先列的四件事，去向：

| 原计划 | 去向 |
|---|---|
| 左侧滑出 | 作废。时间线是并列的空间，不是抽屉 |
| 按时间分组的列表 | **被时间线取代**，但形态不同 —— 按天挂在中央脊柱上，不是列表 |
| 收藏切换 | **已搬到 Photo View 的日期那一行**（`16 §7.1`）。它是斜轴相册的内容源，所以是 Round 5 的前置 —— 2026-10-10 已做 |
| 搜索 | **悬空**。照片变多之前不阻塞，但不能忘 |

## Round 7 — 上传与字幕 ✅

完成：

- 上传链路（`08-DATA_API_SPEC.md` §6）
- 异步 AI 触发与轮询送达（§10）
- 字幕渲染（`09-AI_SPEC.md` §21）
- 自动分析开关

验收：

- 上传后立刻看到原图，不等网络
- 字幕在 AI 返回后浮现，不打断操作
- 字幕最多两句
- **看不懂时会提问**，不会说空话

## Round 8 — 对话与日志

完成：

- Conversation 展开/收起
- 消息流（不用气泡）
- 日志生成（用户主动触发）
- 日志阅读态

验收：

- 不像普通 ChatGPT
- 对话不改变显示模式
- 日志**不会自动生成**

## Round 9 — 收藏与分组

完成：

- 收藏（照片级）
- 分组创建、加入、移出
- Memory Theater

验收：

- 收藏后出现在斜轴
- 删除分组**不删照片**

## Round 10 — SQLite 迁移与自托管 ✅

完成：

- PostgreSQL → SQLite 迁移（`08-DATA_API_SPEC.md` §2）
- 新的照片为主 schema
- 数据目录与 `SN_DATA_DIR`（`17-SELF_HOSTING.md` §3）
- `npm run setup` 首次运行流程
- AI 凭据放到本机

验收：

- 从零跑通：clone → install → setup → start → 打开就能用
- 数据全部落在数据目录里
- 不需要装任何数据库服务

实测（2026-10-09）：`npm run setup` 端到端跑通（建目录 → `migrate deploy` →
生成 `secrets.json` 模板 → 打印地址），可重复执行。重启 dev server 后照片、
`aiState`、字幕全在，确认落的是 `.data/shadow-narrative.db` 而不是内存。
**「从零 clone」这条没有真正做过**（工作区一直是脏的），做 Round 12 时补一次。

## Round 11 — 备份

完成：

- 协议客户端（`18-BACKUP_PROTOCOL.md` §8）
- 手动触发 + 可选自动
- 恢复流程（导入到新目录）

验收：

- 同一张照片重复备份只传一次
- 恢复之后数据完整
- 备份入口处**明确写出「后端能读到内容」**

## Round 12 — Mobile + Performance + Polish

完成：

- 移动端交互（`07-UI_PAGE_SPECS.md` §9）
- 性能档位适配到新场景（`15-DEVICE_ADAPTATION.md`）
- 无障碍完整过一遍
- 视觉打磨

验收：

- 移动端不是桌面缩小
- Low 档下相册退化为纯贴图仍可用
- 键盘可完成全部主流程

---

## Round 13 — 桌面封装（Electron）

用户 2026-10-10 定的交付形态：**独立的桌面 app**，不是「起个服务、用浏览器打开」。
但**先做内容**，封装放到后面 —— 这一轮提前立在这里，是为了让前面每一轮都不挡它的路。

### 前提已经实测过了（2026-10-10）

封装的做法是：Electron 主进程把 Next 的 standalone 服务器**当子进程起**，
`BrowserWindow` 指向它。所以「standalone 产物跑不跑得起来」就是分水岭：

- ✅ `output: "standalone"` 已常开（`next.config.ts`），`.next/standalone/` 能起
- ✅ **原生模块被正确追踪** —— 这是最容易翻车的地方，而我们的 `better-sqlite3`
  在**嵌套路径**下：`.next/standalone/node_modules/@prisma/adapter-better-sqlite3/node_modules/better-sqlite3/build/Release/better_sqlite3.node`
- ✅ 实测 `SN_DATA_DIR=... PORT=3111 node server.js` 起得来，`/api/timeline` 返回真实数据

### ⚠️ `HOSTNAME=127.0.0.1` 必须显式设置

**实测：standalone 服务器默认绑 `0.0.0.0`**（日志里 `Network: http://0.0.0.0:PORT`）。

这是**安全相关**的：默认开着，应用一启动整个照片库就暴露在同网段，
而本产品**没有任何鉴权**（`17 §6`）。加上 `HOSTNAME=127.0.0.1` 之后
Local 与 Network 都是 127.0.0.1（已验证）。

**Electron 起子进程时必须带这个环境变量。**

### 已知的坑（来自同技术栈的真实项目）

参考 [OmniRoute 的 Electron 指南](https://github.com/diegosouzapw/OmniRoute)
（它用的就是 `better-sqlite3`）：

- 服务器要用 **Electron 自带的 Node** 跑 —— `spawn(process.execPath, ...)` 加
  `ELECTRON_RUN_AS_NODE=1`。否则原生模块的 ABI 和系统 Node 对不上，
  直接 `ERR_DLOPEN_FAILED`
- Electron 大版本升级后报 `Cannot find module 'better-sqlite3'` → `npm rebuild`
- 冒烟测试：起打包后的二进制，探测一个路由返回 200，然后退出

### 要做的事

1. **`dataDir.ts` 加打包分支** —— Electron 下用 `app.getPath('userData')`，
   不再回落到 `process.cwd()`
2. 新增 `electron/` 工作区（main / preload / electron-builder 配置）
3. **打包时把 `.next/static` 与 `public` 复制进 standalone 目录** ——
   Next 不会自动做，不复制的话静态资源全 404
4. **`.env.local` 不会进 standalone 产物** —— 环境变量要由启动器传
5. **重写 `17-SELF_HOSTING.md` §1** —— 它现在写的是「用浏览器访问」，和这个决定冲突
6. 手机怎么办要单独决定：桌面 app 装到电脑上，手机上就看不到了，
   而后端是哑存储（`18 §2`），没法直接给手机渲染界面

### 封装友好约束（前面每一轮都要守）

这几条**现在就是对的，别破坏它们**：

1. **路径一律经 `src/lib/dataDir.ts`**，不要出现 `process.cwd()` 或绝对路径
2. **客户端不许有硬编码的服务地址或端口** —— 一律相对路径 `/api/...`
   （现在全项目没有一处 `localhost:`）
3. **原生模块不要随手加**。每多一个，封装就多一份 ABI 重编译的风险。
   加之前在 `next.config.ts` 的 `serverExternalPackages` 里显式登记
4. **端口的唯一来源是 `PORT` 环境变量**，不写死
5. 新增路由/页面后，**构建一次确认 `.next/standalone` 仍然起得来**

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
