"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useDatePicker,
  type DPDay,
  type DPPropGetter,
  type DPPropsGetterConfig,
} from "@rehookify/datepicker";
import { formatDate, formatMonth } from "@/lib/formatDate";
import { isImeKey } from "@/lib/keyboard";

/**
 * 照片的日期 —— 显示，以及**改它**（`16 §7.1` 那一行）。
 *
 * ── 为什么不是输入框 ─────────────────────────────────────────────────
 *
 * 用户 2026-10-11：「照片的日期应该提供修改功能（在原图页提供），
 * **但是不能是输入**，请寻找一个组件，而且要去适配当前风格」。
 *
 * 一个日期不是一串要人敲的字符，是一格要人挑的日子 —— 输入框还逼着他
 * 记住格式。
 *
 * ── 为什么是 `@rehookify/datepicker` ─────────────────────────────────
 *
 * 它是**无头的**（headless）：只给日历的**结构与日期运算**（月长、闰年、
 * 周起始、选中态、键盘可达的 prop getter），DOM 一行都不带 —— 所以这个产品
 * 的样式是**写出来的**，不是覆写别人的。这正对上「去适配当前风格」。
 *
 * 另一半理由是依赖：它**零运行时依赖**（peer 只有 react）。`05 §17` 定的
 * 顺序是「已有依赖 → 少量工具 → 自己实现」，而 `react-day-picker` 要拖
 * `date-fns` + `@date-fns/tz`，`react-calendar` 要四个 —— `10` Round 13
 * 还盯着封装后的体积。React Bits 那边**没有**日期类组件（它的目录是视觉
 * 向的：搬过来的 `AccordionGallery` / `HoldButton` 都是那一类）。
 *
 * ── 三件事的规矩 ─────────────────────────────────────────────────────
 *
 * 1. **只挑到「天」**，但存的是时刻。所以挑完之后**保留原来的时刻**
 *    （`takenAt` 有就沿用它的时分；没有就用正午 —— 正午离两头的时区边界
 *    最远，不会因为时区把这一天算到前一天去）
 * 2. **可以清掉**：`takenAt` 本来就是可空的，空着时显示的是**导入时间**
 *    （`08 §3` 的回落）。所以清掉不是「删日期」，是「这张没有拍摄时间」——
 *    底下那个 `Clear` 只在有覆盖时才出现
 * 3. **面板朝上开**：日期在画面 78% 处，朝下开会顶出视口
 *    （`16 §7.1` 的尺寸表是紧的）
 */

interface PhotoDateProps {
  photoId: string;
  /** 存的拍摄时间。null = 这张没有，界面回落导入时间 */
  takenAt: string | null;
  /** 导入时间。它是**回落值**，不是可编辑的那一个 */
  createdAt: string;
  /** 存好之后把新的 `takenAt`（或 null）交回外壳 */
  onSaved: (takenAt: string | null) => void;
}

