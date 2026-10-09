/**
 * ParticleSystem —— 自研粒子引擎
 *
 * 规格：06-PARTICLE_ENGINE.md 全文
 *
 * 设计约束（05-TECH_ARCHITECTURE.md §18）：
 *   这是一个纯命令式的 Three.js 引擎，不依赖 React，也不经过 React 的渲染路径。
 *   React 只负责把「意图」（档位、参数、指针）传进来，引擎内部维护全部实时状态。
 *
 * 关键实现点：
 *   - 固定粒子池：转场过程中零 buffer 重建（06 §13）
 *   - A→B 对应关系用 Hilbert 排序（06 §14）
 *   - 指针场无状态，指针连续移动时平滑进退（06 §8）
 */

import {
  BufferAttribute,
  BufferGeometry,
  LinearFilter,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  NormalBlending,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DUR, EASE, ensureGsap } from "@/lib/gsap";
import {
  quadFragmentShader,
  quadVertexShader,
} from "./shaders/quad";

import {
  TIER_ORDER,
  TIER_SPECS,
  type ParticleParams,
  type PerformanceTier,
} from "@/types";
import { sampleImage, type SampleResult } from "./ImageSampler";
import { hilbertOrder } from "./HilbertSort";
import {
  easeMorphProgress,
  particleFragmentShader,
  particleVertexShader,
} from "./shaders/particle";
import {
  minTier,
  probeCapabilities,
  RuntimeMonitor,
  tierCeiling,
  type CapabilityProbe,
} from "./PerformanceTier";

/** 06 §12：总时长 1200ms，与 02-DESIGN_SYSTEM.md 的 morph token 一致 */
const MORPH_DURATION_MS = 1200;
/** 降级档位下的简化转场时长（06 §12） */
const MORPH_DURATION_REDUCED_MS = 600;

/** L2 微基准用的粒子数（15 §3 L2） */
const BENCHMARK_COUNT = 20_000;

/** 相机：窄 FOV 制造「非常平」的摄影语言（06 §15） */
const CAMERA_FOV = 30;
/** 画布留白，避免粒子贴边 */
const FIT_PADDING = 1.18;

/**
 * 显示模式。
 *
 * 规格：`16-ALBUM_SPACE.md` §8
 *
 * 进入照片时默认 `photo`（清晰的原图），点 View Memory 才切到 `particle`。
 * 状态**不持久化** —— 每次进入都是原图，这样粒子的第一次出现才有分量。
 */
export type DisplayMode = "photo" | "particle";

export interface EngineStats {
  fps: number;
  frameMs: number;
  p90Ms: number;
  particleCount: number;
  drawCalls: number;
  dpr: number;
  tier: PerformanceTier;
}

export interface ParticleSystemOptions {
  canvas: HTMLCanvasElement;
  /** 强制档位（?tier=），非空时跳过自动探测 */
  tierOverride?: PerformanceTier | null;
  params: ParticleParams;
  /**
   * 粒子云占视口高度的比例，默认 1（尽量填满）。
   *
   * 调试台用 1；首页按 07-UI_PAGE_SPECS.md §1 用约 0.62，
   * 给下方的日期/标题/操作留出位置。
   */
  fillHeight?: number;
  /**
   * 垂直偏移，视口高度的比例。正数把画面往上推（07 §1 要求「垂直偏上 4%」）。
   * 实现方式是让相机看向云心下方一点，而不是移动云本身 —— 这样旋转依然绕云心。
   */
  offsetY?: number;
  onStats?: (stats: EngineStats) => void;
  onTierChange?: (tier: PerformanceTier) => void;
  /** 视角在「正对」与「已旋转」之间切换时触发，供 UI 决定复位按钮的显隐 */
  onViewChange?: (rotated: boolean) => void;
  /** 无法创建 WebGL 上下文时为 true，调用方应走静态降级 */
  onUnsupported?: () => void;
  reducedMotion?: boolean;
}

export class ParticleSystem {
  private readonly canvas: HTMLCanvasElement;
  private readonly onStats?: (s: EngineStats) => void;
  private readonly onTierChange?: (t: PerformanceTier) => void;
  private readonly onViewChange?: (rotated: boolean) => void;
  /** 上一次通知过的旋转状态，避免每帧都回调 */
  private lastRotated = false;
  private readonly onUnsupported?: () => void;
  private reducedMotion: boolean;
  private readonly tierOverride: PerformanceTier | null;

  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private points: Points | null = null;
  private geometry: BufferGeometry | null = null;
  private material: ShaderMaterial | null = null;

  /** 原图四边形。与粒子云占据同一块空间，用于「原图模式」。 */
  private quad: Mesh | null = null;
  private quadGeometry: PlaneGeometry | null = null;
  private quadMaterial: ShaderMaterial | null = null;
  private quadTexture: Texture | null = null;
  /** 当前贴图对应的 bitmap，用来判断是否需要换贴图 */
  private quadBitmap: ImageBitmap | null = null;
  /** 模式切换的 GSAP 补间，dispose 时要杀掉 */
  private modeTween: ReturnType<typeof import("gsap").gsap.to> | null = null;

  /** 当前显示模式 */
  private mode: DisplayMode = "photo";

  private probe: CapabilityProbe | null = null;
  private monitor: RuntimeMonitor | null = null;

  private tier: PerformanceTier = "medium";
  private params: ParticleParams;
  private particleCount = 0;

