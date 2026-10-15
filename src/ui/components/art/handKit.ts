/**
 * (+ 2026-10-15) BỘ VẼ BÀN TAY dùng chung (thuần chuỗi SVG — không cần DOM, test được trong node):
 * - Bàn tay NHÌN NGANG dựng từ chuỗi khớp: đầu ngón → khớp đầu (DIP) → khớp giữa (PIP) → khớp gốc (MCP, "cây cầu")
 *   → cổ tay → khuỷu. Mỗi đốt là một nét dày có viền (vẽ hết viền rồi mới tô → khớp nối liền, không lộ đường nối).
 * - Phím đàn nhìn ngang (mặt phím, đáy phím = "nỉ" chặn phím), dấu ✓ / ✗, vòng nhấn mạnh, mũi tên, nét "gồng".
 * - Các DÁNG TAY có sẵn (HAND_POSES): cong chuẩn, bẹp, gãy khớp đầu, cổ tay võng / nhô.
 *
 * Dùng cho tranh "Tư thế tay" (handTechniqueArt.ts) và có thể dùng cho lớp bàn tay trên phím đàn (keyboardHand.ts).
 * Toạ độ & góc theo hệ SVG: góc 0° = sang phải, 90° = xuống dưới.
 */
import { P } from './svgKit';

export type Pt = readonly [number, number];

/** Viền mảnh dùng chung (cùng tông với postureArt / techniqueArt). */
export const OUTLINE = 'rgba(61,52,102,.42)';
/** Màu da: chính / đậm (nếp) / ngón phía sau (nhạt, lùi xa) / móng. */
export const SKIN = { base: P.skin, dark: P.skinDark, back: '#f3c8a6', nail: '#fff3ea' } as const;
/** Màu "đúng" / "chưa đúng". */
export const GOOD = P.good;
export const BAD = '#e8574a';

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

/** Chuỗi khớp: bắt đầu ở `start`, mỗi đoạn {len, deg}. Trả về mọi điểm (gồm `start`). */
export function chain(start: Pt, segs: ReadonlyArray<{ len: number; deg: number }>): Pt[] {
  const pts: Pt[] = [start];
  for (const s of segs) pts.push(step(pts[pts.length - 1], s.len, s.deg));
  return pts;
}

