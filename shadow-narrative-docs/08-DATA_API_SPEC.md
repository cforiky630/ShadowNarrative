# Shadow Narrative — Data & API Specification

## 1. Data Principles

Memory 是主聚合对象。

图片是 Memory 的媒体资源。

Diary、Conversation、ParticlePreset 属于 Memory 的附属能力。

**所有实体从第一天就带 `userId`。** 产品当前是单用户，但用户已确认将来要做多用户，
因此 schema 与 service 层从一开始就按多租户写，只是暂不做登录 UI。

## 2. Entities

字段类型使用 Prisma schema 语法（本项目用 Prisma + PostgreSQL）。
`?` 表示可空。

### User

```prisma
model User {
  id        String   @id @default(cuid())
  email     String?  @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memories  Memory[]
}
```

### Memory

```prisma
model Memory {
  id               String    @id @default(cuid())
  userId           String
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  title            String?
  summary          String?
  location         String?
  memoryDate       DateTime?
  coverMediaId     String?
  particlePresetId String?

  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  media            MediaAsset[]
  diary            DiaryEntry[]
  conversation     Conversation?
  particlePreset   ParticlePreset?

  @@index([userId, memoryDate])
  @@index([userId, updatedAt])
}
```

### MediaAsset

```prisma
model MediaAsset {
  id                String   @id @default(cuid())
  memoryId          String
  memory            Memory   @relation(fields: [memoryId], references: [id], onDelete: Cascade)

  storageKey        String   @unique    // original
  thumbnailKey      String?             // 长边 512
  mediumKey         String?             // 长边 1600
  particleSourceKey String?             // 采样用，档位相关

  mimeType          String
  width             Int
  height            Int
  byteSize          Int
  metadataJson      Json?                // 已剥离敏感字段的 EXIF 子集

  createdAt         DateTime @default(now())

  @@index([memoryId])
}
```

`width` / `height` / `byteSize` 为必需：无它们无法做布局占位与配额检查。

### DiaryEntry

```prisma
model DiaryEntry {
  id            String   @id @default(cuid())
  memoryId      String
  memory        Memory   @relation(fields: [memoryId], references: [id], onDelete: Cascade)

  title         String?
  content       String
  status        String   @default("draft")   // draft | published
  sourceVersion Int      @default(1)         // 每次 AI 重写 +1，用于并发检测

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([memoryId])
}
```

### Conversation

```prisma
model Conversation {
  id        String   @id @default(cuid())
  memoryId  String   @unique              // 一个 Memory 一段对话
  memory    Memory   @relation(fields: [memoryId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages  ConversationMessage[]
}
```

### ConversationMessage

```prisma
model ConversationMessage {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  role           String       // user | assistant
  content        String
  sourceRefsJson Json?        // 证据来源，见 09-AI_SPEC.md §6

  createdAt      DateTime     @default(now())

  @@index([conversationId, createdAt])
}
```

### ParticlePreset

