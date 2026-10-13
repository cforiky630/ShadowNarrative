import { Suspense } from "react";
import { connection } from "next/server";
import { AlbumSpace } from "@/components/AlbumSpace";
import { MemorySpace } from "@/components/MemorySpace";
import { getAlbumPhotos } from "@/services/albumService";
import { getPhotoDetail } from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";

/**
 * 第一屏 —— 相册，或一张照片（`01-PRODUCT_SPEC.md` §5、`16-ALBUM_SPACE.md`）。
 *
 * ⚠️ **2026-10-10：`/` 的含义变了。**
 *
 * 在这之前它总是 Photo View —— 没有 `?photo=` 时回落显示最近上传的那张。
 * 现在它是 **Album**（产品第一屏，`01 §5`）：不带 `?photo=` 时展开斜轴，
 * 带 `?photo=<id>` 时仍是 Photo View。
 *
 * 为什么没给相册单开一条路由：`16 §1` 那棵树里 Album 的入口写的就是「默认」，
 * 而「默认」在 URL 上就是 `/`。真正变的只有**回落分支**。
 *
 * 为什么要 connection()：
 *   项目开了 cacheComponents，组件默认会被预渲染。这一屏的内容来自数据库，
 *   一旦被预渲染就会固化成构建时的快照 —— 用户上传新照片后刷新还是旧的。
 *   connection() 明确告诉 Next「这里必须等到请求到达再渲染」。
 *
 * 为什么包 <Suspense>：
 *   cacheComponents 要求请求期渲染的部分有 Suspense 边界，
 *   这样页面的静态外壳可以先流式送达。
 */

/**
 * 相册一次取哪几张、以及有多少张没上轴 —— 规则在
 * `service/albumService.ts` 里，一并写在那里了。
 */

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <SpaceLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function SpaceLoader({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  const [params, userId] = await Promise.all([searchParams, getLocalUserId()]);

  const raw = params.photo;
  const requestedId = typeof raw === "string" ? raw : undefined;

  if (requestedId) {
    /*
     * 请求的那张不存在、或不属于当前用户时**落到相册**，不报错 ——
     * `getPhotoDetail` 的查询条件里带着 userId（`08 §1`），越权与不存在
     * 都返回 null，这里顺势回落即可，也顺带不泄露「那张照片存在但你没权限」。
     *
     * 删掉一张照片之后也是走这条路：地址栏上还留着它的 id，刷新就回到相册。
     */
    const photo = await getPhotoDetail(userId, requestedId);
    if (photo) {
      return <MemorySpace photo={photo} />;
    }
  }

  const album = await getAlbumPhotos(userId);
  return <AlbumSpace photos={album.photos} hidden={album.hidden} />;
}
