/**
 * KIỂM TRA HỢP ÂM ĐANG CHỜ (không phải "nghe ra" nốt tự do): app BIẾT bé cần đàn những nốt nào,
 * chỉ cần hỏi "trong tiếng vừa đàn có đủ các nốt đó không?".
 *
 * Cách làm (một khung ~150 ms ngay sau lần gõ phím, bỏ ~50 ms đầu là tiếng búa):
 * 1. Cửa sổ Hann, bù 0 tới 16384 điểm → mỗi ô phổ ≈ 2,9 Hz (48 kHz) / 2,7 Hz (44,1 kHz).
 * 2. "Khuôn" họa âm cho từng nốt cần đàn + nốt "mồi nhử" (lệch ±1 phím, quãng 8 trên/dưới):
 *    6 họa âm, lệch họa âm nhẹ như dây đàn thật, dung sai ±25 cents (đàn nhà lệch dây).
 * 3. Bình phương tối thiểu KHÔNG ÂM (NNLS) → độ mạnh của từng nốt.
 * 4. Nốt "có mặt" khi mạnh hơn các mồi nhử của nó, vượt mức ồn nền và không quá yếu so với nốt mạnh nhất.
 * Tiếng quá nhỏ / phòng quá ồn → `conclusive = false` → dùng cách cũ (match.ts).
 *
 * Hàm thuần (không Web Audio) → đo được trên giả lập đàn cơ (tests/chordBench.test.ts).
 */

export interface ChordResult {
  /** true = đủ rõ để kết luận; false = tiếng nhỏ / ồn → nên dùng cách cũ */
  conclusive: boolean;
  present: number[];
  missing: number[];
  /** Độ mạnh từng nốt cần đàn (0–1, so với nốt mạnh nhất trong mọi khuôn) */
  strengths: Record<number, number>;
  /** Khuôn mạnh nhất (cả mồi nhử) gấp bao nhiêu lần mức "khuôn khớp với tiếng ồn" */
  snr: number;
  /** Độ mạnh mọi khuôn (cả mồi nhử) và mức "khớp tiếng ồn" của chúng — để chẩn đoán / test */
  all?: Record<number, { s: number; noise: number; own?: number; ownNoise?: number; ownWeight?: number }>;
}

/** Khung phân tích tính từ lúc gõ phím (giây): bỏ tiếng búa, lấy phần ngân ổn định. */
export const CHORD_FRAME = { startAfter: 0.05, length: 0.15 } as const;
/** Kết quả có sau lần gõ bao lâu (giây). */
export const CHORD_READY_AFTER = CHORD_FRAME.startAfter + CHORD_FRAME.length;

const PARTIALS = 6;
const TOL_CENTS = 25;
const F_MAX = 4500;
const F_MIN = 50;

/** Ngưỡng (đo trên giả lập — xem tests/chordBench.test.ts) */
export const CHORD_TUNING = {
  /** Nốt phải mạnh hơn mồi nhử mạnh nhất của nó bao nhiêu lần */
  decoyRatio: 1.0,
  /** Tối thiểu so với nốt cần đàn mạnh nhất */
  relMin: 0.12,
  /** Tối thiểu so với mức "khuôn khớp với tiếng ồn" */
  noiseRatio: 3,
  /** Bằng chứng riêng (họa âm không trùng nốt khác) tối thiểu so với độ mạnh chung của nốt */
  ownRatio: 0.4,
  /**
   * Họa âm riêng chiếm ít hơn tỉ lệ này của khuôn (vd Sol4 khi có Đô3: họa âm 1, 2 của Sol4 trùng họa âm 3, 6
   * của Đô3) → "không kiểm chứng được": chỉ báo thiếu khi hoàn toàn không thấy gì.
   */
  verifiableWeight: 0.45,
  /** SNR tối thiểu để kết luận */
  minSnr: 4,
};

// ---------- FFT cơ số 2 (bảng tính sẵn theo kích thước) ----------
const fftTables = new Map<number, { cos: Float64Array; sin: Float64Array; rev: Uint32Array }>();
function tables(n: number) {
  let t = fftTables.get(n);
  if (t) return t;
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  t = { cos, sin, rev };
  fftTables.set(n, t);
  return t;
}

/** FFT tại chỗ (re, im độ dài n = lũy thừa 2). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  const { cos, sin, rev } = tables(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j;
        const b = a + half;
        const tr = re[b] * cos[k] - im[b] * sin[k];
        const ti = re[b] * sin[k] + im[b] * cos[k];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/** Biên độ phổ của cửa sổ Hann tại độ lệch Δ (đơn vị: ô phổ KHÔNG bù 0), chuẩn hóa W(0) = 1. */