/** Đường gấp khúc qua các điểm. */
export function poly(pts: ReadonlyArray<Pt>): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${n(p[0])} ${n(p[1])}`).join(' ');
}

/** Nét dày có viền: một đoạn (hai điểm) — trả về {viền, tô} để gộp nhiều đoạn (vẽ hết viền rồi mới tô). */
export function seg(a: Pt, b: Pt, w: number, color: string, outline = OUTLINE): { under: string; over: string } {
  const d = `M${n(a[0])} ${n(a[1])} L${n(b[0])} ${n(b[1])}`;
  return {
    under: `<path d="${d}" stroke="${outline}" stroke-width="${n(w + 2.6)}" stroke-linecap="round" fill="none"/>`,
    over: `<path d="${d}" stroke="${color}" stroke-width="${n(w)}" stroke-linecap="round" fill="none"/>`,
  };
}

/** Gộp các nét: mọi viền trước, mọi phần tô sau. */
export function limbs(parts: ReadonlyArray<{ under: string; over: string }>): string {
  return parts.map((p) => p.under).join('') + parts.map((p) => p.over).join('');
}

/**
 * Góc (độ) của 5 đoạn tính NGƯỢC từ đầu ngón: [đốt đầu, đốt giữa, đốt gốc, mu bàn tay, cẳng tay].
 * Ví dụ đốt đầu −105° = từ đầu ngón đi lên hơi chếch về sau (ngón "đứng").
 */
export type PoseAngles = readonly [number, number, number, number, number];

/** Dáng tay có sẵn (nhìn ngang, tay đi từ trái sang, đàn ở bên phải). */
export const HAND_POSES = {
  /** ✓ Ngón cong, khớp gốc cao nhất (cây cầu), cổ tay ngang với mu bàn tay. */
  curved: [-95, -122, -152, 162, 168],
  /** ✗ Bàn tay bẹp: ngón duỗi nằm trên phím, khớp gốc sụp thấp hơn cổ tay. */
  flat: [-176, -178, 177, -171, 180],
  /** ✗ Khớp đầu ngón gãy (lõm vào): đốt đầu nằm bẹp, đốt giữa dựng đứng. */
  collapsed: [-177, -98, -160, 175, 179],
  /** ✗ Cổ tay võng xuống thấp hơn phím. */
  wristLow: [-95, -122, -152, 136, 155],
  /** ✗ Cổ tay nhô cao. */
  wristHigh: [-95, -122, -152, -166, -174],
  /** Ngón nghỉ: cong nhẹ, đầu ngón chạm hờ mặt phím. */
  resting: [-118, -146, -170, 173, 179],
  /** Ngón cứng duỗi thẳng (ấn bằng ngón cứng). */
  stiff: [-150, -152, -160, 175, 179],
} as const satisfies Record<string, PoseAngles>;
export type HandPose = keyof typeof HAND_POSES;

/** Độ dài các đoạn (đốt đầu, đốt giữa, đốt gốc, mu bàn tay, cẳng tay) ở tỉ lệ 1. */
export const SEG_LEN = [11, 14, 19, 30, 96] as const;
/** Độ dày nét các đoạn ở tỉ lệ 1. */
export const SEG_W = [9, 10, 11.5, 20, 21] as const;

export interface SideHandOpts {
  /** Tâm đầu ngón (nằm trên mặt phím → y = mặt phím − bán kính đầu ngón). */
  tip: Pt;
  pose: HandPose | PoseAngles;
  scale?: number;
  /** Màu tay áo ở cẳng tay (mặc định tím như áo bé); `null` = không vẽ tay áo. */
  sleeve?: string | null;
  /** Vẽ móng (mặc định có). */
  nail?: boolean;
  /** Tông da (ngón phía sau dùng SKIN.back). */
  skin?: string;
  /** Độ dài cẳng tay (mặc định SEG_LEN[4]). */
  forearm?: number;
}

export interface SideHand {
  svg: string;
  /** [đầu ngón, DIP, PIP, MCP, cổ tay, khuỷu] */
  pts: Pt[];
}

/** Bàn tay nhìn ngang (một ngón đại diện + mu bàn tay + cẳng tay). */
export function sideHand(o: SideHandOpts): SideHand {
  const s = o.scale ?? 1;
  const ang = typeof o.pose === 'string' ? HAND_POSES[o.pose] : o.pose;
  const lens = SEG_LEN.map((l, i) => (i === 4 && o.forearm ? o.forearm : l) * s);
  const pts = chain(o.tip, ang.map((deg, i) => ({ len: lens[i], deg })));
  const skin = o.skin ?? SKIN.base;
  const w = SEG_W.map((x) => x * s);
  const parts = [
    seg(pts[5], pts[4], w[4], skin), // cẳng tay
    seg(pts[4], pts[3], w[3], skin), // mu bàn tay
    // khớp gốc nhô lên thành "đỉnh cầu" (gờ tròn trên mu, cao hơn đường mu bàn tay)
    seg(pts[3], [pts[3][0] + 2 * s, pts[3][1] - 3.5 * s], w[2] + 4 * s, skin),
    seg(pts[3], pts[2], w[2], skin), // đốt gốc
    seg(pts[2], pts[1], w[1], skin), // đốt giữa
    seg(pts[1], pts[0], w[0], skin), // đốt đầu
  ];
  let svg = limbs(parts);
  // Tay áo: phủ nửa sau cẳng tay (mép tay áo là một viền sáng cắt ngang)
  if (o.sleeve !== null) {
    const cuff = step(pts[4], lens[4] * 0.45, ang[4]);
    const sw = w[4] + 6 * s;
    const sl = seg(pts[5], cuff, sw, o.sleeve ?? P.violet);
    svg += sl.under + sl.over;
    const back = step(cuff, 3 * s, ang[4]);
    const half = sw / 2;
    const nx = -Math.sin(rad(ang[4]));
    const ny = Math.cos(rad(ang[4]));
    svg += `<path d="M${n(back[0] + nx * half)} ${n(back[1] + ny * half)} L${n(back[0] - nx * half)} ${n(back[1] - ny * half)}" stroke="#fff" stroke-opacity=".55" stroke-width="${n(2.4 * s)}" stroke-linecap="round"/>`;
  }
  // Nếp khớp gốc (gợi "cây cầu") + nếp khớp giữa
  svg += `<path d="${crease(pts[3], pts[4], 4.5 * s)}" stroke="${SKIN.dark}" stroke-width="${n(1.6 * s)}" stroke-linecap="round" fill="none"/>`;
  svg += `<path d="${crease(pts[2], pts[3], 3 * s)}" stroke="${SKIN.dark}" stroke-width="${n(1.3 * s)}" stroke-linecap="round" fill="none"/>`;
  if (o.nail !== false) svg += nail(pts[1], pts[0], s);
  return { svg, pts };
}

/** Nếp da nhỏ cắt ngang khớp `p` (vuông góc với đoạn p→q). */
function crease(p: Pt, q: Pt, half: number): string {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  // lệch về phía mu (phía trên)
  const sgn = ny < 0 ? 1 : -1;
  const c: Pt = [p[0] + nx * half * 0.9 * sgn, p[1] + ny * half * 0.9 * sgn];
  const t: Pt = [dx / L, dy / L];
  return `M${n(c[0] - t[0] * half * 0.5)} ${n(c[1] - t[1] * half * 0.5)} L${n(c[0] + t[0] * half * 0.5)} ${n(c[1] + t[1] * half * 0.5)}`;
}

/** Móng tay ở đốt đầu, phía MU ngón (phía không chạm phím). */
export function nail(dip: Pt, tip: Pt, s = 1): string {
  const dx = tip[0] - dip[0];
  const dy = tip[1] - dip[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  // pháp tuyến hướng ra "mu" ngón = phía ngược với lòng bàn tay. Ngón đi từ trái sang phải/xuống → mu ở phía trên-phải.
  let nx = uy;
  let ny = -ux;
  if (ny > 0 || (Math.abs(ny) < 0.2 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const c: Pt = [tip[0] - ux * 3.6 * s + nx * 2.6 * s, tip[1] - uy * 3.6 * s + ny * 2.6 * s];
  const deg = (Math.atan2(uy, ux) * 180) / Math.PI;
  return `<ellipse cx="${n(c[0])}" cy="${n(c[1])}" rx="${n(3.4 * s)}" ry="${n(1.7 * s)}" transform="rotate(${n(deg)} ${n(c[0])} ${n(c[1])})" fill="${SKIN.nail}" stroke="${SKIN.dark}" stroke-width="${n(0.9 * s)}"/>`;
}

export interface SideKeysOpts {
  /** x mép trước phím trắng (phía bé ngồi) */
  x: number;
  /** y mặt phím trắng */
  y: number;
  /** chiều dài phím thấy được (sang phải) */
  len: number;
  /** Phím đang được nhấn (xuống tới đáy) */
  pressed?: boolean;
  /** Lớp CSS cho nhóm phím trắng (để làm hoạt hình nhấn) */
  keyClass?: string;
  /** Hiện nỉ đáy phím (key bed) có tô màu */
  bed?: boolean;
}

/** Phím đàn nhìn ngang: thân đàn, phím đen phía sau, phím trắng (có thể nhấn), nỉ đáy phím. */
export function sideKeys(o: SideKeysOpts): string {
  const { x, y, len } = o;
  const down = o.pressed ? 6 : 0;
  const end = x + len + 60;
  const body = `<path d="M${n(x - 4)} ${n(y + 16)} H${n(end)} V${n(y + 90)} H${n(x - 4)} Z" fill="${P.wood}" stroke="${OUTLINE}" stroke-width="1.3"/>`;
  const rail = `<path d="M${n(x - 4)} ${n(y + 30)} H${n(end)}" stroke="${P.woodDark}" stroke-width="2" opacity=".5"/>`;
  const bed = `<rect x="${n(x + 6)}" y="${n(y + 17)}" width="${n(len + 50)}" height="5" rx="2.5" fill="${o.bed ? '#e0605a' : '#c99bc3'}"/>`;
  const black = `<path d="M${n(x + len * 0.46)} ${n(y + 1)} V${n(y - 11)} Q${n(x + len * 0.46)} ${n(y - 14)} ${n(x + len * 0.46 + 4)} ${n(y - 14)} H${n(end)} V${n(y + 1)} Z" fill="${P.night}" stroke="${OUTLINE}" stroke-width="1"/>`;
  const white =
    `<g class="${o.keyClass ?? ''}"${down ? ` transform="translate(0 ${down})"` : ''}>` +
    `<path d="M${n(x)} ${n(y + 4)} Q${n(x)} ${n(y)} ${n(x + 4)} ${n(y)} H${n(end)} V${n(y + 14)} H${n(x)} Z" fill="#fff" stroke="${OUTLINE}" stroke-width="1.3"/>` +
    `<rect x="${n(x + 0.8)}" y="${n(y + 9)}" width="${n(len + 59)}" height="4.2" fill="#ebe7f7"/>` +
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
  return `<circle class="${cls}" cx="${n(p[0])}" cy="${n(p[1])}" r="${n(r)}" fill="none" stroke="${color}" stroke-width="2.6" stroke-dasharray="5 4"/>`;
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
    `<path d="M0 0 l${n(3 * s)} ${n(-3 * s)} l${n(3 * s)} ${n(3 * s)} l${n(3 * s)} ${n(-3 * s)}" transform="translate(${n(p[0] + dx * s)} ${n(p[1] + dy * s)}) rotate(${rot})" stroke="${color}" stroke-width="${n(2 * s)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return z(-14, -10, -30) + z(4, -16, 10) + z(10, 2, 60);
}

/** Nhãn chữ nhỏ trong tranh (bo nền trắng để luôn đọc được). */
export function tag(x: number, y: number, text: string, color: string, size = 11): string {
  const w = Math.max(18, text.length * size * 0.56 + 10);
  return (
    `<g transform="translate(${n(x)} ${n(y)})"><rect x="${n(-w / 2)}" y="${n(-size * 0.95)}" width="${n(w)}" height="${n(size * 1.5)}" rx="${n(size * 0.75)}" fill="#fff" stroke="${color}" stroke-width="1.4"/>` +
    `<text x="0" y="${n(size * 0.28)}" font-size="${size}" font-weight="800" font-family="Baloo 2, Nunito, sans-serif" fill="${color}" text-anchor="middle">${text}</text></g>`
  );
}

/** Nền khung tranh (bo góc; tông xanh nhạt cho "đúng", hồng nhạt cho "chưa đúng"). */
export function panelBg(w: number, h: number, tone: 'good' | 'bad' | 'plain'): string {
  const fill = tone === 'good' ? '#effbf5' : tone === 'bad' ? '#fff3f1' : '#f7f4ff';
  return `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="16" fill="${fill}"/>`;
}
