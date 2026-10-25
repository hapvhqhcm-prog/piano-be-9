/**
 * PHÂN BIỆT GIỌNG BÉ vs TIẾNG ĐÀN THẬT (2026-10-25 — phản hồi của bé: "Máy nghe nên phân biệt giọng và đàn thật").
 *
 * Bé hay hát / ngân nga / nói / huýt sáo trong lúc học → micro nghe ra "nốt" và app phản ứng như bé vừa đàn
 * (hát ĐÚNG nốt đang chờ = con trỏ đi; hát nốt khác = "đàn sai"). Bộ này chấm mỗi nốt MicAnalyzer định báo bằng
 * những dấu hiệu vật lý của dây đàn bị búa gõ so với giọng người:
 *
 *   ĐÀN                                          GIỌNG / HUÝT SÁO
 *   bật lên đột ngột (búa gõ, < ~15 ms)          lên từ từ (60–200 ms)
 *   rồi TẮT DẦN, không phồng lại                 ngân đều hoặc to dần
 *   cao độ đứng yên (sau ~60 ms)                 rung giọng 4–7 Hz ±20–80 cent, vuốt/trượt cao độ lúc vào
 *   họa âm hơi "giãn" (lệch họa âm B > 0)        họa âm đúng bội số nguyên (B ≈ 0)
 *   nhiều họa âm                                  huýt sáo: gần như sóng sin thuần
 *
 * Hàm THUẦN `scoreVoice` (đặc trưng → điểm "giống đàn"; dương = đàn, âm = giọng) + lớp `VoiceGuard` giữ lịch sử
 * khung (bao biên khối 256 mẫu ≈ 5 ms của tín hiệu đã lọc, cao độ từng khung) và đo đặc trưng. MicAnalyzer dùng nó
 * THẬN TRỌNG: chỉ BỎ một nốt khi chắc chắn là giọng; nốt có tiếng búa rõ được báo ngay (không trễ); nốt mờ (vd đàn
 * liền tiếng khẽ, không bật âm lượng) được xem thêm tối đa ~0,2 s rồi mới quyết — còn nghi ngờ thì vẫn NHẬN.
 *
 * Màn "Hát" (bước HÁT) nghe giọng qua onFrame (cao độ từng khung) — không đi qua bộ này.
 */
import { freqToMidi, type PitchResult } from './pitchDetect';

/** Lời nhắc nhẹ (một lần mỗi màn) khi micro bỏ một "nốt" vì là giọng bé. */
export const VOICE_HINT = 'Máy nghe thấy giọng con — đàn trên phím nhé 🎹';

/** Khối bao biên (mẫu). */
const BLOCK = 256;
/** Số khối giữ lại (~1 s ở 48 kHz). */
const ENV_N = 200;
/** Số khung (25 ms) giữ lại. */
const FR_N = 24;
/**
 * Nhìn lùi tối đa ngần này giây trước đỉnh để tìm mức nền của lần bật lên. Ngắn (không phải 0,25 s): bé đang hát mà
 * gõ phím → nền = giọng ngay trước tiếng búa, không phải lúc im lặng trước khi bé cất giọng (lần bật lên = sườn giọng).
 */
const ATTACK_BACK = 0.25;

export type AttackKind = 'abrupt' | 'sharp' | 'soft' | 'none' | 'unknown';

