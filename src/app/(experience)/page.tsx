import { Suspense } from "react";
import { connection } from "next/server";
import { MemorySpace } from "@/components/MemorySpace";
import { getLatestPhoto, getPhotoDetail } from "@/services/photoService";
import { getLocalUserId, getSettings } from "@/services/userService";

/**
 * Photo View —— 看一张照片。默认原图，点「Into this moment」切成粒子。
 *
 * 为什么要 connection()：
 *   项目开了 cacheComponents，组件默认会被预渲染。首页的内容来自数据库，
 *   一旦被预渲染就会固化成构建时的快照 —— 用户上传新照片后刷新还是旧的。
 *   connection() 明确告诉 Next「这里必须等到请求到达再渲染」。
 *
 * 为什么包 <Suspense>：
 *   cacheComponents 要求请求期渲染的部分有 Suspense 边界，
 *   这样页面的静态外壳可以先流式送达。
 *
 * 为什么取的是 PhotoDetail 而不是 Photo：
 *   重新打开时字幕要立刻在，不能先空着再等轮询 —— 那会显得像是丢了。
 *   只有 aiState 还是 pending 时客户端才需要轮询。
 */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <PhotoLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function PhotoLoader({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  const [params, userId] = await Promise.all([searchParams, getLocalUserId()]);
  const settings = await getSettings(userId);

  const raw = params.photo;
  const requestedId = typeof raw === "string" ? raw : undefined;

  /*
   * 看哪一张：`?photo=<id>` 优先（从时间线点进来），否则最近上传的那张。
   *
   * 请求的那张不存在、或不属于当前用户时**回落到最近那张**，不报错 ——
   * `getPhotoDetail` 的查询条件里带着 userId（08 §1），越权与不存在都返回 null，
   * 这里顺势回落即可，也顺带不泄露「那张照片存在但你没权限」。
   */
  const requested = requestedId
    ? await getPhotoDetail(userId, requestedId)
    : null;

  let photo = requested;
  if (!photo) {
    const latest = await getLatestPhoto(userId);
    photo = latest ? await getPhotoDetail(userId, latest.id) : null;
  }

  return <MemorySpace photo={photo} autoAnalyze={settings.autoAnalyze} />;
}
