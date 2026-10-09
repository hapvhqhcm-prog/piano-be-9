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

/**
 * Bù độ lệch dây: một số (cent, cả đàn — bù tay) hoặc hàm theo nốt (MIDI số thực → cent; tự học theo âm khu,
 * autoTune.ts). Kiểm tra hợp âm / hai tay dùng cùng giá trị với bộ nhận nốt.
 */
export type Tuning = number | ((midi: number) => number);

/** Độ lệch (cent) ở nốt `midi`. */
export function centsAt(t: Tuning | undefined, midi: number): number {
  return typeof t === 'function' ? t(midi) : (t ?? 0);
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
/**
 * Nốt vừa báo vẫn được "nhớ" ~1,5 s (60 khung × 25 ms) — kể cả qua reset(true), lần gõ mới, quãng nghỉ ngắn:
 * dây cũ còn ngân + nốt mới đàn khẽ → YIN thấy chu kỳ chung (Đô4 + Mi4 → Đô2, Đô4 + Fa4 → Fa2, Sol4 + Mi4 → Đô2)
 * = "nốt sai" oan. Chỉ chặn "nốt" thấp hơn nốt đang ngân ≥ 19 nửa cung VÀ dưới La2 (45) — Sol4 rồi Đô3 (tay trái)
 * hay Đô4 rồi Đô3 vẫn là chuyện bình thường.
 */
const RING_MIN_STEP = 19;
const RING_BELOW = 45;
const RING_FRAMES = 60;
/** "Gõ theo cao độ" (lúc đang chặn chờ lần gõ): số khung ổn định, độ rõ & độ lệch tối đa để tin nốt MỚI. */
const PITCH_ONSET_FRAMES = 3;
const PITCH_ONSET_CLARITY = 0.85;
const PITCH_ONSET_CENTS = 35;
/**
 * (2026-10-08) …và cao độ phải ĐỨNG YÊN qua 3 khung gần nhất (chênh ≤ 15 cents, mọi khung lệch ≤ 35 cents). Nốt to còn ngân (bé giữ phím La) + nốt
 * khẽ vừa đàn (Sol) đang tắt: YIN "trôi" dần 67,3 → 67,7 → 68,0 = Sol# — nốt ma, không phải bé đàn (Xòe hoa).
 */
const PITCH_ONSET_SPREAD = 15;
/**
 * (2026-10-08, mô phỏng bài tuần 4–10 — tests/weekSongsMic.test.ts) Lần gõ tới ≤ 2 khung (50 ms) SAU khi nốt đã được báo
 * (báo sớm nhờ đàn im trước đó) là tiếng búa của CHÍNH lần bấm ấy (âm lượng lên chậm khi đàn khẽ) → không báo lại
 * (trước đây: nốt lặp đàn khẽ "Rê Rê" bị đếm 2 lần cho một lần bấm). Nhớ cả qua reset(true): chế độ chờ xóa trí nhớ
 * ngay khi nghe đúng — lần gõ trễ đó không được làm con trỏ nhảy thêm một nốt (Mi Mi Mi).
 */
const SAME_STRIKE_FRAMES = 2;
/**
 * "Nốt ma" giữa hai nốt cùng ngân: bé chưa nhả Sol đã đàn La → Sol + La ngân cùng lúc, YIN có lúc ra Sol# (68) —
 * nằm GIỮA hai nốt vừa báo, cách nhau ≤ 4 nửa cung. Không có lần gõ mới gần đây thì đó không phải bé đàn → bỏ
 * (trước đây: "đàn sai" oan trong Xòe hoa / Gà gáy khi bé giữ phím Sol lâu).
 */
const BETWEEN_MAX_SPAN = 4;
const BETWEEN_ONSET_FRAMES = 4;
/**
 * (+ 2026-10-09, tests/autoTuneBench.test.ts) Nốt TRẦM (dưới Đô4) vừa báo, chưa có lần gõ mới mà "nốt" nhảy LÊN đúng
 * quãng 8 = YIN bắt nhầm chu kỳ của họa âm 2 (âm cơ bản nốt trầm yếu, tắt nhanh hơn) — không phải bé đàn thêm. Đàn
 * lệch cao (+15…+30 cent) hay gặp: Rê3 đang ngân → "Rê4" = "đàn sai" oan khi chơi theo nhịp (đàn đúng dây: hiếm).
 */
const OCTAVE_UP_BELOW = 60;

export class NoteTracker {
  private candidate: number | null = null;
  private count = 0;
  /** Độ lệch (cents) của các khung ứng viên gần nhất (vòng tròn PITCH_ONSET_FRAMES) */
  private candCents = new Float64Array(PITCH_ONSET_FRAMES);
  private emitted: number | null = null;
  private lastRms = 0;
  /** Chặn báo nốt cho tới khi có lần gõ phím mới hoặc im lặng. */
  private blocked = false;
  /** Nốt bé vừa đàn (còn ngân) — giữ qua reset(true); null = không biết (vd tiếng app) */
  private ringing: number | null = null;
  private ringLeft = 0;
  /** Nốt ngân TRƯỚC `ringing` (còn được nhớ bao lâu) — để nhận ra "nốt ma" giữa hai nốt cùng ngân */
  private prevRinging: number | null = null;
  private prevLeft = 0;
  /** Số khung từ lần báo nốt / lần gõ gần nhất */
  private sinceEmit = 1e9;
  /** Nốt báo gần nhất (giữ qua reset(true)) */
  private lastEmit: number | null = null;
  /** Nốt KHÔNG được báo lại cho tới lần gõ thật sự mới / im lặng (lần gõ trễ của chính nốt vừa báo) */
  private suppress: number | null = null;
  private sinceOnset = 1e9;

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
    if (!requireOnset) {
      this.lastRms = 0;
      this.ringing = null;
      this.ringLeft = 0;
      this.prevRinging = null;
      this.prevLeft = 0;
      this.lastEmit = null;
      this.sinceEmit = 1e9;
      this.suppress = null;
    }
  }

  /**
   * Tiếng của APP (âm mẫu) đang phát / vừa phát: không biết nốt nào đang ngân → bỏ "nốt đang ngân" đã nhớ
   * (để "gõ theo cao độ" không bao giờ nhận nhầm tiếng app là bé đàn).
   */
  forgetRinging(): void {
    this.ringing = null;
    this.ringLeft = 0;
    this.prevRinging = null;
    this.prevLeft = 0;
  }

  /** Đưa vào kết quả 1 khung; trả về nốt khi có nốt mới được đánh. */
  push(result: PitchResult | null, tuningCents = 0, onsetIn?: boolean, frameRms?: number, silenceBelow = 0.006): HeardNote | null {
    const r = frameRms ?? result?.rms ?? 0;
    const onset = onsetIn ?? (!!result && this.lastRms > 0 && result.rms > this.lastRms * this.onsetRatio);
    if (onsetIn !== undefined || result) this.lastRms = r;
    if (this.ringLeft > 0 && --this.ringLeft === 0) this.ringing = null;
    if (this.prevLeft > 0 && --this.prevLeft === 0) this.prevRinging = null;
    this.sinceEmit++;
    this.sinceOnset++;
    if (onset) {
      this.sinceOnset = 0;
      // Lần nhấn mới: đếm ổn định lại từ đầu — trừ khi nốt vừa được báo ngay trước đó (cùng một lần bấm)
      this.suppress = this.lastEmit !== null && this.sinceEmit <= SAME_STRIKE_FRAMES ? this.lastEmit : null;
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
        this.suppress = null;
      }
      this.candidate = null;
      this.count = 0;
      return null;
    }
    const note = nearestNote(result.freq, tuningCents);
    // Chưa có lần gõ mới mà "nốt" nhảy xuống quãng 8 / quãng 12 / 2 quãng 8 của nốt vừa báo = chu kỳ chung
    // của nốt mới + đuôi nốt cũ còn ngân (vd Fa4 + Đô4 → Fa2), không phải bé đàn thêm → không báo.
    if (
      (this.emitted !== null && SUBHARMONIC_STEPS.includes(this.emitted - note.midi)) ||
      (this.emitted !== null && this.emitted < OCTAVE_UP_BELOW && note.midi - this.emitted === 12) ||
      (this.ringing !== null && this.ringing - note.midi >= RING_MIN_STEP && note.midi < RING_BELOW) ||
      this.between(note.midi)
    ) {
      this.candidate = null;
      this.count = 0;
      return null;
    }
    if (note.midi === this.candidate) {
      this.count++;
      this.candCents[(this.count - 1) % PITCH_ONSET_FRAMES] = note.cents;
    } else {
      this.candidate = note.midi;
      this.count = 1;
      this.candCents[0] = note.cents;
    }
    if (this.blocked) {
      // Đang chờ lần gõ mới (nốt cũ còn ngân). Bé đàn KHẼ thì âm lượng có khi không bật đủ để thành "lần gõ" →
      // "gõ theo cao độ": một nốt KHÁC hẳn nốt đang ngân (biết rõ là nốt bé vừa đàn), rõ & ổn định ≥ 3 khung = nốt mới.
      const r0 = this.ringing;
      const fresh =
        r0 !== null &&
        note.midi !== r0 &&
        Math.abs(note.midi - r0) !== 12 &&
        !SUBHARMONIC_STEPS.includes(r0 - note.midi) &&
        result.clarity >= PITCH_ONSET_CLARITY &&
        this.steadyCents();
      if (!fresh || this.count < Math.max(this.stableFrames, PITCH_ONSET_FRAMES)) return null;
      this.blocked = false;
    }
    if (this.count >= this.stableFrames && this.emitted !== note.midi && this.suppress !== note.midi) {
      this.emitted = note.midi;
      if (this.ringing !== null && this.ringing !== note.midi) {
        this.prevRinging = this.ringing;
        this.prevLeft = this.ringLeft;
      }
      this.ringing = note.midi;
      this.ringLeft = RING_FRAMES;
      this.sinceEmit = 0;
      this.lastEmit = note.midi;
      return note;
    }
    return null;
  }

  /** 3 khung ứng viên gần nhất: mọi khung lệch ≤ 35 cents và chênh nhau ≤ 15 cents (cao độ đứng yên). */
  private steadyCents(): boolean {
    const n = Math.min(this.count, PITCH_ONSET_FRAMES);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const c = this.candCents[i];
      if (c < lo) lo = c;
      if (c > hi) hi = c;
    }
    return Math.max(-lo, hi) <= PITCH_ONSET_CENTS && hi - lo <= PITCH_ONSET_SPREAD;
  }

  /** "Nốt ma" nằm giữa hai nốt vừa báo còn ngân (cách nhau ≤ 4 nửa cung), không có lần gõ mới gần đây. */
  private between(midi: number): boolean {
    const a = this.ringing;
    const b = this.prevRinging;
    if (a === null || b === null || this.sinceOnset <= BETWEEN_ONSET_FRAMES) return false;
    if (Math.abs(a - b) > BETWEEN_MAX_SPAN) return false;
    return midi > Math.min(a, b) && midi < Math.max(a, b);
  }
}
