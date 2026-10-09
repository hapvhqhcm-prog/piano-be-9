/**
 * voiceAnalysis — "dựng" tiếng một nốt THEO THAM SỐ (không cần Web Audio / OfflineAudioContext) để đo khách quan:
 * biên độ từng họa âm theo thời gian (bao biên × đáp ứng lọc thông thấp × chuẩn hóa PeriodicWave), từ đó tính
 * trọng tâm phổ (độ sáng), tốc độ tắt từng bậc (dB/s), độ to RMS. Dùng cho tests/pianoTone.test.ts và trang ?soundtest.
 *
 * Xấp xỉ: các dây/lớp cộng theo CÔNG SUẤT (nhịp phách trung bình hóa); tiếng búa / giảm chấn / hồi âm bỏ qua
 * (nhiễu ngắn, không đổi cao độ). Lọc biquad lowpass của Web Audio với Q = 0 dB (Q tuyến tính = 1).
 */
import {
  ampsToTable,
  bodyAmps,
  brightAmps,
  brightEvents,
  cutoffEvents,
  gainEvents,
  harmonicTable,
  paramAt,
  voiceParams,
  warmVoiceParams,
  type VoiceModel,
} from './pianoVoice';

/** Biên độ thật các bậc sau chuẩn hóa của createPeriodicWave (đỉnh dạng sóng = 1). */
export function normalizedAmps(table: { real: Float32Array; imag: Float32Array }, samples = 2048): Float64Array {
  const n = table.real.length;
  let peak = 1e-12;
  for (let i = 0; i < samples; i++) {
    const ph = (2 * Math.PI * i) / samples;
    let x = 0;
    for (let k = 1; k < n; k++) x += table.real[k] * Math.cos(k * ph) + table.imag[k] * Math.sin(k * ph);
    peak = Math.max(peak, Math.abs(x));
  }
  const out = new Float64Array(n);
  for (let k = 1; k < n; k++) out[k] = Math.hypot(table.real[k], table.imag[k]) / peak;
  return out;
}

/** |H(f)| của biquad lowpass (xấp xỉ analog, Q tuyến tính). */
export function lowpassMag(f: number, fc: number, q = 1): number {
  const r = f / Math.max(fc, 1);
  return 1 / Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2);
}

export interface Component {
  /** tần số (Hz) */
  hz: number;
  /** biên độ tại thời điểm t */
  amp: number;
}

const cache = new Map<string, Float64Array>();
function amps(kind: 'classic' | 'body' | 'bright', freq: number): Float64Array {
  const key = `${kind}:${freq.toFixed(3)}`;
  let a = cache.get(key);
  if (!a) {
    const table =
      kind === 'classic' ? harmonicTable(freq) : ampsToTable(kind === 'body' ? bodyAmps(freq) : brightAmps(freq));
    a = normalizedAmps(table);
    cache.set(key, a);
  }
  return a;
}

/**
 * Các thành phần phổ của một nốt tại thời điểm t (giây sau lúc bấm). vol, duration như scheduleFreq().
 * Ghi chú: engine dựng PeriodicWave theo tần số ĐẠI DIỆN của dải nửa quãng tám (waveKey); ở đây dùng đúng freq — sai
 * khác rất nhỏ (phổ đổi chậm theo âm vực).
 */
export function components(model: VoiceModel, freq: number, vol: number, duration: number, t: number): Component[] {
  const out: Component[] = [];
  if (model === 'classic') {
    const p = voiceParams(freq, vol, duration);
    const env = paramAt(gainEvents(p), t);
    const fc = paramAt(cutoffEvents(p), t);
    const a = amps('classic', freq);
    const strings = Math.sqrt(1 + p.string2Gain ** 2);
    for (let k = 1; k < a.length; k++) {
      const hz = k * freq;
      out.push({ hz, amp: env * a[k] * strings * lowpassMag(hz, fc) });
    }
    return out;
  }
  const p = warmVoiceParams(freq, vol, duration);
  const env = paramAt(gainEvents(p), t);
  const fc = paramAt(cutoffEvents(p), t);
  const body = amps('body', freq);
  const strings = Math.sqrt(1 + p.string2Gain ** 2);
  for (let k = 1; k < body.length; k++) {
    const hz = k * freq;
    out.push({ hz, amp: env * body[k] * strings * lowpassMag(hz, fc) });
  }
  if (p.brightGain > 0) {
    const be = paramAt(brightEvents(p), t);
    const br = amps('bright', freq);
    const stretch = Math.pow(2, p.brightCents / 1200);
    for (let k = 2; k < br.length; k++) out.push({ hz: k * freq * stretch, amp: be * br[k] });
  }
  return out;
}

/** Trọng tâm phổ (Hz, trọng số biên độ) — đại lượng "độ sáng" chuẩn trong nghiên cứu âm sắc. */
export function spectralCentroid(model: VoiceModel, freq: number, vol: number, duration: number, t: number): number {
  let s = 0;
  let sf = 0;
  for (const c of components(model, freq, vol, duration, t)) {
    s += c.amp;
    sf += c.amp * c.hz;
  }
  return s > 0 ? sf / s : 0;
}

/** Biên độ (gộp công suất) của bậc k tại t — gồm cả phần lớp sáng ở bậc đó. */
export function partialAmp(model: VoiceModel, freq: number, vol: number, duration: number, k: number, t: number): number {
  let pw = 0;
  for (const c of components(model, freq, vol, duration, t)) {
    if (Math.abs(c.hz / freq - k) < 0.08) pw += c.amp * c.amp;
  }
  return Math.sqrt(pw);
}

/** Tốc độ tắt trung bình của bậc k giữa t0 và t1 (dB/s, dương = đang nhỏ đi). */
export function partialDecayRate(
  model: VoiceModel,
  freq: number,
  k: number,
  t0: number,
  t1: number,
  vol = 1,
): number {
  const a0 = partialAmp(model, freq, vol, 10, k, t0);
  const a1 = partialAmp(model, freq, vol, 10, k, t1);
  if (!(a0 > 0) || !(a1 > 0)) return Infinity;
  return (20 * Math.log10(a0 / a1)) / (t1 - t0);
}

/** Độ to RMS (tuyến tính) trung bình trong [t0, t1] — tổng công suất mọi thành phần (sin: A²/2). */
export function rmsLevel(model: VoiceModel, freq: number, vol: number, duration: number, t0: number, t1: number, steps = 50): number {
  let pw = 0;
  for (let i = 0; i < steps; i++) {
    const t = t0 + ((i + 0.5) / steps) * (t1 - t0);
    for (const c of components(model, freq, vol, duration, t)) pw += (c.amp * c.amp) / 2;
  }
  return Math.sqrt(pw / steps);
}

/** Số nút Web Audio tạo cho MỘT nốt (khớp AudioEngine.scheduleFreq — test kiểm chứng bằng context giả). */
export function nodesPerNote(model: VoiceModel, freq: number, vol: number, duration: number, light: boolean): number {
  if (light) return 3; // 1 dây + lọc + bao biên (cả hai mô hình)
  if (model === 'classic') return 7; // 2 dây + gain dây 2 + lọc + bao biên + búa (nguồn + gain)
  const p = warmVoiceParams(freq, vol, duration);
  // 2 dây + gain dây 2 + lọc + bao biên + búa (nguồn + gain) [+ lớp sáng (osc + gain)] [+ nguồn giảm chấn]
  return 7 + (p.brightGain > 0 ? 2 : 0) + (p.damperGain > 0 ? 1 : 0);
}
