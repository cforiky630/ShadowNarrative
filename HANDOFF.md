# Shadow Narrative — 交接文档

> 写于 2026-10-09。**2026-10-10 大幅更新**：时间线、体验外壳（画布不随路由卸载）、
> 第一屏改成相册（React Bits 手风琴）、设置改成悬浮球、收藏入口、EXIF 拍摄时间、
> 对话（Round 8 前半）、缩略图、粒子手感（数量 / 尺寸 / 厚度 / 贴边 / 放大极限）、
> 左下角那颗胶囊（参数 | 设置）。
> 面向**新开窗口的 Claude**，目标是让新会话不必重新发现任何东西。
>
> 先读这份，再读 `shadow-narrative-docs/`。

---

## 0. 最重要的一件事：代码跑得比文档快

Round 5 / 7 / 10 都完成了，时间线也落地了。但这一轮改得很快，
**有几处代码已经和文档不一致 —— 做之前先确认改哪一层。**

| | 文档 | 代码 |
|---|---|---|
| 数据模型 | 照片是主实体 | ✅ 一致 |
| 存储 | SQLite | ✅ 一致 |
| 第一屏 | `01 §5` 的 Album | ✅ 是相册，但**形态**是 React Bits 手风琴（`16 §2.2` 已注明） |
| AI 字幕 | `09 §21` | ✅ 一致，**提示词冻结**（见 §5） |
| EXIF | `08 §6`「缺省时从 EXIF 读」 | ✅ 已实现（`08 §13` 补齐了三条纪律） |
| 对话 | `16 §9`、`08 §7` | ✅ 实现了，但**形态比文档细**（见下） |
| 随笔小记 | `16 §10` 叫它「日志」 | ❌ **只有文档，没实现**。而且**名字要改**（见下） |

**仍然不一致 / 还没有的地方：**

- **「日志」这个叫法要改成「随笔小记」**（用户 2026-10-10 定的，`16 §10`、`09 §12`/`§13`、
  `01 §5`、`10` 的 Round 8 都还写着「日志」）。**做那一半的时候一起改**，
  而且它是**轻**的东西 —— 不是长文日志
- **对话的形态文档里没写**：`16 §9` 只说「展开后出现在照片下方，不跳转」。
  实际是**全屏遮罩 + 实时模糊**、**入口只在粒子界面**（用户定的）。
  两处都该补进 `16 §9`
- `18` 的备份客户端未实现（Round 11）
- 分组（Round 9）、随笔小记、Memory Theater 都只有文档
- **搜索**悬空（原在 Library 抽屉里，那个抽屉作废了）

**Round 6（Library 抽屉）已作废** —— 时间线取代了它，不并存。
规格已同步（`01 §5`、`16 §1`/§6、`07`、`10`），`16 §6` 留成空壳不重编号。

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

**2026-10-10 补：怎么一眼判断，以及怎么办。**

会话里跑了十几次「代码是对的但读数全是鬼」的情况。判据是一行：

```js
document.visibilityState === 'visible' && document.querySelectorAll('main').length === 1
```

不满足就是**假象**：`hidden` + 两份 `<main>`（一份是没被 `$RC` 换掉的
Suspense fallback）说明拿到的是后台那份文档。别的症状：所有
`getBoundingClientRect()` 返回 0×0、`elementFromPoint` 到处返回同一个元素、
点击不生效、**`preview_eval` 和 `preview_screenshot` 看到的不是同一份文档**。

**处置：重启预览服务器**（`preview_stop` → `preview_start`）。
HMR 修不好这个，改代码更修不好 —— 这一轮我差点去改没坏的代码。
**每次跑读数之前先过一遍上面那个判据**，比事后怀疑自己省事得多。

