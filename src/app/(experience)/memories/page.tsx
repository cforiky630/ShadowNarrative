import { Suspense } from "react";
import { connection } from "next/server";
import { MemoriesSpace } from "@/components/MemoriesSpace";
import { listMemories } from "@/services/memoryService";
import { getLocalUserId } from "@/services/userService";

/**
 * 影册的架子 —— `/memories`（`01 §5` 的第三个空间，用户 2026-10-11 定的）。
 *
 * 与时间线同样的理由用 `connection()` + `<Suspense>`：`cacheComponents` 开着，
 * 内容来自数据库，被预渲染就会固化成构建时的快照。**而本项目用
 * better-sqlite3（同步驱动），不挡的话查询在预渲染阶段真的会执行。**
 */
export default function Page() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <MemoriesLoader />
    </Suspense>
  );
}

async function MemoriesLoader() {
  await connection();

  const userId = await getLocalUserId();
  const albums = await listMemories(userId);

  return <MemoriesSpace albums={albums} />;
}
