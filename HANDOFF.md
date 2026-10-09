# Shadow Narrative — 交接文档

> 写于 2026-10-09。面向**新开窗口的 Claude**，目标是让新会话不必重新发现任何东西。
>
> 先读这份，再读 `shadow-narrative-docs/`。

---

## 0. 最重要的一件事：文档和代码不在同一起跑线上

**规格文档已经按新架构全部改写，但代码还停在旧架构上。**

| | 文档（`shadow-narrative-docs/`） | 代码（`src/`） |
|---|---|---|
| 数据模型 | **照片是主实体**，Memory 是可选的相册式分组 | Memory 是主实体，照片从属 |
| 存储 | **SQLite** | PostgreSQL |
| 登录 | 只用于备份 | 无 |
| 第一屏 | 斜轴相册 | 单张照片 + 粒子 |
| 备份 | 有协议（`18`） | 无 |
| AI | 有完整规格（`09`） | **无** |

这不是遗漏，是**计划的顺序**：先把规格改对（`cf3d020`、`523c4bb`），再逐步把代码迁过去。
数据模型迁移排在 `10-IMPLEMENTATION_PLAN.md` 的 **Round 10**。

**做任何改动前先确认你在改哪一层**，别把已经写好的新规格当成代码现状。

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
npm run dev          # http://localhost:3000
```

### 在 Claude 桌面应用里（有坑）

**坑一：`%APPDATA%` 被容器重定向。**

在 Claude 容器里 `%APPDATA%` 被虚拟化到 `C:\WpSystem\...`，Next 写全局配置时用
「临时文件 + 原子 rename」，跨重定向边界失败并报 `EXDEV`，dev server 直接崩。

绕行脚本已写好：`scripts/dev-claude-preview.cmd`（把 APPDATA 指到普通目录）。
`.claude/launch.json` 已配好，用预览功能会自动走它。

**坑二（更隐蔽）：窗口不可见时浏览器不出帧。**

这不是代码问题，但它伪装成过四种完全不同的症状：

- CSS 过渡卡在起点不动
- `requestAnimationFrame` 停摆
- debug overlay 显示 2 fps
- **页面停在 Suspense fallback，`window.__snEngine` 拿不到**

第四种最坑：React 的流式内容揭示脚本 `$RC()` 靠 rAF 执行，窗口最小化时它不跑，
于是 DOM 里只有 fallback。**服务器是好的**（`curl` 能拿到完整 HTML），是浏览器不出帧。

**遇到「代码看起来没问题但行为诡异」，先确认窗口是不是最小化了。**

### 数据库

本机 PostgreSQL 18 在跑，但**应用当前用的是它**（代码还没迁到 SQLite）。
连接串在 `.env.local`。建表：`npx prisma migrate dev`。

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
| 上传与持久化 | `api/memories`、`services/` | 五道校验、落盘、删除（两阶段） |
| 首页 | `MemorySpace.tsx` | 单张照片的原图/粒子视图 |

实测：150k 粒子 / fps 240 / frame 4.2ms / draw calls 1–2（RTX 3060）。

### ❌ 未实现

- **AI 整条线**（上传即分析、字幕、对话、日志）—— 下一步就做这个
- 斜轴相册、Library 抽屉（`16` 有完整规格）
- SQLite 与「照片为主」的数据模型迁移
- 缩略图生成（依赖未建的 Python 图像服务）
- 移动端、备份客户端
- `npm run setup`（`17` 规格里有，代码里没有）

---

## 4. 规格文档

`shadow-narrative-docs/` 下 19 份，**必须按 `MANIFEST.md` 的顺序读**。
最重要的是：

| 文档 | 什么时候看 |
|---|---|
| `00-MASTER_README.md` | 先读。愿景锚点 + 禁止漂移清单 + 强制读取顺序 |
| `16-ALBUM_SPACE.md` | 做界面时。斜轴相册、原图⇄粒子、镜头编排 |
| `09-AI_SPEC.md` | **做 AI 时。含「永不沉默但不说空话」的判定标准** |
| `08-DATA_API_SPEC.md` | 改数据时。新 schema（SQLite + 照片为主） |
| `10-IMPLEMENTATION_PLAN.md` | 确认当前在哪个 Round |
| `recon/environment.md` | 环境出问题时。所有已踩的坑都在里面 |

验证过：88 处跨文档引用全部有效。

---

## 5. 下一步：AI

`10-IMPLEMENTATION_PLAN.md` 的 **Round 7 — 上传与字幕**。

要做的事（规格都在 `09-AI_SPEC.md` §21）：

1. 上传照片 → **自动**触发 AI（不阻塞上传响应）
2. AI 说的话以**字幕**形式浮在照片下方 —— 字幕就是对话的第一条，不做两套数据
3. 字幕**最多两句**，像电影字幕，不是气泡
4. 看不懂时**描述你确实看到的 + 问一句**（「这是哪呀」）
5. 轮询送达（`08 §10`），超时标 failed 并允许手动重试

### 🚧 卡在这里：需要 DeepSeek API key

`09-AI_SPEC.md` §20 定了用 **DeepSeek V4.1-Flash**（`deepseek-flash`，支持视觉）。
`17-SELF_HOSTING.md` §4 定了每个用户用自己的 key，存本机 `secrets.json`，
不进数据库、不进日志。

**上一轮问过用户，还没答复。** 两条路：

- 拿到 key → 写进 `.env.local`（已在 `.gitignore`），端到端跑通
- 拿不到 → 先搭骨架（服务层、字幕 UI、轮询），用 `09 §18` 的 mock 跑通

### AI 的判定标准（做的时候别丢）

**「永不沉默」不等于「可以说废话」。** 用户明确要的是「有人味的真实反应」，
而空话的特征是**对每张照片都成立**。真实反应必须包含至少一个
只对这张照片成立的东西。

`09-AI_SPEC.md` §21.4 有正反例对照表，§21.7 有语气对照表。照抄就行。

---

## 6. 踩过的坑（别重蹈）

这些都是**已经修好**的，列出来是因为它们都很隐蔽，重写同类代码时容易再犯。

| 坑 | 根因 |
|---|---|
| 原图上下颠倒 | **Three 对 `ImageBitmap` 源码会整个跳过 `UNPACK_FLIP_Y_WEBGL`**（`WebGLTextures.js:920` 的 `if (isImageBitmap === false)`）。不能靠 `texture.flipY` 修，要翻几何体的 UV |
| `components.css` 凭空消失 | CSS 规范要求 `@import` 必须在其他规则之前。`tokens.css` 自带 `@import "tailwindcss"`，被内联后第二个 `@import` 就失效了 —— **解析器静默丢弃，控制台无报错** |
| 播放 css 过渡时页面卡住 | 窗口不可见 → 浏览器不出帧（见 §2 坑二） |
| 改密度滑块被踢回原图 | `setImage` 会重新采样，在里面重置模式就会误伤。**只应用当前模式，不重置** |
| 切换像「叠了两张图」 | 粒子出现阈值写成了**居中**（`smoothstep(d±0.03)`），粒子在照片消失前就出现。必须紧贴波前内侧 |
| `.cmd` 脚本跑飞 | `cmd.exe` 在中文 Windows 上按 GBK 读批处理，UTF-8 中文注释被当成命令执行。**`.cmd` 只写 ASCII** |
| StrictMode 下图片永远不加载 | 「只跑一次」的 boolean ref 守卫在 StrictMode 双挂载下必然失效（第一遍 fetch 被 cleanup 取消，第二遍被已置位的 ref 挡掉）。要改成比对已加载的 URL |
| 标签页切走一会儿档位掉到 low | L3 在页面隐藏时也采样，rAF 被节流的帧时间被误判成性能不足。**隐藏时不采样** |

---

## 7. 几条硬约束（都在文档里，这里再强调）

1. **粒子引擎不用 React Three Fiber**（`05 §18`）。粒子是自研 rAF 循环，React 不参与渲染路径
2. **GSAP 只管镜头编排，Motion 只管 UI 微交互**，两者共用同一套缓动 token
   （`16 §11.2`，缓动是**运行时从 CSS 变量读**的，不是抄数字）
3. **删除是先删文件再删记录**，顺序不可交换（`08 §16`）
4. **AI 不自动写日志**，日志必须用户主动触发（`01 §9`）
5. **「翻开这一天」是单向的**，不做双向切换开关（`16 §8.4`）
6. **不能让人感觉是切换页面**（`16 §8.6`）—— 这是产品最核心的主张

---

## 8. 当前仓库状态

```
18 个提交，工作区干净
├── src/                     26 个源文件
├── shadow-narrative-docs/   19 份规格 + recon/
├── prisma/                  schema + 迁移（Postgres）
├── scripts/                 环境脚本 + Hilbert 自检
└── .data/uploads/           4 张测试照片（已 gitignore）
```

**自检脚本**：`node scripts/verify-hilbert.mjs` —— 验证 A→B 对应关系，
输出「相邻秩平均空间距离改善 185 倍」之类的实测数字。
改动 Hilbert 或采样后必须跑一遍。
