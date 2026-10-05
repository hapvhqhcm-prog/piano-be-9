import { DEFAULT_DETECT, NoteTracker, detectPitch, type DetectOptions, type HeardNote, type PitchResult } from './pitchDetect';

/**
 * Bộ phân tích micro THUẦN (không phụ thuộc Web Audio) — MicListener gọi mỗi khung;
 * test giả lập đàn cơ cũng gọi y hệt → đo được độ chính xác thật của toàn bộ đường xử lý.
 *
 * ĐO ĐẠC 2026-10-04 (tests/micBench.test.ts) — những gì làm micro "không hiệu quả" trên đàn cơ thật:
 * 1. Ngưỡng im lặng cố định 0,01: đàn nhẹ / micro xa → tiếng tới micro nhỏ hơn ngưỡng → bỏ qua cả nốt.
 *    → ngưỡng TỰ THÍCH NGHI theo tiếng ồn nền của phòng + độ nhạy chỉnh được.
 * 2. Tiếng ồn phòng (quạt, điều hòa, xì micro) trải tới 24 kHz, nốt của giáo trình < 1,4 kHz
 *    → LỌC THÔNG THẤP trước khi phân tích (tín hiệu nổi hơn ồn ~10 dB).
 * 3. Bắt "gõ phím" so với khung NGAY TRƯỚC: bước 25 ms thì tiếng búa trải 2 khung, mỗi khung chỉ tăng ×1,3
 *    → nốt lặp / đàn nhanh bị nuốt. Giờ so với mức THẤP NHẤT ~3 khung gần đây.
 * 4. App vừa đàn mẫu xong, bé nhại lại NGAY (trong lúc micro còn chờ tiếng app tắt hẳn) → lần gõ đó bị bỏ,
 *    bộ lọc chờ lần gõ mới mãi → nốt không bao giờ được nhận. Giờ lần gõ trong lúc "tiếng app đang tắt dần" được nhớ lại.
 *
 * 2026-10-05 (rà soát kỹ thuật):
 * 5. Lọc thông thấp BẬC 4 (2 biquad nối tiếp, 1,6 kHz): tiếng tích máy đếm nhịp (≥ 5 kHz, xem AudioEngine.CLICK)
 *    bị chặn > 40 dB → KHÔNG cần bịt tai micro quanh tiếng tích nữa (trước đây bỏ cả khung 90 ms).
 * 6. Sau lọc, GIẢM MẪU ×2 (48 → 24 kHz) rồi mới chạy YIN → nhanh ~4 lần (iPad A9/A10 từng tốn ~10 ms/khung).
 *    Không cấp phát bộ nhớ mỗi khung; không cần cao độ (chỉ chấm vỗ nhịp) thì bỏ hẳn YIN.
 * 7. Mức ồn nền chỉ được NÂNG lên ở khung "không có tiếng đàn" (không cao độ rõ, không gõ) và có trần
 *    → nốt ngân dài (> 10 s) không còn bị coi dần thành tiếng ồn rồi bị cắt.
 * 8. Mốc GÕ PHÍM được định vị trong khung 2048 mẫu (năng lượng bật lên ở khối 64 mẫu nào) thay vì lấy giờ của khung.
 */

/**
 * quiet = app im; tail = app vừa im (tiếng vang còn) → chưa nghe cao độ nhưng nhớ lần gõ; sounding = app đang phát;
 * click = bỏ qua HẲN khung này (không đổi trạng thái). Từ khi có lọc bậc 4 + tiếng tích ≥ 5 kHz, MicListener
 * không còn đánh dấu 'click' (giữ lại cho trường hợp cần bịt tai thủ công).
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
  /** Thời điểm ước tính của lần gõ (cùng đồng hồ với `t`); −1 nếu khung này không có lần gõ */
  onsetAt: number;
}

/** Độ nhạy: hệ số nhân với mức ồn nền (thấp = cần tiếng to hơn mới nhận). */
export const SENSITIVITY = { low: 5, normal: 3, high: 2 } as const;
export type Sensitivity = keyof typeof SENSITIVITY;

/** Tần số cắt của MỖI tầng lọc (2 tầng nối tiếp → −6 dB ở đây, −3,3 dB ở Mi6 = 1319 Hz). */
export const LOWPASS_HZ = 1600;
/** Hệ số giảm mẫu trước YIN. */
export const DECIMATE = 2;
const ONSET_RATIO = 1.5;
/** Mức ồn nền tăng tối đa bao nhiêu mỗi khung (tỉ lệ), và trần tuyệt đối. */
const FLOOR_RISE = 0.002;
export const FLOOR_MAX = 0.03;
/** Khối năng lượng để định vị lần gõ trong khung (64 mẫu ≈ 1,3 ms). */
const ONSET_BLOCK = 64;

interface Biquad {
  sr: number;
  b0: number;
  b1: number;
  a1: number;
  a2: number;
}
let coef: Biquad = { sr: 0, b0: 0, b1: 0, a1: 0, a2: 0 };