export interface VoiceFeatures {
  /** Kiểu bật lên quanh lần gõ */
  attack: AttackKind;
  /** Thời gian 20 % → 60 % (giây) của lần bật lên; NaN nếu không đo được */
  riseS: number;
  /** Đỉnh / mức thấp nhất trước đó */
  jump: number;
  /** Mức cuối so với mức ngay sau đỉnh (dB); NaN = chưa đủ dài để đo */
  decayDb: number;
  /** Phồng lên nhiều nhất sau đỉnh (dB, so với mức ngay sau đỉnh); NaN = chưa đo */
  swellDb: number;
  /** Độ dài đoạn đã xem sau đỉnh (giây) */
  spanS: number;
  /** Số khung cao độ dùng được (sau tiếng búa) */
  pitchN: number;
  /** Biên độ dao động cao độ sau khi bỏ xu hướng (cent, max − min) */
  wobbleC: number;
  /** Trượt cao độ (cent) suốt đoạn đo (xu hướng tuyến tính × độ dài) */
  glideC: number;
  /** Vào nốt từ dưới/trên (cent: khung đầu so với phần sau); NaN = không đo */
  scoopC: number;
  /** Chênh lớn nhất giữa hai khung cao độ liền nhau từ lần gõ (cent); NaN = < 2 khung */
  stepC: number;
  /** Tỉ lệ năng lượng của họa âm mạnh nhất / tổng (1 = sóng sin thuần — huýt sáo); NaN = chưa đo */
  pure: number;
  /** Lệch họa âm ước lượng (B); NaN = không đo được */
  inharm: number;
  /** MIDI (số thực) của nốt */
  midi: number;
  /** Bước nhảy nhanh nhất (~16 ms) lên tới ≥ nửa đỉnh */
  step: number;
}

export const NO_FEATURES: VoiceFeatures = {
  attack: 'unknown',
  riseS: NaN,
  jump: 1,
  decayDb: NaN,
  swellDb: NaN,
  spanS: 0,
  pitchN: 0,
  wobbleC: NaN,
  glideC: NaN,
  scoopC: NaN,
  stepC: NaN,
  pure: NaN,
  inharm: NaN,
  midi: NaN,
  step: NaN,
};

/**
 * Ngưỡng (OWNER/kỹ thuật có thể chỉnh — đã đo trên tests/voiceGuard.test.ts + các bộ đo micro hiện có).
 */
export const VOICE = {
  /** Bật lên 20 → 60 % trong ngần này giây và tăng ≥ ABRUPT_JUMP lần = tiếng búa */
  ABRUPT_RISE: 0.012,
  ABRUPT_JUMP: 2.5,
  /** …hoặc tăng rất mạnh (≥ ABRUPT_BIG lần) trong ≤ 16 ms (nốt trầm: chu kỳ dài, bao biên lên chậm hơn một khối) */
  ABRUPT_BIG: 4,
  ABRUPT_BIG_RISE: 0.016,
  SHARP_RISE: 0.022,
  /**
   * Tăng ít hơn ngần này thì không tính là tiếng búa (giọng trong phòng vang + rung giọng cũng "nhấp nhô" ×1,4–2,6;
   * đàn khẽ ngay sau nốt to đo được ×1,8–3).
   */
  SHARP_JUMP: 1.8,
  /** Lên chậm hơn ngần này = giọng (đàn thật — kể cả đàn rất khẽ, lọc ồn iOS, vang phòng — đo được ≤ 16 ms) */
  SOFT_RISE: 0.028,
  /** "Lên chậm" chỉ khi không có bước nhảy nhanh (~16 ms) nào ≥ ngần này lần lên gần đỉnh (dốc tuyến tính 60 ms ≈ ×2,1) */
  STEP_SOFT_MAX: 1.6,
  /** …chậm hơn ngần này: rất chắc là giọng */
  VERY_SOFT_RISE: 0.045,
  /** Không tăng tới ngần này lần = không có lần gõ */
  NO_JUMP: 1.25,
  /** Đoạn sau đỉnh tối thiểu để chấm tắt dần (giây) */
  ENV_SPAN: 0.11,
  /** Cao độ: dao động ≥ ngần này cent (bỏ xu hướng) = rung giọng; ≤ STABLE = đứng yên như dây đàn */
  WOBBLE_VOICE: 28,
  WOBBLE_SOME: 18,
  STABLE: 9,
  GLIDE_VOICE: 40,
  /** Tiếng búa rõ nhưng cao độ trượt mạnh ngần này cent (ngữ điệu lời nói) và không tắt dần → giọng nói */
  GLIDE_SPEECH: 60,
  /** Hai khung cao độ liền nhau chênh ≥ ngần này cent → chưa báo ngay (dù có tiếng búa), xem thêm */
  STEP_UNSURE: 20,
  SCOOP_VOICE: 45,
  /** Sóng gần như sin thuần */
  PURE_TONE: 0.965,
  /** Sin thuần tới mức này ở nốt dưới WHISTLE_BELOW (MIDI) = huýt sáo, kể cả khi bật lên nhanh (dây đàn luôn có họa âm) */
  WHISTLE_PURE: 0.985,
  WHISTLE_BELOW: 84,
  /** Lệch họa âm: ≥ ngần này = dây đàn; |B| ≤ INHARM_ZERO = bội số nguyên (giọng) */
  INHARM_PIANO: 0.00015,
  INHARM_ZERO: 0.00004,
  /** Điểm ≥ PIANO_OK → nhận ngay; ≤ REJECT → bỏ (giọng) */
  PIANO_OK: 1.5,
  REJECT: -1.5,
  /** Chờ tối đa (giây, tính từ lần gõ / lúc định báo) rồi quyết; nốt không có tiếng búa rõ: chờ lâu hơn */
  DEADLINE: 0.22,
  DEADLINE_SOFT: 0.32,
};

