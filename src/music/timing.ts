import { matchHeard } from '../audio/match';
import type { TimedNote } from './tune';

/**
 * Chấm nhịp khi đàn theo nhịp có micro (MIC): mỗi nốt có một "cửa sổ" quanh thời điểm đúng.
 * Thời gian tính bằng PHÁCH. Micro có độ trễ (~0,2 giây) nên cửa sổ lệch về sau một chút.
 */
export interface HeardEvent {
  /** Thời điểm nghe được (phách, đã trừ độ trễ micro) */
  beat: number;
  midi: number;
}

export interface NoteVerdict {
  index: number;
  hit: boolean;
  /** Lệch (phách): âm = sớm, dương = muộn */
  offset?: number;
}

export const EARLY = 0.45;
export const LATE = 0.55;

/** Cửa sổ chấm nhịp theo cài đặt: dễ (mặc định cho trẻ 9 tuổi) / vừa / khó (phách). */
export const TIMING_WINDOWS: Record<'easy' | 'normal' | 'strict', { early: number; late: number }> = {
  easy: { early: 0.5, late: 0.65 },
  normal: { early: EARLY, late: LATE },
  strict: { early: 0.3, late: 0.35 },
};

/**
 * Ghép mỗi nốt (hoặc NHÓM nốt cùng lúc — midi là mảng) với một lần nghe khớp cao độ trong cửa sổ;
 * mỗi lần nghe chỉ dùng một lần. Ghép theo cặp LỆCH ÍT NHẤT trước (toàn bài) — nốt móc kép (2/4) đứng sát nhau,
 * cửa sổ chồng lên nhau: lần nghe thuộc về nốt gần nó nhất, không bị nốt trước "giành" mất.
 */
export function gradeTiming(
  notes: Array<Pick<TimedNote, 'index' | 'start'> & { midi: number | number[] }>,
  heard: HeardEvent[],
  early = EARLY,
  late = LATE,
): NoteVerdict[] {
  const pairs: Array<{ n: number; h: number; off: number }> = [];
  notes.forEach((n, ni) => {
    heard.forEach((h, hi) => {
      const ok = Array.isArray(n.midi) ? matchHeard(h.midi, n.midi) !== 'none' : h.midi === n.midi;
      const off = h.beat - n.start;
      if (ok && off >= -early && off <= late) pairs.push({ n: ni, h: hi, off });
    });
  });
  // Lệch ít nhất trước; bằng nhau → nốt trước, lần nghe trước (ổn định)
  pairs.sort((x, y) => Math.abs(x.off) - Math.abs(y.off) || x.n - y.n || x.h - y.h);
  const usedH = new Set<number>();
  const got = new Map<number, number>();
  for (const p of pairs) {
    if (usedH.has(p.h) || got.has(p.n)) continue;
    usedH.add(p.h);
    got.set(p.n, p.off);
  }
  return notes.map((n, ni) =>
    got.has(ni) ? { index: n.index, hit: true, offset: got.get(ni)! } : { index: n.index, hit: false },
  );
}

export function score(verdicts: NoteVerdict[]): number {
  if (!verdicts.length) return 0;
  return verdicts.filter((v) => v.hit).length / verdicts.length;
}

/** ≥ 80% nốt đúng lúc = "giữ nhịp đều" (tiêu chí tuần 4/5/7 khi dùng micro). */
export const PASS_SCORE = 0.8;

/** 3/2/1 sao theo điểm — chỉ để phản hồi (§10). */
export function starsFor(s: number): 1 | 2 | 3 {
  return s >= 0.9 ? 3 : s >= 0.6 ? 2 : 1;
}

/** Số phách đếm vào: một ô nhịp; nhịp 2/4 (ô ngắn) đếm HAI ô — "1 2 1 2" — cho bé kịp vào nhịp. */
export function countInBeats(beatsPerMeasure: number): number {
  return beatsPerMeasure < 3 ? beatsPerMeasure * 2 : beatsPerMeasure;
}

/** Số hiện trên màn lúc đếm vào (phách < 0): thứ tự phách trong ô — 1 2 3 4 / 1 2 3 / 1 2 1 2. */
export function countInLabel(beat: number, beatsPerMeasure: number, lead = countInBeats(beatsPerMeasure)): number {
  const k = Math.max(0, lead - Math.ceil(-beat - 1e-6)); // phách thứ k (từ 0) của phần đếm vào
  return (k % beatsPerMeasure) + 1;
}

/** v5 — "Lặp câu này 3 lần đúng liên tiếp": lượt sạch → +1, có sai → về 0; đủ `goal` → xong. */
export function loopStreak(streak: number, clean: boolean, goal = 3): { streak: number; done: boolean } {
  const next = clean ? streak + 1 : 0;
  return { streak: next, done: next >= goal };
}

/**
 * v5 — Lời ĐẾM SỐ cho từng ô của mẫu nhịp (vỗ tay + đếm "1 – 2 – 3 – 4"):
 * mỗi phách nói số thứ tự trong ô nhịp; tiếng vỗ ở nửa phách nói "và"; phách ngân (không vỗ) vẫn đếm;
 * dấu lặng (không vỗ tiếng nào) đếm thầm — để trong ngoặc.
 * cells: thời điểm bắt đầu (phách), độ dài (phách), các tiếng vỗ (phách, tính từ đầu ô).
 */
export function countWords(cells: Array<{ start: number; beats: number; hits: number[] }>, beatsPerMeasure = 4): string[] {
  return cells.map((c) => {
    const parts: string[] = [];
    for (let k = 0; k < Math.ceil(c.beats - 1e-9); k++) {
      const n = String((((Math.floor(c.start + 1e-9) + k) % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure + 1);
      const and = c.hits.some((h) => Math.abs(h - (k + 0.5)) < 1e-6);
      parts.push(and ? `${n} và` : n);
    }
    const s = parts.join(' – ');
    return c.hits.length ? s : `(${s})`;
  });
}
