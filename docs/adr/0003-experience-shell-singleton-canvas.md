# 3. 体验外壳持有常驻单例画布以消除跨路由白屏

- **状态**：已采纳 (Accepted)
- **日期**：2026-10-10
- **决策者**：项目架构组
- **相关规格**：`docs/specs/01-PRODUCT_SPEC.md §5`、`docs/specs/16-ALBUM_SPACE.md §8.6`

## 背景与问题

最初 `ParticleCanvas` 挂载在具体单张照片页面 `MemorySpace` 内部。当用户从相册或时间线点击跳转到照片页时，Next.js App Router 的路由切换导致旧组件卸载、新组件挂载，屏幕会出现空白闪烁或黑屏重新初始化画布。

## 决策

1. 将 `ParticleCanvas` 提升至体验路由组根布局 `src/components/ExperienceShell.tsx`（即 `app/(experience)/layout.tsx`）。
2. 全局保证且仅允许存在一个粒子画布单例，跨路由跳转时画布永不卸载。
3. 进入照片时采用 FLIP 技术：记录缩略图视口矩形，照片从起点飞入画布，飞入过半时画布渐显，实现零闪烁、电影级的空间过渡。

## 影响

- 彻底根除了路由跳动时的闪白与上下文丢失；
- 贯彻了“进入自己的记忆，而不是打开了一个网站”的连续空间体验。