function hannKernel(d: number): number {
  const a = Math.abs(d);
  if (a < 1e-9) return 1;
  if (Math.abs(a - 1) < 1e-9) return 0.5;
  if (a >= 4) return 0;
  const s = Math.sin(Math.PI * a) / (Math.PI * a);
  return Math.abs(s / (1 - a * a));
}

/** Tần số họa âm bậc k của nốt (có lệch họa âm nhẹ như dây đàn thật). */
export function partialHz(midi: number, k: number, tuningCents = 0): number {
  const f0 = 440 * Math.pow(2, (midi - 69 + tuningCents / 100) / 12);
  const B = midi < 55 ? 0.0007 : 0.0004;
  return k * f0 * Math.sqrt(1 + B * k * k);
}

/** Độ mạnh điển hình của các họa âm (nốt trầm: âm cơ bản yếu). */
function partialWeight(midi: number, k: number): number {
  if (midi < 55) return [0.5, 1, 0.8, 0.6, 0.45, 0.35][k - 1];
  return [1, 0.7, 0.5, 0.35, 0.25, 0.18][k - 1];
}

/** Các nốt mồi nhử: lệch ±1 phím và quãng 8 trên/dưới của mỗi nốt cần đàn (bỏ nốt trùng với nốt cần đàn). */
export function decoysOf(expected: number[]): Map<number, number[]> {
  const set = new Set(expected);
  const out = new Map<number, number[]>();
  for (const m of expected) {
    out.set(
      m,
      [m - 1, m + 1, m - 12, m + 12].filter((d) => !set.has(d) && d >= 21 && d <= 108),
    );
  }
  return out;
}

/** Bình phương tối thiểu không âm trên ma trận Gram (G x ≈ b, x ≥ 0) — hạ theo từng tọa độ. */
export function nnlsGram(G: Float64Array, b: Float64Array, n: number, sweeps = 400): Float64Array {
  const x = new Float64Array(n);
  for (let s = 0; s < sweeps; s++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const gii = G[i * n + i];
      if (gii <= 0) continue;
      let g = -b[i];
      for (let j = 0; j < n; j++) g += G[i * n + j] * x[j];
      const nx = Math.max(0, x[i] - g / gii);
      moved = Math.max(moved, Math.abs(nx - x[i]));
      x[i] = nx;
    }
    if (moved < 1e-9) break;
  }
  return x;
}

let scratchRe = new Float64Array(0);
let scratchIm = new Float64Array(0);

/**
 * Phân tích một khung (thường dài CHORD_FRAME.length giây, bắt đầu CHORD_FRAME.startAfter sau lần gõ).
 * @param seg      tín hiệu micro THÔ (chưa lọc)
 * @param expected các nốt cần đàn (MIDI)
 */