（还有一种是**刚加载完就点**：页面还没 hydrate，`.click()` 什么都不会发生。
表现在读数上很像上面那种。多等一会儿，或者先确认元件带上了 React 的
事件处理再动手。）

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
| **AI 字幕** | `services/aiService.ts`、`components/Subtitle.tsx` | 上传即异步分析，字幕浮在照片下方。**提示词冻结，见 §5** |
| **EXIF 拍摄时间** | `services/mediaService.ts` | 上传时读，存进 `takenAt`（`08 §13` 有三条纪律：只 pick 日期字段、无时区、未来时间丢弃） |
| **SQLite 数据层** | `prisma/schema.prisma`、`lib/dataDir.ts` | 照片为主实体，多用户结构保留 |
| **设置** | `components/SettingsPanel.tsx` + `SettingsForm.tsx` | 左下角悬浮球，点开是浮卡（**不是页面**，2026-10-10 改）。自动分析开关 + 发送披露 + AI key（`07 §11`） |
| **相册（第一屏）** | `components/AlbumSpace.tsx` + React Bits 的 `AccordionGallery` | 手风琴；取哪几张由 `services/albumService.ts` 定（固定量、优先收藏、「看全部」） |
| **时间线** | `components/TimelineSpace.tsx`、`services/timelineService.ts` | 中央时间线、按天节点、iMessage 式叠放 + 网格画廊、可编辑主题名 |
| **体验外壳** | `components/ExperienceShell.tsx`、`app/(experience)/` | 画布的唯一所有者，路由切换时不卸载（`05 §6.1`） |
| **收藏** | `MemorySpace` 日期那一行的星 | lucide 的 `Star`，填充表示已收藏（`16 §7.1`） |
| **对话** | `components/ConversationPanel.tsx`、`api/photos/[id]/conversation/**` | Round 8 **前半**。入口只在粒子界面；全屏遮罩 + 实时模糊 |
| **缩略图** | `lib/makeThumbnail.ts`、`services/mediaService.ts`、`api/photos/[id]/thumbnail` | 2026-10-10。**浏览器生成、服务端校验落盘**（`08 §6`）。相册 / 时间线 / 飞行图走它；**画布与 AI 仍用原图** |

实测：150k 粒子 / fps 240 / frame 4.2ms / draw calls 1–2（RTX 3060）。
AI 单次调用实测 330–600ms（`effort: low`）。

### ❌ 未实现

- **随笔小记**（Round 8 **后半**；`16 §10` 还叫它「日志」，名字要改）
- **分组**（Round 9）
- 备份客户端与端到端加密（Round 11；`18` 只有协议）
- Memory Theater、移动端、`SN_HOST` 的局域网形态

---

## 4. 规格文档

`shadow-narrative-docs/` 下 19 份，**必须按 `MANIFEST.md` 的顺序读**。
最重要的是：

| 文档 | 什么时候看 |
|---|---|
| `00-MASTER_README.md` | 先读。愿景锚点 + 禁止漂移清单 + 强制读取顺序 |
| `16-ALBUM_SPACE.md` | 做界面时。第一屏、原图⇄粒子、镜头编排、对话。
⚠️ §2.2 的斜轴已换成手风琴、§2.3/§2.4 随「相册不要粒子」作废、
§6 的 Library 作废 —— 那几处都注明了 |
| `09-AI_SPEC.md` | 做 AI 时。含「永不沉默但不说空话」的判定标准 |
| `08-DATA_API_SPEC.md` | 改数据时。schema 与 API 契约 |
| `10-IMPLEMENTATION_PLAN.md` | 确认当前在哪个 Round |
| `18-BACKUP_PROTOCOL.md` | 做备份时。**§11 是端到端加密，2026-10-09 反转的** |
| `recon/environment.md` | 环境出问题时。所有已踩的坑都在里面 |

---

## 5. 下一步

Round 5（第一屏）、7、10 都完成了，时间线也落地了。剩下的按
`10-IMPLEMENTATION_PLAN.md`：

- **Round 8 后半 — 随笔小记**（对话那半 2026-10-10 做完了）。
  ⚠️ 用户那天定的名字是**随笔小记**，不是「日志」—— 它是**轻**的东西，
  不是长文日志。做它的时候要把 `16 §10`、`09 §12`/`§13`、`01 §5`、
  `10` 的 Round 8 里的「日志」一起改掉
- **Round 9 — 分组**（Memory / MemoryPhoto 数据层早就有了，只差界面）
- **Round 11 — 备份**（`18` 有完整协议，客户端没写）
- **Round 12 — Mobile / 性能 / 打磨**、**Round 13 — Electron 封装**（规划了没建）

⚠️ **Round 6（Library 抽屉）不要做了** —— 时间线取代了它，不并存。
规格已同步（`01 §5`、`16 §1`/§6、`07`、`10`）。

**几件悬着的小事**：

1. **「看全部」暂时指向 `/timeline`** —— 等用户说的「memorys 板块
   （全部照片库）」做出来，这里改指它
