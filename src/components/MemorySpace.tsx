"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { useStage } from "@/components/ExperienceShell";
import { ConversationPanel } from "@/components/ConversationPanel";
import HoldButton from "@/components/HoldButton";
import { Subtitle } from "@/components/Subtitle";
import { makeThumbnail } from "@/lib/makeThumbnail";
import { uploadPhoto } from "@/lib/photoUpload";
import { usePhotoDrop } from "@/lib/usePhotoDrop";
import type { AiState, PhotoDetail } from "@/types";
import { useExperience } from "@/store/experience";

/**
 * Photo View —— 首页的客户端部分。
 *
 * 规格：07-UI_PAGE_SPECS.md §1、16-ALBUM_SPACE.md §7.1
 *
 * ⚠️ **画布不在这里**。2026-10-10 起 `ParticleCanvas` 归 `ExperienceShell`
 * 所有（`(experience)/layout.tsx`），因为它必须在路由切换时**存活** ——
 * 那就不能长在任何一条路由的组件树里。
 *
 * 这里只剩**文字层**：日期、字幕、操作区。所以这个组件的每一次重渲染
 * 都只跟文字有关，粒子一帧都不过 React（`05 §18`）。
 *
 * 尺寸表（16 §7.1，基准视口 1440×900）：
 *   照片主体     画面高度 55–65% · 水平居中 · 垂直偏上 4%  ← 现在在 ExperienceShell
 *   日期         照片下 24px · text-meta · opacity 0.55
 *   字幕         日期下 8px   ← **占用原来"标题"的位置**
 *   操作区       字幕下 24px
 *
 * 「字幕占用原来标题的位置」是 16 §7.1 明确写的：那里原来放记忆标题，
 * 现在放 AI 的第一句话 —— 因为它才是用户最想看到的东西。
 *
 * 不能出现传统 hero 卡片：没有边框、没有投影、没有背景块。
 */

/** 云占 60% 且上移 4% ⇒ 下边缘约在 76%，文字从 78% 起排 */
const TEXT_TOP = "78%";

/** 轮询间隔与上限（08 §10：800ms 一次，最多 30 秒） */
const POLL_INTERVAL_MS = 800;
const POLL_TIMEOUT_MS = 30_000;

/**
 * 进/出这一格用的交叉淡化：与溶解**同一条缓动和时长**。
 *
 * `16 §8.6` 的纪律 —— 用 UI 的 350ms 会让它读成「界面在响应」，
 * 而这里发生的是「空间在变化」。
 */
const CROSSFADE = "opacity var(--duration-morph) var(--ease-morph)";

/**
 * `Back` 在粒子态的收放。
 *
 * 与那一格的两段文字**同一条缓动和时长**（`CROSSFADE`）—— 整行是一次
 * 「交叉淡化 + 重新居中」，不是「按钮换了个字」加「旁边少了个东西」。
 *
 * ⚠️ **间距必须和宽度一起收。** 这一行的间隔原本是父级的 `gap-7`，
 * 而 `gap` 留在行上的话，`Back` 收完仍然剩 28px 空白 —— `返回` 就还是
 * 偏左（用户 2026-10-10 报的正是「现在按钮不居中了」）。
 * 所以改成 `marginLeft`，挂在要收的那一个元素上。
 */
const BACK_HIDE = [
  "opacity var(--duration-morph) var(--ease-morph)",
  "max-width var(--duration-morph) var(--ease-morph)",
  "margin-left var(--duration-morph) var(--ease-morph)",
].join(", ");

interface MemorySpaceProps {
  /**
   * ⚠️ 2026-10-10 起**不再可空**。在这之前没有 `?photo=` 时会回落显示
   * 最近上传的那张、再没有就用内置示例图；现在那个分支归相册了
   * （`16-ALBUM_SPACE.md` §4 的空态）。这个组件只在「真的有一张照片要看」
   * 时才被挂载，所以空态、示例图那一整类判断在这里全都不需要了。
   */
  photo: PhotoDetail;
}

/**
 * ⚠️ **2026-10-10：这里原有的 `autoAnalyze` prop 没了。** 用户定了
 * 「自动分析只能开」，于是上传总是触发分析、`pending` 只剩一个意思
 * （正在分析），不再有「等用户点一下才发出去」那种状态。开关、
 * `UserSettings.autoAnalyze` 那一列、以及服务端各处判断它的分支一起删了。
 */
