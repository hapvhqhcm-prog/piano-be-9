/**
 * (+ 2026-10-15, OWNER: "Hoạt hình kỹ thuật từng bước") HOẠT HÌNH TỪNG BƯỚC cho mỗi bài khởi động tay (technique.ts):
 * một cảnh chậm, lặp mãi, chia BƯỚC (nhãn ≤ 6 chữ) theo nhịp đếm "1 – 2 – 3 – 4" (hiện số + tiếng tích nhẹ),
 * phần đang chuyển động được tô sáng; nút 🐢 Chậm hơn / Nhanh hơn; vòng đầu có giọng đọc từng bước.
 *
 * - Phần THUẦN (không DOM, test trong node): mỗi bài = danh sách khung khoá (keyframe, đơn vị = phách) của các số
 *   (góc khớp, vị trí, độ nhấn phím…) → nội suy mượt (ease) → hàm vẽ trả chuỗi SVG (bộ vẽ bàn tay handKit).
 * - Phần DOM (mountTechniqueAnim): vòng requestAnimationFrame (~30 khung/giây) vẽ lại cảnh; số đếm / nhãn bước là
 *   phần tử HTML có hiệu ứng CSS (techAnim.css).
 * - Giảm chuyển động (prefers-reduced-motion): khung TĨNH từng phách có mũi tên chỉ hướng, chạm để sang phách sau.
 *
 * Nạp muộn (chunk riêng) từ technique.ts — không làm nặng gói chính.
 */
import type { TechniqueDrill } from '../../lessons/types';
import { P } from './art/svgKit';
import {
  GOOD,
  OUTLINE,
  SKIN,
  SEG_LEN,
  arrow,
  armHand,
  chain,
  limbs,
  n,
  panelBg,
  seg,
  sideHand,
  sideKeys,
  type ForwardAngles,
  type PoseAngles,
  type Pt,
} from './art/handKit';
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
function halo(p: Pt, pulse: number, r = 15): { under: string; over: string } {
  return {
    under: `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${n(r + 3 * pulse)}" fill="${P.sun}" opacity="${n(0.22 + 0.3 * pulse)}"/>`,
    over: `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${n(r + 3 * pulse)}" fill="none" stroke="${HL}" stroke-width="2.6" stroke-dasharray="5 4" opacity="${n(0.55 + 0.45 * pulse)}"/>`,
  };
}

/** Bóng chữ nhỏ (bo nền trắng). */
function chip(x: number, y: number, text: string, color: string, size = 11): string {
  const w = Math.max(18, text.length * size * 0.58 + 10);
  return (
    `<g transform="translate(${n(x)} ${n(y)})"><rect x="${n(-w / 2)}" y="${n(-size * 0.95)}" width="${n(w)}" height="${n(size * 1.5)}" rx="${n(size * 0.75)}" fill="#fff" stroke="${color}" stroke-width="1.4"/>` +
    `<text x="0" y="${n(size * 0.28)}" font-size="${size}" font-weight="800" font-family="Baloo 2, Nunito, sans-serif" fill="${color}" text-anchor="middle">${text}</text></g>`
  );
}

/** Số ngón trong vòng tròn nhỏ. */
function fingerBadge(p: Pt, k: number | string, color: string = P.indigo): string {
  return `<g transform="translate(${n(p[0])} ${n(p[1])})"><circle r="9" fill="${color}" stroke="#fff" stroke-width="2"/><text y="4.2" font-size="12" font-weight="900" font-family="Baloo 2, Nunito, sans-serif" fill="#fff" text-anchor="middle">${k}</text></g>`;
}

const fwdOf = (v: AnimState): ForwardAngles => [v.F ?? 0, v.H ?? 0, v.p ?? 0, v.m ?? 0, v.d ?? 0];
const backOf = (v: AnimState): PoseAngles => [v.a0 ?? 0, v.a1 ?? 0, v.a2 ?? 0, v.a3 ?? 0, v.a4 ?? 0];

/** Khuỷu cần đặt ở đâu để đầu ngón (dáng xuôi `fwd`) nằm đúng `tip`. */
export function elbowFor(tip: Pt, fwd: ForwardAngles, scale: number, forearm: number = SEG_LEN[4]): Pt {
  const lens = [forearm, SEG_LEN[3], SEG_LEN[2], SEG_LEN[1], SEG_LEN[0]].map((l) => l * scale);
  const end = chain([0, 0], fwd.map((deg, i) => ({ len: lens[i], deg })))[5];
  return [tip[0] - end[0], tip[1] - end[1]];
}