2. ~~**缩略图**~~ —— **2026-10-10 已补**（见 §3）。做法是
   **客户端生成、服务端校验落盘**，没有引 `sharp`（`10` Round 13 的
   封装友好约束里点名禁的就是这种原生模块），也没等 Python 图像服务
   —— 那个服务的真正理由是 HEIC/RAW 解码，与缩略图无关。
   ⚠️ **已有照片不回填**，`thumbnailKey` 为 null 时 `/thumbnail` 回落原图
3. `albumService` 的 `SCAN_LIMIT = 400`，照片库变大前要改成游标分页
4. **对话的形态要补进 `16 §9`**：那里只说「展开后出现在照片下方，不跳转」，
   而实现是**全屏遮罩 + 实时模糊**、**入口只在粒子界面**

### 还欠用户一个答复的

- 备份后端到底是谁的？用户说过「同步到**我的**后端存储」。
  `18 §11` 假设后端管理员就是用户自己；多用户共享后端 + 端到端加密解决了隐私问题，
  但**谁来跑那个后端**还没定。Round 11 前要明确
- **顶栏现在只剩一个空间入口：`时间线`**。左上角是**项目名**（点它回相册），
  右侧的 `参数` **只在照片空间出现**（相册与时间线上没有粒子，在那儿点开
  只会得到一个控制不了任何东西的面板）。
  2026-10-09 删掉了 `/journal` 与 `/create` 两个 404 死链；2026-10-10 又删掉了
  `Memories` —— 它指向 `/`，和项目名同一条去路，而且用户说它「暂时还没做，
  后续做图库的效果」。**图库做出来时再加回来**，那时它指的应该是
  Memory Theater 那一族，不是相册。

### 做 AI 时别丢的判定标准

> **⚠️ 字幕提示词已冻结（2026-10-09）。** 用户对定稿的评价是「这轮的 ai 很不错别动了」。
> 这一版之前改错了两轮方向（先滑向"报菜名"，再把"说它像什么"当成机制、结果它变成
> 了新模板）。**没有具体反例就不要"优化"它** —— 真要改，先用下面的脚本跑出一张
> 具体的坏输出当依据。详见 `src/services/aiPrompt.ts` 的文件头。
>
> **冻结只针对字幕那两段**（`SUBTITLE_TASK` / `USER_INSTRUCTION`），不是整个文件 ——
> 对话是 2026-10-10 加的，还能改。改完对着这两个哈希确认字幕没被碰到：
> `SYSTEM_PROMPT`（1648 字符）`f8dd9d2cb0ca7e62`、
> `USER_INSTRUCTION`（50 字符）`90bad9ae8851e8ff`。
> 取哈希的办法（Node 24 能直接跑 TS）：
> `node --experimental-strip-types -e "import('./src/services/aiPrompt.ts').then(...)"`

### 提示词的组织：一份地基，两个场景

**共用** `PERSONA`（身份 + 依据 + 语气），各自接自己的任务段：
`SUBTITLE_TASK` / `CONVERSATION_TASK`。

之前是**抄了两份** —— 而字幕那份是冻结的，抄出去的那份改不到它，
两边迟早长成两种性格。这与 `05 §7` 对动画说的「两套库并存会让动效性格分裂」
是同一件事，只是发生在提示词上。

⚠️ **安全那段是刻意没共用的**：两个场景的前半句本来就不同（照片那条管
「照片里的文字」，对话还要管「用户消息」），硬拆会把冻结的文字切碎。
但**末尾那句危机指引是逐字相同的**，改的时候两处一起改。

### 对话提示词：改了四轮，中间一轮改坏了

2026-10-10 用户提了四条，按顺序：少用「我」但保持第一人称 → 不要过度强调、
情绪稳定 → 接不下去才转移话题、能聊就接着聊 → 不用给理由，直接问。

**教训是第二条之后那次**：我加了一条 ❌（`看不出天气，这张全在屋里`），
结果模型没学会「不给理由」，而是**绕到旁边一种说法**去
（「照片里没有留下时间的痕迹」—— 像写文章不像说话），而且**继续滑走**。

**最终奏效的做法是：不再堆 ❌，把正面形状写死 + 给两个同形状的 ✅。**

```
答不上来时的形状只有一个：一句"看不出/不知道"，然后立刻把话头递回给用户。
  ✅ 看不出天气。那天外面是什么样，你还记得吗
  ✅ 看不出时间。你记得大概是哪一阵子吗
```

