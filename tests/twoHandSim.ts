/**
 * GIẢ LẬP BÉ ĐÀN HAI TAY bài thật của giáo trình — đo src/audio/twoHand.ts (chấm hai tay bằng micro).
 *
 * - Tín hiệu: tests/pianoSim.ts (dây đàn, lệch họa âm, vang phòng, iPad "thô" như weekSim RAW, lọc ồn iOS tùy chọn).
 * - Bé đàn theo nhịp (lệch ±60 ms), hai tay lệch nhau tới ±15 ms, giữ phím tới nốt sau của cùng tay (+ chồng legato).
 * - Lỗi cố ý ở các nhóm hai tay: sai nốt tay trái / tay phải (phím trắng bên cạnh), quên tay trái / tay phải,
 *   tay trái trễ 120 ms.
 * - Lần gõ: MicAnalyzer (y hệt MicListener, giãn cách 0,15 s), rồi analyzeHands quanh mỗi lần gõ.
 */
import { MicAnalyzer } from '../src/audio/micAnalyzer';
import { analyzeChord, CHORD_FRAME } from '../src/audio/chordVerify';
import { matchHeard } from '../src/audio/match';
import { analyzeHands, type HandsResult } from '../src/audio/twoHand';
import { centsAt, type Tuning } from '../src/audio/pitchDetect';
import { gradeHandsTempo, type HandNoteResult, type HandsProbe } from '../src/music/handGrade';
import { gradeTiming, TIMING_WINDOWS } from '../src/music/timing';
import { handOnsets, totalBeats, type Tune } from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';
import { renderPiano, type SimNote, type SimOptions } from './pianoSim';
import { neighbour, RAW } from './weekSim';

export type ErrKind = 'none' | 'wrongLH' | 'wrongRH' | 'missLH' | 'missRH' | 'lateLH';

