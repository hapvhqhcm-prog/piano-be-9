import { midiToPitch, pitchToMidi, type Pitch } from '../piano/pitchTable';
import { diatonic } from '../music/staff';

/**
 * Trò nghe/đọc (APP_ASSESSMENT) theo giáo trình v2:
 * - updown:   "Lên hay xuống?"  — 2 nốt, nốt sau cao hơn hay thấp hơn (cao độ TƯƠNG ĐỐI)
 * - stepskip: "Bước hay nhảy?" — 2 nốt cạnh nhau (bước) hay cách một phím (nhảy)
 * - identify: "Nốt nào đây?"   — luôn nghe nốt MỐC (Đô) trước, rồi nốt cần đoán → chạm phím ảo
 * - read:     "Đọc nốt"        — nốt hiện trên khuông, bé chạm phím ảo (không nghe trước)
 * - majorminor: "Vui hay buồn?" — app rải hợp âm TRƯỞNG (vui) hoặc THỨ (buồn) — Cấp 3
 */
export type QuizVariant = 'updown' | 'stepskip' | 'identify' | 'read' | 'majorminor';

export interface QuizSpec {
  variant: QuizVariant;
  pool: Pitch[];
  rounds: number;
  /** Nốt mốc cho identify (mặc định Đô thấp nhất trong pool) */
  reference?: Pitch;
  /** Khóa nhạc cho trò đọc nốt (mặc định khóa Sol) */
  clef?: 'treble' | 'bass';
}

export interface Choice {
  value: string;
  label: string;
  emoji: string;
}

export interface Question {
  /** Đáp án đúng — lưu vào APP_ASSESSMENT.expected */
  expected: string;
  /** Các nốt app phát (theo thứ tự) */
  play: Pitch[];
  /** Nốt hiện trên khuông (đọc nốt) */
  show?: Pitch;
  /** Có nút lựa chọn (updown/stepskip); không có = trả lời bằng phím ảo */
  choices?: Choice[];
}

export const UPDOWN_CHOICES: Choice[] = [
  { value: 'up', label: 'Lên', emoji: '⬆️' },
  { value: 'down', label: 'Xuống', emoji: '⬇️' },
];

export const STEPSKIP_CHOICES: Choice[] = [
  { value: 'step', label: 'Bước', emoji: '🚶' },
  { value: 'skip', label: 'Nhảy', emoji: '🐸' },
];

export const MAJORMINOR_CHOICES: Choice[] = [
  { value: 'major', label: 'Vui (trưởng)', emoji: '😊' },
  { value: 'minor', label: 'Buồn (thứ)', emoji: '😢' },
];

type Rng = () => number;
const pick = <T>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length) % arr.length];

export function referenceOf(spec: QuizSpec): Pitch {
  if (spec.reference) return spec.reference;
  const cs = spec.pool.filter((p) => p.startsWith('C') && !p.includes('#'));
  const pool = cs.length ? cs : spec.pool;
  return pool.reduce((a, b) => (pitchToMidi(a) <= pitchToMidi(b) ? a : b));
}

/** Sinh một câu hỏi; `prev` để tránh lặp y hệt câu trước. */
export function makeQuestion(spec: QuizSpec, rng: Rng = Math.random, prev?: Question): Question {
  for (let tries = 0; tries < 12; tries++) {
    const q = build(spec, rng);
    if (!prev || q.play.join() !== prev.play.join() || q.show !== prev.show) return q;
  }
  return build(spec, rng);
}

function build(spec: QuizSpec, rng: Rng): Question {
  const pool = spec.pool;
  switch (spec.variant) {
    case 'updown': {
      const a = pick(pool, rng);
      let b = pick(pool, rng);
      for (let i = 0; i < 10 && pitchToMidi(b) === pitchToMidi(a); i++) b = pick(pool, rng);
      if (pitchToMidi(b) === pitchToMidi(a)) b = pool.find((p) => p !== a) ?? a;
      return { expected: pitchToMidi(b) > pitchToMidi(a) ? 'up' : 'down', play: [a, b], choices: UPDOWN_CHOICES };
    }
    case 'stepskip': {
      const sorted = [...pool].sort((x, y) => diatonic(x) - diatonic(y));
      const pairs: Array<[Pitch, Pitch, 'step' | 'skip']> = [];
      for (const a of sorted)
        for (const b of sorted) {
          const d = Math.abs(diatonic(a) - diatonic(b));
          if (d === 1) pairs.push([a, b, 'step']);
          if (d === 2) pairs.push([a, b, 'skip']);
        }
      // Cân bằng: chọn loại trước, rồi chọn cặp
      const kind = rng() < 0.5 ? 'step' : 'skip';
      const ofKind = pairs.filter((p) => p[2] === kind);
      const [a, b, k] = pick(ofKind.length ? ofKind : pairs, rng);
      return { expected: k, play: [a, b], choices: STEPSKIP_CHOICES };
    }
    case 'identify': {
      const ref = referenceOf(spec);
      const target = pick(pool, rng);
      return { expected: target, play: [ref, target] };
    }
    case 'read': {
      const target = pick(pool, rng);
      return { expected: target, play: [], show: target };
    }
    case 'majorminor': {
      const root = pitchToMidi(pick(pool, rng));
      const major = rng() < 0.5;
      const chord = [root, root + (major ? 4 : 3), root + 7].map(midiToPitch);
      return { expected: major ? 'major' : 'minor', play: [...chord, chord[2], chord[1], chord[0]], choices: MAJORMINOR_CHOICES };
    }
  }
}

/** Đoán nốt: chạm đúng phím. Lựa chọn: đúng giá trị. */
export function isCorrect(q: Question, answer: string): boolean {
  return q.expected === answer;
}
