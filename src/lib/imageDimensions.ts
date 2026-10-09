/**
 * 从图片文件头解析真实尺寸。
 *
 * 为什么不用现成库：Node 没有内置图片解码，而引入 sharp 只为读宽高不划算
 * —— 按 05-TECH_ARCHITECTURE.md §7 的分工，像素处理归 Python 图像服务，
 * TypeScript 侧只做「字节进、字节出」的校验。
 *
 * 这个解析器的定位是**廉价的结构校验**：能挡住伪造扩展名的垃圾文件，
 * 但它不等于完整解码。真正的解码校验与缩略图生成留给图像服务。
 */

export interface ImageInfo {
  width: number;
  height: number;
  format: "png" | "jpeg" | "gif" | "webp";
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function readImageInfo(buf: Uint8Array): ImageInfo | null {
  if (buf.length < 16) return null;

  const png = readPng(buf);
  if (png) return png;

  const jpeg = readJpeg(buf);
  if (jpeg) return jpeg;

  const gif = readGif(buf);
  if (gif) return gif;

  const webp = readWebp(buf);
  if (webp) return webp;

  return null;
}

function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}
function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function u16le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}
function u24le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}
function u32le(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function readPng(b: Uint8Array): ImageInfo | null {
  if (b.length < 24) return null;
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) return null;
  // IHDR 是第一个 chunk：长度(4) 类型(4) 宽(4) 高(4)
  if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) {
    return null;
  }
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  return width > 0 && height > 0 ? { width, height, format: "png" } : null;
}

function readJpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;

  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) {
      o++; // 容忍填充字节
      continue;
    }
    const marker = b[o + 1];

    // 填充 / 无载荷标记
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      o += 2;
      continue;
    }

    const len = u16be(b, o + 2);
    if (len < 2) return null;

    // SOF0..SOF15，排除 DHT(C4) / JPG(C8) / DAC(CC)
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSof) {
      const height = u16be(b, o + 5);
      const width = u16be(b, o + 7);
      return width > 0 && height > 0 ? { width, height, format: "jpeg" } : null;
    }

    o += 2 + len;
  }
  return null;
}

function readGif(b: Uint8Array): ImageInfo | null {
  if (b.length < 10) return null;
  const sig = String.fromCharCode(b[0], b[1], b[2]);
  if (sig !== "GIF") return null;
  const width = u16le(b, 6);
  const height = u16le(b, 8);
  return width > 0 && height > 0 ? { width, height, format: "gif" } : null;
}

function readWebp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30) return null;
  const riff = String.fromCharCode(b[0], b[1], b[2], b[3]);
  const webp = String.fromCharCode(b[8], b[9], b[10], b[11]);
  if (riff !== "RIFF" || webp !== "WEBP") return null;

  const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);

  if (fourcc === "VP8X") {
    // canvas 尺寸是 24 位小端，存的是「减一」
    const w = u24le(b, 24) + 1;
    const h = u24le(b, 27) + 1;
    return w > 0 && h > 0 ? { width: w, height: h, format: "webp" } : null;
  }

  if (fourcc === "VP8L") {
    // 14 位宽 + 14 位高，打包在 4 字节里
    const bits = u32le(b, 21);
    const w = (bits & 0x3fff) + 1;
    const h = ((bits >> 14) & 0x3fff) + 1;
    return w > 0 && h > 0 ? { width: w, height: h, format: "webp" } : null;
  }

  if (fourcc === "VP8 ") {
    // 有损：跳过 3 字节帧标签 + 3 字节同步码后是尺寸
    const w = u16le(b, 26) & 0x3fff;
    const h = u16le(b, 28) & 0x3fff;
    return w > 0 && h > 0 ? { width: w, height: h, format: "webp" } : null;
  }

  return null;
}