export interface HandCond {
  vel: [number, number];
  ns?: number;
  sampleRate?: number;
  /** bé giữ phím thêm sau nốt kế (giây, tối đa) */
  legato: number;
  /** lỗi ở các nhóm hai tay (mỗi `every` nhóm một lần) */
  err: ErrKind;
  every?: number;
  seed: number;
  sim?: SimOptions;
  /** (+ 2026-10-09) Bù lệch dây cho bộ nhận nốt + kiểm tra hai tay (số = bù tay; hàm = tự học theo âm khu) */
  tuning?: Tuning;
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

export interface GroupInfo {
  beat: number;
  measure: number;
  parts: Array<{ hand: 'RH' | 'LH'; midis: number[]; indices: number[] }>;
  together: boolean;
  /** lỗi đã gài vào nhóm này */
  err: ErrKind;
  /** lúc bé gõ (giây) của từng tay */
  at: { RH?: number; LH?: number };
}

export interface HandTrialOut {
  groups: GroupInfo[];
  /** chấm mới (theo nhịp) */
  tempo: HandNoteResult[];
  /** chấm mới (chờ): mỗi nhóm hai tay — kết quả ở lần gõ đầu tiên của nhóm */
  wait: Array<{ g: number; r: HandsResult | null; latency: number }>;
  /** chấm CŨ theo nhịp (một cao độ, matchHeard) — nhóm trúng = cả hai tay trúng */
  oldTempo: boolean[];
  /** chấm CŨ chờ (analyzeChord sau nốt YIN đầu tiên): đủ nốt → cả hai tay; null = không kết luận */
  oldWait: Array<boolean | null>;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Bé đàn cả bài theo nhịp (vòng hở), có lỗi cố ý; trả kết quả chấm mới + cũ. */
export async function simulateHands(t: Tune, c: HandCond, bpmOverride?: number): Promise<HandTrialOut> {
  const sr = c.sampleRate ?? 48000;
  const r = rng(c.seed);
  const bpm = bpmOverride ?? t.bpm;
  const spb = 60 / bpm;
  const bpmM = Number(t.timeSignature.split('/')[0]) || 4;
  const t0 = 1.0 + bpmM * spb; // ≥ 2 s làm quen phòng trước nốt đầu
  const os = handOnsets(t, null);
  const total = totalBeats(t);
  const every = c.every ?? 2;
  const groups: GroupInfo[] = [];
  const notes: SimNote[] = [];
  let bothK = 0;
  // Lần bấm theo tay — để giữ phím tới nốt sau của CÙNG tay
  const pending: Record<'RH' | 'LH', SimNote[]> = { RH: [], LH: [] };
  const vel = () => c.vel[0] + r() * (c.vel[1] - c.vel[0]);
  for (const o of os) {
    const hands = (['RH', 'LH'] as const).filter((h) => o.notes.some((n) => n.hand === h));
    const together = hands.length === 2;
    let err: ErrKind = 'none';
    if (together) {
      if (c.err !== 'none' && bothK % every === every - 1) err = c.err;
      bothK++;
    }
    const base = t0 + o.start * spb + (r() - 0.5) * 0.12;
    const g: GroupInfo = {
      beat: o.start,
      measure: o.notes[0].measure,
      parts: hands.map((h) => {
        const ns = o.notes.filter((n) => n.hand === h);
        return { hand: h, midis: ns.flatMap((n) => [n.pitch!, ...(n.also ?? []).map((a) => a.pitch)]).map(pitchToMidi), indices: ns.map((n) => n.index) };
      }),
      together,
      err,
      at: {},
    };
    groups.push(g);
    for (const part of g.parts) {
      const h = part.hand;
      if ((err === 'missLH' && h === 'LH') || (err === 'missRH' && h === 'RH')) continue;
      let at = base + (together ? (r() - 0.5) * 0.03 : 0);
      if (err === 'lateLH' && h === 'LH') at = base + 0.12;
      g.at[h] = at;
      const v = vel();
      const beats = o.notes.find((n) => n.hand === h)!.beats;
      // nhả nốt cũ của tay này (giữ thêm legato)
      for (const p of pending[h]) p.dur = Math.max(0.12, Math.min(p.dur, at - p.start + r() * c.legato));
      pending[h] = [];
      let midis = part.midis;
      if ((err === 'wrongLH' && h === 'LH') || (err === 'wrongRH' && h === 'RH')) {
        // sai MỘT nốt (nốt trầm nhất của tay) → phím trắng bên cạnh
        const low = Math.min(...midis);
        midis = midis.map((m) => (m === low ? neighbour(m, r() < 0.5) : m));
      }
      for (const m of midis) {
        const n: SimNote = { midi: m, start: at, dur: beats * spb + 0.05, vel: v * (0.9 + r() * 0.2) };
        notes.push(n);
        pending[h].push(n);
      }
    }
  }
  const seconds = t0 + total * spb + 1.5;
  await tick();
  const sig = renderPiano(notes, seconds, { ...RAW, ...c.sim, ns: c.ns || undefined, seed: c.seed, sampleRate: sr });
  await tick();
  // ---- lần gõ (như MicListener) + nốt YIN (cho chấm cũ) ----
  const an = new MicAnalyzer();
  const tun = c.tuning ?? 0;
  if (typeof tun === 'function') an.tuningAt = (m) => centsAt(tun, m);
  else an.tuningCents = tun;
  const hop = Math.round(0.025 * sr);
  const onsets: number[] = [];
  const heard: Array<{ beat: number; midi: number; at: number }> = [];
  let lastClap = -1;
  for (let i = 2048, k = 0; i < sig.length; i += hop, k++) {
    if (k % 200 === 199) await tick();
    const tt = i / sr;
    const f = an.process(sig.subarray(i - 2048, i), sr, tt);
    if (f.onset && tt - lastClap > 0.15) {
      lastClap = tt;
      onsets.push(f.onsetAt >= 0 ? Math.min(tt, f.onsetAt) : tt - 0.035);
    }
    if (f.note) {
      const at = f.note.at ?? tt - 0.07;
      heard.push({ beat: (at - t0) / spb, midi: f.note.midi, at });
    }
  }
  const win = TIMING_WINDOWS.easy;
  const both = groups.map((g, i) => ({ g, i })).filter((x) => x.g.together);
  // ---- chấm mới, theo nhịp: mỗi lần gõ kiểm tra các nhóm hai tay có cửa sổ chứa lần gõ ----
  const probesByGroup = new Map<number, HandsProbe[]>();
  for (const on of onsets) {
    const beat = (on - t0) / spb;
    for (const { g, i } of both) {
      const d = beat - g.beat;
      if (d < -win.early || d > win.late) continue;
      const spec = Object.fromEntries(g.parts.map((p) => [p.hand, p.midis]));
      const res = analyzeHands(sig, sr, Math.round(on * sr), spec, tun);
      const pr: HandsProbe = {
        beat,
        conclusive: res.conclusive,
        RH: res.RH?.verdict,
        LH: res.LH?.verdict,
        heardRH: res.RH?.heard,
        heardLH: res.LH?.heard,
      };
      probesByGroup.set(i, [...(probesByGroup.get(i) ?? []), pr]);
    }
  }
  await tick();
  const tempo: HandNoteResult[] = [];
  for (const { g, i } of both) tempo.push(...gradeHandsTempo([g], probesByGroup.get(i) ?? [], win.early, win.late));
  // ---- chấm mới, chờ: lần gõ đầu tiên quanh lúc bé đàn nhóm ----
  const wait: HandTrialOut['wait'] = [];
  for (const { g, i } of both) {
    const first = Math.min(g.at.RH ?? Infinity, g.at.LH ?? Infinity);
    const on = onsets.find((x) => x >= first - 0.06 && x <= first + 0.25);
    if (on === undefined) {
      wait.push({ g: i, r: null, latency: NaN });
      continue;
    }
    const spec = Object.fromEntries(g.parts.map((p) => [p.hand, p.midis]));
    let res = analyzeHands(sig, sr, Math.round(on * sr), spec, tun, false);
    let latency = 0.16;
    if (!(res.RH?.verdict === 'hit' && res.LH?.verdict === 'hit')) {
      res = analyzeHands(sig, sr, Math.round(on * sr), spec, tun, true);
      latency = 0.28;
    }
    wait.push({ g: i, r: res, latency: on + latency - first });
  }
  // ---- chấm CŨ ----
  const gi = groups.map((g, i) => ({ index: i, start: g.beat, midi: g.parts.flatMap((p) => p.midis) }));
  const v = gradeTiming(gi, heard, win.early, win.late);
  const oldTempo = both.map(({ i }) => v[i].hit);
  const oldWait = both.map(({ g }) => {
    const first = Math.min(g.at.RH ?? Infinity, g.at.LH ?? Infinity);
    const all = g.parts.flatMap((p) => p.midis);
    const h = heard.find((x) => x.at >= first - 0.06 && x.at <= first + 0.6);
    if (!h) return null;
    const s0 = Math.round((h.at + CHORD_FRAME.startAfter) * sr);
    const cr = analyzeChord(sig.subarray(s0, s0 + Math.round(CHORD_FRAME.length * sr)), sr, all, tun);
    if (!cr.conclusive) return matchHeard(h.midi, all) !== 'none';
    return cr.missing.length === 0;
  });
  return { groups, tempo, wait, oldTempo, oldWait };
}

/** Tín hiệu không phải tiếng đàn (im lặng / quạt / giọng nói) — để đo "ghi nhận ma". */
export function renderNoise(kind: 'silence' | 'fan' | 'speech' | 'speechLow' | 'speechChild', seconds: number, sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(seconds * sr);
  const out = new Float32Array(n);
  const base = RAW.noise ?? 0.00025;
  let b = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    out[i] = base * w + (RAW.hum ?? 0.0001) * Math.sin((2 * Math.PI * 50 * i) / sr);
  }
  if (kind === 'fan') {
    // quạt: ồn "nâu" + tiếng cánh quạt (vài chục Hz và họa âm), to gấp ~20 lần ồn phòng, bật lên lúc 1 s
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      b = 0.995 * b + 0.02 * (r() * 2 - 1);
      const on = Math.min(1, Math.max(0, (t - 1) / 0.3));
      let blade = 0;
      for (let k = 1; k <= 6; k++) blade += Math.sin(2 * Math.PI * 37 * k * t + k) / k;
      out[i] += on * (base * 8 * b * 5 + base * 3 * blade + base * 4 * (r() * 2 - 1));
    }
  } else if (kind.startsWith('speech')) {
    const [fLo, fSpan] = kind === 'speechLow' ? [95, 60] : kind === 'speechChild' ? [240, 140] : [170, 110];
    // giọng nói: các âm tiết ~4/giây, cao độ 170–280 Hz trượt, nhiều họa âm + formant, to ngang tiếng đàn nhẹ
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const syl = Math.floor(t * 4);
      const u = (t * 4) % 1;
      const env = t < 0.8 ? 0 : Math.sin(Math.PI * Math.min(1, u / 0.8)) ** 2 * (syl % 5 === 4 ? 0 : 1);
      const f0 = fLo + fSpan * ((syl * 0.37 + seed * 0.11) % 1) + 25 * Math.sin(2 * Math.PI * 3 * t) + 40 * (u - 0.5);
      ph += (2 * Math.PI * f0) / sr;
      const fm = [600 + 300 * Math.sin(syl), 1200 + 500 * Math.cos(syl * 1.3), 2500];
      let v = 0;
      for (let k = 1; k * f0 < 4000; k++) {
        const f = k * f0;
        const a = fm.reduce((s, F) => s + 1 / (1 + ((f - F) / 120) ** 2), 0) / k ** 0.5;
        v += a * Math.sin(k * ph);
      }
      out[i] += 0.004 * 0.5 * env * v * 0.3;
    }
  }
  return out;
}
