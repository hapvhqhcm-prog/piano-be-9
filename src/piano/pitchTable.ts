/** Cao độ dạng khoa học: "C4" = Đô giữa (MIDI 60), "C#4", … */
export type Pitch = string;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
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
  letter: string;
  octave: number;
}

const PITCH_RE = /^([A-G])(#?)(-?\d)$/;

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function pitchToMidi(pitch: Pitch): number {
  const m = PITCH_RE.exec(pitch);
  if (!m) throw new Error(`Cao độ không hợp lệ: ${pitch}`);
  const idx = NAMES.indexOf((m[1] + m[2]) as (typeof NAMES)[number]);
  if (idx < 0) throw new Error(`Cao độ không hợp lệ: ${pitch}`);
  return (Number(m[3]) + 1) * 12 + idx;
}

export function midiToPitch(midi: number): Pitch {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function isValidPitch(pitch: string): boolean {
  if (!PITCH_RE.exec(pitch)) return false;
  return !/^(E|B)#/.test(pitch);
}

export function pitchInfo(pitch: Pitch): PitchInfo {
  const midi = pitchToMidi(pitch);
  const name = NAMES[midi % 12];
  return {
    pitch,
    midi,
    freq: midiToFreq(midi),
    isBlack: name.length > 1,
    letter: name[0],
    octave: Math.floor(midi / 12) - 1,
  };
}

export function pitchFreq(pitch: Pitch): number {
  return midiToFreq(pitchToMidi(pitch));
}

export const KEYBOARD_LOW: Pitch = 'C3';
export const KEYBOARD_HIGH: Pitch = 'C5';

/** C3–C5: 25 phím (15 trắng, 10 đen). */
export const KEYBOARD_PITCHES: readonly PitchInfo[] = (() => {
  const out: PitchInfo[] = [];
  for (let m = pitchToMidi(KEYBOARD_LOW); m <= pitchToMidi(KEYBOARD_HIGH); m++) {
    out.push(pitchInfo(midiToPitch(m)));
  }
  return out;
})();

/** "Đô" cho C4, "Đô thăng" cho C#4. */
export function viName(pitch: Pitch): string {
  const info = pitchInfo(pitch);
  return VI_NAMES[info.letter] + (info.isBlack ? ' thăng' : '');
}

/** Nhãn song song kiểu "Đô / C" (§3). */
export function noteLabel(pitch: Pitch): string {
  const info = pitchInfo(pitch);
  return `${viName(pitch)} / ${info.letter}${info.isBlack ? '♯' : ''}`;
}
