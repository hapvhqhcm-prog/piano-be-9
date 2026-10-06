import { autoFinger, guessHand } from '../music/autoFinger';
import { drawable, largestDrawable, padToBars, type SolfegeNote } from '../music/solfege';
import { addNote } from './compose';
import { measureCount, type Tune, type TuneNote } from '../music/tune';
import type { AppData, ParentSong, ParentSongNote } from '../progress/schema';

/**
 * "📝 Bố mẹ thêm bài" (2026-10-06) — phần logic thuần (không DOM) cho trình soạn songEditor.ts.
 * Bài bố mẹ tự nhập CHỈ lưu trên iPad này, dùng riêng trong gia đình — không bao giờ đưa vào app công khai.
 */

/** Tiền tố id bài hát (Tune) của bài bố mẹ thêm — lượt chơi ghi songId = "parent-<id>". */
export const PARENT_PREFIX = 'parent-';
export const PRIVACY_NOTE = 'Bài bố mẹ tự nhập chỉ lưu trên iPad này, dùng riêng trong gia đình.';
export const PARENT_TEMPOS = [40, 50, 60, 72, 84, 96] as const;

export type TimeSig = ParentSong['timeSignature'];
export const beatsOf = (ts: TimeSig): number => Number(ts.split('/')[0]);

/**
 * Nốt đã nhập → bài lưu: thêm dấu lặng lấy đà / cho tròn ô cuối, TỰ GHI SỐ NGÓN (tay theo dải nốt).
 * Số ngón bố mẹ đã ghi sẵn (nếu có) bị tính lại — để bài luôn nhất quán sau khi sửa.
 */
export function buildParentSong(
  notes: readonly SolfegeNote[],
  o: {
    id: string;
    title: string;
    createdAt: number;
    timeSignature: TimeSig;
    bpm: number;
    phrases?: number[];
    pickupRest?: number;
    text?: string;
    updatedAt?: number;
  },
): ParentSong {
  const bpb = beatsOf(o.timeSignature);
  const padded = padToBars(notes, bpb, o.pickupRest ?? 0);
  const hand = guessHand(padded);
  const fingers = autoFinger(padded, hand);
  const out: ParentSongNote[] = padded.map((n, i) =>
    n.rest || !n.pitch ? { rest: true, beats: n.beats } : { pitch: n.pitch, beats: n.beats, finger: fingers[i] },
  );
  const song: ParentSong = {
    id: o.id,
    title: o.title.trim().slice(0, 60) || 'Bài bố mẹ thêm',
    createdAt: o.createdAt,
    timeSignature: o.timeSignature,
    bpm: o.bpm,
    notes: out,
    position: 'free',
  };
  if (o.updatedAt) song.updatedAt = o.updatedAt;
  if (o.phrases && o.phrases.length > 1) song.phrases = [...o.phrases];
  if (o.text !== undefined && o.text.trim()) song.text = o.text;
  return song;
}

/** Bài bố mẹ thêm → Tune (chơi ở màn bài hát với đủ chế độ: chờ/nhịp, gợi ý, micro, Xem mẫu, chọn câu). */
export function parentSongToTune(c: ParentSong): Tune {
  const conv = (ns: ParentSongNote[]): TuneNote[] =>
    ns.map((n) => (n.rest || !n.pitch ? { rest: true, beats: n.beats } : { pitch: n.pitch, beats: n.beats, ...(n.finger ? { finger: n.finger } : {}) }));
  const notes = conv(c.notes);
  const hand = c.lh?.length ? 'BOTH' : guessHand(c.notes);
  const t: Tune = {
    id: `${PARENT_PREFIX}${c.id}`,
    title: c.title,
    titleVi: c.title,
    composer: 'Bố mẹ thêm',
    hand,
    bpm: c.bpm,
    timeSignature: c.timeSignature,
    position: 'free',
    notes,
  };
  if (c.lh?.length) {
    t.lh = conv(c.lh);
    t.lhPosition = 'free';
  }
  if (c.phrases && c.phrases.length > 1) {
    const total = measureCount(t);
    const ph = c.phrases.filter((p) => p < total);
    if (ph.length > 1) t.phrases = ph;
  }
  return t;
}

/** Id mới cho bài (không trùng bài đã có). */
export function newParentSongId(existing: readonly Pick<ParentSong, 'id'>[], now = Date.now()): string {
  const ids = new Set(existing.map((x) => x.id));
  let n = now;
  while (ids.has(`p${n.toString(36)}`)) n++;
  return `p${n.toString(36)}`;
}

/**
 * Chế độ CHẠM PHÍM: thêm một nốt/dấu lặng — dùng lại addNote của trò Sáng tác (tự cắt cho vừa ô nhịp, KHÔNG giới hạn
 * số ô), rồi làm tròn xuống độ dài ghi được trên khuông (vd chỗ trống 1¼ phách mà chọn nốt trắng → nốt đen).
 */
export function addTapNote(notes: readonly SolfegeNote[], note: SolfegeNote, beatsPerBar: number): SolfegeNote[] {
  const used = notes.reduce((s, n) => s + n.beats, 0);
  const room = beatsPerBar - (used % beatsPerBar);
  let beats = Math.min(note.beats, room);
  if (!drawable(beats)) beats = largestDrawable(beats);
  // addNote làm việc với nốt có cao độ — dấu lặng mượn tạm cao độ rồi bỏ đi
  const out = addNote(notes as never[], { pitch: note.pitch ?? 'C4', beats }, { bars: Infinity, beatsPerBar }) as SolfegeNote[] | null;
  if (!out) return [...notes];
  const last = out[out.length - 1];
  out[out.length - 1] = note.rest || !note.pitch ? { rest: true, beats: last.beats } : { pitch: note.pitch, beats: last.beats };
  return out;
}

/** Tên bài cho id lượt chơi không nằm trong thư viện cố định: bài bố mẹ thêm ("parent-…") / bài bé sáng tác ("comp-…"). */
export function customTuneTitle(id: string, data: Readonly<Pick<AppData, 'parentSongs' | 'compositions'>>): string | undefined {
  if (id.startsWith(PARENT_PREFIX)) {
    const t = data.parentSongs?.find((c) => c.id === id.slice(PARENT_PREFIX.length))?.title;
    return t ? `📝 ${t}` : '📝 Bài bố mẹ thêm (đã xóa)';
  }
  if (id.startsWith('comp-')) return data.compositions?.find((c) => c.id === id.slice(5))?.title;
  return undefined;
}
