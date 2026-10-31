import { Suspense } from "react";
import { connection } from "next/server";
import { AlbumSpace } from "@/components/AlbumSpace";
import { MemorySpace } from "@/components/MemorySpace";
import { getAlbumPhotos } from "@/services/albumService";
import { getPhotoDetail } from "@/services/photoService";
import { getLocalUserId } from "@/services/userService";

/**
 * 第一屏 —— 相册手风琴画廊，或单张照片视图（01-PRODUCT_SPEC.md §5、16-ALBUM_SPACE.md）。
 *
 * 路由映射：
 * 不带 ?photo= 时展示首屏手风琴相册；带 ?photo=<id> 时展示对应照片的 Photo View。
 * 结合 connection() 声明按需动态渲染，避免数据库内容在构建期被静态固化。
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
