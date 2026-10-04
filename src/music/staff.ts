import { pitchInfo, type Pitch } from '../piano/pitchTable';

export type Clef = 'treble' | 'bass';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Bậc diatonic tuyệt đối (C0 = 0, D0 = 1, …). */
export function diatonic(pitch: Pitch): number {
  const i = pitchInfo(pitch);
  return i.octave * 7 + LETTERS.indexOf(i.letter);
}

/** Vạch dưới cùng của khuông: Khóa Sol = Mi4, Khóa Fa = Sol2. */
const BOTTOM_LINE: Record<Clef, Pitch> = { treble: 'E4', bass: 'G2' };

/**
 * Vị trí trên khuông: 0 = vạch dưới cùng, 1 = khe đầu tiên, 2 = vạch thứ hai, … 8 = vạch trên cùng.
 * Số âm = dưới khuông (Đô giữa trên khóa Sol = -2, "đội mũ" vạch phụ).
 */
export function staffStep(pitch: Pitch, clef: Clef): number {
  return diatonic(pitch) - diatonic(BOTTOM_LINE[clef]);
}

/** Các vạch phụ cần vẽ cho một nốt (bậc chẵn ngoài khoảng 0–8). */
export function ledgerSteps(step: number): number[] {
  const out: number[] = [];
  for (let s = -2; s >= step; s -= 2) out.push(s);
  for (let s = 10; s <= step; s += 2) out.push(s);
  return out;
}

/** Đuôi nốt hướng lên khi nốt nằm dưới vạch giữa. */
export function stemUp(step: number): boolean {
  return step < 4;
}

/** Cách đọc vị trí cho trẻ: "trên vạch 1", "khe 2", "đội mũ vạch phụ". */
export function describeStep(step: number): string {
  if (step === -2) return 'đội mũ vạch phụ';
  if (step === -1) return 'ngồi dưới vạch 1';
  if (step < -2 || step > 8) return 'ngoài khuông';
  return step % 2 === 0 ? `trên vạch ${step / 2 + 1}` : `ở khe ${(step + 1) / 2}`;
}
