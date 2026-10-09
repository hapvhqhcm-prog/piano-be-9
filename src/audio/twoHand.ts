/**
 * (+ 2026-10-09) KIỂM TRA HAI TAY quanh một lần gõ phím — app BIẾT tay phải / tay trái phải đàn nốt nào.
 *
 * Micro chỉ nghe ra MỘT cao độ mỗi lúc (YIN), nên trước đây bài hai tay do bố mẹ chấm. Ở đây không "nghe ra" nốt tự
 * do mà hỏi: "trong tiếng vừa đàn có ĐỦ nốt của tay phải / tay trái không, và chúng có VỪA được đàn không?"
 *
 * Trên tín hiệu micro THÔ (không qua lọc 1,6 kHz của đường YIN — cần họa âm 2–6 của nốt trầm Đô3–Sol3, vì âm cơ
 * bản của chúng rất yếu trên micro nhỏ):
 * 1. Khung SAU [gõ + 40 ms, + 160 ms]: analyzeChord (chordVerify.ts — khuôn họa âm có lệch họa âm, NNLS, nốt mồi
 *    nhử lệch ±1 phím / quãng 8) → nốt nào CÓ MẶT.
 * 2. Nốt MỚI: năng lượng ở các họa âm RIÊNG của nốt (không trùng nốt cần đàn khác) trong khung SAU so với khung
 *    TRƯỚC [gõ − 130 ms, − 10 ms]. Nốt cũ còn ngân (bé chưa nhả phím / tay trái giữ nốt trắng) thì tắt dần → không
 *    tăng → không được tính là vừa đàn.
 * 3. Tay "đúng" khi mọi nốt của tay đó có mặt VÀ mới. Thiếu một tay ở khung sau → xem thêm khung MUỘN
 *    [gõ + 160 ms, + 280 ms] (bé đàn tay trái trễ ~0,1 s — vẫn tính là cùng lúc).
 * 4. Tay chưa đúng: thử các phím lệch ±1, ±2 của nốt bị thiếu — có phím nào vừa được đàn → 'wrong' (đàn nhầm phím).
 * Tiếng quá nhỏ / phòng ồn → `conclusive = false` → app dùng cách cũ (bố mẹ / một nốt).
 *
 * Hàm thuần (không Web Audio) → đo trên giả lập đàn cơ (tests/twoHandBench.test.ts).
 */
import { analyzeChord, fft, partialHz, type ChordResult } from './chordVerify';
import type { Tuning } from './pitchDetect';

export type HandName = 'RH' | 'LH';

/** Nốt cần đàn của từng tay trong một nhóm (mảng rỗng / thiếu = tay đó không đàn ở nhóm này). */
export interface HandsSpec {
  RH?: number[];
  LH?: number[];
}

export interface HandCheck {
  verdict: 'hit' | 'miss' | 'wrong';
  present: number[];
  missing: number[];
  /** 'wrong': phím nghe được thay cho nốt cần đàn */
  heard?: number;
  /** Khung nào cho kết quả 'hit' */
  frame?: 'post' | 'late';
}

export interface HandsResult {
  /** false = tiếng nhỏ / ồn → không kết luận, dùng cách cũ */
  conclusive: boolean;
  RH?: HandCheck;
  LH?: HandCheck;
  /** Năng lượng họa âm riêng khung sau / khung trước của từng nốt (> NEW_RISE = vừa đàn) — chẩn đoán / test */
  rise: Record<number, number>;
  snr: number;
  /**
   * Phần năng lượng MỚI (khung sau − khung trước) nằm ở họa âm của các nốt cần đàn (0–1). Tiếng đàn đúng: cao; giọng
   * nói / tiếng động: thấp (năng lượng mới rải ở chỗ khác).
   */
  explained: number;
  /** Độ trôi cao độ (cents) giữa hai nửa khung của từng nốt nghe được — dây đàn đứng yên, giọng nói trượt */
  drift: Record<number, number>;
  /** Đã phải xem khung muộn */
  usedLate: boolean;
}

