/**
 * ⚡ "Đọc nốt nhanh" — trò 60 giây: một nốt hiện ra, bé chạm đúng phím (hoặc đàn trên đàn thật nếu micro bật).
 * Phần THUẦN (không DOM): bể nốt theo giáo trình — chỉ những nốt con ĐÃ HỌC tới tuần hiện tại.
 *
 * - Từ tuần học đọc khuông (trò đọc nốt / nốt mốc / quãng đầu tiên) → chế độ 'staff': nốt trên khuông với khóa tương ứng.
 *   Khóa Fa chỉ có khi giáo trình đã dạy (và không trước LEFT_HAND_WEEK); dòng kẻ phụ / nốt cao chỉ sau tuần dạy chúng.
 * - Trước đó → chế độ 'name': hiện TÊN nốt (Đô, Rê…) — bé tìm phím (đúng mọi quãng tám).
 */
import { LEFT_HAND_WEEK, WEEKS } from '../../lessons/lessonEngine';
import { landmarkClef, type QuizSpec } from '../quiz';
import { midiToPitch, pitchToMidi, type Pitch } from '../../piano/pitchTable';

export type Clef = 'treble' | 'bass';
export interface RushNote {
  pitch: Pitch;
  clef: Clef;
}
export interface RushPool {
  mode: 'name' | 'staff';
  notes: RushNote[];
}

export const RUSH_SECONDS = 60;
const STAFF_VARIANTS: ReadonlyArray<QuizSpec['variant']> = ['read', 'landmark', 'interval'];
const FALLBACK_NAMES: Pitch[] = ['C4', 'D4', 'E4', 'F4', 'G4'];

/** Mọi bài quiz (khởi động + trong bài) của các tuần ≤ week. */
function quizzesUpTo(week: number): QuizSpec[] {
  return WEEKS.filter((w) => w.week <= week).flatMap((w) => [
    ...(w.warmup ? [w.warmup] : []),
    ...w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'quiz' ? [a.quiz] : []))),
  ]);
}

/** Bể nốt cho tuần `week` (tuần hiện tại của bé). */
export function rushPool(week: number): RushPool {
  const seen = new Map<string, RushNote>();
  const add = (pitch: Pitch, clef: Clef) => {
    if (clef === 'bass' && week < LEFT_HAND_WEEK) return;
    const key = `${pitchToMidi(pitch)}:${clef}`;
    if (!seen.has(key)) seen.set(key, { pitch, clef });
  };
  for (const q of quizzesUpTo(week)) {
    if (!STAFF_VARIANTS.includes(q.variant)) continue;
    for (const p of q.pool) add(p, q.variant === 'landmark' ? landmarkClef(p, q.clef) : (q.clef ?? 'treble'));
  }
  // Việc "Từng nốt" có hiện khuông (staff: true) — vd thế Sol, nốt cao, dòng kẻ phụ
  for (const w of WEEKS) {
    if (w.week > week) continue;
    for (const l of w.lessons)
      for (const a of l.activities) {
        if (a.kind !== 'notes') continue;
        for (const t of a.segment.targets) {
          if (!t.staff) continue;
          const clef: Clef = t.clef ?? (t.hand === 'LH' ? 'bass' : 'treble');
          for (const k of t.keys) add(k, clef);
        }
      }
  }
  const notes = [...seen.values()].sort((a, b) => pitchToMidi(a.pitch) - pitchToMidi(b.pitch));
  if (notes.length >= 3) return { mode: 'staff', notes };
  return { mode: 'name', notes: namePool(week).map((pitch) => ({ pitch, clef: 'treble' })) };
}

/** Trước khi đọc khuông: tên các phím trắng đã học (từ việc "Từng nốt"), đưa về quãng tám 4. */
function namePool(week: number): Pitch[] {
  const letters = new Set<string>();
  for (const w of WEEKS) {
    if (w.week > week) continue;
    for (const l of w.lessons)
      for (const a of l.activities) {
        if (a.kind !== 'notes') continue;
        for (const t of a.segment.targets) for (const k of t.keys) if (/^[A-G]\d$/.test(k)) letters.add(k[0]);
      }
  }
  const out = [...letters].map((c) => `${c}4`).sort((a, b) => pitchToMidi(a) - pitchToMidi(b));
  return out.length >= 3 ? out : FALLBACK_NAMES;
}

/** Nốt kế tiếp: ngẫu nhiên, không lặp lại đúng nốt vừa rồi. */
export function nextRushNote(pool: RushPool, rng: () => number = Math.random, prev?: RushNote): RushNote {
  const n = pool.notes;
  if (n.length <= 1) return n[0];
  for (let i = 0; i < 8; i++) {
    const c = n[Math.floor(rng() * n.length) % n.length];
    if (!prev || c.pitch !== prev.pitch || c.clef !== prev.clef) return c;
  }
  return n.find((c) => c.pitch !== prev?.pitch) ?? n[0];
}

/** Chấm một phím: chế độ tên → đúng tên nốt ở mọi quãng tám; chế độ khuông → đúng phím (micro: cho lệch 1 quãng tám). */
export function rushCorrect(pool: RushPool, want: RushNote, got: Pitch, fromMic = false): boolean {
  const d = pitchToMidi(got) - pitchToMidi(want.pitch);
  if (pool.mode === 'name') return ((d % 12) + 12) % 12 === 0;
  return d === 0 || (fromMic && Math.abs(d) === 12);
}

/** Dải bàn phím ảo vừa khít các nốt (phím trắng đầu/cuối) — phím to nhất có thể. Chế độ tên: Đô4 → Đô5. */
export function rushKeyboardRange(pool: RushPool): [Pitch, Pitch] {
  if (pool.mode === 'name') return ['C4', 'C5'];
  const ms = pool.notes.map((n) => pitchToMidi(n.pitch));
  const white = (m: number) => !midiToPitch(m).includes('#');
  let lo = Math.min(...ms);
  let hi = Math.max(...ms);
  while (!white(lo)) lo--;
  while (!white(hi)) hi++;
  // Ít nhất một quãng tám cho dễ định hướng
  if (hi - lo < 12) hi = lo + 12;
  while (!white(hi)) hi++;
  return [midiToPitch(lo), midiToPitch(hi)];
}

/** Sao cuối trò (60 giây): 1★ ≥ 5 · 2★ ≥ 12 · 3★ ≥ 20 nốt đúng. */
export function rushStars(score: number): 0 | 1 | 2 | 3 {
  return score >= 20 ? 3 : score >= 12 ? 2 : score >= 5 ? 1 : 0;
}
