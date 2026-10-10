import { ApiError } from "@/lib/apiResponse";
import { prisma } from "@/lib/prisma";
import type { TimelineDay } from "@/types";
import { PHOTO_SELECT, toPhoto, type PhotoRow } from "./photoService";

/**
 * Timeline —— 按天分组的照片（用户 2026-10-10 定的空间）。
 *
 * 取代 `16-ALBUM_SPACE.md` §6 的 Library 抽屉，**不并存**。
 * ⚠️ 规格还没改：`16 §6`、`01 §5`、`07` 都还写着 Library。落地前要改。
 */

/**
 * 本地日历日，"YYYY-MM-DD"。
 *
 * ⚠️ 用的是**服务器的本地时区**。这个产品是单机自托管（`17 §1`），
 * 服务器就是用户的机器，所以「本地」就是用户所在的地方。
 *
 * 一旦要支持多时区，这个函数必须带上用户时区 —— 否则同一张照片在不同机器上
 * 会被分到不同的天，而主题名是按天存的（`DayTheme`），分组一变主题就对不上了。
 */
export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 照片属于哪一天：拍摄时间优先，没有就回落导入时间（`08 §3`）。
 *
 * 单独抽出来是为了**只有一个地方**做这个回落 —— 排序与分组必须用同一个值，
 * 否则会出现「排在最前面但分到第二天」这种自相矛盾的结果。
 */
function photoTime(row: PhotoRow): number {
  return (row.takenAt ?? row.createdAt).getTime();
}

/**
 * 一次取回的照片上限。
 *
 * ⚠️ 现在是把照片全取回来在 JS 里分组与排序，因为「拍摄时间缺失时回落导入时间」
 * 这个 coalesce 没法用 Prisma 的 `orderBy` 表达（SQLite 的 NULL 排序是固定的，
 * 不会回落到另一列）。
 *
 * 精选规模下没问题，但**照片库变大前必须改成按天游标分页** ——
 * 否则一次要把整个库读进内存。
 */
const DEFAULT_PHOTO_LIMIT = 400;

export interface GetTimelineOptions {
  photoLimit?: number;
}

/**
 * 取时间轴。天按倒序（新的在前），天内照片也按倒序。
 */
export async function getTimeline(
  userId: string,
  options: GetTimelineOptions = {},
): Promise<TimelineDay[]> {
  const rows = await prisma.photo.findMany({
    where: { userId },
    select: PHOTO_SELECT,
    take: options.photoLimit ?? DEFAULT_PHOTO_LIMIT,
  });

  const sorted = [...rows].sort((a, b) => photoTime(b) - photoTime(a));

  const byDay = new Map<string, PhotoRow[]>();
  for (const row of sorted) {
    const key = toDayKey(row.takenAt ?? row.createdAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(row);
    else byDay.set(key, [row]);
  }

  // 只取这些天的主题，不整表拉回来
  const themes = await prisma.dayTheme.findMany({
    where: { userId, dayKey: { in: [...byDay.keys()] } },
    select: { dayKey: true, title: true, source: true },
  });
  const themeByDay = new Map(themes.map((t) => [t.dayKey, t]));

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1)) // 天倒序：字符串比较对 YYYY-MM-DD 就是日期比较
    .map(([dayKey, photos]) => {
      const theme = themeByDay.get(dayKey);
      return {
        dayKey,
        title: theme?.title ?? null,
        titleSource: theme ? (theme.source === "user" ? "user" : "ai") : null,
        photos: photos.map(toPhoto),
      };
    });
}

/**
 * 写某一天的主题名。空字符串表示**清除**（那天退回没有主题）。
 *
 * 一旦由用户写入，`source` 就变成 `user`。
 *
 * ⚠️ **没有 AI 生成的版本**（2026-10-10 决定，推翻了同日上午的「默认提炼」）：
 * `01 §9` 不允许 AI 替用户定义这段记忆是什么，而给一天起名正是这件事；
 * 而且个人相册里大多数天只有一两张照片，AI 在那个信息量下只能把某一张
 * 的描述压成一个词 —— 实测产出「仰头的布偶猫」，那是照片里的东西，不是这一天。
 *
 * `source` 字段与 UI 对它的处理保留着：它是 `09 §6` 的来源标记，
 * 而且将来若做「让 AI 起一个」这种**用户主动触发**的入口，就地可用。
 */
export async function setDayTheme(
  userId: string,
  dayKey: string,
  title: string,
): Promise<void> {
  if (!DAY_KEY_PATTERN.test(dayKey)) {
    throw new ApiError("INVALID_INPUT", "日期格式必须是 YYYY-MM-DD");
  }

  const trimmed = title.trim();

  if (!trimmed) {
    // 清除。用 deleteMany 带 userId，不做「先查出再删」的两段式（08 §1）
    await prisma.dayTheme.deleteMany({ where: { userId, dayKey } });
    return;
  }

  await prisma.dayTheme.upsert({
    where: { userId_dayKey: { userId, dayKey } },
    create: { userId, dayKey, title: trimmed, source: "user" },
    update: { title: trimmed, source: "user" },
  });
}
