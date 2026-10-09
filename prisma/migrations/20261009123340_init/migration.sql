-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "contentHash" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "takenAt" DATETIME,
    "caption" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "aiState" TEXT NOT NULL DEFAULT 'pending',
    "aiError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "photo_analyses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "photoId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "sentSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "photo_analyses_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "photoId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "conversations_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceRefs" TEXT,
    "isSubtitle" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "journals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "photoId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "journals_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "memories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "memoryDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "memory_photos" (
    "memoryId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("memoryId", "photoId"),
    CONSTRAINT "memory_photos_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "memories" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "memory_photos_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "particlePreset" TEXT NOT NULL DEFAULT 'calm',
    "particleParams" TEXT,
    "autoAnalyze" BOOLEAN NOT NULL DEFAULT true,
    "backupAuto" BOOLEAN NOT NULL DEFAULT false,
    "backupEndpoint" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "photos_storageKey_key" ON "photos"("storageKey");

-- CreateIndex
CREATE INDEX "photos_userId_favorite_takenAt_idx" ON "photos"("userId", "favorite", "takenAt");

-- CreateIndex
CREATE INDEX "photos_userId_createdAt_idx" ON "photos"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "photos_contentHash_idx" ON "photos"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "photo_analyses_photoId_key" ON "photo_analyses"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_photoId_key" ON "conversations"("photoId");

-- CreateIndex
CREATE INDEX "conversation_messages_conversationId_createdAt_idx" ON "conversation_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "journals_photoId_key" ON "journals"("photoId");

-- CreateIndex
CREATE INDEX "memories_userId_memoryDate_idx" ON "memories"("userId", "memoryDate");

-- CreateIndex
CREATE INDEX "memory_photos_photoId_idx" ON "memory_photos"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");
