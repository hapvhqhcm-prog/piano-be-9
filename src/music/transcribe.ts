import type { Hand } from '../piano/fingering';
import { midiToPitch, type Pitch } from '../piano/pitchTable';
import { autoFinger, guessHand, whitePos } from './autoFinger';
import { notesToSolfege, restsFor, type SolfegeNote } from './solfege';

/**
 * "🎙️ Đàn để thêm bài" (2026-10-10) — CHÉP NHẠC từ tiếng đàn thật (hàm thuần, không DOM — tests/transcribe.test.ts).
 *
 * Bố mẹ (hoặc bé) đàn giai điệu MỘT TAY trên đàn cơ; micro (MicListener.onNote, `at` = lúc gõ phím) cho danh sách
 * lần gõ { t, midi } (+ lúc nhả phím `off` nếu nghe rõ tiếng tắt nhanh — OnsetCollector). Ở đây:
 * 1. Dọn: bỏ nốt ngoài dải Đô3–Đô6, gộp hai lần gõ quá sát (< 80 ms).
 * 2. Nhịp phách:
 *    - CÓ máy đếm nhịp: lưới phách đã biết (bpm + lúc phách 1) → đặt từng lần gõ lên lưới móc đơn (½ phách),
 *      bù độ trễ đều tay (bé hay đàn chậm/sớm hơn tiếng tích một chút — lấy trung vị độ lệch).
 *    - KHÔNG có: ước lượng độ dài phách từ khoảng cách giữa các lần gõ (IOI) — thử mọi tốc độ 40–150, chấm độ khớp
 *      với các trường độ cho phép + "giá" của trường độ hiếm (ưu tiên nốt đen là phổ biến nhất) — rồi lượng tử từng
 *      khoảng theo tốc độ trôi chậm (bé hay chậm dần / nhanh dần).
 * 3. Trường độ = tới lần gõ sau (legato); nhả phím sớm hẳn (≥ ¾ phách trước lần gõ sau) → nốt ngắn + dấu lặng.
 *    Nốt: tròn, trắng chấm, trắng, đen chấm, đen, móc đơn (4 · 3 · 2 · 1,5 · 1 · ½ phách); phần thừa = dấu lặng.
 * 4. Vạch nhịp theo nhịp 2/4 · 3/4 · 4/4; nhịp lấy đà (nốt đầu không rơi vào phách 1): có máy đếm nhịp thì biết
 *    chắc; không có thì đoán theo nốt dài rơi vào phách mạnh / ít nốt vắt qua vạch nhịp (bố mẹ dời được ±½ phách).
 *    Nốt vắt qua vạch nhịp bị cắt ở vạch (phần sau thành dấu lặng) — bài hát của app chưa có dây nối.
 * 5. Thế tay 5 ngón chứa nhiều nốt nhất + số ngón (autoFinger — đúng như bài lưu) + nốt ngoài thế tay.
 */

export type TimeSig = '2/4' | '3/4' | '4/4';
export const barBeats = (ts: TimeSig): number => Number(ts.split('/')[0]);

/** Một lần gõ phím nghe được: t = lúc gõ (giây), off = lúc nhả phím (nếu nghe rõ), midi = cao độ. */
export interface OnsetEvent {
  t: number;
  midi: number;
  off?: number;
}

/** Một phần tử của chuỗi nốt (trước khi chia ô nhịp): nốt (midi) hoặc dấu lặng; `src` = chỉ số lần gõ gốc. */
export interface SeqItem {
  midi?: number;
  rest?: boolean;
  beats: number;
  src?: number;
}

export interface Transcription {
  /** Chuỗi nốt / dấu lặng theo thứ tự — phần tử đầu luôn là nốt (dấu lặng lấy đà nằm ở `pickupRest`) */
  seq: SeqItem[];
  /** Số phách lặng trước nốt đầu trong ô nhịp đầu (0 = bắt đầu ở phách 1; > 0 = có nhịp lấy đà) */
  pickupRest: number;
  /** Độ dài phách (giây) và tốc độ tương ứng (♩ = bpm, chưa làm tròn) */
  beatSec: number;
  bpm: number;
  tempo: 'metronome' | 'estimated';
  /** Số lần gõ bị bỏ (ngoài dải / gõ trùng) */
  dropped: number;
}

