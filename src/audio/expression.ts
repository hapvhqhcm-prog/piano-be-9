/**
 * SẮC THÁI & KIỂU ĐÀN qua micro — hàm THUẦN (không DOM, không Web Audio) để test được với đàn giả lập.
 * Đầu vào: chuỗi khung micro {t, rms, onset, floor} (MicListener.onFrame, ~25 ms/khung).
 *
 * - To / nhỏ: đo ĐỈNH âm lượng ngay sau mỗi lần gõ phím, so với tiếng "vừa" của CHÍNH bé (đo lúc đầu trò chơi)
 *   → không phụ thuộc micro xa/gần, phòng to/nhỏ.
 * - Ngắt / liền: đàn cơ GIỮ phím → tiếng tắt dần chậm; NHẢ phím → bộ giảm âm (damper) dập tiếng trong ~0,1 s.
 *   → đo tiếng CÒN LẠI bao nhiêu sau lần gõ 0,25 s (so với đỉnh, đã trừ ồn nền) và giữa hai nốt tiếng có tắt hẳn không.
 *
 * Ngưỡng đo trên tests/pianoSim.ts (dây đôi/ba, vang phòng 0,6, ồn 0,006) — xem tests/expression.test.ts.
 */

export interface ExprFrame {
  /** giây */
  t: number;
  /** âm lượng sau lọc (MicFrame.rms) */
  rms: number;
  /** có lần gõ phím ở khung này */
  onset: boolean;
  /** mức ồn nền ước tính (MicFrame.floor) — không có thì tự ước từ các khung im nhất */
  floor?: number;
}

export const EXPR = {
  /** Tìm đỉnh trong 300 ms sau lần gõ */
  PEAK_WINDOW: 0.3,
  /** Hai lần gõ gần hơn thế = một lần (tiếng búa trải 2 khung) */
  MERGE: 0.12,
  /** To: đỉnh ≥ tiếng vừa × 1,5 · Nhỏ: đỉnh ≤ tiếng vừa ÷ 1,5 */
  LOUD_RATIO: 1.5,
  /** Đo tiếng còn lại ở 0,25 s sau lần gõ */
  KEEP_AT: 0.25,
  /** Ngắt: tiếng còn lại (trung vị) ≤ 22% đỉnh */
  STAC_MAX_KEEP: 0.22,
  /** Liền: tiếng còn lại (trung vị) ≥ 26% đỉnh */
  LEG_MIN_KEEP: 0.26,
  /** Chỗ nối "hở": trước nốt sau, tiếng tụt dưới 5% đỉnh (đã trừ ồn) — chỉ xét khi hai nốt cách nhau ≤ 0,5 s
   *  (đàn chậm hơn thì nốt giữ phím cũng tự tắt gần hết → không phân biệt được, chỉ dựa vào tiếng còn lại) */
  GAP_DIP: 0.05,
  GAP_CHECK_SPAN: 0.5,
} as const;

export interface NoteShape {
  /** lúc gõ (giây) */
  at: number;
  /** đỉnh âm lượng trong PEAK_WINDOW (đã trừ ồn nền) */
  peak: number;
  /** tiếng còn lại sau KEEP_AT (tỉ lệ so với đỉnh, đã trừ ồn); null = nốt sau tới quá sớm, không đo được */
  keep: number | null;
  /** mức thấp nhất trước nốt sau (tỉ lệ so với đỉnh, đã trừ ồn); null = nốt cuối */
  dip: number | null;
  /** khoảng cách tới nốt sau (giây); Infinity = nốt cuối */
  span: number;
}

