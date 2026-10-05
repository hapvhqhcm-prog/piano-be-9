/**
 * Quy tắc "khắc bản" (ghi nhạc như sách in) — hàm thuần, có test:
 * - Hình nốt theo trường độ (tròn/trắng/đen/móc đơn/móc kép, chấm dôi).
 * - Gạch nối (beam): gom các nốt móc đơn/móc kép liền nhau trong cùng một phách; dấu lặng cắt gạch nối;
 *   nhịp 4/4: bốn móc đơn trong nửa ô (phách 1–2 hoặc 3–4) nối chung; nhịp 3/4: các cặp móc đơn trong ô nối chung.
 * - Giãn cách theo trường độ, có khoảng tối thiểu giữa hai nốt (móc kép không dính nhau).
 */

export interface NoteShape {
  /** Trường độ gốc (không tính chấm): 4 tròn, 2 trắng, 1 đen, 0.5 móc đơn, 0.25 móc kép, 0.125 móc ba */
  base: number;
  dots: 0 | 1 | 2;
}

const BASES = [4, 2, 1, 0.5, 0.25, 0.125];
const EPS = 1e-6;

export function noteShape(beats: number): NoteShape {
  for (const b of BASES) {
    if (Math.abs(beats - b) < EPS) return { base: b, dots: 0 };
    if (Math.abs(beats - b * 1.5) < EPS) return { base: b, dots: 1 };
    if (Math.abs(beats - b * 1.75) < EPS) return { base: b, dots: 2 };
  }
  // Trường độ lạ (vd 5 phách): lấy hình nốt lớn nhất không vượt quá
  return { base: BASES.find((b) => b <= beats + EPS) ?? 0.125, dots: 0 };
}

/** Số móc / gạch nối: móc đơn 1, móc kép 2, móc ba 3; nốt đen trở lên 0. */
export function flagCount(beats: number): number {
  const b = noteShape(beats).base;
  return b >= 1 ? 0 : Math.round(Math.log2(1 / b));
}

export interface BeamNote {
  start: number;
  beats: number;
  rest?: boolean;
}

/**
 * Nhóm gạch nối của MỘT bè: trả về các nhóm (≥ 2 nốt) chỉ số trong mảng `notes` (theo thứ tự thời gian).
 * Nốt đứng một mình giữ móc (không có trong kết quả).
 */
