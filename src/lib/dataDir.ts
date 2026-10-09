import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";

/**
 * 数据目录 —— 应用与 Prisma CLI 的**唯一**来源。
 *
 * 规格：17-SELF_HOSTING.md §3
 *
 * ⚠️ 这个文件**不得** import `@/` 别名，也不得 import 任何框架代码。
 * `prisma.config.ts` 要在 Next 之外直接加载它 —— 两边推导出不同的目录，
 * 会让 `prisma migrate` 写进一个库、应用读另一个库，而且不会报错。
 *
 * 目录结构（17 §3）：
 *   <dataDir>/
 *   ├── shadow-narrative.db    SQLite 主库
 *   ├── photos/                原图
 *   ├── backup-state.json      备份游标（Round 11）
 *   └── secrets.json           AI key 等本机凭据
 */

export const DB_FILENAME = "shadow-narrative.db";
export const PHOTOS_DIRNAME = "photos";
export const SECRETS_FILENAME = "secrets.json";

/**
 * 解析数据目录。
 *
 * 顺序（17 §3）：`SN_DATA_DIR` → 生产用 `~/.shadow-narrative` → 开发用 `<cwd>/.data`。
 * 开发默认放项目内，是为了整目录被 .gitignore 挡住、删起来方便。
 */
export function resolveDataDir(): string {
  const fromEnv = process.env.SN_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  if (process.env.NODE_ENV === "production") {
    return path.join(os.homedir(), ".shadow-narrative");
  }

  return path.join(process.cwd(), ".data");
}

/** 数据目录下的一个条目。 */
function inDataDir(name: string): string {
  // turbopackIgnore：数据目录是**用户可配置的**（SN_DATA_DIR，17 §3），
  // 按设计就在项目之外。打包器的静态分析无从知道这一点，会判定为
  // 「动态文件系统访问」并把整个项目（含 public/）追踪进服务端产物。
  // 那是误报 —— 这里读写的从来不是随源码打包的资源，而是运行时的用户数据。
  return path.join(/*turbopackIgnore: true*/ resolveDataDir(), name);
}

export function resolveDatabasePath(): string {
  return inDataDir(DB_FILENAME);
}

export function resolvePhotosDir(): string {
  return inDataDir(PHOTOS_DIRNAME);
}

export function resolveSecretsPath(): string {
  return inDataDir(SECRETS_FILENAME);
}

/**
 * 数据库的 `file:` URL。
 *
 * 两个坑：
 *   1. Windows 上 `path.join` 产出反斜杠，而 `file:F:\a\b.db` 里的反斜杠会被当作
 *      转义。统一转成正斜杠。
 *   2. **盘符前不能补斜杠**。`file:/F:/...` 会被 Windows 当成无效路径
 *      （os error 123 文件名、目录名或卷标语法不正确）。POSIX 的 `/home/...`
 *      本身就是绝对路径，前缀 `file:` 即可，不要再动。
 */
export function resolveDatabaseUrl(): string {
  return `file:${resolveDatabasePath().replace(/\\/g, "/")}`;
}

/** 建立数据目录骨架。可重复调用。 */
export async function ensureDataDirs(): Promise<void> {
  await mkdir(resolvePhotosDir(), { recursive: true });
}
