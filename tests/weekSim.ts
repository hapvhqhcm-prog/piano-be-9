/**
 * MÔ PHỎNG BÉ ĐÀN BÀI THẬT CỦA GIÁO TRÌNH qua ĐÚNG đường chấm của app (tuần 4–10):
 * - Từng nốt (chờ) — song.ts startWait/onWaitInput: con trỏ chờ nốt; micro nghe đúng → sang nốt + resetTracker();
 *   nghe nốt khác → "đàn sai" (wWrongThis). Vòng KÍN: app chưa sang nốt thì bé đàn lại nốt đó (như bé thật).
 * - Theo nhịp — song.ts startTempo: tiếng tích + chấm bằng gradeTiming (cửa sổ "dễ"), mốc nốt = HeardNote.at.
 * - Từng nốt / Nhại lại (practice.ts): âm mẫu của app (micro bỏ qua lúc app phát) → bé đàn lại theo thứ tự.
 * Tín hiệu: tests/pianoSim.ts — iPad "thô" (RAW, −60…−66 dBFS khi đàn nhẹ), có/không lọc ồn iOS (ns).
 */
import { MicAnalyzer, type AppSound, type Sensitivity } from '../src/audio/micAnalyzer';
import { TuningLearner, type TuningEstimator } from '../src/audio/autoTune';
import { matchHeard } from '../src/audio/match';
import { gradeTiming, TIMING_WINDOWS } from '../src/music/timing';
import { handOnsets, totalBeats, type Tune } from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';
import { renderPiano, SIM_RATE, StreamNS, type SimNote, type SimOptions } from './pianoSim';

/** iPad thật, micro thô (như micBench RAW, bỏ `legato` — ở đây độ ngân do bé giữ phím quyết định). */
export const RAW: SimOptions = { strings: true, reverb: 0.6, gain: 0.004, noise: 0.00025, hum: 0.0001 };
/** Lực bấm: nhẹ (mp/p — v0.16.1 "NHẸ") và bình thường. */
export const VEL = {
  soft: [0.25, 0.5] as [number, number],
  normal: [0.55, 0.9] as [number, number],
  /** rất nhẹ (p) */
  pp: [0.2, 0.32] as [number, number],
  /** to nhỏ lẫn lộn (f rồi p) */
  wide: [0.2, 0.95] as [number, number],
};
const HOP = 0.025;
const FRAME = 2048;
/** Tiếng tích máy đếm nhịp tại micro, cùng tỉ lệ với RAW (micBench: 0,4 khi gain 0,08 → 0,02 khi gain 0,004). */
const CLICK_LEVEL = 0.02;

export interface Cond {
  vel: [number, number];
  /** iOS lọc ồn (dB); 0 = tắt */
  ns?: number;
  /** 'song' = tốc độ bài, 'slow' = bé chậm (chờ: ~1,2 s/nốt; theo nhịp: 40 nhịp/phút), 'fast' = nấc 72 (chờ: bé đàn liền tay) */
  tempo: 'song' | 'slow' | 'fast';
  /** Bé chưa nhả phím cũ khi bấm phím mới (giây, tối đa) */
  overlap: number;
  /** Bé đàn sai rồi sửa, ngập ngừng, đàn lại nốt trước */
  mistakes?: boolean;
  seed: number;
  sens?: Sensitivity;
  sim?: SimOptions;
  /**
   * (+ 2026-10-09) Tự học lệch dây (như MicListener): nốt đang chờ → TuningLearner → `est`; bộ nhận nốt dùng
   * `est.map()` khi đã áp dụng. Dùng chung một `est` qua nhiều bài = giữ kết quả đã học (Cài đặt).
   */
  autoTune?: TuningEstimator;
  /** Bù tay (Cài đặt micTuningCents) */
  tuningCents?: number;
}

