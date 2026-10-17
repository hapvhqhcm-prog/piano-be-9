/**
 * (+ 2026-10-17, OWNER duyệt — rà soát giáo viên dài hạn) "🎹 NHẠC CÔNG NHỎ" — phần THUẦN (có test: tests/musician.test.ts).
 *
 * Bốn kỹ năng nhạc công mà giáo trình còn thiếu + tuần ôn:
 *  · ĐÁNH BÓNG bài cũ (tuần ôn 27 · 32 · 38): leo thang tốc độ (polishStep) → bố mẹ nghe to – nhỏ → "🎙️ Bản thu biểu diễn"
 *    (lượt bài hát thường — tính tiêu chí tuần ôn).
 *  · DỊCH GIỌNG do bé tự làm (từ tuần 14): app hiện bản THẾ ĐÔ (khuông + số ngón), bé đàn CÙNG SỐ NGÓN ở thế mới —
 *    micro chấm đúng các nốt đã dịch (transposeTargets), không chấm nhịp.
 *  · ĐỆM HỢP ÂM I – V7 (tuần 24) → I – IV – V7 (tuần 29) → rải (tuần 37): mỗi ô một hợp âm tay trái thế Đô, bé bấm, app
 *    hát giai điệu ô đó (chordOf, accompanyBars). Micro kiểm tra hợp âm bằng phép thử "đủ nốt" sẵn có (MicListener.verifyChord).
 *  · ĐÀN THEO TAI (mỗi tháng từ tuần 9): app đàn câu đầu bài quen, bé tìm lại — không chấm nhịp, gợi ý TĂNG DẦN (SeqJudge).
 *  · 🎤 BUỔI DIỄN NHỎ (~4 tuần một lần): sân khấu không huy chương, lưu vào nhật ký buổi diễn → sticker "🎤 Buổi diễn".
 * Song tấu với thầy KHÔNG ở đây: bài hát thường có bè thầy (Tune.duet — music/tune.ts duetPart / validateDuet).
 */
import { findTune } from '../music/exercises';
import { beatsPerMeasure, playable, type Tune } from '../music/tune';
import { midiToPitch, pitchToMidi, type Pitch } from '../piano/pitchTable';
import type { Activity, ChordSymbol, Lesson, MusicianTask } from './types';

export type MusicianActivity = Extract<Activity, { kind: 'musician' }>;

/* ---------------- Dựng dữ liệu bài học ---------------- */

const mk = (title: string, intro: string, task: MusicianTask): MusicianActivity => ({ kind: 'musician', title, intro, task });

/** Thang tốc độ mặc định của "đánh bóng" (thang tốc độ của màn bài hát: 40 – 50 – 60 – 72). */
export const POLISH_LADDER = [50, 60, 72];

/** ✨ Đánh bóng một bài cũ: leo thang tốc độ rồi to – nhỏ. */
export const polish = (songId: string, titleVi: string, ladder: number[] = POLISH_LADDER): MusicianActivity =>
  mk(`✨ Đánh bóng: ${titleVi}`, 'Leo từng nấc tốc độ — rồi to, nhỏ thật rõ!', { type: 'polish', songId, ladder });

/** 🎙️ Bản thu biểu diễn: lượt THEO NHỊP cả bài, chỉ nhìn khuông (lượt bài hát thường — tính tiêu chí tuần ôn). */
export const concertTake = (songId: string, intro = '🎙️ Bản thu biểu diễn — đàn như trên sân khấu!'): Activity => ({
  kind: 'song',
  songId,
  mode: 'tempo',
  level: 2,
  hints: 'staff',
  intro,
});

/** 🔀 Dịch giọng: bé đàn bài thế Đô ở thế mới — cùng số ngón. */
export const transpose = (songId: string, titleVi: string, semitones: number, keyName: string, measures = 4): MusicianActivity =>
  mk(`🔀 Đàn "${titleVi}" ở ${keyName}`, `Dời tay sang ${keyName}, giữ nguyên số ngón!`, {
    type: 'transpose',
    songId,
    semitones,
    keyName,
    measures,
  });

/** 🎹 Đệm hợp âm dưới giai điệu quen (tay trái thế Đô). */
export const accompany = (songId: string, titleVi: string, chords: ChordSymbol[], style: 'block' | 'broken' = 'block'): MusicianActivity =>
  mk(
    `🎹 Đệm hợp âm: ${titleVi}`,
    style === 'broken' ? 'Mỗi ô một hợp âm RẢI tay trái — thầy hát giai điệu!' : 'Mỗi ô bấm một hợp âm tay trái — thầy hát!',
    { type: 'accompany', songId, chords, style },
  );

