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
- 粒子照片
- 照片与粒子之间自然变化
- 微弱 UI
- AI 为辅助
- 日记是记忆阅读的一部分
- 所有状态像同一空间

### 必须不是

- 普通相册
- Dashboard
- ChatGPT clone
- 游戏化银河
- 商业化平台

## B. 首页

[ ] 首屏第一视觉是照片/粒子
[ ] 黑场足够干净
[ ] 导航不喧宾夺主
[ ] 日期/标题足够克制
[ ] 鼠标移动有反馈
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

## D. Memory Field

[ ] 不是图片网格
[ ] 节点有空间感
[ ] Hover 有信息
[ ] Click 能进入 Memory Theater
[ ] 节点数量增加时仍可探索

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

## G. Conversation

[ ] 不像普通 ChatGPT
[ ] 当前 Memory 始终可感知
[ ] AI 输出简洁
[ ] 不确定内容标明来源
[ ] 可以生成 Journal
[ ] 陪伴语气温柔克制（无 emoji、无感叹号、不说教）
[ ] 没有排他性语言与依赖诱导
[ ] 用户否认情绪推测后立刻收回
[ ] 危机信号触发求助资源引导

## H. Data

[ ] Create Memory
[ ] Upload
[ ] Save
[ ] Reload
[ ] Edit
[ ] Delete
[ ] Derived assets clean up

## I. AI

[ ] Image analysis schema valid
[ ] Confidence/source supported
[ ] No fabricated facts
[ ] JSON validation
[ ] Timeout handled
[ ] Retry controlled
[ ] Prompt injection handled

## J. Mobile

[ ] 不是 Desktop 缩小
[ ] Touch interaction natural
[ ] Bottom navigation usable
[ ] Controls become sheet
[ ] Particle density adaptive
[ ] Text not cut off

## K. Performance

[ ] Desktop target near 60 FPS
[ ] Mobile target 30–60 FPS where hardware allows
[ ] DPR capped/adaptive
[ ] particle tier works
[ ] hidden tab reduces expensive work
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
Open
↓
Create
↓
Upload
↓
Photo → Particle
↓
Interact
↓
Morph
↓
Memory Field
↓
Memory Theater
↓
Story
↓
Conversation
↓
Generate Journal
↓
Read Journal
↓
Save
↓
Reload
↓
Reopen
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