/** Gắn tự học lệch dây vào MicAnalyzer (giống MicListener.learnTuning). */
function tuner(an: MicAnalyzer, c: Cond): (f: ReturnType<MicAnalyzer['process']>, expected: () => number[] | null) => void {
  an.tuningCents = c.tuningCents ?? 0;
  const est = c.autoTune;
  if (!est) return () => undefined;
  const L = new TuningLearner(est);
  an.tuningAt = est.map();
  return (f, expected) => {
    if (L.frame(f.pitch, f.note, f.onset, f.note ? expected() : null)) an.tuningAt = est.map();
  };
}

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Nốt hàng xóm (phím trắng kề bên) — lỗi hay gặp nhất của bé. */
export function neighbour(midi: number, up: boolean): number {
  const white = [0, 2, 4, 5, 7, 9, 11];
  let m = midi;
  do m += up ? 1 : -1;
  while (!white.includes(((m % 12) + 12) % 12));
  return m;
}

interface Strike extends SimNote {
  intent: number;
  kind: 'ok' | 'wrong' | 'restart';
}

export interface Stats {
  /** số nốt (nhóm) của bài */
  notes: number;
  /** nốt được chấm đúng NGAY lần bé đàn đúng đầu tiên */
  firstTry: number;
  /** "Đàn sai" oan (bé đàn đúng mà app báo sai) */
  falseWrong: number;
  /** Một lần gõ bị đếm hai lần (chờ: con trỏ nhảy 2 nốt; theo nhịp: 2 lần nghe cho 1 lần gõ) */
  doubles: number;
  /** nốt bé đàn đúng mà app không nghe (chờ: phải đàn lại; theo nhịp: tính trượt) */
  missed: number;
  /** lỗi cố ý của bé: số lần bị báo sai đúng 1 lần / không bị báo / bị báo ≥ 2 lần */
  mistakes: number;
  mistakesCaught: number;
  mistakeDoubles: number;
  /** theo nhịp: nốt SAI cố ý mà app vẫn chấm "trúng" */
  falseHits: number;
  latency: number[];
  /** chờ: nốt được nhận CHẬM (sau lúc bé định đàn tiếp — bé phải chờ con trỏ) */
  slow: number;
  /** chi tiết các lỗi (để gỡ rối) */
  log: string[];
}

const empty = (notes: number): Stats => ({
  notes,
  firstTry: 0,
  falseWrong: 0,
  doubles: 0,
  missed: 0,
  mistakes: 0,
  mistakesCaught: 0,
  mistakeDoubles: 0,
  falseHits: 0,
  latency: [],
  slow: 0,
  log: [],
});

