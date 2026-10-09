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
  /**
   * Cấp 4 — Pedal vang (ghi ở bè THẤP nhất: `lh` của bài hai tay, `notes` của bài một tay):
   * 'start' = đạp pedal ngay sau khi nốt này kêu · 'change' = thay pedal liền ("nhả trước — nhấn sau": nhả đúng lúc
   * nốt này kêu, đạp lại ngay sau) · 'end' = nhả pedal ở CUỐI nốt này. Một đoạn pedal: 'start' … ('change')* … 'end'.
   */
  ped?: 'start' | 'change' | 'end';
  /**
   * Cấp 4 — Dấu to dần / nhỏ dần (chỉ ở bè chính `notes`): nêm bắt đầu ở nốt 'cresc' / 'dim',
   * kết thúc ở nốt 'end' kế tiếp (tính cả nốt đó).
   */
  hairpin?: 'cresc' | 'dim' | 'end';
  /** Cấp 4 — Chữ "rit." (chậm dần) trên khuông ở nốt này — chỉ để hiển thị, không đổi nhịp khi phát/chấm */
  rit?: boolean;
}

export type Dynamic = 'p' | 'mf' | 'f';

export type TuneHand = Hand | 'BOTH';

export interface Tune {
  id: string;
  title: string;
  titleVi: string;
  /**
   * (+ 2026-10-06) Mục "🇻🇳 Bài Việt Nam" của Thư viện: 'folk' = dân ca Việt Nam ·
   * 'lyrics' = giai điệu nước ngoài (public domain) trẻ em Việt Nam quen hát lời Việt ·
   * 'composed' = ca khúc nhạc sĩ Việt Nam đã thuộc về công chúng (nhạc sĩ mất trước 1946 — chỉ giai điệu, ghi tên nhạc sĩ).
   */
  vn?: 'folk' | 'lyrics' | 'composed';
  /** (+ 2026-10-06) Tên Việt quen gọi khác (chỉ tên, không có lời) — vd "Sao nhỏ lấp lánh" */
  aka?: string;
  composer?: string;
  sourceStatus?: string;
  arrangementBy?: string;
  attributionRequired?: boolean;
  hand: TuneHand;
  bpm: number;
  /**
   * "4/4", "3/4", "2/4" — phách = nốt đen. Cấp 4: "6/8" (nhịp ghép) — phách = nốt MÓC ĐƠN: `beats` của nốt tính theo
   * móc đơn (móc đơn 1, đen 2, đen chấm 3, trắng chấm 6), `bpm` là số móc đơn mỗi phút, mỗi ô 6 phách.
   */
  timeSignature: string;
  /** Cấp 4 — Chữ tốc độ ("Andante", "Allegro", "Moderato") in đậm trên ô nhịp đầu — chỉ để hiển thị */
  tempoTerm?: string;
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

/**
 * (+ 2026-10-09) Tiếng tích máy đếm nhịp ở phách `b` (tính từ 0, có thể âm khi đếm vào): true = phách 1 (mạnh) ·
 * 'secondary' = đầu nhóm 3 móc đơn khác của nhịp ghép x/8 (6/8: phách 4; 9/8: 4, 7; 12/8: 4, 7, 10) · false = thường.
 */
export function metronomeAccent(t: Tune, b: number): boolean | 'secondary' {
  const n = beatsPerMeasure(t);
  const pos = ((b % n) + n) % n;
  if (pos === 0) return true;
  const compound = noteUnit(t) === 0.5 && n > 3 && n % 3 === 0;
  return compound && pos % 3 === 0 ? 'secondary' : false;
}

/** Cấp 4 — Số nốt đen trong một phách của bài: 1 với x/4, 0,5 với x/8 (phách = móc đơn). `beats × noteUnit` = trường độ tính theo nốt đen (để vẽ hình nốt). */
export function noteUnit(t: Tune): number {
  const d = Number(t.timeSignature.split('/')[1]) || 4;
  return 4 / d;
}

/** Cấp 4 — Nhịp ghép (6/8, 9/8, 12/8): mỗi "nhịp lớn" = nốt đen chấm = 3 móc đơn. */
export function isCompound(t: Tune): boolean {
  const [n, d] = t.timeSignature.split('/').map(Number);
  return d === 8 && n >= 6 && n % 3 === 0;
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
  const out: TuneNote[] = inside.map(({ pitch, beats, finger, rest, also, dyn, stac, slur, ped, hairpin, rit }) => {
    const n: TuneNote = { pitch, beats, finger, rest, also };
    if (dyn) n.dyn = dyn;
    if (stac) n.stac = stac;
    if (slur) n.slur = slur;
    if (ped) n.ped = ped;
    if (hairpin) n.hairpin = hairpin;
    if (rit) n.rit = rit;
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
  const lastNote = [...out].reverse().find((n) => !n.rest);
  // Cấp 4: pedal bị cắt ngang → đạp lại ở nốt đầu câu / nhả ở nốt cuối câu
  if (pedalOpen(before) && first) {
    if (first.ped === 'end') delete first.ped;
    else if (first.ped !== 'start') first.ped = 'start';
  }
  if (pedalOpen(out) && lastNote) {
    if (lastNote.ped === 'start') delete lastNote.ped;
    else lastNote.ped = 'end';
  }
  // Cấp 4: nêm to dần / nhỏ dần bị cắt ngang → mở lại ở nốt đầu câu / đóng ở nốt cuối câu
  const hpBefore = hairpinOpen(before);
  if (hpBefore && first) {
    if (first.hairpin === 'end') delete first.hairpin;
    else if (!first.hairpin) first.hairpin = hpBefore;
  }
  if (hairpinOpen(out) && lastNote) {
    if (lastNote.hairpin === 'cresc' || lastNote.hairpin === 'dim') delete lastNote.hairpin;
    else lastNote.hairpin = 'end';
  }
  return out;
}

/** Cấp 4 — Pedal còn đang đạp (chưa nhả) ở cuối dãy nốt không. */
function pedalOpen(notes: TuneNote[]): boolean {
  let open = false;
  for (const n of notes) {
    if (n.ped === 'start' || n.ped === 'change') open = true;
    else if (n.ped === 'end') open = false;
  }
  return open;
}

/** Cấp 4 — Nêm đang mở ở cuối dãy nốt: loại nêm, hoặc null. */
function hairpinOpen(notes: TuneNote[]): 'cresc' | 'dim' | null {
  let open: 'cresc' | 'dim' | null = null;
  for (const n of notes) {
    if (n.hairpin === 'cresc' || n.hairpin === 'dim') open = n.hairpin;
    else if (n.hairpin === 'end') open = null;
  }
  return open;
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
  // Cấp 4: pedal & nêm phải đóng/mở đúng cặp
  const main = mainHand(t);
  errs.push(...validateMarks(t.notes, main));
  if (t.lh) {
    errs.push(...validateMarks(t.lh, 'LH'));
    if (t.lh.some((n) => n.hairpin)) errs.push('LH: dấu to dần/nhỏ dần chỉ ghi ở bè chính');
    if (t.lh.some((n) => n.ped) && t.notes.some((n) => n.ped)) errs.push('pedal chỉ ghi ở MỘT bè (bè thấp nhất: lh)');
  }
  return errs;
}

/** Cấp 4 — Kiểm tra cặp pedal ('start' … 'change'* … 'end') và nêm ('cresc'/'dim' … 'end') của một bè. */
function validateMarks(notes: TuneNote[], label: string): string[] {
  const errs: string[] = [];
  let ped = false;
  let hp = false;
  for (const [i, n] of notes.entries()) {
    if (n.ped === 'start') {
      if (ped) errs.push(`${label} nốt ${i}: pedal 'start' khi pedal đang đạp (chưa 'end')`);
      ped = true;
    } else if (n.ped === 'change' || n.ped === 'end') {
      if (!ped) errs.push(`${label} nốt ${i}: pedal '${n.ped}' khi chưa có 'start'`);
      ped = n.ped === 'change';
    } else if (n.ped !== undefined) errs.push(`${label} nốt ${i}: ped lạ ${String(n.ped)}`);
    if (n.hairpin === 'cresc' || n.hairpin === 'dim') {
      if (hp) errs.push(`${label} nốt ${i}: nêm '${n.hairpin}' lồng trong nêm chưa 'end'`);
      hp = true;
    } else if (n.hairpin === 'end') {
      if (!hp) errs.push(`${label} nốt ${i}: nêm 'end' khi chưa có 'cresc'/'dim'`);
      hp = false;
    } else if (n.hairpin !== undefined) errs.push(`${label} nốt ${i}: hairpin lạ ${String(n.hairpin)}`);
  }
  if (ped) errs.push(`${label}: pedal chưa 'end' tới cuối bài`);
  if (hp) errs.push(`${label}: nêm to dần/nhỏ dần chưa 'end' tới cuối bài`);
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
 * (+ 2026-10-08) 🎁 Kiểu nhạc đệm (quà mở khóa theo đảo — lessons/unlocks.ts): 'basic' = như cũ (gốc phách 1 + quãng 5),
 * 'march' = gốc / quãng 5 xen kẽ MỖI phách, 'arpeggio' = rải gốc–3–5–3 mỗi phách, 'bounce' = "bùm-tách" (gốc trầm ở phách
 * mạnh, quãng 3 + 5 cao ở phách nhẹ). Chọn ở Sổ sticker → settings.cosmetics.backing → setBackingStyle (màn chính gọi).
 */
export type BackingStyle = 'basic' | 'march' | 'arpeggio' | 'bounce';
export const BACKING_STYLES: readonly BackingStyle[] = ['basic', 'march', 'arpeggio', 'bounce'];
let currentBacking: BackingStyle = 'basic';
/** Đặt kiểu nhạc đệm mặc định cho các lần gọi accompaniment(t) sau (mã lạ → 'basic'). */
export function setBackingStyle(style: string | null | undefined): void {
  currentBacking = (BACKING_STYLES as readonly string[]).includes(style ?? '') ? (style as BackingStyle) : 'basic';
}
export const backingStyle = (): BackingStyle => currentBacking;

/**
 * Bè đệm đơn giản: mỗi ô nhịp chọn hợp âm hợp với giai điệu nhất,
 * đánh nốt gốc ở phách 1 và quãng 5 ở phách sau. Bài hai tay: không đệm (tay trái là bè đệm).
 * (+ 2026-10-08) `style` khác 'basic': cùng hợp âm, đổi cách đánh (xem BackingStyle).
 */
export function accompaniment(t: Tune, style: BackingStyle = currentBacking): AccompNote[] {
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
    // nhịp ghép (6/8 — phách là móc đơn): giữ kiểu cơ bản
    if (style !== 'basic' && !isCompound(t)) {
      out.push(...styledMeasure(style, m * bpm, bpm, root, best));
      continue;
    }
    if (isCompound(t)) {
      // Cấp 4 — nhịp ghép: mỗi nhịp lớn (3 móc đơn) một nốt — gốc, quãng 5, gốc, quãng 5…
      for (let g = 0; g * 3 < bpm; g++) out.push({ start: m * bpm + g * 3, beats: 3, midi: g % 2 ? root + 7 : root });
      continue;
    }
    out.push({ start: m * bpm, beats: Math.min(2, bpm), midi: root });
    if (bpm >= 3) out.push({ start: m * bpm + 2, beats: Math.min(2, bpm - 2), midi: root + 7 });
  }
  return out;
}

/** Một ô nhịp nhạc đệm kiểu `style` (gốc `root` MIDI, hợp âm `c`, `bpm` phách mỗi ô). */
function styledMeasure(style: Exclude<BackingStyle, 'basic'>, start: number, bpm: number, root: number, c: { tones: number[]; root: number }): AccompNote[] {
  // quãng 3 của hợp âm (trưởng 4 / thứ 3 nửa cung) tính từ gốc
  const third = (((c.tones[1] - c.root) % 12) + 12) % 12;
  const out: AccompNote[] = [];
  for (let b = 0; b < bpm; b++) {
    const t = start + b;
    if (style === 'march') out.push({ start: t, beats: 0.9, midi: b % 2 ? root + 7 : root });
    else if (style === 'arpeggio') out.push({ start: t, beats: 1, midi: root + [0, third, 7, third][b % 4] });
    else if (b === 0) out.push({ start: t, beats: 1, midi: root });
    else {
      out.push({ start: t, beats: 0.6, midi: root + 12 + third });
      out.push({ start: t, beats: 0.6, midi: root + 19 });
    }
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

/**
 * Bài có dùng ký hiệu sắc thái / ngắt / luyến không (để hiện chú thích).
 * Cấp 4: `ped` (pedal) và `hairpin` (to dần / nhỏ dần) CHỈ có mặt khi bài dùng (= true) — bài cũ giữ nguyên kết quả.
 */
export function expressionUsed(t: Tune): ExpressionUsed {
  const all = [...t.notes, ...(t.lh ?? [])];
  const out: ExpressionUsed = {
    dyn: all.some((n) => !!n.dyn),
    stac: all.some((n) => !!n.stac),
    slur: all.some((n) => !!n.slur),
  };
  if (all.some((n) => !!n.ped)) out.ped = true;
  if (t.notes.some((n) => !!n.hairpin)) out.hairpin = true;
  return out;
}

export interface ExpressionUsed {
  dyn: boolean;
  stac: boolean;
  slur: boolean;
  /** Cấp 4 — chỉ có (true) khi bài ghi pedal */
  ped?: boolean;
  /** Cấp 4 — chỉ có (true) khi bè chính ghi nêm to dần / nhỏ dần */
  hairpin?: boolean;
}

/** Kiểu đàn của từng nốt (theo TimedNote.index, cả hai bè). */
export function noteStyles(t: Tune): Map<number, NoteStyle> {
  const out = new Map<number, NoteStyle>();
  const used = expressionUsed(t);
  const anyDyn = used.dyn;
  // Cấp 4: nêm to dần / nhỏ dần (theo bè chính, áp cho cả hai bè như sắc thái) và pedal vang (giữ tiếng)
  const hpVol = used.hairpin ? hairpinVolume(t) : null;
  const pedSegs = used.ped ? [...pedalSegments(timeline(t)), ...pedalSegments(lhTimeline(t))] : [];
  for (const voice of [timeline(t), lhTimeline(t)]) {
    // Bài có ghi sắc thái (hoặc nêm): trước dấu đầu tiên coi như mf
    let cur: Dynamic | null = anyDyn || used.hairpin ? 'mf' : null;
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
      let len = n.beats * frac;
      // Pedal đang đạp lúc nốt kêu → tiếng ngân tới lúc thay / nhả pedal (không bao giờ ngắn hơn)
      for (const [a, b] of pedSegs) if (n.start >= a - 1e-9 && n.start < b - 1e-9) len = Math.max(len, b - n.start);
      const vol = hpVol?.(n.start) ?? (cur ? DYN_VOLUME[cur] : 1);
      out.set(n.index, { dyn: cur, vol, len, slurred });
      if (ending) open = false;
    }
  }
  return out;
}

/** Thang âm lượng cho nêm: (pp) · p · mf · f — nêm không có sắc thái đích thì đi một bậc. */
const VOL_STEPS = [0.3, DYN_VOLUME.p, DYN_VOLUME.mf, DYN_VOLUME.f];

/**
 * Cấp 4 — Âm lượng theo nêm của bè chính tại phách `beat` (null = không trong nêm / sau nêm):
 * trong nêm đi dần từ sắc thái lúc bắt đầu tới sắc thái ghi ngay sau nêm (không có / ngược chiều → một bậc);
 * sau nêm giữ mức mới cho tới dấu sắc thái kế tiếp.
 */
export function hairpinVolume(t: Tune): (beat: number) => number | null {
  const main = timeline(t);
  const spans = hairpinSpans(main);
  const segs: Array<{ a: number; b: number; v0: number; v1: number; hold: number }> = [];
  spans.forEach((sp, k) => {
    const a = main[sp.from].start;
    const endN = main[sp.to];
    const b = endN.start + endN.beats;
    const prev = segs[segs.length - 1];
    const held = prev && a >= prev.b - 1e-9 && a < prev.hold - 1e-9 ? prev.v1 : null;
    const v0 = held ?? DYN_VOLUME[dynAtBeat(t, a) ?? 'mf'];
    const limit = k + 1 < spans.length ? spans[k + 1].from : main.length - 1;
    const next = main.slice(sp.to, limit + 1).find((n) => !!n.dyn);
    const dir = sp.kind === 'cresc' ? 1 : -1;
    let v1 = next ? DYN_VOLUME[next.dyn!] : NaN;
    if (!next || (v1 - v0) * dir <= 0) {
      let i = 0;
      VOL_STEPS.forEach((v, j) => {
        if (Math.abs(v - v0) < Math.abs(VOL_STEPS[i] - v0)) i = j;
      });
      v1 = VOL_STEPS[Math.max(0, Math.min(VOL_STEPS.length - 1, i + dir))];
    }
    const after = main.find((n) => n.start >= b - 1e-9 && !!n.dyn);
    const nextSpan = k + 1 < spans.length ? main[spans[k + 1].from].start : Infinity;
    segs.push({ a, b, v0, v1, hold: Math.min(after?.start ?? Infinity, nextSpan) });
  });
  return (beat) => {
    for (const s of segs) {
      if (beat >= s.a - 1e-9 && beat < s.b - 1e-9) return s.v0 + ((s.v1 - s.v0) * (beat - s.a)) / (s.b - s.a);
      if (beat >= s.b - 1e-9 && beat < s.hold - 1e-9) return s.v1;
    }
    return null;
  };
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

/** Cấp 4 — Một đoạn pedal: nốt đạp, các nốt thay pedal, nốt nhả (TimedNote.index). */
export interface PedalSpan {
  start: number;
  changes: number[];
  end: number;
}

/**
 * Cấp 4 — Các đoạn pedal của một bè ('start' … 'change'* … 'end'). Viết lỏng vẫn đọc được:
 * 'change' khi chưa đạp = 'start'; 'start' khi đang đạp = 'change'; chưa 'end' → tới nốt cuối bè.
 */
export function pedalSpans(voice: TimedNote[]): PedalSpan[] {
  const out: PedalSpan[] = [];
  let open: PedalSpan | null = null;
  for (const n of voice) {
    if (!n.ped) continue;
    if (n.ped === 'end') {
      if (open) out.push({ ...open, end: n.index });
      open = null;
    } else if (open) open.changes.push(n.index);
    else open = { start: n.index, changes: [], end: -1 };
  }
  if (open && voice.length) out.push({ ...open, end: voice[voice.length - 1].index });
  return out;
}

/**
 * Cấp 4 — Khoảng thời gian (phách) pedal đang đạp: [lúc đạp, lúc nhả/thay). Mỗi 'change' mở một khoảng mới
 * (nốt ở 'change' thuộc khoảng mới); khoảng cuối kết thúc ở CUỐI nốt 'end'.
 */
export function pedalSegments(voice: TimedNote[]): Array<[number, number]> {
  const by = new Map(voice.map((n) => [n.index, n]));
  const out: Array<[number, number]> = [];
  for (const sp of pedalSpans(voice)) {
    const pts = [sp.start, ...sp.changes].map((i) => by.get(i)!.start);
    const e = by.get(sp.end)!;
    const endT = Math.max(e.start + e.beats, pts[pts.length - 1]);
    pts.forEach((p, i) => {
      const q = i + 1 < pts.length ? pts[i + 1] : endT;
      if (q > p) out.push([p, q]);
    });
  }
  return out;
}

/** Cấp 4 — Một nêm to dần / nhỏ dần: [nốt đầu, nốt cuối] (TimedNote.index, tính cả nốt cuối). */
export interface HairpinSpan {
  from: number;
  to: number;
  kind: 'cresc' | 'dim';
}

/**
 * Cấp 4 — Các nêm của một bè (thường là bè chính): từ nốt 'cresc'/'dim' tới nốt 'end' kế tiếp.
 * Nêm mới khi nêm cũ chưa đóng → nêm cũ đóng ở nốt ngay trước; chưa 'end' → tới nốt cuối bè.
 */
export function hairpinSpans(voice: TimedNote[]): HairpinSpan[] {
  const out: HairpinSpan[] = [];
  let open: { from: number; kind: 'cresc' | 'dim' } | null = null;
  let prev = -1;
  for (const n of voice) {
    if (n.hairpin === 'end') {
      if (open && n.index > open.from) out.push({ ...open, to: n.index });
      open = null;
    } else if (n.hairpin === 'cresc' || n.hairpin === 'dim') {
      if (open && prev > open.from) out.push({ ...open, to: prev });
      open = { from: n.index, kind: n.hairpin };
    }
    prev = n.index;
  }
  if (open && prev > open.from) out.push({ ...open, to: prev });
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
