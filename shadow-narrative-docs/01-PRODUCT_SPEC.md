# Shadow Narrative — Product Specification

## 1. 产品定位

Shadow Narrative 是一个面向个人照片与生活记忆的沉浸式数字记忆空间。

它解决的问题不是“如何存照片”，而是：

> **如何让被保存的照片重新变成可以被探索、理解、回忆和讲述的记忆。**

## 2. 用户价值

用户能够：

- 保存照片与媒体
- 将照片组织为 Memory
- 以粒子方式探索照片
- 在空间中浏览过去的记忆
- 与 AI 讨论照片和记忆
- 将碎片整理成日记/故事
- 再次进入已经保存的记忆

## 3. 设计人格

产品人格：

- 安静
- 克制
- 温柔
- 细腻
- 有空间感
- 有一点神秘
- 不喧闹
- 不游戏化

## 4. 核心对象：Memory

Memory 不是一张图片。

一条 Memory 是：

```text
Memory
├── title
├── date
├── location
├── photos
├── optional video
├── user notes
├── AI understanding
├── conversation
├── diary
├── tags
└── particle preset
```

一个 Memory 可以包含多张照片。

## 5. 核心空间

### Memory Space

产品入口。以当前推荐/最近记忆作为粒子主体。

### Memory Field

探索所有 Memory 的空间。

### Memory Theater

查看某一个 Memory 的完整故事。

### Photo Particle

照片粒子化后的核心交互状态。

### Memory Conversation

针对当前 Memory 的 AI 对话。

### Journal

当前 Memory 的沉浸式文字阅读/编辑状态。

## 6. 主要用户流程

### 创建记忆

```text
Create
↓
选择照片
↓
输入可选信息
↓
生成 Memory
↓
照片粒子化
↓
进入 Memory Theater
```

### 浏览记忆

```text
Memory Field
↓
Hover Memory
↓
Preview
↓
Focus
↓
Open
```

### 故事流程

```text
Memory Theater
↓
View Story
↓
Scene 01
↓
Scene 02
↓
Scene 03
↓
Journal / Conversation
```

## 7. MVP 必须完成

- 创建 Memory
- 图片上传
- Photo → Particle
- Particle interaction
- Particle Morph
- Memory Space
- Memory Field
- Memory Theater
- Journal 阅读
- Mock AI Conversation
- 本地/持久化数据结构
- Mobile 基础适配

## 8. 明确不做的方向

以下内容不属于 Shadow Narrative 产品范围，不应在任何开发阶段主动加入：

- 支付
- 订阅
- 会员体系
- 商业套餐
- 广告与广告位
- 电商与交易
- 企业售卖功能
- 多租户商业化架构
- 计费、发票、订单系统
- 变现或商业推广机制

此外，社交、公开分享、推荐算法、多人协作、复杂后台管理也不属于当前核心范围，除非未来另行明确提出。

## 9. 不允许的产品漂移

不要把产品的重点改成：

“AI 自动帮你写日记”。

真正主角仍是：

**记忆本身 + 照片 + 粒子 + 沉浸式浏览。**

AI 是辅助能力。

## 10. 成功标准

成功的产品不是功能最多，而是：

> 用户愿意停留、探索、触碰和重新阅读自己的记忆。