/** Các khung tính từ lúc gõ (giây). */
export const HANDS_FRAME = {
  pre: [-0.13, -0.01] as const,
  /** Mốc thứ hai sớm hơn: nốt bé đàn ~0,1 s TRƯỚC lần gõ app bắt được (tay kia đàn to hơn) vẫn tính là mới */
  pre2: [-0.3, -0.18] as const,
  post: [0.04, 0.16] as const,
  late: [0.16, 0.28] as const,
};
/** Có kết quả (khi đủ hai tay ở khung sau) bao lâu sau lần gõ (giây). */
export const HANDS_READY_AFTER = HANDS_FRAME.post[1];
/** Có kết quả đầy đủ (kể cả khung muộn) bao lâu sau lần gõ. */
export const HANDS_LATE_READY = HANDS_FRAME.late[1];
/** Cần giữ tín hiệu từ bao lâu trước lần gõ. */
export const HANDS_SPAN_BEFORE = -HANDS_FRAME.pre2[0];

/**
 * Mặc định của Cài đặt "Micro chấm cả 2 tay (thử nghiệm)" (Settings.micTwoHand chưa đặt). BẬT: trên giả lập đàn cơ
 * đạt mục tiêu (tests/twoHandBench.test.ts, TEST_REPORT §35). Bố mẹ tắt được ở màn Phụ huynh → về cách cũ (một cao độ).
 */
export const TWO_HAND_DEFAULT = true;

export const HANDS_TUNING = {
  /** Năng lượng họa âm riêng phải tăng ít nhất bao nhiêu lần so với trước lần gõ ("vừa được đàn") */
  newRise: 1.6,
  /** Phím lệch (nửa cung) được thử khi một tay thiếu nốt → 'wrong' */
  wrongOffsets: [-2, -1, 1, 2] as readonly number[],
  /** Cao độ trôi quá bao nhiêu cents trong khung → không phải dây đàn (giọng nói / tiếng trượt) */
  maxDrift: 16,
  /** Phím bên cạnh mạnh hơn bao nhiêu lần (họa âm riêng) thì coi là bé đàn nhầm */
  pairRatio: 1.0,
  /** Phím c "nghe được" chỉ khi họa âm lẻ của c − 12 yếu hơn tỉ lệ này so với họa âm lẻ của c */
  subOctave: 0.35,
  /** Tiếng đàn tắt dần sau búa gõ; tiếng TO DẦN (giọng nói đầu âm tiết, quạt đang quay nhanh dần) thì không phải phím đàn */
  maxGrow: 1.3,
  /** Khung phải rõ hơn mức "khớp tiếng ồn" bao nhiêu lần mới được ghi nhận một tay (analyzeChord kết luận từ 4) */
  minHitSnr: 6,
};

const PARTIALS = 6;
const TOL_CENTS = 25;
const F_MAX = 4500;

let scratchRe = new Float64Array(0);
let scratchIm = new Float64Array(0);

/** Biên độ phổ (Hann, bù 0 tới N) của seg. */
function spectrum(seg: Float32Array, N: number): Float64Array {
  if (scratchRe.length !== N) {
    scratchRe = new Float64Array(N);
    scratchIm = new Float64Array(N);
  }
  const re = scratchRe;
  const im = scratchIm;
  re.fill(0);
  im.fill(0);
  const L = seg.length;
  let mean = 0;
  for (let i = 0; i < L; i++) mean += seg[i];
  mean /= L || 1;
  for (let i = 0; i < L; i++) re[i] = (seg[i] - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1)));
  fft(re, im);
  // Chia cho tổng cửa sổ → biên độ không phụ thuộc độ dài khung (so được khung 120 ms với khung 240 ms)
  const norm = 2 / Math.max(1, L - 1);
  const out = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) out[k] = Math.hypot(re[k], im[k]) * norm;
  return out;
}

