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
 *
 * 2026-10-06 (OWNER: "iPad đã nghe được nhưng chưa tốt lắm"):
 * 9. iOS vừa mở micro thường trả vài trăm ms toàn số 0 → mức ồn nền bị khởi tạo ≈ 0, rồi chỉ lên RẤT chậm (τ ≈ 12 s)
 *    → ngưỡng quá thấp lúc đầu (tiếng ồn lọt qua, nốt "thừa"). Giờ: khung toàn 0 không dùng để khởi tạo; trong 2 GIÂY ĐẦU,
 *    CHỪNG NÀO CHƯA CÓ LẦN GÕ NÀO, mức ồn nền được lên nhanh (τ ≈ 0,5 s) để bắt kịp phòng. Có lần gõ (bé đã đàn) là
 *    về tốc độ chậm như cũ — đuôi nốt đàn (không rõ cao độ vì vang/rung) không được đẩy ngưỡng lên (đo: tụt 16/16 → 7/16).
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
  /**
   * "Suýt nghe được": tiếng có cao độ RÕ vừa bật lên nhưng dưới ngưỡng hiện tại, trên ngưỡng của độ nhạy kế tiếp
   * (đàn khẽ quá với độ nhạy này). Mỗi lần đàn báo tối đa 1 lần — cho bộ tự tăng độ nhạy (micAutoSens).
   */
  nearMiss: boolean;
}

/** Độ nhạy: hệ số nhân với mức ồn nền (thấp = cần tiếng to hơn mới nhận). */
export const SENSITIVITY = { low: 5, normal: 2.2, high: 1.6 } as const;
export type Sensitivity = keyof typeof SENSITIVITY;
/**
 * Ngưỡng TUYỆT ĐỐI tối thiểu (RMS sau lọc) theo độ nhạy. Trước 2026-10-08 là 0,0008 (−62 dBFS) cho mọi độ nhạy
 * → iPad thật (Safari tắt xử lý giọng nói → micro "thô", mức thu nhỏ) ở phòng yên: tiếng ồn ≈ 0,0001, đàn nhẹ
 * ≈ 0,0005–0,001 → ngưỡng cố định này nuốt mọi nốt nhẹ, và chỉnh độ nhạy Vừa/Cao KHÔNG có tác dụng gì.
 */
export const MIN_GATE: Record<Sensitivity, number> = { low: 0.0008, normal: 0.00025, high: 0.00012 };

/** Ngưỡng "có tiếng đàn" cho một mức ồn nền & độ nhạy (micTune dùng chung). */
export function gateFor(floor: number, s: Sensitivity): number {
  return Math.max(MIN_GATE[s], (floor < 0 ? 0.002 : floor) * SENSITIVITY[s]);
}

/**
 * (2026-10-08, mô phỏng bài tuần 4–10) GIỮ NỐT: đã có tiếng đàn vượt ngưỡng ở khung trước thì khung sau còn được
 * nghe cao độ tới HOLD_RATIO × ngưỡng (không thấp hơn ngưỡng theo ồn nền). iOS lọc ồn (ns) dập phần ngân của nốt khẽ
 * trong ~0,1 s → nốt nhẹ chỉ vượt MIN_GATE đúng 1 khung → không đủ 2 khung ổn định → bị nuốt dù to hơn ồn nền 16 dB.
 * Chỉ áp dụng nối tiếp một khung đã vượt ngưỡng → không mở cửa cho tiếng ồn/giọng nói nhỏ (bài thử phòng im/quạt/nói chuyện).
 */
export const HOLD_RATIO = 0.6;

