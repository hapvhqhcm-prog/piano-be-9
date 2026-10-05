/**
 * Nhận cao độ MỘT nốt từ tín hiệu micro — thuật toán YIN (de Cheveigné & Kawahara, 2002).
 * Hàm thuần, không phụ thuộc DOM/Web Audio → test được bằng tín hiệu tổng hợp.
 */

export interface PitchResult {
  freq: number;
  /** 0–1: độ "rõ" của cao độ (1 = rất rõ) */
  clarity: number;
  rms: number;
}

export interface DetectOptions {
  minFreq: number;
  maxFreq: number;
  /** Ngưỡng YIN — nhỏ hơn = khắt khe hơn */
  threshold: number;
  /** Bỏ qua tín hiệu nhỏ hơn mức này (im lặng / tiếng ồn nền) */
  minRms: number;
}

/** Từ Đô trầm C2 (65 Hz) tới Mi cao E6 (1319 Hz) — đủ cho mọi thế tay của giáo trình. */
export const DEFAULT_DETECT: DetectOptions = { minFreq: 60, maxFreq: 1400, threshold: 0.15, minRms: 0.01 };

export function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/** Bộ đệm CMND dùng lại giữa các khung (không cấp phát mỗi khung — đỡ dọn rác trên iPad cũ). */
let cmndBuf = new Float32Array(0);

/**
 * Giá trị đáy THẬT của CMND quanh t (nội suy parabol). Sau khi giảm mẫu, chu kỳ hiếm khi trùng số nguyên mẫu
 * → giá trị tại mẫu gần nhất cao hơn đáy thật, có khi cao hơn đáy ở 2–3 lần chu kỳ (trùng mẫu hơn) → nhầm quãng.
 */
function dipValue(cmnd: Float32Array, t: number, tauMax: number): number {
  const b = cmnd[t];
  if (t < 1 || t >= tauMax) return b;
  const a = cmnd[t - 1];
  const c = cmnd[t + 1];
  const denom = a + c - 2 * b;
  if (denom <= 0) return b;
  return Math.max(0, Math.min(b, b - ((a - c) * (a - c)) / (8 * denom)));
}

/** Điểm đầu tiên dưới ngưỡng (theo đáy nội suy), rồi trượt tới cực tiểu cục bộ; −1 nếu không có. */
function firstDip(cmnd: Float32Array, tauMin: number, tauMax: number, th: number): number {
  for (let t = tauMin; t <= tauMax; t++) {
    const v = cmnd[t];
    if (v < th || (t > tauMin && t < tauMax && v <= cmnd[t - 1] && v < cmnd[t + 1] && dipValue(cmnd, t, tauMax) < th)) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      return t;
    }
  }
  return -1;
}

export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  opts: DetectOptions = DEFAULT_DETECT,
): PitchResult | null {
  const level = rms(buf);
  if (level < opts.minRms) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / opts.maxFreq));
  const tauMax = Math.min(Math.floor(sampleRate / opts.minFreq), Math.floor(buf.length / 2));
  if (tauMax <= tauMin + 2) return null;
  const W = buf.length - tauMax;

  // Hàm sai phân + chuẩn hóa tích lũy (CMND)
  if (cmndBuf.length < tauMax + 1) cmndBuf = new Float32Array(tauMax + 1);
  const cmnd = cmndBuf;
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let d = 0;
    for (let j = 0; j < W; j++) {
      const diff = buf[j] - buf[j + tau];
      d += diff * diff;
    }
    running += d;
    cmnd[tau] = running > 0 ? (d * tau) / running : 1;
  }

  let tau = firstDip(cmnd, tauMin, tauMax, opts.threshold);
  if (tau < 0) {
    // Phòng ồn: không điểm nào đạt ngưỡng chuẩn → nới ngưỡng theo cực tiểu toàn cục (vẫn lấy điểm ĐẦU TIÊN
    // để khỏi nhầm xuống quãng 8 dưới). Quá mờ (> 0,45) thì thôi.
    let g = Infinity;
    for (let t = tauMin; t <= tauMax; t++) {
      const v = cmnd[t] < g ? cmnd[t] : g;
      g = t > tauMin && t < tauMax && cmnd[t] <= cmnd[t - 1] && cmnd[t] < cmnd[t + 1] ? Math.min(v, dipValue(cmnd, t, tauMax)) : v;
    }
    if (g > 0.45) return null;
    tau = firstDip(cmnd, tauMin, tauMax, Math.min(0.5, g + 0.08));
    if (tau < 0) return null;
  }

  // Nội suy parabol cho chính xác dưới 1 mẫu
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const denom = a + c - 2 * b;
    if (denom !== 0) better = tau + (a - c) / (2 * denom);
  }
  return { freq: sampleRate / better, clarity: 1 - dipValue(cmnd, tau, tauMax), rms: level };
}

