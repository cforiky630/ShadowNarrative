import { Suspense } from "react";
import { connection } from "next/server";
import { TimelineSpace } from "@/components/TimelineSpace";
import { getTimeline } from "@/services/timelineService";
import { getLocalUserId } from "@/services/userService";

/**
 * 时间线。
 *
 * 用户 2026-10-10：中央时间线，节点以「天」为单位，取代 Library 抽屉。
 *
 * 与首页同样的理由用 connection() + <Suspense>：cacheComponents 开着，
 * 内容来自数据库，被预渲染就会固化成构建时的快照。**而本项目用
 * better-sqlite3（同步驱动），不挡的话查询在预渲染阶段真的会执行。**
 */
export default function Page() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <TimelineLoader />
    </Suspense>
  );
}

async function TimelineLoader() {
  await connection();

  const userId = await getLocalUserId();
  const days = await getTimeline(userId);

  return <TimelineSpace days={days} />;
}