export interface VoiceScore {
  /** dương = giống đàn, âm = giống giọng */
  score: number;
  /** 0–1 (logistic của điểm) */
  pianoLikelihood: number;
  cues: string[];
}

/** Hàm THUẦN: đặc trưng → điểm. */
export function scoreVoice(f: VoiceFeatures): VoiceScore {
  let s = 0;
  const cues: string[] = [];
  const add = (v: number, cue: string) => {
    s += v;
    cues.push(`${cue}${v > 0 ? '+' : ''}${v}`);
  };
  switch (f.attack) {
    case 'abrupt':
      add(2, 'búa');
      break;
    case 'sharp':
      add(1, 'bật');
      break;
    case 'soft':
      add(f.riseS >= VOICE.VERY_SOFT_RISE ? -1.5 : -1, 'lên-chậm');
      break;
    case 'none':
      add(-0.5, 'không-gõ');
      break;
    default:
      break;
  }
  if (f.spanS >= VOICE.ENV_SPAN && Number.isFinite(f.decayDb)) {
    if (Number.isFinite(f.swellDb) && f.swellDb >= 1.5) add(-1.5, 'phồng');
    else if (f.decayDb <= -2) add(1.5, 'tắt');
    else if (f.decayDb <= -1) add(0.7, 'tắt-nhẹ');
    else if (f.decayDb > -0.5 && f.spanS >= 0.25) add(-1.2, 'ngân-đều');
    else if (f.decayDb > -0.5 && f.spanS >= 0.15) add(-0.7, 'ngân-đều');
  }
  if (f.pitchN >= 4 && (f.wobbleC >= VOICE.WOBBLE_VOICE || Math.abs(f.glideC) >= VOICE.GLIDE_VOICE)) add(-1.5, 'rung/trượt');
  else if (f.pitchN >= 3 && f.wobbleC >= VOICE.WOBBLE_SOME) add(-0.7, 'rung-nhẹ');
  else if (f.pitchN >= 3 && f.wobbleC <= VOICE.STABLE && Math.abs(f.glideC) < VOICE.STABLE * 2) add(0.7, 'đứng-yên');
  if (Number.isFinite(f.scoopC) && Math.abs(f.scoopC) >= VOICE.SCOOP_VOICE) add(-1, 'vuốt');
  // Sóng sin thuần (huýt sáo) — nốt đàn rất cao cũng có thể gần sin → chỉ tính khi không có tiếng búa rõ
  if (Number.isFinite(f.pure) && f.pure >= VOICE.PURE_TONE && f.attack !== 'abrupt') add(-2, 'sin-thuần');
  if (Number.isFinite(f.inharm)) {
    // Giọng có rung / trượt làm đỉnh họa âm nhòe → ước lượng B lệch: chỉ tin khi cao độ đứng yên
    if (f.inharm >= VOICE.INHARM_PIANO && f.pitchN >= 2 && f.wobbleC <= 12 && Math.abs(f.glideC) < 20) add(0.5, 'dây-giãn');
    else if (Math.abs(f.inharm) <= VOICE.INHARM_ZERO) add(-0.5, 'bội-nguyên');
  }
  return { score: s, pianoLikelihood: 1 / (1 + Math.exp(-s)), cues };
}

