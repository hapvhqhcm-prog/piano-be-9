/**
 * 🥁 "Đố nhịp" — app chơi một mẫu nhịp 1–2 ô, bé chọn thẻ nhịp đúng trong 3 thẻ.
 * Phần THUẦN: ký hiệu nhịp con ĐÃ HỌC (theo các bài Nhịp của giáo trình tới tuần hiện tại), sinh câu hỏi tăng dần độ khó.
 *
 * Ba thẻ luôn KHÁC NHAU KHI NGHE: chuỗi thời điểm vỗ (onset) của mỗi thẻ khác nhau — vd "Đi-i" (nốt trắng) và
 * "Đi‿đi" (dấu nối) nghe giống hệt nhau nên không bao giờ là hai lựa chọn của cùng một câu.
 */
import { WEEKS } from '../../lessons/lessonEngine';
import type { RhythmSymbol } from '../../lessons/types';
import { SYMBOL } from '../../ui/screens/rhythm';

export const RHYTHM_ROUNDS = 8;
export const BEATS_PER_BAR = 4;

type Rng = () => number;
const pick = <T>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length) % arr.length];

/** Ký hiệu nhịp đã học tới tuần `week`, theo THỨ TỰ được dạy. */
export function rhythmSymbolsUpTo(week: number): RhythmSymbol[] {
  const out: RhythmSymbol[] = [];
  for (const w of WEEKS) {
    if (w.week > week) break;
    for (const l of w.lessons)
      for (const a of l.activities)
        if (a.kind === 'rhythm') for (const s of a.patterns.flat()) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Tuần đầu tiên có đủ ≥ `min` ký hiệu nhịp (mở trò; mặc định 2) — null nếu giáo trình không có. */
export function rhythmUnlockWeek(min = 2): number | null {
  for (const w of WEEKS) if (rhythmSymbolsUpTo(w.week).length >= min) return w.week;
  return null;
}

/** Thời điểm vỗ (phách, tính từ đầu mẫu) — "dấu vân tay" khi NGHE của một mẫu. */
export function onsetsOf(p: readonly RhythmSymbol[]): number[] {
  const out: number[] = [];
  let b = 0;
  for (const s of p) {
    for (const hb of SYMBOL[s].hits) out.push(b + hb);
    b += SYMBOL[s].beats;
  }
  return out;
}
const sig = (p: readonly RhythmSymbol[]) => onsetsOf(p).map((x) => x.toFixed(2)).join(',');
export const beatsOf = (p: readonly RhythmSymbol[]): number => p.reduce((a, s) => a + SYMBOL[s].beats, 0);

/** Lấp đủ `beats` phách bằng các ký hiệu trong `syms` (ngẫu nhiên). `lead` = ô đầu phải có tiếng (không mở đầu bằng lặng). */
function fill(beats: number, syms: readonly RhythmSymbol[], rng: Rng, lead: boolean): RhythmSymbol[] | null {
  const out: RhythmSymbol[] = [];
  let left = beats;
  for (let guard = 0; left > 0 && guard < 40; guard++) {
    const fit = syms.filter((s) => SYMBOL[s].beats <= left && !(lead && !out.length && !SYMBOL[s].hits.length));
    if (!fit.length) return null;
    const s = pick(fit, rng);
    out.push(s);
    left -= SYMBOL[s].beats;
  }
  return left === 0 ? out : null;
}

/** Mẫu hợp lệ: từng ô nhịp lấp riêng (không ký hiệu nào vắt qua vạch nhịp), có ít nhất 2 tiếng vỗ. */
export function makePattern(bars: number, syms: readonly RhythmSymbol[], rng: Rng): RhythmSymbol[] | null {
  for (let i = 0; i < 30; i++) {
    const p: RhythmSymbol[] = [];
    for (let b = 0; b < bars; b++) {
      const bar = fill(BEATS_PER_BAR, syms, rng, b === 0);
      if (!bar) break;
      p.push(...bar);
    }
    if (beatsOf(p) === bars * BEATS_PER_BAR && onsetsOf(p).length >= 2) return p;
  }
  return null;
}

/** Không ký hiệu nào vắt qua vạch nhịp (mỗi ô đủ đúng BEATS_PER_BAR phách). */
export function respectsBarlines(p: readonly RhythmSymbol[]): boolean {
  let b = 0;
  for (const s of p) {
    const start = b;
    b += SYMBOL[s].beats;
    if (Math.floor(start / BEATS_PER_BAR) !== Math.floor((b - 1e-9) / BEATS_PER_BAR)) return false;
  }
  return true;
}

export interface RhythmRound {
  /** Mẫu app chơi */
  answer: RhythmSymbol[];
  /** 2–3 thẻ (đã trộn), một thẻ là `answer` */
  options: RhythmSymbol[][];
  correct: number;
  bars: 1 | 2;
}

/**
 * Độ khó theo lượt (0-based): lượt 0–2 = 1 ô, chỉ 3 ký hiệu học SỚM nhất · lượt 3–5 = 1 ô, mọi ký hiệu · lượt 6–7 = 2 ô.
 */
export function roundLevel(round: number, learned: readonly RhythmSymbol[]): { bars: 1 | 2; syms: RhythmSymbol[] } {
  if (round < 3) return { bars: 1, syms: learned.slice(0, Math.max(2, Math.min(3, learned.length))) };
  return { bars: round < 6 ? 1 : 2, syms: [...learned] };
}

/** Sinh một câu: đáp án + 2 thẻ gây nhiễu (đổi 1 ô của đáp án; khác tiếng với đáp án và với nhau). */
export function makeRhythmRound(learned: readonly RhythmSymbol[], round: number, rng: Rng = Math.random, prev?: RhythmSymbol[]): RhythmRound {
  const { bars, syms } = roundLevel(round, learned);
  const beats = BEATS_PER_BAR * bars;
  let answer: RhythmSymbol[] | null = null;
  for (let i = 0; i < 10; i++) {
    answer = makePattern(bars, syms, rng) ?? makePattern(bars, learned, rng);
    if (!answer || !prev || sig(answer) !== sig(prev)) break;
  }
  if (!answer) answer = Array.from({ length: beats }, () => learned[0]);
  const options: RhythmSymbol[][] = [answer];
  const sigs = new Set([sig(answer)]);
  const tryAdd = (p: RhythmSymbol[] | null) => {
    if (!p || options.length >= 3) return;
    const s = sig(p);
    if (sigs.has(s) || beatsOf(p) !== beats || onsetsOf(p).length < 1) return;
    sigs.add(s);
    options.push(p);
  };
  // Đổi MỘT ô (cùng số phách) — thẻ nhìn gần giống, phải nghe kỹ
  for (let i = 0; i < 60 && options.length < 3; i++) {
    const k = Math.floor(rng() * answer.length) % answer.length;
    const rep = fill(SYMBOL[answer[k]].beats, learned, rng, k === 0);
    if (rep) tryAdd([...answer.slice(0, k), ...rep, ...answer.slice(k + 1)]);
  }
  // Dự phòng: mẫu mới hoàn toàn
  for (let i = 0; i < 60 && options.length < 3; i++) tryAdd(makePattern(bars, learned, rng));
  // Trộn
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { answer, options, correct: options.indexOf(answer), bars };
}

/** Tốc độ: có móc kép (tiếng cách < nửa phách) → chậm hơn. */
export function rhythmBpm(p: readonly RhythmSymbol[]): number {
  const on = onsetsOf(p);
  return on.some((x, i) => i > 0 && x - on[i - 1] < 0.5 - 1e-9) ? 60 : 76;
}

/**
 * Các tiếng cần phát: [phách bắt đầu, độ dài (phách)] — mỗi tiếng ngân tới tiếng kế (hoặc hết ký hiệu) → nốt trắng nghe DÀI.
 */
export function rhythmTones(p: readonly RhythmSymbol[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let b = 0;
  for (const s of p) {
    const { hits, beats } = SYMBOL[s];
    hits.forEach((hb, i) => {
      const end = i + 1 < hits.length ? hits[i + 1] : beats;
      out.push([b + hb, Math.max(0.15, (end - hb) * 0.85)]);
    });
    b += beats;
  }
  return out;
}

/** Sao cuối trò (8 lượt): 1★ ≥ 3 · 2★ ≥ 6 · 3★ = 8. */
export function rhythmStars(score: number): 0 | 1 | 2 | 3 {
  return score >= RHYTHM_ROUNDS ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0;
}
