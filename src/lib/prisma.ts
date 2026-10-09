import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { resolveDatabaseUrl } from "./dataDir";

/**
 * Prisma Client 单例。
 *
 * Prisma 7 起连接不再从 schema.prisma 读取，而是在构造时通过 driver adapter 传入。
 * 数据库位置由 dataDir.ts 推导 —— 与 prisma.config.ts 用的是同一个函数，
 * 不会出现「migrate 写进一个库、应用读另一个库」。
 *
 * 用 globalThis 兜住实例：Next 开发模式的热重载会反复求值模块，
 * 每次都 new 一个 PrismaClient 会持续开连接，很快把句柄吃满。
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: resolveDatabaseUrl() }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
