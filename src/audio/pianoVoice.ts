/**
 * pianoVoice — phần THUẦN (không Web Audio) của tiếng đàn tổng hợp, để test được.
 *
 * Mô hình mỗi nốt (rẻ CPU, ~7 nút Web Audio):
 *   2 "dây" (oscillator PeriodicWave cùng phổ, lệch nhau ~1 cent → nhịp phách nhẹ như dây đôi/ba)
 *   + tiếng búa gõ (nhiễu hồng ngắn dùng chung một buffer)
 *   → lọc thông thấp có tần số cắt tụt dần (đánh mạnh = sáng, ngân lâu = tối dần)
 *   → bao biên 2 giai đoạn (tắt nhanh ngay sau búa, rồi ngân chậm) + nhả phím có giảm chấn.
 * Phòng nhỏ: hồi âm sinh thủ tục (ConvolverNode dùng chung) ở bus chính.
 */

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

const C4 = 261.63;

/** Thời gian tắt tự nhiên (giây) — giữ đúng công thức cũ: ~2,4 s ở C3, ~1,1 s ở C5. */
export function naturalDecay(freq: number): number {
  return clamp(2.4 * Math.pow(130.8 / freq, 0.55), 0.8, 2.6);
}

/** Cân bằng âm lượng theo âm vực: loa iPad không phát nổi bass sâu (đỡ ù/nén), treble bớt chói. */
export function registerGain(freq: number): number {
  let g = 1;
  if (freq < 150) g *= Math.pow(freq / 150, 0.3);
  if (freq > 900) g *= Math.pow(900 / freq, 0.3);
  return g;
}

export interface VoiceParams {
  /** Thời điểm tương đối so với lúc bấm phím (giây). */
  attack: number;
  peak: number;
  /** Giai đoạn 1: tiến về kneeTarget·peak với hằng số thời gian tau1, tới tKnee. */
  tau1: number;
  kneeTarget: number;
  tKnee: number;
  /** Giai đoạn 2: tiến về 0 với tau2 (ngân). */
  tau2: number;
  /** Nhả phím (giảm chấn) tại tOff, hằng số tauRel; im hẳn tại tEnd. */
  tOff: number;
  tauRel: number;
  tEnd: number;
  /** Lọc thông thấp: cutStart → cutEnd với tauCut. */
  cutStart: number;
  cutEnd: number;
  tauCut: number;
  /** Dây thứ 2: lệch (cent) và mức so với dây 1. */
  detuneCents: number;
  string2Gain: number;
  /** Tiếng búa: mức đỉnh và hằng số tắt. */
  thumpGain: number;
  thumpTau: number;
}