export type VoiceVerdict = 'piano' | 'voice' | 'unsure';

/** Quyết định từ điểm: `final` = hết giờ chờ → còn nghi thì NHẬN (thận trọng). Tiếng búa rõ không bao giờ bị bỏ. */
export function verdictOf(f: VoiceFeatures, sc: VoiceScore, final: boolean): VoiceVerdict {
  if (sc.score <= VOICE.REJECT && f.attack !== 'abrupt') return 'voice';
  // Huýt sáo: sin thuần ở âm khu dây đàn luôn có họa âm rõ
  if (f.pure >= VOICE.WHISTLE_PURE && f.midi < VOICE.WHISTLE_BELOW && !(f.decayDb <= -1)) return 'voice';
  // Lời nói: phụ âm bật cũng "đột ngột" như búa — nhưng cao độ trượt theo ngữ điệu, không tắt dần như dây đàn
  if (f.attack === 'abrupt' && f.pitchN >= 3 && Math.abs(f.glideC) >= VOICE.GLIDE_SPEECH && !(f.decayDb <= -1)) return 'voice';
  if (sc.score >= VOICE.PIANO_OK || final) return 'piano';
  return 'unsure';
}

/** Cửa sổ Hann (dùng lại). */
let hann = new Float32Array(0);
function hannOf(n: number): Float32Array {
  if (hann.length !== n) {
    hann = new Float32Array(n);
    for (let i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  return hann;
}

/** |DFT| (cửa sổ Hann) tại tần số f — đệ quy góc quay, không cấp phát. */
function magAt(x: Float32Array, w: Float32Array, f: number, sr: number): number {
  const d = (2 * Math.PI * f) / sr;
  const cd = Math.cos(d);
  const sd = Math.sin(d);
  let c = 1;
  let s = 0;
  let re = 0;
  let im = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] * w[i];
    re += v * c;
    im -= v * s;
    const nc = c * cd - s * sd;
    s = c * sd + s * cd;
    c = nc;
  }
  return Math.sqrt(re * re + im * im);
}

/**
 * Phổ họa âm trên tín hiệu THÔ (chưa lọc): tìm đỉnh quanh k·f0 (cho phép giãn kiểu dây đàn), tính độ "sin thuần" và
 * ước lượng lệch họa âm B bằng bình phương tối thiểu: ln(f_k / k) ≈ ln f0 + B·k²/2.
 */
