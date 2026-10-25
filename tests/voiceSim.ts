/**
 * GIẢ LẬP GIỌNG BÉ (2026-10-25) — để đo bộ phân biệt giọng / đàn (src/audio/voiceGuard.ts):
 * - HÁT nguyên âm: nguồn thanh môn (chuỗi xung, họa âm nghiêng −7…−9 dB/quãng 8) qua bộ lọc FORMANT (a/o/u/i/e, giọng
 *   trẻ con), vào nốt "vuốt" từ dưới lên (scoop), lên từ từ 60–150 ms, rung giọng 4,5–6,5 Hz ±(20–60) cent bắt đầu
 *   sau ~0,15–0,3 s, trôi cao độ chậm, hơi thở (ồn dải 1–5 kHz), run biên độ nhẹ.
 * - NGÂN NGA (ngậm miệng "ưm"): formant mũi ~250 Hz, họa âm cao rất yếu.
 * - NÓI: âm tiết 0,12–0,3 s, phụ âm bật (ồn ngắn) rồi nguyên âm lên nhanh (~15 ms), cao độ trượt theo ngữ điệu.
 * - HUÝT SÁO: gần như sóng sin thuần (họa âm 2 ≈ −35 dB), rung ±30 cent, lên ~50 ms, chút hơi thở.
 * Mức `level` = biên độ đỉnh xấp xỉ, cùng thang với micro thô RAW của tests/weekSim.ts (đàn nhẹ ≈ 0,001–0,002).
 */
import { SIM_RATE } from './pianoSim';

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Formant giọng trẻ con (Hz) và độ rộng dải. */
export const VOWELS: Record<string, Array<[number, number, number]>> = {
  // [tần số, độ rộng, biên độ]
  a: [[1000, 110, 1], [1650, 140, 0.6], [3300, 250, 0.25]],
  o: [[600, 90, 1], [1000, 120, 0.5], [3000, 250, 0.15]],
  u: [[450, 80, 1], [1100, 140, 0.3], [3000, 250, 0.1]],
  i: [[380, 70, 1], [3000, 200, 0.45], [3700, 250, 0.3]],
  e: [[600, 90, 1], [2500, 180, 0.5], [3500, 250, 0.25]],
  /** ngậm miệng: formant mũi, họa âm cao bị chặn */
  hum: [[250, 100, 1], [1000, 300, 0.06], [2500, 400, 0.02]],
};

function formantGain(f: number, fm: Array<[number, number, number]>): number {
  let g = 0;
  for (const [F, B, A] of fm) g += A / (1 + ((f - F) / B) ** 2);
  return g + 0.02;
}

export interface VoiceNote {
  midi: number;
  start: number;
  dur: number;
}

export interface SingOptions {
  vowel?: keyof typeof VOWELS | 'mix';
  /** rung giọng (cent, nửa biên độ) */
  vibrato?: number;
  vibratoHz?: number;
  /** vào nốt từ thấp hơn bao nhiêu cent (âm = từ dưới) */
  scoop?: number;
  /** thời gian lên (giây) */
  attack?: number;
  /** hơi thở (tỉ lệ so với giọng) */
  breath?: number;
  /** hát lệch cao độ tối đa (± cent) */
  offPitch?: number;
  /** dịch quãng (nửa cung) — bé hát thấp/cao hơn một quãng 8 */
  shift?: number;
}

/** Hát (nguyên âm có formant). */
export function renderSung(notes: VoiceNote[], seconds: number, level: number, seed: number, o: SingOptions = {}, sr = SIM_RATE): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.floor(seconds * sr));
  const vowels = Object.keys(VOWELS).filter((k) => k !== 'hum');
  for (const n of notes) {
    const vw = o.vowel === 'mix' || !o.vowel ? vowels[Math.floor(r() * vowels.length)] : o.vowel;
    const fm = VOWELS[vw];
    const off = (r() - 0.5) * 2 * (o.offPitch ?? 25);
    const f0 = 440 * Math.pow(2, (n.midi + (o.shift ?? 0) - 69 + off / 100) / 12);
    const vib = (o.vibrato ?? 20 + r() * 40) * (vw === 'hum' ? 0.7 : 1);
    const vibHz = o.vibratoHz ?? 4.5 + r() * 2;
    const vibOn = 0.15 + r() * 0.15;
    const scoop = o.scoop ?? -(60 + r() * 120);
    const scoopS = 0.08 + r() * 0.08;
    const att = o.attack ?? 0.06 + r() * 0.09;
    const breath = o.breath ?? 0.05;
    const s0 = Math.floor(n.start * sr);
    const len = Math.floor(n.dur * sr);
    const K = Math.max(1, Math.floor(4500 / f0));
    const amps = new Float64Array(K + 1);
    let ph = r() * 6;
    let nb = 0;
    let nl = 0;
    const drift = r() * 6;
    for (let i = 0; i < len && s0 + i < out.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / att) * Math.min(1, Math.max(0, (n.dur - t) / 0.08)) * (1 + 0.04 * Math.sin(2 * Math.PI * 3.1 * t + drift));
      const sc = t < scoopS ? scoop * (1 - t / scoopS) ** 2 : 0;
      const vb = t > vibOn ? vib * Math.min(1, (t - vibOn) / 0.2) * Math.sin(2 * Math.PI * vibHz * t) : 0;
      const wander = 8 * Math.sin(2 * Math.PI * 0.6 * t + drift);
      const f = f0 * Math.pow(2, (sc + vb + wander) / 1200);
      ph += (2 * Math.PI * f) / sr;
      if (i % 64 === 0) for (let k = 1; k <= K; k++) amps[k] = (formantGain(k * f, fm) / Math.pow(k, vw === 'hum' ? 1.6 : 0.9)) * (k * f < 5000 ? 1 : 0);
      let v = 0;
      for (let k = 1; k <= K; k++) v += amps[k] * Math.sin(k * ph);
      // hơi thở: ồn trắng qua thông cao + thông thấp một cực (~1–5 kHz)
      const w = r() * 2 - 1;
      nb = 0.75 * nb + 0.25 * w;
      nl = w - nb;
      out[s0 + i] += level * env * (0.55 * v + breath * 4 * nl);
    }
  }
  return normalize(out, level);
}

