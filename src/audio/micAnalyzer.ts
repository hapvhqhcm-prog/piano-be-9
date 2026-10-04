import { DEFAULT_DETECT, NoteTracker, detectPitch, type DetectOptions, type HeardNote, type PitchResult } from './pitchDetect';

/**
 * Bộ phân tích micro THUẦN (không phụ thuộc Web Audio) — MicListener gọi mỗi khung;
 * test giả lập đàn cơ cũng gọi y hệt → đo được độ chính xác thật của toàn bộ đường xử lý.
 *
 * ĐO ĐẠC 2026-10-04 (tests/micBench.test.ts) — những gì làm micro "không hiệu quả" trên đàn cơ thật:
 * 1. Ngưỡng im lặng cố định 0,01: đàn nhẹ / micro xa → tiếng tới micro nhỏ hơn ngưỡng → bỏ qua cả nốt.
 *    → ngưỡng TỰ THÍCH NGHI theo tiếng ồn nền của phòng + độ nhạy chỉnh được.
 * 2. Tiếng ồn phòng (quạt, điều hòa, xì micro) trải tới 24 kHz, nốt của giáo trình < 1,4 kHz
 *    → LỌC THÔNG THẤP ~1,8 kHz trước khi phân tích (tín hiệu nổi hơn ồn ~10 dB).
 * 3. Bắt "gõ phím" so với khung NGAY TRƯỚC: bước 25 ms thì tiếng búa trải 2 khung, mỗi khung chỉ tăng ×1,3
 *    → nốt lặp / đàn nhanh bị nuốt. Giờ so với mức THẤP NHẤT ~3 khung gần đây.
 * 4. App vừa đàn mẫu xong, bé nhại lại NGAY (trong lúc micro còn chờ tiếng app tắt hẳn) → lần gõ đó bị bỏ,
 *    bộ lọc chờ lần gõ mới mãi → nốt không bao giờ được nhận. Giờ lần gõ trong lúc "tiếng app đang tắt dần" được nhớ lại.
 */

/**
 * quiet = app im; tail = app vừa im (tiếng vang còn) → chưa nghe cao độ nhưng nhớ lần gõ; sounding = app đang phát;
 * click = đang có tiếng tích máy đếm nhịp → bỏ qua HẲN khung này (không đổi trạng thái), vì tiếng tích lọt qua bộ lọc
 * và từng bị nghe thành nốt Sol cao / làm mất lần gõ phím đúng phách của bé.
 */
export type AppSound = 'quiet' | 'tail' | 'sounding' | 'click';
export interface FrameResult {
  pitch: PitchResult | null;
  /** Biên độ đỉnh (tín hiệu thô) */
  level: number;
  /** Âm lượng sau lọc */
  rms: number;
  /** Mức ồn nền ước tính của phòng */
  floor: number;
  /** Ngưỡng "có tiếng đàn" hiện tại */
  gate: number;
  note: HeardNote | null;
  onset: boolean;
}

/** Độ nhạy: hệ số nhân với mức ồn nền (thấp = cần tiếng to hơn mới nhận). */
export const SENSITIVITY = { low: 5, normal: 3, high: 2 } as const;
export type Sensitivity = keyof typeof SENSITIVITY;

const LOWPASS_HZ = 1800;
const ONSET_RATIO = 1.5;

/** Lọc thông thấp Butterworth bậc 2 (biquad) — mỗi khung lọc độc lập. */
function lowpass(buf: Float32Array, sampleRate: number, out: Float32Array): void {
  const w = (2 * Math.PI * LOWPASS_HZ) / sampleRate;
  const cw = Math.cos(w);
  const alpha = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b0 = (1 - cw) / 2 / a0;
  const b1 = (1 - cw) / a0;
  const a1 = (-2 * cw) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = buf[0];
  let x2 = buf[0];
  let y1 = buf[0];
  let y2 = buf[0];
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
}

