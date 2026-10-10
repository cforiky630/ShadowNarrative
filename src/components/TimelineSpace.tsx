"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStage } from "@/components/ExperienceShell";
import { PhotoPicker } from "@/components/PhotoPicker";
import { isImeKey } from "@/lib/keyboard";
import { uploadPhoto } from "@/lib/photoUpload";
import { revealStyle, useReveal } from "@/lib/useReveal";
import { useExperience } from "@/store/experience";
import type { Photo, TimelineDay } from "@/types";

/**
 * Timeline —— 中央时间线，节点以「天」为单位。
 *
 * 用户 2026-10-10 拍板：取代 `16-ALBUM_SPACE.md` §6 的 Library 抽屉，**不并存**。
 * 规格已同步（`01 §5`、`16 §1` 与 §6、`07`、`10`）。
 *
 * 形态决定（同日）：
 *   - 叠放用**扇形**（参数取自 images_swiper，见下）
 *   - 展开点「N 张」开**网格画廊** —— 源码里那就是个 SliverGrid。
 *     **不做**一次一张的翻页器，那不可能是 iMessage 的行为
 *   - 叠放本身**只负责左右滑动**，点它什么都不做（与源码一致）
 *   - 主题名**由用户自己写，不做 AI 提炼**（理由见 `ThemeName` 上方）
 *
 * ── 三档模型来自 iMessage ────────────────────────────────────────────
 *   1 张       单张
 *   2–3 张     松散叠放（Apple 叫 "collage"）
 *   4 张以上   堆叠 + 「X 张」标签
 */

// ---------------------------------------------------------------------------
// 几何常量
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 几何 —— 逐行照搬 images_swiper 的源码
// ---------------------------------------------------------------------------
//
// 来源：https://github.com/imWalsh/images_swiper/blob/main/lib/src/swiper.dart
// （2026-10-10 读完整份源码 + 逐帧看过它附带的演示动画）
//
// 从动画里读出来的三条事实，它们决定了这个组件的形态：
//   1. **前一张永远满尺寸居中，其余永远露着细边** —— 没有"其余照片消失"
//      这个状态。所以**不做**"展开成单张大图"。
//   2. **滑动是连续的**：卡片跟着手指走，中途明显倾斜（源码里 fraction=0.5
//      时旋转约 19°，不是稳态的 2.9°）。
//   3. **点「N张图片」标签打开的是网格画廊**（GalleryPage 里是 SliverGrid），
//      不是翻页器。叠放本身始终可滑。

/** 卡片高度。参考实现是 300（整屏选择器），时间线里一个节点放不下，按比例缩。 */
const CARD_H = 200;
/** 源码用 AspectRatio 0.8（竖幅）。 */
const CARD_W = Math.round(CARD_H * 0.8);

/** 相对参考实现的缩放比。像素常量都按它等比缩小，手感才不会变。 */
const S = CARD_W / 240;

/** 源码：`const double m = 220.0` —— 当前卡片跟手走的大步幅 */
const M = 220 * S;
/** 源码：`const double k = 20.0` —— 非当前卡片每远一张的横向偏移 */
const K = 20 * S;

/** 源码：`final _showCount = 5` —— 只画当前页 ±5 张，更远的不可见 */
const SHOW_COUNT = 5;

/** 源码：旋转 `lerpDouble(1.3, k, |fraction|)`，k = 0.05 */
const ROT_K = 0.05;
const ROT_LERP_FROM = 1.3;

/** 源码：缩放 `lerpDouble(.7, .1, |fraction|)`，k = 0.1 */
const SCALE_K = 0.1;
const SCALE_LERP_FROM = 0.7;

/** 源码里的 `_calcXxx` 都用这个（Dart 的 lerpDouble） */
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

// ---------------------------------------------------------------------------
// 页面
// ---------------------------------------------------------------------------

interface TimelineSpaceProps {
  days: TimelineDay[];
}

