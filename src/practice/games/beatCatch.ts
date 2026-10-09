/**
 * 🎯 "Bắt nhịp" — các chấm nhịp trôi tới vạch đích theo nhạc đệm; bé chạm tấm đệm to (hoặc gõ phím bất kỳ trên đàn
 * thật — micro nghe tiếng gõ) ĐÚNG LÚC chấm chạm vạch. Phần THUẦN: dựng bài nhịp từ các nhịp con ĐÃ HỌC, chấm từng
 * lần chạm theo cửa sổ thời gian (music/timing.ts), điểm %, sao.
 *
 * Chấm: mỗi chấm nhận lần chạm ĐẦU TIÊN rơi vào cửa sổ của nó (cửa sổ không vượt quá nửa khoảng cách tới chấm bên
 * cạnh). Chạm thừa / chạm lệch xa → bỏ qua, không trừ điểm. Lệch ≤ 0,12 phách = "Tuyệt!", ≤ 0,25 = "Tốt!", còn lại "Được!".
 */
import type { RhythmSymbol } from '../../lessons/types';
import { TIMING_WINDOWS } from '../../music/timing';
import { SYMBOL } from '../../ui/screens/rhythm';
import { BEATS_PER_BAR, makePattern, onsetsOf, rhythmSymbolsUpTo } from './rhythmQuiz';
import type { Rng } from './pools';

export const BEAT_BARS = 12;
/** Ô đầu chỉ có "Đi" (mỗi phách một chấm) cho bé bắt nhịp */
export const BEAT_WARM_BARS = 2;
export const BEAT_PERFECT = 0.12;
export const BEAT_GOOD = 0.25;
export type BeatGrade = 'perfect' | 'good' | 'ok';
export const BEAT_POINTS: Record<BeatGrade, number> = { perfect: 3, good: 2, ok: 1 };
export const BEAT_WORD: Record<BeatGrade, string> = { perfect: 'Tuyệt!', good: 'Tốt!', ok: 'Được!' };

export const beatSymbols = (week: number): RhythmSymbol[] => rhythmSymbolsUpTo(week);
export const beatUnlocked = (week: number): boolean => beatSymbols(week).length >= 1;

export interface BeatSong {
  bars: RhythmSymbol[][];
  /** Thời điểm các chấm (phách, từ đầu bài) */
  targets: number[];
  bpm: number;
  totalBeats: number;
}

/** Tốc độ: có móc kép (cách < nửa phách) → 60 · có móc đơn → 72 · chỉ phách đen trở lên → 80. */
export function beatBpm(targets: readonly number[]): number {
  let gap = Infinity;
  for (let i = 1; i < targets.length; i++) gap = Math.min(gap, targets[i] - targets[i - 1]);
  return gap < 0.5 - 1e-9 ? 60 : gap < 1 - 1e-9 ? 72 : 80;
}

/**
 * Bài nhịp cho tuần `week`: BEAT_WARM_BARS ô "Đi" → ô 3–6 dùng ≤ 3 nhịp học sớm nhất → sau đó mọi nhịp đã học.
 * Mỗi ô lấp riêng (không vắt vạch nhịp), ô nào cũng có ≥ 2 chấm.
 */
export function makeBeatSong(week: number, rng: Rng = Math.random, bars = BEAT_BARS): BeatSong {
  const learned = beatSymbols(week);
  const syms = learned.length ? learned : (['walk'] as RhythmSymbol[]);
  const early = syms.slice(0, Math.min(3, syms.length));
  const out: RhythmSymbol[][] = [];
  for (let b = 0; b < bars; b++) {
    if (b < BEAT_WARM_BARS && syms.includes('walk')) {
      out.push(['walk', 'walk', 'walk', 'walk']);
      continue;
    }
    const pool = b < BEAT_WARM_BARS + 4 ? early : syms;
    let bar: RhythmSymbol[] | null = null;
    for (let i = 0; i < 6 && !bar; i++) {
      const c = makePattern(1, pool, rng) ?? makePattern(1, syms, rng);
      // Không lặp y hệt ô trước (cho có đổi)
      if (c && (i === 5 || !out.length || c.join() !== out[out.length - 1].join())) bar = c;
    }
    out.push(bar ?? (['walk', 'walk', 'walk', 'walk'] as RhythmSymbol[]));
  }
  const targets: number[] = [];
  out.forEach((bar, i) => onsetsOf(bar).forEach((x) => targets.push(i * BEATS_PER_BAR + x)));
  return { bars: out, targets, bpm: beatBpm(targets), totalBeats: bars * BEATS_PER_BAR };
}