/** 👂 Đàn theo tai: tìm lại câu đầu bài quen. */
export const byEar = (songId: string, count: number): MusicianActivity =>
  mk('👂 Đàn theo tai', 'Nghe thầy đàn một câu quen — con tìm lại trên đàn nhé!', { type: 'by-ear', songId, count });

/**
 * 🎤 Buổi diễn nhỏ (một bài học riêng, không huy chương). Không có `program`: bé tự chọn 1–2 bài đã đàn được.
 * Có `program` (tuần ôn): diễn ĐÚNG các bài vừa đánh bóng — mỗi bài là một lượt bài hát thường (theo nhịp, chỉ nhìn khuông;
 * tính tiêu chí tuần ôn, và "Học tiếp" luôn có một bài chứa cả 3 bài của tiêu chí), rồi cúi chào + lưu buổi diễn.
 */
export const recitalLesson = (week: number, title = '🎤 Buổi diễn nhỏ', program: readonly string[] = []): Lesson => ({
  id: `w${week}-recital`,
  week,
  title,
  emoji: '🎤',
  activities: program.length
    ? [
        ...program.map((songId, i) => concertTake(songId, `🎤 Buổi diễn nhỏ — bài ${i + 1}/${program.length}: đàn như trên sân khấu!`)),
        mk('👏 Cúi chào khán giả', 'Nghệ sĩ cúi chào — cả nhà vỗ tay!', { type: 'recital', program: [...program] }),
      ]
    : [mk(title, 'Con chọn bài đã đàn được, mời cả nhà ngồi nghe!', { type: 'recital' })],
  teach: { emoji: '🎤', text: 'Con giới thiệu bài sắp đàn với khán giả: "Bài con đàn là…"' },
});

/* ---------------- Dịch giọng ---------------- */

/** Giọng dùng dấu giáng (Fa trưởng…) → viết Si♭ thay vì La♯. */
const FLAT_KEYS = new Set([5, 10, 3, 8]); // +5 Fa, +10 Si♭, +3 Mi♭, +8 La♭ (tính từ Đô)
const FLAT_NAME: Record<number, string> = { 1: 'Db', 3: 'Eb', 6: 'Gb', 8: 'Ab', 10: 'Bb' };

/** Dịch một nốt `semitones` nửa cung (cách viết theo giọng: Fa trưởng dùng ♭, còn lại ♯). */
export function transposePitch(p: Pitch, semitones: number): Pitch {
  const m = pitchToMidi(p) + semitones;
  const pc = ((m % 12) + 12) % 12;
  const s = (((semitones % 12) + 12) % 12);
  if (FLAT_KEYS.has(s) && FLAT_NAME[pc]) return `${FLAT_NAME[pc]}${Math.floor(m / 12) - 1}`;
  return midiToPitch(m);
}

/** Một nốt cần đàn trong trò "dịch giọng" / "đàn theo tai": nốt (đã dịch), ngón, nốt gốc (bản thế Đô). */
export interface SeqNote {
  pitch: Pitch;
  finger?: number;
  orig: Pitch;
}

/** `measures` ô đầu của bè chính (bỏ dấu lặng; hợp âm → nốt chính). */
function headNotes(t: Tune, measures: number): Array<{ pitch: Pitch; finger?: number }> {
  return playable(t)
    .filter((n) => n.hand === (t.hand === 'LH' ? 'LH' : 'RH') && n.measure < measures)
    .map((n) => ({ pitch: n.pitch!, finger: n.finger }));
}

/** Các nốt bé cần đàn khi dịch `songId` (thế Đô) đi `semitones` nửa cung — cùng số ngón. [] nếu không có bài. */
export function transposeTargets(task: Extract<MusicianTask, { type: 'transpose' }>): SeqNote[] {
  const t = findTune(task.songId);
  if (!t) return [];
  return headNotes(t, task.measures ?? 4).map((n) => ({ pitch: transposePitch(n.pitch, task.semitones), finger: n.finger, orig: n.pitch }));
}

/** Bài gốc cắt `measures` ô đầu (để vẽ bản thế Đô trên khuông). */
export function transposeSource(task: Extract<MusicianTask, { type: 'transpose' }>): Tune | null {
  const t = findTune(task.songId);
  if (!t) return null;
  const per = beatsPerMeasure(t);
  const limit = (task.measures ?? 4) * per;
  let at = 0;
  const notes = t.notes.filter((n) => {
    const keep = at < limit - 1e-9;
    at += n.beats;
    return keep;
  });
  return { ...t, id: `${t.id}@C`, notes, lh: undefined, duet: undefined, phrases: [0] };
}

/** Nốt "nhà mới" (ngón cái) của thế đã dịch: nốt ngón 1 đầu tiên, không có thì nốt đầu. */
export function transposeHome(targets: readonly SeqNote[]): Pitch | null {
  return (targets.find((n) => n.finger === 1) ?? targets[0])?.pitch ?? null;
}