/** Dáng "cong chuẩn" theo góc xuôi (cẳng tay, mu, đốt gốc, đốt giữa, đốt đầu). */
const CURVED_FWD = { F: -12, H: -18, p: 28, m: 58, d: 85 } as const;

// ───────────────────────────── 1. Cầu vồng rơi (arm-drop) ─────────────────────────────
// Nhìn ngang, khuỷu cố định bên trái: nhấc cẳng tay (bàn tay buông thõng) → rơi tự nhiên, tay cong chạm phím →
// chìm xuống đáy phím (nỉ đỏ sáng) → cổ tay nổi lên, nhấc ra.
const AD = { s: 1.5, fore: 62, kx: 150, ky: 128 } as const;
const AD_TIP: Pt = [190, AD.ky - 6.8];
const AD_ELBOW = elbowFor(AD_TIP, [CURVED_FWD.F, CURVED_FWD.H, CURVED_FWD.p, CURVED_FWD.m, CURVED_FWD.d], AD.s, AD.fore);
const AD_REST = { ...CURVED_FWD, press: 0 };
const AD_UP = { F: -50, H: 26, p: 58, m: 82, d: 100, press: 0 };
const AD_BED = { F: -10, H: -15, p: 30, m: 60, d: 86, press: 1 };
const AD_FLOAT = { F: -24, H: 6, p: 44, m: 74, d: 94, press: 0 };

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
    const hand = armHand({ elbow: [AD_ELBOW[0], AD_ELBOW[1] + press * 2], fwd: fwdOf(v), scale: AD.s, forearm: AD.fore });
    const [tip, , , mcp, wr, el] = hand.pts;
    const keyPt: Pt = [AD_TIP[0] + 14, AD.ky + 19];
    const bedGlow = press > 0.5 ? `<rect x="${AD.kx + 6}" y="${AD.ky + 15.5}" width="110" height="8" rx="4" fill="#e0605a" opacity="${n((press - 0.5) * 1.6)}"/>` : '';
    const elbowDot = `<circle cx="${n(el[0])}" cy="${n(el[1])}" r="5" fill="${P.violetLight}" stroke="#fff" stroke-width="2"/>`;
    return {
      svg: sideKeys({ x: AD.kx, y: AD.ky, len: 60, press, bed: press > 0.5 }) + bedGlow + hand.svg + elbowDot,
      at: { tip, wrist: wr, knuckle: mcp, elbow: el, key: keyPt },
    };
  },
};

// ───────────────────────────── 2. Xoay cổ tay (wrist-circle) ─────────────────────────────
// Nhìn ngang, đầu ngón ĐỨNG YÊN trên phím; cổ tay đi vòng tròn: lên → tới trước → xuống → lùi.
// Dáng tay mỗi khung tính bằng IK nhỏ (Newton 2 ẩn: độ cong ngón u, góc mu bàn tay w) để cổ tay nằm đúng trên vòng tròn.
const WC = { s: 1.9, kx: 138, ky: 122 } as const;
const WC_TIP: Pt = [178, WC.ky - 4.5 * WC.s];
const WC_BASE: PoseAngles = [-95, -122, -152, 162, 168];
const WC_R = 12;

function wcPose(u: number, w: number): PoseAngles {
  return [WC_BASE[0] + u * 0.35, WC_BASE[1] + u * 0.7, WC_BASE[2] + u, WC_BASE[3] + w, WC_BASE[4] + w * 0.55];
}
function wcWrist(a: PoseAngles): Pt {
  const lens = SEG_LEN.map((l) => l * WC.s);
  return chain(WC_TIP, a.slice(0, 4).map((deg, i) => ({ len: lens[i], deg })))[4];
}
const WC_CENTER = wcWrist(WC_BASE);

