/**
 * GIẢ LẬP ĐÀN CƠ THẬT cho test micro — gần thực tế hơn sóng sin:
 * - âm cơ bản YẾU ở nốt trầm, họa âm bậc 2–8 mạnh, lệch họa âm (inharmonicity) như dây đàn thật
 * - tiếng búa gõ (nhiễu ngắn) lúc bấm, tắt dần 2 giai đoạn, nhả phím thì giảm âm nhanh
 * - tiếng ồn phòng + tiếng ù điện 50 Hz, lực bấm to/nhỏ khác nhau
 */
import { CLICK } from '../src/audio/AudioEngine';

export interface SimNote {
  midi: number;
  start: number; // giây
  dur: number; // giây giữ phím
  vel?: number; // 0.3–1
}

const SIM_RATE_DEFAULT = 48000;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export interface SimOptions {
  noise?: number;
  hum?: number;
  seed?: number;
  gain?: number;
  /** Đàn thật: mỗi nốt 2–3 dây lệch nhau vài cents → tiếng "rung" (beating) */
  strings?: boolean;
  /** Tiếng vang phòng (0–1) */
  reverb?: number;
  /** Lệch dây toàn đàn (cents) — đàn lâu không lên dây */
  detuneCents?: number;
  /** Bé chưa nhả phím cũ đã bấm phím mới: nốt cũ ngân thêm (giây) */
  legato?: number;
  /** Tần số lấy mẫu (mặc định 48 kHz; iPad cũ / tai nghe có thể 44,1 kHz) */
  sampleRate?: number;
  /** Tiếng tích máy đếm nhịp lọt vào micro: các thời điểm (giây) */
  clicks?: Array<{ t: number; accent?: boolean }>;
  /** Biên độ đỉnh tiếng tích tại micro (mặc định 0,3 — loa iPad sát micro) */
  clickLevel?: number;
  /**
   * iOS vừa mở micro: vài trăm ms đầu bộ đệm toàn 0 (phần cứng đang khởi động) rồi mới có tiếng phòng (giây).
   * Mức ồn nền bị "khởi tạo" quá thấp → ngưỡng thấp → cần thích nghi nhanh lúc đầu.
   */
  warmup?: number;
  /**
   * iOS bật "tự chỉnh âm lượng" (AGC) dù app xin tắt: lúc im thì khuếch đại dần (tiếng ồn to lên),
   * gặp tiếng to thì giảm nhanh (tiếng gõ phím bị "nén"). Giá trị = khuếch đại tối đa (vd 4 = +12 dB).
   */
  agc?: number;
}

