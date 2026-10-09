/**
 * 内置示例记忆。
 *
 * Round 3A 阶段首页用内置数据成型 —— 先验证版式、透明度、留白这些视觉规格，
 * 不引入数据库。3B 接入 Prisma 后，这里会被 memoryService 的查询结果替换。
 *
 * 示例图由 scripts/make-sample-image.mjs 生成，无版权问题。
 */

export interface SampleMemory {
  title: string;
  /** 展示用日期，格式见 02-DESIGN_SYSTEM.md §4 */
  date: string;
  imageUrl: string;
}

export const SAMPLE_MEMORY: SampleMemory = {
  title: "黄昏",
  date: "2025 · 09 · 28",
  imageUrl: "/sample/dusk.png",
};
