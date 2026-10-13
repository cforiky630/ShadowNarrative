"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccordionGallery, {
  type AccordionGalleryItem,
} from "@/components/AccordionGallery";
import { useStage } from "@/components/ExperienceShell";
import { PhotoPicker } from "@/components/PhotoPicker";
import { makeThumbnail } from "@/lib/makeThumbnail";
import { uploadPhoto } from "@/lib/photoUpload";
import { usePhotoDrop } from "@/lib/usePhotoDrop";
import { revealStyle, useReveal } from "@/lib/useReveal";
import { useExperience } from "@/store/experience";
import type { Photo } from "@/types";

/**
 * Album —— 产品第一屏（`16-ALBUM_SPACE.md` §2–§5）。
 *
 * 一排照片，当前那张展开、其余收成细条。**不是平铺网格**：
 * 没有行列、没有对齐的格子、没有边界。
 *
 * ── 形态换过一次 ────────────────────────────────────────────────────
 *
 * 2026-10-10 的第一版是**斜轴**：照片沿一条斜轴排布、由近及远退去
 * （`§2.2` 的 `normalize(0.62, 0.26, -1.0)`）。那一版调了一轮方向
 * 都没对上手感，用户当天拍板换成 React Bits 的 AccordionGallery。
 *
 * 换掉的只是**排布**。下面这些与排布无关、都是那一天定下来的，一样留着：
 *
 *   - 轴上放哪几张 —— `albumService.getAlbumPhotos`（固定量、优先收藏、
 *     装不下的给「看全部」）
 *   - 空态与上传入口（`§4`、`§5`）
 *   - 点展开的那张 → 从**它在屏幕上的位置**飞进照片页（那条 FLIP 接缝）
 *   - 收藏、主题名那些都在别处，不受影响
 *
 * ⚠️ `16 §2.3`（边缘粒子化）与 `§2.4`（焦点窗口）随「相册不要粒子」
 * 一起作废了，与这次换组件无关。
 */

interface AlbumSpaceProps {
  /** 上墙的这几张。取哪几张由 `albumService.getAlbumPhotos` 决定 */
  photos: Photo[];
  /** 没上墙的数量。> 0 时出现「看全部」 */
  hidden: number;
}

/** 视口尺寸。用 useSyncExternalStore 而不是「挂载后 setState」——
 *  后者在 effect 里同步 setState 会触发级联渲染，lint 也会报。 */
function useViewport(): { w: number; h: number } {
  const key = useSyncExternalStore(
    (cb) => {
      window.addEventListener("resize", cb);
      return () => window.removeEventListener("resize", cb);
    },
    () => `${window.innerWidth}x${window.innerHeight}`,
    // 服务端没有视口。给 0，挂载后立刻会被真实值替掉
    () => "0x0",
  );
  const [w, h] = key.split("x").map(Number);
  return { w, h };
}