/** Đưa biên độ đỉnh về `level`. */
function normalize(x: Float32Array, level: number): Float32Array {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= level / m;
  return x;
}

/** Ngân nga ngậm miệng ("ưm…"). */
export function renderHumming(notes: VoiceNote[], seconds: number, level: number, seed: number, o: SingOptions = {}, sr = SIM_RATE): Float32Array {
  return renderSung(notes, seconds, level, seed, { breath: 0.01, ...o, vowel: 'hum' }, sr);
}

/** Huýt sáo: sin gần thuần, rung giọng. Mặc định cao hơn giai điệu 2 quãng 8 (bé huýt sáo giai điệu). */
export function renderWhistle(notes: VoiceNote[], seconds: number, level: number, seed: number, o: SingOptions = {}, sr = SIM_RATE): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.floor(seconds * sr));
  for (const n of notes) {
    const f0 = 440 * Math.pow(2, (n.midi + (o.shift ?? 24) - 69 + ((r() - 0.5) * 2 * (o.offPitch ?? 20)) / 100) / 12);
    const vib = o.vibrato ?? 15 + r() * 25;
    const vibHz = o.vibratoHz ?? 5 + r() * 1.5;
    const att = o.attack ?? 0.04 + r() * 0.04;
    const scoop = o.scoop ?? -(30 + r() * 60);
    const s0 = Math.floor(n.start * sr);
    const len = Math.floor(n.dur * sr);
    let ph = 0;
    let nb = 0;
    for (let i = 0; i < len && s0 + i < out.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / att) * Math.min(1, Math.max(0, (n.dur - t) / 0.05));
      const sc = t < 0.06 ? scoop * (1 - t / 0.06) : 0;
      const f = f0 * Math.pow(2, (sc + vib * Math.sin(2 * Math.PI * vibHz * t)) / 1200);
      ph += (2 * Math.PI * f) / sr;
      const w = r() * 2 - 1;
      nb = 0.9 * nb + 0.1 * w;
      out[s0 + i] += level * env * (Math.sin(ph) + 0.018 * Math.sin(2 * ph) + (o.breath ?? 0.04) * 3 * (w - nb));
    }
  }
  return out;
}

/**
 * Nói (âm tiết): bé đọc tên nốt / nói chuyện. `child` = giọng trẻ con (230–330 Hz), không thì người lớn (110–220 Hz).
 * Âm tiết bắt đầu từ `from`, ~3,5 âm tiết/giây, thỉnh thoảng nghỉ.
 */
export function renderSpeech(seconds: number, level: number, seed: number, o: { child?: boolean; from?: number; to?: number } = {}, sr = SIM_RATE): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.floor(seconds * sr));
  const vowels = Object.keys(VOWELS).filter((k) => k !== 'hum');
  let t0 = o.from ?? 0.8;
  const end = Math.min(seconds, o.to ?? seconds);
  const [fLo, fSpan] = o.child ? [230, 100] : [110, 110];
  while (t0 < end - 0.3) {
    const dur = 0.12 + r() * 0.18;
    const fm = VOWELS[vowels[Math.floor(r() * vowels.length)]];
    const fStart = fLo + r() * fSpan;
    const glide = (r() - 0.6) * 500; // cent trong âm tiết (thường đi xuống)
    const plosive = r() < 0.6;
    const s0 = Math.floor(t0 * sr);
    const len = Math.floor(dur * sr);
    let ph = 0;
    const K = Math.floor(4500 / fStart);
    const amps = new Float64Array(K + 1);
    for (let i = 0; i < len && s0 + i < out.length; i++) {
      const t = i / sr;
      const vt = t - (plosive ? 0.012 : 0);
      if (plosive && t < 0.012) out[s0 + i] += level * 0.5 * (r() * 2 - 1) * (1 - t / 0.012);
      if (vt < 0) continue;
      const env = Math.min(1, vt / 0.015) * Math.min(1, Math.max(0, (dur - t) / 0.04));
      const f = fStart * Math.pow(2, (glide * (vt / dur)) / 1200);
      ph += (2 * Math.PI * f) / sr;
      if (i % 64 === 0) for (let k = 1; k <= K; k++) amps[k] = formantGain(k * f, fm) / Math.pow(k, 0.8);
      let v = 0;
      for (let k = 1; k <= K; k++) v += amps[k] * Math.sin(k * ph);
      out[s0 + i] += level * env * 0.5 * v;
    }
    t0 += dur + 0.05 + r() * 0.12 + (r() < 0.15 ? 0.5 : 0);
  }
  return normalize(out, level);
}

/** Cộng nhiều tín hiệu (độ dài theo cái dài nhất). */
export function mix(...xs: Float32Array[]): Float32Array {
  const n = Math.max(...xs.map((x) => x.length));
  const out = new Float32Array(n);
  for (const x of xs) for (let i = 0; i < x.length; i++) out[i] += x[i];
  return out;
}