/** Tần số cắt của MỖI tầng lọc (2 tầng nối tiếp → −6 dB ở đây, −3,3 dB ở Mi6 = 1319 Hz). */
export const LOWPASS_HZ = 1600;
/** Hệ số giảm mẫu trước YIN. */
export const DECIMATE = 2;
const ONSET_RATIO = 1.5;
/** Độ nhạy kế tiếp (nhạy hơn một bậc) — để biết "suýt nghe" so với bậc nào. */
const NEXT_SENS: Record<Sensitivity, Sensitivity | null> = { low: 'normal', normal: 'high', high: null };
const NEAR_RISE = 1.3;
const NEAR_CLARITY = 0.8;
/** Dưới (hệ số × ngưỡng) mới coi là im — trễ để nốt khẽ quanh ngưỡng không bị báo hai lần. */
const SILENCE_HYST = 0.8;
/** Mức ồn nền tăng tối đa bao nhiêu mỗi khung (tỉ lệ), và trần tuyệt đối. */
const FLOOR_RISE = 0.002;
export const FLOOR_MAX = 0.03;
/** Thời gian "làm quen phòng" sau khi bật micro (giây) và tốc độ lên của mức ồn nền trong lúc đó. */
export const WARMUP_S = 2;
const FLOOR_RISE_WARM = 0.05;
/** Khung nhỏ hơn mức này = micro chưa chạy (số 0 kỹ thuật số) — không dùng để khởi tạo mức ồn nền. */
const DIGITAL_SILENCE = 1e-6;
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
  /** Thời điểm khung "có tín hiệu" đầu tiên (NaN = chưa có) — để tính 2 giây làm quen phòng */
  private warmFrom = NaN;
  private warm = false;
  private filtered = new Float32Array(0);
  private decimated = new Float32Array(0);
  private energies = new Float32Array(0);
  private pendingOnset = false;
  /** "Suýt nghe": còn bao nhiêu khung để xem tiếng vừa bật lên có cao độ rõ không; đã báo cho lần đàn này chưa */
  private nearLeft = 0;
  private nearLatched = false;
  /** Lúc bắt đầu chuỗi khung có tiếng tích (−1 = không có) */
  private clickFrom = -1;
  /** Khung trước có tiếng đàn (vượt ngưỡng, hoặc đang giữ nốt) → khung này được nghe tới ngưỡng giữ */
  private holding = false;
  /** Tùy chọn YIN cho tín hiệu đã lọc (minRms = 0 vì đã có ngưỡng thích nghi) — tính lại khi `detect` đổi */
  private detectFor: DetectOptions | null = null;
  private detectNoGate: DetectOptions = DEFAULT_DETECT;
  tuningCents = 0;
  sensitivity: Sensitivity = 'normal';

  constructor(public detect: DetectOptions = DEFAULT_DETECT) {}

  /** Ngưỡng "có tiếng đàn" hiện tại. */
  gate(): number {
    return gateFor(this.floor, this.sensitivity);
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
    return { pitch, level, rms, floor: this.floor, gate, note, onset, onsetAt, nearMiss: false };
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
    if (this.floor < 0 && r > DIGITAL_SILENCE) {
      this.floor = r;
      this.warmFrom = t;
      this.warm = true;
    }
    if (this.warm && t - this.warmFrom >= WARMUP_S) this.warm = false;
    const gate = this.gate();
    // "Gõ" (đánh phím / vỗ tay): vượt ngưỡng và tăng vọt so với mức thấp nhất ~3 khung gần đây
    let base = r;
    for (let i = 0; i < this.recentN; i++) if (this.recent[i] < base) base = this.recent[i];
    let onset = r > gate * 1.5 && r > base * ONSET_RATIO && t - this.lastOnsetFrame > 0.09;
    let onsetAt = -1;
    if (onset) {
      this.lastOnsetFrame = t;
      // Chỉ chấm vỗ nhịp: lần gõ = bé đã đàn/vỗ → thôi "làm quen phòng". Cần cao độ thì chờ tới khi nghe ra NỐT
      // (quạt bật / tiếng động đột ngột cũng là "lần gõ" — không được làm mức ồn nền ngừng bắt kịp phòng).
      if (!needPitch) this.warm = false;
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
      this.holding = false;
      this.updateFloor(r, false);
      this.tracker.reset(true);
      this.tracker.forgetRinging();
      // Gõ phím trong lúc tiếng app đang tắt dần = bé đã đàn → nhớ lại; lúc app đang phát thì không tin
      this.pendingOnset = app === 'tail' && (this.pendingOnset || onset);
      return this.result(null, level, r, gate, null, onset, onsetAt);
    }
    if (this.pendingOnset) {
      onset = true;
      this.pendingOnset = false;
    }
    if (!needPitch) {
      this.holding = false;
      // Chỉ chấm vỗ nhịp: không biết khung có cao độ không → chỉ cho ồn nền tăng khi đã lâu không có tiếng gõ
      this.updateFloor(r, !onset && t - this.lastOnsetFrame > 1);
      return this.result(null, level, r, gate, null, onset, onsetAt);
    }
    let pitch: PitchResult | null = null;
    let nearMiss = false;
    const holdGate = Math.max(gate * HOLD_RATIO, Math.max(0, this.floor) * SENSITIVITY[this.sensitivity]);
    if (r >= gate || (this.holding && r >= holdGate)) {
      pitch = this.pitchOf(x, sampleRate, r);
      this.nearLeft = 0;
      // Giữ nốt chỉ khi khung này có cao độ RÕ (tiếng tích / tiếng động / đuôi nốt không rõ cao độ thì thôi)
      this.holding = !!pitch && pitch.clarity >= 0.8;
    } else {
      this.holding = false;
      nearMiss = this.checkNearMiss(x, sampleRate, r, base);
    }
    // Khung có cao độ rõ hoặc có lần gõ = tiếng đàn → KHÔNG được coi là ồn nền
    this.updateFloor(r, !onset && !(pitch && pitch.clarity >= 0.5));
    // "Im" khi dưới 0,8 × ngưỡng (trễ): nốt khẽ dao động quanh ngưỡng không bị coi là im rồi báo lại lần nữa
    const note = this.tracker.push(pitch, this.tuningCents, onset, r, gate * SILENCE_HYST);
    if (note) this.warm = false; // bé đã đàn → thôi "làm quen phòng"
    if (note) note.at = this.lastOnsetAt >= 0 && t - this.lastOnsetAt < 0.5 ? this.lastOnsetAt : t - 0.07;
    const res = this.result(pitch, level, r, gate, note, onset, onsetAt);
    res.nearMiss = nearMiss;
    return res;
  }

  /** YIN trên tín hiệu đã lọc: sau lọc bậc 4 hầu như không còn gì trên ~4 kHz → giảm mẫu ×2 (nhanh ~4 lần). */
  private pitchOf(x: Float32Array, sampleRate: number, r: number): PitchResult | null {
    const n = Math.floor(x.length / DECIMATE);
    if (this.decimated.length !== n) this.decimated = new Float32Array(n);
    const d = this.decimated;
    for (let i = 0, j = DECIMATE - 1; i < n; i++, j += DECIMATE) d[i] = x[j];
    if (this.detectFor !== this.detect) {
      this.detectFor = this.detect;
      this.detectNoGate = { ...this.detect, minRms: 0 };
    }
    const pitch = detectPitch(d, sampleRate / DECIMATE, this.detectNoGate);
    // rms của khung đã lọc (giống trước khi giảm mẫu)
    if (pitch) pitch.rms = r;
    return pitch;
  }

  /**
   * "Suýt nghe" (khung dưới ngưỡng): tiếng BẬT LÊN (×1,3 so với ~3 khung trước) vào khoảng [ngưỡng của độ nhạy kế
   * tiếp, ngưỡng hiện tại) → xem tối đa 3 khung, có cao độ rõ (≥ 0,8) thì báo một lần. Chỉ chạy YIN trong lúc đó.
   */
  private checkNearMiss(x: Float32Array, sampleRate: number, r: number, base: number): boolean {
    const next = NEXT_SENS[this.sensitivity];
    if (!next || this.floor < 0) return false;
    const lo = gateFor(this.floor, next);
    if (r < lo * 0.8) {
      this.nearLatched = false;
      this.nearLeft = 0;
      return false;
    }
    if (r < lo || this.nearLatched) return false;
    if (this.nearLeft === 0 && r > base * NEAR_RISE) this.nearLeft = 3;
    if (this.nearLeft === 0) return false;
    this.nearLeft--;
    const p = this.pitchOf(x, sampleRate, r);
    if (!p || p.clarity < NEAR_CLARITY) return false;
    this.nearLeft = 0;
    this.nearLatched = true;
    return true;
  }

  /**
   * Mức ồn nền: theo xuống NHANH khi phòng im; lên RẤT CHẬM và chỉ ở khung không có tiếng đàn; có trần.
   * 2026-10-08: khung to hơn ngưỡng chỉ được tính BẰNG ngưỡng — đuôi nốt đàn / tiếng vang (không rõ cao độ) to gấp
   * 10 lần ồn nền từng đẩy mức ồn nền lên ~2 %/khung → buổi tập dài thì ngưỡng "leo" dần, nốt nhẹ bị nuốt.
   * Phòng ồn lên thật (quạt bật) vẫn bắt kịp (từng bước ≤ hệ số độ nhạy).
   */
  private updateFloor(r: number, mayRise: boolean): void {
    if (this.floor < 0) return; // micro chưa chạy (toàn 0) → chưa có mức ồn nền
    if (r < this.floor) this.floor += (r - this.floor) * 0.5;
    else if (mayRise) {
      const target = Math.min(r, this.gate());
      if (target > this.floor) this.floor = Math.min(FLOOR_MAX, this.floor + (target - this.floor) * (this.warm ? FLOOR_RISE_WARM : FLOOR_RISE));
    }
  }

  /** Đang trong 2 giây đầu "làm quen phòng" (để nhật ký chẩn đoán). */
  get warmingUp(): boolean {
    return this.warm;
  }

  /**
   * requireOnset = false: bật micro mới (MicListener.start) → học lại mức ồn nền của phòng từ đầu.
   * requireOnset = true: chỉ bỏ nốt đang ngân (chờ nốt mới) — giữ mức ồn nền.
   */
  reset(requireOnset = true): void {
    if (!requireOnset) {
      this.floor = -1;
      this.warmFrom = NaN;
      this.warm = false;
    }
    this.pendingOnset = false;
    this.nearLeft = 0;
    this.holding = false;
    this.tracker.reset(requireOnset);
  }
}