/** Hệ số biquad thông thấp Butterworth (Q = 1/√2) — tính một lần cho mỗi tần số lấy mẫu. */
function biquad(sampleRate: number): Biquad {
  if (coef.sr === sampleRate) return coef;
  const w = (2 * Math.PI * LOWPASS_HZ) / sampleRate;
  const cw = Math.cos(w);
  const alpha = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + alpha;
  coef = { sr: sampleRate, b0: (1 - cw) / 2 / a0, b1: (1 - cw) / a0, a1: (-2 * cw) / a0, a2: (1 - alpha) / a0 };
  return coef;
}

/**
 * Lọc thông thấp bậc 4 (2 biquad nối tiếp) — mỗi khung lọc độc lập; trả về tổng bình phương (để tính RMS).
 * Trạng thái đầu = mẫu đầu tiên (coi như đã ổn định) để không có "cú giật" ở đầu khung.
 */
export function lowpass(buf: Float32Array, sampleRate: number, out: Float32Array): number {
  const { b0, b1, a1, a2 } = biquad(sampleRate);
  const x0 = buf.length ? buf[0] : 0;
  let x1 = x0;
  let x2 = x0;
  let y1 = x0;
  let y2 = x0;
  let z1 = x0;
  let z2 = x0;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    const z = b0 * y + b1 * y1 + b0 * y2 - a1 * z1 - a2 * z2;
    out[i] = z;
    sum += z * z;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    z2 = z1;
    z1 = z;
  }
  return sum;
}

export class MicAnalyzer {
  readonly tracker = new NoteTracker();
  /** RMS 3 khung gần nhất (vòng tròn, không cấp phát) */
  private recent = new Float64Array(3);
  private recentN = 0;
  private recentI = 0;
  /** Thời điểm ước tính lần gõ gần nhất (để chấm nhịp) */
  private lastOnsetAt = -1;
  /** Khung phát hiện lần gõ gần nhất (để giãn cách, tránh một lần gõ đếm hai lần) */
  private lastOnsetFrame = -1;
  private floor = -1;
  private filtered = new Float32Array(0);
  private decimated = new Float32Array(0);
  private energies = new Float32Array(0);
  private pendingOnset = false;
  /** Lúc bắt đầu chuỗi khung có tiếng tích (−1 = không có) */
  private clickFrom = -1;
  /** Tùy chọn YIN cho tín hiệu đã lọc (minRms = 0 vì đã có ngưỡng thích nghi) — tính lại khi `detect` đổi */
  private detectFor: DetectOptions | null = null;
  private detectNoGate: DetectOptions = DEFAULT_DETECT;
  tuningCents = 0;
  sensitivity: Sensitivity = 'normal';

  constructor(public detect: DetectOptions = DEFAULT_DETECT) {}

  /** Ngưỡng "có tiếng đàn" hiện tại. */
  gate(): number {
    return Math.max(0.0008, (this.floor < 0 ? 0.002 : this.floor) * SENSITIVITY[this.sensitivity]);
  }

  private result(
    pitch: PitchResult | null,
    level: number,
    rms: number,
    gate: number,
    note: HeardNote | null,
    onset: boolean,
    onsetAt: number,
  ): FrameResult {
    return { pitch, level, rms, floor: this.floor, gate, note, onset, onsetAt };
  }

  /**
   * Định vị lần gõ trong khung: khối 64 mẫu đầu tiên của đoạn "bật lên" dẫn tới khối to nhất.
   * Trả về thời điểm (giây) theo đồng hồ của `t` (= thời điểm mẫu CUỐI của khung).
   */
  private locateOnset(x: Float32Array, sampleRate: number, t: number): number {
    const nb = Math.floor(x.length / ONSET_BLOCK);
    if (nb < 2) return t - 0.015;
    if (this.energies.length !== nb) this.energies = new Float32Array(nb);
    const e = this.energies;
    let emax = 0;
    let kmax = 0;
    for (let k = 0; k < nb; k++) {
      let s = 0;
      for (let i = k * ONSET_BLOCK, end = i + ONSET_BLOCK; i < end; i++) s += x[i] * x[i];
      e[k] = s;
      if (s > emax) {
        emax = s;
        kmax = k;
      }
    }
    let base = emax;
    for (let k = 0; k <= kmax; k++) if (e[k] < base) base = e[k];
    const th = base + 0.1 * (emax - base);
    // Khối 64 mẫu ngắn hơn 1 chu kỳ nốt trầm → năng lượng từng khối dao động theo pha. Đi lùi từ khối to nhất,
    // cho phép "hở" tới ~8 ms (≥ 1 chu kỳ của Sol2) giữa các khối vượt ngưỡng.
    const gap = Math.ceil((0.008 * sampleRate) / ONSET_BLOCK);
    let j = kmax;
    for (let k = kmax - 1; k >= 0 && j - k <= gap; k--) if (e[k] > th) j = k;
    const offset = x.length - j * ONSET_BLOCK;
    return t - offset / sampleRate;
  }