export interface TranscribeOptions {
  timeSig: TimeSig;
  /** Có máy đếm nhịp: tốc độ + thời điểm một phách 1 (đồng hồ cùng với `t`, đã trừ độ trễ loa→micro) */
  metronome?: { bpm: number; downbeat: number };
}

/** Trường độ nốt cho phép (phách) — từ dài tới ngắn. */
export const NOTE_VALUES = [4, 3, 2, 1.5, 1, 0.5] as const;
/** Dải nốt app ghi được (khớp trình soạn: Đô3–Đô6). */
const MIN_MIDI = 48;
const MAX_MIDI = 84;
/** Hai lần gõ sát hơn thế → coi là một (micro báo trùng). */
const MERGE_S = 0.08;
/** Nhả phím trước lần gõ sau ít nhất từng này phách → có dấu lặng. */
const REST_GAP = 0.75;
const EPS = 1e-6;

const snap = (b: number, step = 0.5): number => Math.round(b / step) * step;

/** Dọn danh sách lần gõ: sắp theo thời gian, bỏ nốt ngoài dải, gộp lần gõ trùng. */
export function cleanEvents(events: readonly OnsetEvent[]): { events: OnsetEvent[]; dropped: number } {
  const sorted = [...events].filter((e) => Number.isFinite(e.t) && Number.isFinite(e.midi)).sort((a, b) => a.t - b.t);
  const out: OnsetEvent[] = [];
  let dropped = events.length - sorted.length;
  for (const e of sorted) {
    if (e.midi < MIN_MIDI || e.midi > MAX_MIDI) {
      dropped++;
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && e.t - prev.t < MERGE_S) {
      dropped++;
      if (e.off !== undefined) prev.off = e.off;
      continue;
    }
    out.push({ ...e });
  }
  return { events: out, dropped };
}

// ---------------- Ước lượng phách khi KHÔNG có máy đếm nhịp ----------------

/** Khoảng giữa hai lần gõ (tính theo phách) có thể gặp, và "giá" (độ hiếm) của mỗi loại. */
const IOI_VALUES: Array<[number, number]> = [
  [1, 0],
  [2, 0.12],
  [0.5, 0.3],
  [3, 0.35],
  [4, 0.35],
  [1.5, 0.45],
];
/** Độ lệch tay (giây) — chuẩn hóa sai số */
const JITTER_S = 0.05;

function ioiCost(iois: readonly number[], T: number): number {
  let c = 0;
  for (const x of iois) {
    let best = Infinity;
    // Lệch tay tăng theo độ dài khoảng (nốt ngân dài khó giữ đúng)
    const sigma = JITTER_S + 0.04 * x;
    for (const [v, price] of IOI_VALUES) {
      const e = (x - v * T) / sigma;
      const cost = Math.min(e * e, 6) + price;
      if (cost < best) best = cost;
    }
    // Quãng nghỉ dài (> 4,5 phách) — nốt + dấu lặng, không nói gì về phách
    if (x / T > 4.5) best = Math.min(best, 1);
    c += best;
  }
  const bpm = 60 / T;
  // Tốc độ bé hay đàn: 50–120 (ngoài khoảng đó phải có bằng chứng rõ), nghiêng nhẹ về ~84
  const out = bpm < 50 ? Math.log2(50 / bpm) : bpm > 120 ? Math.log2(bpm / 120) : 0;
  return c / iois.length + out * 3 + 0.2 * Math.abs(Math.log2(bpm / 84));
}

/** Độ dài phách (giây) ước lượng từ các lần gõ (không có máy đếm nhịp). */
export function estimateBeat(times: readonly number[]): number {
  const iois: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0.12 && d < 6) iois.push(d);
  }
  if (iois.length < 2) return iois.length ? Math.min(1.2, Math.max(0.45, iois[0])) : 60 / 72;
  let bestT = 60 / 72;
  let best = Infinity;
  // Quét tốc độ 40–150 (bước ~0,5 %)
  for (let bpm = 40; bpm <= 150; bpm *= 1.005) {
    const T = 60 / bpm;
    const c = ioiCost(iois, T);
    if (c < best - 1e-9) {
      best = c;
      bestT = T;
    }
  }
  // Tinh chỉnh: bình phương tối thiểu trên các khoảng ≤ 2 phách khớp lưới
  let num = 0;
  let den = 0;
  for (const x of iois) {
    const b = snap(x / bestT);
    if (b >= 0.5 && b <= 2 && Math.abs(x / bestT - b) < 0.2) {
      num += x * b;
      den += b * b;
    }
  }
  return den > 0 ? num / den : bestT;
}

