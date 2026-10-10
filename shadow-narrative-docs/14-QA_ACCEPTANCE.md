# Shadow Narrative — Final QA & Acceptance

## 0. 产品边界验收

[ ] 没有支付
[ ] 没有订阅
[ ] 没有会员体系
[ ] 没有广告
[ ] 没有电商/订单/计费
[ ] 没有商业套餐或变现入口
[ ] 没有企业售卖或多租户商业化模块
[ ] 产品仍然围绕个人数字记忆体验


## A. 原始愿景验收

### 必须是

- 黑色沉浸式空间
- 第一屏是斜轴相册，不是平铺网格
- 进照片先是**真实原图**，点「Into this moment」才变粒子
- 粒子照片
- 照片与粒子之间自然变化
- 微弱 UI
- AI 为辅助，但上传即开口
- 日志是记忆阅读的一部分
- 所有状态像同一空间

### 必须不是

- 普通相册
- Dashboard
- ChatGPT clone
- 游戏化银河
- 商业化平台
- 3D 展厅

## B. Album（第一屏）

[ ] 是斜轴排布，**不是平铺网格**
[ ] 进一步的照片有明确景深（更小、更暗）
[ ] 黑场足够干净
[ ] 导航不喧宾夺主
[ ] 一次只有一张是焦点，且无歧义
[ ] 拖拽 / 滚轮 / 方向键都能沿轴移动
[ ] 点击进入有镜头推进，不是硬切
[ ] 空态安静，不显示"暂无内容"
[ ] 不出现模板感

## C. Particle Engine

[ ] Photo → Particle
[ ] Particle → Photo
[ ] Particle Morph
[ ] Mouse interaction
[ ] Touch interaction
[ ] Recovery
[ ] High/Medium/Low
[ ] WebGL fallback
[ ] 没有大规模 DOM 粒子

## D. 原图 ⇄ 粒子（Into this moment）

[ ] 进入照片默认是**清晰可辨认的原图**
[ ] 按钮文案是**「Into this moment」**，不是功能描述
[ ] 点击后波前**从画面中心开始**，向外扩散
[ ] 同一时刻同一位置**只显示照片或粒子中的一种**
[ ] 波前不是机械的圆（有噪声扰动）
[ ] 1200ms 内完成
[ ] 可手动切换
[ ] 切换可打断、可逆
[ ] Conversation / Journal 不触发切换
[ ] 每次进入都是原图（状态不持久化）

## E. Memory Theater

[ ] 主视觉为当前 Memory
[ ] 粒子与照片统一
[ ] 日期、标题、摘要清晰
[ ] View Story 明确
[ ] Scene transition 自然

## F. Journal

[ ] 阅读宽度合理
[ ] 行距舒适
[ ] 留白充分
[ ] 背景不过度抢注意
[ ] 文字进入自然
[ ] AI 生成的内容有事实边界

## G. Conversation 与字幕

[ ] 上传后 AI **必有反应**，不沉默
[ ] 字幕最多两句
[ ] 字幕不以气泡呈现，像电影字幕
[ ] 展开对话后，字幕就是第一条
[ ] 看不懂时会**提问**，不是硬猜
[ ] **不出现对每张照片都成立的空话**（"这是一张很棒的照片"）
[ ] 不像普通 ChatGPT
[ ] 当前照片始终可感知
[ ] 对话不改变原图/粒子模式
[ ] 不确定内容标明来源
[ ] 可以生成 Journal，但**不自动生成**
[ ] 陪伴语气温柔克制（无 emoji、无感叹号、不说教）
[ ] 没有排他性语言与依赖诱导
[ ] 用户否认情绪推测后立刻收回
[ ] 危机信号触发求助资源引导

## H. Data

[ ] 上传生成 Photo（**不是先建 Memory**）
[ ] 分组是可选的，不分组不影响任何功能
[ ] 一张照片可以属于多个分组
[ ] 删除分组**不删照片**
[ ] Save
[ ] Reload
[ ] Edit（caption / favorite / takenAt）
[ ] Delete（先删文件再删记录，见 `08-DATA_API_SPEC.md` §16）
[ ] 文件删除失败时保留记录并报「未完成」
[ ] 派生资源清理干净，不留孤儿
[ ] 数据全部落在 `SN_DATA_DIR` 内

## I. AI

[ ] Image analysis schema valid
[ ] Confidence/source supported
[ ] No fabricated facts
[ ] JSON validation
[ ] Timeout handled
[ ] Retry controlled
[ ] Prompt injection handled
[ ] 上传即触发，不阻塞上传响应
[ ] 轮询超时后标记 failed 并允许手动重试
[ ] 自动分析可关闭，关闭后照片不会被发给模型
[ ] 界面明确告知照片会被发给模型

## J. Mobile

[ ] 不是 Desktop 缩小
[ ] Touch interaction natural
[ ] Bottom navigation usable
[ ] Controls become sheet
[ ] Particle density adaptive
[ ] Text not cut off

## K. Performance & Device Adaptation

档位矩阵与阈值见 `15-DEVICE_ADAPTATION.md`。

[ ] 三层探测生效：L1 静态特征 / L2 启动微基准 / L3 运行时监测
[ ] 自动降档只降不升，无抖动循环
[ ] 手动选过档位后自动降档关闭
[ ] `?tier=` / `?dpr=` / `?post=` 强制参数可用（开发模式）
[ ] 降级顺序符合 `15` §5，未出现被禁止的顺序
[ ] Low 与 Minimal 档下照片仍可识别
[ ] Low 与 Minimal 档下指针仍有反馈
[ ] Low 与 Minimal 档下转场仍不是 fade
[ ] 后台标签停止 RAF，回前台无首帧卡顿
[ ] WebGL context lost 后能恢复，不显示黑屏
[ ] 无 WebGL2 时安静降级为静态浏览，不显示错误文案
[ ] DPR capped/adaptive
[ ] large images do not lock UI

## L. Accessibility

[ ] keyboard navigation
[ ] focus visible
[ ] aria labels
[ ] reduced motion
[ ] readable contrast
[ ] dialogs focus trap

## M. Error/Empty/Loading

[ ] Empty state remains beautiful
[ ] Loading uses product language
[ ] WebGL failure handled
[ ] Image error handled
[ ] AI error handled
[ ] Network error handled

## N. Code Quality

[ ] TypeScript strict
[ ] no unexplained any
[ ] engine/UI separation
[ ] AI/service separation
[ ] reusable types
[ ] no giant App component
[ ] no per-frame React rerender loop

## O. Full Journey Test

完整走通：

```text
打开（Album，斜轴）
↓
拖入一张照片
↓
照片以原图出现（不等网络）
↓
字幕浮现（AI 说的第一句话）
↓
回一句，AI 接住
↓
收藏
↓
回 Album，照片在轴上
↓
拖拽沿轴走到另一张
↓
点击 → 相机推进
↓
Photo View（原图）
↓
点「Into this moment」 → 变粒子
↓
拖拽旋转
↓
整理成日志
↓
读日志
↓
返回 Album
↓
刷新 → 数据仍在
```

## P. Final Visual Question

完成以后必须回答：

> **如果把所有文字、按钮、Logo 暂时隐藏，这个产品是否仍然具有强烈的、属于 Shadow Narrative 的视觉识别？**

如果答案是否定的，则还需要继续做 Visual Polish。

## Q. Final Release Gate

只有同时满足：

- 视觉方向正确
- 粒子效果正确
- 核心流程正确
- 数据持久化正确
- AI 边界正确
- Mobile 可用
- 性能可接受
- 安全检查通过

才允许认为 Shadow Narrative 第一版完成。
