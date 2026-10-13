/**
 * 产品里日期的那一种写法：**`2026 · 10 · 11`**（`02-DESIGN-SYSTEM.md` §4）。
 *
 * 只有这一份。原先它在 `MemorySpace` 里、`PhotoDate` 里各有一份 ——
 * 日期格式是**产品语言**，各写各的迟早会出现「同一个日期两种写法」
 * （和 `photoTime` 那个「排序与分组必须用同一个值」是同一条道理）。
 *
 * ⚠️ 用**本地时间**取值（`getFullYear` 那一族），不是 `toISOString().slice()`
 * —— 后者是 UTC，东八区的晚上 8 点会显示成第二天。
 */

/** `2026 · 10 · 11`。传 null 或读不出来的值 → null（调用方自己决定显示什么） */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y} · ${m} · ${day}`;
}

/** 同一种写法，只是没有「日」。日历面板头上那一行用它 */
export function formatMonth(d: Date): string {
  return `${d.getFullYear()} · ${String(d.getMonth() + 1).padStart(2, "0")}`;
}
