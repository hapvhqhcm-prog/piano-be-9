/**
 * (+ 2026-10-15, OWNER: "Hoạt hình kỹ thuật từng bước") HOẠT HÌNH TỪNG BƯỚC cho mỗi bài khởi động tay (technique.ts):
 * một cảnh chậm, lặp mãi, chia BƯỚC (nhãn ≤ 6 chữ) theo nhịp đếm "1 – 2 – 3 – 4" (hiện số + tiếng tích nhẹ),
 * phần đang chuyển động được tô sáng; nút 🐢 Chậm hơn / Nhanh hơn; vòng đầu có giọng đọc từng bước.
 *
 * (2026-10-18, bé + bố mẹ chê "bàn tay xấu quá" → OWNER: KHÔNG vẽ bàn tay người) Mỗi cảnh dùng CHỮ HÌNH TRỪU TƯỢNG của
 * tranh tư thế (art/diagramKit.ts): quả nặng rơi xuống phím rồi nảy lên (cầu vồng rơi); nét cổ tay đi vòng tròn trong khi
 * chấm đầu ngón đứng yên (xoay cổ tay); chấm gõ xuống, cây cầu vẫn cao (ngón gõ cửa); năm chấm nhấn lần lượt trên phím
 * (năm ngón leo thang); chấm ngón cái luồn DƯỚI cây cầu tới phím mới (ngón cái chui hầm); chấm xòe rộng → cây cầu tròn ôm
 * quả bóng → đặt lên phím (ôm quả bóng).
 *
 * - Phần THUẦN (không DOM, test trong node): mỗi bài = danh sách khung khoá (keyframe, đơn vị = phách) của các số
 *   (góc, vị trí, độ nhấn phím…) → nội suy mượt (ease) → hàm vẽ trả chuỗi SVG.
 * - Phần DOM (mountTechniqueAnim): vòng requestAnimationFrame (~30 khung/giây) vẽ lại cảnh; số đếm / nhãn bước là
 *   phần tử HTML có hiệu ứng CSS (techAnim.css).
 * - Giảm chuyển động (prefers-reduced-motion): khung TĨNH từng phách có mũi tên chỉ hướng, chạm để sang phách sau.
 *
 * Nạp muộn (chunk riêng) từ technique.ts — không làm nặng gói chính.
 */
import type { TechniqueDrill } from '../../lessons/types';
import { P } from './art/svgKit';
import {
  ARCH,
  DOT,
  GOOD,
  INK,
  archAt,
  archD,
  arrow,
  ball,
  dot,
  forearm,
  frontKeys,
  frontX,
  n,
  panelBg,
  sideKeys,
  stroke,
  type Pt,
} from './art/diagramKit';
import '../../styles/techAnim.css';

// ───────────────────────────── dữ liệu & nội suy (thuần) ─────────────────────────────

/** Mọi bài khởi động + hai cảnh bổ sung (nảy staccato, bước legato) dùng lại được ở chỗ khác. */
export type AnimId = TechniqueDrill | 'staccato' | 'legato';
export const DRILL_ANIM_IDS: readonly TechniqueDrill[] = ['arm-drop', 'wrist-circle', 'finger-tap', 'five-finger', 'thumb-under', 'hand-shape'];
export const EXTRA_ANIM_IDS: readonly AnimId[] = ['staccato', 'legato'];

/** Phần được tô sáng ở mỗi bước. */
export type Part = 'elbow' | 'wrist' | 'knuckle' | 'finger' | 'tip' | 'thumb' | 'key';

export type Ease = 'io' | 'in' | 'out' | 'lin';
export type AnimState = Readonly<Record<string, number>>;
export interface Keyframe {
  /** Thời điểm (phách, 0 ≤ at < tổng phách) */
  at: number;
  v: AnimState;
  /** Cách đi TỚI khung này từ khung trước (mặc định 'io' — chậm-nhanh-chậm) */
  ease?: Ease;
}

export interface AnimStep {
  /** Nhãn hiện trên màn (≤ 6 chữ) */
  label: string;
  /** Câu đọc to ở vòng đầu */
  say: string;
  /** Số phách của bước */
  beats: number;
  /** Phần tô sáng */
  part: Part;
}

export interface Scene {
  svg: string;
  /** Toạ độ các phần (để tô sáng / vẽ mũi tên) */
  at: Partial<Record<Part, Pt>>;
}

export interface AnimDef {
  id: AnimId;
  /** Số đếm hiện mỗi phách (độ dài = tổng phách của một vòng) */
  count: readonly string[];
  steps: readonly AnimStep[];
  keys: readonly Keyframe[];
  draw(v: AnimState, beat: number): Scene;
  /** Vệt chuyển động mờ của một phần trong khoảng phách [from, to] */
  trail?: { part: Part; from: number; to: number };
  /** Khung tĩnh (giảm chuyển động): vị trí trong phách (0..1) để vẽ; mặc định 0.92 */
  still?: number;
}