/** Họa âm (tần số) "riêng" của nốt m: không trùng họa âm nào của các nốt `others`. Không có → mọi họa âm. */
function ownPartials(m: number, others: number[], tuningCents: Tuning, lobeHz: number): number[] {
  const tol = (f: number) => f * (Math.pow(2, TOL_CENTS / 1200) - 1);
  const all: number[] = [];
  const own: number[] = [];
  for (let k = 1; k <= PARTIALS; k++) {
    const fp = partialHz(m, k, tuningCents);
    if (fp > F_MAX) break;
    all.push(fp);
    const shared = others.some((o) => {
      for (let j = 1; j <= 8; j++) {
        const fo = partialHz(o, j, tuningCents);
        if (Math.abs(fo - fp) < tol(fp) + tol(fo) + lobeHz) return true;
      }
      return false;
    });
    if (!shared) own.push(fp);
  }
  return own.length ? own : all;
}

/** Năng lượng (tổng bình phương đỉnh) quanh các tần số `fs` trong phổ `mag`. */
function peakEnergy(mag: Float64Array, df: number, fs: number[], lobeHz: number): number {
  let e = 0;
  for (const f of fs) {
    const tol = f * (Math.pow(2, TOL_CENTS / 1200) - 1) + lobeHz / 2;
    const a = Math.max(1, Math.floor((f - tol) / df));
    const b = Math.min(mag.length - 1, Math.ceil((f + tol) / df));
    let p = 0;
    for (let k = a; k <= b; k++) if (mag[k] > p) p = mag[k];
    e += p * p;
  }
  return e;
}

/** Phần năng lượng tăng thêm (sau − trước) rơi vào họa âm (1–8) của các nốt `want`, trong 100–4000 Hz. */
function explainedNew(post: Float64Array, pre: Float64Array, df: number, want: number[], tuningCents: Tuning, lobeHz: number): number {
  const lo = Math.ceil(100 / df);
  const hi = Math.min(post.length - 1, Math.floor(4000 / df));
  const mark = new Uint8Array(hi + 1);
  for (const m of want)
    for (let k = 1; k <= 8; k++) {
      const f = partialHz(m, k, tuningCents);
      if (f > 4000) break;
      const tol = f * (Math.pow(2, TOL_CENTS / 1200) - 1) + lobeHz;
      for (let b = Math.max(lo, Math.floor((f - tol) / df)); b <= Math.min(hi, Math.ceil((f + tol) / df)); b++) mark[b] = 1;
    }
  let inE = 0;
  let all = 0;
  for (let b = lo; b <= hi; b++) {
    const d = post[b] * post[b] - pre[b] * pre[b];
    if (d <= 0) continue;
    all += d;
    if (mark[b]) inE += d;
  }
  return all > 0 ? inE / all : 0;
}

/** Lệch (cents, −100…100) làm "lược" họa âm của nốt m khớp nhất với phổ mag; ±200 nếu khớp ở biên (trôi ra ngoài). */
function combCents(mag: Float64Array, df: number, m: number, tuningCents: Tuning): number {
  const fs: number[] = [];
  for (let k = 1; k <= 8; k++) {
    const f = partialHz(m, k, tuningCents);
    if (f > 4000) break;
    fs.push(f);
  }
  let best = -1;
  let bi = 0;
  const S: number[] = [];
  for (let c = -100, i = 0; c <= 100; c += 2, i++) {
    const r = Math.pow(2, c / 1200);
    let v = 0;
    for (const f of fs) {
      const x = (f * r) / df;
      const k = Math.floor(x);
      if (k + 1 >= mag.length) continue;
      v += mag[k] + (mag[k + 1] - mag[k]) * (x - k);
    }
    S.push(v);
    if (v > best) (best = v), (bi = i);
  }
  if (bi === 0 || bi === S.length - 1) return bi === 0 ? -200 : 200;
  const l = S[bi - 1];
  const c0 = S[bi];
  const rr = S[bi + 1];
  const den = l - 2 * c0 + rr;
  const d = den < 0 ? (0.5 * (l - rr)) / den : 0;
  return -100 + 2 * (bi + Math.max(-1, Math.min(1, d)));
}

