import { POSITIONS, type Hand, type PositionId } from '../piano/fingering';
import { pitchToMidi, type Pitch } from '../piano/pitchTable';
import type { Tune, TuneNote } from '../music/tune';
import type { Composition } from '../progress/schema';

/**
 * v5 — SÁNG TÁC & ĐỐI ĐÁP (OWNER duyệt 2026-10-05): phần logic thuần (không DOM) cho màn improv.ts.
 * - Thế tay → 5 nốt + số ngón; nốt "nhà" (chủ âm) của thế.
 * - Trình soạn nhạc tí hon: thêm nốt theo nhịp đã chọn, tự cắt cho vừa ô nhịp, xóa nốt cuối.
 * - Đổi bài của bé (Composition) thành Tune để chơi bằng màn bài hát.
 */

export type Pos = Exclude<PositionId, 'free'>;

export interface PosNote {
  pitch: Pitch;
  finger: number;
}

/** 5 nốt của thế tay (thấp → cao) cùng số ngón; ưu tiên tay phải (thế 'MC' chỉ có tay trái). */
export function positionNotes(position: Pos = 'C'): { hand: Hand; notes: PosNote[] } {
  const table = POSITIONS[position];
  const hand: Hand = table.RH ? 'RH' : 'LH';
  const map = table[hand] ?? {};
  const notes = Object.entries(map)
    .map(([pitch, finger]) => ({ pitch, finger }))
    .sort((a, b) => pitchToMidi(a.pitch) - pitchToMidi(b.pitch));
  return { hand, notes };
}

/** Nốt "nhà" của thế tay — câu trả lời / bài sáng tác nên kết thúc ở đây (Đô với thế Đô, Sol với thế Sol…). */
export function tonicOf(position: Pos = 'C'): Pitch {
  const letter = position === 'MC' || position === 'C5' || position === 'Cm' ? 'C' : position.charAt(0);
  const { notes } = positionNotes(position);
  return (notes.find((n) => n.pitch.startsWith(letter)) ?? notes[0]).pitch;
}

/** Nhịp bé chọn trong bảng: Đi = 1 phách · Đi-i = 2 phách · Chạy-chạy = mỗi chạm nửa phách. */
export type ComposeRhythm = 'walk' | 'long' | 'run';
export const RHYTHM_BEATS: Record<ComposeRhythm, number> = { walk: 1, long: 2, run: 0.5 };

export interface ComposeNote {
  pitch: Pitch;
  beats: number;
  finger?: number;
}

export const used = (notes: readonly ComposeNote[]): number => notes.reduce((s, n) => s + n.beats, 0);

/**
 * Thêm một nốt: tự CẮT cho vừa chỗ còn lại của ô nhịp hiện tại (bé không bao giờ "sai luật"),
 * hết chỗ cả bài → null (không thêm).
 */
export function addNote(
  notes: readonly ComposeNote[],
  note: ComposeNote,
  o: { bars: number; beatsPerBar: number },
): ComposeNote[] | null {
  const total = o.bars * o.beatsPerBar;
  const u = used(notes);
  if (u >= total - 1e-9) return null;
  const inBar = u % o.beatsPerBar;
  const room = o.beatsPerBar - inBar;
  const beats = Math.min(note.beats, room);
  return [...notes, { ...note, beats }];
}

export function undoNote(notes: readonly ComposeNote[]): ComposeNote[] {
  return notes.slice(0, -1);
}

/** Tên mặc định cho bài mới: "Bài của con số N" (N = số bài đã có + 1, không trùng tên cũ). */
export function nextCompositionTitle(existing: readonly Pick<Composition, 'title'>[]): string {
  let n = existing.length + 1;
  const names = new Set(existing.map((c) => c.title));
  while (names.has(`Bài của con số ${n}`)) n++;
  return `Bài của con số ${n}`;
}

/** Bài sáng tác → định dạng lưu (thêm lặng ở cuối nếu bé chưa điền kín ô nhịp cuối). */
export function makeComposition(
  notes: readonly ComposeNote[],
  o: { id: string; title: string; createdAt: number; timeSignature?: '4/4' | '3/4' },
): Composition {
  const ts = o.timeSignature ?? '4/4';
  const bpb = Number(ts.split('/')[0]);
  const out: Composition['notes'] = notes.map((n) => ({ pitch: n.pitch, beats: n.beats, ...(n.finger ? { finger: n.finger } : {}) }));
  const left = (bpb - (used(notes) % bpb)) % bpb;
  if (left > 1e-9 && notes.length) out.push({ rest: true, beats: left });
  return { id: o.id, title: o.title.trim() || 'Bài của con', createdAt: o.createdAt, timeSignature: ts, notes: out };
}