export function AlbumSpace({ photos, hidden }: AlbumSpaceProps) {
  const { enter } = useStage();
  const router = useRouter();
  const setStage = useExperience((s) => s.setStage);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * 刚上传、还没被服务端数据追上的那些。
   *
   * 上传后要**立刻**出现在墙上（`§5`），而不是等一个来回。
   * `router.refresh()` 把新数据带回来之后靠 id 去重，不会出现两张。
   */
  const [extra, setExtra] = useState<Photo[]>([]);

  const all = useMemo(() => {
    const seen = new Set(photos.map((p) => p.id));
    return [...photos, ...extra.filter((p) => !seen.has(p.id))];
  }, [photos, extra]);

  const { h } = useViewport();

  /**
   * 装手风琴的这一层。
   *
   * 进照片时要拿那个面板的**视觉**矩形当飞行起点，所以得能按序号找到它。
   * 用 `querySelectorAll` 而不是「ref 回调往数组里塞」：后者会被
   * `react-hooks/refs` 判成「渲染期读 ref」（React 19 的 ref 回调带清理函数，
   * lint 对它很保守）。这里只在事件处理里查一次，绕开那类判定。
   */
  const stageRef = useRef<HTMLElement>(null);

  /**
   * 进场的揭示（`src/lib/useReveal.ts`）。
   *
   * 用户 2026-10-10：「时间线页面就很好，切到该页面会有一个动效，
   * 我希望首页也有这个效果而不是一下闪出来」。
   *
   * 用的就是时间线那一个 `useReveal` / `revealStyle` —— 不是仿的，
   * 同一份代码。透明度 + 上移 + 模糊收清，缓动与时长都从 token 读。
   *
   * 分两处、差 120ms：画廊先来，下面那行操作后到。整体一起淡会显得
   * 是一张图在淡入；错开一点才是「东西各自出现」。
   *
   * ⚠️ 必须**解构**出来用。`react-hooks/refs` 会把 `x.ref` 和 `x.revealed`
   * 一视同仁地当成「从带着 ref 的对象上读属性」——它会保守地认为那是
   * 渲染期读 ref。拆成两个裸值就没这回事了（时间线那边也是这么写的）。
   */
  const { ref: galleryRef, revealed: galleryRevealed } =
    useReveal<HTMLDivElement>();
  const { ref: footerRef, revealed: footerRevealed } =
    useReveal<HTMLDivElement>();

  // 声明这是相册空间：画布那一层在相册上是藏着的，引擎也不该跑
  // （`/` 同时也是照片页的 pathname，外壳分不出来，只能由这里说）
  useEffect(() => {
    setStage({ space: "album", photoId: null });
  }, [setStage]);

  /**
   * 每一格的图与标题。
   *
   * 图走**缩略图**（`08 §6`）：一列并排摆着 8 张，原图在这个尺寸下
   * 每一个像素的细节都用不上，却要付十几倍的解码内存 ——
   * 那正是 `16 §2.4` 说的「几十张就是几百 MB」。
   *
   * 标题用**日期**：一天里可能有好几张，日期会重复，但它是我们手上
   * 唯一确定的事实（时间轴的主题名是按天存的，挪到单张上没有依据）。
   */
  const items: AccordionGalleryItem[] = useMemo(
    () =>
      all.map((photo) => ({
        image: `/api/photos/${photo.id}/thumbnail`,
        label: formatDate(photo.takenAt ?? photo.createdAt),
      })),
    [all],
  );

  /**
   * 点开的那一张 → 进照片页（`§3.3`）。
   *
   * 起点用**视觉**矩形 —— 飞行图要从它看起来所在的位置起飞，
   * 而不是从收起的那个细条的位置。
   */
  const activate = useCallback(
    (index: number) => {
      const photo = all[index];
      if (!photo) return;
      const panels = stageRef.current?.querySelectorAll('[role="listitem"]');
      const el = panels?.[index];
      if (!el) return;
      enter(photo.id, el.getBoundingClientRect());
    },
    [all, enter],
  );

  // ── 上传（§5：相册就是上传的地方）────────────────────────────────

  const acceptFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setNotice(null);
      try {
        // 缩略图在这里现生成（`08 §6`）。相册这一条**没有**可以复用的
        // 解码结果 —— 它显示照片靠的是 `<img>`，不是 createImageBitmap。
        // 失败返回 null，上传照旧（服务端会回落成原图直出）
        const thumbnail = await makeThumbnail(file);
        const photo = await uploadPhoto(file, thumbnail);
        setExtra((prev) => [...prev, photo]);
        router.refresh();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "上传失败");
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const dropping = usePhotoDrop(acceptFile);

  // ── 渲染 ──────────────────────────────────────────────────────────

  if (all.length === 0) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-12">
        <div className="flex flex-col items-center gap-4">
          {/*
            §4 空态：不显示空网格、不显示「暂无内容」，**安静一行**。

            ⚠️ 这一行**必须是可点的**（2026-10-10）。原先只有「把照片拖进来」
            —— 拖放对第一次用的人不是显然的，库里又一张都没有、点哪儿都没
            反应，那是个死胡同。

            ⚠️ **2026-10-11：从一句说明改成一个词，再改成英文的一句。**
            用户先说的是「没照片时那句话太low了，换个说法」—— 那一句
            「把照片拖进来，或点这里捉影」在**解释这个界面怎么用**，
            而界面上不该有说明书（`07 §12.4`）。

            当天最后定的是 **`Capture a Moment`**。英文是对的：这一行
            与空间名同一族（`Memories` / `Timeline` / `Into this moment`），
            而它是用户见到的第一句话。

            拖放不必用字去教 —— 拖着照片进来的时候 `DropFrame` 自己会亮。
          */}
          <PhotoPicker
            onFile={(file) => void acceptFile(file)}
            className="text-meta cursor-pointer text-text-primary opacity-35 transition-opacity duration-[350ms] hover:opacity-85"
            style={{ transitionTimingFunction: "var(--ease-enter)" }}
          >
            Capture a Moment
          </PhotoPicker>
          {notice && (
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-micro text-text-primary/60 underline-offset-4 hover:underline"
            >
              {notice}
            </button>
          )}
        </div>
        {dropping && <DropFrame />}
      </main>
    );
  }

  /*
   * 尺寸。
   *
   * 用户 2026-10-10：「大小也可以调小一点、现在有点突兀不和谐」。
   * 高度从 `h*0.52`（这台机器上近 520px）收到 `h*0.38`，并且限一个
   * 最大宽度 —— 不铺满整屏，两边留白。产品那套调子是「UI 是空气、
   * 别抢画面」（`02 §1`），一列顶到天花的照片不是那个意思。
   */
  const galleryHeight =
    h > 0 ? Math.min(Math.max(Math.round(h * 0.38), 220), 440) : 380;

  return (
    <main
      ref={stageRef}
      /*
       * `relative` 不是顺手加的：揭示期间那两层的 `opacity < 1` 会让它们成为
       * **层叠上下文**，而层叠上下文是按它在父级里的身份参与层叠的。
       * `main` 只要是定位元素（哪怕 z-index 是 auto），整棵子树就落在
       * 「定位元素」那一拨里，压得住 `fixed` 的画布层；`main` 若是 static，
       * 它们会归到「块级内容」那一拨，**沉到画布底下去**（踩过，见 `05 §6.2`）。
       */
      className="relative flex h-dvh flex-col justify-center gap-8 px-12"
    >
      <div
        ref={galleryRef}
        style={revealStyle(galleryRevealed)}
        className="sn-reveal mx-auto w-full max-w-[760px]"
      >
        <AccordionGallery
          items={items}
          // 新的一张在最前（`albumService` 的顺序），展开的也默认是它
          defaultIndex={0}
          height={galleryHeight}
          gap={8}
          radius={6}
          /*
           * 展开的那张占整行的比例。用上游默认的 0.52，不要调低。
           *
           * 公式是 `grow = r(n-1)/(1-r)`，其余每格 grow=1。r 只要小于 0.5，
           * **照片少于三张时反而会反**：n=2 时展开的那张占 r、收起的那张占
           * 1-r —— r=0.42 就成了「展开的那张比收起的还窄」（试过，很怪）。
           * 0.52 在 n=2 和 n=8 两边都成立。
           */
          expandRatio={0.52}
          tilt={8}
          // 收起的那张靠**模糊**退到后面，不去色 ——
          // 「黑白跟死了一样」（用户 2026-10-10）
          grayscale={false}
          blur={5}
          // 颜色全部走项目 token，不写死上游那几个值
          accentColor="var(--text-primary)"
          overlayColor="var(--background)"
          textColor="var(--text-primary)"
          onActivate={activate}
        />
      </div>

      {/*
        操作行。「看全部」是轴上装不下的那些的出口。

        ⚠️ 现在指向 `/timeline` —— `01 §5` 里它就是「全部照片」，
        是眼下唯一能看全的地方。用户 2026-10-10 说「memorys 板块
        还没做，以后准备做成全部照片库」，那个板块做出来之后这里改指它。
      */}
      <div
        ref={footerRef}
        style={revealStyle(footerRevealed, 120)}
        className="sn-reveal pointer-events-auto mx-auto flex w-full max-w-[760px] items-center justify-between"
      >
        <div className="flex items-center gap-5">
          {busy && (
            <span className="text-micro text-text-primary/40">上传中…</span>
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

          {!busy && !notice && (
            /*
              操作行上这一条只在**有照片**时出现。文案与空态那句**同一个**
              （用户 2026-10-11：「三个都改成 Capture a Moment」）——
              同一个动作在全产品只有一个名字。

              ⚠️ 这里原本写的是「捉影」。那个词没有作废，只是不再出现在
              界面上（用户当天把三处入口统一成了英文那一句）。
            */
            <PhotoPicker
              onFile={(file) => void acceptFile(file)}
              className="text-micro cursor-pointer text-text-primary opacity-25 transition-opacity duration-[350ms] hover:opacity-85"
              style={{ transitionTimingFunction: "var(--ease-enter)" }}
            >
              Capture a Moment
            </PhotoPicker>
          )}
        </div>

        {hidden > 0 && (
          <Link
            href="/timeline"
            className="text-micro text-text-primary/30 underline-offset-4 hover:text-text-primary/70 hover:underline"
          >
            还有 {hidden} 张 · 看全部
          </Link>
        )}
      </div>

      {dropping && <DropFrame />}
    </main>
  );
}

/** 拖拽悬停时的整屏描边。和照片页那一层同一处理 */
function DropFrame() {
  return (
    <div className="pointer-events-none fixed inset-0 z-20 border border-border-subtle" />
  );
}

/** 02-DESIGN_SYSTEM.md §4 的日期格式：2025 · 09 · 28 */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y} · ${m} · ${day}`;
}
