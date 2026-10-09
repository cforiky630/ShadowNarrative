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

用户只能访问自己的 Memory 和媒体。

API 所有资源必须检查 ownership。

## 5. AI Privacy

不要默认把：

- 全部历史照片
- 全部聊天记录
- 全部 GPS

发送给 AI。

只发送完成当前任务所需的数据。

### 上传即分析意味着什么

`09-AI_SPEC.md` §21.2 规定上传后自动把照片发给模型。在「不加密、服务端 AI」
的架构下（`17-SELF_HOSTING.md` §4），用户必须清楚这一点：

- 设置里必须能**关掉**自动分析（`autoAnalyze`）
- 开启状态下，界面上要明确告知「照片会被发送给模型」
- 关掉之后，照片只能在用户主动点击时才被发送
- **日志里不得记录被发送的照片内容**（§10）

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

用户删除 Memory 后：

- DB records
- object storage
- derived files
- AI artifacts

都要按策略删除。

## 12. Sharing

如果未来支持分享：

默认 private。

公开链接必须是显式操作。

公开分享内容默认移除敏感 metadata。
