/**
 * 🔢 "BẢN ĐỒ NGÓN" phủ trên bàn phím ảo (trước đây: "bàn tay mờ" — bé và bố mẹ chê hình bàn tay vẽ xấu, 2026-10-18 OWNER
 * quyết định BỎ HẲN hình bàn tay người): chỉ cho bé THẾ TAY bằng các HUY HIỆU SỐ NGÓN 1–5 nằm trên đúng năm phím của thế tay.
 *
 * ── HÌNH ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Năm huy hiệu tròn nhỏ (nền trắng, viền màu tay, số màu tay) trên năm phím của thế tay — nhẹ nhàng, không che tên nốt.
 * Phím CẦN ĐÀN: huy hiệu của ngón đó PHÓNG TO, tô đặc màu tay (tay phải xanh dương, tay trái cam), có vòng "thở" nhẹ và
 * chữ P / T nhỏ (không chỉ dựa vào màu) — thay chỗ số ngón to sẵn có của phím (PianoKey) để không hiện hai số trùng nhau.
 * Đổi thế = các huy hiệu TRƯỢT sang phím mới; luồn ngón cái (thumb-under) / vắt ngón (3-over) = huy hiệu ngón luồn / vắt
 * đi TRƯỚC kèm MŨI TÊN CONG nhỏ (luồn: vòng phía dưới; vắt: vòng phía trên), các huy hiệu khác theo sau.
 * Góc trái bàn phím: chip "✋ 1–5" (emoji gốc của máy) — chạm để xem "1 = ngón cái … 5 = ngón út".
 *
 * ── THẾ TAY ──────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Bài hát: planFromTune() chia mỗi bè thành các đoạn "một thế tay" (năm ngón không đổi phím) bằng số ngón GHI SẴN trong
 * bài; nốt mâu thuẫn với thế đang có (ngón đã ở phím khác / thứ tự ngón đảo) → thế mới. Ngón chưa có nốt trong đoạn được
 * điền theo các nốt của bài (giữ dấu thăng/giáng: thế Rê có Fa♯, gam Fa có Si♭).
 * Màn khác (bài học từng nốt, hát rồi đàn, khởi động): frameFromTargets() — giữ thế cũ nếu vẫn đúng, không thì tìm
 * trong bảng thế tay (POSITIONS: Đô, Sol, Rê, Đô thứ, La thứ, Đô giữa, Đô cao, "Đô nhích lên" Sol–La), cuối cùng tự điền.
 *
 * ── KHI NÀO HIỆN / MỜ DẦN (quy tắc đơn giản — giữ nguyên như bàn tay mờ cũ) ────────────────────────────────────────────
 * Công tắc "🔢 Hiện số ngón" (Tùy chọn của màn bài hát; lưu trên máy này): Tự động (mặc định) · Luôn hiện · Ẩn.
 * Tự động (ghostAuto): HIỆN nếu tuần ≤ 8, hoặc bài/bước dùng THẾ TAY KHÁC thế Đô (Sol, Rê, Đô thứ, La thứ, Đô giữa,
 * Đô cao, đổi thế / luồn ngón) mà bé CHƯA THUỘC bài đó; còn lại ẨN (phím đích vẫn có số ngón to của chính nó).
 * Mờ dần trong lúc chơi (ghostLevel): đúng 3 nốt liền → các huy hiệu PHỤ mờ hơn; đúng 8 nốt liền → gần như trong suốt
 * (huy hiệu của phím cần đàn luôn rõ); đàn sai một nốt → rõ lại ngay; mỗi lần ĐỔI THẾ / luồn ngón → rõ lại cho nốt đó.
 * "Xem mẫu": chính bản đồ ngón này ĐÀN CẢ BÀI theo tiếng (demoHands.ts → demoBegin/demoKey/demoMove…; luôn rõ, không theo
 * công tắc / mờ dần): phím kêu sáng lên (demoHands) và huy hiệu ngón của nó NẢY TO đúng lúc; hết mẫu → demoEnd().
 *
 * TRUNG THỰC: micro chỉ nghe được CAO ĐỘ — không biết bé dùng ngón nào → bản đồ ngón chỉ là HƯỚNG DẪN, không bao giờ báo
 * "sai ngón". Không đụng tới chấm điểm / micro.
 *
 * HIỆU NĂNG: SVG + CSS transform/transition (không tính bố cục mỗi khung hình), cập nhật gộp trong MỘT
 * requestAnimationFrame khi phím đích đổi (không có vòng lặp rAF). prefers-reduced-motion → không trượt, không thở, không
 * nảy; huy hiệu đổi chỗ / phóng to tức thì. Mô-đun nạp muộn (import động) để không làm nặng gói chính.
 * (Tên lớp KeyboardHand / ghost* giữ nguyên để không đổi các màn đang dùng.)
 */