/** IK: góc khớp sao cho cổ tay tới `target` (đầu ngón giữ nguyên). Trả về PoseAngles; không hội tụ → dáng gốc. */
export function wristIk(target: Pt): PoseAngles {
  let u = 0;
  let w = 0;
  for (let it = 0; it < 30; it++) {
    const p = wcWrist(wcPose(u, w));
    const ex = p[0] - target[0];
    const ey = p[1] - target[1];
    if (Math.hypot(ex, ey) < 0.01) break;
    const h = 0.01;
    const pu = wcWrist(wcPose(u + h, w));
    const pw = wcWrist(wcPose(u, w + h));
    const j11 = (pu[0] - p[0]) / h;
    const j21 = (pu[1] - p[1]) / h;
    const j12 = (pw[0] - p[0]) / h;
    const j22 = (pw[1] - p[1]) / h;
    const det = j11 * j22 - j12 * j21;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-9) break;
    u -= (j22 * ex - j12 * ey) / det;
    w -= (-j21 * ex + j11 * ey) / det;
    u = Math.max(-40, Math.min(40, u));
    w = Math.max(-40, Math.min(40, w));
  }
  const pose = wcPose(u, w);
  return pose.every(Number.isFinite) ? pose : WC_BASE;
}

/** 16 khung khoá quanh vòng tròn (bắt đầu ở ĐỈNH, theo chiều kim đồng hồ: lên → trước → xuống → sau). */
const WC_KEYS: Keyframe[] = Array.from({ length: 16 }, (_, k) => {
  const th = (k / 16) * Math.PI * 2;
  const a = wristIk([WC_CENTER[0] + WC_R * Math.sin(th), WC_CENTER[1] - WC_R * Math.cos(th)]);
  return { at: k / 4, v: { a0: a[0], a1: a[1], a2: a[2], a3: a[3], a4: a[4] }, ease: 'lin' as const };
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
    const hand = sideHand({ tip: WC_TIP, pose: backOf(v), scale: WC.s });
    const [tip, , , mcp, wr, el] = hand.pts;
    const pin = `<circle cx="${n(tip[0])}" cy="${WC.ky}" r="4" fill="${GOOD}" stroke="#fff" stroke-width="1.6"/>`;
    return {
      svg: sideKeys({ x: WC.kx, y: WC.ky, len: 60 }) + hand.svg + pin + chip(196, 152, 'ngón đứng yên', GOOD, 10),
      at: { tip, wrist: wr, knuckle: mcp, elbow: el },
    };
  },
};

// ───────────────────────────── 3. Ngón gõ cửa (finger-tap) ─────────────────────────────
// Nhìn ngang trên nắp đàn gỗ: khớp gốc (cây cầu) giữ cao, MỘT ngón nhấc lên từ khớp gốc rồi gõ xuống; ngón khác nghỉ.
const FT = { s: 1.9, lidY: 124 } as const;
const FT_TIP: Pt = [176, FT.lidY - 4.5 * FT.s];
const FT_ELBOW = elbowFor(FT_TIP, [CURVED_FWD.F, CURVED_FWD.H, CURVED_FWD.p, CURVED_FWD.m, CURVED_FWD.d], FT.s);

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
    const L = clamp01(v.lift) * 34;
    const fwd: ForwardAngles = [CURVED_FWD.F, CURVED_FWD.H, CURVED_FWD.p - L, CURVED_FWD.m - L * 0.85, CURVED_FWD.d - L * 0.7];
    // ngón nghỉ phía sau (nhạt), cùng khớp gốc
    // ngón nghỉ phía sau: chỉ 3 đốt ngón (nhạt), gốc lệch ra sau một chút
    const bp = armHand({ elbow: [FT_ELBOW[0] + 10, FT_ELBOW[1] - 3], fwd: [CURVED_FWD.F, CURVED_FWD.H, 30, 62, 88], scale: FT.s, sleeve: null }).pts;
    const backFingers = limbs([
      seg(bp[3], bp[2], 11.5 * FT.s, SKIN.back),
      seg(bp[2], bp[1], 10 * FT.s, SKIN.back),
      seg(bp[1], bp[0], 9 * FT.s, SKIN.back),
    ]);
    const hand = armHand({ elbow: FT_ELBOW, fwd, scale: FT.s });
    const [tip, dip, pip, mcp, wr, el] = hand.pts;
    const lid =
      `<rect x="96" y="${FT.lidY}" width="146" height="14" rx="4" fill="${P.wood}" stroke="${OUTLINE}" stroke-width="1.3"/>` +
      `<rect x="96" y="${FT.lidY + 14}" width="146" height="30" fill="${P.woodDark}" opacity=".55"/>`;
    const hit = clamp01(v.hit);
    const knock = hit > 0.05
      ? `<g stroke="${P.orange}" stroke-width="2.4" stroke-linecap="round" opacity="${n(hit)}">` +
        `<path d="M${n(FT_TIP[0] + 10)} ${n(FT.lidY - 6)} l8 -6"/><path d="M${n(FT_TIP[0] + 12)} ${n(FT.lidY - 1)} l10 0"/><path d="M${n(FT_TIP[0] - 12)} ${n(FT.lidY - 6)} l-7 -6"/></g>`
      : '';
    const bridge = `<path d="M${n(wr[0])} ${n(wr[1] - 24)} Q${n(mcp[0])} ${n(mcp[1] - 44)} ${n(mcp[0] + 34)} ${n(mcp[1] - 18)}" stroke="${GOOD}" stroke-width="3" stroke-dasharray="7 5" fill="none" stroke-linecap="round"/>`;
    return {
      svg: lid + backFingers + hand.svg + knock + bridge + chip(mcp[0] - 30, 24, 'cầu cao', GOOD, 11) + fingerBadge([tip[0] + 20, tip[1] - 30], k),
      at: { tip, finger: [(pip[0] + dip[0]) / 2, (pip[1] + dip[1]) / 2], knuckle: mcp, wrist: wr, elbow: el },
    };
  },
};