  /** 指针位置。没有指针时是远离的哨兵值，让 falloff 归零。 */
  private pointer = new Vector2(9_999, 9_999);
  /** 指针的真实位置（未经平滑） */
  private pointerTarget = new Vector2(9_999, 9_999);

  /** 轨道控制：拖拽旋转、滚轮缩放（用户要求「像建模一样」） */
  private controls: OrbitControls | null = null;
  /** 装下整个粒子云所需的相机距离。resize 时按比例调整，以保留用户当前的缩放。 */
  private fitDistance = 0;
  /** 粒子云占视口高度的比例 */
  private readonly fillHeight: number;
  /** 垂直偏移，视口高度的比例 */
  private readonly offsetY: number;
  /** 相机看向的点在 y 上的偏移（世界单位），由 offsetY 换算而来 */
  private targetY = 0;
  /** 上一次 resize 时 controls.target 的值，用来在重排时保持用户的旋转方向 */
  private readonly controlsTargetPrev = new Vector3(0, 0, 0);

  private rafId: number | null = null;
  private disposed = false;
  private running = false;

  private morphStartMs = 0;
  private morphing = false;
  private morphDuration = MORPH_DURATION_MS;

  /** 当前显示的图像，用于档位/密度变化时重新采样 */
  private currentBitmap: ImageBitmap | null = null;
  private currentSample: SampleResult | null = null;

  private lastFrameMs = 0;
  private statsAccum = 0;
  private statsFrames = 0;
  private lastStats: EngineStats = {
    fps: 0,
    frameMs: 0,
    p90Ms: 0,
    particleCount: 0,
    drawCalls: 0,
    dpr: 1,
    tier: "medium",
  };

  private readonly onVisibilityChange = () => {
    if (document.hidden) {
      this.pauseRaf();
    } else if (this.running) {
      // 刚回到前台的前几帧必然偏慢（纹理重传、着色器重编译、GC），
      // 丢掉旧样本重新累积，否则这几帧会直接触发一次误降档。
      this.monitor?.reset();
      this.resumeRaf();
    }
  };

  private readonly onContextLost = (e: Event) => {
    e.preventDefault();
    this.pauseRaf();
    console.warn("[ParticleSystem] WebGL context lost");
  };

  private readonly onContextRestored = () => {
    console.warn("[ParticleSystem] WebGL context restored");
    // Three 会自行重建 GPU 侧资源；这里只需要把几何体的 needsUpdate 打上
    if (this.geometry) {
      for (const name of Object.keys(this.geometry.attributes)) {
        this.geometry.attributes[name].needsUpdate = true;
      }
    }
    if (this.running) this.resumeRaf();
  };

