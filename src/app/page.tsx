/**
 * Memory Space —— 首页
 *
 * 规格：07-UI_PAGE_SPECS.md §1
 *   - 大面积黑场，粒子照片居中，导航低存在感
 *   - 不能出现传统 hero 卡片
 *
 * Round 1 只搭版式骨架。粒子画布在 Round 2 接入（ParticleCanvas），
 * 真实 Memory 数据在 Round 3 从 Postgres 读取。
 */

/** 占位数据。Round 3 会替换为数据库查询结果。 */
const PLACEHOLDER = {
  title: "毛毛",
  date: "2025 · 09 · 28",
} as const;

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden">
      {/* 粒子画布槽位。画面高度 55–65%，垂直偏上 4%。 */}
      <div className="relative h-[60vh] w-full max-w-[1000px] -translate-y-[4%]">
        <div
          data-slot="particle-canvas"
          className="absolute inset-0 flex items-center justify-center"
        >
          {/* Round 2 接入 <ParticleCanvas />，此处暂时留空 */}
        </div>
      </div>

      {/* 标题组 */}
      <div className="mt-6 flex flex-col items-center">
        <p className="text-meta text-text-primary/55">{PLACEHOLDER.date}</p>
        <h1 className="text-title mt-2 text-text-primary/95">
          {PLACEHOLDER.title}
        </h1>
      </div>

      {/* 主操作 */}
      <button
        type="button"
        className="text-meta mt-6 text-text-primary/45 transition-opacity duration-[350ms] hover:opacity-90 focus-visible:opacity-90"
        style={{ transitionTimingFunction: "var(--ease-enter)" }}
      >
        View Memory →
      </button>
    </main>
  );
}
