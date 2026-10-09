// Prisma 7 配置。
//
// v7 的破坏性变更：连接串不再写在 schema.prisma 的 datasource 里，
// 而是移到本文件；运行时则由 driver adapter 传给 PrismaClient
// （见 src/lib/prisma.ts）。
//
// 环境变量：项目统一用 .env.local（Next 也读它）。Prisma 不会自动加载它，
// 所以这里显式指定路径 —— 保持单一配置来源，不额外维护一个 .env。

import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
