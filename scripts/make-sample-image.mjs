/**
 * 生成首页的示例图。
 *
 * 为什么自己画而不用现成照片：示例图要能入库，不能有版权问题。
 * 这张是抽象的，但具备真实照片的几个特征 —— 连续中间调、明确光源、
 * 浅景深般的前景剪影，所以能用来判断版式与粒子密度是否合适。
 *
 * 运行：node scripts/make-sample-image.mjs
 * 输出：public/sample/dusk.png
 *
 * 不依赖任何第三方库 —— Node 自带 zlib，手写一个最小 PNG 编码器即可。
 */

import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const W = 1200;
const H = 800;

// ---------------------------------------------------------------------------
// 最小 PNG 编码器（8-bit RGB，无 alpha）
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // no interlace

  // 每行前加一个 filter 字节（0 = None）
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 画面
// ---------------------------------------------------------------------------

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** 便宜的确定性噪声，用来加一点颗粒，避免渐变色带 */
function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** 山脊高度：两个不同频率的正弦叠加，看起来像远山轮廓 */
function ridge(x, base, amp, freq, phase) {
  const u = x / W;
  return (
    base +
    Math.sin(u * freq + phase) * amp * 0.6 +
    Math.sin(u * freq * 2.3 + phase * 1.7) * amp * 0.28 +
    Math.sin(u * freq * 4.7 + phase * 0.4) * amp * 0.12
  );
}

const px = Buffer.alloc(W * H * 3);

// 光源位置：偏右上，符合 07 §1 的视觉重心
const LX = W * 0.70;
const LY = H * 0.26;

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const u = x / W;
    const v = y / H;

    // --- 天空：深蓝到暖灰的黄昏渐变 ---
    let r = mix(0.098, 0.242, Math.pow(v, 0.85));
    let g = mix(0.137, 0.176, Math.pow(v, 0.95));
    let b = mix(0.235, 0.196, Math.pow(v, 0.75));

    // --- 光源：径向柔光 ---
    const dx = (x - LX) / W;
    const dy = (y - LY) / H;
    const dist = Math.sqrt(dx * dx + dy * dy * 1.35);
    const glow = Math.exp(-dist * dist * 26);
    r += glow * 0.95;
    g += glow * 0.90;
    b += glow * 0.74;

    // 光晕外圈再压一点暖色，避免过渡太生硬
    const halo = Math.exp(-dist * dist * 4.5) * 0.16;
    r += halo;
    g += halo * 0.86;
    b += halo * 0.62;

    // --- 远山 ---
    const far = ridge(x, H * 0.60, H * 0.075, 3.1, 0.6);
    if (y > far) {
      const fade = smooth(0, H * 0.16, y - far); // 山脚更深一点
      const t = 0.30 - fade * 0.10;
      r = mix(r, 0.075 * (0.7 + glow * 1.6), t);
      g = mix(g, 0.098 * (0.7 + glow * 1.6), t);
      b = mix(b, 0.132 * (0.7 + glow * 1.6), t);
    }

    // --- 近山（更暗、更实）---
    const near = ridge(x, H * 0.745, H * 0.055, 2.2, 2.4);
    if (y > near) {
      r = mix(r, 0.028, 0.94);
      g = mix(g, 0.036, 0.94);
      b = mix(b, 0.052, 0.94);
    }

    // --- 颗粒：打散色带，顺便带一点胶片感 ---
    const n = (noise(x, y) - 0.5) * 0.022;
    r += n;
    g += n;
    b += n;

    // --- 四角压暗，把视线收拢到中心 ---
    const vx = (u - 0.5) * 2;
    const vy = (v - 0.5) * 2;
    const vig = 1 - clamp((vx * vx + vy * vy) * 0.30);
    r *= vig;
    g *= vig;
    b *= vig;

    const o = (y * W + x) * 3;
    px[o] = Math.round(clamp(r) * 255);
    px[o + 1] = Math.round(clamp(g) * 255);
    px[o + 2] = Math.round(clamp(b) * 255);
  }
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "sample");
fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, "dusk.png");
const png = encodePNG(W, H, px);
fs.writeFileSync(outPath, png);

console.log(`written ${outPath}  ${W}x${H}  ${(png.length / 1024).toFixed(0)} KB`);
