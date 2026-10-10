-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_day_themes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "day_themes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_day_themes" ("createdAt", "dayKey", "id", "source", "title", "updatedAt", "userId") SELECT "createdAt", "dayKey", "id", "source", "title", "updatedAt", "userId" FROM "day_themes";
DROP TABLE "day_themes";
ALTER TABLE "new_day_themes" RENAME TO "day_themes";
CREATE UNIQUE INDEX "day_themes_userId_dayKey_key" ON "day_themes"("userId", "dayKey");
CREATE TABLE "new_user_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "particlePreset" TEXT NOT NULL DEFAULT 'calm',
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