/** Nhường CPU — khối tính dài làm vitest báo "Timeout calling onTaskUpdate". */
/** Gỡ rối: ghi từng khung trong [from, to] */
export const DBG = { from: -1, to: -1, out: [] as string[] };
function dbgFrame(t: number, f: ReturnType<MicAnalyzer['process']>): void {
  if (t < DBG.from || t > DBG.to) return;
  DBG.out.push(`${t.toFixed(3)} r ${f.rms.toExponential(2)} g ${f.gate.toExponential(2)} ${f.onset ? 'ON ' + f.onsetAt.toFixed(3) : ''} ${f.pitch ? `${(69 + 12 * Math.log2(f.pitch.freq / 440)).toFixed(2)} c${f.pitch.clarity.toFixed(2)}` : '-'} ${f.note ? 'NOTE ' + f.note.midi + ' at ' + f.note.at?.toFixed(3) : ''}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

async function render(strikes: SimNote[], seconds: number, c: Cond, extra: SimOptions = {}): Promise<Float32Array> {
  await tick();
  return renderPiano(strikes, seconds, { ...RAW, ...c.sim, ns: c.ns || undefined, seed: c.seed, ...extra });
}

export function groupsOf(t: Tune): Array<{ start: number; midi: number[]; beats: number }> {
  const gs = handOnsets(t, null);
  const total = totalBeats(t);
  return gs.map((g, i) => ({ start: g.start, midi: g.pitches.map(pitchToMidi), beats: (gs[i + 1]?.start ?? total) - g.start }));
}

// ======================= TỪNG NỐT (CHỜ) =======================

interface Action {
  midi: number;
  intent: number;
  kind: Strike['kind'];
  gap: number;
  vel: number;
  /** giữ phím thêm sau lần bấm kế tiếp (giây) */
  over: number;
  /** giữ phím (giây) — nốt sai: nhả sớm */
  hold?: number;
}

/**
 * Tín hiệu micro DẠNG DÒNG cho vòng kín: bé quyết định bấm phím dựa trên những gì app đã làm tới lúc đó, nên nốt được
 * thêm dần (luôn bắt đầu SAU phần đã xử lý). Cùng mô hình với renderPiano (dây, vang phòng, ồn, ù, lọc ồn iOS).
 */
class StreamSignal {
  readonly total: number;
  private dry: Float32Array;
  private pre: Float32Array;
  private built = 0;
  private ns: StreamNS | null;
  private frameBuf = new Float32Array(FRAME);
  private rnd: () => number;
  private o: SimOptions;
  private count = 0;
  constructor(
    seconds: number,
    private c: Cond,
  ) {
    this.total = Math.floor(seconds * SIM_RATE);
    this.dry = new Float32Array(this.total);
    this.pre = new Float32Array(this.total);
    this.o = { ...RAW, ...c.sim };
    this.ns = c.ns ? new StreamNS(SIM_RATE, c.ns, 0.2, this.total) : null;
    this.rnd = rng(c.seed + 4242);
  }
  addNote(n: SimNote): void {
    const s0 = Math.floor(n.start * SIM_RATE);
    if (s0 < this.built) throw new Error(`addNote: nốt lúc ${n.start} nằm trong phần đã xử lý`);
    const one = renderPiano([{ ...n, start: 0 }], n.dur + 1.3, { ...this.o, reverb: 0, noise: 0, hum: 0, ns: undefined, agc: undefined, seed: this.c.seed * 977 + ++this.count });
    for (let i = 0; i < one.length && s0 + i < this.total; i++) this.dry[s0 + i] += one[i];
  }
  /** Khung 2048 mẫu kết thúc ở mẫu `end` (xử lý thêm khi cần). */
  frame(end: number): Float32Array {
    // đọc trước ~23 ms (khung STFT của bộ lọc ồn) — nốt mới luôn bắt đầu ≥ 0,2 s sau "bây giờ"
    this.build(Math.min(this.total, end + 1100));
    const done = this.ns ? this.ns.advance(this.pre, this.built) : this.built;
    if (done < end) throw new Error('StreamSignal: chưa đủ dữ liệu');
    const src = this.ns ? this.ns.out : this.pre;
    for (let i = 0; i < FRAME; i++) this.frameBuf[i] = src[end - FRAME + i];
    return this.frameBuf;
  }
  private build(upTo: number): void {
    const rev = this.o.reverb ?? 0;
    const taps = REVERB_TAPS.map(([d, g]) => [Math.floor(d * SIM_RATE), g * rev] as const);
    const noise = this.o.noise ?? 0.004;
    const hum = this.o.hum ?? 0.002;
    for (let i = this.built; i < upTo; i++) {
      let v = this.dry[i];
      if (rev) for (const [off, g] of taps) if (i >= off) v += this.dry[i - off] * g;
      this.pre[i] = v + noise * (this.rnd() * 2 - 1) + hum * Math.sin((2 * Math.PI * 50 * i) / SIM_RATE);
    }
    if (upTo > this.built) this.built = upTo;
  }
}
/** Như pianoSim (vang phòng: trễ giây, hệ số) */
const REVERB_TAPS: Array<[number, number]> = [
  [0.023, 0.5],
  [0.041, 0.4],
  [0.067, 0.3],
  [0.097, 0.22],
  [0.131, 0.15],
];

/**
 * Song.ts chế độ chờ, VÒNG KÍN theo thời gian thật: 0,2 s trước lúc định bấm nốt kế, bé nhìn con trỏ — đã đi thì bấm;
 * chưa đi thì chờ (tối đa 0,8 s) rồi đàn lại nốt cũ; 3 lần không được thì bố mẹ bấm "tiếp" (không resetTracker).
 */
export async function simulateWait(t: Tune, c: Cond): Promise<Stats> {
  const groups = groupsOf(t);
  const r = rng(c.seed);
  const jit = () => (r() - 0.5) * 0.12;
  const vel = () => c.vel[0] + r() * (c.vel[1] - c.vel[0]);
  const spb = 60 / (c.tempo === 'fast' ? 72 : t.bpm);
  const gapFor = (i: number) =>
    c.tempo === 'slow' ? 1.0 + r() * 0.4 : Math.max(c.tempo === 'fast' ? 0.42 : 0.5, (groups[i - 1]?.beats ?? 1) * spb) + jit();
  const plan: Action[] = [];
  groups.forEach((g, i) => {
    const m = g.midi[0];
    const gap = i === 0 ? 1.5 : gapFor(i);
    const over = r() < 0.08 ? 1.2 : r() * c.overlap; // thỉnh thoảng quên nhả phím
    if (c.mistakes && i > 0 && i % 6 === 3) {
      // đàn nhầm phím bên cạnh, nhận ra, đàn lại đúng
      plan.push({ midi: neighbour(m, r() < 0.5), intent: i, kind: 'wrong', gap, vel: vel(), over: 0, hold: 0.45 });
      plan.push({ midi: m, intent: i, kind: 'ok', gap: 0.9 + r() * 0.3, vel: vel(), over });
    } else if (c.mistakes && i > 1 && i % 9 === 5 && groups[i - 1].midi[0] !== m) {
      // "đàn lại từ nốt trước": bấm lại nốt vừa qua rồi mới đàn nốt này
      plan.push({ midi: groups[i - 1].midi[0], intent: i, kind: 'restart', gap, vel: vel(), over: 0, hold: 0.5 });
      plan.push({ midi: m, intent: i, kind: 'ok', gap: 0.8 + r() * 0.3, vel: vel(), over });
    } else if (c.mistakes && i % 11 === 7) {
      // ngập ngừng lâu (tay vẫn giữ phím trước)
      plan.push({ midi: m, intent: i, kind: 'ok', gap: gap + 2.5, vel: vel(), over });
    } else plan.push({ midi: m, intent: i, kind: 'ok', gap, vel: vel(), over });
  });
  // bé giữ phím tới lúc định bấm nốt sau (+ chồng lên một chút) — nhả theo dự định, kể cả khi phải chờ con trỏ
  plan.forEach((a, k) => (a.hold ??= (plan[k + 1]?.gap ?? 1.5) + a.over));

  const seconds = plan.reduce((x, a) => x + a.gap, 0) + groups.length * 1.5 + 8;
  const sig = new StreamSignal(seconds, c);
  const an = new MicAnalyzer();
  if (c.sens) an.sensitivity = c.sens;
  const learn = tuner(an, c);
  const res: WaitRun = { creditAt: {}, evals: [] };
  const strikes: Strike[] = [];
  const stats = empty(groups.length);
  const tries = new Map<number, number>();
  const slow = new Set<number>();
  let cur = 0;
  let ai = 0;
  let lastStart = 0;
  let waitFrom = -1;
  let endAt = Infinity;
  const strike = (st: Strike) => {
    strikes.push(st);
    sig.addNote(st);
    lastStart = st.start;
  };
  DBG.out = [];
  const hop = Math.round(HOP * SIM_RATE);
  for (let i = FRAME, k = 0; i < sig.total; i += hop, k++) {
    if (k % 100 === 99) await tick();
    const now = i / SIM_RATE;
    if (now > endAt) break;
    // ---- bé ----
    const act = plan[ai];
    const prev = plan[ai - 1];
    const planned = lastStart + (act?.gap ?? 1.0);
    if (now + 0.2 >= planned) {
      // nốt ĐÚNG trước đó đã được nhận chưa? (sau nốt sai / đàn lại nốt trước thì bé không chờ)
      const gPrev = prev && prev.kind === 'ok' && (!act || act.intent !== prev.intent) ? prev.intent : -1;
      if (gPrev >= 0 && cur <= gPrev) {
        if (waitFrom < 0) waitFrom = now;
        if (now - waitFrom >= 0.8) {
          waitFrom = -1;
          const n = tries.get(gPrev) ?? 1;
          if (n >= 3) {
            cur = gPrev + 1; // bố mẹ bấm "tiếp"
            stats.log.push(`bố mẹ bấm "tiếp" #${gPrev} lúc ${now.toFixed(2)}`);
          } else {
            tries.set(gPrev, n + 1);
            strike({ midi: prev.midi, start: now + 0.2, dur: 1.0 + r() * c.overlap, vel: vel(), intent: gPrev, kind: 'ok' });
          }
        }
      } else {
        if (waitFrom >= 0 && gPrev >= 0) slow.add(gPrev);
        waitFrom = -1;
        if (!act) endAt = now + 1.5;
        else {
          strike({ midi: act.midi, start: Math.max(planned, now + 0.2), dur: Math.max(0.15, act.hold!), vel: act.vel, intent: act.intent, kind: act.kind });
          if (act.kind === 'ok') tries.set(act.intent, 1);
          ai++;
        }
      }
    }
    // ---- app ----
    const fr = an.process(sig.frame(i), SIM_RATE, now);
    dbgFrame(now, fr);
    learn(fr, () => (groups[cur] && groups[cur].midi.length === 1 ? groups[cur].midi : null));
    const n = fr.note;
    if (!n || cur >= groups.length) continue;
    const ok = matchHeard(n.midi, groups[cur].midi) !== 'none';
    res.evals.push({ t: now, midi: n.midi, g: cur, ok });
    if (ok) {
      res.creditAt[cur] = now;
      cur++;
      an.reset(true); // app.mic.resetTracker()
    }
  }
  stats.slow = slow.size;
  return finishWait(res, strikes, stats);
}