export function renderPiano(notes: SimNote[], seconds: number, o: SimOptions = {}): Float32Array {
  const SR = o.sampleRate ?? SIM_RATE_DEFAULT;
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  const r = rng(o.seed ?? 7);
  const gain = o.gain ?? 0.25;
  for (const note of notes) {
    const f0 = 440 * Math.pow(2, (note.midi - 69 + (o.detuneCents ?? 0) / 100) / 12);
    const strs = o.strings ? (note.midi < 48 ? [0] : note.midi < 55 ? [-1.5, 1.5] : [-2, 0.5, 2.5]) : [0];
    const held = note.dur + (o.legato ?? 0);
    const vel = note.vel ?? 0.8;
    const B = note.midi < 55 ? 0.0012 : 0.0005;
    // Nốt trầm: âm cơ bản yếu, họa âm bậc 2 mạnh hơn
    const low = note.midi < 55;
    const amps = low ? [0.25, 1, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1] : [1, 0.6, 0.35, 0.2, 0.12, 0.08, 0.05, 0.03];
    const s0 = Math.floor(note.start * SR);
    const tail = 1.2;
    const end = Math.min(n, Math.floor((note.start + held + tail) * SR));
    const phases = amps.map(() => r() * Math.PI * 2);
    for (let i = s0; i < end; i++) {
      const t = (i - s0) / SR;
      // tắt dần: nhanh rồi chậm; nhả phím → giảm âm nhanh (damper)
      let env = 0.6 * Math.exp(-t / 0.18) + 0.4 * Math.exp(-t / 2.5);
      env *= Math.min(1, t / 0.003);
      if (t > held) env *= Math.exp(-(t - held) / 0.08);
      let v = 0;
      for (let k = 0; k < amps.length; k++) {
        const kk = k + 1;
        const fk = kk * f0 * Math.sqrt(1 + B * kk * kk);
        if (fk > 9000) break;
        // họa âm cao tắt nhanh hơn
        // Búa gõ mọi dây CÙNG LÚC → cùng pha lúc đầu; lệch cents làm tiếng "rung" dần về sau
        for (const c of strs) {
          v += (amps[k] / strs.length) * Math.exp(-t * kk * 0.4) * Math.sin(2 * Math.PI * fk * Math.pow(2, c / 1200) * t + phases[k]);
        }
      }
      // tiếng búa gõ
      if (t < 0.015) v += (r() * 2 - 1) * 0.8 * (1 - t / 0.015);
      out[i] += gain * vel * env * v * 0.5;
    }
  }
  // Vang phòng: vài tiếng dội trễ, nhỏ dần
  if (o.reverb) {
    const taps: Array<[number, number]> = [[0.023, 0.5], [0.041, 0.4], [0.067, 0.3], [0.097, 0.22], [0.131, 0.15]];
    const dry = out.slice();
    for (const [d, g] of taps) {
      const off = Math.floor(d * SR);
      for (let i = off; i < n; i++) out[i] += dry[i - off] * g * o.reverb;
    }
  }
  // Tiếng tích máy đếm nhịp (giống AudioEngine.click: sin cao, lên nhanh, tắt nhanh) — đi thẳng loa → micro
  for (const c of o.clicks ?? []) {
    const f = c.accent ? CLICK.accentHz : CLICK.hz;
    const peak = (o.clickLevel ?? 0.3) * (c.accent ? 1 : CLICK.normalGain / CLICK.accentGain);
    const s0 = Math.floor(c.t * SR);
    const len = Math.floor(CLICK.length * SR);
    for (let i = 0; i < len && s0 + i < n; i++) {
      const t = i / SR;
      const env = t < CLICK.attack ? t / CLICK.attack : Math.exp(-(t - CLICK.attack) / CLICK.tau);
      out[s0 + i] += peak * env * Math.sin(2 * Math.PI * f * t);
    }
  }
  const noise = o.noise ?? 0.004;
  const hum = o.hum ?? 0.002;
  for (let i = 0; i < n; i++) out[i] += noise * (r() * 2 - 1) + hum * Math.sin((2 * Math.PI * 50 * i) / SR);
  if (o.agc) applyAgc(out, SR, o.agc);
  if (o.warmup) out.fill(0, 0, Math.min(n, Math.floor(o.warmup * SR)));
  return out;
}

/**
 * AGC giả lập (giống bộ xử lý giọng nói): theo dõi mức RMS khối 10 ms; to hơn mục tiêu → giảm khuếch đại nhanh
 * (τ 20 ms), nhỏ hơn → tăng chậm (τ 1,5 s) tới `maxGain`. Khuếch đại nội suy theo mẫu (không "bậc").
 */
function applyAgc(out: Float32Array, SR: number, maxGain: number): void {
  const block = Math.round(0.01 * SR);
  const target = 0.03;
  const aAtt = 1 - Math.exp(-0.01 / 0.02);
  const aRel = 1 - Math.exp(-0.01 / 1.5);
  let g = 1;
  for (let b = 0; b < out.length; b += block) {
    const end = Math.min(out.length, b + block);
    let s = 0;
    for (let i = b; i < end; i++) s += out[i] * out[i];
    const lvl = Math.sqrt(s / Math.max(1, end - b));
    const want = Math.max(0.25, Math.min(maxGain, lvl > 1e-6 ? target / lvl : maxGain));
    const g0 = g;
    g += (want - g) * (want < g ? aAtt : aRel);
    for (let i = b; i < end; i++) out[i] *= g0 + ((g - g0) * (i - b)) / (end - b);
  }
}

export { SIM_RATE_DEFAULT as SIM_RATE };
