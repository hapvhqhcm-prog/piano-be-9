/**
 * 🎢 "Lên hay xuống?" — app chơi 2–3 nốt (bằng tiếng đàn bí mật: piano hoặc tiếng con đã mở khóa), bé chọn thẻ HÌNH
 * đường đi của giai điệu. Phần THUẦN: hình, sinh câu theo độ khó, sao.
 *
 * Độ khó: đầu trò 2 nốt (Lên / Xuống) cách xa nhau → sau đó 3 nốt (4 hình) và nốt gần nhau hơn (bước).
 * Trước tuần học "Bước hay nhảy" (stepskip, tuần 3) phần 2 nốt dài hơn và nốt luôn cách xa (dễ nghe).
 */
import { pitchToMidi, type Pitch } from '../../piano/pitchTable';
import { pickOf, taughtWhiteKeys, type Rng } from './pools';

export type Shape = 'up' | 'down' | 'upup' | 'downdown' | 'updown' | 'downup';
export const SHAPES2: readonly Shape[] = ['up', 'down'];
export const SHAPES3: readonly Shape[] = ['upup', 'downdown', 'updown', 'downup'];

export const SHAPE_INFO: Record<Shape, { label: string; arrow: string }> = {
  up: { label: 'Đi lên', arrow: '↗' },
  down: { label: 'Đi xuống', arrow: '↘' },
  upup: { label: 'Lên, lên', arrow: '↗↗' },
  downdown: { label: 'Xuống, xuống', arrow: '↘↘' },
  updown: { label: 'Lên rồi xuống', arrow: '↗↘' },
  downup: { label: 'Xuống rồi lên', arrow: '↘↗' },
};

export const CONTOUR_ROUNDS = 8;
/** Tuần dạy "Bước hay nhảy" — từ đây cho nốt gần nhau (bước) */
export const CONTOUR_STEP_WEEK = 3;
const FALLBACK: Pitch[] = ['C4', 'E4', 'G4', 'C5'];

/** Bể nốt: mọi phím trắng con đã học (đúng quãng tám), từ trầm tới cao. */
export function contourPool(week: number): Pitch[] {
  const p = taughtWhiteKeys(week);
  return p.length >= 3 ? p : FALLBACK;
}

/** Số nốt + khoảng cách nhỏ nhất (nửa cung) giữa hai nốt liền nhau, theo lượt và tuần. */
export function contourLevel(round: number, week: number): { notes: 2 | 3; minGap: number } {
  const early = week < CONTOUR_STEP_WEEK;
  const twoUntil = early ? 4 : 2;
  if (round < twoUntil) return { notes: 2, minGap: early || round < 1 ? 5 : 3 };
  return { notes: 3, minGap: early || round < twoUntil + 2 ? 3 : 2 };
}

/** Hình của một dãy nốt (null nếu có hai nốt liền nhau bằng nhau). */
export function shapeOf(ps: readonly Pitch[]): Shape | null {
  const d: string[] = [];
  for (let i = 1; i < ps.length; i++) {
    const x = pitchToMidi(ps[i]) - pitchToMidi(ps[i - 1]);
    if (x === 0) return null;
    d.push(x > 0 ? 'up' : 'down');
  }
  const k = d.join('');
  return (SHAPES2 as readonly string[]).includes(k) || (SHAPES3 as readonly string[]).includes(k) ? (k as Shape) : null;
}

export interface ContourRound {
  notes: Pitch[];
  shape: Shape;
  options: readonly Shape[];
  correct: number;
}

/** Dựng dãy nốt theo hình `shape` trong bể, mỗi bước cách ≥ minGap (giảm dần nếu bể hẹp). */
function buildFor(shape: Shape, pool: readonly Pitch[], minGap: number, rng: Rng): Pitch[] | null {
  const dirs = shape === 'up' ? [1] : shape === 'down' ? [-1] : shape === 'upup' ? [1, 1] : shape === 'downdown' ? [-1, -1] : shape === 'updown' ? [1, -1] : [-1, 1];
  for (let gap = minGap; gap >= 1; gap--) {
    for (let t = 0; t < 40; t++) {
      const seq = [pickOf(pool, rng)];
      let ok = true;
      for (const dir of dirs) {
        const last = pitchToMidi(seq[seq.length - 1]);
        const cand = pool.filter((p) => (pitchToMidi(p) - last) * dir >= gap);
        if (!cand.length) {
          ok = false;
          break;
        }
        // Ưu tiên bước vừa phải (không nhảy quá một quãng tám)
        const near = cand.filter((p) => Math.abs(pitchToMidi(p) - last) <= 12);
        seq.push(pickOf(near.length ? near : cand, rng));
      }
      if (ok) return seq;
    }
  }
  return null;
}

/** Sinh một câu. `prev` = hình câu trước (tránh lặp hình 3 lần liền là việc của UI — ở đây chỉ tránh lặp ngay). */
export function makeContourRound(pool: readonly Pitch[], round: number, week: number, rng: Rng = Math.random, prev?: Shape): ContourRound {
  const { notes, minGap } = contourLevel(round, week);
  const options = notes === 2 ? SHAPES2 : SHAPES3;
  let shape = pickOf(options, rng);
  if (shape === prev && rng() < 0.7) shape = pickOf(options.filter((s) => s !== prev), rng);
  const seq = buildFor(shape, pool, minGap, rng) ?? buildFor(shape, FALLBACK, minGap, rng)!;
  return { notes: seq, shape, options, correct: options.indexOf(shape) };
}

/** Sao (8 câu): 1★ ≥ 3 · 2★ ≥ 6 · 3★ = 8. */
export function contourStars(score: number): 0 | 1 | 2 | 3 {
  return score >= CONTOUR_ROUNDS ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0;
}

/** Tiếng đàn bí mật cho câu: 'piano' hoặc một tiếng đã mở khóa (đổi ngẫu nhiên mỗi câu cho vui). */
export function pickVoice(unlocked: readonly string[], rng: Rng = Math.random): string {
  return pickOf(['piano', ...unlocked], rng);
}
