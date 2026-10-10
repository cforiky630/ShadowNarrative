"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ParticleCanvas,
  type ParticleCanvasHandle,
} from "@/components/ParticleCanvas";
import { DebugOverlay } from "@/components/DebugOverlay";
import { ensureGsap, DUR, EASE } from "@/lib/gsap";
import { useExperience } from "@/store/experience";
import type { EngineStats } from "@/engine/particle/ParticleSystem";

/**
 * 体验外壳 —— 粒子画布的**唯一**所有者。
 *
 * ── 它为什么存在 ────────────────────────────────────────────────────
 *
 * 2026-10-10：把 `ParticleCanvas` 从 `MemorySpace` 提到 `(experience)` 路由组的
 * layout 里。在那之前，「时间线 → 照片」是一次路由跳转，画布随 `MemorySpace`
 * 一起卸载重建，于是屏幕先空白（动态路由的 Suspense fallback），再黑屏一段
 * （画布挂载 + 取原图）。用户说的「硬跳转」就是它。
 *
 * 画布搬进 layout 之后，路由换掉时它**不卸载**：
 *   - 不再有空白帧
 *   - 照片可以从缩略图的位置飞进它在画布里的位置（FLIP），读起来是
 *     「这张照片占了那个位置」，而不是「打开了另一个页面」
 *
 * 这是 `01-PRODUCT_SPEC.md` §5「7 个体验状态，不是 7 个割裂的页面」，
 * 也是 `16-ALBUM_SPACE.md` §8.6「不能让人感觉是切换页面」的实现方式 ——
 * 那条约束管的是**记忆体验内部**（参数设置页不在此列，见 `07 §11.1`）。
 *
 * ⚠️ **画布只能有一个。** 不要在别处再渲染一个 `ParticleCanvas` ——
 * 两个引擎会各自占一份 WebGL 上下文和一份 rAF 循环。
 */

// ---------------------------------------------------------------------------
// 上下文
// ---------------------------------------------------------------------------

interface StageApi {
  /**
   * 画布句柄。路由页面拿它做两件外壳管不了的事：
   * 拖入照片时的 `morphTo`、删除时的 `setMode`、左下角的 `resetView`。
   */
  canvas: RefObject<ParticleCanvasHandle | null>;
  /**
   * 从时间线推入一张照片。`from` 是缩略图**此刻**的视口矩形。
   *
   * 调用方只管给起点，其余（算终点、飞过去、把时间线按下去、换路由）都在这里。
   */
  enter: (photoId: string, from: DOMRect) => void;
  /**
   * 「这批像素已经在画布上了，别再取一次。」
   *
   * 上传走这条路：`morphTo(本地文件)` 先把图送上了画布（不等网络往返），
   * 之后外壳看到 `photoId` 变了会想再 `setImage` 一遍 —— 那会把视角重置掉。
   */
  markLoaded: (photoId: string) => void;
}

const StageContext = createContext<StageApi | null>(null);

export function useStage(): StageApi {
  const api = useContext(StageContext);
  if (!api) {
    throw new Error(
      "useStage 只能用在 (experience) 路由组里 —— 画布归 ExperienceShell 所有",
    );
  }
  return api;
}

// ---------------------------------------------------------------------------
// 时序常量（对应 `16 §11.3` 的镜头）
// ---------------------------------------------------------------------------

/** 时间线退场用多久，然后才换路由。见下方 `enter` 的说明。 */
const LEAVE_MS = 400;
/** 飞行结束后，画布与飞行图交叉淡化的时长。两者像素一致，重叠不可见。 */
const HANDOFF_S = 0.3;
/** 图像迟迟不到的兜底。到点了也要收场，不能把时间线永远按在那儿。 */
const ENTER_TIMEOUT_MS = 2000;

// ---------------------------------------------------------------------------
// 外壳
// ---------------------------------------------------------------------------

