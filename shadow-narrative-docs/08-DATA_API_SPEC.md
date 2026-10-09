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
  // SHA-256，用于备份去重与完整性校验（见 18-BACKUP_PROTOCOL.md §4）
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

  // 上传后是否自动把照片发给模型分析（09 §22）
  autoAnalyze      Boolean @default(true)

  // 备份（18-BACKUP_PROTOCOL.md）
  backupAuto       Boolean @default(false)
  backupEndpoint   String?
  backupToken      String?

  updatedAt DateTime @updatedAt
}
```

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
takenAt     string?   可选，ISO 日期；缺省时尝试从 EXIF 读
```

服务端顺序**不可交换**：

```text
1. 校验 MIME / 大小 / 扩展名
2. 校验真实格式（读文件头，不信浏览器给的 MIME）
3. 校验实际 dimensions
4. 算 contentHash（SHA-256）
5. 落盘原图
6. 建 Photo 记录（aiState = "pending"）
7. 生成缩略图（见下方说明）
8. 异步触发 AI 分析 —— 不阻塞响应
```

响应 `201`，**不包含 AI 结果**。AI 的字幕通过 §10 的推送或轮询拿到。

### 缩略图

`thumbnailKey` 目前**不生成**。像素处理属于 Python 图像服务的职责
（`05-TECH_ARCHITECTURE.md` §7），该服务尚未建。

在那之前，斜轴与列表直接用原图，靠浏览器缩放。这对几十张的精选规模可以接受，
但**照片库变大前必须补上**，否则一次加载几十张原图会吃光内存。

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
