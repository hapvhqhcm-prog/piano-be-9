/**
 * Bộ "cọ vẽ" dùng chung cho mọi tranh SVG của app: một bảng màu ấm (tím chàm chủ đạo, vàng nắng,
 * xanh bạc hà, cam san hô), viền mảnh trong suốt nhẹ, và vài hình dựng sẵn (ngôi sao, nốt nhạc, dấu tích).
 * Tranh vẽ tay bằng SVG — không ảnh ngoài, không thư viện.
 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/** Bảng màu chung. */
export const P = {
  ink: '#3d3466', // viền / nét đậm
  indigo: '#5b54d6',
  indigoDark: '#3f3a9e',
  violet: '#8a6cff',
  violetLight: '#b9a8ff',
  lavender: '#ece7ff',
  sun: '#ffcb3d',
  sunLight: '#ffe58a',
  orange: '#ff9f43',
  coral: '#ff7a6b',
  coralLight: '#ffb3a8',
  pink: '#ff8fb1',
  mint: '#4fd1a5',
  mintLight: '#a8f0d4',
  grass: '#7fd47a',
  grassDark: '#4fb35f',
  sky: '#bfe6ff',
  water: '#7cc8f2',
  waterDark: '#4aa3dc',
  sand: '#ffe2a6',
  sandDark: '#f2c070',
  wood: '#c98a5a',
  woodDark: '#9c6340',
  stone: '#b8b2d6',
  stoneDark: '#8c84b8',
  snow: '#ffffff',
  skin: '#ffd9bc',
  skinDark: '#eab48d',
  hair: '#3b2a26',
  good: '#2fbf71',
  white: '#ffffff',
  night: '#2b2550',
} as const;

let seq = 0;
/** Id duy nhất cho gradient/filter (nhiều tranh cùng lúc trên một trang không đụng nhau). */
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

export function svgRoot(viewBox: string, cls: string, inner: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = inner;
  return svg;
}

/** Đường dẫn ngôi sao 5 cánh, tâm (cx, cy), bán kính ngoài r. */
export function starPath(cx: number, cy: number, r: number, inner = 0.48): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

/** Nốt móc đơn nhỏ: đầu nốt tại (x, y), cao ≈ 3.2·s. */
export function noteGlyph(x: number, y: number, s: number, color: string): string {
  const w = (1.1 * s).toFixed(1);
  const hgt = (0.8 * s).toFixed(1);
  const sx = x + 1.0 * s;
  return (
    `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${hgt}" transform="rotate(-20 ${x} ${y})" fill="${color}" stroke="none"/>` +
    `<path d="M${sx.toFixed(1)} ${y - 0.2 * s} V${(y - 3 * s).toFixed(1)} q${(1.2 * s).toFixed(1)} ${(0.5 * s).toFixed(1)} ${(1.4 * s).toFixed(1)} ${(1.8 * s).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${Math.max(1, 0.38 * s).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** Hai nốt móc đơn nối nhau (♫). Đầu nốt trái tại (x, y). */
export function beamedNotes(x: number, y: number, s: number, color: string): string {
  const gap = 2.6 * s;
  const sw = Math.max(1, 0.38 * s).toFixed(1);
  const head = (cx: number, cy: number) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${(1.1 * s).toFixed(1)}" ry="${(0.8 * s).toFixed(1)}" transform="rotate(-20 ${cx} ${cy})" fill="${color}" stroke="none"/>`;
  const x1 = x + 1.0 * s;
  const x2 = x + gap + 1.0 * s;
  return (
    head(x, y) +
    head(x + gap, y - 0.6 * s) +
    `<path d="M${x1.toFixed(1)} ${y} V${(y - 3 * s).toFixed(1)} L${x2.toFixed(1)} ${(y - 3.6 * s).toFixed(1)} V${(y - 0.6 * s).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="M${x1.toFixed(1)} ${(y - 3 * s).toFixed(1)} L${x2.toFixed(1)} ${(y - 3.6 * s).toFixed(1)}" stroke="${color}" stroke-width="${(0.9 * s).toFixed(1)}" stroke-linecap="round"/>`
  );
}

/** Huy hiệu tích xanh (✓) — dùng cho chú thích "đúng rồi". */
export function checkBadge(x: number, y: number, r = 12): string {
  const k = r / 12;
  return `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${P.good}" stroke="#fff" stroke-width="${3 * k}"/><path d="M${-5 * k} ${0.5 * k} l${3.6 * k} ${3.8 * k} l${6.6 * k} ${-8 * k}" fill="none" stroke="#fff" stroke-width="${3.2 * k}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

/** Lấp lánh 4 cánh nhỏ. */
export function sparkle(x: number, y: number, r: number, color: string): string {
  const q = r * 0.28;
  return `<path d="M${x} ${y - r} Q${x + q} ${y - q} ${x + r} ${y} Q${x + q} ${y + q} ${x} ${y + r} Q${x - q} ${y + q} ${x - r} ${y} Q${x - q} ${y - q} ${x} ${y - r} Z" fill="${color}" stroke="none"/>`;
}
