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
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  NormalBlending,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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
  onStats?: (stats: EngineStats) => void;
  onTierChange?: (tier: PerformanceTier) => void;
  /** 无法创建 WebGL 上下文时为 true，调用方应走静态降级 */
  onUnsupported?: () => void;
  reducedMotion?: boolean;
}

export class ParticleSystem {
  private readonly canvas: HTMLCanvasElement;
  private readonly onStats?: (s: EngineStats) => void;
  private readonly onTierChange?: (t: PerformanceTier) => void;
  private readonly onUnsupported?: () => void;
  private reducedMotion: boolean;
  private readonly tierOverride: PerformanceTier | null;

  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private points: Points | null = null;
  private geometry: BufferGeometry | null = null;
  private material: ShaderMaterial | null = null;

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
    if (document.hidden) this.pauseRaf();
    else if (this.running) this.resumeRaf();
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
    this.onUnsupported = opts.onUnsupported;
    this.reducedMotion = opts.reducedMotion ?? false;
    this.tierOverride = opts.tierOverride ?? null;
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

  /** 首次载入图像。直接成型，不做 Morph。 */
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
    if (this.monitor && !this.tierOverride) {
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

    // 装下整个粒子云所需的最小距离：竖直与水平两个方向都要满足，取更远的
    const tan = Math.tan((CAMERA_FOV * Math.PI) / 360);
    const dV = (halfH * FIT_PADDING) / tan;
    const dH = (halfW * FIT_PADDING) / ((w / h) * tan);
    const nextFit = Math.max(dV, dH);

    // 保持用户的旋转与缩放：只按 fit 的比例缩放当前射线距离，
    // 这样重新布局不会把用户转到的角度或缩放级别重置掉。
    const prevFit = this.fitDistance;
    this.fitDistance = nextFit;

    if (prevFit <= 0 || this.camera.position.lengthSq() < 1e-8) {
      this.camera.position.set(0, 0, nextFit); // 首次：正对画面
    } else {
      this.camera.position.multiplyScalar(nextFit / prevFit);
    }

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

  private applyParamsToMaterial(): void {
    if (!this.material) return;
    const u = this.material.uniforms;
    u.uSize.value = this.params.size;
    u.uMotion.value = this.params.motion;
    u.uTurbulence.value = this.params.turbulence;
    u.uMouseRadius.value = this.params.mouseRadius;
    u.uMouseForce.value = this.params.mouseForce;
    u.uNoiseSpeed.value = this.params.noiseSpeed;
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
      // 亮部粒子略大，暗部略小 —— 让主体更实（06 §6 的视觉延伸）
      s.setX(i, 0.75 + 0.5 * luma[j]);
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
    this.camera.position.set(0, 0, this.fitDistance);
    this.controls?.target.set(0, 0, 0);
    this.controls?.update();
  }

  /** 当前是否处于正视角（供 UI 决定要不要显示「复位」） */
  isFrontView(): boolean {
    if (!this.camera) return true;
    return this.camera.position.x === 0 && this.camera.position.y === 0;
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
      uTime: { value: 0 },
      uPointer: { value: new Vector2(999, 999) },
      uMouseRadius: { value: 0.22 },
      uMouseForce: { value: 0.35 },
      uSize: { value: 1.6 },
      uMotion: { value: 0.35 },
      uTurbulence: { value: 0.12 },
      uNoiseSpeed: { value: 1.0 },
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
