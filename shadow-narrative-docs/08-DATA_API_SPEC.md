# Shadow Narrative — Data & API Specification

## 1. Data Principles

**照片是主实体。**

每一次上传生成一张独立的 Photo，它自带文件、AI 理解、对话与日志。
Memory（分组）是可选的、像相册一样的存在，一张照片可以同时属于多个分组。

所有数据存在**本地 SQLite**（自托管形态，见 `17-SELF_HOSTING.md`）。

### 三条硬约束

1. **所有查询带 `userId`。** 自托管阶段只有一个默认用户，但多用户结构从第一天保留，
   将来要接多人时不用改数据模型。
2. **不出现孤儿资源。** 删除照片必须同时删掉磁盘文件（§16）。
3. **AI 的内容永远标注来源。** 见 `09-AI_SPEC.md` §6。

## 2. 存储选型：SQLite

| 项 | 决定 | 理由 |
|---|---|---|
| 引擎 | SQLite | 用户不用装数据库服务。一个文件，零配置 |
| 位置 | `<数据目录>/shadow-narrative.db` | 见 `17-SELF_HOSTING.md` §3 |
| 照片文件 | `<数据目录>/photos/` | 与数据库同目录，便于整体备份 |
| ORM | Prisma | 与现有代码一致 |

### SQLite 带来的三处写法差异

| 差异 | 处理 |
|---|---|
| **不支持 `enum`** | 用 `String` + 应用层校验。取值集合写在本文档里，代码里用 TS 联合类型约束 |
| **`Json` 类型支持有限** | 统一用 `String` 存，应用层 `JSON.parse` / `stringify` |
| **不区分大小写的 LIKE** | 用 `mode: 'insensitive'` 无效，需要 `COLLATE NOCASE` |