export function MemorySpace({ photo }: MemorySpaceProps) {
  const { canvas: canvasRef, markLoaded } = useStage();
  const router = useRouter();

  const setStage = useExperience((s) => s.setStage);
  const unsupported = useExperience((s) => s.stage.unsupported);
  const rotated = useExperience((s) => s.stage.rotated);
  /**
   * 正在从时间线推入某张照片（外壳 FLIP 进行中）。
   *
   * 用派生布尔而不是整个 `stage` 对象：zustand 比的是引用，
   * 订阅整个 `stage` 会让每次无关的改动（比如 `rotated`）都重渲染这里。
   */
  const entering = useExperience((s) => s.stage.origin !== null);

  /**
   * 出口往哪去 —— 取决于这一趟是从哪走进来的（`stage.entryFrom` 的注释里有理由）。
   *
   * 不是走进来的（直接打开 `/?photo=<id>`、或刷新过）就回落到第一屏 ——
   * 相册。空着不给出口的话，用户就只剩浏览器的返回键了。
   *
   * ⚠️ **名字不随去向变，统一是 `Back`**（用户 2026-10-10：「不区分显示的
   * 名字都用 Back」）。试过写「回相册 / 回时间线」——那是在替用户记路线，
   * 而他只要知道「这一步能退回去」。
   */
  const entryFrom = useExperience((s) => s.stage.entryFrom);
  const backHref = entryFrom === "timeline" ? "/timeline" : "/";

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * 删除的待确认状态。
   *
   * 两步：点「删除」进入待确认，然后**按住**才真的删。不弹模态框
   * （`07 §1` 不要重 UI），第二次确认由 `HoldButton` 承担。
   */
  const [confirmDelete, setConfirmDelete] = useState(false);

  /**
   * 对话浮层开着没有。
   *
   * 入口**只有粒子态的字幕**（用户 2026-10-10：「只有粒子界面能进入对话」）——
   * 那就等于「先把这一天翻开，才谈得上跟它说话」，与 `16 §8.4` 那条
   * 「翻开了就是翻开了」是同一种语气。
   */
  const [conversationOpen, setConversationOpen] = useState(false);

  /**
   * 字幕与 AI 状态。
   *
   * 初值来自服务端（重新打开照片时字幕要立刻在，不能先空着再等轮询），
   * 之后由轮询接管。
   */
  const [subtitle, setSubtitle] = useState<string | null>(
    photo.subtitle?.content ?? null,
  );
  const [aiState, setAiState] = useState<AiState>(photo.aiState);

  /**
   * 是否正在等一次分析的结果。
   *
   * ⚠️ 2026-10-10 起它**恒等于** `aiState === "pending"`。原先要单独记一个
   * 布尔，是因为关掉自动分析时 `pending` 有两种含义（「正在分析」和
   * 「还没发出去、等用户点」），空轮询 30 秒再标 failed 是错的。
   * 用户定了「自动分析只能开」之后只剩前一种含义。
   *
   * 仍然留这个 state 而不是直接读 `aiState`：上传那条路要在服务端数据回来
   * **之前**就置位（本地已经知道要等），拿到终态再落下。
   */
  const [awaiting, setAwaiting] = useState(photo.aiState === "pending");

  /**
   * 当前正在显示哪张照片。
   *
   * 不能直接用 `photo.id`：上传之后本地已经切到新照片了，但 `router.refresh()`
   * 要等一个来回才把新的服务端数据送回来。这中间的窗口里如果拿旧的 `photo.id`
   * 去轮询，会问到上一张照片上去。
   */
  const [activeId, setActiveId] = useState<string | null>(photo.id);

  /**
   * 收藏状态。
   *
   * 2026-10-10 补：在这之前收藏**在界面上根本不存在** —— schema 有、
   * `GET /api/photos?favorite=true` 有、`PATCH /api/photos/:id` 也支持，
   * 就是没有人能点。原计划它长在 Library 抽屉里（`16 §6.2` 的星标），
   * 那个抽屉作废了 —— 搬进 Photo View，落在日期那一行（`16 §7.1`）。
   */
  const [favorite, setFavorite] = useState(photo.favorite);

  /** 上一次从服务端看到的照片 id。用来判断「服务端数据变了没有」。 */
  const serverIdRef = useRef<string | null>(photo.id);

  /**
   * 服务端数据到达时同步本地状态 —— **但只在照片真的换了的时候**。
   *
   * 如果无条件同步，`router.refresh()` 带回来的那次渲染（此时分析还没跑完，
   * aiState 还是 pending、字幕还是空）会把轮询刚拿到的字幕覆盖掉。
   */
  useEffect(() => {
    const serverId = photo.id;
    if (serverId === serverIdRef.current) return;

    serverIdRef.current = serverId;
    setActiveId(serverId);
    setSubtitle(photo.subtitle?.content ?? null);
    setAiState(photo.aiState);
    setFavorite(photo.favorite);
    setAwaiting(photo.aiState === "pending");
  }, [photo]);

  /**
   * 显示模式。
   *
   * 进入照片默认**原图**（16 §8.1），点「Into this moment」才切粒子。
   * 状态不持久化 —— 每次进入都是原图，这样粒子的第一次出现才有分量。
   */
  const displayMode = useExperience((s) => s.displayMode);
  const setDisplayMode = useExperience((s) => s.setDisplayMode);
  useEffect(() => {
    setDisplayMode("photo");
  }, [setDisplayMode]);

  const inParticle = displayMode === "particle";

  /**
   * 把「现在是哪张照片」交给外壳。
   *
   * 外壳（`ExperienceShell`）拥有画布，负责取图、装图、以及从时间线飞进来时的
   * 终点计算 —— 但它看不到路由数据（它在 layout 里，不在页面里）。
   * 这一句就是那个交接点，而且**只此一处**：`activeId` 已经收拢了
   * 首次挂载、`?photo=` 切换、上传、删除四条路径，跟着它走就不会漏。
   *
   * 空态（`activeId === null`）交给外壳回落到内置示例图（07 §1）。
   *
   * ⚠️ 不能反过来让外壳自己读 `?photo=`：`useSearchParams` 会把外壳拖进
   * 一个 Suspense 边界，而它包着整个体验 —— 一次查询参数变化就会让画布
   * 连同一切重新挂载，正好毁掉这个改动要做的事。
   */
  useEffect(() => {
    // `space` 必须一起声明：相册和照片页的 pathname 都是 `/`，
    // 外壳推不出来自己该不该显示画布（`stage.space` 的注释里有完整的理由）
    setStage({ space: "photo", photoId: activeId });
  }, [activeId, setStage]);

  /**
   * 轮询 AI 结果（08 §10）。
   *
   * 首选轮询而不是让上传请求挂着等 AI —— 那样慢、会超时、失败后照片处于半状态。
   * 30 秒还没结果就停；服务端也会在同一个阈值上兜底改判 failed。
   */
  useEffect(() => {
    if (!activeId || !awaiting) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    const poll = async () => {
      if (cancelled) return;

      if (Date.now() > deadline) {
        setAiState("failed");
        setAwaiting(false);
        return;
      }

      try {
        const res = await fetch(`/api/photos/${activeId}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const body = (await res.json()) as {
            data?: {
              aiState?: AiState;
              subtitle?: { content?: string } | null;
            };
          };
          const next = body.data;
          if (cancelled) return;

          if (next?.subtitle?.content) setSubtitle(next.subtitle.content);
          if (next?.aiState && next.aiState !== "pending") {
            setAiState(next.aiState);
            setAwaiting(false); // 终态，停止轮询
            return;
          }
        }
      } catch {
        // 网络抖动不该中断整个等待 —— 交给下一次 tick
      }

      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeId, awaiting]);

  /** 拖入照片 → 先本地成型（即时反馈），再上传落库。 */
  const acceptFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setNotice(null);

      try {
        // 先用本地文件直接成型 —— 不等网络往返，手感即时。
        // 「上传后立刻看到原图，不等网络」是 Round 7 的验收项。
        // 不 close()：所有权转给引擎
        const bitmap = await createImageBitmap(file);
        await canvasRef.current?.morphTo(bitmap);

        /*
         * 缩略图**复用上面那张 bitmap**（`08 §6`）。
         *
         * 这里已经为了「立刻成型」付过一次解码了 —— 再 `createImageBitmap`
         * 一遍同一张 12MP 的图纯属浪费。`makeThumbnail` 传 `ImageBitmap`
         * 时**不负责关闭**它，所有权仍在引擎那边（见上一行的注释）。
         */
        const thumbnail = await makeThumbnail(bitmap);

        const photo = await uploadPhoto(file, thumbnail);

        // 画布上已经是这张图了（上面 morphTo 过）—— 告诉外壳别再取一次，
        // 否则它会 setImage 一遍，把用户刚调好的视角重置掉
        markLoaded(photo.id);
        // 换照片 → 旧字幕必须立刻清掉，否则新照片下面挂着上一张的话
        setActiveId(photo.id);
        setSubtitle(null);
        setAiState("pending");
        // 上传总是触发分析（`08 §6` 第 9 步），所以这里总是开始等
        setAwaiting(true);

        // 让服务端把新的照片数据带回来（日期等元信息）
        router.refresh();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "上传失败");
      } finally {
        setBusy(false);
      }
    },
    // canvasRef 来自 ExperienceShell 的 context，是个**每次渲染都同一个**
    // 的 ref 对象（useMemo 过的）。列进依赖只会让 eslint 满意，不改变行为。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, markLoaded],
  );

  /**
   * 拖入照片。
   *
   * 监听挂在 `window` 上（`src/lib/usePhotoDrop.ts` 里，相册也共用那一份）。
   * 不挂 `<main>` 是因为画布压在它之上（指针要穿透过去，否则拖拽旋转失效），
   * 文件拖到页面上时命中的是画布那一层 —— `main` 的 `onDragOver` / `onDrop`
   * 一次都不会触发，照片拖进去毫无反应（踩过）。
   */
  const dragging = usePhotoDrop(acceptFile);

  /**
   * 待确认状态下的退出。
   *
   * ⚠️ **2026-10-10 起不再是「4 秒自动撤回」。** 那个计时器会和长按打架 ——
   * 按到一半计时器到点，按钮被卸载，长按凭空断掉。
   *
   * 而长按本身已经足够「不可能误触」，它不需要超时护栏。要退出按 Esc
   * （`04 §7` 的退出顺序里，Esc 管的就是这类「当前状态」）。
   */
  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDelete(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete]);

  /**
   * 删除当前照片。顺序由服务端保证：先删文件再删记录（08 §16）。
   *
   * ⚠️ 这里**不再动 `busy`**。`busy` 会让左下角那一组整体换成「处理中…」，
   * 于是 `HoldButton` 会被卸载 —— 它自己的 done 态（「删除中」）才是这一刻
   * 该显示的进度，没必要再叠一个。成功就换路由（整页走掉），
   * 失败就撤回长按状态并报出来。
   */
  const handleDelete = useCallback(async () => {
    if (!activeId) return;
    setNotice(null);

    try {
      const res = await fetch(`/api/photos/${activeId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "删除失败");
      }

      /*
       * 删掉了正在看的这张 → 回相册。
       *
       * 留在这里的话，画布上会挂着一张已经不在库里的图，地址栏还指着一个
       * 不存在的 id。而相册正好是「所有照片」那面墙，删完一张回墙上是自然的。
       *
       * 用 replace 不用 push：返回键不该把用户送回一张刚被自己删掉的照片。
       * 地址栏上的 `?photo=<id>` 一并去掉，刷新也不会落到那个死 id 上
       * （page.tsx 里那条回落同样兜得住）。
       */
      router.replace("/");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "删除失败");
      setConfirmDelete(false);
    }
  }, [activeId, router]);

  /**
   * 重新请求一次分析（`08 §10`）。
   *
   * 2026-10-10 之前它还是「关掉自动分析后手动看一眼」那条路的入口 ——
   * 用户定了「自动分析只能开」之后，它就只剩**失败重试**这一个用途了。
   */
  const handleRetry = useCallback(async () => {
    if (!activeId) return;
    setSubtitle(null);
    setAiState("pending");
    setAwaiting(true);

    try {
      const res = await fetch(`/api/photos/${activeId}/analyze`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("重试失败");
    } catch {
      setAiState("failed");
      setAwaiting(false);
    }
  }, [activeId]);

  /**
   * 同一格里的进与出（`16 §8.6`）。
   *
   * 用户 2026-10-10：出口从左上角搬到「Into this moment」那一格 ——
   * 进得去的门就是出得来的门，不必跑到屏幕对角去找。
   *
   * ⚠️ 这不是把 §8.4 的「不要手动切回的入口」推翻了。那条禁的是
   * **并排两个常驻选项**（「原图 | 粒子」那种），那会把这件事说成显示模式。
   * 这里任何时刻只显示得下**一个**动作：原图态是「进入」，粒子态是「回来」。
   * 同一时刻没有「选哪个」的问题，所以它仍然是一次关于记忆的动作。
   *
   * 也没有焦点交接要操心：按钮本身没变、没被 inert，点完之后焦点还在原地。
   */
  const toggleParticle = useCallback(() => {
    setDisplayMode(inParticle ? "photo" : "particle");
  }, [inParticle, setDisplayMode]);

  /**
   * 收藏 / 取消收藏（`16 §7.2`）。
   *
   * 乐观更新：收藏是个廉价的开关，为了等一个来回才变色会显得迟钝。
   * 失败了再翻回来并报出来 —— 不能让它静静地停在一个错的状态上。
   *
   * 不调 `router.refresh()`：相册（Round 5）还没做，没有别的地方需要跟着变。
   * 服务端数据回来时，上面那个 effect 会因为 `photo.id` 变化重新同步一遍。
   */
  const toggleFavorite = useCallback(async () => {
    if (!activeId) return;
    const next = !favorite;
    setFavorite(next);

    try {
      const res = await fetch(`/api/photos/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setFavorite(!next);
      setNotice("收藏没保存上");
    }
  }, [activeId, favorite]);

  const date = formatDate(photo.takenAt ?? photo.createdAt);

  if (unsupported) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-12">
        <p className="text-meta text-text-primary/55">
          这台设备没有可用的 WebGL2，粒子效果不可用。安静降级为静态浏览。
        </p>
      </main>
    );
  }

  return (
    /*
     * `pointer-events-none` 是必须的，不是顺手加的。
     *
     * 画布在 `ExperienceShell` 里、DOM 上排在这一层之前，拖拽旋转和滚轮缩放
     * 由 OrbitControls 直接挂在 canvas 元素上。而这一层是 `relative` 的整屏块，
     * 默认会把整个画布盖住 —— `elementFromPoint` 到处都返回 MAIN，
     * 拖拽旋转直接失效（踩过）。
     *
     * 关掉之后指针穿透到画布，而**该点的东西各自开回来**：
     * 文字层本来就有 `pointer-events-auto` 的按钮，`ParticleControls` 自己开。
     * 拖入照片的监听挂在 window 上（见上面那个 effect），不依赖这一层。
     */
    <main className="pointer-events-none relative min-h-dvh overflow-hidden">
      {/*
        画布不在这里 —— 它归 ExperienceShell（`(experience)/layout.tsx`）。
        它是 `fixed inset-0`、**没有 z-index**，画在底；这一层的 `main` 是
        `relative` 且在 DOM 上排在它之后，所以压在它上面。

        拖入照片的监听也不在这一层 —— 见上面那个挂 window 的 effect。
      */}

      {/*
        文字层。

        指针事件默认穿透，只有按钮自己接收 —— 否则会挡住拖拽旋转
        （`main` 整体是 `pointer-events: none` 的，见 render 顶部）。

        ── 为什么透明度可以放在这一层 ──────────────────────────────────
        用户 2026-10-10 要求日期与字幕「淡入」，而这一层做得到、别的层做不到。

        任何带 `opacity < 1` 的元素都会成为**层叠上下文**，然后按它自己在父级里的
        身份参与层叠。这一层是 `absolute` + `z-index: 10`，属于「正 z-index 的
        定位后代」—— 在根层叠上下文里永远排在最后，也就是**永远在画布之上**。
        所以它淡入淡出，只是文字自己在淡，不会掉到画布底下去。

        反过来，往 `.sn-content`（`static` 的普通块）或 `main` 上加透明度，
        它们就会被归到「块级内容」那一拨、整块沉到 `fixed` 的画布之下 ——
        而画布有实心底色，症状是日期字幕整个消失（踩过两次，见 `05 §6.2`）。
      */}
      <div
        // 对话浮层开着时整层让开：它是 aria-modal 的，底下的东西不该还能 Tab 到
        inert={conversationOpen}
        className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center px-6"
        style={{
          top: TEXT_TOP,
          /*
           * 从时间线推入时先藏着，等那张照片飞到位再浮出来。
           *
           * `stage.origin` 非 null 就是「正在推入」—— 外壳握着的那个状态，
           * 飞行结束时它才归 null，所以这里不需要自己计时。
           * 用 `--duration-ui` 而不是 `--duration-scene`：照片落地已经用掉
           * 800ms，文字再慢慢淡 800ms 会让整段镜头拖到两秒以上。
           * 它是最后一个拍子，轻一点就好。
           */
          opacity: entering ? 0 : 1,
          transition: "opacity var(--duration-ui) var(--ease-enter)",
        }}
      >
        {/*
         * 日期 + 收藏。
         *
         * 星标和日期同一行，因为它俩是同一类东西：**关于这张照片的元信息**
         * —— 一个是它什么时候被拍的，一个是用户给它的标记。
         * 而下面那一列（`16 §7.2` 的操作区）是**能对它做什么**：
         * 「Into this moment」和以后的对话 / 日志都会打开另一个东西，
         * 星标不打开任何东西，它只是把这张标下来。
         *
         * 顺带：横向排不占额外高度。`16 §7.1` 的尺寸表是紧的
         * （照片下边缘约 76%，文字从 78% 起排），在操作区多一行会把它整体往下压。
         */}
        <div className="flex items-center gap-2.5">
          <p className="text-meta text-text-primary/55">{date}</p>

          {/*
           * 用 lucide 的 Star：它的图标是描边式的，`fill="currentColor"` 才是实心。
           * 所以「收藏了没有」由**填充**表达，颜色只负责强调 ——
           * 这比换文字可靠（换文字会让按钮宽度随状态变化）。
           *
           * `aria-pressed` 是这类按钮的标准语义。`aria-label` **恒定**写「收藏」：
           * 跟着状态改成「取消收藏」会跟 `aria-pressed` 打架，
           * 读屏器会念成「取消收藏，已按下」这种自相矛盾的话。
           */}
          <button
            type="button"
            onClick={() => void toggleFavorite()}
            aria-pressed={favorite}
            aria-label="收藏"
            title={favorite ? "取消收藏" : "收藏"}
            className={`pointer-events-auto transition-colors ${
              favorite
                ? "text-text-primary/90"
                : "text-text-primary/30 hover:text-text-primary/70 focus-visible:text-text-primary/70"
            }`}
          >
            <Star
              size={14}
              strokeWidth={1.6}
              fill={favorite ? "currentColor" : "none"}
              aria-hidden
            />
          </button>
        </div>

        {/* 字幕占原来标题的位置（16 §7.1） */}
        <Subtitle
          content={subtitle}
          state={aiState}
          onRequest={() => void handleRetry()}
          // 只有粒子态可点开对话（用户 2026-10-10）
          interactive={inParticle}
          onOpen={() => setConversationOpen(true)}
        />

        {/*
         * 这一格里有两个动作，交叉淡化（`16 §8.6`）。
         *
         * 用户 2026-10-10：「返回放到和 into 一样的位置，放左上角交互不顺畅」。
         * 进来和出去用同一个位子 —— 进得去的门就是出得来的门，
         * 不必再跑到屏幕对角去找。
         *
         * 两个动作是**同一格里互相压着的两段文字**，不是两个按钮：
         * 嵌套 <button> 会触发 hydration 错（踩过），而只换文案则是一瞬间的
         * 换字，读起来像控件跳了一下，不是空间在变。
         */}

        {/*
          主操作与「回上一步」并排。

          用户 2026-10-10：「无论从首页进入记忆页还是时间线进入，都应该有一个
          返回按钮能够返回首页或时间线（取决于从哪里进入），返回按钮与
          into this moment 在一起」。同一个理由和他上一次说的一样 ——
          手伸到哪儿，出口就在哪儿，不必跑到屏幕对角。

          ⚠️ **文案统一是 `Back`，不按去向改名**（用户 2026-10-10）。
          试过写「回相册 / 回时间线」—— 那是在替用户记路线，
          而他只要知道「这一步能退回去」。
          左边那一格在粒子态的「返回」是另一回事（回到原图，不是回上一屏）。
        */}
        <div className="pointer-events-auto mt-6 flex items-center">
          <button
            type="button"
            onClick={toggleParticle}
            className="text-meta relative text-text-primary/45 hover:opacity-90 focus-visible:opacity-90"
          >
          {/*
            两段文字叠在同一格里，各自收起来的时候要对辅助技术隐藏 ——
            不标出来读屏器会把两个动作一起念成「Into this moment 返回」，
            听起来像有两个按钮。

            这里用 aria-hidden 是安全的（和 TopNavigation 里那条告诫不冲突）：
            它挡的是「焦点落在 aria-hidden 里面」，而这里是 <span>，
            永远不可能有焦点。

            ⚠️ 两个 span 都要标，而且是**相反**的条件。
            React 对 aria-* 传 false 会写成 `aria-hidden="false"`（明确暴露），
            不是把属性删掉 —— 所以只标一个的话，另一个永远露着。
          */}
          <span
            aria-hidden={inParticle}
            style={{
              opacity: inParticle ? 0 : 1,
              transition: CROSSFADE,
            }}
          >
            Into this moment
          </span>
          <span
            aria-hidden={!inParticle}
            className="absolute inset-x-0 text-center"
            style={{
              opacity: inParticle ? 1 : 0,
              transition: CROSSFADE,
            }}
          >
            返回
          </span>
          </button>

          {/*
            回上一步。`entryFrom` 由外壳在推入时记下（它覆写 space 之前读了旧值）——
            相册和照片页的 pathname 都是 `/`，事后从路由上推不出来。

            不是走进来的（直接打开链接、或者刷新过）就回落到第一屏（相册）。

            ⚠️ **粒子态下它收起来。** 用户 2026-10-10：「粒子页有两个返回，
            只留一个，粒子页的返回是回到原图页」—— 左边那一格已经是「返回」
            （回原图）了，再并排一个 `Back`（回相册 / 时间线），屏幕上就是
            两个都读作「回去」、去向却不同的东西。

            ── 为什么包一层 span 而不是直接给出参 ──────────────────────

            收的**不只是透明度，还有宽度和它左边那段间距**：
            只淡出的话这一行仍然是原来那么宽，居中的结果就是「返回」偏左
            ——用户当天接着报的就是这个（「现在按钮不居中了」）。

            而这一行**必须重新居中**：`16 §8.6` 说出口要落在
            `Into this moment` 那个格子里，那一格是画面正中。
            收宽度 + 间距一起做，行宽从 (按钮+28+31) 平滑变成 (按钮)，
            按钮在 1200ms 里滑回正中 —— 和溶解同一条缓动，读起来是
            「空间在变化」，不是「界面跳了一下」。

            ⚠️ 间距原本是父级的 `gap-7`，靠 `gap` 收不掉（收完还剩 28px
            空白），所以挪到这里当 `marginLeft`。

            ⚠️ 两段都要 `aria-hidden` 且**条件相反**（见上面那个 span 的说明）；
            这里的 `inert` 一并把里面的链接移出 Tab 顺序 —— 一个看不见的链接
            不该还能被键盘选中。
          */}
          <span
            aria-hidden={inParticle}
            inert={inParticle}
            /*
             * ⚠️ **`text-meta` 必须挂在这一层，不能只挂在里面的 `<a>` 上。**
             *
             * 这一层是收放动画的载体，所以它在父级 flex 里是一个 flex item
             * （`inline-block` 会被 blockify 成 `block`，写不写都一样）。
             * 不继承字号的话它按**默认的 16px / 24px** 撑行盒，而按钮那边是
             * 13px / 18.2px —— 两者 `items-center` 一居中，里面的字反而错开了
             * 1px 多（用户 2026-10-10 报的「into 和 back 水平错位了」）。
             *
             * 挂上 `text-meta` 之后两边行盒都是 18.2px，居中即对齐。
             */
            className="text-meta overflow-hidden"
            style={{
              marginLeft: inParticle ? 0 : "1.75rem", // = gap-7
              // 比 `Back` 的实测宽度（31px）宽出一截，静止时永远不会被裁
              maxWidth: inParticle ? 0 : "4rem",
              opacity: inParticle ? 0 : 1,
              transition: BACK_HIDE,
            }}
          >
            <Link
              href={backHref}
              /*
               * ⚠️ **与「Into this moment」完全同一套文字样式**（用户
               * 2026-10-10：「原图页的那个 Back 样式改成和 into 一样」）。
               *
               * 这一行里现在有三个动作：`Into this moment` / `返回` / `Back`
               * —— 它们**都不是控件**，是同一处出现的三行字。所以
               * `16 §8.6` 那条纪律（复用 Into 的文字样式而不是控件的样式）
               * 在这里是对**三处**一起成立的：同样的字号字距、同样 0.45 的
               * 底色亮度、同样是 hover 提亮而不是下划线。
               *
               * 下划线是这里最容易滑回去的一处：它把「一句话」读成「一个链接」，
               * 而这一整行的用意恰恰是「出口是一段文字，不是一个控件」。
               *
               * `whitespace-nowrap` 是为了上面那个收放：盒子变窄时不许折行。
               */
              className="whitespace-nowrap text-text-primary/45 hover:opacity-90 focus-visible:opacity-90"
            >
              Back
            </Link>
          </span>
        </div>
      </div>

      {/* 左下角：旋转提示 / 复位 / 删除 / 状态。
          删除放在这里而不是紧挨主操作 —— 主操作的旁边不该放破坏性动作。
          `pointer-events-auto` 是给 `main` 的 `pointer-events-none` 补的：
          这几个按钮要能点，而它们所在的那一小块挡住画布无所谓。

          `left-32` 而不是 `left-12`：最角上是左下那颗胶囊（`BottomDock`）——
          照片空间里它是两格（参数 | 设置）约 89px 宽，加上 `left-6` 的 24px
          到 113px 为止。这一组从 128px 起，各占各的。
          （胶囊只有一格时它 44px 宽，这一组会显得空一截 —— 可接受：
          位置换来换去更糟。） */}
      <div
        inert={conversationOpen}
        className="pointer-events-auto text-micro absolute bottom-8 left-32 z-10 flex items-center gap-5"
      >
        {busy && (
          <span className="pointer-events-none text-text-primary/40">
            处理中…
          </span>
        )}

        {notice && (
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-text-primary/60 underline-offset-4 hover:underline"
          >
            {notice}
          </button>
        )}

        {!busy && !notice && (
          <>
            {rotated ? (
              <button
                type="button"
                onClick={() => canvasRef.current?.resetView()}
                className="text-text-primary/40 transition-opacity duration-[350ms] hover:opacity-85"
                style={{ transitionTimingFunction: "var(--ease-enter)" }}
              >
                复位视角
              </button>
            ) : (
              <span className="pointer-events-none text-text-primary/25">
                拖入照片 · 拖拽旋转
              </span>
            )}

            {/*
              删除的确认（`16 §7.3`：两步确认，放在左下角，不紧挨主操作）。

              用户 2026-10-10：「删除改成，点击删除后显示长按以确认删除，
              然后借鉴 reactbits 上的 Hold Button 组件实现」。

              所以是**两步**：点「删除」是表态，**按住不放**才是真的删。
              长按把「确认」从又一次点击变成一件要花掉时间的事 ——
              删除不可逆（`08 §16` 先删文件再删记录），值得这道门。

              ── 配色全部走项目 token，不用上游那个紫色 ──────────────────
              `02 §3`：粒子颜色优先来自照片本身，整套配色里**没有强调色**。
              所以「危险」在这个产品里的表达方式是**提亮，不是染色**
              （深色背景上接近纯白是最抢眼的）—— 液体用 `--text-primary`，
              漫过去之后字反成 `--background` 的深色。

              `glow` 关掉：`02 §7` 说 Glow 只用来表达当前焦点 / 粒子节点 /
              hover / loading，别让界面发光。

              `resetAfter={0}`：完成态留着别弹回去 —— 那时候请求正在飞，
              「删除中」就是这一刻该显示的进度（`handleDelete` 因此不再动
              `busy`，见它的注释）。
            */}
            {confirmDelete ? (
              <HoldButton
                /*
                 * ⚠️ **尺寸、字号、字体粗细全部压到和「删除」一样。**
                 *
                 * 用户 2026-10-10：「你需要平衡一下点击删除前后的视觉差」。
                 * 第一版是 `size="sm"`（36px 高、13px 字、一层玻璃底色）——
                 * 点一下，那颗 11px 的暗字忽然换成一块 124×36 的药丸，
                 * 在那个角落里读起来是**另一样东西出现了**，
                 * 而不是**这行字变了**。
                 *
                 * 现在 `h-auto` + `text-micro` + `px-2 py-1` 把它压回一行字，
                 * 底色去掉（`transparent` + `shadow-none`），只留液体本身。
                 * 于是点击前后的差别只剩三件：字变亮了、多了十二个字、
                 * 以及一条从左边漫过来的白。
                 *
                 * ⚠️ 这几个 Tailwind 类**盖得住**组件自己的 `--sm` 预设，
                 * 是因为 `hold-button.css` 写在 `@layer components` 里，
                 * 而工具类在 `utilities` —— 后者永远赢，与选择器特异度无关。
                 * 要是哪天那份 CSS 从 `@layer` 里挪出来，这一行会整个失效。
                 */
                className="h-auto px-2 py-1 text-micro text-text-primary/70 shadow-none"
                radius={6}
                holdTime={1400}
                releaseTime={260}
                backgroundColor="transparent"
                fillColor="var(--text-primary)"
                fillTextColor="var(--background)"
                waveAmplitude={2}
                glow={false}
                resetAfter={0}
                doneLabel="删除中"
                onHold={() => void handleDelete()}
              >
                长按以确认删除
              </HoldButton>
            ) : (
              /*
               * `px-2 py-1` 与上面那颗按钮**必须一致** —— 否则点下去时
               * 这一格的高度会变，整行跟着上下跳一下。
               */
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-2 py-1 transition-opacity duration-[200ms]"
                style={{
                  opacity: 0.4,
                  transitionTimingFunction: "var(--ease-enter)",
                }}
              >
                删除
              </button>
            )}
          </>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-20 border border-border-subtle" />
      )}

      {/*
        粒子参数不在这里。2026-10-10 起它归左下角那颗胶囊
        （`BottomDock`），卡片挂根布局 —— 它是一张全局浮层，不属于
        任何一条路由，也就不该长在照片页的 `<main>` 里
        （那层是 `pointer-events: none`，浮层进来要自己开回来）。
      */}

      {/*
        对话浮层。全屏遮罩 + 实时模糊（底下就是还在跑的画布），
        所以它必须是 `main` 的最后一个兄弟 —— 要盖在所有文字层之上。
      */}
      {conversationOpen && activeId && (
        <ConversationPanel
          photoId={activeId}
          onClose={() => setConversationOpen(false)}
        />
      )}
    </main>
  );
}

/** 02-DESIGN_SYSTEM.md §4 的日期格式：2025 · 09 · 28 */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y} · ${m} · ${day}`;
}