export function TimelineSpace({ days }: TimelineSpaceProps) {
  const setStage = useExperience((s) => s.setStage);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * 声明这是时间线空间。
   *
   * ⚠️ **每个空间都必须声明一次**（`stage.space` 的注释里有完整理由）。
   * 时间线这条一度漏了，症状是：从照片页点顶栏过来，画布那一层不会收起来
   * —— 它不透明度还是 1、还压在最上面，一层实心黑盖住整条时间线。
   * 因为 `/timeline` 上没人改这个值，外壳的显隐 effect 依赖它不变，就不会重跑。
   */
  useEffect(() => {
    setStage({ space: "timeline", photoId: null });
  }, [setStage]);

  /**
   * 空态里直接收一张。
   *
   * ⚠️ 这里原本写的是「把照片拖进来」，而**这一页根本不是拖放目标** ——
   * `usePhotoDrop` 只挂在相册与照片页上。一句话把人指向一个不存在的功能，
   * 比不说话更糟（用户 2026-10-10 的方向是「点击打开文件选择的那种」）。
   *
   * 上传复用 `lib/photoUpload`；成功之后 `router.refresh()` 让服务端重新
   * 按天分组 —— 这一页的数据是服务端分好的。
   */
  const acceptFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setNotice(null);
      try {
        await uploadPhoto(file);
        router.refresh();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "上传失败");
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  if (days.length === 0) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-12">
        {busy ? (
          <p className="text-meta text-text-primary/35">上传中…</p>
        ) : (
          <PhotoPicker
            onFile={(file) => void acceptFile(file)}
            className="text-meta cursor-pointer text-text-primary opacity-35 transition-opacity duration-[350ms] hover:opacity-85"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            还没有照片。捉影，这里会长出一条时间线。
          </PhotoPicker>
        )}

        {notice && (
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-micro text-text-primary/60 underline-offset-4 hover:underline"
          >
            {notice}
          </button>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 pt-32 pb-48">
      <div className="relative mx-auto max-w-[1100px]">
        {/* 中央脊柱。低存在感 —— 它是参照物，不是主体。 */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
          style={{ background: "var(--border-subtle)" }}
        />

        {days.map((day, index) => (
          <DayNode
            key={day.dayKey}
            day={day}
            side={index % 2 === 0 ? "left" : "right"}
          />
        ))}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 一天
// ---------------------------------------------------------------------------

function DayNode({ day, side }: { day: TimelineDay; side: "left" | "right" }) {
  const { ref, revealed } = useReveal<HTMLElement>();
  const onLeft = side === "left";

  const body = <NodeBody day={day} align={onLeft ? "right" : "left"} />;

  return (
    <section
      ref={ref}
      style={revealStyle(revealed)}
      // sn-reveal 是 reduced-motion 的钩子：那条媒体查询在 components.css 里，
      // 用 !important 压过这里的内联样式（见 useReveal.ts 的说明）
      className="sn-reveal relative grid min-h-[300px] grid-cols-2 items-center gap-20"
    >
      <div className={onLeft ? "flex justify-end" : ""}>{onLeft && body}</div>
      <div className={!onLeft ? "flex justify-start" : ""}>{!onLeft && body}</div>
    </section>
  );
}

function NodeBody({ day, align }: { day: TimelineDay; align: "left" | "right" }) {
  const onRight = align === "right";
  const [gridOpen, setGridOpen] = useState(false);

  return (
    <>
      <div className={`flex flex-col gap-5 ${onRight ? "items-end" : "items-start"}`}>
        <div className={onRight ? "text-right" : "text-left"}>
          <p className="text-meta text-text-primary/45">{formatDay(day.dayKey)}</p>
          <ThemeName day={day} align={align} />
        </div>

        {/*
          标签在叠放**上方** —— 源码就是这么排的（Column：TextButton → 10px → 叠放）。
          放在旁边的话，叠放本身 266px 宽，窄视口下会把标签挤出屏幕。
        */}
        <div className={`flex flex-col gap-3 ${onRight ? "items-end" : "items-start"}`}>
          <CountLabel
            count={day.photos.length}
            align={align}
            onOpen={() => setGridOpen(true)}
          />
          <PhotoStack photos={day.photos} />
        </div>
      </div>

      {gridOpen && (
        <PhotoGrid photos={day.photos} onClose={() => setGridOpen(false)} />
      )}
    </>
  );
}

/** 02-DESIGN_SYSTEM.md §4 的日期格式：2025 · 09 · 28 */
function formatDay(dayKey: string): string {
  return dayKey.replace(/-/g, " · ");
}

/**
 * 「N 张」标签。
 *
 * 源码里它是个 `TextButton`，点开的是**网格画廊** —— 所以它**是入口**，不是装饰。
 * 叠放本身只负责滑动，不负责"展开"。
 */
function CountLabel({
  count,
  align,
  onOpen,
}: {
  count: number;
  align: "left" | "right";
  onOpen: () => void;
}) {
  if (count < 2) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      title="看这一天的全部照片"
      className="text-meta shrink-0 text-text-primary/35 underline-offset-4 hover:text-text-primary/70 hover:underline"
      style={{ textAlign: align }}
    >
      {count} 张
    </button>
  );
}

// ---------------------------------------------------------------------------
// 主题名
// ---------------------------------------------------------------------------

/**
 * 这一天大致落在什么时段。
 *
 * 用户 2026-10-10：「用户没写主题的时候用淡淡的留下点什么占位」。
 *
 * 用**拍摄时间**当占位，而不是让 AI 编一个名字。理由是：
 * 时间是**事实**，不是推测 —— 而给一天起名是用户自己的事
 * （`01 §9`：AI 不替用户定义这段记忆是什么）。但「这天是从下午到夜里」
 * 这句话是照片本身说出来的，可以说。
 *
 * 副产品：每个节点的占位都不一样，不会一排长得一模一样。
 */
function daySpan(photos: Photo[]): string | null {
  const hours = photos
    .map((p) => new Date(p.takenAt ?? p.createdAt).getHours())
    .filter((h) => Number.isFinite(h));
  if (hours.length === 0) return null;

  const from = partOfDay(Math.min(...hours));
  const to = partOfDay(Math.max(...hours));
  return from === to ? from : `${from}到${to}`;
}

function partOfDay(hour: number): string {
  if (hour < 5) return "凌晨";
  if (hour < 9) return "早晨";
  if (hour < 12) return "上午";
  if (hour < 14) return "中午";
  if (hour < 17) return "午后";
  if (hour < 19) return "傍晚";
  if (hour < 23) return "夜里";
  return "深夜";
}

/**
 * 主题名。用户自己写，点一下可以改。
 *
 * ⚠️ **不做 AI 自动提炼**（2026-10-10 决定，推翻了同日上午的「默认提炼」）。
 * 两个理由：
 *   1. `01 §9` 不允许 AI 替用户定义这段记忆是什么 —— 而给一天起名正是这件事。
 *      同一个道理产品早就用在日志上了：AI 整理出的东西必须用户主动触发。
 *   2. **个人相册里大多数天只有一两张照片**，那是「信息不足」的常态而不是边缘情况。
 *      实测过：只有两张照片时，模型只能把某一张的描述压成一个词
 *      （「仰头的布偶猫」）—— 那是照片里的东西，不是这一天。
 */
function ThemeName({ day, align }: { day: TimelineDay; align: "left" | "right" }) {
  const [title, setTitle] = useState(day.title);
  const [source, setSource] = useState(day.titleSource);
  const [draft, setDraft] = useState(day.title ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const placeholder = daySpan(day.photos);

  const commit = async () => {
    const next = draft.trim();
    if (next === (title ?? "")) {
      setEditing(false);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/timeline/${day.dayKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as {
        data: { title: string | null; titleSource: "user" | null };
      };
      setTitle(body.data.title);
      setSource(body.data.titleSource);
      setDraft(body.data.title ?? "");
      setEditing(false);
    } catch {
      // 保存失败就停在编辑态，用户的输入不能丢
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <input
        // 点开就是为了改它，自动聚焦是对的
        autoFocus
        value={draft}
        placeholder="这天叫什么"
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          /*
           * ⚠️ **组字中的 Enter / Esc 是输入法的，不是你的。**
           *
           * 中文输入法里 Enter 是「选这个候选」、Esc 是「取消候选」——
           * 不管它们的话，给某一天起名起一半就会被提交或丢弃
           * （`lib/keyboard.ts` 有完整说明）。
           */
          if (isImeKey(e)) return;
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") {
            setDraft(title ?? "");
            setEditing(false);
          }
        }}
        className="text-body mt-1 w-[22ch] border-0 border-b border-border-subtle bg-transparent pb-1 text-text-primary/95 outline-none placeholder:text-text-primary/25 focus:border-text-primary/40"
        style={{ textAlign: align }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        // 占位只是提示，不预填进输入框 —— 名字得是用户自己的话
        setDraft(title ?? "");
        setEditing(true);
      }}
      title={title ? "点一下改" : "给这天起个名字"}
      className="text-body mt-1 underline-offset-4 hover:underline"
      style={{
        color: title
          ? source === "user"
            ? "var(--text-primary)"
            : "color-mix(in oklab, var(--text-primary) 72%, transparent)"
          : // 占位要「淡」：比任何真实的名字都暗。它是提示，不是内容
            "color-mix(in oklab, var(--text-primary) 22%, transparent)",
        textAlign: align,
      }}
    >
      {title ?? placeholder ?? "给这天起个名字"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 照片组 —— 逐行照搬 images_swiper 的算法
// ---------------------------------------------------------------------------

/** 源码 `_calcRotation`。当前卡片在拖拽中被转得更多（fraction=0.5 时约 19°）。 */
function calcRotation(fraction: number, isCurrent: boolean): number {
  const lerpToK = lerp(ROT_LERP_FROM, ROT_K, Math.abs(fraction));
  return fraction * (isCurrent ? lerpToK : ROT_K); // 弧度
}

/** 源码 `_calcScale`。当前卡片缩得更快，交接的瞬间两边一样大，不会跳。 */
function calcScale(fraction: number, isCurrent: boolean): number {
  const lerpToK = lerp(SCALE_LERP_FROM, SCALE_K, Math.abs(fraction));
  return Math.max(1 - (isCurrent ? lerpToK : SCALE_K) * Math.abs(fraction), 0);
}

/**
 * 源码 `calcOffset` 里的位移函数，一字不改。
 *
 * 两段式的关键：**当前卡片跟手走大步幅 m，退下来时收敛到小偏移 k**；
 * 其余卡片只按 k 挪一点点 —— 所以它们始终只是「细边」，不跟着跑。
 */
function calcOffset(index: number, fraction: number, currentPage: number): number {
  if (currentPage === index) {
    if (Math.abs(fraction) < 0.5) return fraction * M;
    return fraction > 0
      ? Math.max(M - fraction * M, K)
      : Math.min(-(M + fraction * M), -K);
  }

  // 源码：超出当前页 ±_showCount 的直接不画
  const tooFar =
    index <= currentPage - SHOW_COUNT || index >= currentPage + SHOW_COUNT;
  return tooFar ? 0 : fraction * K;
}

function PhotoStack({ photos }: { photos: Photo[] }) {
  const n = photos.length;
  const { enter } = useStage();

  /** 连续的「页位置」。整数 = 停稳在某一张上。对应源码的 `_offsetX`。 */
  const [page, setPage] = useState(0);
  /**
   * 拖拽方向。源码的 `_currentPage` 是带滞后的状态：向前用 truncate、
   * 向后用 ceil，免得在 0.5 附近来回翻。这里按方向推导，效果一致。
   */
  const [direction, setDirection] = useState<1 | -1>(1);
  /** 拖拽中。必须是 state —— 它影响渲染（拖拽时不能有过渡，否则拽不动） */
  const [dragging, setDragging] = useState(false);

  const drag = useRef<{ x: number; page: number; moved: boolean } | null>(null);

  const clamp = (v: number) => Math.min(Math.max(v, 0), n - 1);
  const currentPage = clamp(direction === 1 ? Math.floor(page) : Math.ceil(page));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (n < 2) return;
    drag.current = { x: e.clientX, page, moved: false };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    if (!d.moved) return;
    if (dx !== 0) setDirection(dx < 0 ? 1 : -1);
    setPage(clamp(d.page - dx / M));
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d?.moved) return;
    setPage((p) => Math.round(clamp(p))); // 吸附到最近的一张
  };

  // 停稳时最多铺开这么宽；拖动时会临时溢出（不裁剪）
  const maxSpread = Math.min(Math.max(n - 1, 0), SHOW_COUNT) * K;
  const deckW = n === 1 ? CARD_W : CARD_W + 2 * maxSpread;
  const deckH = CARD_H + 24; // 留出旋转的余量

  return (
    /*
     * 是 div 不是 button —— **叠放只负责左右滑动，点它什么都不做**。
     *
     * 用户 2026-10-10：「堆叠状态只能左右滑，展开后点击图片进去」。
     * 这也是源码的做法（叠放那层的 `onTap` 是注释掉的）。
     *
     * 附带好处：**没有 click 处理，浏览器在拖拽结束后补发的那个 click
     * 就没有东西可以触发** —— 不需要再单独写一套"吞掉它"的机制。
     * （上一版就是因为漏了那套机制，导致手指一松就跳进照片页。）
     *
     * ⚠️ **只有一张时是例外** —— 那时卡片本身是个 `<Link>`（见下面那段）。
     * 「点它什么都不做」是为了让「拖」和「点」不打架，而一张时没有可拖的，
     * 那条理由不存在；不这么做的话那一天的照片**根本没有入口**
     * （「N 张」标签在 `count < 2` 时不渲染）。
     *
     * tabIndex + 方向键是给键盘用户的：没有点击不代表没有交互。
     */
    <div
      role="group"
      tabIndex={n > 1 ? 0 : -1}
      onKeyDown={(e) => {
        if (n < 2) return;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setPage((p) => clamp(Math.round(p) - 1));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setPage((p) => clamp(Math.round(p) + 1));
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={() => {
        drag.current = null;
      }}
      aria-label={n > 1 ? `这一天的 ${n} 张照片，可左右拖动` : undefined}
      className="relative touch-pan-y outline-none"
      style={{
        width: deckW,
        height: deckH,
        cursor: n > 1 ? "grab" : "default",
      }}
    >
      {photos.map((photo, i) => {
        const fraction = page - i;
        const isCurrent = i === currentPage;
        const offset = calcOffset(i, fraction, currentPage);
        const scale = calcScale(fraction, isCurrent);
        const rotation = calcRotation(fraction, isCurrent);

        // 源码：translate(-offset) → scale → rotateZ(-rotation)，以中心为原点
        const transform = `translate(${-offset}px, 0) scale(${scale}) rotate(${-rotation}rad)`;

        const cardStyle: CSSProperties = {
          position: "absolute",
          left: "50%",
          top: "50%",
          width: CARD_W,
          height: CARD_H,
          marginLeft: -CARD_W / 2,
          marginTop: -CARD_H / 2,
          transform,
          transformOrigin: "center",
          // 源码 initState：zIndex = _itemsLength - key；当前页置顶
          zIndex: isCurrent ? n + 1 : n - i,
          // 拖拽中不加过渡 —— 跟手必须即时，有过渡会「拽不动」
          transition: dragging
            ? "none"
            : "transform var(--duration-ui) var(--ease-enter)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          boxShadow: "0 12px 36px rgb(0 0 0 / 0.6)",
          background: "var(--surface-elevated)",
        };

        /*
          只画当前页 ±SHOW_COUNT 张（源码的 _showCount = 5）。
          更远的连 DOM 都不进 —— 这是真正的懒加载。

          缩略图（08 §6）。卡片宽 160 CSS px，原图在这里是几十倍的浪费。
          不走 next/image：那要 sharp，等于把刚避开的原生模块换个地方
          引进来（05 §7、10 的 Round 13）
        */
        const cardInner = Math.abs(fraction) <= SHOW_COUNT && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/photos/${photo.id}/thumbnail`}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover"
          />
        );

        /*
          ⚠️ **只有一张时，卡片本身要能点开。**

          用户 2026-10-10：「时间线页面有问题，单张照片居然点不开」。

          这一格原本是**死的**：叠放「只负责左右滑动、点它什么都不做」
          （源码如此），而进照片的唯一入口是上面那个「N 张」标签 ——
          它在 `count < 2` 时返回 `null`。于是**一天只有一张照片时两条路都没有**，
          那张照片永远打不开。

          一张的时候本来也没有歧义：没有别的东西可滑，点它只能是「打开这张」。
          （≥2 张时仍旧按源码：点它不做事，「N 张」开网格画廊。
          卡片跟着手指走，再叠一个点击会分不清是拖还是点。）
        */
        if (n === 1) {
          return (
            <Link
              key={photo.id}
              href={`/?photo=${photo.id}`}
              aria-label="打开这张照片"
              onClick={(e) => {
                // 修饰键/中键保留原义：新标签页打开一张照片是合理的
                if (
                  e.metaKey ||
                  e.ctrlKey ||
                  e.shiftKey ||
                  e.altKey ||
                  e.button !== 0
                ) {
                  return;
                }
                e.preventDefault();
                enter(photo.id, e.currentTarget.getBoundingClientRect());
              }}
              style={{ ...cardStyle, cursor: "pointer" }}
            >
              {cardInner}
            </Link>
          );
        }

        return (
          <div key={photo.id} style={cardStyle}>
            {cardInner}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 网格画廊
// ---------------------------------------------------------------------------

/**
 * 「N张图片」标签点开的就是这个。
 *
 * 源码里 `gallery_page.dart` 是个 `SliverGrid`（三列、padding 15）。
 * **不做**成一次一张的翻页器 —— 那不是 iMessage 的行为。
 */
function PhotoGrid({ photos, onClose }: { photos: Photo[]; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { enter } = useStage();

  useEffect(() => {
    // 打开就把焦点交给面板：Esc 才收得到，键盘也才滚得动
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 组字中的 Esc 是输入法在取消候选，不该把这一天的照片收掉（`lib/keyboard.ts`）
      if (e.key === "Escape" && !isImeKey(e)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="这一天的照片"
      // tabIndex + sn-noscrollbar 是一对：滚动条藏起来了，
      // 滚动本身必须留着，而且键盘要够得到
      tabIndex={-1}
      className="sn-noscrollbar fixed inset-0 z-40 overflow-y-auto px-6 py-20 outline-none"
      // 实心，不做半透明。94% 会让底下的时间线透出来 ——
      // 在全屏的阅读层上那读起来像渲染瑕疵，不像氛围
      style={{ background: "var(--background)" }}
    >
      <button
        type="button"
        onClick={onClose}
        className="text-meta fixed top-24 right-12 text-text-primary/45 underline-offset-4 hover:text-text-primary/85 hover:underline"
      >
        关闭
      </button>

      <div className="mx-auto grid max-w-[880px] grid-cols-3 gap-3">
        {photos.map((photo) => (
          /*
           * 是 Link 但点了不直接走 —— 先交给外壳把这张照片从**这个格子**
           * 飞进画布，再换路由（见 ExperienceShell.enter）。
           * 保留 Link 是因为修饰键/中键的语义要留着：新标签页打开一张照片
           * 是合理的，那时候不该播什么镜头。
           */
          <Link
            key={photo.id}
            href={`/?photo=${photo.id}`}
            onClick={(e) => {
              if (
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey ||
                e.button !== 0
              ) {
                return;
              }
              e.preventDefault();
              enter(photo.id, e.currentTarget.getBoundingClientRect());
            }}
            className="block overflow-hidden rounded-sm transition-opacity hover:opacity-80"
          >
            {/* 缩略图（08 §6）。网格里一张约 285 CSS px 宽 —— 原图在这个
                尺寸下同样只是浪费内存 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/photos/${photo.id}/thumbnail`}
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-[4/3] w-full object-cover"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

