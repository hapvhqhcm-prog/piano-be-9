/**
 * (2026-10-15, OWNER duyệt — rà soát của thầy giáo nhiều kinh nghiệm) "ĐỌC NHỊP TO TRƯỚC KHI ĐÀN":
 * trước lượt THEO NHỊP đầu tiên của bài dạy một nhịp mới, bé vỗ tay + đọc vần/đếm số MỘT lượt theo đúng nhịp của chính bài.
 * File này: hàm THUẦN rút mẫu nhịp (ký hiệu của màn Nhịp — ui/screens/rhythm.ts SYMBOL) từ câu 1 của bài.
 *
 * Cách rút: lấy câu 1 (phraseRanges); trong câu chọn CHANT_MEASURES ô liền nhau có nhiều hình nhịp "lạ" nhất
 * (không phải Đi / Đi-i / Đi-i-i / Đi-i-i-i / Suỵt — hoà thì lấy chỗ sớm nhất); đổi trường độ từng nốt thành ký hiệu nhịp.
 * Bài nhịp ghép x/8 (phách = móc đơn) hoặc có hình nhịp không có trong từ vựng (vd lặng móc đơn) → null (không đọc nhịp).
 */
import type { RhythmSymbol } from '../lessons/types';
import { beatsPerMeasure, noteUnit, phraseRanges, slice, type Tune, type TuneNote } from './tune';

/** Số ô nhịp đọc to (một lượt, không lặp) */
export const CHANT_MEASURES = 2;

export interface Chant {
  /** Mẫu nhịp (một lượt) — dùng cho màn Nhịp với `once` */
  pattern: RhythmSymbol[];
  /** Số phách mỗi ô (đếm "1 2 3 4" / "1 2 3" / "1 2") */
  meter: number;
  /** Ô nhịp [đầu, cuối) của bài mà mẫu lấy ra */
  measures: [number, number];
}

/** Hình nhịp "thường" (không tính điểm "lạ" khi chọn chỗ đọc) */
const PLAIN: ReadonlySet<RhythmSymbol> = new Set<RhythmSymbol>(['walk', 'long', 'long3', 'long4', 'rest']);

/** Trường độ (phách nốt đen) của từng ký hiệu — thứ tự thử khi khớp (khuôn dài/đặc trưng trước) */
const TEMPLATES: ReadonlyArray<{ sym: RhythmSymbol; beats: number[] }> = [
  { sym: 'sync', beats: [0.5, 1, 0.5] },
  { sym: 'run4', beats: [0.25, 0.25, 0.25, 0.25] },
  { sym: 'run3', beats: [0.5, 0.25, 0.25] },
  { sym: 'dotted8', beats: [0.75, 0.25] },
  { sym: 'dotted', beats: [1.5, 0.5] },
  { sym: 'run', beats: [0.5, 0.5] },
  { sym: 'walk', beats: [1] },
  { sym: 'long', beats: [2] },
  { sym: 'long3', beats: [3] },
  { sym: 'long4', beats: [4] },
];

const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * Đổi một chuỗi nốt (trường độ theo nốt đen) thành ký hiệu nhịp. Lặng nguyên phách → 'rest' mỗi phách;
 * chỗ không khớp khuôn nào (lặng lẻ nửa phách, nốt 2,5 phách…) → null.
 */
export function rhythmSymbolsOf(notes: ReadonlyArray<Pick<TuneNote, 'beats' | 'rest'>>): RhythmSymbol[] | null {
  const out: RhythmSymbol[] = [];
  let i = 0;
  while (i < notes.length) {
    const n = notes[i];
    if (n.rest) {
      const k = Math.round(n.beats);
      if (k < 1 || !eq(k, n.beats)) return null;
      for (let j = 0; j < k; j++) out.push('rest');
      i++;
      continue;
    }
    const t = TEMPLATES.find((x) => x.beats.every((b, j) => i + j < notes.length && !notes[i + j].rest && eq(notes[i + j].beats, b)));
    if (!t) return null;
    out.push(t.sym);
    i += t.beats.length;
  }
  return out;
}

/** Mẫu đọc nhịp của bài (xem đầu file); null = không rút được. */
export function chantFor(t: Tune): Chant | null {
  if (noteUnit(t) !== 1) return null; // nhịp x/8: phách = móc đơn — từ vựng nhịp tính theo nốt đen
  const meter = beatsPerMeasure(t);
  const [p0, p1] = phraseRanges(t)[0] ?? [0, 0];
  if (p1 <= p0) return null;
  const len = Math.min(CHANT_MEASURES, p1 - p0);
  let best: Chant | null = null;
  let bestScore = -1;
  for (let m = p0; m + len <= p1; m++) {
    const pattern = rhythmSymbolsOf(slice(t, m, m + len).notes);
    if (!pattern || !pattern.length || pattern.every((s) => s === 'rest')) continue;
    const score = pattern.filter((s) => !PLAIN.has(s)).length;
    if (score > bestScore) {
      best = { pattern, meter, measures: [m, m + len] };
      bestScore = score;
    }
  }
  return best;
}
