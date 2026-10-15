/**
 * ✋ "BÀN TAY MỜ" (ghost hand) phủ trên bàn phím ảo — chỉ cho bé THẾ TAY đúng: năm ngón cong tròn đặt sẵn trên năm phím,
 * ngón cần đàn sáng lên và "nhấn" nhẹ (sức nặng cánh tay), các ngón khác nằm nhẹ trên phím.
 *
 * ── HÌNH VẼ ──────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Nhìn từ trên xuống (bé ngồi trước đàn): đầu ngón chạm phím (chấm bóng tiếp xúc), đốt giữa cong lên (vệt sáng),
 * khớp ngón tạo "cầu" (knuckle bridge), ngón cái nằm NGHIÊNG (thấy móng bên cạnh). Số ngón 1–5 trên đầu ngón.
 * Mu bàn tay MỜ DẦN ngay dưới hàng khớp → phần dưới phím (tên nốt, huy hiệu số ngón của phím đích) KHÔNG BAO GIỜ bị
 * che (đầu ngón ở ~30% chiều cao phím, khớp ~62%, hết hẳn ở ~70%; huy hiệu nằm ở ~71–93%).
 * Tay phải xanh dương, tay trái cam (như màu phím đích). Bài hai tay: hai bàn tay, mỗi tay một màu.
 *
 * ── THẾ TAY ──────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Bài hát: planFromTune() chia mỗi bè thành các đoạn "một thế tay" (năm ngón không đổi phím) bằng số ngón GHI SẴN trong
 * bài; nốt mâu thuẫn với thế đang có (ngón đã ở phím khác / thứ tự ngón đảo) → thế mới. Ngón chưa có nốt trong đoạn được
 * điền theo các nốt của bài (giữ dấu thăng/giáng: thế Rê có Fa♯, gam Fa có Si♭). Đổi thế = bàn tay trượt sang;
 * luồn ngón cái (thumb-under) / vắt ngón 3 qua (3-over) trong gam Cấp 4 = hoạt hình HAI NHỊP: ngón luồn / vắt đi trước,
 * cả bàn tay theo sau.
 * Màn khác (bài học từng nốt, hát rồi đàn, khởi động): frameFromTargets() — giữ thế cũ nếu vẫn đúng, không thì tìm
 * trong bảng thế tay (POSITIONS: Đô, Sol, Rê, Đô thứ, La thứ, Đô giữa, Đô cao, "Đô nhích lên" Sol–La), cuối cùng tự điền.
 *
 * ── KHI NÀO HIỆN / MỜ DẦN (quy tắc đơn giản) ───────────────────────────────────────────────────────────────────────────
 * Công tắc "✋ Hiện bàn tay" (Tùy chọn của màn bài hát; lưu trên máy này): Tự động (mặc định) · Luôn hiện · Ẩn.
 * Tự động (ghostAuto): HIỆN nếu tuần ≤ 8, hoặc bài/bước dùng THẾ TAY KHÁC thế Đô (Sol, Rê, Đô thứ, La thứ, Đô giữa,
 * Đô cao, đổi thế / luồn ngón) mà bé CHƯA THUỘC bài đó; còn lại ẨN.
 * Mờ dần trong lúc chơi (ghostLevel): đúng 3 nốt liền → mờ hơn; đúng 8 nốt liền → gần như trong suốt;
 * đàn sai một nốt (micro nghe nốt khác) → rõ lại ngay; mỗi lần ĐỔI THẾ / luồn ngón → rõ lại cho nốt đó.
 * Chỉ hiện khi app đang làm sáng phím cần đàn (gợi ý "Đầy đủ"); ẩn khi thầy đàn mẫu (bàn tay hoạt hình) đang hiện.
 *
 * TRUNG THỰC: micro chỉ nghe được CAO ĐỘ — không biết bé dùng ngón nào → bàn tay chỉ là HƯỚNG DẪN, không bao giờ báo
 * "sai ngón". Không đụng tới chấm điểm / micro.
 *
 * HIỆU NĂNG: SVG + CSS transform/transition (không tính bố cục mỗi khung hình), cập nhật gộp trong MỘT
 * requestAnimationFrame khi phím đích đổi (không có vòng lặp rAF). prefers-reduced-motion → không nhấn, không trượt;
 * ngón sáng tĩnh. Mô-đun nạp muộn (import động) để không làm nặng gói chính.
 */
import { POSITIONS, RH_SOL_LA, fingerFor, type Hand, type PositionId } from '../../piano/fingering';
import type { KeyTarget, PianoKeyboard } from '../../piano/PianoKeyboard';
import { midiToPitch, pitchToMidi, type Pitch } from '../../piano/pitchTable';
import { onsets, pitchesOf, type Tune } from '../../music/tune';

// ======================================================================================================================
// Thế tay (hàm thuần — có test)
// ======================================================================================================================

/** Thế tay: midi của ngón 1..5 (chỉ số 0..4); null = ngón "lơ lửng" giữa hai ngón khác (vẽ nội suy). */
export type HandFrame = Array<number | null>;

export interface FingerNote {
  midi: number;
  finger: number;
  /** Cách viết (vd "F#4", "Bb3") — để điền ngón trống đúng dấu thăng/giáng */
  pitch?: Pitch;
}

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const dirOf = (hand: Hand) => (hand === 'RH' ? 1 : -1);

/**
 * Các cao độ (pitch class) "của bài" để điền ngón trống: các nốt có trong bè + phím trắng, trừ phím trắng bị dấu hóa
 * thay thế (có F♯ → bỏ F; có B♭ → bỏ B).
 */
