import { Suspense } from "react";
import { connection } from "next/server";
import { MemorySpace } from "@/components/MemorySpace";
import { LOCAL_USER_ID, getLatestMemory } from "@/services/memoryService";

/**
 * 首页。
 *
 * 这是一个 Server Component，只负责取数据；画布、交互、状态全在
 * <MemorySpace>（客户端）里。
 *
 * 为什么要 connection()：
 *   项目开了 cacheComponents，组件默认会被预渲染。首页的内容来自数据库，
 *   一旦被预渲染就会固化成构建时的快照 —— 用户上传新照片后刷新还是旧的。
 *   connection() 明确告诉 Next「这里必须等到请求到达再渲染」。
 *   文档在 migrating-to-cache-components 里专门提到数据库查询属于这个场景。
 *
 * 为什么包 <Suspense>：
 *   cacheComponents 要求请求期渲染的部分有 Suspense 边界，
 *   这样页面的静态外壳可以先流式送达。
 */
export default function Page() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <MemoryLoader />
    </Suspense>
  );
}

async function MemoryLoader() {
  await connection();
  const memory = await getLatestMemory(LOCAL_USER_ID);
  return <MemorySpace memory={memory} />;
}