/** Bài sáng tác → Tune (không có tuần — chơi ở chế độ tự do của màn bài hát). */
export function compositionToTune(c: Composition): Tune {
  const notes: TuneNote[] = c.notes.map((n) =>
    n.rest || !n.pitch ? { rest: true, beats: n.beats } : { pitch: n.pitch, beats: n.beats, ...(n.finger ? { finger: n.finger } : {}) },
  );
  const ms = notes.filter((n) => n.pitch).map((n) => pitchToMidi(n.pitch!));
  // Bài ở thế tay trái (mọi nốt từ Đô giữa trở xuống, có nốt dưới Đô giữa) → khóa Fa, tay trái
  const lh = ms.length > 0 && Math.max(...ms) <= 60 && Math.min(...ms) < 60;
  return {
    id: `comp-${c.id}`,
    title: c.title,
    titleVi: c.title,
    composer: 'Con tự sáng tác',
    hand: lh ? 'LH' : 'RH',
    bpm: 72,
    timeSignature: c.timeSignature,
    position: 'free',
    notes,
  };
}

/**
 * ĐỐI ĐÁP: "câu hỏi" 2 ô nhịp (4/4) viết theo BẬC trong thế tay (0 = nốt nhà … 4 = ngón 5),
 * kết thúc lửng (không về nhà) để bé "trả lời" về nốt nhà.
 */
export const QA_QUESTIONS: ReadonlyArray<ReadonlyArray<[degree: number, beats: number]>> = [
  [[0, 1], [1, 1], [2, 1], [3, 1], [4, 4]],
  [[2, 1], [2, 1], [3, 1], [4, 1], [4, 1], [3, 1], [2, 2]],
  [[4, 1], [3, 1], [2, 1], [1, 1], [2, 1], [3, 1], [4, 2]],
  [[0, 1], [2, 1], [4, 1], [2, 1], [1, 4]],
];

export function questionNotes(position: Pos, k: number): ComposeNote[] {
  const { notes } = positionNotes(position);
  const q = QA_QUESTIONS[((k % QA_QUESTIONS.length) + QA_QUESTIONS.length) % QA_QUESTIONS.length];
  return q.map(([d, beats]) => ({ pitch: notes[Math.min(d, notes.length - 1)].pitch, beats, finger: notes[Math.min(d, notes.length - 1)].finger }));
}

/** Câu trả lời "về nhà": nốt cuối bé đàn cùng tên với nốt nhà (cho phép khác quãng tám — micro/đàn cơ). */
export function endsHome(heardMidis: readonly number[], position: Pos = 'C'): boolean {
  if (!heardMidis.length) return false;
  const last = heardMidis[heardMidis.length - 1];
  return ((last - pitchToMidi(tonicOf(position))) % 12 + 12) % 12 === 0;
}

/** Ngũ cung phím đen (Fa♯ – Sol♯ – La♯ – Đô♯ – Rê♯): lớp cao độ (MIDI % 12). */
export const BLACK_PCS: readonly number[] = [1, 3, 6, 8, 10];
export const isBlackMidi = (m: number): boolean => BLACK_PCS.includes(((m % 12) + 12) % 12);

/**
 * Nền đệm ngũ cung cho trò "Phím đen": trả về các nốt (phách, MIDI, độ dài phách, âm lượng) trong `bars` ô 4/4.
 * Bè trầm ngân (Fa♯2 + Đô♯3) mỗi 2 ô, ostinato nhẹ Fa♯3 – Sol♯3 – La♯3 – Sol♯3 — tất cả DƯỚI Đô giữa để micro
 * tách được tiếng bé đàn (chỉ đếm nốt phím đen từ Đô♯4 trở lên — xem BACKING_TOP).
 */
/** Nốt cao nhất của nền đệm (La♯3) — micro chỉ khen nốt phím đen CAO HƠN mức này. */
export const BACKING_TOP = 58;

export function pentatonicBacking(bars: number): Array<{ beat: number; midi: number; beats: number; vol: number }> {
  const out: Array<{ beat: number; midi: number; beats: number; vol: number }> = [];
  const osti = [54, 56, 58, 56]; // F#3 G#3 A#3 G#3
  for (let bar = 0; bar < bars; bar++) {
    const b0 = bar * 4;
    if (bar % 2 === 0) {
      out.push({ beat: b0, midi: 42, beats: 8, vol: 0.32 }); // F#2
      out.push({ beat: b0, midi: 49, beats: 8, vol: 0.22 }); // C#3
    }
    osti.forEach((m, k) => out.push({ beat: b0 + k, midi: bar % 4 === 3 && k === 3 ? 49 : m, beats: 0.9, vol: 0.16 }));
  }
  return out;
}
