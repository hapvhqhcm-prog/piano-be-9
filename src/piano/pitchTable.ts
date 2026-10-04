/** Cao độ dạng khoa học: "C4" = Đô giữa (MIDI 60), "C#4" (thăng), "Bb4" (giáng). */
export type Pitch = string;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const LETTER_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const VI_NAMES: Record<string, string> = {
  C: 'Đô',
  D: 'Rê',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
};

export interface PitchInfo {
  pitch: Pitch;
  midi: number;
  freq: number;
  isBlack: boolean;
  /** Chữ cái THEO CÁCH VIẾT (Bb4 → B, A#4 → A) — dùng để đặt nốt trên khuông */
  letter: string;
  /** '#', 'b' hoặc '' */
  accidental: '' | '#' | 'b';
  /** Quãng tám theo cách viết */
  octave: number;
}

const PITCH_RE = /^([A-G])(#|b)?(-?\d)$/;

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function parse(pitch: Pitch): { letter: string; acc: '' | '#' | 'b'; octave: number } {
  const m = PITCH_RE.exec(pitch);
  if (!m) throw new Error(`Cao độ không hợp lệ: ${pitch}`);
  return { letter: m[1], acc: (m[2] ?? '') as '' | '#' | 'b', octave: Number(m[3]) };
}

export function pitchToMidi(pitch: Pitch): number {
  const p = parse(pitch);
  return (p.octave + 1) * 12 + LETTER_SEMITONE[p.letter] + (p.acc === '#' ? 1 : p.acc === 'b' ? -1 : 0);
}

/** MIDI → tên dùng dấu thăng (C#4). Dùng cho phím ảo & micro; so sánh nốt nên dùng MIDI. */
export function midiToPitch(midi: number): Pitch {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Cùng một phím (C#4 ≡ Db4)? */
export function samePitch(a: Pitch, b: Pitch): boolean {
  return pitchToMidi(a) === pitchToMidi(b);
}

export function isValidPitch(pitch: string): boolean {
  if (!PITCH_RE.exec(pitch)) return false;
  return !/^(E|B)#|^(C|F)b/.test(pitch);
}

export function pitchInfo(pitch: Pitch): PitchInfo {
  const midi = pitchToMidi(pitch);
  const p = parse(pitch);
  return {
    pitch,
    midi,
    freq: midiToFreq(midi),
    isBlack: NAMES[midi % 12].length > 1,
    letter: p.letter,
    accidental: p.acc,
    octave: p.octave,
  };
}

export function pitchFreq(pitch: Pitch): number {
  return midiToFreq(pitchToMidi(pitch));
}

export const KEYBOARD_LOW: Pitch = 'C3';
export const KEYBOARD_HIGH: Pitch = 'C5';

/** Các phím từ low đến high (gồm cả hai đầu). */
export function keyboardPitches(low: Pitch = KEYBOARD_LOW, high: Pitch = KEYBOARD_HIGH): PitchInfo[] {
  const out: PitchInfo[] = [];
  for (let m = pitchToMidi(low); m <= pitchToMidi(high); m++) out.push(pitchInfo(midiToPitch(m)));
  return out;
}

/** C3–C5: 25 phím (15 trắng, 10 đen) — dải mặc định. */
export const KEYBOARD_PITCHES: readonly PitchInfo[] = keyboardPitches();

/** Các dải bàn phím ảo có thể dùng, ưu tiên theo thứ tự (dải nhỏ, quen thuộc trước). */
const WINDOWS: Array<[Pitch, Pitch]> = [
  ['C3', 'C5'],
  ['C4', 'C6'],
  ['C2', 'C4'],
  ['F3', 'F5'],
  ['G2', 'G4'],
  ['C3', 'C6'],
  ['C2', 'C5'],
  ['C2', 'C6'],
];

/** Chọn dải bàn phím ảo chứa hết các nốt cần dùng (ưu tiên C3–C5). */
export function keyboardRangeFor(pitches: Pitch[]): [Pitch, Pitch] {
  if (!pitches.length) return [KEYBOARD_LOW, KEYBOARD_HIGH];
  const ms = pitches.map(pitchToMidi);
  const lo = Math.min(...ms);
  const hi = Math.max(...ms);
  for (const [a, b] of WINDOWS) if (pitchToMidi(a) <= lo && pitchToMidi(b) >= hi) return [a, b];
  return ['C2', 'C6'];
}

/** "Đô" cho C4, "Đô thăng" cho C#4, "Si giáng" cho Bb4. */
export function viName(pitch: Pitch): string {
  const info = pitchInfo(pitch);
  if (info.accidental === '#') return `${VI_NAMES[info.letter]} thăng`;
  if (info.accidental === 'b') return `${VI_NAMES[info.letter]} giáng`;
  return VI_NAMES[info.letter];
}

/** Nhãn song song kiểu "Đô / C", "Si giáng / B♭" (§3). */
export function noteLabel(pitch: Pitch): string {
  const info = pitchInfo(pitch);
  const acc = info.accidental === '#' ? '♯' : info.accidental === 'b' ? '♭' : '';
  return `${viName(pitch)} / ${info.letter}${acc}`;
}