export function partialFit(x: Float32Array, sr: number, f0: number): { pure: number; inharm: number } {
  const n = x.length;
  if (n < 512 || !(f0 > 40)) return { pure: NaN, inharm: NaN };
  const w = hannOf(n);
  const bin = sr / n;
  const fmax = Math.min(5000, sr / 2 - 500);
  const K = Math.min(10, Math.floor(fmax / f0));
  if (K < 1) return { pure: NaN, inharm: NaN };
  const fk: number[] = [];
  const ak: number[] = [];
  let noise = 0;
  let nn = 0;
  for (let k = 1; k <= K; k++) {
    const c = k * f0;
    const lo = c * (1 - 0.012) - bin * 0.5;
    const hi = c * (1 + 0.012 + 0.0006 * k * k) + bin * 0.5;
    const step = Math.max(1, bin / 4);
    let best = -1;
    let bf = c;
    let prev = -1;
    let bPrev = -1;
    let bNext = -1;
    for (let f = lo; f <= hi; f += step) {
      const m = magAt(x, w, f, sr);
      if (m > best) {
        best = m;
        bf = f;
        bPrev = prev;
        bNext = -1;
      } else if (bNext < 0 && prev === best) bNext = m;
      prev = m;
    }
    // nội suy parabol (log biên độ) quanh đỉnh
    if (bPrev > 0 && bNext > 0 && best > 0) {
      const a = Math.log(bPrev);
      const b = Math.log(best);
      const g = Math.log(bNext);
      const den = a - 2 * b + g;
      if (den < 0) bf += (0.5 * (a - g) * step) / den;
    }
    fk.push(bf);
    ak.push(best);
    if (k < K) {
      noise += magAt(x, w, (k + 0.5) * f0, sr);
      nn++;
    }
  }
  let tot = 0;
  let mx = 0;
  for (const a of ak) {
    tot += a * a;
    if (a * a > mx) mx = a * a;
  }
  const pure = tot > 0 ? mx / tot : NaN;
  const nz = nn ? noise / nn : 0;
  const amax = Math.sqrt(mx);
  // B: các họa âm đủ rõ (≥ 3 % đỉnh mạnh nhất và ≥ 4 × "nền" giữa các họa âm)
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let cnt = 0;
  const xs: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  for (let k = 1; k <= K; k++) {
    const a = ak[k - 1];
    if (a < amax * 0.03 || a < nz * 4) continue;
    const xv = k * k;
    const yv = Math.log(fk[k - 1] / k);
    const wv = Math.min(1, a / amax);
    xs.push(xv);
    ys.push(yv);
    ws.push(wv);
    sw += wv;
    sx += wv * xv;
    sy += wv * yv;
    sxx += wv * xv * xv;
    sxy += wv * xv * yv;
    cnt++;
  }
  let inharm = NaN;
  const den = sw * sxx - sx * sx;
  if (cnt >= 4 && den > 0) {
    const slope = (sw * sxy - sx * sy) / den;
    const icpt = (sy - slope * sx) / sw;
    // sai số khớp (cent) — đỉnh nhòe (2 nốt chồng, ồn) thì thôi
    let res = 0;
    for (let i = 0; i < xs.length; i++) {
      const e = (ys[i] - icpt - slope * xs[i]) * (1200 / Math.LN2);
      res += ws[i] * e * e;
    }
    if (Math.sqrt(res / sw) <= 8) inharm = 2 * slope;
  }
  return { pure, inharm };
}

/**
 * Lịch sử khung + đo đặc trưng. MicAnalyzer gọi `feed` mỗi khung (kể cả lúc app phát tiếng — chỉ bao biên),
 * và `features` khi cần chấm một nốt.
 */
export class VoiceGuard {
  private envV = new Float64Array(ENV_N);
  private envT = new Float64Array(ENV_N);
  private envI = 0;
  private envN = 0;
  private frT = new Float64Array(FR_N);
  private frR = new Float64Array(FR_N);
  private frM = new Float64Array(FR_N);
  private frC = new Float64Array(FR_N);
  private frI = 0;
  private frN = 0;
  private lastT = -1;

  reset(): void {
    this.envI = this.envN = 0;
    this.frI = this.frN = 0;
    this.lastT = -1;
  }

  /** @param x tín hiệu ĐÃ LỌC của khung (mẫu cuối = thời điểm t) */
  feed(x: Float32Array, sr: number, t: number, pitch: PitchResult | null, rms: number): void {
    const len = x.length;
    let fresh = this.lastT < 0 || t <= this.lastT ? len : Math.round((t - this.lastT) * sr);
    if (fresh > len) fresh = len;
    this.lastT = t;
    const nb = Math.min(Math.floor(len / BLOCK), Math.ceil(fresh / BLOCK));
    for (let b = nb - 1; b >= 0; b--) {
      const end = len - b * BLOCK;
      let s = 0;
      for (let i = end - BLOCK; i < end; i++) s += x[i] * x[i];
      this.envV[this.envI] = Math.sqrt(s / BLOCK);
      this.envT[this.envI] = t - (b * BLOCK) / sr;
      this.envI = (this.envI + 1) % ENV_N;
      if (this.envN < ENV_N) this.envN++;
    }
    this.frT[this.frI] = t;
    this.frR[this.frI] = rms;
    this.frM[this.frI] = pitch ? freqToMidi(pitch.freq) : NaN;
    this.frC[this.frI] = pitch ? pitch.clarity : 0;
    this.frI = (this.frI + 1) % FR_N;
    if (this.frN < FR_N) this.frN++;
  }