// ───────────────────────────── cảnh nhìn từ TRÊN (five-finger, thumb-under, legato) ─────────────────────────────
const TK = { x0: 18, kw: 29.7, y: 20, h: 124 } as const;
const NOTE_VI = ['Đô', 'Rê', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Đô'];
const keyX = (i: number) => TK.x0 + i * TK.kw + TK.kw / 2 - 1;
/** y đầu ngón 2–5 (nhìn từ trên) */
const TIPS_Y = [92, 86, 91, 100];

/** Phím trắng (có thể sáng lên theo glow[i] 0..1, ghi tên nốt) + phím đen. */
function topKeys(count: number, glow: (i: number) => number): string {
  let s = `<rect x="${TK.x0 - 4}" y="${TK.y - 4}" width="${n(count * TK.kw + 6)}" height="${TK.h + 8}" rx="6" fill="${P.ink}"/>`;
  for (let i = 0; i < count; i++) {
    const g = clamp01(glow(i));
    s += `<rect x="${n(TK.x0 + i * TK.kw)}" y="${TK.y}" width="${n(TK.kw - 2)}" height="${TK.h}" rx="3" fill="#fff"/>`;
    if (g > 0.02) {
      s += `<rect x="${n(TK.x0 + i * TK.kw)}" y="${TK.y}" width="${n(TK.kw - 2)}" height="${TK.h}" rx="3" fill="${P.sun}" opacity="${n(0.75 * g)}"/>`;
      s += `<text x="${n(keyX(i))}" y="${TK.y + TK.h - 6}" font-size="11" font-weight="900" font-family="Baloo 2, Nunito, sans-serif" fill="${P.ink}" text-anchor="middle" opacity="${n(g)}">${NOTE_VI[i % 8]}</text>`;
    }
  }
  for (let i = 0; i < count - 1; i++) {
    if (![0, 1, 3, 4, 5].includes(i % 7)) continue;
    s += `<rect x="${n(TK.x0 + (i + 1) * TK.kw - 9)}" y="${TK.y}" width="16" height="64" rx="2.5" fill="${P.night}"/>`;
  }
  return s;
}

interface TopHandOpts {
  /** x tâm phím của ngón cái khi tay ở chỗ cũ (tay dời → số khác) */
  hx: number;
  /** nhấn ngón 1..5 (0..1) — index 0 = ngón cái */
  press: readonly number[];
  /** đầu ngón cái (toạ độ tuyệt đối); bỏ trống = chỗ thường */
  thumb?: Pt;
  /** 0..1: ngón cái đang chui DƯỚI lòng bàn tay (bàn tay vẽ trong suốt hơn) */
  under?: number;
}

/** Bàn tay phải nhìn từ trên (ngón 2–5 trên phím, ngón cái cong nằm nghiêng). Trả về svg + đầu 5 ngón. */
function topHand(o: TopHandOpts): { svg: string; tips: Pt[] } {
  const skin = SKIN.base;
  const cx = (i: number) => o.hx + i * TK.kw;
  const tips: Pt[] = TIPS_Y.map((y, k) => [cx(k + 1), y + clamp01(o.press[k + 1] ?? 0) * 7]);
  const fingers = tips.map(([x, y], k) => {
    const pr = clamp01(o.press[k + 1] ?? 0);
    const f = seg([x - 1, 120], [x, y], 17 - k * 1.2, skin);
    return (
      f.under +
      f.over +
      `<ellipse cx="${n(x)}" cy="${n(y - 1)}" rx="4.6" ry="3.4" fill="${pr > 0.5 ? '#ffe9d8' : SKIN.nail}" stroke="${SKIN.dark}" stroke-width=".9"/>`
    );
  });
  const palm = `<path d="M${n(cx(0) + 8)} 150 Q${n(cx(0) + 4)} 112 ${n(cx(1) - 8)} 112 L${n(cx(4) + 6)} 114 Q${n(cx(4) + 14)} 128 ${n(cx(4) + 6)} 150 Z" fill="${skin}" stroke="${OUTLINE}" stroke-width="1.5"/>`;
  const knuckles = tips.map(([x]) => `<path d="M${n(x - 5)} 118 q5 -3 10 0" stroke="${SKIN.dark}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`).join('');
  const arm = seg([cx(2) + 6, 182], [cx(2) + 4, 152], 54, P.violet);
  const base: Pt = [cx(0) + 18, 140];
  const tp: Pt = o.thumb ?? [cx(0) - 1, 112 + clamp01(o.press[0] ?? 0) * 6];
  // khớp giữa ngón cái: lệch sang trái-dưới của đoạn gốc→đầu (ngón cong)
  const mx = (base[0] + tp[0]) / 2;
  const my = (base[1] + tp[1]) / 2;
  const L = Math.hypot(tp[0] - base[0], tp[1] - base[1]) || 1;
  const nx = (tp[1] - base[1]) / L;
  const ny = -(tp[0] - base[0]) / L;
  const mid: Pt = [mx + nx * 6, my + ny * 6];
  const th =
    limbs([seg(base, mid, 17, skin), seg(mid, tp, 15, skin)]) +
    `<ellipse cx="${n(tp[0] - 3.4)}" cy="${n(tp[1] + 1)}" rx="2.4" ry="4.4" transform="rotate(-24 ${n(tp[0] - 3.4)} ${n(tp[1] + 1)})" fill="${SKIN.nail}" stroke="${SKIN.dark}" stroke-width=".9"/>`;
  const uv = clamp01(o.under ?? 0);
  const under = uv > 0.05;
  // ngón cái chui dưới: vẽ ngón cái TRƯỚC lòng bàn tay (bị che) + viền nét đứt của nó phía trên (thấy "xuyên" qua tay)
  const ghost = under
    ? `<path d="M${n(base[0])} ${n(base[1])} L${n(mid[0])} ${n(mid[1])} L${n(tp[0])} ${n(tp[1])}" stroke="${P.indigo}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${n(0.22 * uv)}"/>` +
      `<path d="M${n(base[0])} ${n(base[1])} L${n(mid[0])} ${n(mid[1])} L${n(tp[0])} ${n(tp[1])}" stroke="${P.indigo}" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round" fill="none" opacity="${n(0.8 * uv)}"/>`
    : '';
  const svg = arm.under + arm.over + (under ? th : '') + fingers.join('') + palm + knuckles + (under ? ghost : th);
  return { svg, tips: [tp, ...tips] };
}

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
/** Nốt (chỉ số phím trắng) của ngón 1..5 khi tay ở thế Đô */
const FIVE_KEY = [0, 0, 1, 2, 3, 4];

function walkDraw(seq: readonly number[], keyCount: number) {
  return (v: AnimState, beat: number): Scene => {
    const press = [1, 2, 3, 4, 5].map((k) => clamp01(v[`f${k}`] ?? 0));
    const hx = keyX(0) + (v.lean ?? 0);
    const hand = topHand({ hx, press });
    const active = seq[Math.floor(wrapBeat(beat, seq.length))] ?? 1;
    const tipA = hand.tips[active - 1];
    // "sức nặng" dồn vào ngón đang nhấn: chấm tím mờ dưới đầu ngón
    const weight = `<ellipse cx="${n(tipA[0])}" cy="${n(tipA[1] + 8)}" rx="11" ry="5" fill="${P.violet}" opacity="${n(0.18 + 0.3 * press[active - 1])}"/>`;
    return {
      svg: topKeys(keyCount, (i) => press.reduce((m, p, k) => (FIVE_KEY[k + 1] === i ? Math.max(m, p) : m), 0)) + weight + hand.svg + fingerBadge([tipA[0], 34], active),
      at: { finger: tipA, tip: tipA, thumb: hand.tips[0] },
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
// Nhìn từ trên: ngón 3 giữ Mi → ngón cái trượt DƯỚI lòng bàn tay tới Fa → chạm Fa, cả bàn tay dời theo → về chỗ cũ.
const TU_HOME = keyX(0);
const TU_THUMB_HOME: Pt = [TU_HOME - 1, 112];
const TU_THUMB_F: Pt = [keyX(3) - 2, 106];
const TU_SHIFT = 3 * TK.kw * 0.62; // tay dời một đoạn (vẫn trong khung) — đủ thấy "cả tay đi theo"
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
    { at: 0, v: { hx: 0, tx: TU_THUMB_HOME[0], ty: TU_THUMB_HOME[1], under: 0, f3: 0, f1: 0 } },
    { at: 0.35, v: { hx: 0, tx: TU_THUMB_HOME[0], ty: TU_THUMB_HOME[1], under: 0, f3: 1, f1: 0 } },
    { at: 1.05, v: { hx: 0, tx: TU_THUMB_HOME[0], ty: TU_THUMB_HOME[1], under: 0, f3: 1, f1: 0 } },
    { at: 1.9, v: { hx: 0, tx: TU_THUMB_F[0], ty: TU_THUMB_F[1], under: 1, f3: 1, f1: 0 } },
    { at: 2.25, v: { hx: 0, tx: TU_THUMB_F[0], ty: TU_THUMB_F[1] + 5, under: 1, f3: 0, f1: 1 } },
    { at: 2.9, v: { hx: TU_SHIFT, tx: TU_THUMB_F[0] + 2, ty: TU_THUMB_F[1] + 6, under: 0.3, f3: 0, f1: 1 } },
    { at: 3.15, v: { hx: TU_SHIFT, tx: TU_THUMB_F[0] + 2, ty: TU_THUMB_F[1] + 6, under: 0.3, f3: 0, f1: 1 } },
    { at: 3.9, v: { hx: 0, tx: TU_THUMB_HOME[0], ty: TU_THUMB_HOME[1], under: 0, f3: 0, f1: 0 } },
  ],
  draw(v) {
    const hx = TU_HOME + (v.hx ?? 0);
    const f1 = clamp01(v.f1);
    const f3 = clamp01(v.f3);
    const hand = topHand({ hx, press: [f1, 0, f3, 0, 0], thumb: [v.tx ?? TU_THUMB_HOME[0], v.ty ?? TU_THUMB_HOME[1]], under: v.under });
    const glow = (i: number) => (i === 2 ? f3 : i === 3 ? f1 : 0);
    const tunnel = `<path d="M${n(TU_THUMB_HOME[0] + 4)} 128 Q${n((TU_THUMB_HOME[0] + TU_THUMB_F[0]) / 2)} 138 ${n(TU_THUMB_F[0])} 124" stroke="${P.violet}" stroke-width="2.6" stroke-dasharray="5 5" fill="none" stroke-linecap="round" opacity=".7"/>`;
    return {
      svg: topKeys(7, glow) + tunnel + hand.svg + fingerBadge([hand.tips[0][0] - 2, 160], 1) + fingerBadge([hand.tips[2][0], 34], 3),
      at: { thumb: hand.tips[0], finger: hand.tips[2], key: [keyX(3), 60] },
    };
  },
};

// ───────────────────────────── 6. Ôm quả bóng (hand-shape) ─────────────────────────────
// Nhìn ngang: bàn tay xòe trên cao → khum tròn ôm quả bóng (đặt trên phím) → bóng lăn đi, tay giữ dáng → tay tròn trên phím.
const HS = { s: 1.9, kx: 138, ky: 122 } as const;
const HS_TIP: Pt = [176, HS.ky - 4.5 * HS.s];
// mu bàn tay 184° (= −176°) viết liền với 162° của dáng cong → nội suy đi đường ngắn, không lật tay
const HS_OPEN: PoseAngles = [-176, -178, -179, 184, 174];
const HS_CURVED: PoseAngles = [-95, -122, -152, 162, 168];
const hsPose = (a: PoseAngles) => ({ a0: a[0], a1: a[1], a2: a[2], a3: a[3], a4: a[4] });
const HS_BALL: Pt = [152, HS.ky - 19];

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
    { at: 0, v: { ...hsPose(HS_OPEN), tx: 214, ty: 72, ball: 0, bx: 0 } },
    { at: 0.7, v: { ...hsPose(HS_OPEN), tx: 214, ty: 72, ball: 1, bx: 0 } },
    { at: 1.75, v: { ...hsPose(HS_CURVED), tx: HS_TIP[0], ty: HS_TIP[1], ball: 1, bx: 0 } },
    { at: 2.15, v: { ...hsPose(HS_CURVED), tx: HS_TIP[0], ty: HS_TIP[1], ball: 1, bx: 0 } },
    { at: 2.95, v: { ...hsPose(HS_CURVED), tx: HS_TIP[0], ty: HS_TIP[1], ball: 0, bx: -70 } },
    { at: 3.6, v: { ...hsPose(HS_CURVED), tx: HS_TIP[0], ty: HS_TIP[1], ball: 0, bx: -70 } },
  ],
  draw(v) {
    const hand = sideHand({ tip: [v.tx ?? HS_TIP[0], v.ty ?? HS_TIP[1]], pose: backOf(v), scale: HS.s });
    const [tip, dip, , mcp, wr, el] = hand.pts;
    const ballOp = clamp01(v.ball);
    const bc: Pt = [HS_BALL[0] + (v.bx ?? 0), HS_BALL[1]];
    const rot = ((v.bx ?? 0) / 18) * (180 / Math.PI);
    const ball =
      ballOp > 0.02
        ? `<g opacity="${n(ballOp)}" transform="rotate(${n(rot)} ${n(bc[0])} ${n(bc[1])})"><circle cx="${n(bc[0])}" cy="${n(bc[1])}" r="18" fill="${P.orange}" stroke="${OUTLINE}" stroke-width="1.4"/>` +
          `<path d="M${n(bc[0] - 17)} ${n(bc[1] - 4)} Q${n(bc[0])} ${n(bc[1] + 8)} ${n(bc[0] + 17)} ${n(bc[1] - 4)} M${n(bc[0])} ${n(bc[1] - 18)} Q${n(bc[0] - 9)} ${n(bc[1])} ${n(bc[0])} ${n(bc[1] + 18)}" stroke="${P.sunLight}" stroke-width="3" fill="none"/></g>`
        : '';
    return {
      svg: sideKeys({ x: HS.kx, y: HS.ky, len: 60 }) + ball + hand.svg,
      at: { tip, finger: dip, knuckle: mcp, wrist: wr, elbow: el },
    };
  },
};

