/**
 * (+ 2026-10-18) BỘ VẼ "SƠ ĐỒ TƯ THẾ" dùng chung (thuần chuỗi SVG — không cần DOM, test được trong node).
 *
 * Bé và bố mẹ chê hình bàn tay vẽ "xấu quá" (hai lần, cả bản vẽ thật lẫn bản hoạt hình) → OWNER: BỎ HẲN hình bàn tay người.
 * Mọi tranh tư thế / hoạt hình kỹ thuật giờ là SƠ ĐỒ TRỪU TƯỢNG cùng một bộ "chữ hình" (nét tròn to, viền mực 3 đơn vị như
 * Bé Nốt, nhiều khoảng trắng):
 * - CHẤM ĐẦU NGÓN: chấm tròn xanh có số 1–5 (cùng màu huy hiệu số ngón trên bàn phím);
 * - CÂY CẦU: nét cong dày tím — khớp gốc ngón cao như cây cầu; "cột cầu" mảnh nối xuống từng chấm;
 * - KHỐI CẲNG TAY: khối bo tròn (nhìn ngang) + NÉT BÀN TAY từ khối tới đầu ngón;
 * - QUẢ NẶNG: quả bóng cam rơi xuống phím (sức nặng cánh tay);
 * - PHÍM ĐÀN: nhìn ngang (sideKeys) hoặc nhìn thẳng từ chỗ bé ngồi (frontKeys — phím đen nhô cao phía sau).
 * Không filter / blur (chậm trên iPad Safari).
 *
 * Toạ độ & góc theo hệ SVG: góc 0° = sang phải, 90° = xuống dưới.
 */
import { P } from './svgKit';

export type Pt = readonly [number, number];

/** Mực viền (cùng màu viền Bé Nốt) */
export const INK = '#2a2350';
/** Độ dày viền nhân vật / sơ đồ */
export const INK_W = 3;
/** Viền mảnh cho ĐỒ VẬT (phím đàn, thân đàn…) */
export const OUTLINE = 'rgba(61,52,102,.42)';
/** Màu "đúng" / "chưa đúng". */
export const GOOD = P.good;
export const BAD = '#e8574a';
/** Chấm đầu ngón (cùng màu huy hiệu số ngón tay phải trên bàn phím) */
export const DOT = '#2b7bd0';
export const DOT_DARK = '#155a9e';
/** Cây cầu / nét bàn tay */
export const ARCH = P.violet;
/** Khối cẳng tay */
export const BLOCK = '#b9a8ff';