/** Băm số nguyên đơn giản (tất định) → [0, 1). */
function hash01(n: number): number {
  let x = (Math.imul(n | 0, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  return x / 4294967296;
}

/** Midi (thực) từ tần số. */
export const freqToMidi = (f: number): number => 69 + 12 * Math.log2(f / 440);

/**
 * Tham số một nốt. vol: 1 ≈ mf/f bình thường (cũ: peak 0,5·vol); duration: thời gian giữ phím.
 */
export function voiceParams(freq: number, vol: number, duration: number): VoiceParams {
  const f = clamp(freq, 20, 8000);
  const v = clamp(vol, 0.05, 1.5); // độ mạnh (velocity) cho độ sáng
  const decayT = naturalDecay(f);
  const peak = 0.5 * Math.max(0, vol) * registerGain(f);
  const attack = 0.003;
  // Giai đoạn 1 ("prompt sound"): ~0,2 s ở C4, ngắn hơn ở cao
  const tau1 = clamp(0.2 * Math.pow(C4 / f, 0.5), 0.05, 0.4);
  const kneeTarget = 0.3;
  const tKnee = attack + 1.5 * tau1;
  const kneeLevel = kneeTarget + (1 - kneeTarget) * Math.exp(-1.5); // ≈ 0,456
  // Giai đoạn 2: tới decayT còn ~6 % đỉnh (≈ −24 dB) như cũ
  const tau2 = Math.max(0.25, (decayT - tKnee) / Math.log(kneeLevel / 0.06));
  const tOff = Math.max(attack + 0.02, Math.min(duration, decayT));
  // Giảm chấn: nhanh nhưng không "cụp" (bass chậm hơn)
  const tauRel = clamp(0.03 * Math.pow(C4 / f, 0.35), 0.02, 0.07);
  const tEnd = tOff + 5 * tauRel;
  const cutStart = clamp(f * (3 + 9 * v) + 1500 * v, f * 2, 15000);
  const cutEnd = clamp(f * (2 + 1.5 * v) + 300, f * 1.3, 8000);
  const tauCut = clamp(0.35 * Math.pow(C4 / f, 0.4), 0.12, 0.8);
  const m = Math.round(freqToMidi(f));
  // Lệch 0,6–1,6 cent (dấu xen kẽ theo phím) — giữa/cao rõ hơn, bass ít
  const detuneCents = (0.6 + hash01(m) * 1.0) * (m % 2 ? 1 : -1) * (f < 110 ? 0.5 : 1);
  return {
    attack,
    peak,
    tau1,
    kneeTarget,
    tKnee,
    tau2,
    tOff,
    tauRel,
    tEnd,
    cutStart,
    cutEnd,
    tauCut,
    detuneCents,
    string2Gain: 0.45,
    thumpGain: 0.22 * clamp(v, 0, 1.2) * Math.pow(C4 / Math.max(f, C4), 0.4),
    thumpTau: 0.012,
  };
}

/** Một sự kiện tự động hóa AudioParam (áp vào Web Audio y nguyên thứ tự). */
export type ParamEvent =
  | { kind: 'set'; t: number; v: number }
  | { kind: 'ramp'; t: number; v: number }
  | { kind: 'target'; t: number; v: number; tau: number };

/** Các sự kiện bao biên âm lượng (thời gian tương đối). Hàm thuần. */
export function gainEvents(p: VoiceParams): ParamEvent[] {
  const ev: ParamEvent[] = [
    { kind: 'set', t: 0, v: 0 },
    { kind: 'ramp', t: p.attack, v: p.peak },
    { kind: 'target', t: p.attack, v: p.peak * p.kneeTarget, tau: p.tau1 },
  ];
  if (p.tKnee < p.tOff) ev.push({ kind: 'target', t: p.tKnee, v: 0, tau: p.tau2 });
  ev.push({ kind: 'target', t: p.tOff, v: 0, tau: p.tauRel });
  ev.push({ kind: 'set', t: p.tEnd, v: 0 });
  return ev;
}

/** Sự kiện tần số cắt lọc thông thấp. */
export function cutoffEvents(p: VoiceParams): ParamEvent[] {
  return [
    { kind: 'set', t: 0, v: p.cutStart },
    { kind: 'target', t: p.attack, v: p.cutEnd, tau: p.tauCut },
  ];
}

/** Giá trị của chuỗi sự kiện tại thời điểm t (mô phỏng Web Audio, đủ cho test). */
export function paramAt(events: ParamEvent[], t: number): number {
  let v = 0;
  let prevT = 0;
  let prevV = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.t > t) {
      if (e.kind === 'ramp') return prevV + ((e.v - prevV) * (t - prevT)) / Math.max(1e-9, e.t - prevT);
      return v;
    }
    if (e.kind === 'target') {
      // giá trị lúc bắt đầu = giá trị hiện tại; chạy tới sự kiện kế tiếp (hoặc t)
      const next = events[i + 1];
      const until = next && next.t <= t ? next.t : t;
      const start = v;
      v = e.v + (start - e.v) * Math.exp(-(until - e.t) / e.tau);
      prevT = until;
      prevV = v;
      continue;
    }
    v = e.v;
    prevT = e.t;
    prevV = v;
  }
  return v;
}

/**
 * Phổ "dây đàn" cho PeriodicWave: biên độ bậc n ~ sin(π·n·x)/(n^1.3) (búa gõ ở ~1/8 dây → khuyết bậc 8),
 * pha giả ngẫu nhiên (tất định) để dạng sóng ít nhọn. Số bậc giới hạn để n·f ≤ ~10 kHz.
 */
export function harmonicTable(freq: number): { real: Float32Array; imag: Float32Array } {
  const n = clamp(Math.floor(10000 / Math.max(freq, 20)), 1, 40);
  const real = new Float32Array(n + 1);
  const imag = new Float32Array(n + 1);
  const x = 0.12;
  const s1 = Math.sin(Math.PI * x);
  for (let k = 1; k <= n; k++) {
    let a = Math.abs(Math.sin(Math.PI * k * x)) / (s1 * Math.pow(k, 1.15));
    if (k === 1 && freq < 110) a *= 0.7; // bass: loa nhỏ không phát nổi cơ bản → nghiêng về họa âm
    const ph = k === 1 ? 0 : hash01(k * 7919) * 2 * Math.PI;
    real[k] = a * Math.sin(ph);
    imag[k] = a * Math.cos(ph);
  }
  return { real, imag };
}

