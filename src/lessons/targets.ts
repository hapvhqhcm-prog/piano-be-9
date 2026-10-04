import { fingerFor } from '../piano/fingering';
import { noteLabel, type Pitch } from '../piano/pitchTable';
import type { Target } from './types';

/** Một nốt tay phải — số ngón lấy từ fingering.ts (§6), không gõ tay. */
export function rhNote(pitch: Pitch, subtitle?: string, guides?: Pitch[]): Target {
  return {
    noteId: pitch,
    title: noteLabel(pitch),
    subtitle,
    keys: [pitch],
    guides,
    finger: fingerFor(pitch, 'RH'),
    hand: 'RH',
    sample: [pitch],
  };
}

export function rhNotes(pitches: Pitch[]): Target[] {
  return pitches.map((p) => rhNote(p));
}

/** Việc không gắn phím (tư thế, đếm ngón): chỉ có hình + chữ. */
export function cardTarget(noteId: string, title: string, emoji: string, subtitle?: string): Target {
  return { noteId, title, emoji, subtitle, keys: [] };
}

/** Đếm ngón (B5): không gắn phím; màn hiện hình bàn tay sáng đúng ngón. */
export function fingerCard(finger: number): Target {
  return { noteId: `finger-${finger}`, title: 'Nhúc nhích ngón này!', keys: [], finger, hand: 'RH' };
}