  /**
   * @param buf       khung tín hiệu (2048 mẫu gần nhất)
   * @param t         thời điểm (giây) của mẫu cuối khung — để giãn cách các lần "gõ"
   * @param app       app đang phát tiếng không (đang phát thì bỏ qua cao độ để khỏi tự nghe mình)
   * @param needPitch false = chỉ cần "gõ/vỗ" (chấm vỗ nhịp) → bỏ YIN (đỡ CPU), không báo nốt
   */
  process(buf: Float32Array, sampleRate: number, t: number, app: AppSound = 'quiet', needPitch = true): FrameResult {
    if (app === 'click') {
      if (this.clickFrom < 0) this.clickFrom = t;
      return this.result(null, 0, 0, this.gate(), null, false, -1);
    }
    if (this.filtered.length !== buf.length) this.filtered = new Float32Array(buf.length);
    const x = this.filtered;
    const sum = lowpass(buf, sampleRate, x);
    let level = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] < 0 ? -buf[i] : buf[i];
      if (v > level) level = v;
    }
    const r = Math.sqrt(sum / buf.length);
    if (this.floor < 0) this.floor = r;
    const gate = this.gate();
    // "Gõ" (đánh phím / vỗ tay): vượt ngưỡng và tăng vọt so với mức thấp nhất ~3 khung gần đây
    let base = r;
    for (let i = 0; i < this.recentN; i++) if (this.recent[i] < base) base = this.recent[i];
    let onset = r > gate * 1.5 && r > base * ONSET_RATIO && t - this.lastOnsetFrame > 0.09;
    let onsetAt = -1;
    if (onset) {
      this.lastOnsetFrame = t;
      // Gõ phím trùng lúc micro bị bịt tai (app === 'click') chỉ lộ ra sau đó → lấy mốc lúc bắt đầu bịt
      const clickFrom = this.clickFrom;
      onsetAt = clickFrom >= 0 && t - clickFrom < 0.2 ? clickFrom + 0.01 : this.locateOnset(x, sampleRate, t);
      this.lastOnsetAt = onsetAt;
    }
    this.clickFrom = -1;
    this.recent[this.recentI] = r;
    this.recentI = (this.recentI + 1) % this.recent.length;
    if (this.recentN < this.recent.length) this.recentN++;

    if (app !== 'quiet') {
      this.updateFloor(r, false);
      this.tracker.reset(true);
      // Gõ phím trong lúc tiếng app đang tắt dần = bé đã đàn → nhớ lại; lúc app đang phát thì không tin
      this.pendingOnset = app === 'tail' && (this.pendingOnset || onset);
      return this.result(null, level, r, gate, null, onset, onsetAt);
    }
    if (this.pendingOnset) {
      onset = true;
      this.pendingOnset = false;
    }
    if (!needPitch) {
      // Chỉ chấm vỗ nhịp: không biết khung có cao độ không → chỉ cho ồn nền tăng khi đã lâu không có tiếng gõ
      this.updateFloor(r, !onset && t - this.lastOnsetFrame > 1);
      return this.result(null, level, r, gate, null, onset, onsetAt);
    }
    let pitch: PitchResult | null = null;
    if (r >= gate) {
      // Sau lọc bậc 4 hầu như không còn gì trên ~4 kHz → giảm mẫu ×2 rồi mới chạy YIN (nhanh ~4 lần)
      const n = Math.floor(x.length / DECIMATE);
      if (this.decimated.length !== n) this.decimated = new Float32Array(n);
      const d = this.decimated;
      for (let i = 0, j = DECIMATE - 1; i < n; i++, j += DECIMATE) d[i] = x[j];
      if (this.detectFor !== this.detect) {
        this.detectFor = this.detect;
        this.detectNoGate = { ...this.detect, minRms: 0 };
      }
      pitch = detectPitch(d, sampleRate / DECIMATE, this.detectNoGate);
      // rms của khung đã lọc (giống trước khi giảm mẫu)
      if (pitch) pitch.rms = r;
    }
    // Khung có cao độ rõ hoặc có lần gõ = tiếng đàn → KHÔNG được coi là ồn nền
    this.updateFloor(r, !onset && !(pitch && pitch.clarity >= 0.5));
    const note = this.tracker.push(pitch, this.tuningCents, onset, r, gate);
    if (note) note.at = this.lastOnsetAt >= 0 && t - this.lastOnsetAt < 0.5 ? this.lastOnsetAt : t - 0.07;
    return this.result(pitch, level, r, gate, note, onset, onsetAt);
  }

  /** Mức ồn nền: theo xuống NHANH khi phòng im; lên RẤT CHẬM và chỉ ở khung không có tiếng đàn; có trần. */
  private updateFloor(r: number, mayRise: boolean): void {
    if (r < this.floor) this.floor += (r - this.floor) * 0.5;
    else if (mayRise) this.floor = Math.min(FLOOR_MAX, this.floor + (r - this.floor) * FLOOR_RISE);
  }

  reset(requireOnset = true): void {
    this.pendingOnset = false;
    this.tracker.reset(requireOnset);
  }
}
