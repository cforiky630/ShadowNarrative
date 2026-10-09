# Shadow Narrative — 交接文档

> 写于 2026-10-09，同日更新（数据层迁移 + AI 字幕完成后重写）。
> 面向**新开窗口的 Claude**，目标是让新会话不必重新发现任何东西。
>
> 先读这份，再读 `shadow-narrative-docs/`。

---

## 0. 最重要的一件事：文档与代码现在同步了

上一版这份文档的第一句话是「规格文档已全部改写，代码还停在旧架构上」。

**那个缺口已经补上。** 数据层迁移（Round 10）与 AI 字幕（Round 7）都做完了，
代码现在跑在 `08-DATA_API_SPEC.md` 定的架构上。

| | 文档 | 代码 |
|---|---|---|
| 数据模型 | 照片是主实体，Memory 是可选的相册式分组 | ✅ 一致 |
| 存储 | SQLite | ✅ 一致 |
| 第一屏 | 照片 + 字幕 | ✅ 一致（斜轴相册还没做） |
| AI | 有完整规格（`09`） | ✅ 上传即分析 + 字幕 |

**仍然不一致的地方**（做之前先确认改哪一层）：

- `18-BACKUP_PROTOCOL.md` 的备份客户端**尚未实现**（Round 11）。文档已按端到端加密改写，代码没有
- 斜轴相册、Library 抽屉（Round 5/6）、对话展开与日志（Round 8）、分组（Round 9）都只有文档

---

## 1. 项目是什么

Shadow Narrative —— 单人、私有的沉浸式数字记忆产品。照片 → 沙粒一样的粒子 →
可 3D 旋转 → AI 在照片下方说一句话。

不是一个相册网站，不是 ChatGPT 套壳，不商业化。核心感受是「我进入了自己的记忆，
而不是打开了一个网站」。

---

## 2. 怎么跑起来

### 你自己的终端

```bash
npm install
npm run setup        # 建数据目录、跑迁移、生成 secrets.json 模板
npm run dev          # http://localhost:3000
```

`npm run setup` 是幂等的，可以重复跑。

### 在 Claude 桌面应用里（有坑）

**坑一：`%APPDATA%` 被容器重定向。**

在 Claude 容器里 `%APPDATA%` 被虚拟化到 `C:\WpSystem\...`，Next 写全局配置时用
「临时文件 + 原子 rename」，跨重定向边界失败并报 `EXDEV`，dev server 直接崩。

绕行脚本已写好：`scripts/dev-claude-preview.cmd`（把 APPDATA 指到普通目录）。
`.claude/launch.json` 已配好，用预览功能会自动走它。
`autoPort: true` 也开了 —— 多个会话同时预览时自动换端口，不会互相顶掉。

**坑二（更隐蔽）：窗口不可见时浏览器不出帧。**

这不是代码问题，但它伪装成过五种完全不同的症状：

- CSS 过渡卡在起点不动
- `requestAnimationFrame` 停摆
- debug overlay 显示 2 fps
- 页面停在 Suspense fallback，`window.__snEngine` 拿不到
- **截图里 WebGL 画布是黑的，但同一时刻 debug overlay 显示 240 fps、
  `gl.isContextLost()` 为 false、图片请求 200** —— 这是合成层没被采进截图，
  不是渲染失败。**再截一次往往就有了**（这一条是 2026-10-09 实测的）

第四种最坑：React 的流式内容揭示脚本 `$RC()` 靠 rAF 执行，窗口最小化时它不跑，
于是 DOM 里只有 fallback。**服务器是好的**（`curl` 能拿到完整 HTML），是浏览器不出帧。

**遇到「代码看起来没问题但行为诡异」，先确认窗口是不是最小化了，
以及是不是只是截图没采到。**

### 数据库

**SQLite，一个文件，不需要装任何数据库服务。**

```text
<数据目录>/shadow-narrative.db
```

数据目录的位置由 `src/lib/dataDir.ts` 推导，**这是唯一来源**：

```text
SN_DATA_DIR  →  否则生产用 ~/.shadow-narrative  →  否则开发用 <项目根>/.data
```

`prisma.config.ts` 和 `src/lib/prisma.ts` 都调用同一个函数 —— 两边推导不一致会让
migrate 写进一个库、应用读另一个库，而且不会报错。

本机那个 PostgreSQL 服务**应用已经完全不依赖了**（依赖、`DATABASE_URL`、旧迁移全清掉了）。

---

## 3. 已实现 / 未实现

### ✅ 已实现

| 模块 | 文件 | 说明 |
|---|---|---|
| 粒子引擎 | `src/engine/particle/` | 采样、Hilbert 对应、着色器、指针场、档位 |
| 性能自适应 | `PerformanceTier.ts` | L1 静态 + L2 微基准 + L3 运行时（只降不升） |
| 原图 ⇄ 粒子 | `shaders/quad.ts`、`dissolve.ts` | 从中心向外扩散的溶解 + 专注推近 |
| 3D 旋转 | `ParticleSystem` 的 OrbitControls | 只在粒子模式开放，粒子有 z 厚度 |
| 控制面板 | `ParticleControls.tsx` | 八个参数 + 四个预设 |
| 照片 CRUD | `services/photoService.ts`、`api/photos/**` | 五道校验、游标分页、两阶段删除 |
| **AI 字幕** | `services/aiService.ts`、`components/Subtitle.tsx` | 上传即异步分析，字幕浮在照片下方 |
| **SQLite 数据层** | `prisma/schema.prisma`、`lib/dataDir.ts` | 照片为主实体，多用户结构保留 |

