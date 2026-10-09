# Shadow Narrative — Implementation Plan / Agent Runbook

## 总原则

按 Round 执行。**每轮完成后先运行、检查，再进入下一轮。**

不要一次性实现全部产品。

**Round 0–3 已完成**（见 git 历史）。从 Round 4 开始。

## Round 0 — Design & Technical Recon ✅

产出架构、设计、粒子方案三份决策文档。已完成。

## Round 1 — Foundation ✅

Next.js 16 + React 19 + TS strict + Tailwind 4 + 设计 token + 目录骨架。已完成。

## Round 2 — Particle Engine ✅

采样、Hilbert 对应关系、着色器、指针场、性能档位。
`/dev/particle` 调试台。已完成。

## Round 3 — Morph + 首页 ✅

原地滑动转场、OrbitControls 旋转、粒子厚度、首页版式、控制面板。
已完成。

---

## Round 4 — 原图 ⇄ 粒子 ✅

这是新架构的第一个改动：现在只有粒子，需要先有「原图」这一层。

完成：

- 贴图四边形渲染（原图）
- 双模式共存与交叉切换（`16-ALBUM_SPACE.md` §8）
- 手动切换入口
- GSAP 引入与缓动换算（`16-ALBUM_SPACE.md` §11.2）
- 原图模式关闭旋转；切回时相机平滑转正（§8.5）

验收：

- 进入照片默认是**清晰的原图**，不是粒子
- 点 View Memory 后 1200ms 内完成过渡
- **中间态不能像叠了两张图** —— 粒子要中途才成形
- 切换可逆、可打断

实测：中间态 `gather` 与透明度同步推进（0.391 / 0.391），确实是「中途成形」。

## Round 5 — Album（斜轴相册）

完成：

- 斜轴排布（`16-ALBUM_SPACE.md` §2）
- 沿轴导航（拖拽 / 滚轮 / 方向键）
- 焦点判定与视觉强调
- 边缘粒子化，**只给焦点附近加粒子**（§2.4 的性能约束）
- 点击进入的镜头（§11.3）
- 运行时调参入口（轴方向、间距必须能现场调）

验收：

- 不是平铺网格
- 进一步的照片有明确的景深（更小、更暗）
- 40 张时粒子总数不随张数增长（焦点窗口生效）
- 焦点在哪张无歧义

## Round 6 — Library 抽屉

完成：

- 左侧滑出（复用控制面板机制）
- 按时间分组的列表
- 收藏切换
- 搜索

验收：

- 不是网格
- 键盘可完整操作
- 打开时不遮挡斜轴

## Round 7 — 上传与字幕

完成：

- 上传链路（`08-DATA_API_SPEC.md` §6）
- 异步 AI 触发与轮询送达（§10）
- 字幕渲染（`09-AI_SPEC.md` §21）
- 自动分析开关

验收：

- 上传后立刻看到原图，不等网络
- 字幕在 AI 返回后浮现，不打断操作
- 字幕最多两句
- **看不懂时会提问**，不会说空话

## Round 8 — 对话与日志

完成：

- Conversation 展开/收起
- 消息流（不用气泡）
- 日志生成（用户主动触发）
- 日志阅读态

验收：

- 不像普通 ChatGPT
- 对话不改变显示模式
- 日志**不会自动生成**

## Round 9 — 收藏与分组

完成：

- 收藏（照片级）
- 分组创建、加入、移出
- Memory Theater

验收：

- 收藏后出现在斜轴
- 删除分组**不删照片**

## Round 10 — SQLite 迁移与自托管

完成：

- PostgreSQL → SQLite 迁移（`08-DATA_API_SPEC.md` §2）
- 新的照片为主 schema
- 数据目录与 `SN_DATA_DIR`（`17-SELF_HOSTING.md` §3）
- `npm run setup` 首次运行流程
- AI 凭据放到本机

验收：

- 从零跑通：clone → install → setup → start → 打开就能用
- 数据全部落在数据目录里
- 不需要装任何数据库服务

## Round 11 — 备份

完成：

- 协议客户端（`18-BACKUP_PROTOCOL.md` §8）
- 手动触发 + 可选自动
- 恢复流程（导入到新目录）

验收：

- 同一张照片重复备份只传一次
- 恢复之后数据完整
- 备份入口处**明确写出「后端能读到内容」**

## Round 12 — Mobile + Performance + Polish

完成：

- 移动端交互（`07-UI_PAGE_SPECS.md` §9）
- 性能档位适配到新场景（`15-DEVICE_ADAPTATION.md`）
- 无障碍完整过一遍
- 视觉打磨

验收：

- 移动端不是桌面缩小
- Low 档下相册退化为纯贴图仍可用
- 键盘可完成全部主流程

---

## 每轮完成模板

```text
Round:
Completed:
Changed files:
New files:
Run command:
Verification:
Performance:
Visual result:
Known issues:
Next round:
```
