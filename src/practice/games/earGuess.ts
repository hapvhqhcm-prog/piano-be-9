/**
 * 🎧 "Đoán nốt" — app chơi nốt MỐC Đô rồi một nốt bí mật; bé chạm phím đó (hoặc đàn trên đàn thật khi micro bật).
 * Phần THUẦN: bể nốt theo giáo trình, mức khó (bể rộng dần), chấm, sao.
 *
 * - Bể đầy đủ = tên nốt đã học, ở quãng tám 4 (pools.octave4Pool) — chỉ nốt con đã biết.
 * - Mức 1 = 3 nốt cách xa nhau (vd Đô–Mi–Sol); mỗi 3 câu đúng liên tiếp → thêm 1 nốt (tới hết bể).
 * - Lượt sau bắt đầu thấp hơn mức lần trước một bậc (AppData.games.earGuess.level) — vừa sức, không bắt đầu lại từ đầu.
 */
import type { Pitch } from '../../piano/pitchTable';
import { octave4Pool, pickOf, samePitchClass, weekWithLetters, type Rng } from './pools';

export const EAR_ROUNDS = 10;
export const EAR_MIN_NOTES = 3;
/** Đúng liền bấy nhiêu câu thì lên mức (thêm 1 nốt) */
export const EAR_LEVEL_UP = 3;
export const EAR_REFERENCE: Pitch = 'C4';

/** Bể đầy đủ cho tuần `week` (luôn có Đô4 — nốt mốc). */
export function earPool(week: number): Pitch[] {
  const p = octave4Pool(week);
  return p.length >= EAR_MIN_NOTES ? p : ['C4', 'D4', 'E4'];
}

/** Trò mở khi con biết ≥ 3 tên nốt. */
export const earUnlocked = (week: number): boolean => octave4Pool(week).length >= EAR_MIN_NOTES;
export const earUnlockWeek = (): number | null => weekWithLetters(EAR_MIN_NOTES);

/** Mức cao nhất của bể (mức 1 = 3 nốt). */
export const earMaxLevel = (pool: readonly Pitch[]): number => Math.max(1, pool.length - (EAR_MIN_NOTES - 1));

/**
 * Các nốt của mức `level`: chọn ĐỀU trong bể (nốt đầu và nốt cuối luôn có) → mức thấp các nốt cách xa nhau, dễ nghe.
 * Luôn có Đô (nốt đầu bể) — nghe Đô mốc rồi đoán Đô cũng là một câu vui.
 */
export function earLevelNotes(pool: readonly Pitch[], level: number): Pitch[] {
  const n = Math.min(pool.length, Math.max(EAR_MIN_NOTES, level + EAR_MIN_NOTES - 1));
  if (n >= pool.length) return [...pool];
  const idx = new Set<number>();
  for (let i = 0; i < n; i++) idx.add(Math.round((i * (pool.length - 1)) / (n - 1)));
  return [...idx].sort((a, b) => a - b).map((i) => pool[i]);
}

/** Mức bắt đầu: thấp hơn mức lần trước một bậc (≥ 1, ≤ mức cao nhất). */
export function earStartLevel(saved: number | undefined, pool: readonly Pitch[]): number {
  const s = typeof saved === 'number' && Number.isFinite(saved) ? Math.floor(saved) : 1;
  return Math.min(earMaxLevel(pool), Math.max(1, s - 1));
}

/** Nốt bí mật kế tiếp — không lặp đúng nốt vừa rồi. */
export function nextEarNote(notes: readonly Pitch[], rng: Rng = Math.random, prev?: Pitch): Pitch {
  if (notes.length <= 1) return notes[0];
  for (let i = 0; i < 8; i++) {
    const c = pickOf(notes, rng);
    if (c !== prev) return c;
  }
  return notes.find((n) => n !== prev) ?? notes[0];
}

/** Chấm: đúng tên nốt (mọi quãng tám — phím ảo Đô4–Đô5 và đàn thật đều được). */
export const earCorrect = (want: Pitch, got: Pitch): boolean => samePitchClass(want, got);

/** Trạng thái một lượt chơi (thuần — dễ test). */
export interface EarState {
  level: number;
  streak: number;
  bestStreak: number;
  score: number;
  round: number;
}

export const earInit = (level: number): EarState => ({ level, streak: 0, bestStreak: 0, score: 0, round: 0 });

/** Ghi một câu trả lời → trạng thái mới + có lên mức không. Sai: chỉ mất chuỗi (không xuống mức, không trừ điểm). */
export function earAnswer(s: EarState, ok: boolean, maxLevel: number): { state: EarState; levelUp: boolean } {
  const streak = ok ? s.streak + 1 : 0;
  const levelUp = ok && streak % EAR_LEVEL_UP === 0 && s.level < maxLevel;
  return {
    state: {
      level: levelUp ? s.level + 1 : s.level,
      streak,
      bestStreak: Math.max(s.bestStreak, streak),
      score: s.score + (ok ? 1 : 0),
      round: s.round + 1,
    },
    levelUp,
  };
}

/** Sao (10 câu): 1★ ≥ 3 · 2★ ≥ 6 · 3★ ≥ 9. */
export function earStars(score: number): 0 | 1 | 2 | 3 {
  return score >= 9 ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0;
}