/** Khóa cache PeriodicWave theo dải nửa quãng tám (phổ ít đổi trong dải). */
export function waveKey(freq: number): number {
  return Math.round(freqToMidi(clamp(freq, 20, 8000)) / 6);
}

/** Tần số đại diện cho một waveKey (dùng để dựng bảng phổ). */
export function waveKeyFreq(key: number): number {
  return 440 * Math.pow(2, (key * 6 - 69) / 12);
}

/** PRNG tất định (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nhiễu "búa gõ": nhiễu hồng-nâu (tích phân rò) chuẩn hóa đỉnh 1. Dùng chung cho mọi nốt. */
export function thumpNoise(sampleRate: number, seconds = 0.12, seed = 7): Float32Array {
  const len = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(len);
  const r = rng(seed);
  let lp = 0;
  let peak = 1e-9;
  for (let i = 0; i < len; i++) {
    const w = r() * 2 - 1;
    lp = lp * 0.9 + w * 0.1; // ~ thông thấp vài trăm Hz…1 kHz
    out[i] = lp + w * 0.15;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < len; i++) out[i] /= peak;
  return out;
}

/** Hồi âm phòng nhỏ: nhiễu tắt dần theo hàm mũ, đuôi tối dần; trễ đầu ~10 ms. */
export const REVERB_SECONDS = 0.9;
export const REVERB_RT60 = 0.9;

export function roomImpulse(sampleRate: number, seconds = REVERB_SECONDS, rt60 = REVERB_RT60, seed = 3): Float32Array {
  const len = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(len);
  const r = rng(seed);
  const pre = Math.floor(0.01 * sampleRate);
  const k = Math.log(1000) / rt60; // −60 dB sau rt60
  let lp = 0;
  for (let i = pre; i < len; i++) {
    const t = (i - pre) / sampleRate;
    // Hệ số lọc giảm dần → đuôi tối dần (cao tần tắt nhanh hơn)
    const a = 0.25 + 0.65 * Math.min(1, t / seconds);
    lp = lp * a + (r() * 2 - 1) * (1 - a);
    const fadeOut = Math.min(1, (len - i) / (0.05 * sampleRate));
    out[i] = lp * Math.exp(-k * t) * fadeOut;
  }
  return out;
}

/* ───────────────────────── (+ 2026-10-09) Mô hình "ấm" — OWNER: "Tiếng đàn mẫu hay hơn" ─────────────────────────
 * Giữ nguyên khung thời gian của mô hình cũ (bao biên 2 giai đoạn, naturalDecay, nhả phím → tEnd) để các mốc micro
 * (isSounding / lastSoundEnd + REVERB_GUARD_MS) KHÔNG đổi; thêm vào:
 *   • Phổ theo âm vực, 2 LỚP: "thân" (bậc thấp, ngân lâu, qua lọc tối dần) + "sáng" (bậc cao, tắt nhanh — hằng số
 *     thời gian ngắn hơn hẳn; đánh mạnh → lớp sáng to hơn) ⇒ họa âm cao tắt nhanh hơn họa âm thấp như đàn thật.
 *   • Tính không hòa âm (inharmonicity) của dây thép: f_k = k·f0·√(1 + B·k²). PeriodicWave chỉ làm được bậc đúng
 *     bội số → lớp sáng được nâng cao đúng bằng độ lệch của bậc trọng tâm của nó (vài cent) → ánh "kim loại" lúc gõ.
 *   • Tiếng búa đi thẳng ra (không qua bao biên chính) + tiếng GIẢM CHẤN khi nhả phím sớm (nhiễu trầm rất khẽ).
 *   • Dây cao từ Fa6 trở lên không có giảm chấn (như đàn thật) → nhả phím tắt chậm hơn một chút.
 *   • Bus chung (KHÔNG tốn nút theo nốt): cộng hưởng bầu đàn (2 bộ lọc đỉnh), đặt trái/phải theo âm vực, hồi âm stereo.
 */

/** Kiểu tiếng đàn: 'classic' = tiếng trước 2026-10-09 (giữ để so sánh A/B), 'warm' = mặc định mới. */
export type VoiceModel = 'classic' | 'warm';

/** Hệ số không hòa âm B theo cao độ (xấp xỉ số đo đàn grand: ~1e-4 ở C2, ~3,5e-4 ở C4, ~1,2e-3 ở C6). */
export function inharmonicityB(freq: number): number {
  const m = freqToMidi(clamp(freq, 20, 8000));
  return clamp(3.5e-4 * Math.pow(2, ((m - 60) / 12) * 0.9), 8e-5, 4e-3);
}