// ---------------- Lượng tử hóa ----------------

interface Placed {
  midi: number;
  /** Vị trí (phách, tính từ nốt đầu hoặc từ phách 1 khi có máy đếm nhịp) */
  pos: number;
  /** Độ dài phách cục bộ (giây) quanh nốt này */
  T: number;
  e: OnsetEvent;
  src: number;
}

function placeWithGrid(ev: readonly OnsetEvent[], spb: number, downbeat: number): Placed[] {
  const raw = ev.map((e) => (e.t - downbeat) / spb);
  // Bé đàn đều chậm / sớm hơn tiếng tích (hoặc độ trễ đo chưa đúng) → tìm độ lệch đều (≤ 0,3 phách) khớp lưới móc
  // đơn nhất; nốt rơi vào nửa phách (móc đơn) "đắt" hơn nốt đúng phách, lệch càng ít càng tốt.
  let shift = 0;
  let best = Infinity;
  for (let s = -0.3; s <= 0.3 + EPS; s += 0.01) {
    let c = 2 * s * s * raw.length;
    for (const p of raw) {
      const q = snap(p - s);
      const r = (p - s - q) / 0.1;
      c += Math.min(r * r, 1) + (Math.abs(q - Math.round(q)) > EPS ? 0.3 : 0);
    }
    if (c < best - 1e-9) {
      best = c;
      shift = s;
    }
  }
  const out: Placed[] = [];
  raw.forEach((p, i) => {
    let q = snap(p - shift);
    const prev = out[out.length - 1];
    if (prev && q < prev.pos + 0.5 - EPS) q = prev.pos + 0.5;
    out.push({ midi: ev[i].midi, pos: q, T: spb, e: ev[i], src: i });
  });
  return out;
}

function placeEstimated(ev: readonly OnsetEvent[], T0: number): Placed[] {
  const out: Placed[] = [];
  let T = T0;
  ev.forEach((e, i) => {
    if (!i) {
      out.push({ midi: e.midi, pos: 0, T, e, src: i });
      return;
    }
    const d = e.t - ev[i - 1].t;
    const q = Math.max(0.5, snap(d / T));
    // Tốc độ trôi chậm theo các khoảng ngắn (tin cậy hơn nốt ngân / quãng nghỉ)
    if (q <= 2 && Math.abs(d / T - q) < 0.22) T = T * 0.8 + (d / q) * 0.2;
    out.push({ midi: e.midi, pos: out[i - 1].pos + q, T, e, src: i });
  });
  return out;
}

/** Trọng số phách mạnh của vị trí `b` trong ô (b = 0 là phách 1). */
function metricWeight(b: number, bpb: number): number {
  if (Math.abs(b) < EPS) return 1;
  if (bpb === 4 && Math.abs(b - 2) < EPS) return 0.5;
  return Math.abs(b - Math.round(b)) < EPS ? 0.1 : 0;
}

/**
 * Đoán nhịp lấy đà (không có máy đếm nhịp): `pickupRest` ∈ {0, ½, …, bpb − ½} cho điểm cao nhất —
 * nốt dài rơi vào phách mạnh, phạt nốt vắt qua vạch nhịp; ưu tiên "không lấy đà" và nhịp lấy đà ngắn.
 */
export function guessPickup(seq: readonly SeqItem[], bpb: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let phi = 0; phi < bpb - EPS; phi += 0.5) {
    let s = phi === 0 ? 1.5 : phi < bpb / 2 - EPS ? -0.5 : 0;
    let pos = phi;
    for (const it of seq) {
      if (!it.rest) {
        const inBar = pos % bpb;
        s += metricWeight(inBar, bpb) * Math.min(it.beats, 3);
        if (inBar + it.beats > bpb + EPS) s -= 1.5;
      }
      pos += it.beats;
    }
    if (s > bestScore + EPS) {
      bestScore = s;
      best = phi;
    }
  }
  return best;
}

/**
 * Chép nhạc: danh sách lần gõ → chuỗi nốt / dấu lặng + nhịp lấy đà. Không có lần gõ nào → seq rỗng.
 */