/* ---------------- Đàn theo tai ---------------- */

/** `count` nốt đầu của bài quen (để app đàn mẫu + bé tìm lại) kèm trường độ (phách) để đàn mẫu đúng nhịp. */
export function byEarPhrase(task: Extract<MusicianTask, { type: 'by-ear' }>): Array<SeqNote & { beats: number; start: number }> {
  const t = findTune(task.songId);
  if (!t) return [];
  const main = t.hand === 'LH' ? 'LH' : 'RH';
  const ns = playable(t).filter((n) => n.hand === main).slice(0, task.count);
  const t0 = ns[0]?.start ?? 0;
  return ns.map((n) => ({ pitch: n.pitch!, finger: n.finger, orig: n.pitch!, beats: n.beats, start: n.start - t0 }));
}

/* ---------------- Chấm theo thứ tự, không chấm nhịp, gợi ý tăng dần ---------------- */

/** Gợi ý tăng dần cho nốt đang tìm: hướng lên/xuống → app đàn lại nốt đó → bàn phím chỉ phím. */
export type SeqHint = 'none' | 'up' | 'down' | 'listen' | 'show';
export type SeqVerdict =
  | { kind: 'ok'; index: number; done: boolean }
  | { kind: 'wrong'; index: number; hint: SeqHint; misses: number }
  | { kind: 'ignore' };

/** Số lần sai ở MỘT nốt trước mỗi bậc gợi ý. */
export const HINT_LISTEN_AT = 3;
export const HINT_SHOW_AT = 5;
/** Nốt nghe được cách MỌI nốt của câu quá ngần này nửa cung (và không cùng tên) → không phải bé đàn (giọng nói, gõ nắp…) */
const FAR = 13;

/**
 * Chấm một chuỗi nốt THEO THỨ TỰ, KHÔNG chấm nhịp. Sai không bắt làm lại từ đầu (bé đang dò tìm) — chỉ đếm số lần sai
 * ở nốt đang tìm để gợi ý tăng dần. `octaveFree`: nốt cùng tên ở quãng 8 khác cũng đúng (đàn theo tai).
 */
export class SeqJudge {
  index = 0;
  misses = 0;
  /** Số lần sai cả câu / đã phải chỉ phím (bậc gợi ý cao nhất) */
  totalMisses = 0;
  shown = 0;
  constructor(
    readonly notes: readonly SeqNote[],
    readonly octaveFree = false,
  ) {}

  get done(): boolean {
    return this.index >= this.notes.length;
  }

  get want(): SeqNote | undefined {
    return this.notes[this.index];
  }

  private same(midi: number, p: Pitch): boolean {
    const w = pitchToMidi(p);
    return this.octaveFree ? (midi - w) % 12 === 0 : midi === w;
  }

  /** Bé đàn nốt `midi`. */
  feed(midi: number): SeqVerdict {
    const want = this.want;
    if (!want) return { kind: 'ignore' };
    if (this.same(midi, want.pitch)) {
      const index = this.index++;
      this.misses = 0;
      return { kind: 'ok', index, done: this.done };
    }
    const far = this.notes.every((n) => Math.abs(pitchToMidi(n.pitch) - midi) >= FAR && (pitchToMidi(n.pitch) - midi) % 12 !== 0);
    if (far) return { kind: 'ignore' };
    this.misses++;
    this.totalMisses++;
    const w = pitchToMidi(want.pitch);
    let hint: SeqHint;
    if (this.misses >= HINT_SHOW_AT) hint = 'show';
    else if (this.misses >= HINT_LISTEN_AT) hint = 'listen';
    else if (this.octaveFree && (w - midi) % 12 === 0) hint = 'none';
    else hint = w > midi ? 'up' : 'down';
    if (hint === 'show' && this.misses === HINT_SHOW_AT) this.shown++;
    return { kind: 'wrong', index: this.index, hint, misses: this.misses };
  }

  /** Bố mẹ / bé chạm "Đúng rồi" thay micro (không có micro): qua nốt hiện tại. */
  skip(): void {
    if (!this.done) {
      this.index++;
      this.misses = 0;
    }
  }

  reset(): void {
    this.index = 0;
    this.misses = 0;
    this.totalMisses = 0;
    this.shown = 0;
  }

  /** Kết quả cả câu cho PARENT_ASSESSMENT: 'correct' khi bé tự tìm được (không phải nhờ bàn phím chỉ phím). */
  result(): 'correct' | 'retry' {
    return this.done && this.shown === 0 ? 'correct' : 'retry';
  }
}

/* ---------------- Đệm hợp âm ---------------- */