  constructor(opts: ParticleSystemOptions) {
    this.canvas = opts.canvas;
    this.params = opts.params;
    this.onStats = opts.onStats;
    this.onTierChange = opts.onTierChange;
    this.onViewChange = opts.onViewChange;
    this.onUnsupported = opts.onUnsupported;
    this.reducedMotion = opts.reducedMotion ?? false;
    this.tierOverride = opts.tierOverride ?? null;
    this.fillHeight = Math.min(1, Math.max(0.1, opts.fillHeight ?? 1));
    this.offsetY = opts.offsetY ?? 0;
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  /**
   * 初始化：L1 探测 → 创建渲染器 → L2 微基准 → 定档 → 建几何体。
   *
   * 返回实际生效的档位；返回 null 表示设备不支持，调用方应走静态降级。
   */
  async init(): Promise<PerformanceTier | null> {
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  /**
   * 已完成的 init。setImage / morphTo 会 await 它。
   *
   * 必须在定档之后才采样 —— 否则粒子数会按默认档位算出来，
   * 等真正的档位确定后就不会再重建，剂量和档位长期不一致。
   */
  private initPromise: Promise<PerformanceTier | null> = Promise.resolve(null);

  private async doInit(): Promise<PerformanceTier | null> {
    this.probe = probeCapabilities();
    const ceiling = tierCeiling(this.probe);

    if (ceiling === null) {
      this.onUnsupported?.();
      return null;
    }

    try {
      this.renderer = new WebGLRenderer({
        canvas: this.canvas,
        antialias: false, // 粒子不需要 MSAA，省大量带宽
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      this.onUnsupported?.();
      return null;
    }

    this.renderer.setClearColor(0x050505, 1); // --background
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);

    // 轨道控制 —— 用户要求「像建模一样 3D 旋转画布」。
    // 注意这与 06-PARTICLE_ENGINE.md §15「避免大幅旋转」相反，文档需同步更新。
    const controls = new OrbitControls(this.camera, this.canvas);
    controls.enablePan = false; // 平移会让画面跑出视野，对沉浸体验是破坏性的
    controls.enableDamping = true; // 有惯性，符合 02 §10「慢、柔和、有阻尼」
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.45;
    controls.zoomSpeed = 0.7;
    controls.target.set(0, 0, 0);
    // 留一点余量，避免转到极点时翻转
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = Math.PI - 0.02;
    this.controls = controls;

    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    // --- L2 微基准（15 §3）---
    let tier: PerformanceTier;
    if (this.tierOverride) {
      // 强制档位绕过 L1/L2/L3（15 §9）
      tier = this.tierOverride;
    } else if (typeof document !== "undefined" && document.hidden) {
      // 标签页不可见时 rAF 被节流甚至停摆，测不出有意义的数据。
      // 直接给一个中间档，等用户真正看到画面后由 L3 校正。
      tier = minTier(ceiling, "medium");
    } else {
      const benchmarked = await this.runStartupBenchmark();
      // 基准跑完前可能已经被 dispose（StrictMode 双挂载、快速导航）
      if (this.disposed) return null;
      tier = minTier(ceiling, benchmarked);
    }

    if (this.disposed) return null;

    this.applyTier(tier, /* rebuild */ true);
    this.resize();
    this.monitor = new RuntimeMonitor(TIER_SPECS[tier].frameBudgetMs);

    return tier;
  }

  /**
   * L2：启动微基准（15 §3）。
   *
   * 做法：分别测「空场景」与「N 个点」的每帧耗时，解出
   *     估计(档位粒子数) = 固定开销 + 每粒子边际成本 × 粒子数
   * 然后取预算内最高的档位。
   *
   * ⚠️ 诚实的局限：JS 无法测量 GPU 时间。performance.now() 包住 renderer.render()
   * 测到的是 CPU 提交耗时，不等于 GPU 实际耗时；GPU 也可能被垂直同步钳制。
   * 因此这里只作为**初始值**，真正的校正靠 L3 运行时监测 —— 这也正是
   * 15 §3 把 L3 设计成「只降不升」的原因。
   */
  private async runStartupBenchmark(): Promise<PerformanceTier> {
    // 取局部引用：循环里跨 await 访问 this.renderer 会失去类型收窄，
    // 而且 dispose() 会在 init 进行中把字段置空（StrictMode 双挂载、快速导航都会触发）。
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    if (!renderer || !scene || !camera) return "minimal";

    // --- 固定开销：空场景 ---
    const fixedMs = await this.measureFrameCost(renderer, scene, camera);
    if (this.disposed) return "minimal";

    // --- 固定开销 + BENCHMARK_COUNT 个点 ---
    const geom = buildGeometry(BENCHMARK_COUNT);
    const pos = geom.getAttribute("aPositionA") as BufferAttribute;
    const rnd = geom.getAttribute("aRandom") as BufferAttribute;
    for (let i = 0; i < BENCHMARK_COUNT; i++) {
      pos.setXYZ(i, Math.random() * 2 - 1, Math.random() * 2 - 1, 0);
      rnd.setX(i, Math.random());
    }
    pos.needsUpdate = true;
    rnd.needsUpdate = true;

    const mat = buildMaterial();
    mat.uniforms.uSize.value = this.params.size;
    mat.uniforms.uDpr.value = 1;
    mat.uniforms.uMotion.value = this.params.motion;

    const pts = new Points(geom, mat);
    scene.add(pts);

    let withPointsMs = fixedMs;
    try {
      withPointsMs = await this.measureFrameCost(renderer, scene, camera);
    } finally {
      scene.remove(pts);
      geom.dispose();
      mat.dispose();
    }

    if (this.disposed) return "minimal";

    const perParticle = Math.max(0, withPointsMs - fixedMs) / BENCHMARK_COUNT;

    // 留 15% 余量：估算本身不精确，宁可先保守，L3 会兜住真正的偏差
    const HEADROOM = 0.85;
    for (const t of TIER_ORDER) {
      const spec = TIER_SPECS[t];
      const estimate = fixedMs + perParticle * spec.particleCount;
      if (estimate <= spec.frameBudgetMs * HEADROOM) return t;
    }
    return "minimal";
  }

  /** 测一个场景的每帧 render 调用耗时中位数。丢弃前几帧以避开首帧开销。 */
  private async measureFrameCost(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
  ): Promise<number> {
    const TOTAL = 20;
    const DISCARD = 4;
    const times: number[] = [];

    for (let f = 0; f < TOTAL; f++) {
      if (this.disposed) break;
      const t0 = performance.now();
      renderer.render(scene, camera);
      const dt = performance.now() - t0;
      if (f >= DISCARD) times.push(dt);
      // 让出一帧，避免阻塞主线程太久
      await this.nextFrame();
    }

    if (times.length === 0) return 0;
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  }

  /**
   * 等下一帧。
   *
   * 必须带超时兜底：标签页不可见时 requestAnimationFrame 会被节流甚至完全停止，
   * 没有兜底的话 init() 会永久挂起，而 setImage / morphTo 都在 await 它，
   * 结果是整条链路静默卡死。
   */
  private nextFrame(): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const timer = setTimeout(finish, 100);
      requestAnimationFrame(() => {
        clearTimeout(timer);
        finish();
      });
    });
  }

  // -------------------------------------------------------------------------
  // 图像
  // -------------------------------------------------------------------------

  /**
   * 首次载入图像。直接成型，不做 Morph。
   *
   * **所有权转移**：调用方在这之后**不能** `bitmap.close()` ——
   * 贴图会引用它。引擎在换图或 dispose 时自己关。
   */
  async setImage(bitmap: ImageBitmap): Promise<void> {
    // 等定档完成，否则粒子数会按默认档位算错
    await this.initPromise;
    if (this.disposed || !this.renderer) return;
    this.currentBitmap = bitmap;

    const count = this.activeCount();
    const sample = sampleImage(bitmap, count, TIER_SPECS[this.tier].sampleLongEdge);
    this.currentSample = sample;

    // A 也按 Hilbert 排序，保证不变量：缓冲区里永远是「空间有序」的
    const perm = hilbertOrder(
      pickX(sample.positions),
      pickY(sample.positions),
      sample.count,
    );

    this.rebuildGeometry(count);
    this.writeBuffer("aPositionA", "aColorA", "aSizeA", sample, perm);
    this.writeBuffer("aPositionB", "aColorB", "aSizeB", sample, perm);
    this.morphing = false;
    if (this.material) this.material.uniforms.uProgress.value = 0;

    this.syncQuad();
    // 只把当前模式直接应用到新几何体上，**不重置模式**。
    // setImage 也会被「改密度」「降档」这类操作间接触发，
    // 在这里重置会让用户调个滑块就被踢回原图。
    this.setMode(this.mode, { immediate: true });

    this.resize();
  }