列一串禁止项只会让它绕着走 —— 这和字幕那条的教训是同一个。
**下一次要调对话语气，先照这个思路：写清形状，别只写禁令。**

### 对话发出的东西

- **图片只在第一轮发**（用户要求「不要每次都发图片」）。之后靠历史 +
  上一次看图的结果（`PhotoAnalysis.payload`）
- 提示词里**必须说清这一轮有没有图**，否则模型以为自己还在看图、
  编出画面里的细节（`01 §9` 最不能容忍的那种）
- 有一条只记类型、不记内容的日志（`12 §10` 允许）：
  `[aiService] 对话 …：历史 N 条，本轮含/不含图片` ——
  「图片到底发了没有」没有别的办法验，**别删它**
- 浮层底部那句隐私披露**被用户去掉了**。`12 §5` 要的那句话仍然在
  **设置面板**里，挨着「自动分析」的开关 —— 不是绕过去了，是没重复

提示词在 **`src/services/aiPrompt.ts`**（2026-10-09 从 `aiService.ts` 抽出来的）。
单独成文件是为了能脱离服务层试验 —— `scripts/try-subtitles.mjs` 直接 import 它，
所以「调试用的提示词」和「线上跑的」不会各改各的。

**「永不沉默」不等于「可以说废话」。** 空话的特征是**对每张照片都成立**。

但「具体」只是及格线。**只说看得见的东西仍然是图注** —— 准确、具体、
只对这张照片成立，但还是在报告画面里有什么。用户对第一版的反馈原话是
「首轮还是太生硬了，过多的去描述图片内容了」。

真正的目标是**说这件事，不是描述画面**：

```
❌ 那只爪子攥在半空，举得比头还高，像是要落下来
❌ 脸贴得太近，镜头大概是被它撞歪的        ← 摄影技术分析，在评价照片
✅ 它举着爪子停在那儿，大概是嫌你凑太近了
```

自检：这句话是在说**画面**，还是在说**这件事**？

`09 §21.4` 的正反例表**只是及格线**，它那一栏「✅ 应该」本身就全是描述打头 ——
照抄会滑向图注。真正的要求在 §21.4.1 与 §21.4.2。

**AI 可以有轻微的人味**（`09 §2`，2026-10-09 调整）。这是用户明确要求的：
AI 可以说自己当下的反应（"这一下我笑了一下"、"我一时没分清"），否则它只是个旁白。
但放开的是**当下的反应**，不是**持久的人设** —— 不编造经历、不假装有生活、
不制造依赖。`09 §2` 有一张表划清了这条线。

改 prompt 时别丢这些。`09 §21.7` 还有语气对照表。

**改完 prompt 一定要跑样例**：

```bash
node scripts/try-subtitles.mjs <图片...>      # 每张 6 条
N=3 node scripts/try-subtitles.mjs <图片...>  # 每张 3 条
```