export class MicAnalyzer {
  readonly tracker = new NoteTracker();
  private recent: number[] = [];
  /** Thời điểm ước tính lần gõ gần nhất (để chấm nhịp) */
  private lastOnsetAt = -1;
  /** Khung phát hiện lần gõ gần nhất (để giãn cách, tránh một lần gõ đếm hai lần) */
  private lastOnsetFrame = -1;
  private floor = -1;
  private filtered = new Float32Array(0);
  private pendingOnset = false;
  /** Lúc bắt đầu chuỗi khung có tiếng tích (−1 = không có) */
  private clickFrom = -1;
  tuningCents = 0;
  sensitivity: Sensitivity = 'normal';

  constructor(public detect: DetectOptions = DEFAULT_DETECT) {}

  /** Ngưỡng "có tiếng đàn" hiện tại. */
  gate(): number {
    return Math.max(0.0008, (this.floor < 0 ? 0.002 : this.floor) * SENSITIVITY[this.sensitivity]);
  }

  /**
   * @param buf      khung tín hiệu (2048 mẫu gần nhất)
   * @param t        thời điểm (giây) — để giãn cách các lần "gõ"
   * @param app      app đang phát tiếng không (đang phát thì bỏ qua cao độ để khỏi tự nghe mình)
   */
  process(buf: Float32Array, sampleRate: number, t: number, app: AppSound = 'quiet'): FrameResult {
    if (app === 'click') {
      if (this.clickFrom < 0) this.clickFrom = t;
      return { pitch: null, level: 0, rms: 0, floor: this.floor, gate: this.gate(), note: null, onset: false };
    }
    if (this.filtered.length !== buf.length) this.filtered = new Float32Array(buf.length);
    const x = this.filtered;
    lowpass(buf, sampleRate, x);
    let level = 0;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i]);
      if (v > level) level = v;
      sum += x[i] * x[i];
    }
    const r = Math.sqrt(sum / buf.length);
    // Mức ồn nền: theo xuống NHANH khi phòng im, lên RẤT CHẬM (để tiếng đàn kéo dài không bị coi là ồn)
    if (this.floor < 0) this.floor = r;
    else if (r < this.floor) this.floor += (r - this.floor) * 0.5;
    else this.floor += (r - this.floor) * 0.002;
    const gate = this.gate();
    // "Gõ" (đánh phím / vỗ tay): vượt ngưỡng và tăng vọt so với mức thấp nhất ~3 khung gần đây
    const base = this.recent.length ? Math.min(...this.recent) : r;
    let onset = r > gate * 1.5 && r > base * ONSET_RATIO && t - this.lastOnsetFrame > 0.09;
    if (onset) {
      this.lastOnsetFrame = t;
      // Gõ phím trùng tiếng tích (đúng phách!) chỉ lộ ra khi hết tiếng tích → lấy mốc lúc tiếng tích bắt đầu
      const clickFrom = this.clickFrom;
      this.lastOnsetAt = clickFrom >= 0 && t - clickFrom < 0.2 ? clickFrom + 0.01 : t - 0.015;
    }
    this.clickFrom = -1;
    this.recent.push(r);
    if (this.recent.length > 3) this.recent.shift();
    if (app !== 'quiet') {
      this.tracker.reset(true);
      // Gõ phím trong lúc tiếng app đang tắt dần = bé đã đàn → nhớ lại; lúc app đang phát thì không tin
      this.pendingOnset = app === 'tail' && (this.pendingOnset || onset);
      return { pitch: null, level, rms: r, floor: this.floor, gate, note: null, onset };
    }
    if (this.pendingOnset) {
      onset = true;
      this.pendingOnset = false;
    }
    const pitch = r >= gate ? detectPitch(x, sampleRate, { ...this.detect, minRms: 0 }) : null;
    const note = this.tracker.push(pitch, this.tuningCents, onset, r, gate);
    if (note) note.at = this.lastOnsetAt >= 0 && t - this.lastOnsetAt < 0.5 ? this.lastOnsetAt : t - 0.07;
    return { pitch, level, rms: r, floor: this.floor, gate, note, onset };
  }

  reset(requireOnset = true): void {
    this.pendingOnset = false;
    this.tracker.reset(requireOnset);
  }
}