export function beamGroups(notes: BeamNote[], beatsPerMeasure: number): number[][] {
  // 1) Theo phách: nốt có móc, liền nhau, bắt đầu trong cùng một phách
  const byBeat: Array<{ beat: number; idx: number[] }> = [];
  let cur: { beat: number; idx: number[] } | null = null;
  const flush = () => {
    if (cur && cur.idx.length) byBeat.push(cur);
    cur = null;
  };
  notes.forEach((n, i) => {
    if (n.rest || flagCount(n.beats) === 0) return flush();
    const beat = Math.floor(n.start + EPS);
    if (cur && cur.beat !== beat) flush();
    if (!cur) cur = { beat, idx: [] };
    cur.idx.push(i);
  });
  flush();

  // 2) Nối chung các phách "hai móc đơn tròn phách" liền nhau (4/4: trong nửa ô; 3/4: trong cả ô)
  const plainPair = (g: { beat: number; idx: number[] }) =>
    g.idx.length === 2 &&
    g.idx.every((i) => Math.abs(notes[i].beats - 0.5) < EPS) &&
    Math.abs(notes[g.idx[0]].start - g.beat) < EPS;
  const span = (beat: number): number | null => {
    const inBar = ((beat % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure;
    const bar = Math.floor(beat / beatsPerMeasure + EPS);
    if (beatsPerMeasure === 4) return bar * 2 + Math.floor(inBar / 2);
    if (beatsPerMeasure === 3) return bar;
    return null; // 2/4 (dân ca): mỗi phách một nhóm như bản ký âm gốc
  };
  const out: number[][] = [];
  for (let k = 0; k < byBeat.length; k++) {
    const g = byBeat[k];
    const prev = byBeat[k - 1];
    const last = out[out.length - 1];
    const merge =
      prev &&
      last &&
      plainPair(g) &&
      plainPair(prev) &&
      prev.beat === g.beat - 1 &&
      span(g.beat) !== null &&
      span(g.beat) === span(prev.beat) &&
      last[last.length - 1] === prev.idx[prev.idx.length - 1];
    if (merge) last.push(...g.idx);
    else out.push([...g.idx]);
  }
  return out.filter((g) => g.length >= 2);
}

export interface BeamSegment {
  /** 1 = gạch chính, 2 = gạch thứ hai (móc kép), … */
  level: number;
  /** Chỉ số trong nhóm */
  from: number;
  to: number;
  /** Gạch cụt (một nốt): -1 chĩa trái, 1 chĩa phải */
  stub?: -1 | 1;
}

/** Các đoạn gạch nối của một nhóm: gạch chính suốt nhóm; gạch phụ nối các nốt ngắn liền nhau, nốt lẻ có gạch cụt. */
export function beamSegments(group: BeamNote[]): BeamSegment[] {
  const levels = group.map((n) => flagCount(n.beats));
  const out: BeamSegment[] = [{ level: 1, from: 0, to: group.length - 1 }];
  const max = Math.max(...levels);
  for (let L = 2; L <= max; L++) {
    let i = 0;
    while (i < group.length) {
      if (levels[i] < L) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < group.length && levels[j + 1] >= L) j++;
      if (j > i) out.push({ level: L, from: i, to: j });
      else {
        // Gạch cụt: nốt đầu → phải, nốt cuối → trái; ở giữa: bắt đầu đúng phân nhịp (móc đơn với L=2) → phải
        const unit = 2 ** (2 - L);
        const onSub = Math.abs(group[i].start / unit - Math.round(group[i].start / unit)) < EPS;
        const stub: -1 | 1 = i === 0 ? 1 : i === group.length - 1 ? -1 : onSub ? 1 : -1;
        out.push({ level: L, from: i, to: i, stub });
      }
      i = j + 1;
    }
  }
  return out;
}

/** Hướng đuôi chung của nhóm gạch nối: nốt xa vạch giữa nhất quyết định (dưới vạch giữa → đuôi lên). */
export function groupStemUp(steps: number[]): boolean {
  const lo = Math.min(...steps);
  const hi = Math.max(...steps);
  return 4 - lo > hi - 4;
}

/**
 * Giãn cách: vị trí x (px, từ phách 0) của từng mốc thời gian (nốt, dấu lặng, vạch nhịp — gộp mọi bè).
 * Mỗi đoạn = max(trường độ × pxPerBeat, khoảng tối thiểu + phần đệm của mốc sau).
 */
export interface Spacing {
  t: number[];
  x: number[];
  pxPerBeat: number;
}

export function makeSpacing(
  times: number[],
  pxPerBeat: number,
  minGap: number,
  padBefore: (t: number) => number = () => 0,
): Spacing {
  const t = [...new Set(times.map((v) => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);
  if (!t.length || t[0] > 0) t.unshift(0);
  const x = [0];
  for (let i = 1; i < t.length; i++) {
    x.push(x[i - 1] + Math.max((t[i] - t[i - 1]) * pxPerBeat, minGap + padBefore(t[i])));
  }
  return { t, x, pxPerBeat };
}

/** Vị trí x của phách bất kỳ (nội suy tuyến tính giữa các mốc; ngoài mốc cuối: theo pxPerBeat). */
export function spaceAt(s: Spacing, beat: number): number {
  const { t, x } = s;
  if (beat <= t[0]) return x[0] + (beat - t[0]) * s.pxPerBeat;
  const n = t.length - 1;
  if (beat >= t[n]) return x[n] + (beat - t[n]) * s.pxPerBeat;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= beat) lo = mid;
    else hi = mid;
  }
  return x[lo] + ((beat - t[lo]) / (t[hi] - t[lo])) * (x[hi] - x[lo]);
}