import { POSITIONS, RH_SOL_LA, fingerFor, type Hand, type PositionId } from '../../piano/fingering';
import type { KeyTarget, PianoKeyboard } from '../../piano/PianoKeyboard';
import { midiToPitch, pitchToMidi, type Pitch } from '../../piano/pitchTable';
import { onsets, pitchesOf, type Tune } from '../../music/tune';
import { badgeY } from './fingerMapGeo';

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
// Hình học (hàm thuần — có test): chỗ đặt huy hiệu số ngón trên phím
// ======================================================================================================================

export interface TipIn {
  /** Tâm phím (px) */
  x: number;
  black: boolean;
}

export interface BadgeSpot {
  x: number;
  y: number;
  black: boolean;
  /** Ngón "lơ lửng" (không có phím riêng trong thế) — vẽ mờ, viền đứt */
  float: boolean;
}

export { MAP_GEO } from './fingerMapGeo';

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Bán kính huy hiệu nhỏ (11–16) / huy hiệu phím cần đàn (18–28) (px) theo bề ngang phím trắng `u`. */
export function badgeRadius(u: number, big = false): number {
  return big ? r1(clampN(0.37 * u, 18, 28)) : r1(clampN(0.22 * u, 11, 16));
}

/** Chỗ đặt 5 huy hiệu: `tips[i]` = phím của ngón i+1 (null = lơ lửng: nội suy giữa hai ngón kề / kéo dài một phím). */
export function badgeSpots(tipsIn: Array<TipIn | null>, hand: Hand, u: number, H: number): BadgeSpot[] {
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
    else xs[i] = dir * u * (i - 2);
  }
  const whiteY = badgeY(H, false);
  const blackY = badgeY(H, true);
  return xs.map((x, i) => {
    const black = !!tipsIn[i]?.black;
    return { x: r1(x as number), y: r1(black ? blackY : whiteY), black, float: !tipsIn[i] };
  });
}

/**
 * Mũi tên cong cho ngón LUỒN (đi vòng phía dưới) / VẮT (đi vòng phía trên) từ `a` tới `b`; trả về {đường, đầu mũi tên}.
 * Đầu mũi tên lùi lại một bán kính huy hiệu để không đè lên số.
 */
export function crossArc(a: { x: number; y: number }, b: { x: number; y: number }, cross: Exclude<Crossing, null>, H: number, rBig: number): { line: string; head: string } {
  const bend = 0.17 * H * (cross === 'under' ? 1 : -1);
  const mid = { x: (a.x + b.x) / 2, y: (cross === 'under' ? Math.max(a.y, b.y) : Math.min(a.y, b.y)) + bend };
  // điểm cuối lùi ra khỏi huy hiệu đích theo hướng tiếp tuyến
  const tx = b.x - mid.x;
  const ty = b.y - mid.y;
  const L = Math.hypot(tx, ty) || 1;
  const end = { x: b.x - (tx / L) * (rBig + 4), y: b.y - (ty / L) * (rBig + 4) };
  const start = { x: a.x + ((mid.x - a.x) / (Math.hypot(mid.x - a.x, mid.y - a.y) || 1)) * 8, y: a.y + ((mid.y - a.y) / (Math.hypot(mid.x - a.x, mid.y - a.y) || 1)) * 8 };
  const ang = Math.atan2(ty, tx);
  const hd = 11;
  const l = { x: end.x - hd * Math.cos(ang - 0.55), y: end.y - hd * Math.sin(ang - 0.55) };
  const r = { x: end.x - hd * Math.cos(ang + 0.55), y: end.y - hd * Math.sin(ang + 0.55) };
  const f = (p: { x: number; y: number }) => `${r1(p.x)} ${r1(p.y)}`;
  return { line: `M${f(start)} Q${f(mid)} ${f(end)}`, head: `M${f(l)} L${f(end)} L${f(r)}` };
}

// ======================================================================================================================
// Lớp phủ
// ======================================================================================================================

const SVGNS = 'http://www.w3.org/2000/svg';
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
}

/** Màu tay (cùng màu phím đích trong theme.css: --rh / --lh) */
const COLORS: Record<Hand, { line: string; dark: string; soft: string }> = {
  RH: { line: '#2b7bd0', dark: '#155a9e', soft: '#e6f1ff' },
  LH: { line: '#e8890c', dark: '#a55d00', soft: '#fff0dd' },
};

