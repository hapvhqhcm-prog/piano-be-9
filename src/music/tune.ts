import { fingerInPosition, type Hand, type PositionId } from '../piano/fingering';
import { keyboardRangeFor, pitchToMidi, type Pitch } from '../piano/pitchTable';

/**
 * Định dạng bài hát v2/v3:
 * - v2 (Phase 3): `rest`, `week`, `phrases` (ô nhịp bắt đầu mỗi câu), `extension` (nốt duỗi ngón, vd "A4").
 * - v3 (Cấp 2–3): `position`/`lhPosition` (thế tay), `hand: "BOTH"` + `lh` (bè tay trái),
 *   `also` (nốt cùng lúc — hợp âm), nhịp 3/4, nốt chấm dôi (1.5, 3), dấu giáng ("Bb4").
 * - v4 (OWNER duyệt 2026-10-05): `dyn` (p/mf/f), `stac` (ngắt tiếng), `slur` (luyến) — trường cộng thêm, bài cũ vẫn hợp lệ.
 */
export interface TuneNote {
  pitch?: Pitch;
  beats: number;
  finger?: number;
  rest?: boolean;
  /** Nốt đánh cùng lúc (hợp âm) */
  also?: Array<{ pitch: Pitch; finger?: number }>;
  /** v4 — Sắc thái bắt đầu từ nốt này (giữ tới khi đổi): p = nhỏ, mf = vừa, f = to */
  dyn?: Dynamic;
  /** v4 — Ngắt tiếng (staccato): giữ phím rất ngắn */
  stac?: boolean;
  /** v4 — Luyến (legato): dấu luyến bắt đầu / kết thúc ở nốt này — các nốt trong đó đàn liền, không hở */
  slur?: 'start' | 'end';
}

export type Dynamic = 'p' | 'mf' | 'f';

export type TuneHand = Hand | 'BOTH';

export interface Tune {
  id: string;
  title: string;
  titleVi: string;
  composer?: string;
  sourceStatus?: string;
  arrangementBy?: string;
  attributionRequired?: boolean;
  hand: TuneHand;
  bpm: number;
  timeSignature: string;
  week?: number;
  extension?: Pitch;
  /** Thế tay của bè chính (mặc định 'C') */
  position?: PositionId;
  /** Bè tay trái khi hand = "BOTH" */
  lh?: TuneNote[];
  lhPosition?: PositionId;
  phrases?: number[];
  notes: TuneNote[];
}

/** Nốt đã tính thời điểm (phách tính từ 0). */
export interface TimedNote extends TuneNote {
  index: number;
  start: number;
  measure: number;
  hand: Hand;
}

export function beatsPerMeasure(t: Tune): number {
  return Number(t.timeSignature.split('/')[0]) || 4;
}

/** Bè chính: tay phải (RH/BOTH) hoặc tay trái (LH). */
export function mainHand(t: Tune): Hand {
  return t.hand === 'LH' ? 'LH' : 'RH';
}

function timed(notes: TuneNote[], bpm: number, hand: Hand, offset: number): TimedNote[] {
  let start = 0;
  return notes.map((n, i) => {
    const tn = { ...n, index: offset + i, start, measure: Math.floor(start / bpm + 1e-9), hand };
    start += n.beats;
    return tn;
  });
}

/** Bè chính (index 0…). */
export function timeline(t: Tune): TimedNote[] {
  return timed(t.notes, beatsPerMeasure(t), mainHand(t), 0);
}

/** Bè tay trái của bài hai tay (index tiếp sau bè chính). */
export function lhTimeline(t: Tune): TimedNote[] {
  return t.lh ? timed(t.lh, beatsPerMeasure(t), 'LH', t.notes.length) : [];
}

/** Mọi nốt của cả hai bè. */
export function allTimed(t: Tune): TimedNote[] {
  return [...timeline(t), ...lhTimeline(t)];
}

export function totalBeats(t: Tune): number {
  return t.notes.reduce((s, n) => s + n.beats, 0);
}

export function measureCount(t: Tune): number {
  return Math.ceil(totalBeats(t) / beatsPerMeasure(t) - 1e-9);
}

/** Các nốt có cao độ của bè chính (bỏ dấu lặng). */
export function playable(t: Tune): TimedNote[] {
  return timeline(t).filter((n) => !n.rest && n.pitch);
}

/** Mọi cao độ của một nốt (kể cả hợp âm). */
export function pitchesOf(n: TuneNote): Pitch[] {
  return n.rest || !n.pitch ? [] : [n.pitch, ...(n.also ?? []).map((a) => a.pitch)];
}

