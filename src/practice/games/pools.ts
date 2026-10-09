/**
 * 🎮 Bể nốt cho các trò nghe (🎧 Đoán nốt, 🎢 Lên hay xuống, 🔁 Đàn lại giai điệu) — THUẦN, theo giáo trình:
 * chỉ những phím trắng con ĐÃ HỌC tới tuần hiện tại (việc "Từng nốt" + các bài nghe/đọc nốt của các tuần ≤ week).
 */
import { WEEKS } from '../../lessons/lessonEngine';
import { pitchToMidi, type Pitch } from '../../piano/pitchTable';

const WHITE = /^[A-G]\d$/;
const LETTERS = 'CDEFGAB';
export type Rng = () => number;

export const pickOf = <T>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length) % arr.length];

/** Mọi phím TRẮNG đã học tới tuần `week` (đúng quãng tám như trong bài), xếp từ trầm tới cao. */
export function taughtWhiteKeys(week: number): Pitch[] {
  const set = new Set<string>();
  const add = (k: string) => WHITE.test(k) && set.add(k);
  for (const w of WEEKS) {
    if (w.week > week) continue;
    if (w.warmup) w.warmup.pool.forEach(add);
    for (const l of w.lessons)
      for (const a of l.activities) {
        if (a.kind === 'notes') for (const t of a.segment.targets) t.keys.forEach(add);
        else if (a.kind === 'quiz') a.quiz.pool.forEach(add);
      }
  }
  return [...set].sort((a, b) => pitchToMidi(a) - pitchToMidi(b));
}

/**
 * Tên nốt (chữ cái) đã học, đưa về quãng tám 4 (Đô4 … Si4) — cho trò nghe trên bàn phím ảo một quãng tám.
 * Chỉ tính nốt con đã ĐÀN (việc "Từng nốt") hoặc đã nghe/đọc ở bài quiz — nốt Đô luôn có (nốt mốc).
 */
export function octave4Pool(week: number): Pitch[] {
  const letters = new Set(taughtWhiteKeys(week).map((k) => k[0]));
  return LETTERS.split('')
    .filter((c) => letters.has(c))
    .map((c) => `${c}4`);
}

/** Tuần đầu tiên có ít nhất `n` tên nốt đã học (null = không bao giờ). */
export function weekWithLetters(n: number): number | null {
  for (const w of WEEKS) if (octave4Pool(w.week).length >= n) return w.week;
  return null;
}

/** Cùng tên nốt (bỏ qua quãng tám) — micro/đàn thật: bé đàn Đô ở quãng nào cũng đúng. */
export function samePitchClass(a: Pitch, b: Pitch): boolean {
  return (((pitchToMidi(a) - pitchToMidi(b)) % 12) + 12) % 12 === 0;
}