interface WaitRun {
  creditAt: Record<number, number>;
  /** mỗi lần app chấm: lúc, nốt nghe, nhóm đang chờ, đúng/sai */
  evals: Array<{ t: number; midi: number; g: number; ok: boolean }>;
}

/** Lần bấm "đang kêu" lúc t (bấm gần nhất trước t). */
function ownerAt(strikes: Strike[], t: number): number {
  let k = -1;
  for (let j = 0; j < strikes.length; j++) if (strikes[j].start <= t + 0.01) k = j;
  return k;
}

function finishWait(res: WaitRun, strikes: Strike[], s: Stats): Stats {
  const credited = new Set<number>();
  const mistakeHits = new Map<number, number>();
  strikes.forEach((st, k) => st.kind !== 'ok' && mistakeHits.set(k, 0));
  s.mistakes = mistakeHits.size;
  for (const e of res.evals) {
    const k = ownerAt(strikes, e.t);
    const st = strikes[k];
    if (e.ok) {
      if (st && st.midi === e.midi && st.kind === 'ok' && credited.has(k)) {
        s.doubles++;
        s.log.push(`đếm 2 lần t=${e.t.toFixed(3)} ${e.midi} lần bấm @${st.start.toFixed(2)}`);
      }
      credited.add(k);
      continue;
    }
    // Nốt sai: do lỗi cố ý (lần bấm sai gần đây, cùng cao độ) thì đúng; còn lại là "sai oan"
    const mk = [...mistakeHits.keys()].find((j) => strikes[j].midi === e.midi && strikes[j].start <= e.t + 0.01 && e.t - strikes[j].start < 1.2);
    if (mk !== undefined) mistakeHits.set(mk, mistakeHits.get(mk)! + 1);
    else {
      s.falseWrong++;
      s.log.push(`sai oan t=${e.t.toFixed(3)} nghe ${e.midi} chờ #${e.g}; đang kêu: ${strikes.filter((x) => x.start <= e.t + 0.01 && x.start + x.dur + 0.3 > e.t).map((x) => `${x.midi}@${x.start.toFixed(2)}+${x.dur.toFixed(2)} v${x.vel!.toFixed(2)} ${x.kind}`).join(', ')}; chấm: ${res.evals.filter((x) => Math.abs(x.t - e.t) < 2).map((x) => `${x.midi}@${x.t.toFixed(3)}→#${x.g}${x.ok ? '✓' : '✗'}`).join(' ')}; lần bấm: ${strikes.filter((x) => Math.abs(x.start - e.t) < 2).map((x) => `${x.midi}@${x.start.toFixed(2)}#${x.intent}`).join(' ')}`);
    }
  }
  for (const n of mistakeHits.values()) {
    if (n === 1) s.mistakesCaught++;
    if (n > 1) s.mistakeDoubles++;
  }
  // Mỗi nhóm: lần bấm ĐÚNG đầu tiên có được nhận không
  const firstOk = new Map<number, number>();
  strikes.forEach((st, k) => st.kind === 'ok' && !firstOk.has(st.intent) && firstOk.set(st.intent, k));
  for (const [g, k] of firstOk) {
    const next = strikes[k + 1]?.start ?? Infinity;
    const at = res.creditAt[g];
    if (at !== undefined && at >= strikes[k].start && at < next) {
      s.firstTry++;
      s.latency.push(at - strikes[k].start);
    } else {
      s.missed++;
      const st = strikes[k];
      s.log.push(`sót #${g} ${st.midi}@${st.start.toFixed(2)}+${st.dur.toFixed(2)} v${st.vel!.toFixed(2)}; nhận lúc ${at?.toFixed(2)}; đang kêu: ${strikes.filter((x) => x.start < st.start && x.start + x.dur + 0.3 > st.start).map((x) => `${x.midi}@${x.start.toFixed(2)}+${x.dur.toFixed(2)} v${x.vel!.toFixed(2)}`).join(', ')}; chấm: ${res.evals.filter((x) => Math.abs(x.t - st.start) < 2).map((x) => `${x.midi}@${x.t.toFixed(3)}→#${x.g}${x.ok ? '✓' : '✗'}`).join(' ')}`);
    }
  }
  return s;
}

// ======================= THEO NHỊP =======================

/** Song.ts chế độ theo nhịp (vòng hở: bé đàn theo tiếng tích, app chỉ chấm). */
export async function simulateTempo(t: Tune, c: Cond): Promise<Stats> {
  const groups = groupsOf(t);
  const r = rng(c.seed + 1000);
  const bpm = c.tempo === 'slow' ? 40 : c.tempo === 'fast' ? 72 : t.bpm;
  const spb = 60 / bpm;
  const bpmM = Number(t.timeSignature.split('/')[0]) || 4;
  const lead = bpmM < 3 ? bpmM * 2 : bpmM;
  const t0 = 0.4 + lead * spb;
  const total = totalBeats(t);
  const strikes: Strike[] = [];
  groups.forEach((g, i) => {
    const vel = c.vel[0] + r() * (c.vel[1] - c.vel[0]);
    const start = t0 + g.start * spb + (r() - 0.5) * 0.12;
    const nextStart = t0 + (groups[i + 1]?.start ?? total) * spb;
    // giữ phím tới nốt sau (+ chồng lên một chút), thỉnh thoảng nhả sớm (ngắt) hoặc quên nhả
    const u = r();
    const end = u < 0.15 ? start + (nextStart - start) * 0.6 : u > 0.94 ? nextStart + 1.2 : nextStart + r() * c.overlap;
    let midi = g.midi[0];
    let kind: Strike['kind'] = 'ok';
    if (c.mistakes && i % 7 === 4) {
      midi = neighbour(midi, r() < 0.5);
      kind = 'wrong';
    }
    if (c.mistakes && i % 13 === 9) return; // bỏ sót nốt (bé quên)
    strikes.push({ midi, start, dur: Math.max(0.12, end - start), vel, intent: i, kind });
  });
  const seconds = t0 + total * spb + 1.5;
  const clicks = Array.from({ length: Math.ceil(total) + lead }, (_, k) => ({ t: 0.4 + k * spb, accent: (k - lead) % bpmM === 0 }));
  const sig = await render(strikes, seconds, c, { clicks, clickLevel: CLICK_LEVEL });
  const a = new MicAnalyzer();
  if (c.sens) a.sensitivity = c.sens;
  const learn = tuner(a, c);
  const heard: Array<{ beat: number; midi: number; at: number; t: number }> = [];
  const hop = Math.round(HOP * SIM_RATE);
  for (let i = FRAME, k = 0; i < sig.length; i += hop, k++) {
    if (k % 100 === 99) await tick();
    const tt = i / SIM_RATE;
    const fr = a.process(sig.subarray(i - FRAME, i), SIM_RATE, tt);
    dbgFrame(tt, fr);
    // song.ts theo nhịp: nốt đơn của các nhóm quanh phách hiện tại (±1 phách)
    learn(fr, () => {
      const b = (tt - 0.07 - t0) / spb;
      return groups.filter((g) => g.midi.length === 1 && Math.abs(g.start - b) <= 1).map((g) => g.midi[0]);
    });
    const n = fr.note;
    if (n) {
      const at = n.at ?? tt - 0.07;
      heard.push({ beat: (at - t0) / spb, midi: n.midi, at, t: tt });
    }
  }
  const win = TIMING_WINDOWS.easy;
  const v = gradeTiming(
    groups.map((g, i) => ({ index: i, start: g.start, midi: g.midi })),
    heard,
    win.early,
    win.late,
  );
  const s = empty(groups.length);
  const byIntent = new Map(strikes.map((st) => [st.intent, st]));
  v.forEach((x, i) => {
    const st = byIntent.get(i);
    if (st?.kind === 'ok') {
      if (x.hit) {
        s.firstTry++;
        s.latency.push(x.offset! * spb);
      } else {
        s.missed++;
        s.log.push(`sót #${i} ${st.midi}@${st.start.toFixed(2)}+${st.dur.toFixed(2)} v${st.vel!.toFixed(2)}; trước: ${byIntent.get(i - 1)?.midi}@${byIntent.get(i - 1)?.start.toFixed(2)}+${byIntent.get(i - 1)?.dur.toFixed(2)} v${byIntent.get(i - 1)?.vel!.toFixed(2)}; nghe: ${heard.filter((h) => Math.abs(h.at - st.start) < 1).map((h) => `${h.midi}@${h.at.toFixed(3)}/${h.t.toFixed(3)}`).join(' ')}`);
      }
    } else if (x.hit) s.falseHits++;
    if (st?.kind === 'wrong') s.mistakes++;
  });
  s.notes = strikes.filter((st) => st.kind === 'ok').length;
  // "Sai oan" / đếm hai lần: mỗi lần nghe gán cho lần bấm đang kêu (theo mốc gõ)
  const used = new Map<number, number>();
  for (const h of heard) {
    const k = ownerAt(strikes, h.at + 0.04);
    const st = strikes[k];
    if (!st) {
      s.falseWrong++;
      continue;
    }
    if (st.midi !== h.midi) {
      if (st.kind === 'ok') {
        s.falseWrong++;
        s.log.push(`sai oan at=${h.at.toFixed(3)} nghe ${h.midi}, đang kêu ${st.midi}@${st.start.toFixed(2)}`);
      }
      continue;
    }
    used.set(k, (used.get(k) ?? 0) + 1);
    if (used.get(k)! === 2) {
      s.doubles++;
      s.log.push(`đếm 2 lần at=${h.at.toFixed(3)} ${h.midi} lần bấm @${st.start.toFixed(2)}+${st.dur.toFixed(2)} v${st.vel!.toFixed(2)} ${st.kind}; trước: ${strikes[k - 1]?.midi}@${strikes[k - 1]?.start.toFixed(2)}+${strikes[k - 1]?.dur.toFixed(2)} v${strikes[k - 1]?.vel!.toFixed(2)}; nghe: ${heard.filter((x) => Math.abs(x.at - h.at) < 1).map((x) => `${x.midi}@${x.at.toFixed(3)}/${x.t.toFixed(3)}`).join(' ')}`);
    }
    if (st.kind === 'wrong' && used.get(k) === 1) s.mistakesCaught++;
  }
  return s;
}

// ======================= TỪNG NỐT / NHẠI LẠI (practice.ts) =======================

export interface PracticeTarget {
  keys: number[];
  sequence?: boolean;
}

/**
 * practice.ts: mỗi việc — app phát âm mẫu (mỗi nốt 0,8 s, cách 1 s; micro bỏ qua lúc app phát + 350 ms đuôi),
 * resetTracker() khi vào WAIT_PARENT, bé đàn lại (nhại lại: theo thứ tự, sai → làm lại từ đầu), nghe đủ → HEARD
 * → ~1,2 s sau sang việc kế. Âm mẫu của app cũng lọt vào micro (loa iPad).
 */
export async function simulatePractice(targets: PracticeTarget[], c: Cond): Promise<Stats & { heardAll: number }> {
  const r = rng(c.seed + 77);
  const notes: SimNote[] = [];
  const appBusy: Array<[number, number]> = [];
  const strikes: Strike[] = [];
  const waitFrom: number[] = [];
  let t = 1.0;
  targets.forEach((tg, ti) => {
    // âm mẫu
    const s0 = t;
    tg.keys.forEach((m, k) => notes.push({ midi: m, start: s0 + k, dur: 0.8 + 0.35, vel: 0.5 }));
    const sampleEnd = s0 + (tg.keys.length - 1) + 0.8 + 0.35;
    appBusy.push([s0, sampleEnd]);
    t = sampleEnd + 0.35; // đuôi app → WAIT_PARENT
    waitFrom.push(t);
    t += 0.4 + r() * 0.4; // bé bắt đầu đàn (có khi ngay trong đuôi tiếng app)
    tg.keys.forEach((m, k) => {
      const gap = c.tempo === 'slow' ? 0.9 + r() * 0.3 : 0.55 + r() * 0.1;
      const v = c.vel[0] + r() * (c.vel[1] - c.vel[0]);
      strikes.push({ midi: m, start: t, dur: gap + r() * c.overlap, vel: v, intent: ti, kind: 'ok' });
      if (k < tg.keys.length - 1) t += gap;
    });
    t += 0.6 + 1.2 + 0.5; // nghe xong → kết quả → tự sang việc kế (đọc tên nốt…)
  });
  const seconds = t + 1;
  const sig = await render([...notes, ...strikes], seconds, c);
  const a = new MicAnalyzer();
  if (c.sens) a.sensitivity = c.sens;
  const hop = Math.round(HOP * SIM_RATE);
  const s = { ...empty(targets.length), heardAll: 0 };
  let ti = -1;
  let seqPos = 0;
  const got = new Set<number>();
  let done = false;
  const doneAt: number[] = [];
  for (let i = FRAME, k = 0; i < sig.length; i += hop, k++) {
    if (k % 100 === 99) await tick();
    const tt = i / SIM_RATE;
    const busy = appBusy.find(([x, y]) => tt >= x && tt < y + 0.35);
    const app: AppSound = !busy ? 'quiet' : tt < busy[1] ? 'sounding' : 'tail';
    if (ti + 1 < targets.length && tt >= waitFrom[ti + 1]) {
      ti++;
      seqPos = 0;
      got.clear();
      done = false;
      a.reset(true); // WAIT_PARENT → resetTracker()
    }
    const n = a.process(sig.subarray(i - FRAME, i), SIM_RATE, tt, app).note;
    if (!n || ti < 0 || done) continue;
    const tg = targets[ti];
    if (tg.sequence) {
      if (n.midi === tg.keys[seqPos]) {
        seqPos++;
        if (seqPos >= tg.keys.length) done = true;
      } else {
        s.falseWrong++;
        seqPos = n.midi === tg.keys[0] ? 1 : 0;
      }
    } else if (tg.keys.includes(n.midi)) {
      got.add(n.midi);
      if (tg.keys.every((k) => got.has(k))) done = true;
    } else s.falseWrong++;
    if (done) doneAt[ti] = tt;
  }
  targets.forEach((_tg, k) => {
    if (doneAt[k] !== undefined) {
      s.heardAll++;
      const last = strikes.filter((st) => st.intent === k).pop()!;
      s.latency.push(doneAt[k] - last.start);
    }
  });
  s.firstTry = s.heardAll;
  s.missed = targets.length - s.heardAll;
  return s;
}