```prisma
model ParticlePreset {
  id             String   @id @default(cuid())
  memoryId       String   @unique
  memory         Memory   @relation(fields: [memoryId], references: [id], onDelete: Cascade)

  name           String   @default("Calm")   // Calm | Breeze | Focus | Drift
  density        Float
  size           Float
  motion         Float
  turbulence     Float
  mouseRadius    Float
  mouseForce     Float
  noiseSpeed     Float
  colorVariation Float

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

### 级联规则

| 删除 | 数据库级联 | 应用层必须补做 |
|---|---|---|
| `Memory` | 级联删除 media / diary / conversation / preset | **删除对象存储中的所有派生文件**（DB 级联管不到文件） |
| `MediaAsset` | — | 删除 original / thumbnail / medium / particleSource 四个 key |
| `User` | 级联删除全部 Memory 及其附属 | 同上，且按存储前缀批量清理 |

**不可出现孤儿资源**（对应 §15）。

## 3. API Style

默认 REST/Route Handler。

如果项目采用 tRPC/Server Actions，也可以，但必须保持职责清晰。

### 多租户约束（强制）

每个 Route Handler 必须：

```text
1. 解析当前 userId（现在是固定的本地用户；将来接登录）
2. 查询时一律带 userId 条件，不做「先查出再判断」的两段式
3. 返回 404 而非 403 —— 不泄露「这个资源存在但不属于你」
```

service 层统一走一个 `assertOwnership(userId, memoryId)` 辅助函数，不允许各路由自己写。

## 4. Memory API

```text
GET    /api/memories
POST   /api/memories
GET    /api/memories/:id
PATCH  /api/memories/:id
DELETE /api/memories/:id
```

### POST /api/memories

请求：

```json
{
  "title": "毛毛",
  "memoryDate": "2025-09-28",
  "location": "家",
  "summary": "那天晚上很安静"
}
```

`title` / `memoryDate` / `location` / `summary` 全部可选。响应：

```json
{
  "data": {
    "id": "clx...",
    "title": "毛毛",
    "memoryDate": "2025-09-28T00:00:00.000Z",
    "createdAt": "2026-10-09T06:00:00.000Z"
  },
  "meta": {}
}
```

### GET /api/memories

查询参数：

```text
cursor    string   游标（见 §9）
limit     number   默认 20，上限 100
```

响应：

```json
{
  "data": [ { "id": "clx...", "title": "毛毛", "coverUrl": "..." } ],
  "meta": { "nextCursor": "clx...", "hasMore": true }
}
```

### PATCH /api/memories/:id

请求体为部分字段。响应为完整 Memory 对象。

## 5. Media API

```text
POST   /api/media/upload
GET    /api/media/:id
DELETE /api/media/:id
```

生产环境建议使用预签名上传，避免服务器承担大文件中转。

### POST /api/media/upload

`multipart/form-data`：

```text
file      File      必需
memoryId  string    必需
```

服务端顺序（顺序不可交换）：

```text
1. 校验 MIME / 大小 / 扩展名
2. 解码验证（真的能解出像素，不能只信 MIME）
3. 校验实际 dimensions
4. 交给图像管线（Python 服务，见 05 §7）生成三个派生版本
5. 写入对象存储
6. 写 MediaAsset 记录
```

响应：

```json
{
  "data": {
    "id": "clx...",
    "width": 4032,
    "height": 3024,
    "thumbnailUrl": "...",
    "mediumUrl": "..."
  },
  "meta": {}
}
```

## 6. Diary API

```text
GET    /api/memories/:id/diary
POST   /api/memories/:id/diary
PATCH  /api/memories/:id/diary
```

### PATCH 的并发保护

请求必须带 `sourceVersion`：

```json
{
  "content": "...",
  "sourceVersion": 3
}
```

若与服务端当前版本不符，返回 `409 CONFLICT`。这是为了防止 AI 重写覆盖用户手改的内容。

## 7. Conversation API

```text
GET  /api/memories/:id/conversation
POST /api/memories/:id/conversation/messages
```

### POST 请求

```json
{
  "content": "今天好累"
}
```

响应：

```json
{
  "data": {
    "role": "assistant",
    "content": "今天发生什么了。",
    "sourceRefs": []
  },
  "meta": { "model": "deepseek-flash" }
}
```

AI 的语气与边界约束见 `09-AI_SPEC.md`，不在本层做内容改写。

## 8. AI API

```text
POST /api/ai/analyze-image
POST /api/ai/memory-question
POST /api/ai/generate-diary
POST /api/ai/rewrite-diary
```

全部为服务端代理，**API key 绝不进入客户端**（见 `12-SECURITY_PRIVACY.md` §5）。

### 结构化输出的失败处理

DeepSeek 的 JSON mode 偶尔会返回空内容（见 `09-AI_SPEC.md` §20）。
所有 AI 端点必须：

```text
1. 用 schema 校验响应
2. 校验失败 → 重试 1 次
3. 仍失败 → 返回 502，客户端降级到「稍后再试」文案，不显示半截结果
```

## 9. Pagination

Memory Field：

支持分页/游标（cursor-based，不用 offset）。

默认不要一次加载全部媒体原图。

## 10. API Response

成功建议：

```json
{
  "data": {},
  "meta": {}
}
```

错误：

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "requestId": "..."
  }
}
```

错误码约定：

```text
400  INVALID_INPUT       参数不合法
404  NOT_FOUND           不存在，或不属于当前用户（不区分）
409  CONFLICT            sourceVersion 不一致
413  PAYLOAD_TOO_LARGE   文件超限
415  UNSUPPORTED_MEDIA   格式不支持
429  RATE_LIMITED        触发限流
502  AI_UPSTREAM_FAILED  AI 调用失败或输出不合法
```

## 11. Upload Rules

必须校验：

- MIME type
- 文件大小
- 扩展名
- 解码是否成功
- 图片实际 dimensions

不能仅依赖浏览器提供的 MIME。

## 12. EXIF

EXIF 可以用于辅助：

- 日期
- GPS
- 相机信息

但：

- 上传到公开 URL 时默认不要暴露不必要的 EXIF
- GPS 属于敏感位置数据，应最小化保存

`metadataJson` 只保留白名单字段，GPS 默认不写入。见 `12-SECURITY_PRIVACY.md` §3。

## 13. Storage Layer

**第一版就用 PostgreSQL**（本机已装 18.6，见 `recon/environment.md`），不用 IndexedDB。

所有数据访问收在 `src/services/` 之后：

```text
services/
  memoryService
  mediaService
  diaryService
  conversationService
  aiService
  imageService      ← 调用 Python 图像服务
```

页面与组件**不得**直接调用 Prisma，必须经过 service 层。

## 14. Caching

至少考虑：

- thumbnail cache
- medium cache
- particle source cache
- AI response cache（需注意隐私）

## 15. Deletion

删除 Memory 时必须处理：

- database rows
- object storage files
- diary
- conversation
- generated AI artifacts

不可出现孤儿资源。

删除是**两阶段**的：先删文件，再删 DB 记录。反过来的话，文件删除失败就会产生查不到的孤儿文件。