/**
 * Cao độ có ĐỨNG YÊN không (dây đàn: có; giọng nói: trượt liên tục): "lược" họa âm của nốt m khớp ở nửa đầu và nửa
 * sau của khung lệch nhau bao nhiêu cents.
 */
function drift(seg: Float32Array, N: number, df: number, m: number, tuningCents: Tuning, fs: number[], lobeHz: number): { cents: number; grow: number } {
  const h = Math.floor(seg.length / 2);
  const A = spectrum(seg.subarray(0, h), N);
  const B = spectrum(seg.subarray(h, 2 * h), N);
  const ea = peakEnergy(A, df, fs, lobeHz);
  const eb = peakEnergy(B, df, fs, lobeHz);
  return { cents: Math.abs(combCents(B, df, m, tuningCents) - combCents(A, df, m, tuningCents)), grow: ea > 0 ? eb / ea : Infinity };
}

function partialList(m: number, tuningCents: Tuning, kMax = 8, fMax = 4000): number[] {
  const out: number[] = [];
  for (let k = 1; k <= kMax; k++) {
    const f = partialHz(m, k, tuningCents);
    if (f > fMax) break;
    out.push(f);
  }
  return out;
}

/** Họa âm bậc k của x có tách khỏi (dung sai + cả búp phổ) mọi họa âm của các nốt `others` không. */
function isolated(x: number, k: number, others: number[], tuningCents: Tuning, lobeHz: number): boolean {
  const tol = (f: number) => f * (Math.pow(2, TOL_CENTS / 1200) - 1);
  const f = partialHz(x, k, tuningCents);
  if (f > 4000) return false;
  return others.every((o) => partialList(o, tuningCents, 10, 4500).every((g) => Math.abs(f - g) > tol(f) + tol(g) + lobeHz));
}

/** Tổng biên độ đỉnh (cửa sổ hẹp ±25 cents) tại các tần số fs. */
function peakSum(mag: Float64Array, df: number, fs: number[]): number {
  let t = 0;
  for (const f of fs) t += Math.sqrt(peakEnergy(mag, df, [f], 2 * df));
  return t;
}

function cut(sig: Float32Array, sr: number, onsetIdx: number, w: readonly [number, number]): Float32Array | null {
  const a = onsetIdx + Math.round(w[0] * sr);
  const b = onsetIdx + Math.round(w[1] * sr);
  if (a < 0 || b > sig.length) return null;
  return sig.subarray(a, b);
}

/**
 * Kiểm tra hai tay quanh lần gõ ở mẫu `onsetIdx` của `sig` (tín hiệu micro THÔ, cần [gõ − 130 ms, gõ + 280 ms];
 * thiếu đoạn muộn thì chỉ xem khung sau).
 * @param late false = chỉ xem khung sau (kết quả sớm, ~160 ms sau lần gõ)
 */