实测：150k 粒子 / fps 240 / frame 4.2ms / draw calls 1–2（RTX 3060）。
AI 单次调用实测 330–600ms（`effort: low`）。

### ❌ 未实现

- **斜轴相册、Library 抽屉**（`16` 有完整规格）—— 下一批
- 对话展开与日志生成（Round 8）
- 收藏与分组（Round 9）
- 备份客户端与端到端加密（Round 11；`18` 只有协议）
- 缩略图生成（依赖未建的 Python 图像服务）
- 移动端、`SN_HOST` 相关的局域网形态
- **自动分析开关的界面入口** —— `UserSettings.autoAnalyze` 已落库、
  `/api/photos/:id/analyze` 也已实现，但设置页还没有（Round 7 的「自动分析开关」验收项只差 UI）

---

## 4. 规格文档

`shadow-narrative-docs/` 下 19 份，**必须按 `MANIFEST.md` 的顺序读**。
最重要的是：

| 文档 | 什么时候看 |
|---|---|
| `00-MASTER_README.md` | 先读。愿景锚点 + 禁止漂移清单 + 强制读取顺序 |
| `16-ALBUM_SPACE.md` | 做界面时。斜轴相册、原图⇄粒子、镜头编排 |
| `09-AI_SPEC.md` | 做 AI 时。含「永不沉默但不说空话」的判定标准 |
| `08-DATA_API_SPEC.md` | 改数据时。schema 与 API 契约 |
| `10-IMPLEMENTATION_PLAN.md` | 确认当前在哪个 Round |
| `18-BACKUP_PROTOCOL.md` | 做备份时。**§11 是端到端加密，2026-10-09 反转的** |
| `recon/environment.md` | 环境出问题时。所有已踩的坑都在里面 |

---

## 5. 下一步

Round 7 的代码部分已完成，Round 10 提前做完了。`10-IMPLEMENTATION_PLAN.md` 里
**Round 5（斜轴相册）和 Round 6（Library 抽屉）**是自然的下一批 —— 它们都只差界面，
数据层已经就位（`GET /api/photos?favorite=true`、游标分页都在）。

### 还欠用户一个答复的

- **设置页还没有**。`autoAnalyze` 能改（`userService.setAutoAnalyze`），但没有 UI。
  `09 §21.2` 要求用户「知道自己是什么时候把照片发出去的」，这需要界面 —— 也是 Round 7 的验收项之一
- 备份后端到底是谁的？用户说过「同步到**我的**后端存储」。
  `18 §11` 假设后端管理员就是用户自己；多用户共享后端 + 端到端加密解决了隐私问题，
  但**谁来跑那个后端**还没定。Round 11 前要明确

### 做 AI 时别丢的判定标准

提示词在 **`src/services/aiPrompt.ts`**（2026-10-09 从 `aiService.ts` 抽出来的）。
单独成文件是为了能脱离服务层试验 —— `.data/subtitle-experiment.mjs` 直接 import 它，
所以「调试用的提示词」和「线上跑的」不会各改各的。

**「永不沉默」不等于「可以说废话」。** 空话的特征是**对每张照片都成立**。

但光有这一条会滑向另一个坑：**图注**。只说看得见的东西（"爪子举起来了。
广角把鼻子拉大了"），准确，但和这张照片没有关系 —— 换个相似的构图它照样成立。
所以真正的机制是**往前一步**：

> 说一句你确实看见的，然后给出一个解释 —— 说**它像什么、像在做什么**。

```
举起的手停在那里，一直没有落下    →  那只爪子举在半空，像打招呼，也像拦住你
四行都叫同一个名字，副标题各说各话  →  像是给同一个名字套了很多件衣服
```

用「像」「大概」「也许」「是不是」把解释标成解释，`09 §6` 的证据模型就守得住
—— 透了进去，但没有编造。

**AI 可以有轻微的人味**（`09 §2`，2026-10-09 调整）。这是用户明确要求的：
AI 可以说自己当下的反应（"这一下我笑了一下"、"我一时没分清它是在打招呼还是在警告"），
否则它只是个旁白。但放开的是**当下的反应**，不是**持久的人设** ——
不编造经历、不假装有生活、不制造依赖。`09 §2` 有一张表划清了这条线。

`09 §21.4` 有正反例对照表，§21.7 有语气对照表。改 prompt 时别丢。

**改完 prompt 一定要跑一遍样例**（`node .data/subtitle-experiment.mjs`）——
语气这种东西没法靠读 prompt 判断，只能看输出。注意它会走真实的 API 计费。

---

## 6. 踩过的坑（别重蹈）

