// Sinh icon PNG (không cần thư viện): node scripts/make-icons.mjs
// Hình: nền kem, 5 phím trắng + 3 phím đen, phím Đô màu xanh (tay phải).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [255, 248, 236];
const WHITE = [255, 255, 255];
const LINE = [58, 58, 68];
const BLACK = [36, 35, 43];
const GREEN = [46, 158, 91];

// Vùng phím trong "safe zone" 80% (icon maskable).
function pixel(u, v) {
  const L = 0.14, R = 0.86, T = 0.2, B = 0.8;
  if (u < L || u > R || v < T || v > B) return BG;
  const w = (R - L) / 5;
  const kx = (u - L) / w;
  const idx = Math.min(4, Math.floor(kx));
  const fx = kx - idx;
  // phím đen sau C, D (nhóm 2) và F
  const blackAt = [1, 2, 4];
  if (v < T + (B - T) * 0.6) {
    for (const b of blackAt) {
      if (Math.abs(kx - b) < 0.3) return BLACK;
    }
  }
  if (fx < 0.04 || fx > 0.96 || v > B - 0.012) return LINE;
  return idx === 0 ? GREEN : WHITE;
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(`public/icons/${name}`, png(size, pixel));
  console.log('wrote', name);
}