语气这种东西没法靠读 prompt 判断，只能看输出。脚本直接 import
`src/services/aiPrompt.ts`，看到的就是线上会说的。**会走真实 API 计费。**

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
| 构建时报「Cannot open database because the directory does not exist」 | 不读请求、也没有 `params` 的 route handler **会被预渲染**，而 **better-sqlite3 是同步驱动**，查询在预渲染阶段真的会执行（那时 `NODE_ENV=production`，数据目录解析到 `~/.shadow-narrative`）。修法是在查询前 `await connection()`。见 `04-functions/connection.md`，那节专门点了 `better-sqlite3` 的名 |
| `export const dynamic = "force-dynamic"` 不生效 | 项目开了 `cacheComponents`，**Next 16 已移除** `dynamic` / `dynamicParams` / `revalidate` / `fetchCache`。只能用 `connection()` |
| `connection()` 放进 `try` 里，构建照报「未预期的失败」 | **它是靠抛出终止预渲染的**。那个抛出不是业务错误，被 `catch` 吞掉就等于把预渲染的终止信号当成了失败。必须在 `try` 之外 |
| 静默预渲染了一个错的设置快照 | 比上一条更隐蔽：`/api/settings` 读 `secrets.json` 的失败被 `readSecrets` 兜住了，所以**不报错**，只是构建时固化了一个错值。凡是「不读请求 + 碰数据库」的 handler 都要 `connection()` |
| 路由组搬完，dev server 报 `Cannot read properties of undefined` | 移动 `page.tsx` 到 `(experience)/` 之后，Turbopack 的模块图是旧的，`store` 里新加的 `stage` 读不到。**重启 dev server**，别去改代码 |
| `@starting-style` 写了不生效 | 嵌在 `@layer components { }` 里会被构建链整条丢掉（实测规则根本没进样式表，Chrome 152 本身是支持的）。同类写法改用 `@keyframes` |
| 用内联 `opacity` 压关键帧，压不住 | **动画的优先级高于内联声明**。要让一个元素在当前状态下被动画按住，得用属性选择器，不是写 `style={{ opacity: 0 }}` |
| **抬了 z-index，日期和字幕整个消失** | 画布那一层有**实心底色**。它一被抬到 `main` 之上，`main` 里那些 z-index 更小的文字就全被压在它底下了。**不要给画布层加 z-index** |
| **给外层包一个带 opacity 动画的 div，文字也整个消失** | 更隐蔽的同一条：`opacity < 1` 或「挂着一条 opacity 动画」都会让元素成为**层叠上下文**，于是它整棵子树被当成一个整体、按它自己的位置参与层叠。那层是 `static` 的普通块 ⇒ 归到「块级内容」那一拨 ⇒ 整个被画到 `fixed` 的画布底下。**要做淡入淡出，只能放在 `main` 里面、带正 z-index 的定位后代上**（如文字层 `absolute z-10`），判据是「它在根层叠上下文里走第几步」——见 `05 §6.2` |
| 画布拖拽旋转失效，`elementFromPoint` 到处返回 `MAIN` | 照片页的 `<main>` 是 `relative` 的整屏块、DOM 上排在画布之后，把画布**整个盖住**了，OrbitControls（挂在 canvas 元素上）一次 `pointerdown` 都收不到。修法是 `main` 自己 `pointer-events: none`，该点的东西各自 `pointer-events: auto` —— **不是靠 z-index**。同一条也适用于拖入照片：`<main>` 收不到 `dragover`，监听要挂 `window` |
| 飞行的元素被它出发的那层盖住 | 网格画廊是 `z-40`、顶栏 `z-20`。飞行图必须 `z-50` —— 它正从网格里朝观者出来，被自己刚离开的那层盖住就读不出这件事 |
| **`@import` 加了不生效，而且一声不响** | `globals.css` 里挂在**第 4 个**位置的那份 CSS **一条规则都没进样式表**。文件头早就警告过这件事（`@import` 必须集中在最前面），是我没当回事。**发现办法**：`curl` 构建后的 CSS 去 `grep` 类名 —— 对照 `.sn-range` 有 10 处、`.ag-panel` 有 0 处。修法是让那个组件**自己 import**，不走 `@import` 链 |
| **`pointer-events` 会被继承 —— 浮层点不到但底下的画布还能拖** | 照片页的 `<main>` 是 `none` 的（见上一行），浮层在它里面就**继承了 `none`**：鼠标穿过浮层打到画布上，症状是「还能拖粒子、点不了聊天框」。判据不是「谁看着像要能点」，而是**它在不在那个 `none` 的子树里**。文字层、左下角那组、对话浮层，三个都各自开过 `auto` |
| **从照片页切到时间线，画布不收起来** | 「外壳该不该显示画布」看 `stage.space`，而**时间线从来没声明过它** —— 于是留着上一个空间的值（`photo`），依赖没变、effect 不重跑，一层实心黑盖住整条时间线。**每个空间组件都必须在挂载时写一次**，这个字段是「谁最后说话谁算数」、没有默认值兜底 |
| 相册和照片页的 `pathname` **都是 `/`** | `16 §1` 里 Album 的入口就是「默认」，Photo View 是 `/?photo=<id>`。所以**任何「看路由判断现在是哪个空间」的写法都是错的** —— 要么由各空间声明（`stage.space`），要么在覆写前读旧值（`stage.entryFrom`） |
| `react-hooks/refs` 报「渲染期读 ref」，但报的是**别的属性** | `const x = useReveal(); …x.revealed…` 也会被拦 —— 它保守地认为「从带着 ref 的对象上读属性」就是在读 ref。**解构出来用**（`const { ref, revealed } = useReveal()`）就没这回事 |
| React 19 的 ref 回调**不能返回值** | `ref={el => (list.current[i] = el)}` 这种**简明体**会把赋值结果返回出去，而 React 19 起把返回值当 cleanup 函数。必须写成块体 `{ … }`。React Bits 的组件里就有这处（搬进来时修了） |
| 手风琴只有 2 张照片时「展开」的那张反而更窄 | `expandRatio` 是「展开那张占整行的比例」，公式 `grow = r(n-1)/(1-r)`。`r < 0.5` 且 `n = 2` 时会反（展开的占 42%、收起的占 58%）。**用上游默认的 0.52，别调低** |
| `exifr` 不 pick 字段就会把 **GPS** 一起解出来 | 解析器默认解整块 EXIF。`12 §3`/`08 §13` 要求 GPS 默认不落库 —— 必须 `pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"]`，只 pick 日期则 GPS 连解析都不会发生（顺带也快得多） |
| **EXIF 的时间没有时区** | `DateTimeOriginal` 就是一串「相机本地时间」。`exifr` 按运行机器的本地时区解释 —— 与 `timelineService.toDayKey` 的「服务器本地时区」是同一套约定，两者不打架。**将来要支持多时区，这两处必须一起改** |
| `convertToBlob` 要不到格式会**静默给 png** | 请求 `image/webp` 而浏览器不支持编码它时，规范要求回落到 `image/png`，**不抛错**。而 png 有可能比原图还大。必须比对返回的 `blob.type` 是不是你要的那个 |
| **拿 dev 模式的首个请求当性能读数** | Turbopack 按需编译路由：同一个 `/file` 请求，**冷态 741ms、热态 30ms**。缩略图那一轮我差点据此判定「原图没进缓存导致镜头空档」。**量之前先跑一遍热态**，或者看请求日志里 `next.js / application-code` 的拆分 |
| **粒子数是绝对值，不随视口变** | 220k 在 1400px 宽的窗口里是一层疏朗的沙，在 Claude 那种 532px 宽的面板里是 2 个粒子/px、几乎糊成一张照片。**在预览面板里调粒子参数会调过头** —— 那个面板比真实窗口窄得多。判据是「粒子数 ÷ 照片在屏幕上的像素数」，不是「看起来够不够密」 |
| **包一层的 `span` 会丢掉字号** | 给 `Back` 套了个收放用的 `span`（要动画 `max-width`），忘了把 `text-meta` 也挂上去 —— 它按默认的 16px / 24px 撑行盒，而按钮那边是 13px / 18.2px，`items-center` 一居中，里面的字反而**错开 1px 多**（用户报的「into 和 back 水平错位了」）。判据不是「看着差不多」，是**两边的行盒高度必须相等** |
| **flex 子项写 `inline-block` 没用** | 上面那个 `span` 写了 `inline-block`，`getComputedStyle` 回来的是 `block` —— flex 容器会把子项 blockify。不影响功能，但排查时容易看懵 |
| **`dispatchEvent` 会绕过 `inert`** | `inert` 挡的是**真实**指针（命中测试阶段就不落上去），而 `element.dispatchEvent(new PointerEvent(...))` 直接投递给元素，压根不走命中测试 —— 于是「未点状态下按住那颗被 `inert` 藏起来的按钮」会给出「按住成功」的**假读数**。**验证 `inert` 要用 `document.elementFromPoint(x, y)`**：它走的是真的命中测试，被挡住会返回 null 或下层元素 |
| **两个状态分别挂载/卸载，再怎么加过渡也生硬** | 进场的那个是从「不存在」跳到「存在」，`transition` 对它没有起点。要交叉淡化就得**两个都常驻、叠在同一格**（`grid` + `grid-area: 1/1`）—— 删除那一格和 `Into this moment` / `返回` 是同一个解法。顺带还吃掉了宽度跳变：格子宽是两者中较宽的那个 |
| **`text-text-primary/40` + `hover:opacity-85` = hover 变暗** | 前者是**颜色的 alpha**，元素的 `opacity` 仍然是 1，所以 `hover:opacity-85` 把整块压到 0.85 —— 有效亮度 0.40×0.85 = 0.34，**方向和意图相反**。要把「暗」写在 **`opacity-*`** 上（`text-text-primary opacity-40`）才通。2026-10-10 全项目扫过一遍，12 处。⚠️ 靠**换颜色**做的（`hover:text-text-primary/70`）本来是对的，别一起改 |