  /**
   * A → B Morph。
   *
   * 对应关系由 Hilbert 排序保证（06 §14）：
   * 当前缓冲区里的 A 已经是空间有序的，新采样的 B 也按 Hilbert 排序，
   * 两者按秩配对，于是每个粒子走最短路径。
   */
  async morphTo(bitmap: ImageBitmap): Promise<void> {
    await this.initPromise;
    if (this.disposed || !this.renderer || !this.geometry) return;

    const count = this.activeCount();
    const sample = sampleImage(bitmap, count, TIER_SPECS[this.tier].sampleLongEdge);

    const perm = hilbertOrder(
      pickX(sample.positions),
      pickY(sample.positions),
      sample.count,
    );

    // B 写入排序后的顺序，与已排序的 A 按秩配对
    this.writeBuffer("aPositionB", "aColorB", "aSizeB", sample, perm);

    this.currentBitmap = bitmap;
    // 采样结果先留着：morph 完成后它就成为新的 A
    this.pendingSample = sample;

    this.morphStartMs = performance.now();
    this.morphDuration =
      this.reducedMotion || this.tier === "low" || this.tier === "minimal"
        ? MORPH_DURATION_REDUCED_MS
        : MORPH_DURATION_MS;
    this.morphing = true;
    this.resumeRaf();
  }

  private pendingSample: SampleResult | null = null;

  /** Morph 结束后把 B 提升为 A —— 保持「缓冲区永远空间有序」的不变量。 */
  private settleMorph(): void {
    if (!this.geometry) return;
    const g = this.geometry;

    copyAttr(g, "aPositionB", "aPositionA");
    copyAttr(g, "aColorB", "aColorA");
    copyAttr(g, "aSizeB", "aSizeA");

    if (this.material) this.material.uniforms.uProgress.value = 0;
    this.morphing = false;
    this.currentSample = this.pendingSample;
    this.pendingSample = null;

    // 目标图现在成了当前图，同步原图四边形（尺寸与贴图都可能变了）
    this.syncQuad();
  }

  // -------------------------------------------------------------------------
  // 参数 / 档位
  // -------------------------------------------------------------------------

  setParams(params: ParticleParams): void {
    const densityChanged = params.density !== this.params.density;
    this.params = params;

    if (this.material) {
      const u = this.material.uniforms;
      u.uSize.value = params.size;
      u.uMotion.value = params.motion;
      u.uTurbulence.value = params.turbulence;
      u.uMouseRadius.value = params.mouseRadius;
      u.uMouseForce.value = params.mouseForce;
      u.uNoiseSpeed.value = params.noiseSpeed;
      u.uColorVariation.value = params.colorVariation;
    }

    // 密度变了要重新采样 —— 粒子池大小是固定的（06 §13）
    if (densityChanged && this.currentBitmap) {
      void this.setImage(this.currentBitmap);
    }
  }

  setTier(tier: PerformanceTier): void {
    if (tier === this.tier) return;
    this.applyTier(tier, true);
    void this.resampleCurrent();
  }

  /** 当前档位。React 层用它判断是否需要下发新档位，避免重复调用。 */
  get currentTier(): PerformanceTier {
    return this.tier;
  }

  /**
   * 系统级的 prefers-reduced-motion 变化时调用。
   *
   * 不改档位（档位是性能问题，不是偏好问题），只影响动效幅度与转场时长
   * （04-UX_INTERACTION_SPEC.md §15）。
   */
  setReducedMotion(v: boolean): void {
    if (v === this.reducedMotion) return;
    this.reducedMotion = v;
    this.applyTier(this.tier, true);
  }

