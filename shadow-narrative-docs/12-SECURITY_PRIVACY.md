# Shadow Narrative — Security & Privacy

## 1. 基本原则

Shadow Narrative 处理的是个人照片与可能的个人记忆内容。

默认：

> 最小化采集、最小化存储、最小化发送。

## 2. Upload Security

服务器/存储必须验证：

- MIME
- file size
- file signature（条件允许）
- dimensions
- decode success

文件名不能作为信任依据。

## 3. Image Processing

生产环境建议：

- strip unnecessary EXIF
- 对外分享时默认隐藏 GPS
- 限制最大尺寸
- 生成安全缩略图

## 4. Access Control

用户只能访问自己的照片与分组。

API 所有资源必须检查 ownership，且一律**合成在查询条件里**
（`where: { id, userId }`），不做「先查出再判断」的两段式。

**userId 只能由服务端解析，绝不能从请求里取**（`08 §1` 硬约束 #1）。
本产品当前没有鉴权（`17 §6`），客户端传来的 userId 不构成 ownership 校验，那是越权。

## 5. AI Privacy

不要默认把：

- 全部历史照片
- 全部聊天记录
- 全部 GPS

发送给 AI。

只发送完成当前任务所需的数据。

### 两个独立的隐私面（不要混为一谈）

照片会离开这台机器，有**两条**不同的路径。它们的对象、可控性、缓解手段都不同：

| | 去向 | 谁能看到 | 怎么缓解 |
|---|---|---|---|
| **模型服务商** | DeepSeek（`09-AI_SPEC.md` §20） | 服务商。**明文** | 关掉 `autoAnalyze`；只发当前这一张；不发 EXIF/GPS（§5） |
| **备份后端** | 用户自己的后端（`18-BACKUP_PROTOCOL.md`） | **没有人** —— 端到端加密（`18 §11`） | 不开启备份即可 |

**"备份是端到端的" 不等于 "照片没离开过机器"。** 这是最容易让人误解的一点：
`autoAnalyze` 开着的时候，照片以明文发给了模型服务商，
而端到端加密保护的是另一条路径上的另一个人。界面上必须分开讲。

### 上传即分析意味着什么

`09-AI_SPEC.md` §21.2 规定上传后自动把照片发给模型。用户必须清楚这一点：

- 设置里必须能**关掉**自动分析（`autoAnalyze`）
- 界面上必须告知「照片会被发送给模型」—— 但**写在开关自己那句话里**：
  开着时「照片会自动发给模型服务商分析」，关掉时「只在你点『看一眼』时才发」。
  ⚠️ 2026-10-10 改过形态：原先这里另起一段「无论开关怎么设，照片都会离开
  这台机器」，与上面那句**自相矛盾**，读起来像免责声明。
  **要求的事实一个字没少**（「发给模型服务商」两句话里都在），
  只是并进了它本来说的那件事里。见 `07 §11.3`
- 关掉之后，照片只能在用户主动点击时才被发送
- **日志里不得记录被发送的照片内容**（§10）
- `PhotoAnalysis.sentSummary` 记录「到底发出去了什么」，供界面披露（`08 §3`）

「服务端是你自己的机器」不等于可以隐去这一步 —— 照片确实离开了本进程，
去了第三方模型服务商。

## 6. Prompt Injection

所有用户输入、图片文字、OCR、外部内容都视为不可信数据。

不要允许内容覆盖 system-level rules。

## 7. XSS

日志和 AI 输出必须进行安全渲染。

默认将内容视为 plain text/Markdown-safe subset。

禁止未经清洗的 raw HTML。

## 8. CSRF / Auth

生产 API 根据实际认证方案启用：

- secure cookies
- CSRF protection（需要时）
- authorization middleware

## 9. Rate Limit

对以下接口设置 rate limit：

- AI
- upload
- conversation
- auth

## 10. Logging

不要在**运行日志**里记录：

- 原图内容
- 用户写的日志的完整正文
- 敏感 AI prompt
- GPS
- token

只记录必要的诊断数据。

> 注意区分两个「日志」：这里是**运行日志**（诊断用），
> 不是用户写的那个**日志**（`08-DATA_API_SPEC.md` 的 Journal）。

## 11. Data Deletion

用户删除照片后：

- DB records（级联带走 analysis / conversation / journal / 分组关系）
- object storage
- derived files
- AI artifacts

都要按策略删除。顺序见 `08-DATA_API_SPEC.md` §16：**先删文件，再删记录**，不可交换。

## 12. Sharing

如果未来支持分享：

默认 private。

公开链接必须是显式操作。

公开分享内容默认移除敏感 metadata。