/**
 * "Nhóm thời điểm": các nốt (cả hai tay) bắt đầu cùng lúc. Chế độ chờ đi theo từng nhóm;
 * chấm nhịp bằng micro cũng theo nhóm (micro chỉ nghe được MỘT nốt — trúng nốt nào trong nhóm cũng tính).
 */
export interface Onset {
  start: number;
  notes: TimedNote[];
  pitches: Pitch[];
}

export function onsets(t: Tune): Onset[] {
  const map = new Map<number, TimedNote[]>();
  for (const n of allTimed(t)) {
    if (n.rest || !n.pitch) continue;
    const k = Math.round(n.start * 1000) / 1000;
    map.set(k, [...(map.get(k) ?? []), n]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, notes]) => ({ start, notes, pitches: notes.flatMap(pitchesOf) }));
}

/**
 * v5 — Tập TÁCH TAY: nhóm thời điểm chỉ gồm nốt của tay `hand` (nhóm không còn nốt nào thì bỏ).
 * hand = null → như onsets() (hai tay).
 */
export function handOnsets(t: Tune, hand: Hand | null): Onset[] {
  const all = onsets(t);
  if (!hand) return all;
  return all.flatMap((o) => {
    const notes = o.notes.filter((n) => n.hand === hand);
    return notes.length ? [{ start: o.start, notes, pitches: notes.flatMap(pitchesOf) }] : [];
  });
}

/** v5 — Nốt của tay KIA khi tập tách tay (app đàn khẽ thay bé). hand = null → không có. */
export function otherHandNotes(t: Tune, hand: Hand | null): TimedNote[] {
  return hand ? allTimed(t).filter((n) => n.hand !== hand && !n.rest && !!n.pitch) : [];
}

/** Câu nhạc: [ô nhịp bắt đầu, ô nhịp kết thúc) — mặc định mỗi câu 4 ô nhịp. */
export function phraseRanges(t: Tune): Array<[number, number]> {
  const total = measureCount(t);
  const starts = t.phrases?.length ? [...t.phrases].sort((a, b) => a - b) : [];
  if (!starts.length) for (let m = 0; m < total; m += 4) starts.push(m);
  return starts.map((s, i) => [s, i + 1 < starts.length ? starts[i + 1] : total]);
}

function sliceVoice(notes: TuneNote[], bpm: number, from: number, to: number): TuneNote[] {
  const all = timed(notes, bpm, 'RH', 0);
  const inside = all.filter((n) => n.start >= from * bpm - 1e-9 && n.start < to * bpm - 1e-9);
  const out: TuneNote[] = inside.map(({ pitch, beats, finger, rest, also, dyn, stac, slur }) => {
    const n: TuneNote = { pitch, beats, finger, rest, also };
    if (dyn) n.dyn = dyn;
    if (stac) n.stac = stac;
    if (slur) n.slur = slur;
    return n;
  });
  if (!inside.length) return out;
  const before = all.slice(0, inside[0].index);
  // v4: câu bắt đầu giữa chừng → mang theo sắc thái đang có hiệu lực
  const first = out.find((n) => !n.rest);
  const dynBefore = [...before].reverse().find((n) => n.dyn)?.dyn;
  if (first && !first.dyn && dynBefore) first.dyn = dynBefore;
  // v4: dấu luyến bị cắt ngang → mở/đóng lại ở mép câu
  const openBefore = slurOpen(before);
  if (openBefore && first) {
    if (first.slur === 'end') delete first.slur;
    else if (!first.slur) first.slur = 'start';
  }
  if (slurOpen(out)) {
    const last = [...out].reverse().find((n) => !n.rest);
    if (last?.slur === 'start') delete last.slur;
    else if (last) last.slur = 'end';
  }
  return out;
}

/** Có dấu luyến đang mở (chưa đóng) ở cuối dãy nốt không. */
function slurOpen(notes: TuneNote[]): boolean {
  let open = false;
  for (const n of notes) {
    if (n.slur === 'start') open = true;
    else if (n.slur === 'end') open = false;
  }
  return open;
}

/** Cắt một đoạn ô nhịp thành bài con (để tập từng câu). */
export function slice(t: Tune, fromMeasure: number, toMeasure: number): Tune {
  const bpm = beatsPerMeasure(t);
  return {
    ...t,
    id: `${t.id}#${fromMeasure}-${toMeasure}`,
    phrases: [0],
    notes: sliceVoice(t.notes, bpm, fromMeasure, toMeasure),
    lh: t.lh ? sliceVoice(t.lh, bpm, fromMeasure, toMeasure) : undefined,
  };
}

