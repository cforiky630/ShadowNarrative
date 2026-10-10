-- 影册：砍到一册真正需要的那几列（08 §3）
--
-- 删：Memory.summary、Memory.memoryDate、MemoryPhoto.order、MemoryPhoto.addedAt
-- 改：Memory.title 从可空改成必填
--
-- 与 autoAnalyze、Journal.title / status 同一条理由（第四次了）：
-- 恒不写入的列会让下一个人以为它坏了。Theater 定下来时再加回来 ——
-- 加列是增量的，代价远小于留一个永远为空的列去误导人。
--
-- ⚠️ 两张表此前**没有任何代码写过**，所以 title 改成 NOT NULL 不会撞上现存行。
-- SQLite 改列类型要重建表，这是 Prisma 生成的标准 12 步。

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_memories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_memories" ("createdAt", "id", "title", "updatedAt", "userId") SELECT "createdAt", "id", "title", "updatedAt", "userId" FROM "memories";
DROP TABLE "memories";
ALTER TABLE "new_memories" RENAME TO "memories";
CREATE INDEX "memories_userId_updatedAt_idx" ON "memories"("userId", "updatedAt");
CREATE TABLE "new_memory_photos" (
    "memoryId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,

    PRIMARY KEY ("memoryId", "photoId"),
    CONSTRAINT "memory_photos_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "memories" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "memory_photos_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_memory_photos" ("memoryId", "photoId") SELECT "memoryId", "photoId" FROM "memory_photos";
DROP TABLE "memory_photos";
ALTER TABLE "new_memory_photos" RENAME TO "memory_photos";
CREATE INDEX "memory_photos_photoId_idx" ON "memory_photos"("photoId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