/** Tần số → MIDI (số thực), có bù độ lệch dây của đàn nhà (cents). */
export function freqToMidi(freq: number, tuningCents = 0): number {
  return 69 + 12 * Math.log2(freq / 440) - tuningCents / 100;
}

export interface HeardNote {
  midi: number;
  /** Lệch so với nốt chuẩn gần nhất (cents, sau khi đã bù tuningCents) */
  cents: number;
  freq: number;
  /** Thời điểm ước tính bé GÕ PHÍM (giây, cùng đồng hồ với `t` truyền vào MicAnalyzer) — để chấm nhịp */
  at?: number;
}

export function nearestNote(freq: number, tuningCents = 0): HeardNote {
  const m = freqToMidi(freq, tuningCents);
  const midi = Math.round(m);
  return { midi, cents: (m - midi) * 100, freq };
}

/**
 * Lọc kết quả từng khung thành "sự kiện nốt": một nốt chỉ được báo khi
 * ổn định ≥ stableFrames khung liên tiếp; mỗi lần nhấn phím (onset) báo đúng 1 lần.
 * Lần nhấn mới được nhận ra nhờ âm lượng bật tăng — tốt nhất truyền `onset` tính từ âm lượng THÔ của mọi khung
 * (kể cả khung lúc búa gõ chưa rõ cao độ); nếu không truyền thì tự so âm lượng giữa các khung rõ.
 */
/** Khoảng (nửa cung) từ nốt thật xuống "nốt ảo" chu kỳ chung: quãng 8, quãng 12, 2 quãng 8. */
const SUBHARMONIC_STEPS = [12, 19, 24];

export class NoteTracker {
  private candidate: number | null = null;
  private count = 0;
  private emitted: number | null = null;
  private lastRms = 0;
  /** Chặn báo nốt cho tới khi có lần gõ phím mới hoặc im lặng. */
  private blocked = false;

  constructor(
    private readonly stableFrames = 2,
    private readonly onsetRatio = 1.6,
    /** Độ rõ tối thiểu (1 − CMND) để tin một khung */
    private readonly minClarity = 0.6,
  ) {}

  /**
   * requireOnset=true: nốt đang ngân sẵn (vd dây đàn của nốt trước, tiếng app vừa phát)
   * KHÔNG được tính — phải chờ bé gõ phím mới hoặc đàn im hẳn.
   */
  reset(requireOnset = false): void {
    this.candidate = null;
    this.count = 0;
    this.emitted = null;
    this.blocked = requireOnset;
    if (!requireOnset) this.lastRms = 0;
  }

  /** Đưa vào kết quả 1 khung; trả về nốt khi có nốt mới được đánh. */
  push(result: PitchResult | null, tuningCents = 0, onsetIn?: boolean, frameRms?: number, silenceBelow = 0.006): HeardNote | null {
    const r = frameRms ?? result?.rms ?? 0;
    const onset = onsetIn ?? (!!result && this.lastRms > 0 && result.rms > this.lastRms * this.onsetRatio);
    if (onsetIn !== undefined || result) this.lastRms = r;
    if (onset) {
      // Lần nhấn mới: đếm ổn định lại từ đầu
      this.emitted = null;
      this.candidate = null;
      this.count = 0;
      this.blocked = false;
    }
    if (!result || result.clarity < this.minClarity) {
      // Không rõ cao độ (tiếng búa, tiếng ồn) → chưa kết luận; im hẳn → cho báo lại nốt cũ lần sau
      if (!result && (frameRms === undefined || frameRms < silenceBelow)) {
        this.emitted = null;
        this.lastRms = 0;
        this.blocked = false;
      }
      this.candidate = null;
      this.count = 0;
      return null;
    }
    if (this.blocked) return null;

    const note = nearestNote(result.freq, tuningCents);
    // Chưa có lần gõ mới mà "nốt" nhảy xuống quãng 8 / quãng 12 / 2 quãng 8 của nốt vừa báo = chu kỳ chung
    // của nốt mới + đuôi nốt cũ còn ngân (vd Fa4 + Đô4 → Fa2), không phải bé đàn thêm → không báo.
    if (this.emitted !== null && SUBHARMONIC_STEPS.includes(this.emitted - note.midi)) {
      this.candidate = null;
      this.count = 0;
      return null;
    }
    if (note.midi === this.candidate) this.count++;
    else {
      this.candidate = note.midi;
      this.count = 1;
    }
    if (this.count >= this.stableFrames && this.emitted !== note.midi) {
      this.emitted = note.midi;
      return note;
    }
    return null;
  }
}