/** Ký hiệu (để vẽ emoji trên chấm) của từng chấm. */
export function targetSymbols(song: BeatSong): RhythmSymbol[] {
  const out: RhythmSymbol[] = [];
  for (const bar of song.bars) for (const s of bar) for (let k = 0; k < SYMBOL[s].hits.length; k++) out.push(s);
  return out;
}

export function gradeOffset(off: number): BeatGrade {
  const a = Math.abs(off);
  return a <= BEAT_PERFECT ? 'perfect' : a <= BEAT_GOOD ? 'good' : 'ok';
}

export interface BeatHit {
  index: number;
  grade: BeatGrade;
  offset: number;
}

/** Chấm thời gian thực từng lần chạm (phách, đã trừ độ trễ). */
export class BeatJudge {
  private readonly early: number[];
  private readonly late: number[];
  private readonly result: Array<BeatHit | 'miss' | null>;
  private swept = 0;
  points = 0;

  constructor(
    readonly targets: readonly number[],
    win: { early: number; late: number } = TIMING_WINDOWS.easy,
  ) {
    this.early = targets.map((t, i) => Math.min(win.early, i > 0 ? (t - targets[i - 1]) / 2 : Infinity));
    this.late = targets.map((t, i) => Math.min(win.late, i + 1 < targets.length ? (targets[i + 1] - t) / 2 : Infinity));
    this.result = targets.map(() => null);
  }

  /** Một lần chạm lúc `beat` → chấm được chấm nào (gần nhất trong các chấm còn chờ) hoặc null (bỏ qua). */
  tap(beat: number): BeatHit | null {
    let best = -1;
    let bestOff = Infinity;
    for (let i = this.swept; i < this.targets.length; i++) {
      const off = beat - this.targets[i];
      if (off < -this.early[i]) break;
      if (this.result[i] !== null || off > this.late[i]) continue;
      if (Math.abs(off) < Math.abs(bestOff)) {
        best = i;
        bestOff = off;
      }
    }
    if (best < 0) return null;
    const hit: BeatHit = { index: best, grade: gradeOffset(bestOff), offset: bestOff };
    this.result[best] = hit;
    this.points += BEAT_POINTS[hit.grade];
    return hit;
  }

  /** Các chấm vừa trôi qua hết cửa sổ mà chưa được chạm (đánh dấu lỡ) — gọi mỗi khung hình. */
  sweep(beat: number): number[] {
    const out: number[] = [];
    while (this.swept < this.targets.length && beat > this.targets[this.swept] + this.late[this.swept]) {
      if (this.result[this.swept] === null) {
        this.result[this.swept] = 'miss';
        out.push(this.swept);
      }
      this.swept++;
    }
    return out;
  }

  get hits(): BeatHit[] {
    return this.result.filter((r): r is BeatHit => r !== null && r !== 'miss');
  }

  /** Điểm 0–100 */
  get percent(): number {
    return beatPercent(this.points, this.targets.length);
  }
}

export const beatPercent = (points: number, n: number): number =>
  n > 0 ? Math.round((100 * points) / (BEAT_POINTS.perfect * n)) : 0;

/** Sao: 1★ ≥ 30 · 2★ ≥ 60 · 3★ ≥ 85 điểm. */
export function beatStars(pct: number): 0 | 1 | 2 | 3 {
  return pct >= 85 ? 3 : pct >= 60 ? 2 : pct >= 30 ? 1 : 0;
}

/** Cửa sổ chấm theo cài đặt "độ khắt khe nhịp" của phụ huynh. */
export const beatWindow = (timing: keyof typeof TIMING_WINDOWS | undefined) => TIMING_WINDOWS[timing ?? 'easy'] ?? TIMING_WINDOWS.easy;