export function PhotoDate({
  photoId,
  takenAt,
  createdAt,
  onSaved,
}: PhotoDateProps) {
  const [value, setValue] = useState<string | null>(takenAt);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = value ?? createdAt;

  const save = useCallback(
    async (day: Date | null) => {
      if (saving) return;
      setSaving(true);
      setError(null);
      try {
        let iso: string | null = null;
        if (day) {
          const base = value ? new Date(value) : null;
          const next = new Date(day);
          next.setHours(
            base ? base.getHours() : 12,
            base ? base.getMinutes() : 0,
            0,
            0,
          );
          iso = next.toISOString();
        }

        const res = await fetch(`/api/photos/${photoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ takenAt: iso }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? "没能改");
        }

        setValue(iso);
        onSaved(iso);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "没能改");
      } finally {
        setSaving(false);
      }
    },
    [saving, value, photoId, onSaved],
  );

  // Esc 收起。⚠️ 先过 `isImeKey`（`lib/keyboard.ts`）—— 这里的当下没有输入框，
  // 但那一句的代价是零，而这个产品已经为「组字中的 Esc」栽过两次
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isImeKey(e)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="text-meta text-text-primary/55 underline-offset-4 transition-colors duration-[350ms] hover:text-text-primary/90 hover:underline focus-visible:text-text-primary/90 focus-visible:underline"
        style={{ transitionTimingFunction: "var(--ease-enter)" }}
      >
        {formatDate(shown) ?? "没有时间"}
      </button>

      {open && (
        <>
          {/*
            点别处收起。是**这一层里**的一块透明盖子 —— 不挡顶栏、也不挡
            对话浮层（它们在别的层叠上下文里，各自该收到什么就收到什么）。
          */}
          <span
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 block"
          />

          <Calendar
            value={value}
            fallback={createdAt}
            busy={saving}
            error={error}
            /*
             * ⚠️ **挑一天不写库**，要按 `Save` 才写。
             *
             * 用户 2026-10-11：「为什么有一个 clear，**右边再来个 save 多好**，
             * clear 回到上次 save 的时间」。第一版是「点一天 = 立刻存」，
             * 那样 `Clear` 只能被解释成「把拍摄时间清掉」—— 而那不是他要的：
             * 挑错了想反悔，只能去数据库里翻。
             */
            onSave={(day) => void save(day)}
          />
        </>
      )}
    </span>
  );
}

/**
 * 日历本身。
 *
 * ── 两态：**选中**与**已保存** ───────────────────────────────────────
 *
 * 挑一天只动**选中**（`draft`），按 `Save` 才写库。所以：
 *
 * - `Save` 只在两者不同时才可按（没什么可存的时候它该是暗的）
 * - `Clear` 把选中**退回已保存的那一天** —— 它是「放弃这次改动」，
 *   不是「把拍摄时间清掉」（用户 2026-10-11：「clear 回到上次 save 的时间」）
 *
 * ⚠️ **这一版没有「把拍摄时间清成空」的入口了。** 要的话得另找地方 ——
 * 那个动作的语义是「这张没有拍摄时间」，和「放弃这次改动」是两件事，
 * 混在同一个按钮上正是第一版的毛病。
 *
 * 版式上只做一件事：**让它看起来像这个产品的一行字**，而不是一个控件。
 * 没有强调色（`02 §3`），选中靠 `--text-primary` 的实心圆，今天靠一圈发丝。
 */
function Calendar({
  value,
  fallback,
  busy,
  error,
  onSave,
}: {
  value: string | null;
  fallback: string;
  busy: boolean;
  error: string | null;
  /** 按了 `Save` 才走到这儿 */
  onSave: (day: Date | null) => void;
}) {
  const anchor = new Date(value ?? fallback);
  const [offset, setOffset] = useState<Date>(anchor);
  /** 面板里现在是哪一屏：日子，还是挑年月 */
  const [view, setView] = useState<"days" | "months">("days");
  /** 还没存下去的那一天。null = 这张没有拍摄时间（显示的是导入时间） */
  const [draft, setDraft] = useState<Date | null>(
    value ? new Date(value) : null,
  );

  /** 已保存的那一天（本地日历日）。拿来和 `draft` 比，也拿来当 `Clear` 的落点 */
  const savedDay = value ? new Date(value) : null;
  const dirty = !sameDay(draft, savedDay);

  const { data, propGetters } = useDatePicker({
    // 选中的是**没存下去的那一天** —— 挑完要看得见自己挑了哪儿
    selectedDates: draft ? [draft] : [],
    onDatesChange: (dates) => {
      if (dates[0]) setDraft(dates[0]);
    },
    offsetDate: offset,
    onOffsetChange: setOffset,
    // 周一开头（中文的日历习惯），星期的名字用最窄的「一二三」
    calendar: { startDay: 1 },
    locale: { locale: "zh-CN", weekday: "narrow" },
  });

  const calendar = data.calendars[0];
  const days = calendar?.days ?? [];

  return (
    <div
      role="dialog"
      aria-label="改这张照片的时间"
      /*
        ⚠️ **宽度必须写死。** 这一层是 `absolute`，而它的包含块是外面那个
        `relative` 的 span —— 也就是日期那几个字那么宽（约 100px）。
        不写宽度的话它会**收缩到那个宽度**，七列的格子各剩 15px，日历挤成一条。

        256 = 7 × 32 的格子 + 左右各 16 的内边距。
      */
      className="border-border-faint absolute bottom-full left-1/2 z-30 mb-4 w-[256px] -translate-x-1/2 rounded-2xl border p-4 shadow-2xl backdrop-blur-2xl"
      style={{ backgroundColor: "var(--glass-strong)" }}
    >
      {/*
        ── 头一行：日子那一屏显示「2026 · 10」，年月那一屏显示「2026」 ────

        用户 2026-10-11：「**年月怎么调**」。原先只有一对 ‹ › 走月份，
        想看三年前的照片得点三十六下 —— 老照片是这个产品里的大多数。

        所以头上那一行本身**是个按钮**：点它翻到年月那一屏（12 个月，一年一屏），
        在那儿再点一个月回来。这也是日历控件的通用做法，不必我发明。

        ⚠️ 月份字串用**自己的格式**（`2026 · 10`），不用库给的 `year` / `month`：
        那两个字串是 `Intl` 按 locale 拼的，zh-CN 下会带上「年」「月」，
        而这一行要和产品里其它日期长得一样（`02 §4`）。数字也照用户那句
        「**日期不要加日直接数字就好**」。
      */}
      <div className="mb-3 flex items-center justify-between gap-6">
        {view === "days" ? (
          <button
            type="button"
            onClick={() => setView("months")}
            className="text-micro tracking-[0.08em] text-text-primary/70 underline-offset-4 transition-colors duration-[350ms] hover:text-text-primary/95 hover:underline focus-visible:text-text-primary/95"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            {formatMonth(offset)}
          </button>
        ) : (
          <span className="text-micro tracking-[0.08em] text-text-primary/70">
            {offset.getFullYear()}
          </span>
        )}

        <span className="flex items-center gap-2">
          {view === "days" ? (
            <>
              <NavButton label="上个月" {...propGetters.subtractOffset({ months: 1 })}>
                <ChevronLeft size={14} strokeWidth={1.6} aria-hidden />
              </NavButton>
              <NavButton label="下个月" {...propGetters.addOffset({ months: 1 })}>
                <ChevronRight size={14} strokeWidth={1.6} aria-hidden />
              </NavButton>
            </>
          ) : (
            <>
              <NavButton label="上一年" {...propGetters.subtractOffset({ years: 1 })}>
                <ChevronLeft size={14} strokeWidth={1.6} aria-hidden />
              </NavButton>
              <NavButton label="下一年" {...propGetters.addOffset({ years: 1 })}>
                <ChevronRight size={14} strokeWidth={1.6} aria-hidden />
              </NavButton>
            </>
          )}
        </span>
      </div>

      {view === "days" ? (
        <DayGrid
          weekDays={data.weekDays}
          days={days}
          busy={busy}
          dayButton={propGetters.dayButton}
        />
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {data.months.map((m) => {
            const { onClick, ...rest } = propGetters.monthButton(m);
            const active = m.$date.getMonth() === offset.getMonth();
            return (
              <button
                key={m.$date.toISOString()}
                {...rest}
                // 选完月份回到日子那一屏 —— 自己接一层，不去猜库给的 onClick
                // 是替换还是并列
                onClick={(e) => {
                  onClick?.(e);
                  setView("days");
                }}
                disabled={busy}
                className={`text-meta flex h-9 items-center justify-center rounded-lg transition-colors duration-[350ms] ${
                  active
                    ? ""
                    : "text-text-primary/75 hover:text-text-primary"
                }`}
                style={{
                  transitionTimingFunction: "var(--ease-enter)",
                  // 现在看着的那个月用**实心**（与日子那一屏选中的那天同一套：
                  // 状态靠填充，这个产品没有强调色可用）
                  ...(active
                    ? {
                        backgroundColor: "var(--text-primary)",
                        color: "var(--background)",
                      }
                    : {}),
                }}
              >
                {m.$date.getMonth() + 1}
              </button>
            );
          })}
        </div>
      )}

      {/*
        底下这一条：左 `Clear`、右 `Save`。

        - `Clear` = **放弃这次改动**，回到上次保存的那一天。只在改动过时出现
          （没改动时它没有事可做，摆着只是一个点不动的词）
        - `Save` = 存下去。**只在改动过时才可按** —— 没什么可存的时候它该是暗的

        ⚠️ 关掉面板（Esc / 点别处）**不保存**，改动丢掉。这是这一版刻意选的：
        用户要的就是「挑完再按一下保存」这一步。
      */}
      <div className="mt-3 flex items-baseline justify-between gap-4">
        {error ? (
          <span className="text-micro text-text-primary/60" role="status">
            {error}
          </span>
        ) : dirty ? (
          <button
            type="button"
            onClick={() => {
              setDraft(savedDay);
              // 退回那一天，视图也跟着回到那个月 —— 否则选中在别处看不见
              if (savedDay) setOffset(savedDay);
              setView("days");
            }}
            disabled={busy}
            className="text-micro text-text-primary opacity-40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85 disabled:opacity-40"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            Clear
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={busy || !dirty}
          className="text-micro text-text-primary opacity-70 underline-offset-4 transition-opacity duration-[350ms] hover:opacity-100 focus-visible:opacity-100 disabled:opacity-25"
          style={{ transitionTimingFunction: "var(--ease-enter)" }}
        >
          {busy ? "…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/**
 * 日子那一屏 —— 星期那一行 + 42 个格子。
 *
 * 抽出来是因为面板现在有**两屏**（日子 / 年月），而这个是其中一屏。
 *
 * 版式上只做一件事：**让它看起来像这个产品的一行字**，不是一个控件。
 * 没有强调色（`02 §3`）：选中靠 `--text-primary` 的实心圆，今天靠一圈发丝。
 */
function DayGrid({
  weekDays,
  days,
  busy,
  dayButton,
}: {
  weekDays: string[];
  days: DPDay[];
  busy: boolean;
  dayButton: (day: DPDay, config?: DPPropsGetterConfig) => DPPropGetter;
}) {
  return (
    <div className="grid grid-cols-7 gap-y-1">
      {weekDays.map((d) => (
        <span
          key={d}
          aria-hidden
          className="text-micro flex h-6 w-8 items-center justify-center text-text-primary/25"
        >
          {d}
        </span>
      ))}

      {days.map((day) => {
        const selected = day.selected;
        const today = day.now && !selected;
        return (
          <button
            key={day.$date.toISOString()}
            {...dayButton(day)}
            disabled={busy}
            className={`text-meta flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-[350ms] ${
              selected
                ? ""
                : day.inCurrentMonth
                  ? "text-text-primary/75 hover:text-text-primary"
                  : "text-text-primary/20 hover:text-text-primary/50"
            }`}
            style={{
              transitionTimingFunction: "var(--ease-enter)",
              // 选中的那天是**实心圆**（与收藏那颗星的填充同一条路子：
              // 状态靠填充，颜色只负责强调）—— 而这个产品没有强调色可用
              ...(selected
                ? {
                    backgroundColor: "var(--text-primary)",
                    color: "var(--background)",
                  }
                : {}),
              // 今天：一圈发丝。比选中弱一档，两者同时成立时让给选中
              ...(today
                ? {
                    boxShadow:
                      "inset 0 0 0 1px color-mix(in oklab, var(--text-primary) 28%, transparent)",
                  }
                : {}),
            }}
          >
            {/*
              ⚠️ 用 `$date.getDate()`，**不用库给的 `day.day`**：那个字串是
              `Intl` 按 locale 拼的，zh-CN 下连数字都带单位（「28日」）。
              用户 2026-10-11 也是这一句：「日期不要加日，直接数字就好」。
            */}
            {day.$date.getDate()}
          </button>
        );
      })}
    </div>
  );
}

/** 上/下个月。`propGetters` 给的是 `role` + `onClick`，这里只补上样子 */
function NavButton({
  label,
  children,
  ...rest
}: {
  label: string;
  children: React.ReactNode;
} & Record<string, unknown>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className="text-text-primary flex h-6 w-6 items-center justify-center opacity-40 transition-opacity duration-[350ms] hover:opacity-85 focus-visible:opacity-85"
      style={{ transitionTimingFunction: "var(--ease-enter)" }}
    >
      {children}
    </button>
  );
}

/**
 * 两个日期是不是**同一个本地日历日**。
 *
 * 比年月日，不比时刻 —— 已保存的那个带着原来的时分（比如 14:32），
 * 而挑出来的那天是午夜；直接比时间戳的话，**选回同一天也会被判成「改过」**，
 * 于是 `Save` 亮着、`Clear` 冒出来，两处都在说假话。
 *
 * 两个都是 `null` 才算相同：`null` 在这个产品里是「这张没有拍摄时间」。
 */
function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