## 3. Entities

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
}
```

### User

```prisma
model User {
  id        String   @id @default(cuid())
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  photos    Photo[]
  memories  Memory[]
  settings  UserSettings?
}
```

### Photo —— 主实体

```prisma
model Photo {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // --- 文件 ---
  storageKey   String  @unique   // 原图
  thumbnailKey String?           // 斜轴与列表用
  // 明文文件字节的 SHA-256（`sha256:<hex>`）。本地身份、完整性校验、本地去重。
  // ⚠️ 不能直接当备份上行的 blob id —— 那会给后端一个确认预言机
  //    （拿已知照片算哈希去比对）。上行 id 须为
  //    HMAC-SHA256(用户密钥, contentHash)，见 18-BACKUP_PROTOCOL.md §2 §11。
  contentHash  String

  mimeType String
  width    Int
  height   Int
  byteSize Int
  // EXIF 拍摄时间。没有就为 null，用 createdAt 兜底
  takenAt  DateTime?

  // --- 用户提供 ---
  caption  String?
  favorite Boolean @default(false)   // 收藏 → 出现在斜轴相册

  // --- AI 处理状态 ---
  // pending | done | failed
  aiState  String  @default("pending")
  aiError  String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  analysis     PhotoAnalysis?
  conversation Conversation?
  journal      Journal?
  groups       MemoryPhoto[]

  @@index([userId, favorite, takenAt])
  @@index([userId, createdAt])
  @@index([contentHash])
}
```

`takenAt` 与 `createdAt` 分开：前者是照片拍下的时间，后者是导入的时间。
斜轴按 `takenAt`（缺失时用 `createdAt`）排序。

### PhotoAnalysis —— AI 看图结果

```prisma
model PhotoAnalysis {
  id      String @id @default(cuid())
  photoId String @unique
  photo   Photo  @relation(fields: [photoId], references: [id], onDelete: Cascade)

  // 结构见 09-AI_SPEC.md §8，JSON 字符串
  payload String
  model   String
  // 发送给模型的内容摘要，用于「这张照片被发出去了什么」（12 §5）
  sentSummary String?

  createdAt DateTime @default(now())
}
```

### Conversation —— 挂在照片上

```prisma
model Conversation {
  id      String @id @default(cuid())
  photoId String @unique
  photo   Photo  @relation(fields: [photoId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages ConversationMessage[]
}

model ConversationMessage {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  // user | assistant
  role    String
  content String
  // 证据来源 JSON（09 §6）
  sourceRefs String?
  // 这条是不是「字幕」——即 AI 在看到照片后主动说的第一句
  isSubtitle Boolean @default(false)

  createdAt DateTime @default(now())

  @@index([conversationId, createdAt])
}
```

**`isSubtitle` 的作用**：字幕就是对话的第一条（`09-AI_SPEC.md` §21），
不做两套数据。这个标记只用来决定它在前端以什么形式呈现 —— 照片下方安静地浮现，
而不是对话列表里的一条气泡。

### Journal —— 挂在照片上

```prisma
model Journal {
  id      String @id @default(cuid())
  photoId String @unique
  photo   Photo  @relation(fields: [photoId], references: [id], onDelete: Cascade)

  title   String?
  content String
  // draft | published
  status  String @default("draft")
  // 每次 AI 重写 +1，用于并发检测（§7）
  sourceVersion Int @default(1)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Memory —— 可选分组

```prisma
model Memory {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  title      String?
  summary    String?
  memoryDate DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  photos MemoryPhoto[]

  @@index([userId, memoryDate])
}

/// 多对多：一张照片可以同时属于多个分组，像真实相册。
/// 删除分组不删照片，只断开关系。
model MemoryPhoto {
  memoryId String
  photoId  String
  memory   Memory @relation(fields: [memoryId], references: [id], onDelete: Cascade)
  photo    Photo  @relation(fields: [photoId], references: [id], onDelete: Cascade)

  // 分组内的排序
  order    Int    @default(0)
  addedAt  DateTime @default(now())

  @@id([memoryId, photoId])
  @@index([photoId])
}
```

### UserSettings

```prisma
model UserSettings {
  id     String @id @default(cuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // 粒子偏好（06 §17）。作为观看偏好存在用户级，
  // 而不是像早期版本那样一张照片一份 preset —— 那是观看习惯，不是照片属性
  particlePreset   String @default("calm")
  particleParams   String?   // JSON

  // ⚠️ 这里原本有一个 autoAnalyze（上传后是否自动把照片发给模型）。
  // 2026-10-10 用户定了「自动分析只能开」，开关与这一列一起删掉了
  // （迁移：prisma/migrations/*_drop_auto_analyze）。见 09 §21.2。
  // 它不是「先留着以后可能用」的那种字段 —— 留一个恒为 true 的开关，
  // 下一个人会以为它真的能关。

  // 备份（18-BACKUP_PROTOCOL.md）
  // 刻意**没有** backupToken：凭据只存 secrets.json。放进业务表的话，
  // 快照清单（§3）会把整行带走 —— 等于把备份令牌备份到备份后端上。
  backupAuto       Boolean @default(false)
  backupEndpoint   String?

  updatedAt DateTime @updatedAt
}
```

### DayTheme —— 时间轴上某一天的主题名

```prisma
model DayTheme {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // "YYYY-MM-DD"，**本地日历日**，不是 UTC 日期
  dayKey String

  title  String
  // ai | user
  source String @default("ai")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, dayKey])
}
```

**天是时间轴上的刻度，不是用户建的分组。** 所以它刻意**不复用 `Memory`** ——
§3 上面写着分组是**可选**的，而「每天自动有一个节点」如果做成分组，
就等于自动给每一天建一个分组，和「可选」直接冲突。

关于 `dayKey` 为什么是 `String` 而不是 `DateTime`：

> 这是一个「日历日」，不是一个时刻。存成 `DateTime` 就会在时区上漂 ——
> 23:30 拍的照片属于哪一天，会取决于你在哪个时区读它。
> 存成 `"2026-10-09"` 则永远是那一天。

⚠️ 反过来说，**分组用的时区必须固定**：`timelineService.toDayKey` 用的是
服务器的本地时区。单机自托管（`17 §1`）下这就是用户所在的地方；
一旦要支持多时区，这个函数必须带上用户时区参数，否则同一张照片在不同机器上
会被分到不同的天，而主题名是按天存的 —— 分组一变，主题就对不上了。

## 4. 级联规则

| 删除 | 数据库级联 | 应用层必须补做 |
|---|---|---|
| `Photo` | 级联删除 analysis / conversation / journal / 分组关系 | **删除磁盘上的原图与缩略图** |
| `Memory` | 级联删除 `MemoryPhoto` 关系行 | **不删照片** —— 分组只是关系 |
| `User` | 级联删除全部 | 按存储前缀清理文件目录 |

删除顺序见 §16。

## 5. API Style

REST + Route Handler（`src/app/api/`）。

### 响应格式

成功：

```json
{ "data": {}, "meta": {} }
```

错误：

```json
{ "error": { "code": "...", "message": "...", "requestId": "..." } }
```

错误码：

```text
400  INVALID_INPUT        参数不合法
404  NOT_FOUND            不存在，或不属于当前用户（不区分）
409  CONFLICT             sourceVersion 不一致
413  PAYLOAD_TOO_LARGE    文件超限
415  UNSUPPORTED_MEDIA    格式不支持
429  RATE_LIMITED         触发限流
502  AI_UPSTREAM_FAILED   AI 调用失败或输出不合法
500  DELETION_INCOMPLETE  文件没删干净，记录被保留（§16）
```

## 6. Photo API

```text
GET    /api/photos              列表（游标分页）
POST   /api/photos              上传
GET    /api/photos/:id
PATCH  /api/photos/:id          改 caption / favorite / takenAt
DELETE /api/photos/:id
GET    /api/photos/:id/file     原图
GET    /api/photos/:id/thumbnail
```

### POST /api/photos

`multipart/form-data`：

```text
file        File      必需
thumbnail   File?     可选，客户端生成的缩略图（见下方说明）
takenAt     string?   可选，ISO 日期；缺省时尝试从 EXIF 读
```

服务端顺序**不可交换**：

```text
1. 校验 MIME / 大小 / 扩展名
2. 校验真实格式（读文件头，不信浏览器给的 MIME）
3. 校验实际 dimensions
4. 读 EXIF 拍摄时间
5. 算 contentHash（SHA-256）
6. 落盘原图
7. 校验并落盘缩略图 —— 可选，见下方说明
8. 建 Photo 记录（带 thumbnailKey，aiState = "pending"）
9. 异步触发 AI 分析 —— 不阻塞响应
```

响应 `201`，**不包含 AI 结果**。AI 的字幕通过 §10 的推送或轮询拿到。

### 缩略图

> 2026-10-10 落地。此前 `thumbnailKey` **从来没生成过** —— 下面那段
> 「依赖未建的 Python 图像服务」的理由经不起看，已经重写。

**由客户端生成，服务端校验后落盘。**

本节原先写的是「像素处理属于 Python 图像服务的职责」，而那个服务的真正理由是
**HEIC / RAW 的解码**（`05 §7`），与缩略图无关：本项目只接受
jpeg / png / webp / gif 四种，**这四种浏览器本来就都能解、也都能编码**。

服务端自己生成的两条路都不好：

- `sharp` 是**原生模块**，而 `10-IMPLEMENTATION_PLAN.md` 的 Round 13
  封装友好约束第三条点名的就是它（每多一个，Electron 封装就多一份
  ABI 重编译与体积的账）
- 纯 JS / WASM 要按格式各引一份解码器，而 Node 里没有 Canvas，
  重采样还得自己写 —— 与 `05 §17` 的依赖策略一条都对不上

客户端这条路还是**白送**的：照片页为了「不等网络就成型」本来就要
`createImageBitmap` 解一次（`16 §8.1`），那张 bitmap 正好复用。

**规格**（`src/lib/makeThumbnail.ts`）：

| 项 | 值 |
|---|---|
| 长边 | 1024（只缩不放） |
| 格式 | webp q0.82；浏览器不支持编码时回落 jpeg q0.85；都不行则放弃 |
| 方向 | `createImageBitmap` 默认应用 EXIF 方向，所以输出是**正立**的、不带 EXIF |
| 尺寸 | 长边 ≤ 4096、短边 ≥ 32 |
| 字节 | ≤ 2MB |

尺寸是按最吃图的那一处定的：相册展开那张的面板约 366 CSS px 宽
（`16 §2.1` 的固定量 8 张），2× DPR 下约 732 设备像素 —— 竖幅照片在
1024 长边下给到 768 宽，正好盖住。像素数则从 12MP 降到 0.79MP（**1/15**）。

**服务端仍然一道校验都不能少**（`12 §2`）：请求可以来自任何地方，
不是只有我们的客户端。挡的是「拿原图冒充缩略图」与「塞一张 8000px 的图进来」。
落盘位置与原图**同目录**，名字取原图的 stem 加 `.thumb.`
（`photos/<uuid>.thumb.webp`）—— 只是可读性，不是契约。

**任何一项不过都落成 `thumbnailKey = null`，不报错。** 缩略图是派生资源，
缺了它 `/api/photos/:id/thumbnail` 会回落到原图（见下），
上传本身必须照旧成功 —— 这正是 `05 §7` 给 Python 服务定的那个姿态。
非浏览器上传（`curl`、将来的脚本）没有缩略图，走的也是这条路。

### 读缩略图

```text
GET /api/photos/:id/thumbnail
```

- **有缩略图** → 送它，`Cache-Control: public, max-age=31536000, immutable`
- **没有** → **回落原图**，`Cache-Control: private, no-cache`

回落而不是 404：让调用方永远只需要一个地址，不必在四个地方各写一遍判断。

两段的缓存头**必须分开**：回落分支覆盖的是「同一个 URL 现在给原图、
将来可能给缩略图」，用 `immutable` 会把将来那次回填永久挡在缓存外。

**用在哪、不用在哪** —— 这条边界是这个接口存在的前提：

| 用缩略图 | 用原图 |
|---|---|
| 相册第一屏、时间线的叠放与网格、进入照片时的飞行图 | **画布 / 粒子**（按像素采样，`06 §5`）、**AI 看图**（§17 只发当前这一张） |

即：**浏览用缩略图，「翻开」用原图**。缩略图只负责「看个大概、找得着」，
一旦要看清就必须是原图。

### PATCH /api/photos/:id

```json
{ "favorite": true }
```

只允许改 `caption` / `favorite` / `takenAt`。响应为完整 Photo。

## 7. Conversation API

```text
GET  /api/photos/:id/conversation
POST /api/photos/:id/conversation/messages
```

### POST 请求

```json
{ "content": "山顶都被朝阳染成金红色了" }
```

响应：

```json
{
  "data": { "role": "assistant", "content": "…", "sourceRefs": [] },
  "meta": { "model": "deepseek-flash" }
}
```

## 8. Journal API

```text
GET   /api/photos/:id/journal
POST  /api/photos/:id/journal      用户主动触发生成
PATCH /api/photos/:id/journal      用户定稿
```

生成必须由用户显式调用 —— 见 `01-PRODUCT_SPEC.md` §9。

`PATCH` 必须带 `sourceVersion`，不一致返回 `409`，防止 AI 重写覆盖用户手改。

## 9. Memory（分组）API

```text
GET    /api/memories
POST   /api/memories
PATCH  /api/memories/:id
DELETE /api/memories/:id           只删分组，不删照片
POST   /api/memories/:id/photos    把照片加进分组
DELETE /api/memories/:id/photos/:photoId
```

## 10. AI 结果的送达

上传是异步触发的，AI 字幕晚于响应到达。两条路径：

- **首选：轮询 `GET /api/photos/:id`**，看 `aiState` 从 `pending` 变成 `done`
- 后续可换成 SSE 推送

轮询间隔建议 800ms，最多 30 秒，超时后把 `aiState` 标为 `failed` 并允许用户手动重试。

**不做**：让上传请求一直挂着等 AI 返回。慢、会超时、失败后照片处于半状态。

## 11. 分页

游标分页（cursor-based），不用 offset。

```text
GET /api/photos?cursor=<id>&limit=50
GET /api/photos?favorite=true      斜轴相册用
```

默认不要一次返回全部照片。

## 12. Upload Rules

必须校验：

- MIME type
- 文件大小（上限 25MB）
- 扩展名
- **真实格式**（读文件头）
- 图片实际 dimensions

不能仅依赖浏览器提供的 MIME。

## 13. EXIF

EXIF 只用于两件事：

- `takenAt`（拍摄时间）
- 相机信息（可选，用于展示）

**GPS 默认不写入数据库。** 它属于敏感位置数据，需要单独开关才存
（`12-SECURITY_PRIVACY.md` §3）。

### 读取时机与三条纪律

> 2026-10-10 补。用户问「照片的时间优先读照片附带的信息怎么样」，
> 查下来这条路**从来没实现过** —— `takenAt` 只从表单字段取，
> 而客户端从来不传，于是每张照片都是 `null`、全部回落到导入时间。
> 本节上面那句「缺省时尝试从 EXIF 读」（§6）写了，代码里没有。
> 现在在 `mediaService.savePhotoFile` 里做，字节已经在手上，不必再读一遍盘。

1. **只 pick 日期字段**（`DateTimeOriginal` → `CreateDate` → `ModifyDate`）。
   解析器默认会把整块 EXIF 都解出来，那里面**有 GPS** —— 只 pick 日期，
   GPS 连解析都不会发生。这既是隐私要求，也让它快得多。
2. **EXIF 的时间没有时区。** `DateTimeOriginal` 就是一串「相机本地时间」，
   按**运行机器的本地时区**解释成时间戳。这与 `timelineService.toDayKey`
   用的「服务器本地时区」是同一套约定（单机自托管下服务器就是用户所在的
   地方，`17 §1`），两者不打架。**将来要支持多时区，这两处必须一起改。**
3. **读不出来不能让上传失败。** 截图、聊天软件导出的图、被编辑过的图
   都可能没有 EXIF。一律返回 `null`，业务层回落 `createdAt`（§3）。
   **未来的时间一律丢弃** —— 相机时钟没设过是常事，而一个 2035 年的时间戳
   会让这张照片永远排在相册最前面，比没有时间更糟。
   只挡未来，不挡「太旧」：老照片本来就可能是几十年前的。

优先级：**显式传的 `takenAt`（§6 的表单字段）> EXIF > `null`**。
用户手动写的时间比相机时钟可信。

## 14. Caching

- 原图与缩略图：文件名是 UUID，内容不变，可以 `immutable` 长期缓存
- AI 响应：本项目是本地单人使用，不做响应缓存。同一条消息重复请求直接重新生成

## 15. Storage Layer

所有数据访问收在 `src/services/` 之后：

```text
services/
  photoService
  memoryService
  mediaService      文件读写与校验
  conversationService
  journalService
  aiService
  backupService     见 18-BACKUP_PROTOCOL.md
```

页面与组件**不得**直接调用 Prisma。

## 16. Deletion

**两阶段，顺序不可交换：先删文件，再删记录。**

反过来的话，文件删除失败时记录已经没了，那些文件再也没人知道该删 ——
成为永远查不到的孤儿。按现在的顺序，最坏情况是留下一条指向缺失文件的记录，
这是看得见、可修复的。

```text
1. 校验 ownership
2. 收集全部 storage key（原图 + 缩略图 + 任何派生）
3. 逐个删文件；ENOENT 不算失败（目标状态已达成）
4. 有失败 → 抛 DELETION_INCOMPLETE，**保留记录**，让用户重试
5. 全部成功 → 删数据库记录（级联带走 analysis / conversation / journal / 分组关系）
```

**分组（Memory）的删除不同**：只断开关系，不碰照片文件。

## 17. Timeline API

> 2026-10-10 新增。编号排在最后是为了**不打乱 §10–§16 的引用** ——
> 它在逻辑上属于 §6（照片）那一族，但重编号会把文档里所有交叉引用改一遍，
> 风险大于收益。

```text
GET    /api/timeline                按天分组的照片，天倒序
PATCH  /api/timeline/:dayKey        写某一天的主题名（空字符串 = 清除）
```

`:dayKey` 是 `YYYY-MM-DD`，**本地日历日**（见 §3 DayTheme）。

### 分组规则

照片属于哪一天：**拍摄时间优先，缺失时回落导入时间**（与 `§3` 的排序规则一致）。
排序与分组必须用**同一个值**，否则会出现「排在最前面但分到第二天」这种自相矛盾的结果。

### 主题名的来源

**由用户自己写，不做 AI 自动提炼**（2026-10-10 决定，推翻了同日上午的「默认提炼」）。
理由见 §3 的 `DayTheme`。

没写的时候前端显示一个**淡淡的占位**：那一天的拍摄时段（"夜里"、"午后到傍晚"）——
拍摄时间是**事实**不是推测，所以它可以当占位；而名字得是用户自己的话。

`source` 字段保留着（`09 §6` 的来源标记）。现在只可能是 `user`，
但将来若做「让 AI 起一个」这种**用户主动触发**的入口（像日志那样，`01 §9`），就地可用。

### 待补

现在是取回照片后在 JS 里分组与排序 —— 「拍摄时间缺失时回落导入时间」这个
coalesce 没法用 Prisma 的 `orderBy` 表达。精选规模下没问题，
但**照片库变大前必须改成按天游标分页**，否则一次要把整个库读进内存。