/** Số gọn cho thuộc tính SVG — không bao giờ in "NaN" (lỗi toạ độ → 0). */
export function n(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Điểm cách `p` một đoạn `len` theo hướng `deg`. */
export function step(p: Pt, len: number, deg: number): Pt {
  return [p[0] + len * Math.cos(rad(deg)), p[1] + len * Math.sin(rad(deg))];
}

/** Nét dày có viền mực: vẽ nét mực rộng hơn bên dưới rồi nét màu lên trên (đường `d`). */
export function stroke(d: string, color: string, w: number, cls = ''): string {
  const c = cls ? ` class="${cls}"` : '';
  return (
    `<g${c} fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${d}" stroke="${INK}" stroke-width="${n(w + 2 * INK_W)}"/><path d="${d}" stroke="${color}" stroke-width="${n(w)}"/></g>`
  );
}

/** Đường cong "cây cầu" từ a tới b, đỉnh cao hơn đường nối a–b một đoạn `lift` (âm = võng xuống). */
export function archD(a: Pt, b: Pt, lift: number): string {
  const k = 1.33 * lift;
  return `M${n(a[0])} ${n(a[1])} C${n(a[0])} ${n(a[1] - k)} ${n(b[0])} ${n(b[1] - k)} ${n(b[0])} ${n(b[1])}`;
}

/** Điểm trên cây cầu archD ở tham số t (0..1). */
export function archAt(a: Pt, b: Pt, lift: number, t: number): Pt {
  const k = 1.33 * lift;
  const c1: Pt = [a[0], a[1] - k];
  const c2: Pt = [b[0], b[1] - k];
  const u = 1 - t;
  const f = (i: 0 | 1) => u * u * u * a[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * b[i];
  return [f(0), f(1)];
}

/** Chấm đầu ngón (có số ngón; `k` rỗng = không số). */
export function dot(p: Pt, k: number | string = '', o: { r?: number; fill?: string; cls?: string; ring?: boolean } = {}): string {
  const r = o.r ?? 11;
  const fill = o.fill ?? DOT;
  const cls = o.cls ? ` class="${o.cls}"` : '';
  const txt =
    k === ''
      ? ''
      : `<text x="${n(p[0])}" y="${n(p[1] + r * 0.36)}" font-size="${n(r * 1.12)}" font-weight="900" font-family="Baloo 2, Nunito, sans-serif" fill="#fff" text-anchor="middle">${k}</text>`;
  return `<g${cls}><circle cx="${n(p[0])}" cy="${n(p[1])}" r="${n(r)}" fill="${fill}" stroke="${INK}" stroke-width="${INK_W}"/>${txt}</g>`;
}

/** Quả nặng (bóng cam có sọc) tâm c, bán kính r. */
export function ball(c: Pt, r = 15, cls = ''): string {
  const k = cls ? ` class="${cls}"` : '';
  return (
    `<g${k}><circle cx="${n(c[0])}" cy="${n(c[1])}" r="${n(r)}" fill="${P.orange}" stroke="${INK}" stroke-width="${INK_W}"/>` +
    `<path d="M${n(c[0] - r * 0.92)} ${n(c[1] - r * 0.2)} Q${n(c[0])} ${n(c[1] + r * 0.45)} ${n(c[0] + r * 0.92)} ${n(c[1] - r * 0.2)}" stroke="${P.sunLight}" stroke-width="${n(Math.max(2, r * 0.17))}" fill="none" stroke-linecap="round"/>` +
    `<ellipse cx="${n(c[0] - r * 0.38)}" cy="${n(c[1] - r * 0.45)}" rx="${n(r * 0.22)}" ry="${n(r * 0.14)}" fill="#fff" opacity=".75"/></g>`
  );
}

/** Khối cẳng tay (nhìn ngang): bo tròn, đầu phải ở `end` (tâm mép phải), dài `len`, dày `h`. */
export function forearm(end: Pt, len = 70, h = 22, deg = 0): string {
  const x = end[0] - len;
  const y = end[1] - h / 2;
  const rot = deg ? ` transform="rotate(${n(deg)} ${n(end[0])} ${n(end[1])})"` : '';
  return (
    `<g${rot}><rect x="${n(x)}" y="${n(y)}" width="${n(len + h / 2)}" height="${n(h)}" rx="${n(h / 2)}" fill="${BLOCK}" stroke="${INK}" stroke-width="${INK_W}"/>` +
    `<path d="M${n(x + h * 0.6)} ${n(y + h * 0.3)} H${n(end[0] - h * 0.4)}" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/></g>`
  );
}

/** Phím nhìn thẳng (từ chỗ bé ngồi): x0 trái, y mặt phím trắng, `count` phím rộng `kw`, cao `faceH`. */
export interface FrontKeysOpts {
  /** Độ sáng (0..1) của từng phím trắng (vàng nhạt) */
  glow?: (i: number) => number;
  /** Phím trắng nhấn xuống (0..1 → lún 5 đơn vị) */
  press?: (i: number) => number;
  /** Chỉ số phím trắng có phím đen ngay bên phải (mặc định như Đô–Rê–Mi–Fa–Sol–La–Si) */
  blacks?: readonly number[];
  /** Phím trắng đầu tiên là nốt thứ mấy trong quãng tám (0 = Đô) — để tự đặt phím đen */
  first?: number;
  /** Lớp CSS cho phím trắng thứ i (hoạt hình) */
  keyClass?: (i: number) => string;
}
export function frontKeys(x0: number, y: number, count: number, kw: number, faceH: number, o: FrontKeysOpts = {}): string {
  const first = o.first ?? 0;
  const blacks = o.blacks ?? Array.from({ length: count - 1 }, (_, i) => i).filter((i) => [0, 1, 3, 4, 5].includes((first + i) % 7));
  let s = `<rect x="${n(x0 - 6)}" y="${n(y - 4)}" width="${n(count * kw + 12)}" height="${n(faceH + 12)}" rx="8" fill="${P.wood}" stroke="${OUTLINE}" stroke-width="1.3"/>`;
  for (let i = 0; i < count; i++) {
    const pr = Math.max(0, Math.min(1, o.press?.(i) ?? 0));
    const g = Math.max(0, Math.min(1, o.glow?.(i) ?? 0));
    const cls = o.keyClass?.(i);
    s +=
      `<g${cls ? ` class="${cls}"` : ''}${pr ? ` transform="translate(0 ${n(pr * 5)})"` : ''}>` +
      `<rect x="${n(x0 + i * kw + 1)}" y="${n(y)}" width="${n(kw - 2)}" height="${n(faceH)}" rx="5" fill="${g > 0.02 ? P.sunLight : '#fff'}" stroke="${INK}" stroke-width="2.2"/>` +
      (g > 0.02 && g < 0.98 ? `<rect x="${n(x0 + i * kw + 1)}" y="${n(y)}" width="${n(kw - 2)}" height="${n(faceH)}" rx="5" fill="#fff" opacity="${n(1 - g)}"/>` : '') +
      `<rect x="${n(x0 + i * kw + 4)}" y="${n(y + faceH - 9)}" width="${n(kw - 8)}" height="5" rx="2.5" fill="#ebe7f7"/></g>`;
  }
  for (const i of blacks) {
    const cx = x0 + (i + 1) * kw;
    const bw = kw * 0.36;
    s += `<rect x="${n(cx - bw / 2)}" y="${n(y - 11)}" width="${n(bw)}" height="14" rx="4" fill="${P.night}" stroke="${INK}" stroke-width="2"/>`;
  }
  return s;
}

/** Tâm phím trắng thứ i của frontKeys. */
export const frontX = (x0: number, kw: number, i: number) => x0 + i * kw + kw / 2;

export interface SideKeysOpts {
  /** x mép trước phím trắng (phía bé ngồi) */
  x: number;
  /** y mặt phím trắng */
  y: number;
  /** chiều dài phím thấy được (sang phải) */
  len: number;
  /** Phím đang được nhấn (xuống tới đáy) */
  pressed?: boolean;
  /** Độ nhấn liên tục 0..1 (hoạt hình); bị `pressed` ghi đè */
  press?: number;
  /** Lớp CSS cho nhóm phím trắng (để làm hoạt hình nhấn) */
  keyClass?: string;
  /** Hiện nỉ đáy phím (key bed) có tô màu */
  bed?: boolean;
}

/** Phím đàn nhìn ngang: thân đàn, phím đen phía sau, phím trắng (có thể nhấn), nỉ đáy phím. */
export function sideKeys(o: SideKeysOpts): string {
  const { x, y, len } = o;
  const down = o.pressed ? 6 : Math.max(0, Math.min(1, Number.isFinite(o.press) ? (o.press as number) : 0)) * 6;
  const end = x + len + 60;
  const body = `<path d="M${n(x - 4)} ${n(y + 16)} H${n(end)} V${n(y + 90)} H${n(x - 4)} Z" fill="${P.wood}" stroke="${OUTLINE}" stroke-width="1.3"/>`;
  const rail = `<path d="M${n(x - 4)} ${n(y + 30)} H${n(end)}" stroke="${P.woodDark}" stroke-width="2" opacity=".5"/>`;
  const bed = `<rect x="${n(x + 6)}" y="${n(y + 17)}" width="${n(len + 50)}" height="5" rx="2.5" fill="${o.bed ? '#e0605a' : '#c99bc3'}"/>`;
  const black = `<path d="M${n(x + len * 0.46)} ${n(y + 1)} V${n(y - 11)} Q${n(x + len * 0.46)} ${n(y - 14)} ${n(x + len * 0.46 + 4)} ${n(y - 14)} H${n(end)} V${n(y + 1)} Z" fill="${P.night}" stroke="${INK}" stroke-width="2"/>`;
  const white =
    `<g class="${o.keyClass ?? ''}"${down ? ` transform="translate(0 ${n(down)})"` : ''}>` +
    `<path d="M${n(x)} ${n(y + 4)} Q${n(x)} ${n(y)} ${n(x + 4)} ${n(y)} H${n(end)} V${n(y + 14)} H${n(x)} Z" fill="#fff" stroke="${INK}" stroke-width="2.2"/>` +
    `<rect x="${n(x + 1.5)}" y="${n(y + 9)}" width="${n(len + 57)}" height="4" fill="#ebe7f7"/>` +
    `</g>`;
  return body + rail + bed + black + white;
}

/** Dấu ✗ tròn đỏ cam (cùng cỡ checkBadge). */
export function crossBadge(x: number, y: number, r = 12): string {
  const k = r / 12;
  return `<g transform="translate(${n(x)} ${n(y)})"><circle r="${n(r)}" fill="${BAD}" stroke="#fff" stroke-width="${n(3 * k)}"/><path d="M${n(-4.4 * k)} ${n(-4.4 * k)} L${n(4.4 * k)} ${n(4.4 * k)} M${n(4.4 * k)} ${n(-4.4 * k)} L${n(-4.4 * k)} ${n(4.4 * k)}" stroke="#fff" stroke-width="${n(3.2 * k)}" stroke-linecap="round"/></g>`;
}

/** Vòng nhấn mạnh quanh một điểm (xanh = đúng, đỏ = chỗ sai). */
export function ring(p: Pt, r: number, color: string, cls = ''): string {
  return `<circle class="${cls}" cx="${n(p[0])}" cy="${n(p[1])}" r="${n(r)}" fill="none" stroke="${color}" stroke-width="2.8" stroke-dasharray="5 4"/>`;
}

/** Mũi tên đơn giản từ a tới b. */
export function arrow(a: Pt, b: Pt, color: string, w = 3, cls = ''): string {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const hd = 3 + w * 1.6;
  const l: Pt = [b[0] - hd * Math.cos(ang - 0.5), b[1] - hd * Math.sin(ang - 0.5)];
  const r: Pt = [b[0] - hd * Math.cos(ang + 0.5), b[1] - hd * Math.sin(ang + 0.5)];
  return (
    `<g class="${cls}" stroke="${color}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
    `<path d="M${n(a[0])} ${n(a[1])} L${n(b[0])} ${n(b[1])}"/><path d="M${n(l[0])} ${n(l[1])} L${n(b[0])} ${n(b[1])} L${n(r[0])} ${n(r[1])}"/></g>`
  );
}

/** Nét răng cưa "gồng" (căng cứng) quanh điểm p. */
export function tension(p: Pt, color = BAD, s = 1): string {
  const z = (dx: number, dy: number, rot: number) =>
    `<path d="M0 0 l${n(3 * s)} ${n(-3 * s)} l${n(3 * s)} ${n(3 * s)} l${n(3 * s)} ${n(-3 * s)}" transform="translate(${n(p[0] + dx * s)} ${n(p[1] + dy * s)}) rotate(${rot})" stroke="${color}" stroke-width="${n(2.2 * s)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return z(-14, -10, -30) + z(4, -16, 10) + z(10, 2, 60);
}

/** Nhãn chữ nhỏ trong tranh (bo nền trắng để luôn đọc được). */
export function tag(x: number, y: number, text: string, color: string, size = 11): string {
  const w = Math.max(18, text.length * size * 0.56 + 10);
  return (
    `<g transform="translate(${n(x)} ${n(y)})"><rect x="${n(-w / 2)}" y="${n(-size * 0.95)}" width="${n(w)}" height="${n(size * 1.5)}" rx="${n(size * 0.75)}" fill="#fff" stroke="${color}" stroke-width="1.6"/>` +
    `<text x="0" y="${n(size * 0.28)}" font-size="${size}" font-weight="800" font-family="Baloo 2, Nunito, sans-serif" fill="${color}" text-anchor="middle">${text}</text></g>`
  );
}

/** Emoji gốc của máy (Apple vẽ — đẹp trên iPad) làm điểm nhấn trong tranh. */
export function emoji(x: number, y: number, ch: string, size = 22, cls = ''): string {
  return `<text${cls ? ` class="${cls}"` : ''} x="${n(x)}" y="${n(y)}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${ch}</text>`;
}

/** Nền khung tranh (bo góc; tông xanh nhạt cho "đúng", hồng nhạt cho "chưa đúng"). */
export function panelBg(w: number, h: number, tone: 'good' | 'bad' | 'plain'): string {
  const fill = tone === 'good' ? '#effbf5' : tone === 'bad' ? '#fff3f1' : '#f7f4ff';
  return `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="16" fill="${fill}"/>`;
}
