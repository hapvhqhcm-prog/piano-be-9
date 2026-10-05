import { midiToPitch, pitchToMidi, viName, type Pitch } from '../piano/pitchTable';
import { diatonic, staffStep } from '../music/staff';

/**
 * Trò nghe/đọc (APP_ASSESSMENT) theo giáo trình v2:
 * - updown:   "Lên hay xuống?"  — 2 nốt, nốt sau cao hơn hay thấp hơn (cao độ TƯƠNG ĐỐI)
 * - stepskip: "Bước hay nhảy?" — 2 nốt cạnh nhau (bước) hay cách một phím (nhảy)
 * - identify: "Nốt nào đây?"   — luôn nghe nốt MỐC (Đô) trước, rồi nốt cần đoán → chạm phím ảo
 * - read:     "Đọc nốt"        — nốt hiện trên khuông, bé chạm phím ảo (không nghe trước)
 * - majorminor: "Vui hay buồn?" — app rải hợp âm TRƯỞNG (vui) hoặc THỨ (buồn) — Cấp 3
 */
/**
 * interval (v5, OWNER duyệt 2026-10-05 — đọc nhạc theo QUÃNG): khuông hiện 2 nốt, bé trả lời
 * giống nhau / bước (quãng 2) / nhảy (quãng 3) / … và lên hay xuống — đọc theo hình dáng, không thuộc lòng ngón↔phím.
 * landmark (v5): nhận các NỐT MỐC (Đô giữa, Sol khóa Sol, Fa khóa Fa, Đô cao/thấp, dòng kẻ phụ).
 */
export type QuizVariant = 'updown' | 'stepskip' | 'identify' | 'read' | 'majorminor' | 'interval' | 'landmark';

