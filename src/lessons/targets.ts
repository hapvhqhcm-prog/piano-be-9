import { fingerFor, type Hand } from '../piano/fingering';
import { noteLabel, viName, type Pitch } from '../piano/pitchTable';
import type { Activity, Segment, Target } from './types';

/** Một nốt — số ngón lấy từ fingering.ts (§6), không gõ tay. */
export function note(pitch: Pitch, hand: Hand, subtitle?: string, guides?: Pitch[]): Target {
  return {
    noteId: pitch,
    title: noteLabel(pitch),
    subtitle,
    keys: [pitch],
    guides,
    finger: fingerFor(pitch, hand, true),
    hand,
    sample: [pitch],
  };
}

export function rhNote(pitch: Pitch, subtitle?: string, guides?: Pitch[]): Target {
  return note(pitch, 'RH', subtitle, guides);
}

export function lhNote(pitch: Pitch, subtitle?: string): Target {
  return note(pitch, 'LH', subtitle);
}

export function rhNotes(pitches: Pitch[]): Target[] {
  return pitches.map((p) => rhNote(p));
}

export function lhNotes(pitches: Pitch[]): Target[] {
  return pitches.map((p) => lhNote(p));
}

/** Nốt trên khuông (tuần 7) — có tên để làm giàn giáo, rút dần ở trò "Đọc nốt". */
export function staffNote(pitch: Pitch, subtitle?: string): Target {
  return { ...rhNote(pitch, subtitle), staff: true };
}

/** Việc không gắn phím (tư thế): chỉ có hình + chữ. */
export function cardTarget(noteId: string, title: string, emoji: string, subtitle?: string): Target {
  return { noteId, title, emoji, subtitle, keys: [] };
}

/** Đếm ngón (B5): không gắn phím; màn hiện hình bàn tay sáng đúng ngón. */
export function fingerCard(finger: number, hand: Hand = 'RH'): Target {
  return { noteId: `finger-${finger}`, title: 'Nhúc nhích ngón này!', keys: [], finger, hand };
}

/** Trò "Nhại lại": app đàn mẫu 2–3 nốt → bé đàn lại đúng thứ tự. */
export function echo(pitches: Pitch[], hand: Hand = 'RH'): Target {
  return {
    noteId: `echo:${pitches.join('-')}`,
    title: pitches.map((p) => viName(p)).join(' – '),
    subtitle: 'Nghe rồi đàn lại đúng thứ tự',
    keys: pitches,
    hand,
    sample: pitches,
    sequence: true,
  };
}

export const notes = (segment: Segment): Activity => ({ kind: 'notes', segment });