---

## 7. 几条硬约束（都在文档里，这里再强调）

1. **粒子引擎不用 React Three Fiber**（`05 §18`）。粒子是自研 rAF 循环，React 不参与渲染路径
2. **GSAP 只管镜头编排，Motion 只管 UI 微交互**，两者共用同一套缓动 token
   （`16 §11.2`，缓动是**运行时从 CSS 变量读**的，不是抄数字）
3. **删除是先删文件再删记录**，顺序不可交换（`08 §16`）
4. **AI 不自动写日志**，日志必须用户主动触发（`01 §9`）
5. **「翻开 / 返回」是同一格里的一个动作，不是双向开关**（`16 §8.4`、§8.6）。
   外面看着像能来回，但同一时刻只显示得下**一个**动作 —— 所以它读起来
   是一次进出的动作，不是「原图 ⇄ 粒子」两个并列的显示模式。
   **不要做成并排两个常驻选项。**
6. **不能让人感觉是切换页面**（`16 §8.6`）—— 这是产品最核心的主张。
   实现方式是**画布不归任何一条路由**（`05 §6.1`）：它长在 `(experience)/layout`
   里的 `ExperienceShell`，路由换掉时它不卸载。想让一个空间进出照片，
   就把那一步做成「那张照片从它原来的位置飞进画布」（`16 §11.5`），
   而不是 `router.push` 完事
