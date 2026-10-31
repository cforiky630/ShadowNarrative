import { prisma } from "@/lib/prisma";
import type { Photo } from "@/types";
import {
  byPhotoTimeDesc,
  PHOTO_SELECT,
  toPhoto,
  type PhotoRow,
} from "./photoService";

/**
 * 相册首屏照片选取服务（16-ALBUM_SPACE.md §2、§2.5）。
 *
 * 首屏照片选取规则：
 * 首屏放固定容量照片，优先展示收藏（favorite = true）：
 *
 * ```text
 * 收藏数 ≤ PANEL_LIMIT           收藏全部展示，不足部分由最近未收藏照片补齐至 PANEL_LIMIT
 * PANEL_LIMIT < 收藏数 ≤ FAV     只展示前 N 张收藏（此时不展示未收藏照片）
 * 收藏数 > FAVORITE_LIMIT        最多展示前 FAVORITE_LIMIT 张收藏，其余由「看全部」承接
 * ```
 *
 * 当库内照片总数超过首屏展示数时，界面底部显示「还有 N 张 · 看全部」入口。
 */

/**
 * 首屏手风琴画廊展示容量上限（默认 8 张）。
 *
 * 约束依据：
 * 手风琴画廊（AccordionGallery）收起的条形单元在 8 张时单格约占行宽 8%，
 * 保持可识别性与易点击性；数量过多会导致折叠格过窄。
 */
export const PANEL_LIMIT = 8;

/**
 * 收藏展示上限阈值（16 张）。超过此数量由「看全部」进入时间线查看。
 */
export const FAVORITE_LIMIT = 16;

/**
 * 一次最多扫多少行。
 *
 * ⚠️ 「拍摄时间缺失时回落导入时间」这个 coalesce **没法用 Prisma 的 orderBy
 * 表达**（SQLite 的 NULL 排序是固定的，不会回落到另一列），所以真正的排序
 * 只能在 JS 里做，也就得先把行取回来。同一件事在 `timelineService` 里有一份
 * 一样的说明。**照片库变大前必须改掉**，见 `08 §11`。
 *
 * 收藏与非收藏分开取、各自带 `createdAt desc`，是为了让这个上限**永远不会
 * 把收藏挤掉** —— 否则一张很旧的收藏会因为最近导入的 400 张而被挡在外面。
 */
const SCAN_LIMIT = 400;

export interface AlbumSelection {
  photos: Photo[];
  /**
   * 没上轴的照片数。> 0 时前端出现「看全部」。
   *
   * 是个**数量**而不是布尔：将来「看全部」上要写「还有 137 张」，
   * 而那时候再回过头改返回类型要动一圈。
   */
  hidden: number;
}

/**
 * 轴的顺序：**新的在前**，离相机最近。
 *
 * ⚠️ 与 `16 §2.5` 的「按 `takenAt` 升序（缺失时用 `createdAt`）」方向相反。
 * 那条真正要的是**一个确定的顺序**加上可见处的时间提示（否则用户会迷失在
 * 一条不知道往哪走的线上），方向本身没定死。而焦点是从第 0 张开始的 ——
 * 把最旧的一张放在第一眼的位置上不对。
 *
 * ⚠️ **回落规则不在这里**：`takenAt` 缺了用 `createdAt` 这条算在
 * `photoService.photoTime` 里，与时间线、影册共用同一份 —— 各写各的迟早
 * 会出现「排在最前面但分到第二天」。
 */

export async function getAlbumPhotos(userId: string): Promise<AlbumSelection> {
  const [favRows, fillRows, favoriteTotal, total] = await Promise.all([
    prisma.photo.findMany({
      where: { userId, favorite: true },
      select: PHOTO_SELECT,
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
    }),
    prisma.photo.findMany({
      where: { userId, favorite: false },
      select: PHOTO_SELECT,
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
    }),
    prisma.photo.count({ where: { userId, favorite: true } }),
    prisma.photo.count({ where: { userId } }),
  ]);

  const favorites = [...favRows].sort(byPhotoTimeDesc);

  let picked: PhotoRow[];

  if (favoriteTotal > FAVORITE_LIMIT) {
    picked = favorites.slice(0, FAVORITE_LIMIT);
  } else if (favoriteTotal > PANEL_LIMIT) {
    picked = favorites;
  } else {
    const need = PANEL_LIMIT - favorites.length;
    const fills =
      need > 0 ? [...fillRows].sort(byPhotoTimeDesc).slice(0, need) : [];
    // 补进来的和收藏混在一起重新按时间排 —— 否则轴上会出现
    // 「后半段全是收藏」这种由规则而不是由时间造成的分段
    picked = [...favorites, ...fills].sort(byPhotoTimeDesc);
  }

  return {
    photos: picked.map(toPhoto),
    hidden: Math.max(0, total - picked.length),
  };
}