/** Dải bàn phím ảo phù hợp với bài. */
export function tuneRange(t: Tune): [Pitch, Pitch] {
  return keyboardRangeFor(allTimed(t).flatMap(pitchesOf));
}

function validateVoice(notes: TuneNote[], hand: Hand, position: PositionId, ext: boolean, label: string): string[] {
  const errs: string[] = [];
  for (const [i, n] of notes.entries()) {
    if (!(n.beats > 0)) errs.push(`${label} nốt ${i}: beats`);
    if (n.rest) {
      if (n.pitch || n.finger) errs.push(`${label} nốt ${i}: dấu lặng không có cao độ/ngón`);
      continue;
    }
    if (!n.pitch) {
      errs.push(`${label} nốt ${i}: thiếu pitch`);
      continue;
    }
    const all = [{ pitch: n.pitch, finger: n.finger }, ...(n.also ?? [])];
    const fingers = new Set<number>();
    for (const a of all) {
      try {
        pitchToMidi(a.pitch);
      } catch {
        errs.push(`${label} nốt ${i}: cao độ sai ${a.pitch}`);
        continue;
      }
      if (position === 'free') {
        if (!a.finger || a.finger < 1 || a.finger > 5) errs.push(`${label} nốt ${i}: ${a.pitch} cần số ngón 1–5`);
      } else {
        const f = fingerInPosition(a.pitch, hand, position, ext);
        if (f === undefined) errs.push(`${label} nốt ${i}: ${a.pitch} ngoài thế ${position} tay ${hand}`);
        else if (a.finger !== f) errs.push(`${label} nốt ${i}: ${a.pitch} phải là ngón ${f}`);
      }
      if (a.finger) {
        if (fingers.has(a.finger)) errs.push(`${label} nốt ${i}: hai nốt cùng một ngón`);
        fingers.add(a.finger);
      }
    }
  }
  return errs;
}

/** Kiểm tra bài: nốt nằm trong thế tay, ngón đúng bảng thế tay (§6 + Cấp 2–3). */
export function validateTune(t: Tune): string[] {
  const errs = validateVoice(t.notes, mainHand(t), t.position ?? 'C', !!t.extension, mainHand(t));
  if (t.hand === 'BOTH') {
    if (!t.lh) errs.push('bài hai tay thiếu bè tay trái');
    else {
      errs.push(...validateVoice(t.lh, 'LH', t.lhPosition ?? 'C', false, 'LH'));
      const lhBeats = t.lh.reduce((s, n) => s + n.beats, 0);
      if (lhBeats !== totalBeats(t)) errs.push(`bè tay trái ${lhBeats} phách ≠ bè tay phải ${totalBeats(t)}`);
    }
  } else if (t.lh) errs.push('chỉ bài hai tay mới có bè lh');
  if (totalBeats(t) % beatsPerMeasure(t) !== 0) errs.push('tổng phách không tròn ô nhịp');
  return errs;
}

// ---------------- Nhạc đệm (bố mẹ "đàn cùng") ----------------

const CHORDS: Array<{ name: string; tones: number[]; root: number }> = [
  { name: 'C', tones: [0, 4, 7], root: 0 },
  { name: 'F', tones: [5, 9, 0], root: 5 },
  { name: 'G', tones: [7, 11, 2], root: 7 },
  { name: 'D', tones: [2, 6, 9], root: 2 },
  { name: 'Am', tones: [9, 0, 4], root: 9 },
  { name: 'Dm', tones: [2, 5, 9], root: 2 },
  { name: 'Em', tones: [4, 7, 11], root: 4 },
  { name: 'Cm', tones: [0, 3, 7], root: 0 },
  { name: 'Bb', tones: [10, 2, 5], root: 10 },
];

export interface AccompNote {
  start: number;
  beats: number;
  midi: number;
}

/**
 * Bè đệm đơn giản: mỗi ô nhịp chọn hợp âm hợp với giai điệu nhất,
 * đánh nốt gốc ở phách 1 và quãng 5 ở phách sau. Bài hai tay: không đệm (tay trái là bè đệm).
 */
