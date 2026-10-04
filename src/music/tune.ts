import { fingerFor, type Hand } from '../piano/fingering';
import { pitchToMidi, type Pitch } from '../piano/pitchTable';

/**
 * Định dạng bài hát v2 (mở rộng v1 §12 khi làm Phase 3 — OWNER duyệt 2026-10-04):
 * thêm `rest`, `week`, `phrases` (ô nhịp bắt đầu mỗi câu), `extension` (nốt duỗi ngón, vd "A4").
 */
export interface TuneNote {
  pitch?: Pitch;
  beats: number;
  finger?: number;
  rest?: boolean;
}

export interface Tune {
  id: string;
  title: string;
  titleVi: string;
  composer?: string;
  sourceStatus?: string;
  arrangementBy?: string;
  attributionRequired?: boolean;
  hand: Hand;
  bpm: number;
  timeSignature: string;
  week?: number;
  extension?: Pitch;
  phrases?: number[];
  notes: TuneNote[];
}

/** Nốt đã tính thời điểm (phách tính từ 0). */
export interface TimedNote extends TuneNote {
  index: number;
  start: number;
  measure: number;
}

export function beatsPerMeasure(t: Tune): number {
  return Number(t.timeSignature.split('/')[0]) || 4;
}

export function timeline(t: Tune): TimedNote[] {
  const bpm = beatsPerMeasure(t);
  let start = 0;
  return t.notes.map((n, index) => {
    const tn = { ...n, index, start, measure: Math.floor(start / bpm + 1e-9) };
    start += n.beats;
    return tn;
  });
}

export function totalBeats(t: Tune): number {
  return t.notes.reduce((s, n) => s + n.beats, 0);
}

export function measureCount(t: Tune): number {
  return Math.ceil(totalBeats(t) / beatsPerMeasure(t) - 1e-9);
}

/** Các nốt có cao độ (bỏ dấu lặng). */
export function playable(t: Tune): TimedNote[] {
  return timeline(t).filter((n) => !n.rest && n.pitch);
}

/** Câu nhạc: [ô nhịp bắt đầu, ô nhịp kết thúc) — mặc định mỗi câu 4 ô nhịp. */
export function phraseRanges(t: Tune): Array<[number, number]> {
  const total = measureCount(t);
  const starts = t.phrases?.length ? [...t.phrases].sort((a, b) => a - b) : [];
  if (!starts.length) for (let m = 0; m < total; m += 4) starts.push(m);
  return starts.map((s, i) => [s, i + 1 < starts.length ? starts[i + 1] : total]);
}

/** Cắt một đoạn ô nhịp thành bài con (để tập từng câu). */
export function slice(t: Tune, fromMeasure: number, toMeasure: number): Tune {
  const bpm = beatsPerMeasure(t);
  const notes = timeline(t)
    .filter((n) => n.start >= fromMeasure * bpm - 1e-9 && n.start < toMeasure * bpm - 1e-9)
    .map(({ pitch, beats, finger, rest }) => ({ pitch, beats, finger, rest }));
  return { ...t, id: `${t.id}#${fromMeasure}-${toMeasure}`, phrases: [0], notes };
}

/** Kiểm tra bài: nốt trong thế 5 ngón của tay, ngón đúng §6 (+ nốt duỗi nếu có). */
export function validateTune(t: Tune): string[] {
  const errs: string[] = [];
  const ext = !!t.extension;
  for (const [i, n] of t.notes.entries()) {
    if (!(n.beats > 0)) errs.push(`nốt ${i}: beats`);
    if (n.rest) {
      if (n.pitch || n.finger) errs.push(`nốt ${i}: dấu lặng không có cao độ/ngón`);
      continue;
    }
    if (!n.pitch) {
      errs.push(`nốt ${i}: thiếu pitch`);
      continue;
    }
    const f = fingerFor(n.pitch, t.hand, ext);
    if (f === undefined) errs.push(`nốt ${i}: ${n.pitch} ngoài tầm tay ${t.hand}`);
    else if (n.finger !== f) errs.push(`nốt ${i}: ${n.pitch} phải là ngón ${f}`);
  }
  if (totalBeats(t) % beatsPerMeasure(t) !== 0) errs.push('tổng phách không tròn ô nhịp');
  return errs;
}

// ---------------- Nhạc đệm (bố mẹ "đàn cùng") ----------------

const CHORDS: Array<{ name: string; tones: number[]; root: number }> = [
  { name: 'C', tones: [0, 4, 7], root: 0 },
  { name: 'F', tones: [5, 9, 0], root: 5 },
  { name: 'G', tones: [7, 11, 2], root: 7 },
  { name: 'Am', tones: [9, 0, 4], root: 9 },
  { name: 'Dm', tones: [2, 5, 9], root: 2 },
];

export interface AccompNote {
  start: number;
  beats: number;
  midi: number;
}

/**
 * Bè đệm đơn giản: mỗi ô nhịp chọn hợp âm hợp với giai điệu nhất (C/F/G/Am/Dm),
 * đánh nốt gốc ở phách 1 và quãng 5 ở phách 3. Tay phải → đệm ở âm trầm; tay trái → đệm ở âm cao.
 */
export function accompaniment(t: Tune): AccompNote[] {
  const bpm = beatsPerMeasure(t);
  const notes = playable(t);
  const out: AccompNote[] = [];
  const base = t.hand === 'RH' ? 36 : 60; // C2 hoặc C4
  let prev = CHORDS[0];
  for (let m = 0; m < measureCount(t); m++) {
    const inM = notes.filter((n) => n.measure === m);
    let best = prev;
    let bestScore = -1;
    for (const c of CHORDS) {
      let score = 0;
      for (const n of inM) if (c.tones.includes(pitchToMidi(n.pitch!) % 12)) score += n.beats;
      // ưu tiên hợp âm chính (C/F/G) và giữ nguyên hợp âm cũ khi hòa
      if (c.name.length === 1) score += 0.25;
      if (c === prev) score += 0.1;
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    prev = best;
    const root = base + best.root + (best.root > 6 ? -12 : 0);
    out.push({ start: m * bpm, beats: Math.min(2, bpm), midi: root });
    if (bpm >= 3) out.push({ start: m * bpm + 2, beats: Math.min(2, bpm - 2), midi: root + 7 });
  }
  return out;
}

// ---------------- Thư viện bài hát ----------------

const modules = import.meta.glob<Tune>('../data/songs/*.json', { eager: true, import: 'default' });

/** Tất cả bài hát, sắp theo tuần rồi theo tên. */
export const SONGS: readonly Tune[] = Object.values(modules).sort(
  (a, b) => (a.week ?? 0) - (b.week ?? 0) || a.titleVi.localeCompare(b.titleVi, 'vi'),
);

export function findSong(id: string): Tune | undefined {
  return SONGS.find((s) => s.id === id);
}

/** Bài hát bé đã được mở theo tuần hiện tại. */
export function songsUpToWeek(week: number): Tune[] {
  return SONGS.filter((s) => (s.week ?? 1) <= week);
}