export function transcribe(events: readonly OnsetEvent[], o: TranscribeOptions): Transcription {
  const bpb = barBeats(o.timeSig);
  const { events: ev, dropped } = cleanEvents(events);
  const metro = o.metronome && o.metronome.bpm > 0 ? o.metronome : undefined;
  const beatSec = metro ? 60 / metro.bpm : estimateBeat(ev.map((e) => e.t));
  const base: Transcription = { seq: [], pickupRest: 0, beatSec, bpm: 60 / beatSec, tempo: metro ? 'metronome' : 'estimated', dropped };
  if (!ev.length) return base;
  const placed = metro ? placeWithGrid(ev, beatSec, metro.downbeat) : placeEstimated(ev, beatSec);

  const seq: SeqItem[] = [];
  placed.forEach((p, i) => {
    const next = placed[i + 1];
    let len: number;
    let note: number;
    if (next) {
      len = next.pos - p.pos;
      note = len;
      const off = p.e.off;
      if (off !== undefined && off > p.e.t && off < next.e.t - 0.03 && (next.e.t - off) / p.T >= REST_GAP) {
        // Nhả phím được nghe hơi muộn so với lúc nhả thật, và bé hay nhả sớm trước dấu lặng → làm tròn nhích lên
        note = Math.min(len - 0.5, Math.max(0.5, snap((off - p.e.t) / p.T + 0.2)));
      }
    } else {
      // Nốt cuối: tới lúc nhả phím (nếu nghe rõ), không thì ngân tới hết ô nhịp (tính sau khi biết vạch nhịp)
      const off = p.e.off;
      note = off !== undefined && off > p.e.t ? Math.max(0.5, snap((off - p.e.t) / p.T)) : -1;
      len = note;
    }
    // Nốt dài quá (> 4 phách) / độ dài không có hình nốt → nốt dài nhất ghi được + dấu lặng phần còn lại
    if (note > 0) {
      const v = NOTE_VALUES.find((x) => x <= note + EPS) ?? 0.5;
      seq.push({ midi: p.midi, beats: v, src: p.src });
      if (len - v > EPS) seq.push({ rest: true, beats: len - v });
    } else seq.push({ midi: p.midi, beats: -1, src: p.src });
  });

  let pickupRest: number;
  if (metro) {
    const first = placed[0].pos;
    pickupRest = first - Math.floor(first / bpb + EPS) * bpb + 0; // + 0: bỏ −0
  } else {
    // Nốt cuối chưa biết độ dài: tạm 1 phách để đoán lấy đà
    const tmp = seq.map((s) => (s.beats < 0 ? { ...s, beats: 1 } : s));
    pickupRest = guessPickup(tmp, bpb);
  }
  const last = seq[seq.length - 1];
  if (last.beats < 0) {
    const end = pickupRest + seq.slice(0, -1).reduce((s, x) => s + x.beats, 0);
    const room = bpb - (end % bpb);
    last.beats = NOTE_VALUES.find((x) => x <= room + EPS) ?? 0.5;
  }
  return { ...base, seq, pickupRest };
}

// ---------------- Chia ô nhịp → nốt của trình soạn ----------------

/**
 * Chuỗi nốt → nốt của trình soạn (SolfegeNote, KHÔNG gồm dấu lặng lấy đà — truyền `pickupRest` riêng cho
 * buildParentSong). Nốt vắt qua vạch nhịp bị cắt ở vạch, phần sau thành dấu lặng; độ dài không có hình nốt
 * (vd 2½ trong một ô) → nốt dài nhất ghi được + dấu lặng.
 */
export function layoutNotes(seq: readonly SeqItem[], pickupRest: number, bpb: number): SolfegeNote[] {
  const out: SolfegeNote[] = [];
  let pos = pickupRest;
  for (const it of seq) {
    let left = it.beats;
    let first = true;
    while (left > EPS) {
      const room = bpb - (pos % bpb);
      const piece = Math.min(left, room);
      if (!it.rest && first && it.midi !== undefined) {
        const v = [...NOTE_VALUES, 0.25].find((x) => x <= piece + EPS) ?? piece;
        out.push({ pitch: midiToPitch(it.midi), beats: v });
        if (piece - v > EPS) out.push(...restsFor(piece - v));
      } else out.push(...restsFor(piece));
      first = false;
      pos += piece;
      left -= piece;
    }
  }
  // Gộp dấu lặng liền nhau trong cùng ô cho gọn (vd ½ + ½ → 1)
  return mergeRests(out, pickupRest, bpb);
}