export const EASE: Record<Ease, (t: number) => number> = {
  lin: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Phách quy về [0, total) */
export function wrapBeat(beat: number, total: number): number {
  if (!Number.isFinite(beat) || total <= 0) return 0;
  const b = beat % total;
  return b < 0 ? b + total : b;
}

/**
 * Nội suy giữa các khung khoá (vòng lặp: sau khung cuối quay về khung đầu ở phách `total`).
 * Thiếu số ở một khung → dùng số của khung kia (không bao giờ NaN).
 */
export function sampleKeys(keys: readonly Keyframe[], total: number, beat: number): AnimState {
  if (!keys.length) return {};
  const b = wrapBeat(beat, total);
  let i = keys.length - 1;
  for (let k = 0; k < keys.length; k++) {
    if (keys[k].at <= b) i = k;
    else break;
  }
  // trước khung đầu → đang đi từ khung cuối (vòng trước) tới khung đầu
  const fromK = b < keys[0].at ? keys[keys.length - 1] : keys[i];
  const toK = b < keys[0].at ? keys[0] : keys[(i + 1) % keys.length];
  let span = toK.at - fromK.at;
  let pos = b - fromK.at;
  if (span <= 0) span += total;
  if (pos < 0) pos += total;
  const t = span > 0 ? EASE[toK.ease ?? 'io'](clamp01(pos / span)) : 0;
  const out: Record<string, number> = {};
  for (const name of new Set([...Object.keys(fromK.v), ...Object.keys(toK.v)])) {
    const a = fromK.v[name] ?? toK.v[name] ?? 0;
    const c = toK.v[name] ?? a;
    const val = a + (c - a) * t;
    out[name] = Number.isFinite(val) ? val : 0;
  }
  return out;
}

export interface StepInfo {
  index: number;
  step: AnimStep;
  /** Phách bắt đầu bước */
  start: number;
  /** Chỉ số phách trong vòng (0..total-1) */
  beatIndex: number;
}

export function totalBeats(def: AnimDef): number {
  return def.count.length;
}

/** Bước đang chạy ở phách `beat`. */
export function stepAt(def: AnimDef, beat: number): StepInfo {
  const total = totalBeats(def);
  const b = wrapBeat(beat, total);
  let start = 0;
  for (let i = 0; i < def.steps.length; i++) {
    const s = def.steps[i];
    if (b < start + s.beats || i === def.steps.length - 1) return { index: i, step: s, start, beatIndex: Math.min(total - 1, Math.floor(b)) };
    start += s.beats;
  }
  return { index: 0, step: def.steps[0], start: 0, beatIndex: 0 };
}

// ───────────────────────────── vẽ chung ─────────────────────────────

export const VIEW_W = 240;
export const VIEW_H = 170;
const HL = P.orange;

/** Đỉnh tô sáng (vầng sáng sau + vòng nét đứt trên), nhịp theo phách. */
function halo(p: Pt, pulse: number, r = 17): { under: string; over: string } {
  return {
    under: `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${n(r + 3 * pulse)}" fill="${P.sun}" opacity="${n(0.22 + 0.3 * pulse)}"/>`,
    over: `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${n(r + 3 * pulse)}" fill="none" stroke="${HL}" stroke-width="2.6" stroke-dasharray="5 4" opacity="${n(0.55 + 0.45 * pulse)}"/>`,
  };
}

/** Bóng chữ nhỏ (bo nền trắng). */
function chip(x: number, y: number, text: string, color: string, size = 11): string {
  const w = Math.max(18, text.length * size * 0.58 + 10);
  return (
    `<g transform="translate(${n(x)} ${n(y)})"><rect x="${n(-w / 2)}" y="${n(-size * 0.95)}" width="${n(w)}" height="${n(size * 1.5)}" rx="${n(size * 0.75)}" fill="#fff" stroke="${color}" stroke-width="1.6"/>` +
    `<text x="0" y="${n(size * 0.28)}" font-size="${size}" font-weight="800" font-family="Baloo 2, Nunito, sans-serif" fill="${color}" text-anchor="middle">${text}</text></g>`
  );
}

/** Tham số t của archD có toạ độ x cho trước (giải số — x(t) đơn điệu). */
function tAtX(a: Pt, b: Pt, x: number): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 22; k++) {
    const m = (lo + hi) / 2;
    if ((archAt(a, b, 1, m)[0] - x) * Math.sign(b[0] - a[0] || 1) < 0) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Cây cầu (nét cong a→b cao `lift`) + "cột cầu" xuống từng chấm `tips`. Trả về svg + đỉnh cầu. */
function bridge(a: Pt, b: Pt, lift: number, tips: readonly Pt[], w = 9): { svg: string; top: Pt } {
  let s = '';
  for (const t of tips) {
    const p = archAt(a, b, lift, tAtX(a, b, t[0]));
    s += stroke(`M${n(p[0])} ${n(p[1])} L${n(t[0])} ${n(t[1])}`, ARCH, 4.5);
  }
  return { svg: s + stroke(archD(a, b, lift), ARCH, w), top: archAt(a, b, lift, 0.5) };
}

/** Tên nốt in trên mặt phím (nhìn thẳng) khi phím sáng. */
function keyName(x: number, y: number, name: string, op: number): string {
  return op > 0.05
    ? `<text x="${n(x)}" y="${n(y)}" font-size="11" font-weight="900" font-family="Baloo 2, Nunito, sans-serif" fill="${P.ink}" text-anchor="middle" opacity="${n(op)}">${name}</text>`
    : '';
}
const NOTE_VI = ['Đô', 'Rê', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Đô'];

// ───────────────────────────── 1. Cầu vồng rơi (arm-drop) ─────────────────────────────
// Nhìn ngang: khuỷu (chốt) bên trái, khối cẳng tay xoay quanh khuỷu; cuối khối là cổ tay, nét bàn tay nối xuống QUẢ NẶNG.
// Nhấc cẳng tay (quả nặng buông thõng dưới cổ tay) → thả rơi, quả nặng đáp xuống phím → phím chìm tới đáy (nỉ đỏ sáng) →
// cổ tay nổi lên, quả nặng nảy nhẹ lên.
const AD = { kx: 132, ky: 128, elbow: [26, 98] as Pt, fore: 92, r: 15 } as const;
const AD_KEY: Pt = [176, AD.ky - AD.r - 1];
const adWrist = (fa: number): Pt => [AD.elbow[0] + AD.fore * Math.cos((fa * Math.PI) / 180), AD.elbow[1] + AD.fore * Math.sin((fa * Math.PI) / 180)];
const AD_UP_W = adWrist(-30);
const AD_REST = { fa: 0, bx: AD_KEY[0], by: AD_KEY[1], press: 0 };
const AD_UP = { fa: -30, bx: AD_UP_W[0] + 14, by: AD_UP_W[1] + 30, press: 0 };
const AD_BED = { fa: 3, bx: AD_KEY[0], by: AD_KEY[1] + 6, press: 1 };
const AD_FLOAT = { fa: -9, bx: AD_KEY[0] - 2, by: AD_KEY[1] - 14, press: 0 };

const armDrop: AnimDef = {
  id: 'arm-drop',
  count: ['1', '2', '3', '4'],
  steps: [
    { label: 'Nhấc cẳng tay từ khuỷu', say: 'Một: nhấc cẳng tay lên từ khuỷu, bàn tay buông mềm.', beats: 1, part: 'wrist' },
    { label: 'Thả rơi, bàn tay cong', say: 'Hai: thả rơi nhẹ xuống phím, bàn tay cong.', beats: 1, part: 'tip' },
    { label: 'Chạm đáy phím, tay mềm', say: 'Ba: chạm tới đáy phím, cổ tay mềm.', beats: 1, part: 'key' },
    { label: 'Cổ tay nổi, nhấc lên', say: 'Bốn: cổ tay nổi lên, nhấc tay ra.', beats: 1, part: 'wrist' },
  ],
  keys: [
    { at: 0, v: AD_REST },
    { at: 0.85, v: AD_UP },
    { at: 1.05, v: AD_UP },
    { at: 1.5, v: { ...AD_REST, press: 0.3 }, ease: 'in' },
    { at: 1.75, v: AD_BED, ease: 'out' },
    { at: 2.9, v: AD_BED },
    { at: 3.55, v: AD_FLOAT },
  ],
  trail: { part: 'tip', from: 0.85, to: 1.5 },
  draw(v) {
    const press = clamp01(v.press);
    const wr = adWrist(v.fa ?? 0);
    const b: Pt = [v.bx ?? AD_KEY[0], v.by ?? AD_KEY[1]];
    const keyPt: Pt = [AD_KEY[0] + 14, AD.ky + 19];
    const bedGlow = press > 0.5 ? `<rect x="${AD.kx + 6}" y="${AD.ky + 15.5}" width="104" height="8" rx="4" fill="#e0605a" opacity="${n((press - 0.5) * 1.6)}"/>` : '';
    const hand = stroke(`M${n(wr[0])} ${n(wr[1])} Q${n((wr[0] + b[0]) / 2 + 6)} ${n(Math.min(wr[1], b[1]) - 16)} ${n(b[0])} ${n(b[1] - AD.r + 2)}`, ARCH, 8);
    const elbowDot = `<circle cx="${n(AD.elbow[0])}" cy="${n(AD.elbow[1])}" r="7" fill="${P.violetLight}" stroke="${INK}" stroke-width="3"/>`;
    return {
      svg: sideKeys({ x: AD.kx, y: AD.ky, len: 50, press, bed: press > 0.5 }) + bedGlow + forearm(wr, AD.fore, 22, v.fa ?? 0) + elbowDot + hand + ball(b, AD.r),
      at: { tip: b, wrist: wr, knuckle: wr, elbow: AD.elbow, key: keyPt },
    };
  },
};

// ───────────────────────────── 2. Xoay cổ tay (wrist-circle) ─────────────────────────────
// Nhìn ngang: chấm đầu ngón ĐỨNG YÊN trên phím (ghim xanh); cổ tay (đầu khối cẳng tay) đi vòng tròn: lên → tới trước →
// xuống → lùi; nét bàn tay nối cổ tay với đầu ngón co giãn theo.
const WC = { kx: 136, ky: 128, elbow: [12, 104] as Pt, r: 14 } as const;
const WC_TIP: Pt = [176, WC.ky - 11];
const WC_CENTER: Pt = [112, 90];

/** 16 khung khoá quanh vòng tròn (bắt đầu ở ĐỈNH, theo chiều kim đồng hồ: lên → trước → xuống → sau). */
const WC_KEYS: Keyframe[] = Array.from({ length: 16 }, (_, k) => {
  const th = (k / 16) * Math.PI * 2;
  return { at: k / 4, v: { wx: WC_CENTER[0] + WC.r * Math.sin(th), wy: WC_CENTER[1] - WC.r * Math.cos(th) }, ease: 'lin' as const };
});

const wristCircle: AnimDef = {
  id: 'wrist-circle',
  count: ['1', '2', '3', '4'],
  steps: [
    { label: 'Cổ tay nhô lên', say: 'Một: cổ tay nhô lên.', beats: 1, part: 'wrist' },
    { label: 'Cổ tay đẩy tới trước', say: 'Hai: đẩy cổ tay tới trước.', beats: 1, part: 'wrist' },
    { label: 'Cổ tay hạ xuống thấp', say: 'Ba: hạ cổ tay xuống thấp.', beats: 1, part: 'wrist' },
    { label: 'Cổ tay lùi về sau', say: 'Bốn: lùi cổ tay về sau. Đầu ngón đứng yên nhé.', beats: 1, part: 'wrist' },
  ],
  keys: WC_KEYS,
  trail: { part: 'wrist', from: 0, to: 4 },
  draw(v) {
    const wr: Pt = [v.wx ?? WC_CENTER[0], v.wy ?? WC_CENTER[1]];
    const deg = (Math.atan2(wr[1] - WC.elbow[1], wr[0] - WC.elbow[0]) * 180) / Math.PI;
    const len = Math.hypot(wr[0] - WC.elbow[0], wr[1] - WC.elbow[1]);
    const hand = stroke(`M${n(wr[0])} ${n(wr[1])} C${n(wr[0] + 30)} ${n(wr[1] - 16)} ${n(WC_TIP[0] - 4)} ${n(WC_TIP[1] - 44)} ${n(WC_TIP[0])} ${n(WC_TIP[1] - 8)}`, ARCH, 9);
    const pin = `<circle cx="${n(WC_TIP[0])}" cy="${WC.ky}" r="4" fill="${GOOD}" stroke="#fff" stroke-width="1.6"/>`;
    return {
      svg: sideKeys({ x: WC.kx, y: WC.ky, len: 50 }) + forearm(wr, len, 22, deg) + hand + dot(WC_TIP, '', { r: 10 }) + pin + chip(196, 158, 'ngón đứng yên', GOOD, 10),
      at: { tip: WC_TIP, wrist: wr, knuckle: wr, elbow: WC.elbow },
    };
  },
};

// ───────────────────────────── 3. Ngón gõ cửa (finger-tap) ─────────────────────────────
// Nhìn thẳng trên nắp đàn gỗ: cây cầu giữ CAO, MỘT chấm nhấc lên rồi gõ xuống (vạch "cốc cốc"); các chấm khác nằm yên.
const FT = { lidY: 118, x0: 48, gap: 36, r: 11 } as const;
const FT_X = (i: number) => FT.x0 + i * FT.gap;
const FT_REST_Y = FT.lidY - FT.r - 1.5;

function tapKeys(beats: number): Keyframe[] {
  const ks: Keyframe[] = [];
  for (let b = 0; b < beats; b++) {
    ks.push({ at: b, v: { lift: 0, hit: 0 } });
    ks.push({ at: b + 0.45, v: { lift: 1, hit: 0 }, ease: 'io' });
    ks.push({ at: b + 0.56, v: { lift: 0, hit: 1 }, ease: 'in' });
    ks.push({ at: b + 0.8, v: { lift: 0, hit: 0 }, ease: 'out' });
  }
  return ks;
}

const fingerTap: AnimDef = {
  id: 'finger-tap',
  count: ['1', '2', '3', '4', '5'],
  steps: [1, 2, 3, 4, 5].map((k) => ({
    label: `Ngón ${k}: nhấc cao, gõ xuống`,
    say: k === 1 ? 'Ngón một nhấc lên từ khớp gốc, rồi gõ xuống.' : `Ngón ${['', 'một', 'hai', 'ba', 'bốn', 'năm'][k]}.`,
    beats: 1,
    part: 'finger' as const,
  })),
  keys: tapKeys(5),
  still: 0.45,
  draw(v, beat) {
    const k = Math.min(5, Math.floor(wrapBeat(beat, 5)) + 1);
    const L = clamp01(v.lift) * 30;
    const tips: Pt[] = [0, 1, 2, 3, 4].map((i) => [FT_X(i), FT_REST_Y - (i === k - 1 ? L : 0)]);
    const a: Pt = [FT_X(0), 82];
    const b: Pt = [FT_X(4), 82];
    const br = bridge(a, b, 44, tips);
    const lid =
      `<rect x="16" y="${FT.lidY}" width="208" height="16" rx="5" fill="${P.wood}" stroke="${INK}" stroke-width="2.4"/>` +
      `<rect x="16" y="${FT.lidY + 16}" width="208" height="22" rx="4" fill="${P.woodDark}" opacity=".55"/>`;
    const hit = clamp01(v.hit);
    const hx = FT_X(k - 1);
    const knock =
      hit > 0.05
        ? `<g stroke="${P.orange}" stroke-width="2.6" stroke-linecap="round" opacity="${n(hit)}">` +
          `<path d="M${n(hx + 14)} ${n(FT.lidY - 4)} l8 -6"/><path d="M${n(hx + 15)} ${n(FT.lidY + 2)} l10 0"/><path d="M${n(hx - 14)} ${n(FT.lidY - 4)} l-8 -6"/></g>`
        : '';
    const dots = tips.map((p, i) => dot(p, i + 1, i === k - 1 ? {} : { fill: '#5d9be0' })).join('');
    return {
      svg: lid + br.svg + dots + knock + chip(br.top[0], 22, 'cầu cao', GOOD, 11),
      at: { tip: tips[k - 1], finger: tips[k - 1], knuckle: br.top },
    };
  },
};

// ───────────────────────────── cảnh nhìn thẳng: 5 chấm trên phím (five-finger, legato) ─────────────────────────────
const WK = { x0: 21, kw: 28.3, y: 118, h: 40, r: 10 } as const;
const wkX = (i: number) => frontX(WK.x0, WK.kw, i);
const WK_Y = WK.y - WK.r - 1.5;

/** Khung khoá "từng ngón nhấn theo dãy" (legato: ngón sau xuống khi ngón trước vừa nhấc). */
function walkKeys(seq: readonly number[]): Keyframe[] {
  const ks: Keyframe[] = [];
  const st = (f: number, lean: number) => {
    const v: Record<string, number> = { lean };
    for (let k = 1; k <= 5; k++) v[`f${k}`] = k === f ? 1 : 0;
    return v;
  };
  seq.forEach((f, b) => {
    const lean = (f - 3) * 2.5;
    ks.push({ at: b + 0.18, v: st(f, lean), ease: 'io' });
    ks.push({ at: b + 0.86, v: st(f, lean) });
  });
  return ks;
}

const FIVE_SEQ = [1, 2, 3, 4, 5, 4, 3, 2] as const;

function walkDraw(seq: readonly number[], keyCount: number) {
  return (v: AnimState, beat: number): Scene => {
    const press = [1, 2, 3, 4, 5].map((k) => clamp01(v[`f${k}`] ?? 0));
    const lean = v.lean ?? 0;
    const tips: Pt[] = press.map((p, i) => [wkX(i), WK_Y + p * 5]);
    const active = seq[Math.floor(wrapBeat(beat, seq.length))] ?? 1;
    const a: Pt = [wkX(0) + lean, 80];
    const b: Pt = [wkX(4) + lean, 80];
    const br = bridge(a, b, 40, tips);
    const keys = frontKeys(WK.x0, WK.y, keyCount, WK.kw, WK.h, { press: (i) => (i < 5 ? press[i] : 0), glow: (i) => (i < 5 ? press[i] : 0) });
    const names = press.map((p, i) => keyName(wkX(i), WK.y + 26 + p * 5, NOTE_VI[i], p)).join('');
    const tipA = tips[active - 1];
    // "sức nặng" dồn vào ngón đang nhấn: bóng tím mờ dưới chấm
    const weight = `<ellipse cx="${n(tipA[0])}" cy="${n(WK.y + 2)}" rx="13" ry="4" fill="${P.violet}" opacity="${n(0.15 + 0.3 * press[active - 1])}"/>`;
    const dots = tips.map((p, i) => dot(p, i + 1, { r: WK.r, fill: i === active - 1 ? DOT : '#5d9be0' })).join('');
    return {
      svg: keys + names + weight + br.svg + dots,
      at: { finger: tipA, tip: tipA, thumb: tips[0], knuckle: br.top },
    };
  };
}

// ───────────────────────────── 4. Năm ngón leo thang (five-finger) ─────────────────────────────
const fiveFinger: AnimDef = {
  id: 'five-finger',
  count: FIVE_SEQ.map(String),
  steps: [
    { label: 'Leo lên tới Sol', say: 'Leo lên: Đô, Rê, Mi, Fa, Sol. Sức nặng dồn sang từng ngón.', beats: 5, part: 'finger' },
    { label: 'Leo xuống về Đô', say: 'Leo xuống: Fa, Mi, Rê, rồi về Đô.', beats: 3, part: 'finger' },
  ],
  keys: walkKeys(FIVE_SEQ),
  draw: walkDraw(FIVE_SEQ, 7),
};

// ───────────────────────────── 5. Ngón cái chui hầm (thumb-under) ─────────────────────────────
// Nhìn thẳng: chấm 3 giữ Mi → chấm ngón cái đi DƯỚI cây cầu (vẽ khuất sau cột cầu) tới Fa; chấm 4, 5 nhấc nhẹ nhường chỗ →
// chạm Fa, cả cây cầu (chấm 2–5) dời theo → về chỗ cũ.
const TU = { x0: 12, kw: 27, y: 120, h: 38, r: 9.5 } as const;
const tuX = (i: number) => frontX(TU.x0, TU.kw, i);
const TU_Y = TU.y - TU.r - 1.5;
const TU_SHIFT = 3 * TU.kw;
const thumbUnder: AnimDef = {
  id: 'thumb-under',
  count: ['1', '2', '3', '4'],
  steps: [
    { label: 'Ngón 3 giữ phím Mi', say: 'Một: ngón ba giữ phím Mi.', beats: 1, part: 'finger' },
    { label: 'Ngón cái chui dưới tay', say: 'Hai: ngón cái chui nhẹ dưới lòng bàn tay.', beats: 1, part: 'thumb' },
    { label: 'Chạm Fa, tay dời theo', say: 'Ba: ngón cái chạm phím Fa, cả bàn tay dời theo.', beats: 1, part: 'thumb' },
    { label: 'Nhẹ nhàng về chỗ cũ', say: 'Bốn: nhẹ nhàng về chỗ cũ.', beats: 1, part: 'thumb' },
  ],
  keys: [
    { at: 0, v: { hx: 0, tx: tuX(0), ty: TU_Y, under: 0, f3: 0, f1: 0, up: 0 } },
    { at: 0.35, v: { hx: 0, tx: tuX(0), ty: TU_Y, under: 0, f3: 1, f1: 0, up: 0 } },
    { at: 1.05, v: { hx: 0, tx: tuX(0), ty: TU_Y, under: 0, f3: 1, f1: 0, up: 0 } },
    { at: 1.5, v: { hx: 0, tx: tuX(1.6), ty: TU_Y - 22, under: 1, f3: 1, f1: 0, up: 1 } },
    { at: 1.9, v: { hx: 0, tx: tuX(3), ty: TU_Y - 4, under: 1, f3: 1, f1: 0, up: 1 } },
    { at: 2.25, v: { hx: 0, tx: tuX(3), ty: TU_Y, under: 1, f3: 0, f1: 1, up: 1 } },
    { at: 2.9, v: { hx: TU_SHIFT, tx: tuX(3), ty: TU_Y, under: 0, f3: 0, f1: 1, up: 0 } },
    { at: 3.15, v: { hx: TU_SHIFT, tx: tuX(3), ty: TU_Y, under: 0, f3: 0, f1: 1, up: 0 } },
    { at: 3.9, v: { hx: 0, tx: tuX(0), ty: TU_Y, under: 0, f3: 0, f1: 0, up: 0 } },
  ],
  draw(v) {
    const hx = v.hx ?? 0;
    const f1 = clamp01(v.f1);
    const f3 = clamp01(v.f3);
    const up = clamp01(v.up);
    const under = clamp01(v.under);
    // chấm 2–5 (theo cây cầu), chấm 4–5 nhấc nhẹ khi ngón cái chui qua
    const tips: Pt[] = [1, 2, 3, 4].map((i) => [tuX(i) + hx, TU_Y + (i === 2 ? f3 * 4 : 0) - (i >= 3 ? up * 16 : 0)]);
    const th: Pt = [v.tx ?? tuX(0), (v.ty ?? TU_Y) + f1 * 4];
    const a: Pt = [tuX(1) + hx, 84];
    const b: Pt = [tuX(4) + hx, 84];
    const br = bridge(a, b, 34, tips, 8);
    const thumb = stroke(`M${n(a[0])} ${n(a[1])} Q${n(Math.min(a[0], th[0]) - 6)} ${n(th[1] - 4)} ${n(th[0])} ${n(th[1])}`, ARCH, 4.5) + dot(th, 1, { r: TU.r });
    const keyIdx = (x: number) => Math.round((x - TU.x0 - TU.kw / 2) / TU.kw);
    const glowAt = (i: number) => (i === keyIdx(th[0]) ? f1 : 0) + (i === 2 + Math.round(hx / TU.kw) ? f3 : 0);
    const keys = frontKeys(TU.x0, TU.y, 8, TU.kw, TU.h, { glow: glowAt, press: glowAt });
    const tunnel = `<path d="M${n(tuX(0))} ${n(TU_Y + 6)} Q${n(tuX(1.5))} ${n(TU_Y - 34)} ${n(tuX(3))} ${n(TU_Y + 6)}" stroke="${P.violet}" stroke-width="2.6" stroke-dasharray="5 5" fill="none" stroke-linecap="round" opacity="${n(0.25 + 0.5 * under)}"/>`;
    const dots = tips.map((p, i) => `<g opacity="${n(i >= 2 ? 1 - up * 0.45 : 1)}">${dot(p, i + 2, { r: TU.r, fill: i === 1 ? DOT : '#5d9be0' })}</g>`).join('');
    // ngón cái đang chui: vẽ TRƯỚC cây cầu (nằm khuất dưới); bình thường vẽ sau
    const svg = keys + tunnel + (under > 0.5 ? thumb + br.svg + dots : br.svg + dots + thumb) + keyName(tuX(3), TU.y + 26, 'Fa', Math.max(0.35 * under, f1));
    return {
      svg,
      at: { thumb: th, finger: tips[1], key: [tuX(3), TU.y + 18], knuckle: br.top },
    };
  },
};

// ───────────────────────────── 6. Ôm quả bóng (hand-shape) ─────────────────────────────
// Nhìn thẳng: năm chấm XÒE rộng trên cao, cây cầu phẳng → khum tròn ôm quả bóng (chấm gom lại) → bóng lăn đi, cầu vẫn tròn →
// đặt cả dáng tròn xuống phím (chấm ngồi trên phím).
const HS = { x0: 30, kw: 36, y: 124, h: 34, r: 11 } as const;
const HS_SIT = HS.y - HS.r - 1.5;
const handShape: AnimDef = {
  id: 'hand-shape',
  count: ['1', '2', '3', '4'],
  steps: [
    { label: 'Xòe tay, thả lỏng', say: 'Một: xòe tay ra, thả lỏng.', beats: 1, part: 'finger' },
    { label: 'Khum tròn ôm quả bóng', say: 'Hai: khum tay tròn ôm quả bóng.', beats: 1, part: 'knuckle' },
    { label: 'Bóng lăn đi, giữ dáng', say: 'Ba: bóng lăn đi, tay vẫn giữ dáng tròn.', beats: 1, part: 'knuckle' },
    { label: 'Tay tròn đặt trên phím', say: 'Bốn: bàn tay tròn đặt trên phím.', beats: 1, part: 'tip' },
  ],
  keys: [
    { at: 0, v: { sp: 1.45, lift: 6, yo: 72, ball: 0, bx: 0 } },
    { at: 0.7, v: { sp: 1.45, lift: 6, yo: 72, ball: 1, bx: 0 } },
    { at: 1.75, v: { sp: 1, lift: 50, yo: 98, ball: 1, bx: 0 } },
    { at: 2.15, v: { sp: 1, lift: 50, yo: 98, ball: 1, bx: 0 } },
    { at: 2.95, v: { sp: 1, lift: 50, yo: 98, ball: 0, bx: -64 } },
    { at: 3.6, v: { sp: 1, lift: 50, yo: HS_SIT, ball: 0, bx: -64 } },
  ],
  draw(v) {
    const sp = v.sp ?? 1;
    const yo = v.yo ?? HS_SIT;
    const lift = v.lift ?? 50;
    const tips: Pt[] = [0, 1, 2, 3, 4].map((i) => [120 + (i - 2) * HS.kw * sp, yo]);
    const a: Pt = [tips[0][0], yo - 18];
    const b: Pt = [tips[4][0], yo - 18];
    const br = bridge(a, b, lift, tips);
    const op = clamp01(v.ball);
    const bc: Pt = [120 + (v.bx ?? 0), yo - 18 - lift * 0.42];
    const rot = ((v.bx ?? 0) / 16) * (180 / Math.PI);
    const theBall = op > 0.02 ? `<g opacity="${n(op)}" transform="rotate(${n(rot)} ${n(bc[0])} ${n(bc[1])})">${ball(bc, 16)}</g>` : '';
    return {
      svg: frontKeys(HS.x0, HS.y, 5, HS.kw, HS.h) + theBall + br.svg + tips.map((p, i) => dot(p, i + 1, { r: HS.r })).join(''),
      at: { tip: tips[2], finger: tips[4], knuckle: br.top },
    };
  },
};

// ───────────────────────────── + Nảy staccato ─────────────────────────────
// Nhìn thẳng: chấm chờ trên phím → chạm phím thật nhanh → BẬT lên cao như quả bóng → lơ lửng.
const SC = { x0: 60, kw: 40, y: 124, h: 34, r: 12 } as const;
const SC_X = frontX(SC.x0, SC.kw, 1);
const SC_SIT = SC.y - SC.r - 1.5;
const staccato: AnimDef = {
  id: 'staccato',
  count: ['1', '2', '3', '4'],
  steps: [
    { label: 'Tay nhẹ, chờ trên phím', say: 'Một: tay nhẹ, chờ trên phím.', beats: 1, part: 'tip' },
    { label: 'Chạm phím thật nhanh', say: 'Hai: chạm phím thật nhanh.', beats: 1, part: 'tip' },
    { label: 'Cổ tay nảy bật lên', say: 'Ba: cổ tay nảy bật lên, như quả bóng.', beats: 1, part: 'wrist' },
    { label: 'Lơ lửng, nghỉ chút', say: 'Bốn: lơ lửng, nghỉ một chút.', beats: 1, part: 'wrist' },
  ],
  keys: [
    { at: 0, v: { up: 24, press: 0 } },
    { at: 1.0, v: { up: 24, press: 0 } },
    { at: 1.22, v: { up: 0, press: 1 }, ease: 'in' },
    { at: 1.5, v: { up: 0, press: 1 } },
    { at: 2.3, v: { up: 66, press: 0 }, ease: 'out' },
    { at: 3.3, v: { up: 66, press: 0 } },
  ],
  draw(v) {
    const press = clamp01(v.press);
    const p: Pt = [SC_X, SC_SIT - (v.up ?? 0) + press * 5];
    const trail = `<path d="M${n(SC_X)} ${n(SC_SIT - 6)} V${n(Math.min(p[1] + 16, SC_SIT - 6))}" stroke="${P.violetLight}" stroke-width="3" stroke-dasharray="3 6" stroke-linecap="round"/>`;
    return {
      svg: frontKeys(SC.x0, SC.y, 3, SC.kw, SC.h, { blacks: [0, 1], press: (i) => (i === 1 ? press : 0), glow: (i) => (i === 1 ? press : 0) }) + trail + dot(p, 3, { r: SC.r }),
      at: { tip: p, wrist: p, key: [SC_X, SC.y + 16] },
    };
  },
};

// ───────────────────────────── + Bước legato ─────────────────────────────
const LEGATO_SEQ = [1, 2, 3, 4] as const;
const legato: AnimDef = {
  id: 'legato',
  count: ['1', '2', '3', '4'],
  steps: LEGATO_SEQ.map((f, b) => ({
    label: b === 0 ? 'Ngón 1 nhấn, giữ phím' : `Ngón ${f} xuống, ngón ${LEGATO_SEQ[b - 1]} nhấc`,
    say: b === 0 ? 'Ngón một nhấn, giữ phím.' : `Ngón ${['', 'một', 'hai', 'ba', 'bốn'][f]} xuống, ngón trước nhấc lên.`,
    beats: 1,
    part: 'finger' as const,
  })),
  keys: walkKeys(LEGATO_SEQ),
  draw: walkDraw(LEGATO_SEQ, 7),
};

export const TECH_ANIMS: Record<AnimId, AnimDef> = {
  'arm-drop': armDrop,
  'wrist-circle': wristCircle,
  'finger-tap': fingerTap,
  'five-finger': fiveFinger,
  'thumb-under': thumbUnder,
  'hand-shape': handShape,
  staccato,
  legato,
};



const trailCache = new Map<AnimId, string>();
function trailPath(def: AnimDef): string {
  const t = def.trail;
  if (!t) return '';
  const hit = trailCache.get(def.id);
  if (hit !== undefined) return hit;
  const pts: Pt[] = [];
  const N = 48;
  for (let k = 0; k <= N; k++) {
    const b = t.from + ((t.to - t.from) * k) / N;
    const p = def.draw(sampleKeys(def.keys, totalBeats(def), b), b).at[t.part];
    if (p) pts.push(p);
  }
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${n(p[0])} ${n(p[1])}`).join(' ');
  const svg = d ? `<path d="${d}" stroke="${P.violet}" stroke-width="2.6" stroke-dasharray="4 6" fill="none" stroke-linecap="round" opacity=".5"/>` : '';
  trailCache.set(def.id, svg);
  return svg;
}

export interface FrameOpts {
  /** Khung tĩnh (giảm chuyển động): thêm mũi tên từ đầu phách → vị trí vẽ */
  still?: boolean;
}

/** Nội dung SVG của một khung ở phách `beat` (không gồm thẻ <svg>). */
export function frameInner(id: AnimId, beat: number, opts: FrameOpts = {}): string {
  const def = TECH_ANIMS[id];
  const total = totalBeats(def);
  const b = wrapBeat(beat, total);
  const st = stepAt(def, b);
  const sc = def.draw(sampleKeys(def.keys, total, b), b);
  const frac = b - Math.floor(b);
  const pulse = opts.still ? 1 : 0.5 + 0.5 * Math.cos(frac * Math.PI * 2);
  const p = sc.at[st.step.part];
  const hl = p ? halo(p, pulse) : { under: '', over: '' };
  let arrows = '';
  if (opts.still && p) {
    const b0 = Math.floor(b) + 0.02;
    const p0 = def.draw(sampleKeys(def.keys, total, b0), b0).at[st.step.part];
    if (p0 && Math.hypot(p[0] - p0[0], p[1] - p0[1]) > 7) {
      // mũi tên lệch ra ngoài một chút để không đè lên bàn tay
      arrows = arrow(p0, p, HL, 3.4, 'ta-arrow');
    }
  }
  return panelBg(VIEW_W, VIEW_H, 'plain') + trailPath(def) + hl.under + sc.svg + hl.over + arrows;
}

/** Phách để vẽ khung TĨNH thứ `k` (giảm chuyển động). */
export function stillBeat(id: AnimId, k: number): number {
  const def = TECH_ANIMS[id];
  const total = totalBeats(def);
  return Math.floor(wrapBeat(k, total)) + (def.still ?? 0.92);
}

/** Một khung SVG đầy đủ (test / ảnh tĩnh). */
export function frameSvg(id: AnimId, beat: number, opts: FrameOpts = {}): string {
  const st = stepAt(TECH_ANIMS[id], beat);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img" aria-label="${st.step.label}">${frameInner(id, beat, opts)}</svg>`;
}

// ───────────────────────────── DOM ─────────────────────────────

/** Mức tốc độ: ms mỗi phách (chậm → nhanh). */
export const SPEED_MS = [1900, 1500, 1200, 950, 780] as const;
const SPEED_KEY = 'piano-be-9-tech-anim-speed';
const DEFAULT_SPEED = 1;
let speedMem: number | null = null;
function loadSpeed(): number {
  if (speedMem !== null) return speedMem;
  try {
    const v = Number(globalThis.localStorage?.getItem(SPEED_KEY));
    if (Number.isInteger(v) && v >= 0 && v < SPEED_MS.length && globalThis.localStorage?.getItem(SPEED_KEY) !== null) return (speedMem = v);
  } catch {
    /* bỏ qua */
  }
  return (speedMem = DEFAULT_SPEED);
}
function saveSpeed(v: number): void {
  speedMem = v;
  try {
    globalThis.localStorage?.setItem(SPEED_KEY, String(v));
  } catch {
    /* bỏ qua */
  }
}

export interface TechniqueAnimHandle {
  el: HTMLElement;
  /** Gỡ vòng vẽ + hẹn giờ */
  stop(): void;
  /**
   * Vòng ĐẦU có giọng đọc: quay về bước 1, đọc từng bước (chờ đọc xong mới sang bước sau); sau đó bật tiếng tích.
   * `say` phải luôn resolve (voice.speak đúng như vậy).
   */
  narrate(say: (text: string) => Promise<void>): void;
  /** Ngừng đọc (vd bé bấm "Con làm nào") — vẫn chạy tiếp + tiếng tích */
  quiet(): void;
  /** Bật/tắt tiếng tích mỗi phách (vd tắt khi thầy đang làm mẫu trên bàn phím) */
  setSound(on: boolean): void;
}

export interface MountOpts {
  /** Tiếng tích nhẹ mỗi phách (accent = phách 1) */
  click?: (accent: boolean) => void;
  /** Ép chế độ giảm chuyển động (mặc định: theo prefers-reduced-motion) */
  reduced?: boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Gắn hoạt hình từng bước của bài `id`. */
export function mountTechniqueAnim(id: AnimId, opts: MountOpts = {}): TechniqueAnimHandle {
  const def = TECH_ANIMS[id];
  const total = totalBeats(def);
  const reduced =
    opts.reduced ?? (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const root = el('div', `ta-wrap${reduced ? ' ta-still' : ''}`);
  root.dataset.anim = id;
  const stepNo = el('span', 'ta-stepno', '1');
  const stepText = el('span', 'ta-steptext', def.steps[0].label);
  const stepRow = el('div', 'ta-step');
  stepRow.setAttribute('aria-live', 'polite');
  stepRow.append(stepNo, stepText);
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
  svg.setAttribute('class', 'ta-svg');
  svg.setAttribute('role', 'img');
  const countRow = el('div', 'ta-count');
  const dots = def.count.map((c) => {
    const d = el('i', 'ta-dot', c);
    countRow.append(d);
    return d;
  });
  const foot = el('div', 'ta-foot');
  foot.append(countRow);

  let speed = loadSpeed();
  let beat = 0;
  let lastBeatIdx = -1;
  let lastStep = -1;
  let raf = 0;
  let last = 0;
  let lastDraw = 0;
  let alive = true;
  let sound = false;
  // đọc vòng đầu
  let narrating = false;
  let speechPending = false;
  let narrateSay: ((t: string) => Promise<void>) | null = null;
  let narrateGen = 0;

  const slower = el('button', 'ta-speed-btn', '🐢 Chậm hơn');
  const faster = el('button', 'ta-speed-btn', 'Nhanh hơn 🐇');
  const nextBtn = el('button', 'ta-speed-btn ta-next', 'Bước tiếp ▶');
  for (const b of [slower, faster, nextBtn]) b.type = 'button';
  const syncSpeed = () => {
    slower.disabled = speed <= 0;
    faster.disabled = speed >= SPEED_MS.length - 1;
    root.dataset.speed = String(speed);
  };
  slower.addEventListener('click', () => {
    speed = Math.max(0, speed - 1);
    saveSpeed(speed);
    syncSpeed();
  });
  faster.addEventListener('click', () => {
    speed = Math.min(SPEED_MS.length - 1, speed + 1);
    saveSpeed(speed);
    syncSpeed();
  });
  if (reduced) foot.append(nextBtn);
  else foot.append(slower, faster);
  syncSpeed();
  root.append(stepRow, svg, foot);

  function paintUi(b: number): void {
    const st = stepAt(def, b);
    if (st.beatIndex !== lastBeatIdx) {
      dots.forEach((d, k) => {
        d.classList.toggle('on', k === st.beatIndex);
        d.classList.toggle('past', k < st.beatIndex);
      });
      lastBeatIdx = st.beatIndex;
    }
    if (st.index !== lastStep) {
      lastStep = st.index;
      stepNo.textContent = String(st.index + 1);
      stepText.textContent = st.step.label;
      svg.setAttribute('aria-label', st.step.label);
      stepRow.classList.remove('ta-pop');
      void stepRow.offsetWidth; // chạy lại hiệu ứng
      stepRow.classList.add('ta-pop');
    }
  }

  function draw(b: number, still = false): void {
    // svg lồng nhau: cắt đúng khung tranh (khung ngoài có thể rộng hơn tỉ lệ tranh → tay áo không lòi ra ngoài nền)
    svg.innerHTML = `<svg width="${VIEW_W}" height="${VIEW_H}" overflow="hidden">${frameInner(id, b, { still })}</svg>`;
    paintUi(b);
  }

  // ── chế độ tĩnh: chạm để sang phách sau ──
  let stillK = 0;
  const showStill = () => draw(stillBeat(id, stillK), true);
  const advance = () => {
    stillK = (stillK + 1) % total;
    showStill();
    if (narrating && narrateSay) void narrateSay(stepAt(def, stillK).step.say);
  };
  if (reduced) {
    nextBtn.addEventListener('click', advance);
    svg.addEventListener('click', advance);
    showStill();
  }

  function speakStep(index: number): void {
    if (!narrateSay) return;
    const my = ++narrateGen;
    speechPending = true;
    void narrateSay(def.steps[index].say).then(() => {
      if (my === narrateGen) speechPending = false;
    });
  }

  function frame(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    const prev = beat;
    let next = beat + dt / SPEED_MS[speed];
    if (narrating) {
      // vòng đầu: giữ cuối bước khi giọng chưa đọc xong
      const st = stepAt(def, prev);
      const end = st.start + st.step.beats;
      if (speechPending && next >= end - 0.02) next = Math.max(prev, end - 0.02);
      if (next >= total) {
        narrating = false;
        sound = true;
      } else {
        const ns = stepAt(def, next);
        if (ns.index !== st.index) speakStep(ns.index);
      }
    }
    beat = wrapBeat(next, total);
    // tiếng tích ở đầu mỗi phách
    if (Math.floor(next) !== Math.floor(prev) && sound && !narrating && opts.click) {
      try {
        opts.click(Math.floor(beat) === 0);
      } catch {
        /* bỏ qua */
      }
    }
    if (now - lastDraw >= 32) {
      lastDraw = now;
      draw(beat);
    }
  }

  if (!reduced && typeof requestAnimationFrame === 'function') {
    draw(0);
    raf = requestAnimationFrame(frame);
  } else if (!reduced) draw(0);

  return {
    el: root,
    stop() {
      alive = false;
      narrateGen++;
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    },
    narrate(say) {
      if (!alive) return;
      narrateSay = say;
      narrating = true;
      if (reduced) {
        stillK = 0;
        showStill();
        void say(def.steps[0].say);
        return;
      }
      beat = 0;
      last = 0;
      lastStep = -1;
      draw(0);
      speakStep(0);
    },
    quiet() {
      narrateGen++;
      narrating = false;
      speechPending = false;
      narrateSay = null;
      sound = true;
    },
    setSound(on) {
      sound = on;
    },
  };
}