7. **userId 只能由服务端解析**，绝不从请求里读（`12 §4`）。唯一解析点是
   `userService.getLocalUserId()`
8. **`src/services/*` 不得 import `next/server`、`next/headers`、React**。
   框架 API（`after()`、`revalidatePath`）只出现在 route handler 里 ——
   这条是为了将来能把服务层整体挪到独立进程时不改函数体
9. **相册不要粒子**（用户 2026-10-10 拍板）。`16 §2.3`/`§2.4` 整条作废，
   那一块是纯 DOM。粒子只属于「一张照片被翻开」之后（§8）
10. **对话只能从粒子界面进**（用户定的）。入口是**字幕正下方的一条线** ——
    哑光地呼吸，另有一道高亮从左到右扫过去（`.sn-hint`，`components.css`）。
    原图态没有它。等于「先把这一天翻开，才谈得上跟它说话」。
    ⚠️ 它最早是**一圈呼吸边框**，用户 2026-10-10 换掉了：「做成下面一条线带有
    从左到右的动态高亮，但整体哑光或呼吸」—— 框住的是整个文字块，
    而字幕长短不一，框总显得比内容大一圈；一条线的长度永远等于这一行字
11. **`Back` 不按去向改名**（用户：「不区分显示的名字都用 Back」）。
    去哪由 `stage.entryFrom` 决定，但**文案恒为 `Back`** ——
    写「回相册 / 回时间线」是在替用户记路线。
    ⚠️ **粒子态下它整个收起来**（用户 2026-10-10：「粒子页有两个返回，只留一个，
    粒子页的返回是回到原图页」）—— 那一格已经是「返回」了。
    ⚠️ 收的时候**宽度和左边那段间距要一起收**，否则这一行还是原来那么宽，
    居中的结果是「返回」偏左 —— 用户当天紧跟着报的「现在按钮不居中了」
    就是这个。间距原本挂在父级的 `gap-7` 上，靠 `gap` 收不掉。见 `16 §7.2`
12. **照片页那一行是「三行字」，不是三个控件**（用户 2026-10-10）。
    `Into this moment` / `返回` / `Back` **共用完全同一套文字样式** ——
    同字号、同字距、同 0.45 底色亮度、hover 提亮。
    ⚠️ `Back` 上**不要加下划线**：它把「一句话」读成「一个链接」，
    而这一整行的用意就是「出口是一段文字，不是一个控件」（`16 §7.2`、§8.6）
13. **画布那一层、以及任何在 `main` 的 `pointer-events: none` 子树里的浮层，
    都要自己开回 `pointer-events`**（见 §6 的两行）。判据是「它在不在那个
    子树里」，不是「谁看着像要能点」