function mergeRests(notes: SolfegeNote[], pickupRest: number, bpb: number): SolfegeNote[] {
  const out: SolfegeNote[] = [];
  let pos = pickupRest;
  let run = 0;
  let runStart = 0;
  const flush = () => {
    if (run > EPS) out.push(...restsFor(run));
    run = 0;
  };
  for (const n of notes) {
    if (n.rest) {
      if (run > EPS && Math.floor(runStart / bpb + EPS) !== Math.floor(pos / bpb + EPS)) flush();
      if (run <= EPS) runStart = pos;
      run += n.beats;
    } else {
      flush();
      out.push(n);
    }
    pos += n.beats;
  }
  flush();
  return out;
}

/**
 * Chữ cho ô "Gõ chữ" của trình soạn: có vạch nhịp, xuống dòng mỗi 4 ô; nhịp lấy đà = ô đầu ngắn (bỏ dấu lặng lấy
 * đà ở đầu — trình soạn tự hiểu "ô đầu chỉ có N phách → nhịp lấy đà").
 */
export function toEditorText(notes: readonly SolfegeNote[], pickupRest: number, bpb: number): string {
  if (!notes.length) return '';
  const lead = pickupRest > EPS ? restsFor(pickupRest) : [];
  const text = notesToSolfege([...lead, ...notes], bpb);
  if (!lead.length) return text;
  const lines = text.split('\n');
  const words = lines[0].split(' ');
  lines[0] = words.slice(lead.length).join(' ');
  return lines.join('\n');
}

// ---------------- Thế tay 5 ngón & số ngón ----------------

const LETTERS = 'CDEFGAB';
const whiteToPitch = (w: number): Pitch => `${LETTERS[((w % 7) + 7) % 7]}${Math.floor(w / 7) - 1}`;

export interface HandPositionHint {
  hand: Hand;
  /** Phím trắng thấp nhất / cao nhất của thế tay (5 phím trắng liền nhau) */
  low: Pitch;
  high: Pitch;
  /** Phím đặt ngón cái (tay phải = low, tay trái = high) */
  thumb: Pitch;
  /** Số nốt nằm trong thế tay / tổng số nốt */
  inside: number;
  total: number;
  /** Chỉ số (trong mảng `notes` truyền vào) các nốt NGOÀI thế tay */
  outside: number[];
  /** Số ngón gợi ý cho từng phần tử của `notes` (dấu lặng → undefined) — autoFinger, đúng như bài sẽ lưu */
  fingers: Array<number | undefined>;
}

/** Thế tay 5 ngón chứa nhiều nốt nhất (ưu tiên chứa nốt đầu, thế Đô / Sol) + số ngón + nốt ngoài thế tay. */
export function suggestHandPosition(notes: readonly SolfegeNote[]): HandPositionHint | null {
  const idx = notes.map((n, i) => (n.rest || !n.pitch ? -1 : i)).filter((i) => i >= 0);
  if (!idx.length) return null;
  const hand = guessHand(notes);
  const wp = idx.map((i) => whitePos(notes[i].pitch!));
  const lo = Math.floor(Math.min(...wp));
  const hi = Math.ceil(Math.max(...wp));
  let bestW = lo;
  let best = -Infinity;
  for (let w0 = lo - 4; w0 <= hi; w0++) {
    const inside = wp.filter((x) => x >= w0 - EPS && x <= w0 + 4 + EPS).length;
    if (!inside) continue;
    const firstIn = wp[0] >= w0 - EPS && wp[0] <= w0 + 4 + EPS;
    const thumbW = hand === 'RH' ? w0 : w0 + 4;
    const letter = LETTERS[((thumbW % 7) + 7) % 7];
    const score = inside * 10 + (firstIn ? 3 : 0) + (letter === 'C' ? 1.5 : letter === 'G' ? 1 : letter === 'F' || letter === 'D' ? 0.5 : 0);
    if (score > best) {
      best = score;
      bestW = w0;
    }
  }
  const outside = idx.filter((_, k) => wp[k] < bestW - EPS || wp[k] > bestW + 4 + EPS);
  return {
    hand,
    low: whiteToPitch(bestW),
    high: whiteToPitch(bestW + 4),
    thumb: whiteToPitch(hand === 'RH' ? bestW : bestW + 4),
    inside: idx.length - outside.length,
    total: idx.length,
    outside,
    fingers: autoFinger(notes, hand),
  };
}

