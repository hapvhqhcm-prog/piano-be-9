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

/** Ghép mỗi nốt với lần nghe khớp cao độ gần nhất trong cửa sổ; mỗi lần nghe chỉ dùng một lần. */
export function gradeTiming(
  notes: Array<Pick<TimedNote, 'index' | 'start'> & { midi: number }>,
  heard: HeardEvent[],
  early = EARLY,
  late = LATE,
): NoteVerdict[] {
  const used = new Set<number>();
  return notes.map((n) => {
    let best = -1;
    let bestAbs = Infinity;
    heard.forEach((h, i) => {
      if (used.has(i) || h.midi !== n.midi) return;
      const off = h.beat - n.start;
      if (off < -early || off > late) return;
      if (Math.abs(off) < bestAbs) {
        bestAbs = Math.abs(off);
        best = i;
      }
    });
    if (best < 0) return { index: n.index, hit: false };
    used.add(best);
    return { index: n.index, hit: true, offset: heard[best].beat - n.start };
  });
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
