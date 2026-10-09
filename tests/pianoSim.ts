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
  /**
   * (+ 2026-10-09) "Giãn dây" theo nốt (cents, cộng thêm vào detuneCents) — đàn thật: dây cao lên cao hơn, dây trầm
   * thấp hơn một chút. Xem `stretch()`.
   */
  stretchCents?: (midi: number) => number;
  /** (+ 2026-10-09) Nhân hệ số lệch họa âm B (mặc định 1: B = 0,0012 dưới Sol3, 0,0005 từ Sol3) — đàn đứng nhỏ: 2 */
  inharm?: number;
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
  /**
   * iOS "lọc ồn" (noise suppression của chế độ thoại — Safari có thể vẫn bật dù app xin tắt): bộ trừ phổ theo
   * từng dải tần, ước lượng "ồn" bám CHẬM theo năng lượng của dải (τ ≈ nsTau) → tiếng búa/đầu nốt đi qua,
   * phần NGÂN (ổn định) bị giảm dần tới `ns` dB sau ~150–300 ms; ồn nền đứng yên cũng bị giảm.
   */
  ns?: number;
  /** Thời gian bộ lọc ồn "học" một âm đứng yên (giây, mặc định 0,2) */
  nsTau?: number;
}

/**
 * Giãn dây kiểu đàn thật: 0 ở Đô4–Đô5, tuyến tính tới `lowC3` cent ở Đô3 (48) và `highC6` cent ở Đô6 (84), tiếp tục
 * cùng độ dốc ra ngoài.
 */
export function stretch(lowC3: number, highC6: number): (midi: number) => number {
  return (m) => (m < 60 ? (lowC3 * (60 - m)) / 12 : m > 72 ? (highC6 * (m - 72)) / 12 : 0);
}