const STYLE_ID = 'kb-fmap-style';
const CSS = `
.kb-hand{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:visible}
.kb-hand .kh-hand{opacity:0;transition:opacity .35s ease}
.kb-hand .kh-hand.show{opacity:1}
.keyboard.demo-hand-on .kb-hand,.keyboard.demo-hand-on .kh-legend{display:none}
.kb-hand .kh-b{transition:transform .34s cubic-bezier(.3,.7,.25,1),opacity .3s}
.kb-hand .kh-hand.shift .kh-b{transition-duration:.55s,.3s}
.kb-hand.demo .kh-b{transition-duration:var(--kh-mv,.2s),.3s;transition-timing-function:cubic-bezier(.35,.1,.25,1),ease}
.kb-hand .kh-hand.instant .kh-b{transition:none}
.kb-hand .kh-b.arcing{transition-duration:var(--kh-step,.16s),.3s;transition-timing-function:linear,ease}
.kb-hand .kh-bi{transition:transform .26s cubic-bezier(.3,1.6,.5,1)}
.kb-hand .kh-b.on .kh-bi{transform:scale(var(--kh-big,1.9))}
.kb-hand .kh-hand.lv1 .kh-b:not(.on){opacity:.5}
.kb-hand .kh-hand.lv2 .kh-b:not(.on){opacity:.2}
.kb-hand .kh-disc{fill:#fff;stroke-width:2.5px;vector-effect:non-scaling-stroke}
.kb-hand .kh-shadow{fill:#1b1640;opacity:.18}
.kb-hand .kh-b.float .kh-disc{fill:rgba(255,255,255,.7);stroke-dasharray:4 3}
.kb-hand .kh-b.float{opacity:.55}
.kb-hand .kh-num{font-family:var(--font-display,inherit);font-weight:800;text-anchor:middle;dominant-baseline:central}
.kb-hand .kh-b.on .kh-disc{stroke:#fff;stroke-width:3px}
.kb-hand .kh-rh .kh-b.on .kh-disc{fill:#2b7bd0}
.kb-hand .kh-lh .kh-b.on .kh-disc{fill:#e8890c}
.kb-hand .kh-b.on .kh-shadow{opacity:.3}
.kb-hand .kh-b.on .kh-num{fill:#fff}
.kb-hand .kh-tag,.kb-hand .kh-pulse{display:none}
.kb-hand .kh-b.on .kh-tag,.kb-hand .kh-b.on .kh-pulse{display:inline}
.kb-hand .kh-tag text{font-family:var(--font-display,inherit);font-weight:800;text-anchor:middle;dominant-baseline:central;fill:#fff}
.kb-hand .kh-pulse{fill:none;stroke-width:3px;vector-effect:non-scaling-stroke;opacity:.5}
.kb-hand .kh-arc{opacity:0;transition:opacity .25s}
.kb-hand .kh-arc.show{opacity:.95}
.kb-hand .kh-arc path{fill:none;stroke-width:3.5px;stroke-linecap:round;stroke-linejoin:round}
.kb-hand .kh-arc .kh-arc-l{stroke-dasharray:7 7}
@media (prefers-reduced-motion:no-preference){
.kb-hand .kh-b.on .kh-pulse{animation:kh-pulse 1.6s ease-out infinite}
.kb-hand .kh-arc.show .kh-arc-l{animation:kh-march .6s linear infinite}
.kb-hand.demo .kh-b.bA .kh-bi{animation:kh-bA .3s ease-out}
.kb-hand.demo .kh-b.bB .kh-bi{animation:kh-bB .3s ease-out}
.kh-pedal .kh-pd{transition:transform .08s ease-out}
}
@keyframes kh-pulse{0%{transform:scale(1);opacity:.55}70%,100%{transform:scale(1.65);opacity:0}}
@keyframes kh-march{to{stroke-dashoffset:-14}}
@keyframes kh-bA{0%{transform:scale(1.9)}45%{transform:scale(1.25) translate(0,-6px)}100%{transform:scale(1)}}
@keyframes kh-bB{0%{transform:scale(1.9)}45%{transform:scale(1.25) translate(0,-6px)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.kb-hand .kh-b,.kb-hand .kh-bi,.kb-hand .kh-hand,.kb-hand .kh-arc{transition:none!important;animation:none!important}}
.keyboard .key.fm-own .key-badge{visibility:hidden}
.kh-legend{position:absolute;left:6px;top:6px;z-index:7;display:none;align-items:center;gap:4px;height:34px;padding:0 11px 0 7px;border:2px solid rgba(255,255,255,.9);border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 2px 6px rgba(27,22,64,.25);font:800 15px/1 var(--font-display,inherit);color:#4a3d8f;cursor:pointer;touch-action:manipulation}
.kh-legend.show{display:flex}
.kh-legend .kh-emo{font-size:20px;line-height:1}
.kh-legend-pop{position:absolute;left:6px;top:46px;z-index:8;display:none;flex-direction:column;gap:5px;padding:10px 14px 10px 10px;border-radius:16px;background:#fff;box-shadow:0 6px 18px rgba(27,22,64,.28);font:700 16px/1.15 var(--font-body,inherit);color:#2c2752}
.kh-legend-pop.show{display:flex}
.kh-legend-pop .kh-row{display:flex;align-items:center;gap:8px;white-space:nowrap}
.kh-legend-pop .kh-n{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;border:2.5px solid #2b7bd0;color:#155a9e;font:800 15px/1 var(--font-display,inherit)}
.kh-pedal{position:absolute;right:6px;top:6px;z-index:6;pointer-events:none;display:flex;align-items:center;gap:4px;padding:3px 9px 3px 5px;border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 1px 4px rgba(27,22,64,.25);font:800 14px/1 var(--font-display,inherit);color:#5b5480}
.kh-pedal svg{width:28px;height:28px;overflow:visible}
.kh-pedal .kh-pd{fill:#c9c3dd}
.kh-pedal .kh-ar{fill:none;stroke:#e8a400;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:0}
.kh-pedal.down{background:#fff4c2;color:#7a4b00}
.kh-pedal.down .kh-pd{fill:#e8a400;transform:translate(0,3px)}
.kh-pedal.down .kh-ar{opacity:1}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.append(s);
}

interface HandEls {
  g: SVGGElement;
  /** 0 = ngón cái … 4 = ngón út */
  badges: SVGGElement[];
  arc: SVGGElement;
  frame: HandFrame | null;
  spots: BadgeSpot[] | null;
  /** Nốt đơn gần nhất của tay này (để nhận ra luồn / vắt ngón) */
  lastNote: FingerNote | null;
  shown: boolean;
  timers: number[];
}

/** Một tay (SVG): mũi tên cong luồn / vắt (dưới cùng) + 5 huy hiệu số ngón. */
function buildHand(svg: SVGSVGElement, hand: Hand): HandEls {
  const c = COLORS[hand];
  const g = el('g', { class: `kh-hand kh-${hand.toLowerCase()}` }, svg);
  const arc = el('g', { class: 'kh-arc' }, g);
  el('path', { class: 'kh-arc-l', stroke: c.line }, arc);
  el('path', { class: 'kh-arc-h', stroke: c.line }, arc);
  const badges = [1, 2, 3, 4, 5].map((n) => {
    const b = el('g', { class: `kh-b kh-b${n}`, 'data-f': n }, g);
    const bi = el('g', { class: 'kh-bi' }, b);
    el('circle', { class: 'kh-pulse', r: 12, stroke: c.line }, bi);
    el('circle', { class: 'kh-shadow', cy: 1.6, r: 12 }, bi);
    el('circle', { class: 'kh-disc', r: 12, stroke: c.line }, bi);
    const t = el('text', { class: 'kh-num', y: 0.5, fill: c.dark }, bi);
    t.textContent = String(n);
    // chữ P / T nhỏ ở góc huy hiệu (không chỉ dựa vào màu)
    const tag = el('g', { class: 'kh-tag' }, bi);
    el('rect', { rx: 2.6, fill: c.dark, stroke: '#fff', 'stroke-width': 1.2 }, tag);
    el('text', {}, tag).textContent = hand === 'RH' ? 'P' : 'T';
    return b;
  });
  return { g, badges, arc, frame: null, spots: null, lastNote: null, shown: false, timers: [] };
}

export interface KeyboardHandOptions {
  /** Kế hoạch thế tay của bài (planFromTune) — không có: tự suy từ phím đích */
  plan?: HandPlan | null;
  /** Quy tắc "Tự động" (ghostAuto) — nhận thế tay đang hiện của từng tay */
  auto: (positions: PositionId[]) => boolean;
  /** Công tắc (mặc định đọc ghostMode()) */
  mode?: () => GhostMode;
  /** (+ 2026-10-15) Chỉ dùng cho "Xem mẫu" (màn không có bản đồ ngón): bản đồ ngón của màn tạo sau sẽ thay nó */
  demoOnly?: boolean;
}

/** Bản đồ ngón đang gắn với từng bàn phím (để "Xem mẫu" dùng lại đúng lớp của màn) */
const live = new WeakMap<PianoKeyboard, KeyboardHand>();

const LEGEND_NAMES = ['ngón cái', 'ngón trỏ', 'ngón giữa', 'ngón áp út', 'ngón út'];

/** Lớp "bản đồ ngón" gắn vào một PianoKeyboard: tự theo phím đích (setTargets) và kết quả đàn (setResult). */
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
  private legend: HTMLButtonElement;
  private legendPop: HTMLDivElement;
  private legendTimer = 0;
  /** Phím (midi) đang được bản đồ ngón "nhận" số ngón to — số to của chính phím (PianoKey) tạm ẩn */
  private owned = new Set<number>();

  constructor(
    private readonly kb: PianoKeyboard,
    private readonly o: KeyboardHandOptions,
  ) {
    ensureStyle();
    const old = live.get(kb);
    if (old?.o.demoOnly && !old.demo) old.destroy();
    live.set(kb, this);
    this.svg = el('svg', { class: 'kb-hand', 'aria-hidden': 'true', focusable: 'false' });
    this.hands = { LH: buildHand(this.svg, 'LH'), RH: buildHand(this.svg, 'RH') };
    kb.el.append(this.svg);
    // Chú giải: ✋ (emoji gốc của máy) — chạm để xem tên 5 ngón
    this.legend = document.createElement('button');
    this.legend.type = 'button';
    this.legend.className = 'kh-legend';
    this.legend.setAttribute('aria-label', 'Số ngón là gì?');
    this.legend.innerHTML = '<span class="kh-emo" aria-hidden="true">✋</span><span>1–5</span>';
    this.legendPop = document.createElement('div');
    this.legendPop.className = 'kh-legend-pop';
    this.legendPop.setAttribute('role', 'note');
    this.legendPop.innerHTML = LEGEND_NAMES.map((nm, i) => `<span class="kh-row"><span class="kh-n">${i + 1}</span>= ${nm}</span>`).join('');
    // không để chạm vào chú giải thành chạm phím đàn
    for (const e of [this.legend, this.legendPop]) e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    this.legend.addEventListener('click', () => this.toggleLegend());
    this.legendPop.addEventListener('click', () => this.toggleLegend(false));
    kb.el.append(this.legend, this.legendPop);
    this.unwatch = kb.watch((e) => {
      if (e.type === 'targets') {
        this.targets = e.targets;
        this.schedule();
      } else if (e.type === 'result') {
        if (e.kind === 'good') this.streak++;
        else if (e.kind === 'heard') this.streak = 0;
        this.schedule();
      } else if (e.type === 'range') {
        kb.el.append(this.svg, this.legend, this.legendPop);
        this.owned.clear();
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
        if (this.demo) this.demoRelayout();
        else this.schedule(true);
      });
      this.ro.observe(kb.el);
    }
  }

  /** Đọc lại công tắc (sau khi bé / bố mẹ đổi "🔢 Hiện số ngón"). */
  refresh(): void {
    this.schedule();
  }

  private toggleLegend(open = !this.legendPop.classList.contains('show')): void {
    window.clearTimeout(this.legendTimer);
    this.legendPop.classList.toggle('show', open);
    if (open) this.legendTimer = window.setTimeout(() => this.legendPop.classList.remove('show'), 6000);
  }

  private syncLegend(): void {
    const on = this.hands.RH.shown || this.hands.LH.shown;
    this.legend.classList.toggle('show', on);
    if (!on) this.toggleLegend(false);
    // màu số trong chú giải theo tay đang hiện (chỉ tay trái → cam)
    const lhOnly = this.hands.LH.shown && !this.hands.RH.shown;
    this.legendPop.classList.toggle('lh', lhOnly);
    for (const n of this.legendPop.querySelectorAll<HTMLElement>('.kh-n')) {
      n.style.borderColor = lhOnly ? COLORS.LH.line : '';
      n.style.color = lhOnly ? COLORS.LH.dark : '';
    }
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
    h.g.classList.remove('show');
    h.shown = false;
    h.frame = null;
    h.spots = null;
    h.lastNote = null;
    h.timers.forEach((t) => window.clearTimeout(t));
    h.timers = [];
    h.arc.classList.remove('show');
  }

  /** Phím nào đang do bản đồ ngón hiện số to (ẩn số to của chính phím để không trùng hai số). */
  private setOwned(midis: Set<number>): void {
    const same = midis.size === this.owned.size && [...midis].every((m) => this.owned.has(m));
    if (same) return;
    this.owned = midis;
    for (const k of this.kb.el.querySelectorAll<HTMLElement>('.key[data-pitch]')) {
      let m = -1;
      try {
        m = pitchToMidi(k.dataset.pitch!);
      } catch {
        /* bỏ qua */
      }
      k.classList.toggle('fm-own', midis.has(m));
    }
  }

  private update(resized: boolean): void {
    if (this.dead || this.demo) return;
    if (!this.W || !this.H) this.measure();
    const ts = this.targets.filter((t) => t.finger);
    if (!ts.length || !this.W) {
      this.hideHand(this.hands.RH);
      this.hideHand(this.hands.LH);
      this.setOwned(new Set());
      this.syncLegend();
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
    const owned = new Set<number>();
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
      if (h.shown) for (const n of per[hand]) if (frame[n.finger - 1] === n.midi) owned.add(n.midi);
    }
    this.setOwned(owned);
    this.syncLegend();
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

  /** Cỡ huy hiệu theo phím (bán kính nhỏ + tỉ lệ phóng to cho phím cần đàn). */
  private sizeBadges(h: HandEls, u: number): void {
    const r = badgeRadius(u);
    const big = badgeRadius(u, true) / r;
    h.g.style.setProperty('--kh-big', big.toFixed(3));
    const first = h.badges[0].querySelector('.kh-disc')!;
    if (first.getAttribute('r') === String(r)) return;
    for (const b of h.badges) {
      for (const c of b.querySelectorAll('circle')) c.setAttribute('r', String(r));
      const num = b.querySelector('.kh-num')!;
      num.setAttribute('font-size', String(Math.round(r * 1.32)));
      const tag = b.querySelector('.kh-tag')!;
      const s = r * 0.62;
      tag.setAttribute('transform', `translate(${r1(r * 0.78)} ${r1(r * 0.62)})`);
      const rect = tag.querySelector('rect')!;
      rect.setAttribute('x', String(r1(-s / 2)));
      rect.setAttribute('y', String(r1(-s / 2)));
      rect.setAttribute('width', String(r1(s)));
      rect.setAttribute('height', String(r1(s)));
      tag.querySelector('text')!.setAttribute('font-size', String(r1(s * 0.78)));
    }
  }

  private moveBadge(h: HandEls, i: number, spots: BadgeSpot[]): void {
    const s = spots[i];
    h.badges[i].classList.remove('arcing');
    h.badges[i].style.transform = `translate(${s.x}px,${s.y}px)`;
    h.badges[i].classList.toggle('float', s.float);
  }

  /**
   * Huy hiệu ngón luồn / vắt đi theo ĐƯỜNG CONG trong `durS` giây (hai chặng: qua điểm giữa thấp hơn = luồn DƯỚI,
   * cao hơn = vắt QUA).
   */
  private arcMove(h: HandEls, i: number, from: BadgeSpot, to: BadgeSpot, cross: Exclude<Crossing, null>, durS: number): void {
    const b = h.badges[i];
    // vẽ trên cùng (luôn nhìn thấy); "luồn dưới" thể hiện bằng đường vòng THẤP hơn hàng số
    h.g.append(b);
    const bend = (cross === 'under' ? 0.17 : 0.13) * this.H;
    const mx = r1((from.x + to.x) / 2);
    const my = r1(cross === 'under' ? Math.max(from.y, to.y) + bend : Math.min(from.y, to.y) - bend);
    b.style.setProperty('--kh-step', `${(durS / 2).toFixed(3)}s`);
    b.classList.add('arcing');
    b.classList.toggle('float', to.float);
    b.style.transform = `translate(${mx}px,${my}px)`;
    h.timers.push(window.setTimeout(() => (b.style.transform = `translate(${to.x}px,${to.y}px)`), durS * 500));
  }

  /** Mũi tên cong của ngón luồn / vắt (từ chỗ cũ tới chỗ mới); tự tắt sau `ms`. */
  private showArc(h: HandEls, from: BadgeSpot, to: BadgeSpot, cross: Exclude<Crossing, null>, u: number, ms: number): void {
    const a = crossArc(from, to, cross, this.H, badgeRadius(u, true));
    const [line, head] = h.arc.querySelectorAll('path');
    line.setAttribute('d', a.line);
    head.setAttribute('d', a.head);
    h.arc.classList.add('show');
    h.timers.push(window.setTimeout(() => h.arc.classList.remove('show'), ms));
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
    const tips = this.tipsOf(frame);
    if (tips.every((t) => !t)) return this.hideHand(h);
    const spots = badgeSpots(tips, hand, u, this.H);
    const prevSpots = h.spots;
    h.timers.forEach((t) => window.clearTimeout(t));
    h.timers = [];
    h.arc.classList.remove('show');
    h.g.classList.toggle('instant', instant);
    h.g.classList.toggle('shift', moved && !cross);
    this.sizeBadges(h, u);
    const applyAll = () => {
      for (let i = 0; i < 5; i++) this.moveBadge(h, i, spots);
    };
    // Ngón luồn / vắt đi TRƯỚC (kèm mũi tên cong), các huy hiệu khác theo sau
    const crossers = cross === 'under' ? [0] : cross === 'over' ? [1, 2, 3].filter((i) => frame[i] !== null && notes.some((n) => n.finger === i + 1)) : [];
    if (!instant && crossers.length && prevSpots) {
      for (const i of crossers) {
        this.arcMove(h, i, prevSpots[i], spots[i], cross!, 0.32);
        this.showArc(h, prevSpots[i], spots[i], cross!, u, 1400);
      }
      h.timers.push(window.setTimeout(() => applyAll(), 320));
    } else applyAll();
    for (let i = 0; i < 5; i++) h.badges[i].classList.toggle('on', active.has(i + 1));
    const lv = ghostLevel(this.streak, moved);
    h.g.classList.toggle('lv1', lv === 1);
    h.g.classList.toggle('lv2', lv === 2);
    h.g.classList.add('show');
    h.shown = true;
    h.frame = frame;
    h.spots = spots;
    if (instant) {
      // bật lại chuyển động sau khi trình duyệt đã vẽ vị trí mới
      h.timers.push(window.setTimeout(() => h.g.classList.remove('instant'), 60));
    }
  }

  // ====================================================================================================================
  // (+ 2026-10-15) "Đàn mẫu cả bài" — demoHands.ts điều khiển theo đồng hồ âm thanh (không tự hẹn giờ)
  // ====================================================================================================================

  /** Bản đồ ngón của bàn phím này; chưa có (màn không bật) → tạo một lớp chỉ dùng cho "Xem mẫu". */
  static of(kb: PianoKeyboard): KeyboardHand {
    const cur = live.get(kb);
    return cur && !cur.dead ? cur : new KeyboardHand(kb, { auto: () => false, mode: () => 'off', demoOnly: true });
  }

  private demo = false;
  private pend: Partial<Record<Hand, { spots: BadgeSpot[] }>> = {};
  private pedalEl: HTMLDivElement | null = null;

  /** Bắt đầu mẫu: hiện (các) bản đồ ngón ở thế đầu bài — rõ, không mờ dần, không theo phím đích. */
  demoBegin(start: Partial<Record<Hand, HandFrame>>, pedal: boolean): void {
    if (this.dead) return;
    this.demo = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.svg.classList.add('demo');
    this.kb.el.append(this.svg, this.legend, this.legendPop);
    this.setOwned(new Set());
    this.measure();
    for (const hand of ['RH', 'LH'] as const) {
      const h = this.hands[hand];
      this.demoReset(h);
      const fr = start[hand];
      if (fr) this.demoPose(hand, fr, null, 0, 0, true);
    }
    this.syncLegend();
    this.pedalEl?.remove();
    this.pedalEl = null;
    if (pedal) {
      const p = document.createElement('div');
      p.className = 'kh-pedal';
      p.setAttribute('aria-hidden', 'true');
      // bàn đạp (thanh tròn) + mũi tên xuống khi đạp
      p.innerHTML =
        '<svg viewBox="0 0 28 28"><path class="kh-ar" d="M14 2 V11 M9.5 7 L14 11.5 L18.5 7"/><rect class="kh-pd" x="3" y="16" width="22" height="8" rx="4"/></svg>' +
        '<span>Pedal</span>';
      this.kb.el.append(p);
      this.pedalEl = p;
    }
  }

  private demoReset(h: HandEls): void {
    this.hideHand(h);
    h.g.classList.remove('lv1', 'lv2', 'shift');
    for (const b of h.badges) b.classList.remove('on', 'bA', 'bB');
    for (const hand of ['RH', 'LH'] as const) if (this.hands[hand] === h) delete this.pend[hand];
  }

  /**
   * Đưa bản đồ ngón tới thế `frame` trong `durS` giây. Luồn / vắt (`cross`): chỉ huy hiệu ngón `finger` đi trước (kèm
   * mũi tên cong) — các huy hiệu khác theo sau khi demoFollow().
   */
  demoPose(hand: Hand, frame: HandFrame, cross: Crossing, durS: number, finger: number, instant = false): void {
    if (this.dead || !this.demo) return;
    if (!this.W || !this.H) this.measure();
    const h = this.hands[hand];
    const tips = this.tipsOf(frame);
    if (!this.W || tips.every((t) => !t)) return;
    const u = (this.kb.whiteKeyWidth * this.W) / 100;
    const spots = badgeSpots(tips, hand, u, this.H);
    this.sizeBadges(h, u);
    this.demoFollow(hand); // lần đi trước chưa theo xong → theo ngay
    const prevSpots = h.spots;
    h.timers.forEach((t) => window.clearTimeout(t));
    h.timers = [];
    h.arc.classList.remove('show');
    h.g.style.setProperty('--kh-mv', `${Math.max(0.06, durS).toFixed(3)}s`);
    h.g.classList.toggle('instant', instant);
    const idx = finger - 1;
    if (!instant && cross && prevSpots && idx >= 0 && idx <= 3 && (cross === 'under' ? idx === 0 : idx >= 1)) {
      this.arcMove(h, idx, prevSpots[idx], spots[idx], cross, Math.max(0.12, durS));
      this.showArc(h, prevSpots[idx], spots[idx], cross, u, 900);
      this.pend[hand] = { spots };
    } else for (let i = 0; i < 5; i++) this.moveBadge(h, i, spots);
    h.frame = frame;
    h.spots = spots;
    h.shown = true;
    h.g.classList.add('show');
    if (instant) h.timers.push(window.setTimeout(() => h.g.classList.remove('instant'), 60));
  }

  demoMove(hand: Hand, frame: HandFrame, cross: Crossing, durS: number, finger: number): void {
    this.demoPose(hand, frame, cross, durS, finger);
  }

  /** Các huy hiệu còn lại theo sau ngón luồn / vắt. */
  demoFollow(hand: Hand): void {
    const p = this.pend[hand];
    if (!p) return;
    delete this.pend[hand];
    const h = this.hands[hand];
    h.g.style.setProperty('--kh-mv', '.28s');
    for (let i = 0; i < 5; i++) this.moveBadge(h, i, p.spots);
  }

  /** Ngón `finger` nhấn (huy hiệu phóng to, sáng) / nhả; nhả ngắt tiếng → nảy nhẹ. */
  demoKey(hand: Hand, finger: number, down: boolean, stac: boolean): void {
    if (this.dead || !this.demo) return;
    const h = this.hands[hand];
    const i = finger - 1;
    if (i < 0 || i > 4) return;
    const b = h.badges[i];
    b.classList.remove('bA', 'bB');
    b.classList.toggle('on', down);
    if (!down && stac) {
      // hai tên hoạt hình luân phiên → chạy lại mà không cần đọc bố cục
      const alt = h.g.dataset.b === 'A' ? 'B' : 'A';
      h.g.dataset.b = alt;
      b.classList.add(`b${alt}`);
    }
  }

  demoPedal(down: boolean): void {
    if (!this.pedalEl) return;
    this.pedalEl.classList.toggle('down', down);
    this.pedalEl.lastElementChild!.textContent = down ? 'Pedal ⬇' : 'Pedal';
  }

  /** Hết mẫu / dừng: bản đồ ngón về chế độ thường (theo phím đích + công tắc). */
  demoEnd(): void {
    if (!this.demo) return;
    this.demo = false;
    this.svg.classList.remove('demo');
    this.pedalEl?.remove();
    this.pedalEl = null;
    for (const hand of ['RH', 'LH'] as const) this.demoReset(this.hands[hand]);
    this.syncLegend();
    this.schedule();
  }

  /** Xoay màn hình giữa lúc mẫu: đặt lại bản đồ ngón đang hiện theo kích thước mới. */
  private demoRelayout(): void {
    for (const hand of ['RH', 'LH'] as const) {
      const h = this.hands[hand];
      if (h.shown && h.frame) this.demoPose(hand, h.frame, null, 0, 0, true);
    }
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    if (live.get(this.kb) === this) live.delete(this.kb);
    this.pedalEl?.remove();
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.legendTimer);
    this.ro?.disconnect();
    this.unwatch();
    for (const h of Object.values(this.hands)) h.timers.forEach((t) => window.clearTimeout(t));
    this.setOwned(new Set());
    this.svg.remove();
    this.legend.remove();
    this.legendPop.remove();
  }
}

const sameFrame = (a: HandFrame, b: HandFrame) => a.every((m, i) => m === b[i]);