上一版列的七条仍然有效（原图上下颠倒、`@import` 顺序、窗口不出帧、密度滑块、
粒子出现阈值、`.cmd` 只写 ASCII、StrictMode 图片不加载、隐藏时别采样档位）。
以下是**这一轮新增**的：

| 坑 | 根因 |
|---|---|
| `better-sqlite3` 装完没有二进制 | `package.json` 的 `allowScripts` 会**静默拦掉**安装脚本。装完要 `npm rebuild better-sqlite3` 才会真正下载预编译产物。`node_modules` 里没有 `build/Release/*.node` 就是没装成 |
| `file:/F:/...` 打不开数据库 | Windows 盘符前**多补了一个斜杠**，报 os error 123「文件名、目录名或卷标语法不正确」。正确形式是 `file:F:/...`（POSIX 的 `file:/home/...` 才对）。见 `dataDir.ts` 的 `resolveDatabaseUrl` |
| 改完 schema 但类型全是旧的 | Prisma 7 的 `migrate dev` **不会**自动重新生成 client。要单独跑 `npx prisma generate` |
| 删了路由但 tsc 报找不到模块 | `.next/types/validator.ts` 是生成物，留着旧路由的引用。跑 `npx next typegen` 重新生成 |
| 构建警告「Dynamic filesystem access」 | Turbopack 静态分析看到动态 `path.join` 基路径就以为要追踪整个项目。数据目录**本来就该是动态的**（`SN_DATA_DIR`），加 `/*turbopackIgnore: true*/` 是正解，不要为了消警告去改路径逻辑 |
| **手动重试永远失败** | 超时扫描比对的是 `createdAt`，而重试不会重置它 —— 老照片一重试就被立刻判超时。**必须比 `updatedAt`**（`resetAnalysisState` 会触发 `@updatedAt`），语义是「上次有进展是什么时候」 |
| AI 返回的 JSON 总是被截断 | `deepseek-flash` 的 `effort` 默认 `high`，**reasoning token 也计入 `max_tokens`**。实测 max_tokens=900 时 852 个被推理吃掉，`finish_reason: "length"`，JSON 断在中间。必须显式传 `effort: "low"` 且把 max_tokens 给到 4000 |
| 中文行宽用 `ch` 不对 | `ch` 是数字 0 的宽度，一个汉字约合 2ch，`max-w-[34ch]` 实际一行只放得下 17 个字。中文用 `em` |

---

## 7. 几条硬约束（都在文档里，这里再强调）

1. **粒子引擎不用 React Three Fiber**（`05 §18`）。粒子是自研 rAF 循环，React 不参与渲染路径
2. **GSAP 只管镜头编排，Motion 只管 UI 微交互**，两者共用同一套缓动 token
   （`16 §11.2`，缓动是**运行时从 CSS 变量读**的，不是抄数字）
3. **删除是先删文件再删记录**，顺序不可交换（`08 §16`）
4. **AI 不自动写日志**，日志必须用户主动触发（`01 §9`）
5. **「翻开这一天」是单向的**，不做双向切换开关（`16 §8.4`）
6. **不能让人感觉是切换页面**（`16 §8.6`）—— 这是产品最核心的主张
7. **userId 只能由服务端解析**，绝不从请求里读（`12 §4`）。唯一解析点是
   `userService.getLocalUserId()`
8. **`src/services/*` 不得 import `next/server`、`next/headers`、React**。
   框架 API（`after()`、`revalidatePath`）只出现在 route handler 里 ——
   这条是为了将来能把服务层整体挪到独立进程时不改函数体

### 关于「要不要拆独立后端服务」

已经评估过，结论是**不拆**：`05 §7` 定的运行时是「浏览器 → Next.js Route Handlers →
Prisma / DeepSeek / Python」，Route Handlers 就是后端；`18 §1` 还明确把
「服务端解析」「服务端 AI」列为非目标。

唯一真正会独立的是 **Python 图像服务**（`05 §7`），独立原因是 `pillow-heif` /
`rawpy` 在 Node 侧没有对等物 —— 技术原因，不是架构选择。它由 Node 服务端调用，
不改变前后端形状。

---

## 8. 当前仓库状态

```
src/                     31 个源文件
shadow-narrative-docs/   19 份规格 + recon/
prisma/                  schema + 一份 SQLite init 迁移
scripts/                 setup.mjs + 环境脚本 + Hilbert 自检
.data/                   shadow-narrative.db + photos/（已 gitignore）
```

**自检脚本**：`node scripts/verify-hilbert.mjs` —— 验证 A→B 对应关系。
改动 Hilbert 或采样后必须跑一遍。

**凭据**：AI key 存在 `<数据目录>/secrets.json`（`17 §4`），
开发期也可以放 `.env.local` 的 `AI_API_KEY`（**secrets.json 的非空值优先**）。
两处都在 gitignore 之外/之内，但**都不能进 git、不能进日志**。

**`.data/uploads/`** 里还留着迁移前的 4 张测试照片，应用已经不再读这个目录
（现在读写的是 `.data/photos/`）。用户要求保留文件，没删。