export function ExperienceShell({ children }: { children: ReactNode }) {
  const canvasRef = useRef<ParticleCanvasHandle>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 一次只推一张。连点两张会让两段 GSAP 时间线抢同一个 hero。 */
  const entering = useRef(false);

  const router = useRouter();
  const pathname = usePathname();

  const stage = useExperience((s) => s.stage);
  const setStage = useExperience((s) => s.setStage);

  const [stats, setStats] = useState<EngineStats | null>(null);
  /**
   * 图已经装进画布的那张照片。
   *
   * FLIP 的终点必须等它：终点矩形是引擎按**图像的宽高比**算出来的
   * （`syncQuad` 里的 halfW/halfH），图像没装上时算的是上一张的。
   */
  const [loadedId, setLoadedId] = useState<string | null>(null);

  /**
   * 现在是哪个空间。由 `AlbumSpace` / `MemorySpace` 挂载时声明 ——
   * 用 pathname 分不出来（相册是 `/`，照片页是 `/?photo=<id>`）。
   */
  const space = useExperience((s) => s.stage.space);

  // -------------------------------------------------------------------------
  // 图像 → 画布
  // -------------------------------------------------------------------------

  const loadedUrl = useRef<string | null>(null);

  useEffect(() => {
    /*
     * 取哪张图。
     *
     * `photoId` 为 null 就什么都不取 —— **不再回落到内置示例图**。
     * 2026-10-10 起 `/` 是相册（`16-ALBUM_SPACE.md` §2），空库由相册的
     * 空态负责（§4「把照片拖进来」），不需要一张占位图。
     * 而且那会让相册路由白白加载一张没人看的图 ——
     * 相册和照片页的 pathname 都是 `/`，外壳分不出来。
     */
    if (!stage.photoId) return;
    const url = `/api/photos/${stage.photoId}/file`;
    if (loadedUrl.current === url) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const bitmap = await createImageBitmap(await res.blob());
        if (cancelled) {
          bitmap.close();
          return;
        }
        loadedUrl.current = url;
        // 不 close()：所有权转给引擎，贴图会引用它（ParticleSystem.setImage）
        await canvasRef.current?.setImage(bitmap);
        if (!cancelled) setLoadedId(stage.photoId);
      } catch {
        // 示例图或首张照片加载失败不是致命问题，画布保持原样即可
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stage.photoId]);

  // -------------------------------------------------------------------------
  // 画布那一层的显隐
  // -------------------------------------------------------------------------

  /*
   * 由**空间**决定，不是由路由决定 —— 相册和照片页的 pathname 都是 `/`。
   * 那个标志由各空间的组件在挂载时声明（`AlbumSpace` / `MemorySpace`）。
   *
   * **进入动画期间让位**：那一段的时序由 `enter` 掌握
   * （要等飞行过半才亮起来，否则整张照片会先于缩略图出现，成了叠影）。
   */
  useEffect(() => {
    if (useExperience.getState().stage.origin) return;
    setStage({ canvasShown: space === "photo" });
  }, [space, setStage]);

  // -------------------------------------------------------------------------
  // 进入：从缩略图飞到画布里的位置
  // -------------------------------------------------------------------------

  const markLoaded = useCallback((photoId: string) => {
    loadedUrl.current = `/api/photos/${photoId}/file`;
    setLoadedId(photoId);
  }, []);

  const enter = useCallback(
    (photoId: string, from: DOMRect) => {
      if (entering.current) return;
      entering.current = true;

      /*
       * 进照片永远是原图（`16 §8.1`）——
       * 「每次进来都是原图，粒子的第一次出现才有分量」。
       * 在这里设而不是等 MemorySpace 挂载：画布要在换路由之前就复位，
       * 否则会把上一张的粒子状态带进这张。
       */
      useExperience.getState().setDisplayMode("photo");
      setStage({
        // 立刻声明成照片空间 —— 否则画布那一层要等路由落定（`MemorySpace` 挂载）
        // 才知道该亮，而飞行已经开始了
        space: "photo",
        photoId,
        origin: { x: from.left, y: from.top, w: from.width, h: from.height },
      });

      /*
       * 路由**不是立刻**换的。
       *
       * 立刻换的话，时间线那棵 DOM 会在 ~100ms 内被卸载 —— 它才刚开始淡出，
       * 会读成一个突兀的弹出。所以先让时间线自己退场（`LEAVE_MS`），
       * 走完 `16 §11.3` 里 t=0–400 那一段，再换。
       *
       * 代价是地址栏晚 400ms 变。这个代价换来的是「同一个空间」的读感，
       * 值。而且飞行本身有兜底（下面那个 timeout），不会把用户卡住。
       */
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        router.push(`/?photo=${photoId}`);
      }, LEAVE_MS);
    },
    [router, setStage],
  );

  useEffect(
    () => () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    },
    [],
  );

  /*
   * 兜底：图像迟迟不到（网络慢、解码失败、引擎没起来）也要收场。
   * 到点了就把 `origin` 清掉 —— 时间线的透明度、画布的显隐都挂在它上面，
   * 不清就等于把用户永远按在退场状态里。
   */
  useEffect(() => {
    if (!stage.origin) return;
    const t = setTimeout(() => {
      entering.current = false;
      setStage({ origin: null, canvasShown: true });
    }, ENTER_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [stage.origin, setStage]);

  useEffect(() => {
    const origin = stage.origin;
    const hero = heroRef.current;
    if (!origin || !hero) return;
    // 终点还没定：图像没装上，引擎算的是上一张的宽高比
    if (loadedId !== stage.photoId) return;

    const finish = () => {
      entering.current = false;
      setStage({ origin: null });
    };

    const target = canvasRef.current?.photoScreenRect();
    const reduced = useExperience.getState().reducedMotion;

    // 引擎没起来，或用户要求减少动效：不做飞行，直接交接
    if (!target || reduced) {
      setStage({ canvasShown: true });
      finish();
      return;
    }

    const gsap = ensureGsap();
    const proxy = { ...origin, t: 0 };

    const paint = () => {
      hero.style.left = `${proxy.x}px`;
      hero.style.top = `${proxy.y}px`;
      hero.style.width = `${proxy.w}px`;
      hero.style.height = `${proxy.h}px`;
      // 圆角随之收掉：缩略图有圆角，画布里的照片是没有的
      hero.style.borderRadius = `${3 * (1 - proxy.t)}px`;
    };

    const tl = gsap.timeline({ onComplete: finish });

    tl.set(hero, { autoAlpha: 1 }, 0);
    tl.to(
      proxy,
      {
        x: target.x,
        y: target.y,
        w: target.w,
        h: target.h,
        t: 1,
        // 与 §11.3 的「相册 → 照片」同一个时长与缓动：
        // 那一条讲的是同一件事 —— 一张照片长成整个画面
        duration: DUR.scene,
        ease: EASE.enter,
        onUpdate: paint,
      },
      0,
    );
    // 飞行过半才亮画布。早了会叠影，晚了会闪黑
    tl.call(() => setStage({ canvasShown: true }), [], DUR.scene * 0.45);
    tl.to(hero, { autoAlpha: 0, duration: HANDOFF_S, ease: EASE.enter }, DUR.scene * 0.7);

    return () => {
      tl.kill();
    };
  }, [stage.origin, stage.photoId, loadedId, setStage]);

  // -------------------------------------------------------------------------

  const api = useMemo<StageApi>(
    () => ({ canvas: canvasRef, enter, markLoaded }),
    [enter, markLoaded],
  );

  return (
    <StageContext.Provider value={api}>
      {/*
        这一层的背景是 **实心** 的。它要盖住时间线，而画布的粒子之间是透明的 ——
        没有这层底色，退场中的时间线会从粒子缝里透出来。
        颜色与 body 一致，所以它读起来不是「一块板」，只是这片空间本身。

        ⚠️ **不要给这一层加 z-index。**

        它要收得到指针（OrbitControls 直接挂在 canvas 元素上），而照片页的
        `<main>` 是个 `relative` 的整屏块、DOM 上排在它之后 —— 那本来是正好的：
        画布在底，文字层（`main` 里的 `z-10`）在上。指针走的是同一套层叠，
        所以只要 `main` 自己 `pointer-events: none`（见 MemorySpace），
        指针就落到画布上，而按钮各自 `pointer-events: auto` 照样可点。

        一旦给这层抬 z-index，`main` 里的文字就会被**整块**压到画布底下，
        而画布有实心底色 —— 症状是日期和字幕整个消失（踩过两次：
        一次是抬 z-index，一次是给 `.sn-content` 加动画让它成了层叠上下文）。

        藏在时间线上时要 `pointer-events: none` —— 否则这层 opacity 0 的整屏
        div 会挡住叠放的左右滑动。
      */}
      <div
        data-sn-canvas-layer
        aria-hidden={!stage.canvasShown}
        className="fixed inset-0"
        style={{
          opacity: stage.canvasShown ? 1 : 0,
          pointerEvents: stage.canvasShown ? "auto" : "none",
          background: "var(--background)",
          // 与内容层同一条缓动：它们是一次交叉淡化，不是两个独立动画
          transition: "opacity var(--duration-scene) var(--ease-enter)",
        }}
      >
        <ParticleCanvas
          ref={canvasRef}
          className="block h-full w-full"
          fillHeight={FILL_HEIGHT}
          offsetY={OFFSET_Y}
          onUnsupported={() => setStage({ unsupported: true })}
          onStats={setStats}
          onViewChange={(rotated) => setStage({ rotated })}
          // 时间线上画布只是藏着 —— 停掉循环，别让 15 万粒子在没人看的地方跑
          paused={!stage.canvasShown}
        />
      </div>

      {/*
        `key={pathname}` 让换路由时这层重新挂载。
        这一层**没有常驻样式**，只承担进入动画期间的退场（`data-leaving`）——
        原因见 components.css 里那段：给它加动画会让它成为层叠上下文，
        把 `main` 里的文字整块压到画布底下。
      */}
      <div
        key={pathname}
        className="sn-content"
        data-leaving={stage.origin ? "" : undefined}
      >
        {children}
      </div>

      {/*
        飞行中的那张照片。

        它和缩略图、和画布里的那张是**同一张图**（同一个 src，走 HTTP 缓存），
        所以首尾两端都能和邻居对上，中间那段只是位置与大小在变。
        圆角在飞行中收掉 —— 缩略图有圆角，画布里的照片没有。

        `z-50` 压过一切，包括它出发的那块网格（`z-40`）和顶栏（`z-20`）。
        必须如此：它正从网格里**朝着观者出来**，被自己刚离开的那层盖住
        就完全读不出这件事了。飞完之后这层就卸掉，顶栏自然回来。
      */}
      {stage.origin && stage.photoId && (
        <div
          ref={heroRef}
          data-sn-hero
          aria-hidden
          className="pointer-events-none fixed z-50 overflow-hidden"
          style={{
            left: stage.origin.x,
            top: stage.origin.y,
            width: stage.origin.w,
            height: stage.origin.h,
            borderRadius: 3,
            // 交给 GSAP 置 1。写 0 而不是 1 是有意的：万一上面的 effect 提前
            // 返回（图像没到），这张图不该就那么杵在屏幕上
            opacity: 0,
            visibility: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photos/${stage.photoId}/file`}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {/*
        调试面板跟着画布走：它报的是引擎的数，画布藏着的时候没有可看的。
        （外壳在 layout 里，不这么写它会在时间线上也飘着 —— 那是纯 DOM 的地方。）
      */}
      {process.env.NODE_ENV !== "production" && stage.canvasShown && (
        <DebugOverlay stats={stats} />
      )}
    </StageContext.Provider>
  );
}

/*
 * 与 `MemorySpace` 里的同名常量是一回事（`16 §7.1` 的尺寸表）：
 * 照片主体占画面高度 55–65%，垂直偏上 4%。
 * 放在这里因为画布归这里；尺寸表以后要调，改这一处。
 */
const FILL_HEIGHT = 0.6;
const OFFSET_Y = 0.04;