// ───────────────────────────── + Nảy staccato ─────────────────────────────
const SC = { s: 1.5, fore: 62, kx: 150, ky: 128 } as const;
const SC_TIP: Pt = [190, SC.ky - 6.8];
const SC_ELBOW = elbowFor(SC_TIP, [CURVED_FWD.F, CURVED_FWD.H, CURVED_FWD.p, CURVED_FWD.m, CURVED_FWD.d], SC.s, SC.fore);
const SC_HOVER = { F: -15, H: -24, p: 22, m: 52, d: 80, press: 0 };
const SC_UP = { F: -18, H: -40, p: 8, m: 38, d: 66, press: 0 };
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
    { at: 0, v: SC_HOVER },
    { at: 1.0, v: SC_HOVER },
    { at: 1.22, v: { ...CURVED_FWD, press: 1 }, ease: 'in' },
    { at: 1.5, v: { ...CURVED_FWD, press: 1 } },
    { at: 2.3, v: SC_UP, ease: 'out' },
    { at: 3.3, v: SC_UP },
  ],
  draw(v) {
    const press = clamp01(v.press);
    const hand = armHand({ elbow: SC_ELBOW, fwd: fwdOf(v), scale: SC.s, forearm: SC.fore });
    const [tip, , , mcp, wr, el] = hand.pts;
    return {
      svg: sideKeys({ x: SC.kx, y: SC.ky, len: 60, press }) + hand.svg,
      at: { tip, wrist: wr, knuckle: mcp, elbow: el, key: [SC_TIP[0] + 14, SC.ky + 6] },
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