  private applyTier(tier: PerformanceTier, rebuild: boolean): void {
    this.tier = tier;
    const spec = TIER_SPECS[tier];

    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, spec.maxDpr));
    }
    this.monitor?.setBudget(spec.frameBudgetMs);

    const reduced = this.reducedMotion || tier === "low" || tier === "minimal";

    // 06 §12：降级档位跳过 z excursion，散开幅度收窄，但保留 SCATTER 阶段本身
    if (this.material) {
      this.material.uniforms.uScatter.value = reduced ? 0.45 : 1.0;
    }

    if (rebuild) {
      this.morphDuration = reduced ? MORPH_DURATION_REDUCED_MS : MORPH_DURATION_MS;
    }

    this.onTierChange?.(tier);
    this.lastStats = { ...this.lastStats, tier };
  }

  private async resampleCurrent(): Promise<void> {
    if (this.currentBitmap) await this.setImage(this.currentBitmap);
  }

  private activeCount(): number {
    const max = TIER_SPECS[this.tier].particleCount;
    return Math.max(1_000, Math.round(max * this.params.density));
  }

  // -------------------------------------------------------------------------
  // 指针
  // -------------------------------------------------------------------------

  /**
   * 更新指针。
   *
   * @param nx 归一化屏幕 x，−1..1（1 = 画布右边缘）
   * @param ny 归一化屏幕 y，−1..1（1 = 画布下边缘）
   *
   * 内部换算到 z=0 平面上的世界坐标，与粒子位置同一空间 ——
   * 这样指针场不需要知道相机的存在。
   */
  setPointerScreen(nx: number, ny: number): void {
    if (!this.camera) return;

    // 用射线把屏幕坐标投到 z=0 平面上，而不是简单地按距离缩放。
    // 画布可以 3D 旋转，简单缩放只在正视时成立，转过之后指针场会错位。
    const ndc = new Vector3(nx, -ny, 0.5).unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();

    // 视线几乎与平面平行时无解（看向侧边），让场回落到无指针状态
    if (Math.abs(dir.z) < 1e-4) {
      this.pointerTarget.set(9_999, 9_999);
      return;
    }

    const t = -this.camera.position.z / dir.z;
    if (t < 0) {
      this.pointerTarget.set(9_999, 9_999);
      return;
    }

    this.pointerTarget.set(
      this.camera.position.x + dir.x * t,
      this.camera.position.y + dir.y * t,
    );
  }

  /** 指针离开画布时调用，让场在无指针状态下回落到 0 */
  clearPointer(): void {
    this.pointerTarget.set(9_999, 9_999);
    this.pointer.set(9_999, 9_999);
  }

  // -------------------------------------------------------------------------
  // 渲染循环
  // -------------------------------------------------------------------------

  start(): void {
    this.running = true;
    this.resumeRaf();
  }

  stop(): void {
    this.running = false;
    this.pauseRaf();
  }

  private resumeRaf(): void {
    if (this.rafId !== null || this.disposed) return;
    this.lastFrameMs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  private pauseRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private readonly tick = (now: number) => {
    this.rafId = null;
    if (this.disposed || !this.renderer || !this.scene || !this.camera) return;

    const frameMs = now - this.lastFrameMs;
    this.lastFrameMs = now;

    // --- L3 运行时监测（15 §3）---
    // 页面不可见时不采样：隐藏标签页里 rAF 被节流，帧时间会被拉得很大，
    // L3 会把它误判成性能不足而错误降档（实测过：切走一会儿再回来，
    // 档位已经从 medium 掉到 low）。
    if (this.monitor && !this.tierOverride && !document.hidden) {
      if (this.monitor.push(frameMs, now)) {
        const idx = TIER_ORDER.indexOf(this.tier);
        if (idx >= 0 && idx < TIER_ORDER.length - 1) {
          const next = TIER_ORDER[idx + 1];
          console.info(`[ParticleSystem] L3 降档 ${this.tier} → ${next}`);
          this.applyTier(next, true);
          void this.resampleCurrent();
          this.monitor.reset();
        }
      }
    }

    // --- 指针平滑：让场的变化也是柔和的 ---
    this.pointer.lerp(this.pointerTarget, 0.12);
    if (this.material) this.material.uniforms.uPointer.value.copy(this.pointer);

    // --- Morph 推进 ---
    if (this.morphing && this.material) {
      const raw = Math.min(1, (now - this.morphStartMs) / this.morphDuration);
      this.material.uniforms.uProgress.value = easeMorphProgress(raw);
      if (raw >= 1) this.settleMorph();
    }

    if (this.material) this.material.uniforms.uTime.value = now / 1000;

    // --- 相机：由 OrbitControls 掌管（拖拽旋转 / 滚轮缩放）---
    // 开了阻尼就必须每帧 update，否则惯性不会衰减
    this.controls?.update();

    // 只在状态真正翻转时通知，不要每帧回调
    const rotated = !this.isFrontView();
    if (rotated !== this.lastRotated) {
      this.lastRotated = rotated;
      this.onViewChange?.(rotated);
    }

    this.renderer.render(this.scene, this.camera);

    // --- 统计 ---
    this.statsAccum += frameMs;
    this.statsFrames++;
    if (this.statsFrames >= 15) {
      const avg = this.statsAccum / this.statsFrames;
      this.lastStats = {
        fps: avg > 0 ? Math.round(1000 / avg) : 0,
        frameMs: Math.round(avg * 10) / 10,
        p90Ms: Math.round((this.monitor?.p90() ?? 0) * 10) / 10,
        particleCount: this.particleCount,
        drawCalls: this.renderer.info.render.calls,
        dpr: this.renderer.getPixelRatio(),
        tier: this.tier,
      };
      this.onStats?.(this.lastStats);
      this.statsAccum = 0;
      this.statsFrames = 0;
    }

    if (this.running) this.rafId = requestAnimationFrame(this.tick);
  };

  // -------------------------------------------------------------------------
  // 尺寸
  // -------------------------------------------------------------------------

  resize(): void {
    if (!this.renderer || !this.camera) return;

    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));

    this.renderer.setSize(w, h, false);

    const aspect = this.currentSample?.aspect ?? 1;
    const halfW = aspect >= 1 ? 1 : aspect;
    const halfH = aspect >= 1 ? 1 / aspect : 1;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // 装下整个粒子云所需的最小距离：竖直与水平两个方向都要满足，取更远的。
    // fillHeight 让云只占视口高度的一部分（首页要留出下方文字的位置）。
    const tan = Math.tan((CAMERA_FOV * Math.PI) / 360);
    const dV = (halfH * FIT_PADDING) / (tan * this.fillHeight);
    const dH = (halfW * FIT_PADDING) / ((w / h) * tan * this.fillHeight);
    const nextFit = Math.max(dV, dH);

    const prevFit = this.fitDistance;
    this.fitDistance = nextFit;

    // offsetY 换算成世界单位。相机看向云心下方一点，画面就整体上移，
    // 同时保持旋转仍以云心为轴。
    this.targetY = -(this.offsetY * nextFit * tan * 2);
    const newTarget = new Vector3(0, this.targetY, 0);

    // 保持用户的旋转方向与相对缩放：只缩放「从目标点到相机」的偏移向量
    const dir = this.camera.position.clone().sub(this.controlsTargetPrev);
    if (prevFit <= 0 || dir.lengthSq() < 1e-8) {
      dir.set(0, 0, nextFit); // 首次：正对画面
    } else {
      dir.multiplyScalar(nextFit / prevFit);
    }

    this.camera.position.copy(newTarget).add(dir);
    this.controls?.target.copy(newTarget);
    this.controlsTargetPrev.copy(newTarget);

    if (this.controls) {
      this.controls.minDistance = nextFit * 0.30;
      this.controls.maxDistance = nextFit * 2.60;
      this.controls.update();
    }
  }

  // -------------------------------------------------------------------------
  // 内部
  // -------------------------------------------------------------------------

  private rebuildGeometry(count: number): void {
    if (!this.scene) return;

    if (this.points) {
      this.scene.remove(this.points);
      this.geometry?.dispose();
    }

    const geom = buildGeometry(count);
    this.geometry = geom;
    this.particleCount = count;

    if (!this.material) this.material = buildMaterial();
    this.applyParamsToMaterial();

    this.points = new Points(geom, this.material);
    this.points.frustumCulled = false; // 粒子云始终占满视野，剔除只会浪费
    this.scene.add(this.points);
  }

  // -------------------------------------------------------------------------
  // 原图 ⇄ 粒子
  // -------------------------------------------------------------------------

  /**
   * 把原图贴进场景。
   *
   * 四边形与粒子云占据**完全相同的矩形** —— 采样时坐标就是映射到
   * [-halfW, halfW] × [-halfH, halfH]，所以两者天然对齐，切换不需要额外换算。
   */
  private syncQuad(): void {
    if (!this.scene || !this.currentBitmap) return;

    const aspect = this.currentSample?.aspect ?? 1;
    const halfW = aspect >= 1 ? 1 : aspect;
    const halfH = aspect >= 1 ? 1 / aspect : 1;

    // 溶解场用世界坐标算半径，两层都要知道归一化用的最大半径。
    // 用勾股而不是 max(halfW, halfH)：波前要扩散到**四角**才算走完，
    // 否则角落会剩一块没溶解的照片。
    const maxR = Math.hypot(halfW, halfH);
    if (this.material) this.material.uniforms.uMaxR.value = maxR;
    if (this.quadMaterial) this.quadMaterial.uniforms.uMaxR.value = maxR;

    this.quadGeometry?.dispose();
    this.quadGeometry = new PlaneGeometry(halfW * 2, halfH * 2);

    // ⚠️ 必须手动翻转 V 坐标。
    //
    // Three 的 WebGLTextures 里有一段：
    //     if ( isImageBitmap === false ) { pixelStorei(UNPACK_FLIP_Y_WEBGL, texture.flipY) }
    // 也就是说**贴图源是 ImageBitmap 时整个跳过 UNPACK_FLIP_Y_WEBGL**，
    // 图像数据不翻转地上传，结果四边形上的图是上下颠倒的。
    // 而粒子的采样（ImageSampler）是显式翻过 Y 的，于是两者正好反着 ——
    // 照片模式猫是倒的，粒子模式猫是正的。
    //
    // 不能靠 texture.flipY = false 修，因为那个标志根本不会被读到。
    // 翻 UV 是零成本的（一次性）。
    const uv = this.quadGeometry.getAttribute("uv") as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    uv.needsUpdate = true;

    if (!this.quad) {
      this.quadMaterial = new ShaderMaterial({
        vertexShader: quadVertexShader,
        fragmentShader: quadFragmentShader,
        uniforms: {
          uMap: { value: null },
          uDissolve: { value: 0 },
          uMaxR: { value: 1.5 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      this.quad = new Mesh(this.quadGeometry, this.quadMaterial);
      // 必须画在粒子之前：两者都关了深度测试，靠 renderOrder 决定层次
      this.quad.renderOrder = -1;
      this.scene.add(this.quad);
    } else {
      this.quad.geometry = this.quadGeometry;
    }

    // 换一张图就换一张贴图。
    // 必须比对来源 —— setImage 也会被「改密度」「降档」触发，
    // 每次都重建纹理会白白重传一遍全尺寸图像。
    if (this.quadBitmap !== this.currentBitmap) {
      this.quadTexture?.dispose();
      const tex = new Texture(this.currentBitmap);
      // ⚠️ 标成 NoColorSpace，不是 SRGBColorSpace。
      //
      // 标 SRGBColorSpace 时 Three 会用 SRGB8_ALPHA8 内部格式，采样返回线性值，
      // 需要着色器再编码回 sRGB。但我们是自定义着色器，不包含
      // colorspace_fragment，那段编码不会发生 —— 结果是整体偏暗。
      //
      // 标 NoColorSpace 则用普通 RGBA8，texture2D 拿到原始 sRGB 值，
      // 直接写画布即为正确显示。最少活动部件。
      tex.colorSpace = NoColorSpace;
      // 不生成 mipmap：这张图基本是 1:1 显示，省一次全尺寸的降采样
      tex.generateMipmaps = false;
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      tex.needsUpdate = true;
      this.quadTexture = tex;
      this.quadBitmap = this.currentBitmap;

      if (this.quadMaterial) {
        this.quadMaterial.uniforms.uMap.value = tex;
      }

      // 旧图现在没有任何引用了，可以关掉。
      // 不能更早关：贴图指着它，WebGL 上下文丢失重建时会重新读源。
      const old = this.quadBitmap;
      this.quadBitmap = this.currentBitmap;
      if (old && old !== this.currentBitmap) old.close();
    }
  }

  /**
   * 切换显示模式。
   *
   * 规格：`16-ALBUM_SPACE.md` §8.2
   *
   * **不是简单的同时淡入淡出。** 粒子必须在中途才成形（`uGather` 0→1），
   * 否则看起来像叠了两张图；反过来切回原图时粒子要散开淡出，像沙粒被吹走。
   *
   * 用 GSAP 驱动而不是自己写缓动 —— `sn-morph` 是从设计 token 换算来的，
   * 与以后相册的镜头编排共用同一套曲线，动效性格不会分裂。
   */
  setMode(mode: DisplayMode, options?: { immediate?: boolean }): void {
    if (mode === this.mode && !options?.immediate) return;

    const from = this.mode;
    this.mode = mode;

    const toParticle = mode === "particle";

    // 缓动不能直接作用在 Three 的对象上，用代理对象承载中间值。
    // 只有一个数：0 = 完全照片，1 = 完全粒子。
    // 四边形和粒子读同一个 uDissolve，所以它们的消失与出现天然互补 ——
    // 这就是「照片自己解散」而不是「照片淡出 + 粒子淡入」的原因。
    const proxy = { dissolve: from === "particle" ? 1 : 0 };

    const apply = () => {
      if (this.quadMaterial) {
        this.quadMaterial.uniforms.uDissolve.value = proxy.dissolve;
      }
      if (this.material) {
        this.material.uniforms.uDissolve.value = proxy.dissolve;
      }
    };

    const gsap = ensureGsap();
    gsap.killTweensOf(proxy);

    // 原图是零厚度的平面，转到侧面会变成一条线。所以旋转只在粒子模式下开放
    // （粒子有 z 厚度，转起来有体积）。
    // 放在 immediate 分支之前 —— 这条在两种路径下都必须生效。
    if (this.controls) this.controls.enableRotate = toParticle;

    // immediate 用于初始化，以及 prefers-reduced-motion
    if (options?.immediate) {
      proxy.dissolve = toParticle ? 1 : 0;
      apply();
      if (this.quad) this.quad.visible = proxy.dissolve < 0.999;
      return;
    }

    // 四边形在 dissolve=1 时全部被 discard，那时才有必要摘出渲染。
    // 反方向一启动就要重新挂上。
    if (this.quad) this.quad.visible = true;

    // 切回原图时如果视角是歪的，把它带回来。直接跳回去太生硬。
    if (!toParticle && !this.isFrontView()) {
      this.returnToFront();
    }

    this.modeTween?.kill();
    this.modeTween = gsap.to(proxy, {
      dissolve: toParticle ? 1 : 0,
      duration: DUR.morph,
      ease: EASE.morph,
      onUpdate: apply,
      onComplete: () => {
        if (this.quad) this.quad.visible = proxy.dissolve < 0.999;
      },
    });
  }

  /** 当前模式 */
  get currentMode(): DisplayMode {
    return this.mode;
  }

  private applyParamsToMaterial(): void {
    if (!this.material) return;
    const u = this.material.uniforms;
    u.uSize.value = this.params.size;
    u.uMotion.value = this.params.motion;
    u.uTurbulence.value = this.params.turbulence;
    u.uMouseRadius.value = this.params.mouseRadius;
    u.uMouseForce.value = this.params.mouseForce;
    u.uNoiseSpeed.value = this.params.noiseSpeed;
    u.uColorVariation.value = this.params.colorVariation;
    u.uDpr.value = Math.min(window.devicePixelRatio || 1, TIER_SPECS[this.tier].maxDpr);
  }

  /** 按排列把采样结果写进几何体的三个 attribute */
  private writeBuffer(
    posName: string,
    colName: string,
    sizeName: string,
    sample: SampleResult,
    perm: Uint32Array,
  ): void {
    if (!this.geometry) return;
    const p = this.geometry.getAttribute(posName) as BufferAttribute;
    const c = this.geometry.getAttribute(colName) as BufferAttribute;
    const s = this.geometry.getAttribute(sizeName) as BufferAttribute;

    const n = Math.min(sample.count, p.count);
    const src = sample.positions;
    const cols = sample.colors;
    const luma = sample.luma;

    for (let i = 0; i < n; i++) {
      const j = perm[i];
      p.setXYZ(i, src[j * 3], src[j * 3 + 1], src[j * 3 + 2]);
      c.setXYZ(i, cols[j * 3], cols[j * 3 + 1], cols[j * 3 + 2]);
      // 亮部粒子略大。范围刻意收窄 —— 尺寸差会叠加在密度差上，
      // 用 0.75–1.25 那种幅度会把暗部进一步推得看不见。
      s.setX(i, 0.9 + 0.2 * luma[j]);
    }

    p.needsUpdate = true;
    c.needsUpdate = true;
    s.needsUpdate = true;
  }

  /**
   * 回到正视角。
   *
   * 旋转是探索，但用户需要一个随时能回到「照片」的方式 ——
   * 否则转到一个奇怪的角度后就找不回原来的画面了。
   */
  resetView(): void {
    if (!this.camera) return;
    this.camera.position.set(0, this.targetY, this.fitDistance);
    this.controls?.target.set(0, this.targetY, 0);
    this.controls?.update();
  }

  /** 当前是否处于正视角（供 UI 决定要不要显示「复位」） */
  isFrontView(): boolean {
    if (!this.camera) return false;
    return (
      Math.abs(this.camera.position.x - 0) < 1e-3 &&
      Math.abs(this.camera.position.y - this.targetY) < 1e-3
    );
  }

  /**
   * 平滑地把相机带回正视角。
   *
   * 不直接 snap：切回原图时如果用户正转着一个奇怪的角度，
   * 瞬间跳回去会很突兀。用与模式切换同一条缓动。
   */
  private returnToFront(): void {
    const cam = this.camera;
    const controls = this.controls;
    if (!cam) return;

    // 补间期间要夺走控制权，否则 OrbitControls 的阻尼会和它打架
    if (controls) controls.enabled = false;

    const from = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    const to = { x: 0, y: this.targetY, z: this.fitDistance };

    ensureGsap().to(from, {
      ...to,
      duration: DUR.morph,
      ease: EASE.morph,
      onUpdate: () => cam.position.set(from.x, from.y, from.z),
      onComplete: () => {
        if (controls) {
          controls.target.set(0, this.targetY, 0);
          controls.enabled = true;
          controls.update();
        }
        this.lastRotated = false;
        this.onViewChange?.(false);
      },
    });
  }

  dispose(): void {
    if (this.disposed) return; // 幂等：StrictMode 与快速导航会重复调用
    this.disposed = true;
    this.stop();

    this.controls?.dispose();
    this.controls = null;

    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    this.geometry?.dispose();
    this.material?.dispose();

    // 原图四边形相关
    this.modeTween?.kill();
    this.modeTween = null;
    this.quadGeometry?.dispose();
    this.quadMaterial?.dispose();
    this.quadTexture?.dispose();
    this.quadBitmap = null;
    if (this.scene && this.quad) this.scene.remove(this.quad);
    this.quad = null;
    this.quadGeometry = null;
    this.quadMaterial = null;
    this.quadTexture = null;

    // 当前图如果没人引用了就释放
    if (this.currentBitmap && this.currentBitmap !== this.quadBitmap) {
      this.currentBitmap.close();
    }
    this.currentBitmap = null;

    this.renderer?.dispose();

    this.geometry = null;
    this.material = null;
    this.points = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }
}

// ---------------------------------------------------------------------------
// 工厂辅助
// ---------------------------------------------------------------------------

function pickX(interleaved: Float32Array): Float32Array {
  const n = interleaved.length / 3;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = interleaved[i * 3];
  return out;
}

function pickY(interleaved: Float32Array): Float32Array {
  const n = interleaved.length / 3;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = interleaved[i * 3 + 1];
  return out;
}

/** 固定属性布局（06 §11）。每个粒子 64 字节。 */
function buildGeometry(count: number): BufferGeometry {
  const g = new BufferGeometry();
  const f32 = (n: number, itemSize: number) =>
    new BufferAttribute(new Float32Array(n * itemSize), itemSize);

  const posA = f32(count, 3);
  g.setAttribute("aPositionA", posA);
  g.setAttribute("aPositionB", f32(count, 3));
  g.setAttribute("aColorA", f32(count, 3));
  g.setAttribute("aColorB", f32(count, 3));
  g.setAttribute("aSizeA", f32(count, 1));
  g.setAttribute("aSizeB", f32(count, 1));

  const rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) rnd[i] = Math.random();
  g.setAttribute("aRandom", new BufferAttribute(rnd, 1));

  // Three 需要名为 position 的属性来确定顶点数。这里直接复用 aPositionA
  // 的同一份 buffer（不复制），省下 Ultra 档 1.8MB 的冗余显存。
  g.setAttribute("position", posA);
  g.setDrawRange(0, count);

  return g;
}

function buildMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    uniforms: {
      uProgress: { value: 0 },
      uScatter: { value: 1 },
      // 0 = 完全照片，1 = 完全粒子。四边形与粒子共用这一个值
      uDissolve: { value: 0 },
      // 中心到最远角的距离，溶解场用来归一化半径
      uMaxR: { value: 1.5 },
      uTime: { value: 0 },
      uPointer: { value: new Vector2(999, 999) },
      uMouseRadius: { value: 0.22 },
      uMouseForce: { value: 0.35 },
      uSize: { value: 1.6 },
      uMotion: { value: 0.35 },
      uTurbulence: { value: 0.12 },
      uNoiseSpeed: { value: 1.0 },
      uColorVariation: { value: 0 },
      uDpr: { value: 1 },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
  });
}

function copyAttr(
  geom: BufferGeometry,
  from: string,
  to: string,
): void {
  const src = geom.getAttribute(from) as BufferAttribute;
  const dst = geom.getAttribute(to) as BufferAttribute;
  (dst.array as Float32Array).set(src.array as Float32Array);
  dst.needsUpdate = true;
}