/** Tần số thật của bậc k khi có không hòa âm (Fletcher 1964). */
export function stretchedPartial(freq: number, k: number, B = inharmonicityB(freq)): number {
  return k * freq * Math.sqrt(1 + B * k * k);
}

/** Dây từ Fa6 (midi 89) trở lên không có giảm chấn. */
export const UNDAMPED_MIDI = 89;
/** Hệ số âm lượng mô hình ấm (khớp độ to RMS 0–0,5 s với mô hình cũ ở Đô4 mf ± 1 dB — xem tests/pianoTone.test.ts). */
export const WARM_LEVEL = 0.8;

export interface WarmParams extends VoiceParams {
  /** Lớp sáng (bậc ≥ 2, nâng cao brightCents): mức đỉnh (so với peak) và hằng số tắt. 0 = không có lớp sáng. */
  brightGain: number;
  brightTau: number;
  brightCents: number;
  /** Tiếng giảm chấn khi nhả phím (0 = không). Mức tuyệt đối. */
  damperGain: number;
  /** Đặt trái/phải theo âm vực (−1…1; bass trái, treble phải — góc nhìn người đàn). */
  pan: number;
}

/** Bậc trọng tâm (theo năng lượng) của lớp sáng — để chọn độ nâng cao lớp sáng. */
function brightCentroidK(freq: number): number {
  const amps = brightAmps(freq);
  let s = 0;
  let sk = 0;
  for (let k = 1; k < amps.length; k++) {
    s += amps[k] * amps[k];
    sk += k * amps[k] * amps[k];
  }
  return s > 0 ? sk / s : 2;
}

/** Tham số một nốt mô hình ấm. Khung thời gian (tOff, tEnd trừ dây không giảm chấn) giống hệt voiceParams(). */
export function warmVoiceParams(freq: number, vol: number, duration: number): WarmParams {
  const base = voiceParams(freq, vol, duration);
  const f = clamp(freq, 20, 8000);
  const v = clamp(vol, 0.05, 1.5);
  const m = Math.round(freqToMidi(f));
  const peak = base.peak * WARM_LEVEL;
  // Lớp sáng mang phần lớn bậc cao lúc gõ → lọc của lớp thân tối hơn mô hình cũ
  const cutStart = clamp(f * (2.5 + 6 * v) + 900 * v, f * 2, 12000);
  const cutEnd = clamp(f * (1.8 + 1.2 * v) + 250, f * 1.3, 6000);
  // Lớp sáng: đánh mạnh sáng hơn rõ (v^1.4); treble ít bậc → nhỏ dần, tắt hẳn khi bậc 2 > 9 kHz
  const brightGain = 2 * f > 9000 ? 0 : clamp(0.55 * Math.pow(v, 1.4) * Math.pow(C4 / Math.max(f, 65), 0.15), 0, 0.9);
  const brightTau = clamp(0.13 * Math.pow(C4 / f, 0.45), 0.035, 0.3);
  const B = inharmonicityB(f);
  const kc = brightCentroidK(f);
  const brightCents = clamp(600 * Math.log2(1 + B * kc * kc), 0.5, 6);
  const undamped = m >= UNDAMPED_MIDI;
  const tauRel = undamped ? clamp(base.tauRel * 3, 0.06, 0.12) : base.tauRel;
  const tEnd = base.tOff + 5 * tauRel;
  // Giảm chấn chỉ kêu khi nhả SỚM (dây còn rung) và dây có giảm chấn
  const damped = !undamped && base.tOff < naturalDecay(f) - 0.05 && duration >= 0.12;
  const damperGain = damped ? peak * 0.07 * clamp(v, 0.3, 1.2) * Math.pow(C4 / Math.max(f, C4), 0.3) : 0;
  const pan = clamp((m - 60) / 36, -1, 1) * 0.3;
  return {
    ...base,
    peak,
    cutStart,
    cutEnd,
    tauRel,
    tEnd,
    // Búa đi thẳng ra (không qua bao biên chính) → nhân mức đỉnh nốt cho bằng mô hình cũ, bớt 30 % (đỡ "cộc")
    thumpGain: base.thumpGain * peak * 0.7,
    brightGain,
    brightTau,
    brightCents,
    damperGain,
    pan,
  };
}