/** Các lần gõ (đã gộp lần gõ trùng). */
export function onsetTimes(frames: ExprFrame[]): number[] {
  const out: number[] = [];
  for (const f of frames) {
    if (!f.onset) continue;
    if (out.length && f.t - out[out.length - 1] < EXPR.MERGE) continue;
    out.push(f.t);
  }
  return out;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Mức ồn nền: trung vị `floor` của bộ phân tích; không có thì lấy khung im thứ 10%. */
export function noiseLevel(frames: ExprFrame[]): number {
  const fl = frames.map((f) => f.floor).filter((x): x is number => typeof x === 'number' && x > 0);
  if (fl.length) return median(fl);
  const r = frames.map((f) => f.rms).sort((a, b) => a - b);
  return r.length ? r[Math.floor(r.length * 0.1)] : 0;
}

/** Âm lượng đã trừ ồn nền (cộng theo năng lượng) — tỉ lệ so với đỉnh. */
function rel(rms: number, peak: number, noise: number): number {
  const p = peak * peak - noise * noise;
  if (p <= 0) return 0;
  return Math.sqrt(Math.max(0, rms * rms - noise * noise) / p);
}

/** Đặc điểm từng nốt: đỉnh, tiếng còn lại, chỗ hở. */
export function noteShapes(frames: ExprFrame[]): NoteShape[] {
  const ons = onsetTimes(frames);
  const end = frames.length ? frames[frames.length - 1].t : 0;
  const noise = noiseLevel(frames);
  return ons.map((at, i) => {
    const next = i + 1 < ons.length ? ons[i + 1] : Infinity;
    const stop = Math.min(next, end + 1e-9);
    // từ ngay trước lần gõ (tiếng búa có thể lộ sớm 1 khung) tới lần gõ sau
    const mine = frames.filter((f) => f.t >= at - 0.03 && f.t < stop - 1e-9);
    let peak = 0;
    let peakT = at;
    for (const f of mine) {
      if (f.t > at + EXPR.PEAK_WINDOW) break;
      if (f.rms > peak) {
        peak = f.rms;
        peakT = f.t;
      }
    }
    // tiếng còn lại: trung bình các khung quanh at + KEEP_AT (bỏ khung sát nốt sau — tiếng búa nốt mới lấn vào)
    const around = mine.filter((f) => Math.abs(f.t - at - EXPR.KEEP_AT) <= 0.03 && f.t < stop - 0.03);
    const keep = around.length ? rel(around.reduce((s, f) => s + f.rms, 0) / around.length, peak, noise) : null;
    let dip: number | null = null;
    if (next !== Infinity) {
      const tail = mine.filter((f) => f.t > peakT && f.t < stop - 0.03);
      dip = tail.length ? Math.min(...tail.map((f) => rel(f.rms, peak, noise))) : 1;
    }
    // đỉnh đã trừ ồn nền: đàn nhỏ ở phòng ồn không bị "cộng thêm" tiếng ồn
    return { at, peak: Math.sqrt(Math.max(0, peak * peak - noise * noise)), keep, dip, span: next - at };
  });
}

/** Tiếng "vừa" chuẩn của bé: trung vị đỉnh các lần gõ lúc đo. */
export function referenceLevel(peaks: number[]): number {
  return median(peaks.filter((p) => p > 0));
}

export type LoudVerdict = 'f' | 'p' | 'mf';

export interface LoudResult {
  ok: boolean;
  /** đỉnh (trung vị) ÷ tiếng vừa; 0 = không nghe thấy */
  ratio: number;
  heard: LoudVerdict;
}

/** Chấm TO / NHỎ so với tiếng vừa của bé. */
export function judgeLoudness(peaks: number[], ref: number, want: 'p' | 'f'): LoudResult {
  const p = median(peaks.filter((x) => x > 0));
  const ratio = ref > 0 && p > 0 ? p / ref : 0;
  const heard: LoudVerdict = ratio >= EXPR.LOUD_RATIO ? 'f' : ratio > 0 && ratio <= 1 / EXPR.LOUD_RATIO ? 'p' : 'mf';
  return { ok: ratio > 0 && heard === want, ratio, heard };
}

export type ArtVerdict = 'stac' | 'leg' | 'unclear';

export interface ArtResult {
  ok: boolean;
  heard: ArtVerdict;
  /** tiếng còn lại trung vị (0–1) */
  keep: number;
  /** số chỗ nối bị hở (chỉ tính chỗ nối gần) */
  gaps: number;
  notes: number;
}

/**
 * Chấm NGẮT / LIỀN.
 * Ngắt: tiếng còn lại sau 0,25 s (trung vị) ≤ 22% đỉnh.
 * Liền: ít nhất 2 nốt; tiếng còn lại ≥ 26% đỉnh và không chỗ nối gần nào bị hở.
 */
export function judgeArticulation(shapes: NoteShape[], want: 'stac' | 'leg'): ArtResult {
  const notes = shapes.length;
  const keeps = shapes.map((s) => s.keep).filter((k): k is number => k !== null);
  const keep = median(keeps);
  const gaps = shapes.filter((s) => s.dip !== null && s.span <= EXPR.GAP_CHECK_SPAN && s.dip < EXPR.GAP_DIP).length;
  let heard: ArtVerdict = 'unclear';
  if (keeps.length && keep <= EXPR.STAC_MAX_KEEP) heard = 'stac';
  else if (notes >= 2 && keeps.length && keep >= EXPR.LEG_MIN_KEEP && gaps === 0) heard = 'leg';
  return { ok: heard === want, heard, keep, gaps, notes };
}