/** Hợp âm tay trái thế Đô (giản lược cho tay 9 tuổi): nốt + ngón. V7 = Si–Fa–Sol (Sol bảy bỏ Rê). */
export const CHORDS: Readonly<Record<ChordSymbol, { pitches: Pitch[]; fingers: number[]; name: string }>> = {
  I: { pitches: ['C3', 'E3', 'G3'], fingers: [5, 3, 1], name: 'Đô (I)' },
  IV: { pitches: ['C3', 'F3', 'A3'], fingers: [5, 2, 1], name: 'Fa (IV)' },
  V7: { pitches: ['B2', 'F3', 'G3'], fingers: [5, 2, 1], name: 'Sol bảy (V7)' },
};

export const chordOf = (s: ChordSymbol) => CHORDS[s];

/** Giai điệu của từng ô (để app hát sau khi bé bấm hợp âm): nốt, phách bắt đầu trong ô, độ dài. */
export function accompanyBars(task: Extract<MusicianTask, { type: 'accompany' }>): Array<Array<{ pitch: Pitch; start: number; beats: number }>> {
  const t = findTune(task.songId);
  if (!t) return [];
  const per = beatsPerMeasure(t);
  const ns = playable(t).filter((n) => n.hand === 'RH');
  return task.chords.map((_, m) => ns.filter((n) => n.measure === m).map((n) => ({ pitch: n.pitch!, start: n.start - m * per, beats: n.beats })));
}

/**
 * Hợp âm có HỢP với giai điệu ô đó không (kiểm tra dữ liệu bài học — tests/musician.test.ts): ít nhất NỬA số phách của ô là nốt
 * thuộc hợp âm (V7 tính đủ Sol–Si–Rê–Fa) — nốt lướt (vd Fa trong ô hợp âm Đô) được phép.
 */
export function chordFitsBar(sym: ChordSymbol, bar: ReadonlyArray<{ pitch: Pitch; start: number; beats: number }>): boolean {
  const tones: Record<ChordSymbol, number[]> = { I: [0, 4, 7], IV: [5, 9, 0], V7: [7, 11, 2, 5] };
  const total = bar.reduce((x, n) => x + n.beats, 0);
  const inChord = bar.filter((n) => tones[sym].includes(pitchToMidi(n.pitch) % 12)).reduce((x, n) => x + n.beats, 0);
  return total > 0 && inChord * 2 >= total;
}

/* ---------------- Đánh bóng: leo thang tốc độ ---------------- */

/** Mỗi nấc được thử tối đa ngần này lượt trong một lần (chưa đạt → mai leo tiếp, không ép). */
export const POLISH_TRIES = 2;

/**
 * Bước tiếp theo của thang tốc độ sau một lượt ở nấc `rung` (lượt thứ `tries` ở nấc đó): lên nấc / thử lại / xong.
 */
export function polishStep(ladder: readonly number[], rung: number, tries: number, passed: boolean): { next: 'up' | 'again' | 'done'; rung: number } {
  if (passed) return rung + 1 < ladder.length ? { next: 'up', rung: rung + 1 } : { next: 'done', rung };
  return tries < POLISH_TRIES ? { next: 'again', rung } : { next: 'done', rung };
}

/** Bài có dấu sắc thái (p / mf / f / to dần…) → có bước "to – nhỏ" sau thang tốc độ. */
export function hasDynamics(t: Tune): boolean {
  return [...t.notes, ...(t.lh ?? [])].some((n) => n.dyn !== undefined || n.hairpin !== undefined);
}

/* ---------------- Thời lượng (sessionEstimate) ---------------- */

/** Ước lượng THÔ (phút) cho một hoạt động nhạc công — tests/pacing (buổi ≤ ~12 phút). */
export function musicianMinutes(a: MusicianActivity): number {
  const task = a.task;
  switch (task.type) {
    case 'polish': {
      const t = findTune(task.songId);
      const beats = t ? t.notes.reduce((x, n) => x + n.beats, 0) : 32;
      // mỗi nấc ~1 lượt (đôi khi 2): 2 phách/nhịp... ≈ beats × 60/bpm giây + 0,5 phút đếm vào / kết quả mỗi lượt
      const runs = task.ladder.reduce((x, bpm) => x + (beats * 60) / bpm / 60 + 0.5, 0);
      return Math.round((runs + (t && hasDynamics(t) ? 0.5 : 0) + 0.3) * 10) / 10;
    }
    case 'transpose':
      return Math.round((1 + transposeTargets(task).length * 0.08) * 10) / 10;
    case 'accompany':
      return Math.round((1 + task.chords.length * 0.35) * 10) / 10;
    case 'by-ear':
      return Math.round((1 + task.count * 0.15) * 10) / 10;
    case 'recital':
      return task.program?.length ? 0.5 : 5;
  }
}
