-- 默认预设由 calm 换成 drift（06 §18，用户 2026-10-11 定）
--
-- ⚠️ 这一列**现在还没有人写** —— `08 §3` 记的是「打算按用户级存观看偏好」，
-- 持久化还没做；界面上的默认走 `types.DEFAULT_PRESET`。
-- 但让它继续写着 calm 是会误导的：下一个人读到 schema 会以为默认还是它。
--
-- 表很小，而且 SQLite 改默认值只能重建表（Prisma 生成的标准 12 步）。

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "particlePreset" TEXT NOT NULL DEFAULT 'drift',
    "particleParams" TEXT,
    "backupAuto" BOOLEAN NOT NULL DEFAULT false,
    "backupEndpoint" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_user_settings" ("backupAuto", "backupEndpoint", "id", "particleParams", "particlePreset", "updatedAt", "userId") SELECT "backupAuto", "backupEndpoint", "id", "particleParams", "particlePreset", "updatedAt", "userId" FROM "user_settings";
DROP TABLE "user_settings";
ALTER TABLE "new_user_settings" RENAME TO "user_settings";
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