/** Sự kiện bao biên lớp sáng (thời gian tương đối; mức so với peak đã nhân). */
export function brightEvents(p: WarmParams): ParamEvent[] {
  const lvl = p.peak * p.brightGain;
  const stop = Math.min(p.tOff, p.attack + 8 * p.brightTau);
  return [
    { kind: 'set', t: 0, v: 0 },
    { kind: 'ramp', t: p.attack * 0.7, v: lvl },
    { kind: 'target', t: p.attack * 0.7, v: 0, tau: p.brightTau },
    { kind: 'target', t: stop, v: 0, tau: Math.min(p.brightTau, p.tauRel) },
    { kind: 'set', t: Math.min(p.tEnd, stop + 5 * Math.min(p.brightTau, p.tauRel)), v: 0 },
  ];
}

/** Hệ số "lược" do búa gõ ở vị trí x của dây (bậc k gần bội của 1/x yếu đi). */
function hammerComb(k: number, x: number): number {
  return Math.abs(Math.sin(Math.PI * k * x)) / Math.sin(Math.PI * x);
}

/** Vị trí búa theo âm vực: ~1/8 ở giữa, gần đầu dây hơn ở treble. */
function hammerPos(freq: number): number {
  return clamp(0.125 - 0.025 * ((freqToMidi(freq) - 60) / 36), 0.08, 0.14);
}

/** Biên độ lớp THÂN (bậc 1…n): dốc ~k^−1,7; bass: cơ bản yếu (loa nhỏ), bậc 2–4 nổi; treble gần sin. */
export function bodyAmps(freq: number): Float32Array {
  const f = clamp(freq, 20, 8000);
  const n = clamp(Math.floor(6000 / f), 1, 24);
  const a = new Float32Array(n + 1);
  const x = hammerPos(f);
  const slope = f < 130 ? 1.3 : f < 520 ? 1.75 : 2.0;
  for (let k = 1; k <= n; k++) a[k] = hammerComb(k, x) / Math.pow(k, slope);
  if (f < 110) a[1] *= 0.6;
  else if (f < 160) a[1] *= 0.8;
  return a;
}

/** Biên độ lớp SÁNG (bậc 2…n, không có cơ bản): dốc ~k^−0,9 × thông thấp dạ búa ~4,5 kHz, tới ~10 kHz. */
export function brightAmps(freq: number): Float32Array {
  const f = clamp(freq, 20, 8000);
  const n = clamp(Math.floor(10000 / f), 1, 40);
  const a = new Float32Array(n + 1);
  const x = hammerPos(f);
  // dạ búa: thông thấp mềm ~4,5 kHz (bậc rất cao yếu đi)
  for (let k = 2; k <= n; k++) a[k] = hammerComb(k, x) / Math.pow(k, 0.9) / (1 + ((k * f) / 4500) ** 2);
  if (n >= 2) a[2] *= 0.5; // bậc 2 chủ yếu nằm ở lớp thân (ít lệch) — tránh nhịp phách chậm với lớp thân
  return a;
}

/** Biên độ → bảng real/imag cho PeriodicWave với pha giả ngẫu nhiên tất định. */
export function ampsToTable(amps: Float32Array, seed = 7919): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(amps.length);
  const imag = new Float32Array(amps.length);
  for (let k = 1; k < amps.length; k++) {
    const ph = k === 1 ? 0 : hash01(k * seed) * 2 * Math.PI;
    real[k] = amps[k] * Math.sin(ph);
    imag[k] = amps[k] * Math.cos(ph);
  }
  return { real, imag };
}

/** Hồi âm stereo (2 kênh lệch nhau) cho mô hình ấm: phản xạ sớm thưa + đuôi tối dần; RT60 ≤ phòng cũ. */
export const WARM_REVERB_SECONDS = 0.85;
export const WARM_REVERB_RT60 = 0.8;

export function roomImpulseStereo(
  sampleRate: number,
  seconds = WARM_REVERB_SECONDS,
  rt60 = WARM_REVERB_RT60,
): [Float32Array, Float32Array] {
  const make = (seed: number, early: number[]): Float32Array => {
    const out = roomImpulse(sampleRate, seconds, rt60, seed);
    const k = Math.log(1000) / rt60;
    // Vài phản xạ sớm (tường gần) — dấu xen kẽ, nhỏ dần
    early.forEach((ms, i) => {
      const idx = Math.floor((ms / 1000) * sampleRate);
      if (idx < out.length) out[idx] += (i % 2 ? -1 : 1) * 0.5 * Math.exp((-k * ms) / 1000);
    });
    return out;
  };
  return [make(3, [7, 13, 23, 31]), make(11, [9, 17, 26, 37])];
}