export function accompaniment(t: Tune): AccompNote[] {
  if (t.lh) return [];
  const bpm = beatsPerMeasure(t);
  const notes = playable(t);
  const out: AccompNote[] = [];
  const base = t.hand === 'LH' ? 60 : 36; // tay trái → đệm ở âm cao; còn lại → âm trầm
  let prev = CHORDS[0];
  for (let m = 0; m < measureCount(t); m++) {
    const inM = notes.filter((n) => n.measure === m);
    let best = prev;
    let bestScore = -1;
    for (const c of CHORDS) {
      let score = 0;
      for (const n of inM) if (c.tones.includes(pitchToMidi(n.pitch!) % 12)) score += n.beats;
      // ưu tiên hợp âm chính (C/F/G) và giữ nguyên hợp âm cũ khi hòa
      if (['C', 'F', 'G'].includes(c.name)) score += 0.25;
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

// ---------------- v4: Sắc thái & kiểu đàn (khi phát mẫu) ----------------

/** Âm lượng tương đối khi phát mẫu: p nhỏ, mf vừa, f to. */
export const DYN_VOLUME: Record<Dynamic, number> = { p: 0.45, mf: 0.75, f: 1 };
/** Nốt ngắt tiếng chỉ kêu ~35% độ dài viết */
export const STAC_FRACTION = 0.35;
/** Nốt thường: nhấc phím sớm một chút (như trước v4) */
const NORMAL_FRACTION = 0.95;

export interface NoteStyle {
  /** Sắc thái đang có hiệu lực (null = bài không ghi sắc thái) */
  dyn: Dynamic | null;
  /** Âm lượng tương đối (1 = như bài không ghi sắc thái) */
  vol: number;
  /** Độ dài thật sự kêu (phách) */
  len: number;
  /** Nằm trong dấu luyến (đàn liền) */
  slurred: boolean;
}

/** Bài có dùng ký hiệu sắc thái / ngắt / luyến không (để hiện chú thích). */
export function expressionUsed(t: Tune): { dyn: boolean; stac: boolean; slur: boolean } {
  const all = [...t.notes, ...(t.lh ?? [])];
  return { dyn: all.some((n) => !!n.dyn), stac: all.some((n) => !!n.stac), slur: all.some((n) => !!n.slur) };
}

/** Kiểu đàn của từng nốt (theo TimedNote.index, cả hai bè). */
export function noteStyles(t: Tune): Map<number, NoteStyle> {
  const out = new Map<number, NoteStyle>();
  const anyDyn = expressionUsed(t).dyn;
  for (const voice of [timeline(t), lhTimeline(t)]) {
    // Bài có ghi sắc thái: trước dấu đầu tiên coi như mf
    let cur: Dynamic | null = anyDyn ? 'mf' : null;
    // Bè không có dấu riêng (thường là tay trái) đi theo sắc thái CHUNG của bè chính — khuông vẽ một hàng chung
    const ownDyn = voice.some((n) => !!n.dyn);
    let open = false;
    for (const n of voice) {
      if (n.dyn) cur = n.dyn;
      else if (!ownDyn && anyDyn) cur = dynAtBeat(t, n.start);
      if (n.rest) continue;
      if (n.slur === 'start') open = true;
      const ending = n.slur === 'end';
      const slurred = open || ending;
      // Trong dấu luyến: giữ phím tới tận nốt sau (chồng nhẹ cho liền tiếng); nốt cuối luyến nhấc tay
      const frac = n.stac ? STAC_FRACTION : open && !ending ? 1.02 : ending ? 0.85 : NORMAL_FRACTION;
      out.set(n.index, { dyn: cur, vol: cur ? DYN_VOLUME[cur] : 1, len: n.beats * frac, slurred });
      if (ending) open = false;
    }
  }
  return out;
}

/** Sắc thái của bè chính tại phách `beat` (null = bài không ghi sắc thái). */
export function dynAtBeat(t: Tune, beat: number): Dynamic | null {
  if (!expressionUsed(t).dyn) return null;
  let cur: Dynamic = 'mf';
  for (const n of timeline(t)) {
    if (n.start > beat + 1e-9) break;
    if (n.dyn) cur = n.dyn;
  }
  return cur;
}

/** Các cặp dấu luyến [nốt đầu, nốt cuối] (TimedNote.index) trong một bè. Dấu luyến chưa đóng → tới nốt cuối bè. */
export function slurSpans(voice: TimedNote[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let from = -1;
  let last = -1;
  for (const n of voice) {
    if (n.rest) continue;
    last = n.index;
    if (n.slur === 'start' && from < 0) from = n.index;
    else if (n.slur === 'end' && from >= 0) {
      if (n.index > from) out.push([from, n.index]);
      from = -1;
    }
  }
  if (from >= 0 && last > from) out.push([from, last]);
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