export function allowedPcs(spellings: Iterable<Pitch>): Set<number> {
  const used = new Set<number>();
  const drop = new Set<number>();
  for (const p of spellings) {
    const m = /^([A-G])(#|b)?/.exec(p);
    if (!m) continue;
    const base = LETTER_PC[m[1]];
    if (m[2] === '#') {
      used.add((base + 1) % 12);
      drop.add(base);
    } else if (m[2] === 'b') {
      used.add((base + 11) % 12);
      drop.add(base);
    } else used.add(base);
  }
  const out = new Set(used);
  for (const pc of WHITE_PCS) if (!drop.has(pc) || used.has(pc)) out.add(pc);
  return out;
}

/** Bước sang phím kế tiếp (theo hướng `dir`) thuộc `pcs` — xa nhất 3 nửa cung, không có thì phím trắng kế tiếp. */
function stepKey(m: number, dir: number, pcs: Set<number>): number {
  for (let d = 1; d <= 3; d++) if (pcs.has((((m + dir * d) % 12) + 12) % 12)) return m + dir * d;
  let x = m + dir;
  while (!WHITE_PCS.includes(((x % 12) + 12) % 12)) x += dir;
  return x;
}

/** Hai ngón (f, g) trên hai phím (a, b) có hợp lý không: đúng thứ tự (tay phải ngón lớn → phím cao), không quá doãng. */
function pairOk(f: number, a: number, g: number, b: number, hand: Hand): boolean {
  if (f === g) return a === b;
  if (a === b) return false;
  const df = g - f;
  const dm = (b - a) * dirOf(hand);
  if (Math.sign(dm) !== Math.sign(df)) return false;
  return Math.abs(dm) <= Math.abs(df) * 4 + 3;
}

/** Thêm các nốt vào thế đang gom (ngón → midi); trả về false nếu mâu thuẫn. */
function fits(assigned: Map<number, number>, notes: FingerNote[], hand: Hand): boolean {
  const all = new Map(assigned);
  for (const n of notes) {
    const had = all.get(n.finger);
    if (had !== undefined && had !== n.midi) return false;
    all.set(n.finger, n.midi);
  }
  const es = [...all.entries()];
  for (let i = 0; i < es.length; i++)
    for (let j = i + 1; j < es.length; j++) if (!pairOk(es[i][0], es[i][1], es[j][0], es[j][1], hand)) return false;
  return true;
}

/** Điền các ngón chưa có phím: bước theo phím "của bài" từ ngón gần nhất; kẹt giữa hai ngón → null (lơ lửng). */
export function fillFrame(assigned: ReadonlyMap<number, number>, hand: Hand, pcs: Set<number> = new Set(WHITE_PCS)): HandFrame {
  const dir = dirOf(hand);
  const out: HandFrame = [1, 2, 3, 4, 5].map((f) => assigned.get(f) ?? null);
  if (!assigned.size) return out;
  for (let f = 1; f <= 5; f++) {
    if (out[f - 1] !== null) continue;
    let lo = 0;
    for (let g = f - 1; g >= 1; g--) if (assigned.has(g)) { lo = g; break; }
    let hi = 0;
    for (let g = f + 1; g <= 5; g++) if (assigned.has(g)) { hi = g; break; }
    let m: number | null = null;
    if (lo) {
      m = assigned.get(lo)!;
      for (let k = lo; k < f; k++) m = stepKey(m, dir, pcs);
      if (hi && (m - assigned.get(hi)!) * dir >= 0) m = null;
      else if (hi) {
        // còn chỗ cho các ngón giữa f và hi không?
        let x = m;
        for (let k = f; k < hi; k++) x = stepKey(x, dir, pcs);
        if ((x - assigned.get(hi)!) * dir > 0) m = null;
      }
    } else if (hi) {
      m = assigned.get(hi)!;
      for (let k = hi; k > f; k--) m = stepKey(m, -dir, pcs);
    }
    out[f - 1] = m;
  }
  return out;
}

/** Bảng thế tay (midi) có thể dùng cho tay này — thứ tự ưu tiên. */
function positionTables(hand: Hand): Array<{ id: PositionId | 'C+'; frame: HandFrame }> {
  const out: Array<{ id: PositionId | 'C+'; frame: HandFrame }> = [];
  const add = (id: PositionId | 'C+', tbl: Readonly<Record<Pitch, number>> | undefined) => {
    if (!tbl) return;
    const fr: HandFrame = [null, null, null, null, null];
    for (const [p, f] of Object.entries(tbl)) fr[f - 1] = pitchToMidi(p);
    out.push({ id, frame: fr });
  };
  add('C', POSITIONS.C[hand]);
  // "Đô nhích lên" (Sol–La = 4-5) trước thế Rê: không có Fa♯ thì Sol 4 – La 5 là thế này
  if (hand === 'RH') add('C+', RH_SOL_LA);
  for (const id of ['G', 'D', 'Cm', 'Am', 'MC', 'C5'] as const) add(id, POSITIONS[id][hand]);
  return out;
}

/** Thế tay nào (theo bảng) trùng thế này; 'C+' ("Đô nhích lên") tính là thế Đô; không có → 'free'. */
export function framePositionId(frame: HandFrame, hand: Hand): PositionId {
  for (const t of positionTables(hand)) if (t.frame.every((m, i) => m === frame[i])) return t.id === 'C+' ? 'C' : t.id;
  return 'free';
}

const consistent = (frame: HandFrame | null | undefined, notes: FingerNote[]) =>
  !!frame && notes.every((n) => frame[n.finger - 1] === n.midi);

/**
 * Thế tay cho các phím đích (màn không có "kế hoạch" bài hát): giữ thế cũ nếu vẫn khớp → bảng thế tay → tự điền.
 * Không có ngón nào → null.
 */
export function frameFromTargets(notes: FingerNote[], hand: Hand, prev?: HandFrame | null): HandFrame | null {
  const ns = notes.filter((n) => n.finger >= 1 && n.finger <= 5);
  if (!ns.length) return null;
  if (consistent(prev, ns)) return prev!;
  for (const t of positionTables(hand)) if (consistent(t.frame, ns)) return t.frame;
  // La duỗi (A4 = ngón 5) trong thế Đô
  if (hand === 'RH' && ns.every((n) => fingerFor(midiToPitch(n.midi), 'RH', true) === n.finger)) {
    const fr = positionTables('RH')[0].frame.slice();
    for (const n of ns) fr[n.finger - 1] = n.midi;
    if (fits(new Map(fr.map((m, i) => [i + 1, m!] as [number, number])), [], 'RH')) return fr;
  }
  const assigned = new Map<number, number>();
  if (!fits(assigned, ns, hand)) {
    // Mâu thuẫn trong chính các phím đích (vd hai ngón một phím) → lấy nốt đầu làm mốc
    assigned.set(ns[0].finger, ns[0].midi);
  } else for (const n of ns) assigned.set(n.finger, n.midi);
  return fillFrame(assigned, hand, allowedPcs([...ns.map((n) => n.pitch ?? midiToPitch(n.midi)), 'C4']));
}

export type Crossing = 'under' | 'over' | null;

/**
 * Kiểu chuyển thế giữa hai nốt liền nhau của một tay:
 * 'under' = ngón cái LUỒN DƯỚI: nốt trước do ngón 2–5 đàn, nốt sau do ngón cái đàn, đi tiếp theo hướng các ngón
 *   (tay phải đi lên / tay trái đi xuống) và gần (≤ 3 nửa cung) — như gam Đô: Mi(3) → Fa(1).
 * 'over' = ngón 2–4 VẮT QUA ngón cái: nốt trước do ngón cái, nốt sau do ngón 2–4, đi ngược hướng các ngón và gần.
 * null = đổi thế thường (nhấc / trượt cả bàn tay).
 */
export function crossingOf(prev: FingerNote | null | undefined, next: FingerNote, hand: Hand): Crossing {
  if (!prev) return null;
  const step = (next.midi - prev.midi) * dirOf(hand);
  if (prev.finger >= 2 && next.finger === 1 && step > 0 && step <= 3) return 'under';
  if (prev.finger === 1 && next.finger >= 2 && next.finger <= 4 && step < 0 && step >= -3) return 'over';
  return null;
}

/** Một bước của "kế hoạch" bàn tay trong bài: khóa = các (midi:ngón) của tay đó ở nhóm nốt này. */
export interface PlanEntry {
  key: string;
  frame: HandFrame;
  cross: Crossing;
}
export type HandPlan = Partial<Record<Hand, PlanEntry[]>>;

export const planKey = (notes: ReadonlyArray<{ midi: number; finger?: number }>): string =>
  notes
    .filter((n) => n.finger)
    .map((n) => `${n.midi}:${n.finger}`)
    .sort()
    .join(',');

/** Chia các nhóm nốt (một tay, đúng thứ tự) thành các thế tay. */
export function framesForSequence(groups: FingerNote[][], hand: Hand, pcs?: Set<number>): Array<{ frame: HandFrame | null; cross: Crossing }> {
  const allowed = pcs ?? allowedPcs(groups.flat().map((n) => n.pitch ?? midiToPitch(n.midi)));
  const segOf: number[] = [];
  const segs: Array<Map<number, number>> = [];
  let cur: Map<number, number> | null = null;
  for (const g of groups) {
    const ns = g.filter((n) => n.finger >= 1 && n.finger <= 5);
    if (ns.length) {
      if (!cur || !fits(cur, ns, hand)) {
        cur = new Map();
        segs.push(cur);
        if (!fits(cur, ns, hand)) {
          cur.set(ns[0].finger, ns[0].midi);
          segOf.push(segs.length - 1);
          continue;
        }
      }
      for (const n of ns) cur.set(n.finger, n.midi);
    }
    segOf.push(segs.length - 1);
  }
  const frames = segs.map((s) => fillFrame(s, hand, allowed));
  // Chuyển thế: nốt cuối của nhóm trước → nốt đầu của thế mới (chỉ nhóm một nốt — hợp âm thì trượt cả tay)
  const cross: Crossing[] = frames.map(() => null);
  let last: FingerNote | null = null;
  groups.forEach((g, i) => {
    const ns = g.filter((n) => n.finger >= 1 && n.finger <= 5);
    if (!ns.length) return;
    const s = segOf[i];
    if (i > 0 && s !== segOf[i - 1] && ns.length === 1 && last) cross[s] = crossingOf(last, ns[0], hand);
    last = ns.length === 1 ? ns[0] : null;
  });
  return segOf.map((s) => (s < 0 ? { frame: null, cross: null } : { frame: frames[s], cross: cross[s] }));
}

/** Kế hoạch bàn tay cho cả bài (từng nhóm nốt, từng tay) — dùng số ngón ghi sẵn trong bài. */
export function planFromTune(t: Tune): HandPlan {
  const plan: HandPlan = {};
  for (const hand of ['RH', 'LH'] as const) {
    const groups: FingerNote[][] = [];
    for (const o of onsets(t)) {
      const ns = o.notes.filter((n) => n.hand === hand);
      if (!ns.length) continue;
      groups.push(
        ns.flatMap((n) => {
          const parts = [{ pitch: n.pitch!, finger: n.finger }, ...(n.also ?? [])];
          return parts.filter((p) => p.pitch).map((p) => ({ midi: pitchToMidi(p.pitch), finger: p.finger ?? 0, pitch: p.pitch }));
        }),
      );
    }
    if (!groups.length) continue;
    const spell = t.notes.concat(t.lh ?? []).flatMap((n) => pitchesOf(n));
    const fr = framesForSequence(groups, hand, allowedPcs(spell));
    plan[hand] = groups.map((g, i) => ({ key: planKey(g), frame: fr[i].frame ?? [null, null, null, null, null], cross: fr[i].cross }));
  }
  return plan;
}

// ======================================================================================================================
// Quy tắc hiện / mờ dần (hàm thuần — có test)
// ======================================================================================================================

export type GhostMode = 'auto' | 'on' | 'off';
export const GHOST_MODE_KEY = 'piano-be-9-ghost-hand';
/** Tuần cuối cùng bàn tay hiện sẵn với MỌI bài (thế Đô) */
export const GHOST_ALL_WEEKS = 8;
/** Số nốt đúng liên tiếp để mờ bớt / gần như ẩn */
export const GHOST_SOFT_AFTER = 3;
export const GHOST_FAINT_AFTER = 8;

export function ghostMode(storage: Pick<Storage, 'getItem'> | null = safeStorage()): GhostMode {
  try {
    const v = storage?.getItem(GHOST_MODE_KEY);
    return v === 'on' || v === 'off' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setGhostMode(m: GhostMode, storage: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStorage()): void {
  try {
    if (m === 'auto') storage?.removeItem(GHOST_MODE_KEY);
    else storage?.setItem(GHOST_MODE_KEY, m);
  } catch {
    /* chế độ riêng tư — chỉ nhớ trong lần mở này */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Chế độ "Tự động": hiện ở tuần 1–8; sau đó chỉ với thế tay mới (khác thế Đô) ở bài/bước bé chưa thuộc. */
export function ghostAuto(o: { week: number; positions?: Array<PositionId | undefined>; mastered?: boolean; bothHands?: boolean }): boolean {
  if (o.week <= GHOST_ALL_WEEKS) return true;
  if (o.mastered) return false;
  // (2026-10-15) Bài HAI TAY chưa thuộc: hiện cả hai bàn tay (đặt đúng hai tay là việc mới, dù vẫn thế Đô)
  if (o.bothHands) return true;
  return (o.positions ?? []).some((p) => !!p && p !== 'C');
}

/** Có hiện không, theo công tắc + quy tắc tự động. */
export function ghostVisible(mode: GhostMode, auto: boolean): boolean {
  return mode === 'on' || (mode === 'auto' && auto);
}

/** Độ rõ: 0 = rõ · 1 = mờ · 2 = rất mờ. Vừa đổi thế tay → rõ. */
export function ghostLevel(streak: number, moved: boolean): 0 | 1 | 2 {
  if (moved || streak < GHOST_SOFT_AFTER) return 0;
  return streak < GHOST_FAINT_AFTER ? 1 : 2;
}

// ======================================================================================================================
// Hình học (hàm thuần — có test): đặt từng ngón lên phím
// ======================================================================================================================

export interface TipIn {
  /** Tâm phím (px) */
  x: number;
  black: boolean;
}

export interface Part {
  x: number;
  y: number;
  /** Góc xoay (độ) trong hệ đã soi gương (tay trái) — 0 = ngón chỉ thẳng lên */
  rot: number;
  sx: number;
  sy: number;
}

export interface HandPose {
  /** Đầu ngón (px) 1..5 */
  tips: Array<{ x: number; y: number }>;
  /** Khớp ngón (gốc ngón) 1..5 — ngón cái: gốc ở mép lòng bàn tay */
  roots: Array<{ x: number; y: number }>;
  /** Biến hình từng ngón (ngón 1 = ngón cái) và mu bàn tay */
  fingers: Part[];
  palm: Part;
  /** Chỗ đặt số ngón */
  nums: Array<{ x: number; y: number }>;
}

/** Tỉ lệ theo chiều cao bàn phím */
export const GEO = {
  tipWhite: 0.2,
  tipBlack: 0.1,
  thumbWhite: 0.3,
  thumbBlack: 0.19,
  /** độ dài ngón (đầu ngón → khớp) tối đa, theo chiều cao bàn phím / bề ngang phím trắng */
  lenH: 0.4,
  lenU: 1.45,
};
/** Hình gốc: ngón dài 100, rộng 56; mu bàn tay rộng 240 (khớp 2 → khớp 5) */
const ART = { len: 100, fw: 56, palm: 240 };
const FINGER_W = [1.08, 1, 1.04, 0.96, 0.84];
const KNUCKLE_DY = [0, -0.03, 0, 0.02, 0.1];

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Đặt bàn tay: `tips[i]` = phím của ngón i+1 (null = lơ lửng: nội suy giữa hai ngón kề / kéo dài một phím). */
export function handPose(tipsIn: Array<TipIn | null>, hand: Hand, u: number, H: number): HandPose {
  const dir = dirOf(hand);
  const xs = tipsIn.map((t) => (t ? t.x : null));
  for (let i = 0; i < 5; i++) {
    if (xs[i] !== null) continue;
    let lo = -1;
    for (let j = i - 1; j >= 0; j--) if (tipsIn[j]) { lo = j; break; }
    let hi = -1;
    for (let j = i + 1; j < 5; j++) if (tipsIn[j]) { hi = j; break; }
    if (lo >= 0 && hi >= 0) xs[i] = tipsIn[lo]!.x + ((tipsIn[hi]!.x - tipsIn[lo]!.x) * (i - lo)) / (hi - lo);
    else if (lo >= 0) xs[i] = tipsIn[lo]!.x + dir * u * (i - lo);
    else if (hi >= 0) xs[i] = tipsIn[hi]!.x - dir * u * (hi - i);
    else xs[i] = (dir * u * (i - 2)) as number;
  }
  const X = xs as number[];
  const black = tipsIn.map((t) => !!t?.black);
  const tips = X.map((x, i) => ({
    x,
    y: H * (i === 0 ? (black[0] ? GEO.thumbBlack : GEO.thumbWhite) : black[i] ? GEO.tipBlack : GEO.tipWhite),
  }));
  const L = Math.min(GEO.lenH * H, GEO.lenU * u);
  const K = GEO.tipWhite * H + L;
  const cx = (X[1] + X[2] + X[3] + X[4]) / 4;
  const spread = Math.abs(X[4] - X[1]) / 3;
  const s = Math.max(0.62 * u, Math.min(1.02 * u, spread * 0.86));
  const roots = X.map((_, i) => ({ x: cx + dir * (i + 1 - 3.5) * s, y: K + KNUCKLE_DY[i] * L }));
  // Ngón cái: gốc ở mép lòng bàn tay phía ngón trỏ, thấp hơn hàng khớp
  roots[0] = { x: roots[1].x - dir * 0.3 * u, y: K + 0.3 * L };
  const part = (from: { x: number; y: number }, to: { x: number; y: number }, w: number): Part => {
    const dx = (to.x - from.x) * dir;
    const dy = from.y - to.y;
    return { x: r1(from.x), y: r1(from.y), rot: r1((Math.atan2(dx, dy) * 180) / Math.PI), sx: +(w / ART.fw).toFixed(3), sy: +(Math.hypot(dx, dy) / ART.len).toFixed(3) };
  };
  const fw = 0.52 * u;
  const fingers = tips.map((t, i) => part(roots[i], t, fw * FINGER_W[i]));
  const k2 = roots[1];
  const k5 = roots[4];
  const pdx = (k5.x - k2.x) * dir;
  const palm: Part = {
    x: r1((k2.x + k5.x) / 2),
    y: r1((k2.y + k5.y) / 2),
    rot: r1((Math.atan2(k5.y - k2.y, pdx) * 180) / Math.PI),
    sx: +(Math.max(pdx, 0.5 * u) / ART.palm).toFixed(3),
    sy: +(L / ART.len).toFixed(3),
  };
  const nums = tips.map((t, i) => {
    const k = i === 0 ? 0.24 : 0.26;
    return { x: r1(t.x + (roots[i].x - t.x) * k), y: r1(t.y + (roots[i].y - t.y) * k) };
  });
  return { tips, roots, fingers, palm, nums };
}

// ======================================================================================================================
// Hình vẽ + lớp phủ
// ======================================================================================================================

const SVGNS = 'http://www.w3.org/2000/svg';
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
}

const COLORS: Record<Hand, { line: string; dark: string; glow: string; tint: string }> = {
  RH: { line: '#2b7bd0', dark: '#155a9e', glow: '#5fb0ff', tint: '#e6f1ff' },
  LH: { line: '#e8890c', dark: '#a55d00', glow: '#ffb24d', tint: '#fff0dd' },
};

// Đường viền MỞ ở gốc (tô vẫn khép kín): không có vạch ngang ở khớp → ngón liền vào mu bàn tay
const FINGER_D = 'M-27,4 C-29,-24 -27,-52 -24,-74 C-22,-92 -13,-103 0,-103 C13,-103 22,-92 24,-74 C27,-52 29,-24 27,4';
// Bóng cạnh phía ngón út (ánh sáng từ phía trên bên trái) → ngón tròn, có khối
const FINGER_SHADE_D = 'M14,-96 C22,-88 24,-72 25,-56 C27,-36 28,-14 27,4 L18,4 C20,-18 20,-40 18,-60 C16,-76 16,-88 14,-96 Z';
const NAIL_D = 'M-12,-86 C-12,-96 -6,-100.5 0,-100.5 C6,-100.5 12,-96 12,-86 C12,-82 7,-79.5 0,-79.5 C-7,-79.5 -12,-82 -12,-86 Z';
// Ngón cái nằm nghiêng: thân hơi cong, móng ở cạnh ngoài
const THUMB_D = 'M-26,10 C-31,-18 -27,-48 -19,-72 C-13,-92 -5,-103 4,-103 C15,-102 22,-93 22,-78 C22,-58 25,-28 30,10';
const THUMB_NAIL_D = 'M-4,-98 C-12,-98 -17,-91 -17,-82 C-17,-76 -14,-72 -10,-72 C-6,-72 -4,-78 -3,-86 C-2,-92 -1,-98 -4,-98 Z';
// Mu bàn tay: mép trên là "cầu" khớp ngón; mờ dần xuống dưới (gradient) — không che phần dưới phím
const PALM_D = 'M-150,10 C-152,-12 -128,-24 -100,-22 C-40,-30 40,-28 104,-18 C128,-14 146,-4 148,14 L150,120 L-158,120 Z';

const STYLE_ID = 'kb-hand-style';
const CSS = `
.kb-hand{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:visible}
.kb-hand .kh-hand{opacity:0;transition:opacity .45s ease}
.kb-hand .kh-hand.show{opacity:.9}
.kb-hand .kh-hand.show.lv1{opacity:.46}
.kb-hand .kh-hand.show.lv2{opacity:.17}
.keyboard.demo-hand-on .kb-hand{display:none}
.kb-hand .kh-p{transition:transform .34s cubic-bezier(.3,.7,.25,1)}
.kb-hand .kh-hand.shift .kh-p{transition-duration:.55s}
.kb-hand .kh-hand.instant .kh-p{transition:none}
.kb-hand .kh-skin{stroke-width:2.2px;vector-effect:non-scaling-stroke}
.kb-hand .kh-line{fill:none;stroke-linecap:round;vector-effect:non-scaling-stroke}
.kb-hand .kh-glow{display:none;fill:none;stroke-width:12px;vector-effect:non-scaling-stroke;opacity:.6}
.kb-hand .kh-f.on .kh-glow{display:inline}
.kb-hand .kh-tint{opacity:0}
.kb-hand .kh-f.on .kh-tint{opacity:.34}
.kb-hand .kh-contact{opacity:.2}
.kb-hand .kh-f.on .kh-contact{opacity:.45}
.kb-hand .kh-num circle{fill:#fff;stroke-width:2px}
.kb-hand .kh-num text{font-family:var(--font-display,inherit);font-weight:800;text-anchor:middle;dominant-baseline:central}
.kb-hand .kh-num.on circle{stroke:#fff;stroke-width:3px}
.kb-hand .kh-num.on text{fill:#fff}
.kb-hand .kh-keydown{opacity:0}
.kb-hand .kh-x-under>.kh-art{transform:translate(0,-100px) scale(.86,.92) translate(0,100px);opacity:.75;transition:transform .3s,opacity .3s}
.kb-hand .kh-x-over>.kh-art{transform:translate(0,-100px) scale(1.14) translate(0,100px);transition:transform .3s}
@media (prefers-reduced-motion:no-preference){
.kb-hand .kh-hand.press .kh-f.on>.kh-art{animation:kh-press 1.8s ease-in-out infinite}
.kb-hand .kh-hand.press .kh-palm>.kh-art{animation:kh-weight 1.8s ease-in-out infinite}
.kb-hand .kh-hand.press .kh-keydown{animation:kh-keydown 1.8s ease-in-out infinite}
}
@keyframes kh-press{0%,18%,100%{transform:translate(0,-100px) scale(1,1) translate(0,100px)}45%,66%{transform:translate(0,-100px) scale(.95,.88) translate(0,100px)}}
@keyframes kh-weight{0%,18%,100%{transform:translate(0,0)}45%,66%{transform:translate(0,-5px)}}
@keyframes kh-keydown{0%,18%,100%{opacity:0}45%,66%{opacity:.32}}
@media (prefers-reduced-motion:reduce){.kb-hand .kh-p,.kb-hand .kh-hand,.kb-hand .kh-art{transition:none!important;animation:none!important}}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.append(s);
}

let uid = 0;

interface HandEls {
  g: SVGGElement;
  parts: SVGGElement[]; // 0 = ngón cái … 4 = ngón út
  palm: SVGGElement;
  nums: SVGGElement[];
  keyDown: SVGRectElement;
  frame: HandFrame | null;
  /** Nốt đơn gần nhất của tay này (để nhận ra luồn / vắt ngón) */
  lastNote: FingerNote | null;
  shown: boolean;
  timers: number[];
}

/** Một bàn tay (SVG): ngón cái → mu bàn tay → ngón 2–5 → số ngón. */
function buildHand(svg: SVGSVGElement, defs: SVGDefsElement, hand: Hand): HandEls {
  const id = `kh${++uid}`;
  const c = COLORS[hand];
  defs.insertAdjacentHTML(
    'beforeend',
    `<linearGradient id="${id}-skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d99d79"/><stop offset=".14" stop-color="#efc09d"/><stop offset=".38" stop-color="#ffeadb"/>
      <stop offset=".58" stop-color="#f9d7bd"/><stop offset=".84" stop-color="#f2c6a5"/><stop offset="1" stop-color="#f7d3b7"/></linearGradient>
    <linearGradient id="${id}-fedge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.line}"/><stop offset=".7" stop-color="${c.line}"/><stop offset="1" stop-color="${c.line}" stop-opacity=".1"/></linearGradient>
    <linearGradient id="${id}-tedge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.line}"/><stop offset=".45" stop-color="${c.line}" stop-opacity=".8"/><stop offset=".85" stop-color="${c.line}" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}-on" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.line}"/><stop offset=".5" stop-color="${c.tint}"/><stop offset="1" stop-color="${c.glow}"/></linearGradient>
    <linearGradient id="${id}-palm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f7d3b6"/><stop offset=".22" stop-color="#f4c9a8" stop-opacity=".95"/>
      <stop offset=".4" stop-color="#f1c4a2" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}-thumb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eab18d"/><stop offset=".25" stop-color="#fbdcc4"/><stop offset=".6" stop-color="#f6cdae" stop-opacity=".9"/>
      <stop offset="1" stop-color="#f3c6a4" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}-tint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.glow}"/><stop offset="1" stop-color="${c.line}"/></linearGradient>
    <linearGradient id="${id}-tthumb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.glow}"/><stop offset=".6" stop-color="${c.line}" stop-opacity=".6"/><stop offset="1" stop-color="${c.line}" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}-edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.line}" stop-opacity=".7"/><stop offset="1" stop-color="${c.line}" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}-kd" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b1640" stop-opacity=".9"/><stop offset="1" stop-color="#1b1640" stop-opacity="0"/></linearGradient>`,
  );
  const g = el('g', { class: `kh-hand kh-${hand.toLowerCase()}` }, svg);
  const keyDown = el('rect', { class: 'kh-keydown', x: 0, y: 0, width: 0, height: 0, fill: `url(#${id}-kd)` }, g);
  const mkFinger = (n: number) => {
    const p = el('g', { class: `kh-p kh-f kh-f${n}`, 'data-f': n });
    const art = el('g', { class: 'kh-art' }, p);
    el('ellipse', { class: 'kh-contact', cx: n === 1 ? -4 : 0, cy: -99, rx: 24, ry: 9, fill: '#1b1530' }, art);
    el('path', { class: 'kh-glow', d: n === 1 ? THUMB_D : FINGER_D, stroke: c.glow }, art);
    el('path', { class: 'kh-skin', d: n === 1 ? THUMB_D : FINGER_D, fill: `url(#${id}-${n === 1 ? 'thumb' : 'skin'})`, stroke: `url(#${id}-${n === 1 ? 'tedge' : 'fedge'})` }, art);
    if (n > 1) el('path', { d: FINGER_SHADE_D, fill: '#b9805f', opacity: 0.22 }, art);
    el('path', { class: 'kh-tint', d: n === 1 ? THUMB_D : FINGER_D, fill: `url(#${id}-${n === 1 ? 'tthumb' : 'tint'})` }, art);
    if (n === 1) {
      el('path', { class: 'kh-line', d: 'M-14,-58 Q2,-52 20,-60', stroke: '#d79a78', 'stroke-width': 1.6 }, art);
      el('path', { d: THUMB_NAIL_D, fill: '#fff5ef', stroke: '#e3a98b', 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke' }, art);
      el('ellipse', { cx: 6, cy: -64, rx: 9, ry: 14, fill: '#fff', opacity: 0.32 }, art);
    } else {
      // vệt sáng ở đốt giữa (chỗ ngón cong lên cao nhất) + nếp đốt + móng ở đầu ngón (ngón cong → thấy móng gần đầu)
      el('ellipse', { cx: 0, cy: -55, rx: 14, ry: 8, fill: '#fff', opacity: 0.5 }, art);
      el('path', { class: 'kh-line', d: 'M-17,-44 Q0,-38 17,-44', stroke: '#d9a080', 'stroke-width': 1.6 }, art);
      el('path', { class: 'kh-line', d: 'M-14,-74 Q0,-69 14,-74', stroke: '#d9a080', 'stroke-width': 1.4 }, art);
      el('path', { d: NAIL_D, fill: '#fff5ef', stroke: '#e3a98b', 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke' }, art);
      // khớp ngón (một "mố" của cây cầu khớp)
      el('ellipse', { cx: 0, cy: -2, rx: 20, ry: 11, fill: '#fff', opacity: 0.38 }, art);
    }
    return p;
  };
  const thumb = mkFinger(1);
  g.append(thumb);
  const palm = el('g', { class: 'kh-p kh-palm' }, g);
  const palmArt = el('g', { class: 'kh-art' }, palm);
  el('path', { d: PALM_D, fill: `url(#${id}-palm)` }, palmArt);
  // dáng mu bàn tay (hai cạnh mảnh, mờ dần — không che phần dưới phím)
  el('path', { class: 'kh-line', d: 'M-136,-10 C-152,14 -156,50 -146,96 M140,-4 C152,16 156,52 150,96', stroke: `url(#${id}-edge)`, 'stroke-width': 2 }, palmArt);
  // cầu khớp ngón: vệt sáng vòm qua bốn khớp
  el('path', { class: 'kh-line', d: 'M-126,-8 C-60,-26 60,-24 128,-4', stroke: '#fff', 'stroke-width': 4, opacity: 0.6 }, palmArt);
  el('path', { class: 'kh-line', d: 'M-140,2 C-120,-18 120,-16 144,6', stroke: c.line, 'stroke-width': 2, opacity: 0.55 }, palmArt);
  const parts = [thumb];
  for (let n = 2; n <= 5; n++) {
    const f = mkFinger(n);
    g.append(f);
    parts.push(f);
  }
  const nums = [1, 2, 3, 4, 5].map((n) => {
    const ng = el('g', { class: 'kh-p kh-num', 'data-n': n }, g);
    el('circle', { cx: 0, cy: 0, r: 12, stroke: c.line }, ng);
    const t = el('text', { x: 0, y: 1, fill: c.dark }, ng);
    t.textContent = String(n);
    return ng;
  });
  return { g, parts, palm, nums, keyDown, frame: null, lastNote: null, shown: false, timers: [] };
}

const tf = (p: Part, dir: number) => `translate(${p.x}px,${p.y}px) scale(${dir},1) rotate(${p.rot}deg) scale(${p.sx},${p.sy})`;

export interface KeyboardHandOptions {
  /** Kế hoạch thế tay của bài (planFromTune) — không có: tự suy từ phím đích */
  plan?: HandPlan | null;
  /** Quy tắc "Tự động" (ghostAuto) — nhận thế tay đang hiện của từng tay */
  auto: (positions: PositionId[]) => boolean;
  /** Công tắc (mặc định đọc ghostMode()) */
  mode?: () => GhostMode;
}

/** Lớp bàn tay mờ gắn vào một PianoKeyboard: tự theo phím đích (setTargets) và kết quả đàn (setResult). */
export class KeyboardHand {
  readonly svg: SVGSVGElement;
  private hands: Record<Hand, HandEls>;
  private W = 0;
  private H = 0;
  private raf = 0;
  private ro: ResizeObserver | null = null;
  private unwatch: () => void;
  private targets: KeyTarget[] = [];
  private streak = 0;
  private cursor: Record<Hand, number> = { RH: 0, LH: 0 };
  private dead = false;

  constructor(
    private readonly kb: PianoKeyboard,
    private readonly o: KeyboardHandOptions,
  ) {
    ensureStyle();
    this.svg = el('svg', { class: 'kb-hand', 'aria-hidden': 'true', focusable: 'false' });
    const defs = el('defs', {}, this.svg);
    this.hands = { LH: buildHand(this.svg, defs, 'LH'), RH: buildHand(this.svg, defs, 'RH') };
    kb.el.append(this.svg);
    this.unwatch = kb.watch((e) => {
      if (e.type === 'targets') {
        this.targets = e.targets;
        this.schedule();
      } else if (e.type === 'result') {
        if (e.kind === 'good') this.streak++;
        else if (e.kind === 'heard') this.streak = 0;
        this.schedule();
      } else if (e.type === 'range') {
        kb.el.append(this.svg);
        this.measure();
        this.schedule();
      } else if (e.type === 'destroy') this.destroy();
    });
    // Nạp muộn: phím đích có thể đã sáng trước khi lớp này có mặt
    this.targets = [...kb.targets];
    if (this.targets.length) this.schedule();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => {
        this.measure();
        this.schedule(true);
      });
      this.ro.observe(kb.el);
    }
  }

  /** Đọc lại công tắc (sau khi bé / bố mẹ đổi "✋ Hiện bàn tay"). */
  refresh(): void {
    this.schedule();
  }

  private measure(): void {
    this.W = this.kb.el.clientWidth;
    this.H = this.kb.el.clientHeight;
    if (this.W && this.H) this.svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
  }

  private resized = false;
  private schedule(resized = false): void {
    if (this.dead) return;
    this.resized ||= resized;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const r = this.resized;
      this.resized = false;
      this.update(r);
    });
  }

  private hideHand(h: HandEls): void {
    h.g.classList.remove('show', 'press');
    h.shown = false;
    h.frame = null;
    h.lastNote = null;
    h.timers.forEach((t) => window.clearTimeout(t));
    h.timers = [];
  }

  private update(resized: boolean): void {
    if (this.dead) return;
    if (!this.W || !this.H) this.measure();
    const ts = this.targets.filter((t) => t.finger);
    if (!ts.length || !this.W) {
      this.hideHand(this.hands.RH);
      this.hideHand(this.hands.LH);
      return;
    }
    const per: Record<Hand, FingerNote[]> = { RH: [], LH: [] };
    for (const t of ts) {
      let midi: number;
      try {
        midi = pitchToMidi(t.pitch);
      } catch {
        continue;
      }
      per[t.hand ?? (midi < 60 ? 'LH' : 'RH')].push({ midi, finger: t.finger!, pitch: t.pitch });
    }
    // Thế tay mới của từng tay
    const next: Partial<Record<Hand, { frame: HandFrame; cross: Crossing }>> = {};
    for (const hand of ['RH', 'LH'] as const) {
      const ns = per[hand];
      if (!ns.length) continue;
      const entry = this.lookup(hand, ns);
      const h = this.hands[hand];
      const prev = h.frame;
      const cross = () => (ns.length === 1 ? crossingOf(h.lastNote, ns[0], hand) : null);
      if (entry) next[hand] = { frame: entry.frame, cross: consistent(prev, ns) ? null : entry.cross ?? cross() };
      else {
        const fr = frameFromTargets(ns, hand, prev);
        if (fr) next[hand] = { frame: fr, cross: fr === prev ? null : cross() };
      }
      h.lastNote = ns.length === 1 ? ns[0] : null;
    }
    const positions = (['RH', 'LH'] as const).flatMap((hd) => {
      const f = next[hd]?.frame ?? this.hands[hd].frame;
      return f ? [framePositionId(f, hd)] : [];
    });
    const visible = ghostVisible((this.o.mode ?? ghostMode)(), this.o.auto(positions));
    const u = (this.kb.whiteKeyWidth * this.W) / 100;
    for (const hand of ['RH', 'LH'] as const) {
      const h = this.hands[hand];
      const nx = next[hand];
      if (!visible || (!nx && !h.shown)) {
        this.hideHand(h);
        continue;
      }
      const frame = nx?.frame ?? h.frame!;
      const active = new Set(per[hand].map((n) => n.finger));
      const moved = !!h.frame && !sameFrame(h.frame, frame);
      this.place(h, hand, frame, u, !h.shown || resized, moved ? nx?.cross ?? null : null, moved, active, per[hand]);
    }
  }

  private lookup(hand: Hand, ns: FingerNote[]): PlanEntry | null {
    const list = this.o.plan?.[hand];
    if (!list?.length) return null;
    const key = planKey(ns);
    const n = list.length;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor[hand] + k) % n;
      if (list[i].key === key) {
        this.cursor[hand] = i;
        return list[i];
      }
    }
    return null;
  }

  private tipsOf(frame: HandFrame): Array<TipIn | null> {
    return frame.map((m) => {
      if (m === null) return null;
      const g = this.kb.keyCenter(midiToPitch(m));
      return g ? { x: (g.center * this.W) / 100, black: g.black } : null;
    });
  }

  private place(
    h: HandEls,
    hand: Hand,
    frame: HandFrame,
    u: number,
    instant: boolean,
    cross: Crossing,
    moved: boolean,
    active: Set<number>,
    notes: FingerNote[],
  ): void {
    const dir = dirOf(hand);
    const tips = this.tipsOf(frame);
    if (tips.every((t) => !t)) return this.hideHand(h);
    const pose = handPose(tips, hand, u, this.H);
    h.timers.forEach((t) => window.clearTimeout(t));
    h.timers = [];
    h.g.classList.toggle('instant', instant);
    h.g.classList.toggle('shift', moved && !cross);
    // Số ngón: cỡ theo phím
    const r = Math.max(10, Math.min(15, 0.2 * u));
    const applyPart = (i: number) => {
      h.parts[i].style.transform = tf(pose.fingers[i], dir);
      h.nums[i].style.transform = `translate(${pose.nums[i].x}px,${pose.nums[i].y}px)`;
    };
    const applyAll = () => {
      for (let i = 0; i < 5; i++) applyPart(i);
      h.palm.style.transform = tf(pose.palm, dir);
    };
    for (const ng of h.nums) {
      const c = ng.firstChild as SVGCircleElement;
      if (c.getAttribute('r') !== String(r)) {
        c.setAttribute('r', String(r));
        (ng.lastChild as SVGTextElement).setAttribute('font-size', String(Math.round(r * 1.3)));
      }
    }
    // Ngón luồn / vắt đi TRƯỚC, cả bàn tay theo sau
    const crossers = cross === 'under' ? [0] : cross === 'over' ? [1, 2, 3].filter((i) => frame[i] !== null && notes.some((n) => n.finger === i + 1)) : [];
    if (!instant && crossers.length) {
      const cls = cross === 'under' ? 'kh-x-under' : 'kh-x-over';
      for (const i of crossers) {
        h.parts[i].classList.add(cls);
        if (cross === 'over') h.g.insertBefore(h.parts[i], h.nums[0]); // vắt QUA: vẽ trên các ngón khác
        applyPart(i);
      }
      h.timers.push(
        window.setTimeout(() => applyAll(), 320),
        window.setTimeout(() => {
          for (const i of crossers) {
            h.parts[i].classList.remove(cls);
            if (cross === 'over') h.g.insertBefore(h.parts[i], h.parts[i + 1] ?? h.nums[0]);
          }
        }, 760),
      );
    } else applyAll();
    // Ngón đang cần đàn: sáng; một ngón mỗi tay → "nhấn" nhẹ + phím lún
    for (let i = 0; i < 5; i++) {
      const on = active.has(i + 1);
      h.parts[i].classList.toggle('on', on);
      h.nums[i].classList.toggle('on', on);
      (h.nums[i].firstChild as SVGCircleElement).style.fill = on ? COLORS[hand].line : '';
    }
    const single = active.size === 1 ? notes.find((n) => active.has(n.finger)) : undefined;
    h.g.classList.toggle('press', !!single);
    if (single) {
      const g = this.kb.keyCenter(midiToPitch(single.midi));
      if (g) {
        const w = g.black ? u * 0.62 : u;
        h.keyDown.setAttribute('x', ((g.center * this.W) / 100 - w / 2).toFixed(1));
        h.keyDown.setAttribute('width', w.toFixed(1));
        h.keyDown.setAttribute('height', (this.H * (g.black ? 0.35 : 0.22)).toFixed(1));
      }
    }
    const lv = ghostLevel(this.streak, moved);
    h.g.classList.toggle('lv1', lv === 1);
    h.g.classList.toggle('lv2', lv === 2);
    h.g.classList.add('show');
    h.shown = true;
    h.frame = frame;
    if (instant) {
      // bật lại chuyển động sau khi trình duyệt đã vẽ vị trí mới
      h.timers.push(window.setTimeout(() => h.g.classList.remove('instant'), 60));
    }
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.unwatch();
    for (const h of Object.values(this.hands)) h.timers.forEach((t) => window.clearTimeout(t));
    this.svg.remove();
  }
}

const sameFrame = (a: HandFrame, b: HandFrame) => a.every((m, i) => m === b[i]);