export interface QuizSpec {
  variant: QuizVariant;
  pool: Pitch[];
  rounds: number;
  /** Nốt mốc cho identify (mặc định Đô thấp nhất trong pool) */
  reference?: Pitch;
  /** Khóa nhạc cho trò đọc nốt (mặc định khóa Sol) */
  clef?: 'treble' | 'bass';
  /** interval: quãng lớn nhất được hỏi (2 = chỉ bước, 3 = bước/nhảy, 5 = tới quãng 5) */
  maxInterval?: 2 | 3 | 4 | 5;
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
  /** interval (v5): hai nốt hiện trên khuông (nốt trước, nốt sau) */
  pair?: [Pitch, Pitch];
  /** interval / landmark (v5): khóa của khuông hiện câu hỏi */
  clef?: 'treble' | 'bass';
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

/**
 * v5 — QUÃNG (interval). Mã đáp án (APP_ASSESSMENT.expected):
 * 'same' · 'step-up' · 'step-down' · 'skip-up' · 'skip-down' · '4th-up' · '4th-down' · '5th-up' · '5th-down'.
 * Khoảng cách tính theo BẬC TRÊN KHUÔNG (diatonic): 0 = giống, 1 = bước (quãng 2), 2 = nhảy (quãng 3), 3 = quãng 4, 4 = quãng 5.
 */
export type IntervalKind = 'same' | 'step' | 'skip' | '4th' | '5th';
export const INTERVAL_KINDS: readonly IntervalKind[] = ['same', 'step', 'skip', '4th', '5th'];

export const INTERVAL_INFO: Record<IntervalKind, { label: string; emoji: string; name: string }> = {
  same: { label: 'Giống', emoji: '🟰', name: 'Giống nhau (cùng một nốt)' },
  step: { label: 'Bước', emoji: '👣', name: 'Bước (quãng 2)' },
  skip: { label: 'Nhảy', emoji: '🐸', name: 'Nhảy (quãng 3)' },
  '4th': { label: 'Nhảy xa 4', emoji: '🦘', name: 'Nhảy xa (quãng 4)' },
  '5th': { label: 'Nhảy xa 5', emoji: '🚀', name: 'Nhảy xa (quãng 5)' },
};

/** Mã đáp án quãng: 'same' hoặc `${kind}-${up|down}`. */
export function intervalCode(a: Pitch, b: Pitch): string {
  const d = diatonic(b) - diatonic(a);
  const kind = INTERVAL_KINDS[Math.abs(d)];
  if (!kind) throw new Error(`Quãng quá xa: ${a} → ${b}`);
  return kind === 'same' ? 'same' : `${kind}-${d > 0 ? 'up' : 'down'}`;
}

/** Tách mã đáp án quãng thành loại + hướng. */
export function parseInterval(code: string): { kind: IntervalKind; dir: 'up' | 'down' | null } {
  if (code === 'same') return { kind: 'same', dir: null };
  const [kind, dir] = code.split('-') as [IntervalKind, 'up' | 'down'];
  return { kind, dir };
}

/** Tên đọc cho bé: "Bước (quãng 2) lên ⬆️". */
export function intervalText(code: string): string {
  const { kind, dir } = parseInterval(code);
  const info = INTERVAL_INFO[kind];
  if (!info) return code;
  return dir ? `${info.name} ${dir === 'up' ? 'lên ⬆️' : 'xuống ⬇️'}` : info.name;
}

/** Tất cả lựa chọn quãng tới `maxInterval` (≤ 3: 3 hoặc 5 nút gộp; 4–5: màn hỏi 2 bước — loại quãng rồi hướng). */
export function intervalChoices(maxInterval: 2 | 3 | 4 | 5 = 3): Choice[] {
  const kinds = INTERVAL_KINDS.slice(0, maxInterval);
  return kinds.flatMap((k): Choice[] => {
    const info = INTERVAL_INFO[k];
    if (k === 'same') return [{ value: 'same', label: info.label, emoji: info.emoji }];
    return [
      { value: `${k}-up`, label: `${info.label} lên`, emoji: '⬆️' },
      { value: `${k}-down`, label: `${info.label} xuống`, emoji: '⬇️' },
    ];
  });
}

/**
 * v5 — NỐT MỐC (landmark): tên gọi cho bé. Đáp án (expected) là TÊN NỐT khoa học, vd 'C4', 'G4', 'F3'.
 * Nốt ngoài danh sách (vd nốt dòng kẻ phụ trong pool) → "La (dòng kẻ phụ)".
 */
export const LANDMARKS: Record<string, { name: string; emoji: string }> = {
  C3: { name: 'Đô thấp', emoji: '🌊' },
  F3: { name: 'Fa khóa Fa', emoji: '🐝' },
  C4: { name: 'Đô giữa', emoji: '🏠' },
  G4: { name: 'Sol khóa Sol', emoji: '🌀' },
  C5: { name: 'Đô cao', emoji: '⛰️' },
};

/** Khóa tự nhiên của nốt: Đô giữa trở lên → khóa Sol, thấp hơn → khóa Fa (spec.clef ép nếu nốt vẫn đọc được trên khóa đó). */
export function landmarkClef(p: Pitch, forced?: 'treble' | 'bass'): 'treble' | 'bass' {
  const m = pitchToMidi(p);
  if (forced === 'treble' && m >= 57) return 'treble';
  if (forced === 'bass' && m <= 64) return 'bass';
  return m >= 60 ? 'treble' : 'bass';
}

export function landmarkName(p: Pitch, clef: 'treble' | 'bass' = landmarkClef(p)): { name: string; emoji: string } {
  const lm = LANDMARKS[midiToPitch(pitchToMidi(p))];
  if (lm) return lm;
  const step = staffStep(p, clef);
  const ledger = step < -1 || step > 9;
  return { name: ledger ? `${viName(p)} (dòng kẻ phụ)` : viName(p), emoji: ledger ? '🪜' : '🎵' };
}

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
    case 'interval': {
      const max = spec.maxInterval ?? 3;
      // Mọi cặp (a, b) trong pool cách nhau 0…max−1 bậc; "giống" = đúng cùng một nốt (F4/F#4 cùng bậc thì bỏ)
      const byKind = new Map<number, Array<[Pitch, Pitch]>>();
      for (const a of pool)
        for (const b of pool) {
          const d = Math.abs(diatonic(b) - diatonic(a));
          if (d >= max) continue;
          if (d === 0 && pitchToMidi(a) !== pitchToMidi(b)) continue;
          if (!byKind.has(d)) byKind.set(d, []);
          byKind.get(d)!.push([a, b]);
        }
      // Cân bằng: chọn loại quãng trước ("giống" 1 phần, mỗi loại khác 2 phần), rồi chọn cặp
      const kinds = [...byKind.keys()].sort((x, y) => x - y);
      if (!kinds.length) throw new Error('interval: pool trống');
      const weighted = kinds.flatMap((d) => (d === 0 ? [d] : [d, d]));
      const [a, b] = pick(byKind.get(pick(weighted, rng))!, rng);
      return {
        expected: intervalCode(a, b),
        play: [a, b],
        pair: [a, b],
        clef: spec.clef ?? 'treble',
        choices: intervalChoices(max),
      };
    }
    case 'landmark': {
      const uniq = pool.filter((p, i) => pool.findIndex((x) => pitchToMidi(x) === pitchToMidi(p)) === i);
      const target = pick(uniq, rng);
      const clef = landmarkClef(target, spec.clef);
      // Tối đa 4 lựa chọn (gồm đáp án), xếp từ thấp lên cao như trên đàn
      const others = uniq.filter((p) => p !== target);
      const picked: Pitch[] = [];
      while (picked.length < 3 && others.length) picked.push(others.splice(Math.floor(rng() * others.length) % others.length, 1)[0]);
      const opts = [target, ...picked].sort((x, y) => pitchToMidi(x) - pitchToMidi(y));
      return {
        expected: target,
        play: [target],
        show: target,
        clef,
        choices: opts.map((p) => {
          const n = landmarkName(p);
          return { value: p, label: n.name, emoji: n.emoji };
        }),
      };
    }
  }
}

/** Đoán nốt: chạm đúng phím. Lựa chọn: đúng giá trị. Nốt mốc: chọn tên HOẶC chạm phím (so theo cao độ). */
export function isCorrect(q: Question, answer: string): boolean {
  if (q.expected === answer) return true;
  if (!q.show) return false;
  try {
    return pitchToMidi(q.expected) === pitchToMidi(answer);
  } catch {
    return false;
  }
}
