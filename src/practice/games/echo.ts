/**
 * 🔁 "Đàn lại giai điệu" — kiểu "Simon": app chơi một giai điệu ngắn (phím sáng theo), bé đàn lại đúng thứ tự
 * trên phím ảo hoặc đàn thật (micro). Mỗi lần đúng → giai điệu dài thêm MỘT nốt. Mỗi giai điệu được thử 2 lần.
 * Phần THUẦN: bể nốt, nối dài giai điệu, chấm từng nốt, điểm & sao.
 */
import type { Pitch } from '../../piano/pitchTable';
import { octave4Pool, pickOf, samePitchClass, weekWithLetters, type Rng } from './pools';

export const ECHO_START = 2;
export const ECHO_MAX = 12;
/** Số lần thử mỗi giai điệu (sai lần 1 → "Nghe lại nhé", sai lần 2 → hết trò) */
export const ECHO_TRIES = 2;
export const ECHO_MIN_NOTES = 3;

/** Bể nốt: tên nốt đã học ở quãng tám 4. Giai đoạn đầu (≤ 5 nốt) dùng hết; về sau tối đa 6 nốt cho vừa trí nhớ. */
export function echoPool(week: number): Pitch[] {
  const p = octave4Pool(week);
  if (p.length < ECHO_MIN_NOTES) return ['C4', 'D4', 'E4'];
  return p.slice(0, 6);
}
export const echoUnlocked = (week: number): boolean => octave4Pool(week).length >= ECHO_MIN_NOTES;
export const echoUnlockWeek = (): number | null => weekWithLetters(ECHO_MIN_NOTES);

/**
 * Thêm một nốt vào cuối giai điệu: ưu tiên nốt GẦN nốt trước (bước/nhảy nhỏ — giai điệu dễ hát), không lặp 3 nốt giống nhau.
 */
export function extendEcho(seq: readonly Pitch[], pool: readonly Pitch[], rng: Rng = Math.random): Pitch[] {
  const last = seq[seq.length - 1];
  const li = last ? pool.indexOf(last) : -1;
  let cand = li < 0 ? [...pool] : pool.filter((_, i) => Math.abs(i - li) <= 2);
  const tripled = seq.length >= 2 && seq[seq.length - 1] === seq[seq.length - 2];
  if (tripled) cand = cand.filter((p) => p !== last);
  if (!cand.length) cand = pool.filter((p) => p !== last);
  return [...seq, pickOf(cand.length ? cand : pool, rng)];
}

/** Giai điệu đầu tiên (ECHO_START nốt). */
export function startEcho(pool: readonly Pitch[], rng: Rng = Math.random): Pitch[] {
  let s: Pitch[] = [];
  while (s.length < ECHO_START) s = extendEcho(s, pool, rng);
  return s;
}

/** Chấm nốt thứ `idx` bé vừa đàn — đúng tên nốt (mọi quãng tám). */
export const echoNoteOk = (seq: readonly Pitch[], idx: number, got: Pitch): boolean =>
  idx < seq.length && samePitchClass(seq[idx], got);

/** Điểm = độ dài giai điệu dài nhất bé đàn lại đúng. Sao: 1★ ≥ 3 · 2★ ≥ 5 · 3★ ≥ 7. */
export function echoStars(best: number): 0 | 1 | 2 | 3 {
  return best >= 7 ? 3 : best >= 5 ? 2 : best >= 3 ? 1 : 0;
}

/** Tốc độ phát mẫu: giai điệu dài → chậm hơn chút (giây mỗi nốt). */
export const echoNoteSec = (len: number): number => (len <= 4 ? 0.5 : len <= 7 ? 0.56 : 0.62);
