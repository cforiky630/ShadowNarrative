import { Suspense } from "react";
import { connection } from "next/server";
import { MemorySpace } from "@/components/MemorySpace";
import { getLatestPhoto, getPhotoDetail } from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";

/**
 * 首页 —— 最新的一张照片。
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
 *
 * 为什么取的是 PhotoDetail 而不是 Photo：
 *   重新打开时字幕要立刻在，不能先空着再等轮询 —— 那会显得像是丢了。
 *   只有 aiState 还是 pending 时客户端才需要轮询。
 */
export default function Page() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <PhotoLoader />
    </Suspense>
  );
}

async function PhotoLoader() {
  await connection();

  const userId = await getLocalUserId();
  const latest = await getLatestPhoto(userId);
  const photo = latest ? await getPhotoDetail(userId, latest.id) : null;

  return <MemorySpace photo={photo} />;
}