  /** Bỏ lịch sử khung (cao độ) — bao biên giữ nguyên. */
  private env(k: number): number {
    return this.envV[(this.envI - this.envN + k + ENV_N) % ENV_N];
  }
  private envTime(k: number): number {
    return this.envT[(this.envI - this.envN + k + ENV_N) % ENV_N];
  }
  /** bao biên giữ đỉnh 3 khối (sườn lên giữ nguyên, dao động theo pha của nốt trầm được làm phẳng) */
  private held(k: number): number {
    let v = this.env(k);
    if (k >= 1) v = Math.max(v, this.env(k - 1));
    if (k >= 2) v = Math.max(v, this.env(k - 2));
    return v;
  }

  /** Bước nhảy nhanh nhất (khối so với 3 khối trước, ~16 ms) quanh thời điểm `at` — lần gõ có thật sự "bật" không. */
  stepAt(at: number): number {
    let best = 1;
    for (let k = 3; k < this.envN; k++) {
      const tk = this.envTime(k);
      if (tk < at - 0.01 || tk > at + 0.03) continue;
      const r = this.held(k) / Math.max(this.held(k - 3), 1e-9);
      if (r > best) best = r;
    }
    return best;
  }

  /**
   * Đo đặc trưng của nốt `noteMidi` (MIDI số thực của tần số nghe, chưa bù lệch dây) gõ lúc `t0`, tới khung `t`.
   * `raw` (khung tín hiệu thô) + `f0` → đo phổ họa âm (tốn ~1 ms — gọi một lần mỗi nốt).
   */
  features(noteMidi: number, t0: number, t: number, raw?: Float32Array, sr = 48000, f0 = 0): VoiceFeatures {
    const f: VoiceFeatures = { ...NO_FEATURES, midi: noteMidi };
    // ---- bật lên ----
    let ip = -1;
    let P = 0;
    const hiT = Math.min(t, t0 + 0.12);
    for (let k = 0; k < this.envN; k++) {
      const tk = this.envTime(k);
      if (tk < t0 - 0.05 || tk > hiT) continue;
      const v = this.held(k);
      if (v > P) {
        P = v;
        ip = k;
      }
    }
    let tp = t0;
    if (ip >= 0 && P > 0) {
      tp = this.envTime(ip);
      let base = P;
      for (let k = ip; k >= 0 && this.envTime(k) >= tp - ATTACK_BACK; k--) base = Math.min(base, this.held(k));
      const jump = P / Math.max(base, 1e-9);
      // bước nhảy nhanh nhất (khối k so với 3 khối trước ≈ 16 ms) trong số các khối đã lên tới ≥ nửa đỉnh
      let step = 1;
      for (let k = Math.max(3, ip - 30); k <= ip; k++) {
        const h = this.held(k);
        if (h < 0.5 * P || this.envTime(k) < t0 - 0.05) continue;
        const r = h / Math.max(this.held(k - 3), 1e-9);
        if (r > step) step = r;
      }
      f.jump = jump;
      if (jump < VOICE.NO_JUMP) f.attack = 'none';
      else {
        const lo = base + 0.2 * (P - base);
        const hi = base + 0.6 * (P - base);
        let iLo = -1;
        for (let k = ip; k >= 0 && this.envTime(k) >= tp - ATTACK_BACK; k--)
          if (this.held(k) <= lo) {
            iLo = k;
            break;
          }
        let iHi = ip;
        if (iLo >= 0) for (let k = iLo + 1; k <= ip; k++) if (this.held(k) >= hi) {
          iHi = k;
          break;
        }
        const rise = iLo >= 0 ? this.envTime(iHi) - this.envTime(iLo) : NaN;
        f.riseS = rise;
        if (!Number.isFinite(rise)) f.attack = 'unknown';
        else if ((rise <= VOICE.ABRUPT_RISE && jump >= VOICE.ABRUPT_JUMP) || (rise <= VOICE.ABRUPT_BIG_RISE && jump >= VOICE.ABRUPT_BIG)) f.attack = 'abrupt';
        else if (rise <= VOICE.SHARP_RISE && jump >= VOICE.SHARP_JUMP) f.attack = 'sharp';
        else if (rise >= VOICE.SOFT_RISE && step < VOICE.STEP_SOFT_MAX) f.attack = 'soft';
        else f.attack = 'unknown';
        // Bước nhảy nhanh (≤ 16 ms) lên gần đỉnh: tiếng búa dù đang có tiếng khác (bé nói / hát) che phần nền
        if ((f.attack === 'unknown' || f.attack === 'soft') && step >= VOICE.ABRUPT_JUMP) f.attack = 'sharp';
      }
      f.step = step;
    }
    // ---- tắt dần / ngân / phồng (âm lượng từng khung 43 ms — ít dao động theo pha) ----
    let early = 0;
    let lastSum = 0;
    let lastN = 0;
    let after = 0;
    let lastFt = -1;
    for (let j = 0; j < this.frN; j++) {
      const k = (this.frI - this.frN + j + FR_N) % FR_N;
      const ft = this.frT[k];
      const r = this.frR[k];
      if (ft < tp + 0.02 || ft > t + 1e-6) continue;
      if (ft <= tp + 0.07) early = Math.max(early, r);
      else after = Math.max(after, r);
      lastFt = ft;
    }
    for (let j = 0; j < this.frN; j++) {
      const k = (this.frI - this.frN + j + FR_N) % FR_N;
      const ft = this.frT[k];
      if (ft >= t - 0.03 && ft <= t + 1e-6 && ft >= tp + 0.02) {
        lastSum += this.frR[k];
        lastN++;
      }
    }
    f.spanS = lastFt > 0 ? lastFt - tp : 0;
    if (early > 0 && lastN && f.spanS >= VOICE.ENV_SPAN) {
      f.decayDb = 20 * Math.log10(lastSum / lastN / early);
      f.swellDb = after > 0 ? 20 * Math.log10(after / early) : NaN;
    }
    // ---- cao độ ----
    const xs: number[] = [];
    const cs: number[] = [];
    const ec: number[] = [];
    let prevC = NaN;
    let step = NaN;
    for (let j = 0; j < this.frN; j++) {
      const k = (this.frI - this.frN + j + FR_N) % FR_N;
      const m = this.frM[k];
      const ft = this.frT[k];
      if (!Number.isFinite(m) || ft > t + 1e-6 || ft < t0 - 0.02) continue;
      if (Math.abs(m - noteMidi) > 0.9) continue;
      const c = (m - noteMidi) * 100;
      if (this.frC[k] >= 0.7) {
        if (Number.isFinite(prevC)) step = Math.max(Number.isFinite(step) ? step : 0, Math.abs(c - prevC));
        prevC = c;
      }
      if (ft >= t0 + 0.06 && this.frC[k] >= 0.7) {
        xs.push(ft);
        cs.push(c);
      } else if (ft < t0 + 0.06 && this.frC[k] >= 0.85) ec.push(c);
    }
    f.pitchN = cs.length;
    f.stepC = step;
    if (cs.length >= 2) {
      const n = cs.length;
      let mx = 0;
      let my = 0;
      for (let i = 0; i < n; i++) {
        mx += xs[i];
        my += cs[i];
      }
      mx /= n;
      my /= n;
      let sxx = 0;
      let sxy = 0;
      for (let i = 0; i < n; i++) {
        sxx += (xs[i] - mx) * (xs[i] - mx);
        sxy += (xs[i] - mx) * (cs[i] - my);
      }
      const slope = sxx > 0 ? sxy / sxx : 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const r = cs[i] - my - slope * (xs[i] - mx);
        if (r < lo) lo = r;
        if (r > hi) hi = r;
      }
      f.wobbleC = hi - lo;
      f.glideC = slope * (xs[n - 1] - xs[0]);
      if (ec.length) {
        const first = ec.reduce((a, b) => a + b, 0) / ec.length;
        const sorted = cs.slice().sort((a, b) => a - b);
        f.scoopC = first - sorted[n >> 1];
      }
    }
    // ---- phổ họa âm (tín hiệu thô) ----
    if (raw && f0 > 0 && t >= t0 + 0.05) {
      const p = partialFit(raw, sr, f0);
      f.pure = p.pure;
      f.inharm = p.inharm;
    }
    return f;
  }
}