export function analyzeHands(
  sig: Float32Array,
  sampleRate: number,
  onsetIdx: number,
  spec: HandsSpec,
  tuningCents: Tuning = 0,
  late = true,
): HandsResult {
  const rh = [...new Set(spec.RH ?? [])];
  const lh = [...new Set(spec.LH ?? [])];
  const want = [...new Set([...rh, ...lh])].sort((a, b) => a - b);
  const empty: HandsResult = { conclusive: false, rise: {}, drift: {}, snr: 0, explained: 0, usedLate: false };
  const pre = cut(sig, sampleRate, onsetIdx, HANDS_FRAME.pre);
  const post = cut(sig, sampleRate, onsetIdx, HANDS_FRAME.post);
  if (!pre || !post || !want.length) return empty;
  const L = post.length;
  let N = 1;
  while (N < Math.max(L, sampleRate / 3)) N *= 2;
  const df = sampleRate / N;
  const lobeHz = (2 * sampleRate) / L;
  const preMag = spectrum(pre.length === L ? pre : pre.subarray(0, L), N);
  const pre2 = cut(sig, sampleRate, onsetIdx, HANDS_FRAME.pre2);
  const pre2Mag = pre2 ? spectrum(pre2.length >= L ? pre2.subarray(0, L) : pre2, N) : null;
  /** Năng lượng "trước lần gõ" ở các tần số fs: nhỏ hơn của hai mốc (nốt đàn sát trước lần gõ vẫn là mới) */
  const preEnergy = (fs: number[], w = lobeHz) => {
    const a = peakEnergy(preMag, df, fs, w);
    return pre2Mag ? Math.min(a, peakEnergy(pre2Mag, df, fs, w)) : a;
  };
  const own = new Map<number, number[]>();
  const ownOf = (m: number, others: number[]) => ownPartials(m, others, tuningCents, lobeHz);
  for (const m of want) {
    const fs = ownOf(m, want.filter((o) => o !== m));
    own.set(m, fs);
  }
  /**
   * Nhầm phím bên cạnh? (nốt trầm: 120 ms không đủ tách nửa cung ở âm cơ bản — Đô3/Si2 cách nhau 7 Hz.) So các họa
   * âm CHỈ của m với các họa âm CHỈ của phím c lệch ±1, ±2: phím c mạnh hơn và vừa được đàn → bé đàn c, không phải m.
   */
  const confused = (m: number, mag: Float64Array, lobe = lobeHz): number | undefined => {
    const rest = want.filter((o) => o !== m);
    let heard: number | undefined;
    let bestS = 0;
    for (const d of HANDS_TUNING.wrongOffsets) {
      const c = m + d;
      if (want.includes(c) || c < 21) continue;
      // So CÙNG bậc họa âm (độ mạnh tương đương) ở những bậc mà cả hai nốt đều tách khỏi mọi nốt khác
      const ks: number[] = [];
      for (let k = 1; k <= 8; k++)
        if (isolated(m, k, [c, ...rest], tuningCents, lobe) && isolated(c, k, [m, ...rest], tuningCents, lobe)) ks.push(k);
      if (ks.length < 2) continue;
      const fm = ks.map((k) => partialHz(m, k, tuningCents));
      const fc = ks.map((k) => partialHz(c, k, tuningCents));
      const sm = peakSum(mag, df, fm);
      const sc = peakSum(mag, df, fc);
      if (sc <= sm * HANDS_TUNING.pairRatio || sc <= bestS) continue;
      // Họa âm chẵn của c trùng họa âm của c + 12 (bé đàn quãng 8 trên ở tay kia / nhầm phím tay kia) → cần thêm
      // bằng chứng ở họa âm LẺ
      const odd = ks.filter((k) => k % 2 === 1);
      if (!odd.length) continue;
      const sc1 = peakSum(mag, df, odd.map((k) => partialHz(c, k, tuningCents)));
      if (sc1 <= peakSum(mag, df, odd.map((k) => partialHz(m, k, tuningCents)))) continue;
      // … và không phải quãng 8 DƯỚI c đang kêu (mọi họa âm của c đều là họa âm chẵn của c − 12): họa âm lẻ của c − 12
      // (½, 3/2, 5/2 tần số của c) phải gần như im
      const sub = [1, 3, 5].map((k) => partialHz(c - 12, k, tuningCents)).filter((f) => f > 60);
      if (sub.length && peakSum(mag, df, sub) / sub.length > HANDS_TUNING.subOctave * (sc1 / odd.length)) continue;
      const scPre = Math.min(peakSum(preMag, df, fc), pre2Mag ? peakSum(pre2Mag, df, fc) : Infinity);
      if (sc * sc < HANDS_TUNING.newRise * scPre * scPre) continue;
      bestS = sc;
      heard = c;
    }
    return heard;
  };
  // Mức ồn nền của khung trước (trung vị 80–3000 Hz) — để "tăng" có nghĩa khi khung trước gần như im
  const noiseE = (() => {
    const lo = Math.ceil(80 / df);
    const hi = Math.min(preMag.length - 1, Math.floor(3000 / df));
    const t = Array.from(preMag.subarray(lo, hi + 1)).sort((a, b) => a - b);
    const s = t[Math.floor(t.length / 2)] || 1e-12;
    return s * s;
  })();
  /**
   * "Vừa được đàn": trung bình nhân của mức tăng TỪNG họa âm riêng (chỉ các họa âm rõ hơn ồn nền). Đàn lại đúng nốt
   * đang ngân (nốt lặp): họa âm cao đã tắt nhiều → tăng mạnh dù tổng năng lượng tăng ít; nốt chỉ còn ngân: mọi họa âm
   * đều giảm.
   */
  const riseOf = (mag: Float64Array, m: number, fs = own.get(m)!) => {
    const n = noiseE * 4;
    let sl = 0;
    let cnt = 0;
    for (const f of fs) {
      const a = peakEnergy(mag, df, [f], lobeHz);
      if (a < n * 2) continue;
      const b = preEnergy([f]);
      sl += Math.log((a + n) / (b + n));
      cnt++;
    }
    return cnt ? Math.exp(sl / cnt) : 0;
  };

  type Frame = {
    chord: ChordResult;
    rise: Record<number, number>;
    drift: Record<number, number>;
    /** năng lượng nửa sau / nửa đầu khung (dây đàn: tắt dần ≤ 1; giọng nói đang to dần: > 1) */
    grow: Record<number, number>;
    /** nốt có mặt nhưng thật ra là phím bên cạnh (MIDI phím nghe được) */
    swap: Record<number, number | undefined>;
  };
  const evalFrame = (seg: Float32Array): Frame => {
    const chord = analyzeChord(seg, sampleRate, want, tuningCents);
    const mag = spectrum(seg, N);
    const rise: Record<number, number> = {};
    const dr: Record<number, number> = {};
    const grow: Record<number, number> = {};
    const swap: Record<number, number | undefined> = {};
    for (const m of want) {
      rise[m] = riseOf(mag, m);
      const live = chord.present.includes(m) && rise[m] >= HANDS_TUNING.newRise;
      const d = live ? drift(seg, N, df, m, tuningCents, own.get(m)!, 2 * lobeHz) : null;
      dr[m] = d ? d.cents : NaN;
      grow[m] = d ? d.grow : NaN;
      swap[m] = live ? confused(m, mag) : undefined;
    }
    return { chord, rise, drift: dr, grow, swap };
  };
  const handOk = (ms: number[], f: Frame) =>
    ms.every(
      (m) =>
        f.chord.snr >= HANDS_TUNING.minHitSnr &&
        f.chord.present.includes(m) &&
        f.rise[m] >= HANDS_TUNING.newRise &&
        !(f.drift[m] > HANDS_TUNING.maxDrift) &&
        !(f.grow[m] > HANDS_TUNING.maxGrow) &&
        f.swap[m] === undefined,
    );

  const fPost = evalFrame(post);
  const postMag = spectrum(post, N);
  const res: HandsResult = {
    conclusive: fPost.chord.conclusive,
    rise: { ...fPost.rise },
    drift: { ...fPost.drift },
    snr: fPost.chord.snr,
    explained: explainedNew(postMag, preMag, df, want, tuningCents, lobeHz),
    usedLate: false,
  };
  const hands: Array<[HandName, number[]]> = [];
  if (rh.length) hands.push(['RH', rh]);
  if (lh.length) hands.push(['LH', lh]);
  const ok = new Map<HandName, 'post' | 'late'>();
  for (const [h, ms] of hands) if (handOk(ms, fPost)) ok.set(h, 'post');
  let fLate: Frame | null = null;
  if (late && ok.size < hands.length) {
    const seg = cut(sig, sampleRate, onsetIdx, HANDS_FRAME.late);
    if (seg && seg.length >= L) {
      fLate = evalFrame(seg.subarray(0, L));
      res.usedLate = true;
      if (fLate.chord.conclusive) res.conclusive = true;
      for (const [h, ms] of hands) if (!ok.has(h) && handOk(ms, fLate)) ok.set(h, 'late');
      for (const m of want) res.rise[m] = Math.max(res.rise[m], fLate.rise[m]);
      for (const m of want) if (!(res.drift[m] >= 0)) res.drift[m] = fLate.drift[m];
      res.snr = Math.max(res.snr, fLate.chord.snr);
    }
  }
  const longSeg = late ? cut(sig, sampleRate, onsetIdx, [HANDS_FRAME.post[0], HANDS_FRAME.late[1]]) : null;
  const longMag = longSeg ? spectrum(longSeg, N) : null;
  for (const [h, ms] of hands) {
    const frame = ok.get(h);
    const present = ms.filter((m) => fPost.chord.present.includes(m) || !!fLate?.chord.present.includes(m));
    const missing = ms.filter((m) => !present.includes(m));
    if (frame) {
      // Xem kỹ (khung dài 240 ms — tách được nửa cung ở nốt trầm, vd hợp âm Đô3–Mi3–Sol3 bị đàn Rê3 thay Đô3): chỉ
      // khi được hỏi cả khung muộn (theo nhịp; chế độ chờ hỏi thêm sau khi đã cho đi tiếp)
      const sw = longMag ? ms.map((m) => [m, confused(m, longMag, lobeHz / 2)] as const).find(([, c]) => c !== undefined) : undefined;
      if (sw) {
        res[h] = { verdict: 'wrong', present: ms.filter((x) => x !== sw[0]), missing: [sw[0]], heard: sw[1] };
        continue;
      }
      res[h] = { verdict: 'hit', present: ms, missing: [], frame };
      continue;
    }
    // Có mặt nhưng thật ra là phím bên cạnh
    const sw = ms.map((m) => fPost.swap[m] ?? fLate?.swap[m]).find((x) => x !== undefined);
    if (sw !== undefined) {
      const m = ms.find((x) => (fPost.swap[x] ?? fLate?.swap[x]) === sw)!;
      res[h] = { verdict: 'wrong', present: present.filter((x) => x !== m), missing: [m], heard: sw };
      continue;
    }
    // Đàn nhầm phím? Thử các phím lệch của nốt bị thiếu (hoặc nốt "không mới" đầu tiên) cùng các nốt tay kia
    const target = missing[0] ?? ms.find((m) => (fPost.rise[m] ?? 0) < HANDS_TUNING.newRise) ?? ms[0];
    const others = want.filter((m) => m !== target && !ms.includes(m));
    let heard: number | undefined;
    let best = 0;
    for (const d of HANDS_TUNING.wrongOffsets) {
      const c = target + d;
      if (want.includes(c)) continue;
      const set = [...others, c];
      const r = analyzeChord(post, sampleRate, set, tuningCents);
      if (!r.conclusive || !r.present.includes(c)) continue;
      const fs = ownPartials(c, others, tuningCents, lobeHz);
      const rise = riseOf(postMag, c, fs);
      const s = r.strengths[c] ?? 0;
      if (rise >= HANDS_TUNING.newRise && s > best) {
        best = s;
        heard = c;
      }
    }
    res[h] = heard !== undefined ? { verdict: 'wrong', present, missing: missing.length ? missing : [target], heard } : { verdict: 'miss', present, missing };
  }
  return res;
}
