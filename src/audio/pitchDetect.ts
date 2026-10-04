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

/** Bàn phím C3–C5 → dải 100–1100 Hz là đủ, có chừa lề. */
export const DEFAULT_DETECT: DetectOptions = { minFreq: 100, maxFreq: 1100, threshold: 0.15, minRms: 0.01 };

export function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
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
  const cmnd = new Float32Array(tauMax + 1);
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

  // Điểm đầu tiên dưới ngưỡng, rồi trượt tới cực tiểu cục bộ
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < opts.threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  // Nội suy parabol cho chính xác dưới 1 mẫu
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const denom = a + c - 2 * b;
    if (denom !== 0) better = tau + (a - c) / (2 * denom);
  }
  return { freq: sampleRate / better, clarity: 1 - cmnd[tau], rms: level };
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
}

export function nearestNote(freq: number, tuningCents = 0): HeardNote {
  const m = freqToMidi(freq, tuningCents);
  const midi = Math.round(m);
  return { midi, cents: (m - midi) * 100, freq };
}

/**
 * Lọc kết quả từng khung thành "sự kiện nốt": một nốt chỉ được báo khi
 * ổn định ≥ stableFrames khung liên tiếp; mỗi lần nhấn phím (onset) báo đúng 1 lần.
 * Nhấn lại cùng phím được nhận ra nhờ âm lượng bật tăng (đàn cơ tắt dần rồi to lại).
 */
export class NoteTracker {
  private candidate: number | null = null;
  private count = 0;
  private emitted: number | null = null;
  private lastRms = 0;
  /** Chặn báo nốt cho tới khi có lần gõ phím mới hoặc im lặng. */
  private blocked = false;

  constructor(
    private readonly stableFrames = 3,
    private readonly onsetRatio = 1.6,
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

  /** Đưa vào kết quả 1 khung; trả về MIDI khi có nốt mới được đánh. */
  push(result: PitchResult | null, tuningCents = 0): HeardNote | null {
    if (!result || result.clarity < 0.8) {
      // Im lặng / không rõ → cho phép báo lại nốt cũ ở lần nhấn sau
      if (!result) {
        this.emitted = null;
        this.lastRms = 0;
        this.blocked = false;
      }
      this.candidate = null;
      this.count = 0;
      return null;
    }
    const onset = this.lastRms > 0 && result.rms > this.lastRms * this.onsetRatio;
    this.lastRms = result.rms;
    if (onset) {
      // Lần nhấn mới: đếm ổn định lại từ đầu (bỏ qua tiếng búa gõ lúc đầu)
      this.emitted = null;
      this.candidate = null;
      this.count = 0;
      this.blocked = false;
    }
    if (this.blocked) return null;

    const note = nearestNote(result.freq, tuningCents);
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