export function renderPiano(notes: SimNote[], seconds: number, o: SimOptions = {}): Float32Array {
  const SR = o.sampleRate ?? SIM_RATE_DEFAULT;
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  const r = rng(o.seed ?? 7);
  const gain = o.gain ?? 0.25;
  for (const note of notes) {
    const f0 = 440 * Math.pow(2, (note.midi - 69 + ((o.detuneCents ?? 0) + (o.stretchCents?.(note.midi) ?? 0)) / 100) / 12);
    const strs = o.strings ? (note.midi < 48 ? [0] : note.midi < 55 ? [-1.5, 1.5] : [-2, 0.5, 2.5]) : [0];
    const held = note.dur + (o.legato ?? 0);
    const vel = note.vel ?? 0.8;
    const B = (note.midi < 55 ? 0.0012 : 0.0005) * (o.inharm ?? 1);
    // Nốt trầm: âm cơ bản yếu, họa âm bậc 2 mạnh hơn
    const low = note.midi < 55;
    const amps = low ? [0.25, 1, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1] : [1, 0.6, 0.35, 0.2, 0.12, 0.08, 0.05, 0.03];
    const s0 = Math.floor(note.start * SR);
    const tail = 1.2;
    const end = Math.min(n, Math.floor((note.start + held + tail) * SR));
    const phases = amps.map(() => r() * Math.PI * 2);
    // Hằng số theo họa âm/dây tính trước (cùng thứ tự phép tính như công thức gốc → kết quả y hệt, nhanh hơn nhiều)
    const nh = amps.findIndex((_, k) => (k + 1) * f0 * Math.sqrt(1 + B * (k + 1) * (k + 1)) > 9000);
    const H = nh < 0 ? amps.length : nh;
    const ws: number[][] = [];
    const as: number[] = [];
    for (let k = 0; k < H; k++) {
      const kk = k + 1;
      const fk = kk * f0 * Math.sqrt(1 + B * kk * kk);
      ws.push(strs.map((c) => 2 * Math.PI * fk * Math.pow(2, c / 1200)));
      as.push(amps[k] / strs.length);
    }
    for (let i = s0; i < end; i++) {
      const t = (i - s0) / SR;
      // tắt dần: nhanh rồi chậm; nhả phím → giảm âm nhanh (damper)
      let env = 0.6 * Math.exp(-t / 0.18) + 0.4 * Math.exp(-t / 2.5);
      env *= Math.min(1, t / 0.003);
      if (t > held) env *= Math.exp(-(t - held) / 0.08);
      let v = 0;
      for (let k = 0; k < H; k++) {
        const kk = k + 1;
        // họa âm cao tắt nhanh hơn
        // Búa gõ mọi dây CÙNG LÚC → cùng pha lúc đầu; lệch cents làm tiếng "rung" dần về sau
        const w = ws[k];
        const ph = phases[k];
        for (let j = 0; j < w.length; j++) {
          v += as[k] * Math.exp(-t * kk * 0.4) * Math.sin(w[j] * t + ph);
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
  if (o.ns) applyNoiseSuppression(out, SR, o.ns, o.nsTau ?? 0.2);
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

/** FFT phức tại chỗ (radix-2) — chỉ dùng trong giả lập. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n);
}

/**
 * Lọc ồn kiểu thoại (giả lập): STFT 1024 mẫu, bước 256 (cửa sổ Hann căn bậc hai, chồng-cộng). Mỗi dải tần:
 * ước lượng ồn N bám LÊN chậm (τ = tau) và XUỐNG nhanh (τ 30 ms) theo công suất P; hệ số = max(gmin, √(1 − N/P)).
 * → âm ngân đều (nốt đàn đang ngân, ù điện, quạt) bị giảm tới −dB sau vài trăm ms; đầu nốt (búa gõ) đi qua.
 */
function applyNoiseSuppression(out: Float32Array, SR: number, dB: number, tau: number): void {
  const N = 1024;
  const hop = 256;
  const gmin = Math.pow(10, -dB / 20);
  const dt = hop / SR;
  const aUp = 1 - Math.exp(-dt / tau);
  const aDown = 1 - Math.exp(-dt / 0.03);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const noise = new Float64Array(N / 2 + 1).fill(-1);
  const res = new Float64Array(out.length + N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  // Hann căn bậc 2 hai lần, bước N/4 → tổng cửa sổ = 2 → chia 2
  for (let s = -N + hop; s < out.length; s += hop) {
    for (let i = 0; i < N; i++) {
      const k = s + i;
      re[i] = k >= 0 && k < out.length ? out[k] * win[i] : 0;
      im[i] = 0;
    }
    fft(re, im, false);
    for (let k = 0; k <= N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      if (noise[k] < 0) noise[k] = p;
      else noise[k] += (p - noise[k]) * (p > noise[k] ? aUp : aDown);
      const g = p > 0 ? Math.max(gmin, Math.sqrt(Math.max(0, 1 - noise[k] / p))) : gmin;
      re[k] *= g;
      im[k] *= g;
      if (k > 0 && k < N / 2) {
        re[N - k] = re[k];
        im[N - k] = -im[k];
      }
    }
    fft(re, im, true);
    for (let i = 0; i < N; i++) {
      const k = s + i;
      if (k >= 0 && k < out.length) res[k] += (re[i] * win[i]) / 2;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = res[i];
}

/**
 * Lọc ồn kiểu thoại DẠNG DÒNG (cùng thuật toán applyNoiseSuppression) — cho mô phỏng vòng kín (tests/weekSim.ts):
 * tín hiệu được nối thêm dần; mẫu k là "xong" khi mọi khung STFT phủ nó đã xử lý (cần đọc trước 1024 mẫu ≈ 21 ms).
 */
export class StreamNS {
  private readonly N = 1024;
  private readonly hop = 256;
  private readonly gmin: number;
  private readonly aUp: number;
  private readonly aDown: number;
  private readonly win = new Float64Array(1024);
  private readonly noise = new Float64Array(513).fill(-1);
  private readonly re = new Float64Array(1024);
  private readonly im = new Float64Array(1024);
  /** đầu ra (chồng-cộng) */
  readonly out: Float64Array;
  /** khung kế tiếp bắt đầu ở mẫu này; mọi mẫu < s đã xong */
  private s: number;
  constructor(SR: number, dB: number, tau: number, private readonly total: number) {
    const dt = this.hop / SR;
    this.gmin = Math.pow(10, -dB / 20);
    this.aUp = 1 - Math.exp(-dt / tau);
    this.aDown = 1 - Math.exp(-dt / 0.03);
    for (let i = 0; i < this.N; i++) this.win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.N));
    this.out = new Float64Array(total + this.N);
    this.s = -this.N + this.hop;
  }
  /** Xử lý các khung có đủ dữ liệu (`input` đã đúng tới `avail`, không gồm). Trả về số mẫu đầu ra đã xong. */
  advance(input: Float32Array, avail: number): number {
    const { N, hop, re, im, win, noise } = this;
    while (this.s < this.total && (this.s + N <= avail || avail >= this.total)) {
      const s = this.s;
      for (let i = 0; i < N; i++) {
        const k = s + i;
        re[i] = k >= 0 && k < this.total ? input[k] * win[i] : 0;
        im[i] = 0;
      }
      fft(re, im, false);
      for (let k = 0; k <= N / 2; k++) {
        const p = re[k] * re[k] + im[k] * im[k];
        if (noise[k] < 0) noise[k] = p;
        else noise[k] += (p - noise[k]) * (p > noise[k] ? this.aUp : this.aDown);
        const g = p > 0 ? Math.max(this.gmin, Math.sqrt(Math.max(0, 1 - noise[k] / p))) : this.gmin;
        re[k] *= g;
        im[k] *= g;
        if (k > 0 && k < N / 2) {
          re[N - k] = re[k];
          im[N - k] = -im[k];
        }
      }
      fft(re, im, true);
      for (let i = 0; i < N; i++) {
        const k = s + i;
        if (k >= 0 && k < this.total) this.out[k] += (re[i] * win[i]) / 2;
      }
      this.s += hop;
    }
    return Math.min(this.total, Math.max(0, this.s));
  }
}

export { SIM_RATE_DEFAULT as SIM_RATE };
