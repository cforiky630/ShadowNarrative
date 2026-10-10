import { prisma } from "@/lib/prisma";
import type { Photo } from "@/types";
import { PHOTO_SELECT, toPhoto, type PhotoRow } from "./photoService";

/**
 * 相册首屏要哪几张（`16-ALBUM_SPACE.md` §2、§2.5）。
 *
 * ── 规则（用户 2026-10-10 定）────────────────────────────────────────
 *
 * 首屏放的是**固定量**照片，但优先收藏：
 *
 * ```text
 * 收藏数 ≤ PANEL_LIMIT           收藏全上，不够的用未收藏的补到 PANEL_LIMIT
 * PANEL_LIMIT < 收藏数 ≤ FAV    只上收藏（这时未收藏的一张都不上）
 * 收藏数 > FAVORITE_LIMIT       只上前 FAVORITE_LIMIT 张收藏
 * ```
 *
 * 任何一张没上首屏，界面就显示「看全部」。
 *
 * 这条规则同时解掉了两个矛盾：首屏只放收藏的话新用户打开是空房间；
 * 而全放的话，照片一多就成了一条看不到头的带子。
 */

/**
 * 首屏放几张。
 *
 * ⚠️ 2026-10-10 从 12 降到 8：当天首屏从「斜轴」换成了 React Bits 的
 * **手风琴**（一列并排、当前那张展开）—— 手风琴的收起的格子是**细条**，
 * 张数一大就成了一把梳子，每一格窄到既看不清也点不准。
 * 8 张时收起的每格还占约 8%，是这个形态的上限附近。
 */
export const PANEL_LIMIT = 8;

/**
 * 收藏多到什么程度就不再往上加。到这一步「看全部」是唯一的出口。
 *
 * 同样因为手风琴的形态：16 张时收起的格子已经只剩 3.8% 宽，
 * 再密就只是装饰了。
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
 */
function byTimeDesc(a: PhotoRow, b: PhotoRow): number {
  const at = (a.takenAt ?? a.createdAt).getTime();
  const bt = (b.takenAt ?? b.createdAt).getTime();
  // id 次级键：同一毫秒的两条，只按时间排是不稳定的
  return bt - at || (a.id < b.id ? 1 : -1);
}

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

  const favorites = [...favRows].sort(byTimeDesc);

  let picked: PhotoRow[];

  if (favoriteTotal > FAVORITE_LIMIT) {
    picked = favorites.slice(0, FAVORITE_LIMIT);
  } else if (favoriteTotal > PANEL_LIMIT) {
    picked = favorites;
  } else {
    const need = PANEL_LIMIT - favorites.length;
    const fills =
      need > 0 ? [...fillRows].sort(byTimeDesc).slice(0, need) : [];
    // 补进来的和收藏混在一起重新按时间排 —— 否则轴上会出现
    // 「后半段全是收藏」这种由规则而不是由时间造成的分段
    picked = [...favorites, ...fills].sort(byTimeDesc);
  }

  return {
    photos: picked.map(toPhoto),
    hidden: Math.max(0, total - picked.length),
  };
}
