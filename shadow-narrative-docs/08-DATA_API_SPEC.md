# Shadow Narrative — Data & API Specification

## 1. Data Principles

Memory 是主聚合对象。

图片是 Memory 的媒体资源。

Diary、Conversation、ParticlePreset 属于 Memory 的附属能力。

## 2. Entities

### User

```text
id
email/name (optional for local MVP)
createdAt
updatedAt
```

### Memory

```text
id
userId
publicId/title
summary
location
memoryDate
coverMediaId
particlePresetId
createdAt
updatedAt
```

### MediaAsset

```text
id
memoryId
storageKey
thumbnailKey
mediumKey
particleSourceKey
mimeType
width
height
metadataJson
createdAt
```

### DiaryEntry

```text
id
memoryId
title
content
status
sourceVersion
createdAt
updatedAt
```

### Conversation

```text
id
memoryId
createdAt
updatedAt
```

### ConversationMessage

```text
id
conversationId
role
content
sourceRefsJson
createdAt
```

### ParticlePreset

```text
id
memoryId
name
density
size
motion
turbulence
mouseRadius
mouseForce
noiseSpeed
colorVariation
createdAt
updatedAt
```

## 3. API Style

默认 REST/Route Handler。

如果项目采用 tRPC/Server Actions，也可以，但必须保持职责清晰。

## 4. Memory API

```text
GET    /api/memories
POST   /api/memories
GET    /api/memories/:id
PATCH  /api/memories/:id
DELETE /api/memories/:id
```

## 5. Media API

```text
POST   /api/media/upload
GET    /api/media/:id
DELETE /api/media/:id
```

生产环境建议使用预签名上传，避免服务器承担大文件中转。

## 6. Diary API

```text
GET    /api/memories/:id/diary
POST   /api/memories/:id/diary
PATCH  /api/memories/:id/diary
```

## 7. Conversation API

```text
GET  /api/memories/:id/conversation
POST /api/memories/:id/conversation/messages
```

## 8. AI API

```text
POST /api/ai/analyze-image
POST /api/ai/memory-question
POST /api/ai/generate-diary
POST /api/ai/rewrite-diary
```

## 9. Pagination

Memory Field：

支持分页/游标。

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

## 13. Local-first MVP

第一版允许使用：

- IndexedDB
- local file object URL
- mock data

但服务层 API 必须保持未来可替换为真实后端。

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
