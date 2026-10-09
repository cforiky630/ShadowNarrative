import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma Client 单例。
 *
 * Prisma 7 起连接不再从 schema.prisma 读取，而是在构造时通过 driver adapter 传入。
 *
 * 用 globalThis 兜住实例：Next 开发模式的热重载会反复求值模块，
 * 每次都 new 一个 PrismaClient 会持续创建连接池，很快把 Postgres 的连接数吃满。
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL 未设置。请检查项目根目录的 .env.local（模板见 .env.example）。",
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