// ---------------- Thu nhận từ micro (dùng chung cho màn ghi & test mô phỏng) ----------------

/**
 * Gom sự kiện micro thành danh sách lần gõ: `note()` mỗi nốt micro nghe ra (at = lúc gõ), `frame()` mỗi khung
 * (âm lượng sau lọc + ngưỡng, CÙNG đồng hồ với `at`) để biết:
 * - lúc NHẢ PHÍM: tiếng tắt nhanh (giảm ≥ 5 lần trong ~0,2 s, xuống dưới ngưỡng, sau
 *   tiếng búa, và tắt hẳn thêm 0,15 s) — dây đàn tự tắt dần chậm thì không tính;
 * - lần gõ "ma": dây đàn đang ngân CÙNG nốt mà tiếng to lên chút ít (dây lệch nhau → tiếng rung) bị micro tưởng là
 *   gõ lại → bỏ nếu âm lượng không bật lên rõ (< 2,2 lần) và nốt trước chưa nhả;
 * - lúc im lặng (màn ghi tự dừng sau 2 giây).
 */
export class OnsetCollector {
  readonly events: OnsetEvent[] = [];
  /** Lần cuối có tiếng (≥ ngưỡng) hoặc nghe ra nốt */
  lastSound = -Infinity;
  /** Số lần gõ "ma" đã bỏ */
  ghosts = 0;
  private hist: Array<{ t: number; rms: number }> = [];
  private released = true;
  private pending: { off: number; since: number } | null = null;

  /** `at` = lúc gõ (cùng đồng hồ với frame) */
  note(midi: number, at: number): boolean {
    const prev = this.events[this.events.length - 1];
    if (prev && prev.midi === midi && prev.off === undefined && at - prev.t > MERGE_S) {
      let pre = Infinity;
      let post = 0;
      for (const h of this.hist) {
        if (h.t >= at - 0.2 && h.t <= at - 0.02) pre = Math.min(pre, h.rms);
        if (h.t >= at - 0.02) post = Math.max(post, h.rms);
      }
      if (Number.isFinite(pre) && pre > 0 && post < pre * 2.2) {
        this.ghosts++;
        return false;
      }
    }
    this.events.push({ t: at, midi });
    this.released = false;
    this.pending = null;
    this.lastSound = Math.max(this.lastSound, at);
    return true;
  }

  frame(t: number, rms: number, gate: number): void {
    this.hist.push({ t, rms });
    while (this.hist.length && this.hist[0].t < t - 1) this.hist.shift();
    if (rms >= gate) this.lastSound = t;
    const last = this.events[this.events.length - 1];
    if (!last || this.released) return;
    // Đang chờ xác nhận nhả phím: tiếng phải tắt HẲN thêm 0,15 s (dây lệch nhau làm tiếng "rung", có lúc tụt sâu)
    if (this.pending) {
      if (rms >= gate * 0.8) this.pending = null;
      else if (t - this.pending.since >= 0.15) {
        last.off = this.pending.off;
        this.released = true;
        this.pending = null;
      }
      return;
    }
    if (rms >= gate) return;
    // Khung 0,2–0,25 s trước, nhưng sau tiếng búa (≥ 0,2 s sau lúc gõ)
    let past: { t: number; rms: number } | undefined;
    for (const h of this.hist) {
      if (h.t >= t - 0.25 && h.t >= last.t + 0.2) {
        past = h;
        break;
      }
    }
    // (Chỉ tin tiếng tắt RẤT nhanh: nốt giữ phím mà khẽ / phòng ồn cũng chìm vào nền ồn khá nhanh — dấu lặng sai còn
    // khó sửa hơn nốt dài thêm; bố mẹ sửa được ở bước xem lại.)
    if (past && t - past.t >= 0.15 && past.rms >= rms * 5) {
      // Tiếng tắt nhanh = nhả phím; lúc nhả ≈ khung cuối còn to gấp đôi bây giờ
      let off = past.t;
      for (const h of this.hist) if (h.t > past.t && h.rms >= rms * 2) off = h.t;
      this.pending = { off: Math.max(last.t + 0.05, off), since: t };
    }
  }

  /** Đã im lặng bao lâu (giây) tính tới `t` — chỉ tính sau khi đã có ít nhất một nốt. */
  silentFor(t: number): number {
    return this.events.length ? t - this.lastSound : 0;
  }
}