export function analyzeChord(seg: Float32Array, sampleRate: number, expected: number[], tuningCents = 0): ChordResult {
  const want = [...new Set(expected)].sort((a, b) => a - b);
  const L = seg.length;
  let N = 1;
  while (N < Math.max(L, sampleRate / 3)) N *= 2;
  if (scratchRe.length !== N) {
    scratchRe = new Float64Array(N);
    scratchIm = new Float64Array(N);
  }
  const re = scratchRe;
  const im = scratchIm;
  re.fill(0);
  im.fill(0);
  let mean = 0;
  for (let i = 0; i < L; i++) mean += seg[i];
  mean /= L || 1;
  for (let i = 0; i < L; i++) re[i] = (seg[i] - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1)));
  fft(re, im);
  const df = sampleRate / N;
  const kMax = Math.min(N / 2 - 1, Math.ceil(F_MAX / df));
  const kMin = Math.floor(F_MIN / df);
  const nb = kMax - kMin + 1;
  const y = new Float64Array(nb);
  for (let k = kMin; k <= kMax; k++) y[k - kMin] = Math.hypot(re[k], im[k]);

  // Mức ồn nền: trung vị biên độ phổ 80–3000 Hz (đa số ô không có họa âm nào)
  const lo = Math.ceil(80 / df) - kMin;
  const hi = Math.min(nb - 1, Math.floor(3000 / df) - kMin);
  const tmp = Array.from(y.subarray(Math.max(0, lo), hi + 1)).sort((a, b) => a - b);
  const sigma = tmp[Math.floor(tmp.length / 2)] || 1e-12;

  // Khuôn: nốt cần đàn + mồi nhử
  const decoys = decoysOf(want);
  const cands = [...new Set([...want, ...[...decoys.values()].flat()])];
  const n = cands.length;
  const binsPerUnpadded = N / L; // 1 ô "thật" (không bù 0) = bao nhiêu ô sau bù 0
  const cols: Array<{ start: number; v: Float64Array }> = [];
  for (const m of cands) {
    const fTop = partialHz(m, PARTIALS, tuningCents) * Math.pow(2, TOL_CENTS / 1200);
    const fBot = partialHz(m, 1, tuningCents) * Math.pow(2, -TOL_CENTS / 1200);
    const start = Math.max(kMin, Math.floor(fBot / df - 4 * binsPerUnpadded));
    const end = Math.min(kMax, Math.ceil(Math.min(F_MAX, fTop) / df + 4 * binsPerUnpadded));
    const v = new Float64Array(Math.max(0, end - start + 1));
    for (let k = 1; k <= PARTIALS; k++) {
      const fp = partialHz(m, k, tuningCents);
      if (fp > F_MAX) break;
      const w = partialWeight(m, k);
      const tolHz = fp * (Math.pow(2, TOL_CENTS / 1200) - 1);
      const a = Math.max(start, Math.floor((fp - tolHz) / df - 4 * binsPerUnpadded));
      const b = Math.min(end, Math.ceil((fp + tolHz) / df + 4 * binsPerUnpadded));
      for (let kk = a; kk <= b; kk++) {
        const f = kk * df;
        // Đỉnh "phẳng" trong ±25 cents: lệch trong dung sai coi như đúng chỗ
        const off = f < fp - tolHz ? fp - tolHz - f : f > fp + tolHz ? f - fp - tolHz : 0;
        const val = w * hannKernel(off / df / binsPerUnpadded);
        if (val > v[kk - start]) v[kk - start] = val;
      }
    }
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= norm;
    cols.push({ start, v });
  }
  // Gram của mọi khuôn + tích vô hướng với phổ đo được
  const G = new Float64Array(n * n);
  const noiseCoef = new Float64Array(n);
  const dot = (i: number, v: Float64Array) => {
    const ci = cols[i];
    let s = 0;
    for (let t = 0; t < ci.v.length; t++) s += ci.v[t] * v[ci.start + t - kMin];
    return s;
  };
  for (let i = 0; i < n; i++) {
    const ci = cols[i];
    let sa = 0;
    for (let t = 0; t < ci.v.length; t++) sa += ci.v[t];
    noiseCoef[i] = sigma * sa;
    for (let j = i; j < n; j++) {
      const cj = cols[j];
      const a0 = Math.max(ci.start, cj.start);
      const a1 = Math.min(ci.start + ci.v.length, cj.start + cj.v.length);
      let g = 0;
      for (let k = a0; k < a1; k++) g += ci.v[k - ci.start] * cj.v[k - cj.start];
      G[i * n + j] = g;
      G[j * n + i] = g;
    }
  }
  const sub = (idx: number[]) => {
    const m = idx.length;
    const g = new Float64Array(m * m);
    idx.forEach((a, i) => idx.forEach((b, j) => (g[i * m + j] = G[a * n + b])));
    return g;
  };
  // Bước 1: chỉ các nốt CẦN ĐÀN giải thích phổ. (Nếu cho mồi nhử thi cùng lúc, nốt quãng 8 dưới nốt trầm nhất
  // "giải thích" luôn cả hợp âm trưởng — họa âm 2–6 của nó chính là Đô–Sol–Đô–Mi–Sol.)
  const wi = want.map((_, i) => i);
  const xw = nnlsGram(sub(wi), Float64Array.from(wi, (i) => dot(i, y)), wi.length);
  // Bước 2: mồi nhử chỉ được giải thích PHẦN CÒN LẠI (năng lượng mà các nốt cần đàn không giải thích được)
  const res = Float64Array.from(y);
  wi.forEach((i) => {
    const ci = cols[i];
    for (let t = 0; t < ci.v.length; t++) res[ci.start + t - kMin] -= xw[i] * ci.v[t];
  });
  for (let i = 0; i < nb; i++) if (res[i] < 0) res[i] = 0;
  const di = cands.map((_, i) => i).slice(want.length);
  const xd = di.length ? nnlsGram(sub(di), Float64Array.from(di, (i) => dot(i, res)), di.length) : new Float64Array(0);
  const x = new Float64Array(n);
  wi.forEach((i, k) => (x[i] = xw[k]));
  di.forEach((i, k) => (x[i] = xd[k]));
  const str = new Map<number, number>();
  cands.forEach((m, i) => str.set(m, x[i]));
  const top = Math.max(1e-12, ...x);
  let snr = 0;
  for (let i = 0; i < n; i++) snr = Math.max(snr, x[i] / Math.max(1e-12, noiseCoef[i]));

  // Bằng chứng RIÊNG của từng nốt: chỉ xét các họa âm KHÔNG trùng họa âm của nốt cần đàn khác
  // (Đô3 có họa âm 3, 5, 6 trùng Sol4, Mi4, Sol4 → nếu bé đàn Rê3 thay Đô3, NNLS vẫn có thể "mượn" chúng cho Đô3).
  const lobeHz = (2 * sampleRate) / L;
  const tolOf = (f: number) => f * (Math.pow(2, TOL_CENTS / 1200) - 1);
  /** Bằng chứng riêng của nốt m khi các nốt `others` có mặt; null = không có họa âm riêng nào. */
  const ownOf = (m: number, others: number[]): { s: number; noise: number; weight: number } | null => {
    const ci = cols[want.indexOf(m)];
    let num = 0;
    let den = 0;
    let sa = 0;
    for (let k = 1; k <= PARTIALS; k++) {
      const fp = partialHz(m, k, tuningCents);
      if (fp > F_MAX) break;
      const shared = others.some((o) => {
        for (let j = 1; j <= PARTIALS; j++) {
          const fo = partialHz(o, j, tuningCents);
          if (Math.abs(fo - fp) < tolOf(fp) + tolOf(fo) + lobeHz) return true;
        }
        return false;
      });
      if (shared) continue;
      const a = Math.max(ci.start, Math.floor((fp - tolOf(fp) - lobeHz) / df));
      const b = Math.min(ci.start + ci.v.length - 1, Math.ceil((fp + tolOf(fp) + lobeHz) / df));
      for (let kk = a; kk <= b; kk++) {
        const v = ci.v[kk - ci.start];
        num += v * y[kk - kMin];
        den += v * v;
        sa += v;
      }
    }
    return den > 1e-6 ? { s: num / den, noise: (sigma * sa) / den, weight: den } : null;
  };

  const topWant = Math.max(1e-12, ...want.map((m) => str.get(m) ?? 0));
  const own = new Map<number, { s: number; noise: number; weight: number } | null>();
  // Loại dần: mỗi vòng chỉ kết luận VẮNG một nốt — nốt có bằng chứng riêng "đáng tin" nhất (nhiều họa âm riêng nhất).
  // Nốt vắng thì không còn "che" họa âm của nốt khác → xét lại (vd sai nốt trầm Đô3: Sol4 lấy lại họa âm 1, 2).
  const absent = new Set<number>();
  for (let round = 0; round < want.length; round++) {
    let worst = -1;
    let worstW = -1;
    for (const m of want) {
      if (absent.has(m)) continue;
      const s = str.get(m) ?? 0;
      const u = ownOf(m, want.filter((o) => o !== m && !absent.has(o)));
      own.set(m, u);
      const dmax = Math.max(0, ...(decoys.get(m) ?? []).map((d) => str.get(d) ?? 0));
      let ok: boolean;
      if (u && u.weight < CHORD_TUNING.verifiableWeight) {
        // Hầu hết họa âm trùng với nốt TRẦM hơn (Đô5 khi có Fa3, Mi4 khi có La2, Sol4 khi có Đô3): không thể chắc
        // nốt này vắng (khuôn họa âm của nốt trầm không bao giờ khớp đúng từng đàn) → chỉ báo thiếu khi
        // cả NNLS chung lẫn họa âm riêng đều không thấy gì.
        ok = s >= CHORD_TUNING.relMin * topWant || u.s > u.noise;
      } else {
        // Đủ họa âm riêng → tin bằng chứng riêng (NNLS chung có thể "mượn" họa âm của nốt khác cho nốt vắng:
        // bé đàn Rê3 thay Đô3 thì họa âm 3, 5, 6 của Đô3 vẫn có — chúng là của Sol4, Mi4)
        const e = u ? u.s : s;
        const noise = u ? u.noise : noiseCoef[cands.indexOf(m)];
        ok =
          (!u || u.s >= CHORD_TUNING.ownRatio * s) &&
          e > CHORD_TUNING.decoyRatio * dmax &&
          e >= CHORD_TUNING.relMin * topWant &&
          e > CHORD_TUNING.noiseRatio * noise;
      }
      const w = u ? u.weight : 0;
      if (!ok && w > worstW) {
        worst = m;
        worstW = w;
      }
    }
    if (worst < 0) break;
    absent.add(worst);
  }
  const present = want.filter((m) => !absent.has(m));
  const missing = want.filter((m) => absent.has(m));
  const strengths: Record<number, number> = {};
  for (const m of want) strengths[m] = (str.get(m) ?? 0) / top;
  const all: Record<number, { s: number; noise: number; own?: number; ownNoise?: number; ownWeight?: number }> = {};
  cands.forEach((m, i) => {
    const u = own.get(m);
    all[m] = { s: x[i] / top, noise: noiseCoef[i] / top, ...(u ? { own: u.s / top, ownNoise: u.noise / top, ownWeight: u.weight } : {}) };
  });
  return { conclusive: snr >= CHORD_TUNING.minSnr, present, missing, strengths, snr, all };
}
