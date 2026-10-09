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

## 6. Prompt Injection

所有用户输入、图片文字、OCR、外部内容都视为不可信数据。

不要允许内容覆盖 system-level rules。

## 7. XSS

日记和 AI 输出必须进行安全渲染。

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

不要日志记录：

- 原图内容
- 完整日记
- 敏感 AI prompt
- GPS
- token

只记录必要的诊断数据。

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