14. **参数与设置是工具，不是空间**（用户 2026-10-10）。它们只有一处入口 ——
    左下角那颗胶囊（`BottomDock`），两格各开各的卡。
    **只共外壳（`DockCard`），不共内容** —— 用户明确说组合的是
    「按钮，不是卡片、内容、功能组合」。
    ⚠️ 收起的那一格要 `inert`，不只是宽度 0（否则键盘仍 Tab 得到它）；
    ⚠️ 离开有粒子的空间时参数卡要自动收起（写在 `setStage` 里，不在 effect 里）
    —— 否则留下一张没有入口、也关不掉的浮卡

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
src/                     61 个源文件（ts/tsx/css）
shadow-narrative-docs/   19 份规格 + recon/
prisma/                  schema + 两份迁移（init、day_theme）
scripts/                 setup.mjs + 环境脚本 + Hilbert 自检 + try-subtitles.mjs
.data/                   shadow-narrative.db + photos/（已 gitignore）
```

**上一个提交**：`7fbd415`（交接文档）。**缩略图那一轮还没提交** —— 改动在工作区里，
见下面的清单。

**工作区里有两轮改动还没提交**：

```text
── 一、缩略图 ──────────────────────────────────────────────
新增  src/lib/makeThumbnail.ts
新增  src/app/api/photos/[id]/thumbnail/route.ts
改    src/services/mediaService.ts        saveThumbnailFile
改    src/services/photoService.ts        createPhoto 接缩略图、回滚连它一起删
改    src/app/api/photos/route.ts         POST 读 thumbnail 字段
改    src/lib/photoUpload.ts              uploadPhoto(file, thumbnail?)
改    src/components/AlbumSpace.tsx       图换 /thumbnail、上传时生成
改    src/components/MemorySpace.tsx      复用已解码的 bitmap 生成
改    src/components/TimelineSpace.tsx    叠放与网格两处 <img>
改    src/components/ExperienceShell.tsx  飞行图换 /thumbnail
改    08 / 10 / 16 / 17 / 18 五份规格

── 二、粒子手感（用户当天提的五条）─────────────────────────
改    src/types/index.ts                  档位数 150k→220k 等、size 1.6→1.8
改    src/engine/particle/ImageSampler.ts  z 改成「主体厚 + 低频起伏 + 贴边收薄」
改    src/engine/particle/ParticleSystem.ts  minDistance 0.30→0.20
改    06 / 15 两份规格

── 三、照片页那一行三个动作 ───────────────────────────────
改    src/components/MemorySpace.tsx
        · 粒子态下 Back 收起（宽度 + 间距一起收，整行平滑重新居中）
        · Back 的样式改成与 Into this moment 完全一致（去掉下划线、0.45 亮度）
        · 包了一层的 span 要挂 text-meta，否则行盒不等、字会错开
        · 参数面板的挂载点搬走、左下角那组文字挪到 left-32
改    16 两份小节（§7.2 新增一节、§8.6 补一段）

── 四、左下角那颗胶囊 ─────────────────────────────────
新增  src/components/BottomDock.tsx       一颗胶囊两格（参数 | 设置）
新增  src/components/DockCard.tsx         两张卡共用的外壳
改    src/components/SettingsPanel.tsx    只剩浮卡，球交出去了
改    src/components/ParticleControls.tsx 右侧抽屉 → 左下浮卡
改    src/components/TopNavigation.tsx    删「参数」、「时间线」→「Timeline」
改    src/app/layout.tsx                  挂 BottomDock + 两张卡
改    src/store/experience.ts             ui.settingsOpen、两卡互斥、切空间自动收
改    02 / 05 / 07 三份规格
```

⚠️ **推送**：2026-10-10 那个 session 里 `git push` **被权限规则挡了三次**，
每次都是用户自己推的。想让我以后能推，需要在设置里给 Bash 加一条允许
`git push` 的规则。

**自检脚本**：

```bash
node scripts/verify-hilbert.mjs      # 验证 A→B 对应关系；改动 Hilbert 或采样后必须跑
node scripts/try-subtitles.mjs 图…   # 试字幕提示词，会走真实 API 计费
```

**凭据**：AI key 存在 `<数据目录>/secrets.json`（`17 §4`），
开发期也可以放 `.env.local` 的 `AI_API_KEY`（**secrets.json 的非空值优先**）。
两处都在 gitignore 之外/之内，但**都不能进 git、不能进日志**。

**`.data/uploads/`** 里还留着迁移前的 4 张测试照片，应用已经不再读这个目录
（现在读写的是 `.data/photos/`）。用户要求保留文件，没删。
