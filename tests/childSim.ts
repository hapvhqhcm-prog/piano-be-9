/**
 * BÉ 9 TUỔI THẬT ngồi đàn (2026-10-15) — không chỉ "đàn đúng": đàn sai quãng 8, đàn vội không chờ con trỏ, dừng lâu
 * rồi đàn lại từ đầu câu, chạm hai phím một lúc, tay đặt hờ trên phím, ngân nga theo, anh chị nói chuyện, gõ nắp đàn,
 * quạt, đàn to rồi nhỏ, quên chân pedal, theo nhịp vào muộn / đều mà chậm, đàn sai mãi một nốt.
 *
 * Tín hiệu: giả lập đàn cơ của tests/pianoSim.ts qua StreamSignal (tests/weekSim.ts — VÒNG KÍN: bé quyết định bấm phím
 * theo những gì app đã làm tới lúc đó) + các tiếng không phải đàn (dưới đây).
 * Đường chấm: MicAnalyzer (y như MicListener) → bộ chấm chế độ chờ THẬT của app (src/music/waitJudge.ts — songWait.ts
 * dùng chung) / gradeTiming + phân tích nhịp (theo nhịp) / bộ trợ giúp khi sai nhiều lần (src/music/missHelp.ts).
 */
import { MicAnalyzer, type AppSound } from '../src/audio/micAnalyzer';
import { analyzeHands, type HandsResult } from '../src/audio/twoHand';
import { advanceOf, judgeWait, pairFromHands, waitJudgeInit, type PairCheck, type WaitJudgeState } from '../src/music/waitJudge';
import { SIM_RATE, renderPiano } from './pianoSim';
import { analyzeTempo, teach, type RunReview, type TeacherPoint } from '../src/music/teacher';
import { TIMING_WINDOWS, analyzePulse, countInBeats, gradeTiming, pulseNote, score, type HeardEvent, type NoteVerdict, type PulseFit } from '../src/music/timing';
import { beatsPerMeasure, handOnsets, phraseRanges, pitchesOf, totalBeats, type Tune } from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';
import { RAW, StreamSignal, type Cond } from './weekSim';
import { renderNoise } from './twoHandSim';

const HOP = 0.025;
const FRAME = 2048;

export function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// ======================= TIẾNG KHÔNG PHẢI ĐÀN =======================

/**
 * Bé NGÂN NGA theo giai điệu (giọng trẻ con, "ưm…"): mỗi nốt một âm ngân, lên từ từ (~80 ms), rung giọng 5,5 Hz ±25 cents,
 * trôi nhẹ, hơi lệch cao độ (bé hát chưa chuẩn), âm cơ bản mạnh + vài họa âm (ngậm miệng). `level` = biên độ đỉnh.
 */
export function renderHum(notes: Array<{ midi: number; start: number; dur: number }>, seconds: number, level: number, seed: number, sr = SIM_RATE): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.floor(seconds * sr));
  for (const n of notes) {
    const off = (r() - 0.5) * 60; // hát lệch ±30 cents
    const f0 = 440 * Math.pow(2, (n.midi - 69 + off / 100) / 12);
    const s0 = Math.floor(n.start * sr);
    const len = Math.floor(n.dur * sr);
    let ph = 0;
    for (let i = 0; i < len && s0 + i < out.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.08) * Math.min(1, (n.dur - t) / 0.06);
      const f = f0 * Math.pow(2, (25 * Math.sin(2 * Math.PI * 5.5 * t) + 8 * Math.sin(2 * Math.PI * 0.7 * t)) / 1200);
      ph += (2 * Math.PI * f) / sr;
      const v = Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph) + 0.06 * Math.sin(4 * ph);
      out[s0 + i] += level * env * v * 0.65;
    }
  }
  return out;
}

/**
 * Gõ ngón tay lên NẮP ĐÀN / thành đàn theo nhịp (gỗ): tiếng "cộc" — xung nhiễu 4 ms + cộng hưởng gỗ 180–320 Hz tắt
 * trong ~35 ms. `level` = biên độ đỉnh (gõ nắp đàn sát iPad: ngang tiếng đàn vừa).
 */
export function renderKnocks(times: number[], seconds: number, level: number, seed: number, sr = SIM_RATE): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.floor(seconds * sr));
  for (const t0 of times) {
    const s0 = Math.floor(t0 * sr);
    const fr = [180 + r() * 40, 260 + r() * 60, 520 + r() * 80];
    for (let i = 0; i < 0.12 * sr && s0 + i < out.length; i++) {
      const t = i / sr;
      const burst = t < 0.004 ? (r() * 2 - 1) * (1 - t / 0.004) : 0;
      let res = 0;
      fr.forEach((f, k) => (res += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (0.035 / (k + 1))) / (k + 1)));
      out[s0 + i] += level * (0.8 * burst + res * 0.7);
    }
  }
  return out;
}

/** Anh/chị nói chuyện (giọng người lớn / trẻ con) hoặc quạt — từ tests/twoHandSim.ts (cùng mức với micro thô RAW). */
export function renderRoom(kind: 'speech' | 'speechChild' | 'fan', seconds: number, seed: number, gain = 1): Float32Array {
  const x = renderNoise(kind, seconds, SIM_RATE, seed);
  if (gain !== 1) for (let i = 0; i < x.length; i++) x[i] *= gain;
  return x;
}

// ======================= VÒNG KÍN: BÉ ↔ APP (chế độ chờ) =======================

export interface Strike {
  midi: number;
  start: number;
  dur: number;
  vel: number;
  /** nhãn để đọc kết quả (vd 'octave', 'smudge', 'rest') */
  tag?: string;
}

/** Những gì bé "thấy" ở mỗi bước 25 ms và cách bé bấm phím. */
export interface ChildView {
  now: number;
  /** Con trỏ app (nhóm đang chờ) */
  cur: number;
  /** Lần cuối con trỏ đi (giây; −1 = chưa) */
  movedAt: number;
  /** Các phán quyết app đã đưa ra (mới nhất cuối) */
  verdicts: AppEvent[];
  /** Bấm phím (start ≥ now + 0,2 s — bé phản ứng sau ~0,2 s) */
  strike(s: Strike): void;
  /** Lần bấm phím gần nhất bắt đầu lúc nào (−1 = chưa) */
  lastStrikeAt: number;
  strikes: Strike[];
}

export interface AppEvent {
  t: number;
  /** nốt micro nghe */
  midi: number;
  /** nhóm app đang chờ lúc nghe */
  cur: number;
  /** loại phán quyết (ok / wrong / octave / replay / ahead / smudge / faint…) */
  kind: string;
  /** số nhóm con trỏ đi tiếp */
  advance: number;
  /** có tính "đàn sai" không */
  wrong: boolean;
  /** số lần "đàn sai" tính ở lần này (kể cả nốt "đàn vội?" trước đó hóa ra sai — lateWrong) */
  wrongN?: number;
  /** lời nhắn app hiện (nếu có) */
  say?: string;
}

/**
 * Bộ chấm chế độ chờ: nhận nốt micro nghe → phán quyết. Muốn kiểm tra "hai phím một lúc" thì trả về `needPair`
 * ([phím cần, phím nghe]) — runner gọi lại khi đủ tín hiệu (~0,3 s sau lần gõ, như MicListener.verifyHands) với `pair`.
 */
export type WaitJudgeFn = (
  heard: { midi: number; at: number; t: number },
  cur: number,
  pair: PairCheck | null,
) => Omit<AppEvent, 't' | 'midi' | 'cur'> & { needPair?: [number, number] };

export interface WaitScene {
  groups: number[][];
  child: (v: ChildView) => void;
  judge: WaitJudgeFn;
  seconds: number;
  cond?: Partial<Cond>;
  /** tiếng khác cộng vào micro (cả bài) */
  extras?: Float32Array[];
  /** dừng khi con trỏ tới cuối + chừng này giây */
  tailAfterEnd?: number;
  /** gỡ rối: gọi mỗi khung */
  debug?: (an: MicAnalyzer, fr: ReturnType<MicAnalyzer['process']>, now: number) => void;
}

export interface WaitResult {
  events: AppEvent[];
  strikes: Strike[];
  /** lúc nhóm được nhận (giây) */
  creditAt: number[];
  cur: number;
  wrongs: number;
  /** số lần app nghe mà không phải nốt bé bấm (nốt ma: ngân nga, gõ nắp, nói chuyện…) */
  heardTotal: number;
  /** (+ 2026-10-25) số nốt micro bỏ vì là GIỌNG (src/audio/voiceGuard.ts) */
  voiceRejected: number;
}

/** Chế độ chờ, vòng kín (giống tests/weekSim.ts simulateWait) — bé là hàm `child`, app là `judge`. */
export async function runWait(sc: WaitScene): Promise<WaitResult> {
  const c: Cond = { vel: [0.3, 0.6], tempo: 'song', overlap: 0.2, seed: 5, ...sc.cond };
  const sig = new StreamSignal(sc.seconds, c);
  for (const x of sc.extras ?? []) sig.addRaw(x, 0);
  const an = new MicAnalyzer();
  if (c.sens) an.sensitivity = c.sens;
  const res: WaitResult = { events: [], strikes: [], creditAt: [], cur: 0, wrongs: 0, heardTotal: 0, voiceRejected: 0 };
  let movedAt = -1;
  let lastStrikeAt = -1;
  const view: ChildView = {
    now: 0,
    cur: 0,
    movedAt: -1,
    verdicts: res.events,
    strikes: res.strikes,
    lastStrikeAt: -1,
    strike: (s) => {
      if (s.start < view.now + 0.19) s = { ...s, start: view.now + 0.2 };
      res.strikes.push(s);
      sig.addNote(s);
      lastStrikeAt = s.start;
    },
  };
  /** Kiểm tra hai phím quanh lần gõ `at` (twoHand.analyzeHands — như MicListener.verifyHands, "hai tay" = 2 phím) */
  const checkPair = (want: number, other: number, at: number): PairCheck => {
    const idx = Math.round(at * SIM_RATE);
    const from = idx - Math.round(0.35 * SIM_RATE);
    const to = idx + Math.round(0.3 * SIM_RATE);
    if (from < 0) return 'unknown';
    const seg = sig.slice(from, to);
    const r = analyzeHands(seg, SIM_RATE, idx - from, { RH: [want], LH: [other] }, 0, true);
    return pairOf(r);
  };
  const apply = (heard: { midi: number; at: number; t: number }, cur: number, v: Omit<AppEvent, 't' | 'midi' | 'cur'>, now: number) => {
    const ev: AppEvent = { t: now, midi: heard.midi, cur, ...v };
    res.events.push(ev);
    res.wrongs += v.wrongN ?? (v.wrong ? 1 : 0);
    if (v.advance > 0) {
      for (let g = cur; g < cur + v.advance && g < sc.groups.length; g++) res.creditAt[g] = now;
      res.cur = Math.min(sc.groups.length, cur + v.advance);
      movedAt = now;
      an.reset(true); // app.mic.resetTracker()
      if (res.cur >= sc.groups.length) endAt = now + (sc.tailAfterEnd ?? 1);
    }
  };
  /** Đang chờ kiểm tra hai phím (app: verifyHands — bất đồng bộ; chỉ còn đúng nếu con trỏ chưa đi) */
  const waiting: Array<{ heard: { midi: number; at: number; t: number }; cur: number; pair: [number, number]; ready: number }> = [];
  const hop = Math.round(HOP * SIM_RATE);
  let endAt = Infinity;
  for (let i = FRAME, k = 0; i < sig.total - Math.round(0.4 * SIM_RATE); i += hop, k++) {
    if (k % 100 === 99) await tick();
    const now = i / SIM_RATE;
    if (now > endAt) break;
    view.now = now;
    view.cur = res.cur;
    view.movedAt = movedAt;
    view.lastStrikeAt = lastStrikeAt;
    if (res.cur < sc.groups.length) sc.child(view);
    const app: AppSound = 'quiet';
    const fr = an.process(sig.frame(i), SIM_RATE, now, app);
    if (fr.voice) res.voiceRejected++;
    sc.debug?.(an, fr, now);
    // Kiểm tra hai phím đã đủ tín hiệu (gõ + 0,3 s đã xử lý)
    while (waiting.length && waiting[0].ready <= now) {
      const w = waiting.shift()!;
      if (w.cur !== res.cur) continue; // con trỏ đã đi (app: stale)
      const v = sc.judge(w.heard, w.cur, checkPair(w.pair[0], w.pair[1], w.heard.at));
      apply(w.heard, w.cur, v, now);
    }
    if (fr.note) {
      res.heardTotal++;
      if (res.cur >= sc.groups.length) continue;
      const heard = { midi: fr.note.midi, at: fr.note.at ?? now - 0.07, t: now };
      const cur = res.cur;
      const v = sc.judge(heard, cur, null);
      if (v.needPair) waiting.push({ heard, cur, pair: v.needPair, ready: heard.at + 0.33 });
      else apply(heard, cur, v, now);
    }
  }
  return res;
}

/** Bé đàn lần lượt các nốt (`midis`) mỗi `gap` giây từ `from`, không nhìn con trỏ (đàn vội / đàn một mạch). */
export function playRun(v: ChildView, plan: Array<Strike & { done?: boolean }>): void {
  for (const s of plan) if (!s.done && v.now + 0.2 >= s.start) {
    s.done = true;
    v.strike(s);
  }
}

export { RAW, SIM_RATE };

/**
 * Bé đàn giai điệu ở chế độ chờ (như weekSim): mỗi nốt sau `gap` giây; trước khi bấm nốt sau, nhìn con trỏ — nốt trước
 * chưa được nhận thì chờ ~0,8 s rồi đàn lại nốt đó (tối đa `retries` lần, rồi bố mẹ bấm "tiếp" → `skipped`).
 * `shape(i, midi)` đổi lần bấm của bé (sai quãng 8, chạm hai phím…). `onIdle` cho phép bé làm gì đó lúc chờ.
 */
export function melodyChild(o: {
  groups: number[][];
  gap: number;
  vel: () => number;
  shape?: (i: number, midi: number, attempt: number, v: ChildView) => Strike[];
  /** giữ phím (giây) */
  hold?: number;
  retries?: number;
  /** Đàn bỏ qua con trỏ (không chờ) */
  noWait?: boolean;
  start?: number;
}): { child: (v: ChildView) => void; parentSkips: number[] } {
  let next = 0;
  let attempt = 0;
  let planned = o.start ?? 1.0;
  let waitFrom = -1;
  const parentSkips: number[] = [];
  const hold = o.hold ?? o.gap * 0.95;
  const strikeNote = (v: ChildView, i: number, at: number) => {
    const midi = o.groups[i][0];
    const ss = o.shape ? o.shape(i, midi, attempt, v) : [{ midi, start: at, dur: hold, vel: o.vel() }];
    for (const s of ss) v.strike({ ...s, start: Math.max(s.start, at) });
  };
  const child = (v: ChildView) => {
    if (next > o.groups.length) return;
    if (v.now + 0.2 < planned) return;
    const prev = next - 1;
    if (!o.noWait && prev >= 0 && v.cur <= prev) {
      if (waitFrom < 0) waitFrom = v.now;
      if (v.now - waitFrom < 0.8) return;
      waitFrom = -1;
      if (attempt >= (o.retries ?? 3)) {
        parentSkips.push(prev);
        return; // bố mẹ bấm "tiếp" — runner không biết → test tự xử lý (thường không xảy ra)
      }
      attempt++;
      strikeNote(v, prev, v.now + 0.2);
      planned = v.now + 0.2 + o.gap;
      return;
    }
    waitFrom = -1;
    if (next === o.groups.length) {
      next++;
      return;
    }
    attempt = 0;
    strikeNote(v, next, Math.max(planned, v.now + 0.2));
    planned = Math.max(planned, v.now + 0.2) + o.gap;
    next++;
  };
  return { child, parentSkips };
}

export const pairOf = (r: HandsResult | null): PairCheck => pairFromHands(r);

/** Bộ chấm chế độ chờ CỦA APP (src/music/waitJudge.ts) gói cho runWait — như songWait.ts. */
export function appJudge(groups: number[][], phraseStarts: number[] = [0], octaveGrace?: number): WaitJudgeFn & { state: () => WaitJudgeState } {
  let st = waitJudgeInit();
  const f = ((heard, cur, pair) => {
    const r = judgeWait(st, { groups, cur, phraseStarts, heard: heard.midi, t: heard.t, ...(octaveGrace !== undefined ? { octaveGrace } : {}), ...(pair !== null ? { pair } : {}) });
    st = r.state;
    const v = r.verdict;
    const late = v.lateWrong !== undefined ? 1 : 0;
    if (v.kind === 'check') return { kind: 'check', advance: 0, wrong: late > 0, wrongN: late, needPair: [v.want, v.other] as [number, number] };
    const wrongN = (v.kind === 'wrong' ? 1 : 0) + late;
    return { kind: v.kind === 'octave' ? (v.accept ? 'octave-ok' : 'octave-hold') : v.kind, advance: advanceOf(v), wrong: wrongN > 0, wrongN };
  }) as WaitJudgeFn & { state: () => WaitJudgeState };
  f.state = () => st;
  return f;
}

// ======================= THEO NHỊP (vòng hở: bé đàn theo / không theo tiếng tích) =======================

export interface TempoRun {
  heard: HeardEvent[];
  verdicts: NoteVerdict[];
  score: number;
  pulse: PulseFit;
  point: TeacherPoint | null;
  review: RunReview;
}

/**
 * Như songTempo.ts: đếm vào (một ô; 2/4: hai ô) + tiếng tích lọt vào micro → MicAnalyzer → mốc gõ (HeardNote.at) →
 * gradeTiming (cửa sổ "dễ") + analyzeTempo + analyzePulse + lời thầy (teach). `play(t0, spb)` trả về các lần bấm của bé.
 */
export async function runTempo(
  t: Tune,
  play: (t0: number, spb: number, groups: Array<{ start: number; midi: number[] }>) => Strike[],
  /** extras: (+ 2026-10-25) tiếng khác cộng vào micro (vd giọng bé hát theo — tính từ t0, spb) */
  o: { seed?: number; extraSeconds?: number; extras?: (t0: number, spb: number, seconds: number, groups: Array<{ start: number; midi: number[] }>) => Float32Array[] } = {},
): Promise<TempoRun & { voiceRejected: number }> {
  const os = handOnsets(t, null);
  const groups = os.map((g) => ({ start: g.start, midi: g.pitches.map(pitchToMidi) }));
  const bpm = t.bpm;
  const spb = 60 / bpm;
  const bpmM = beatsPerMeasure(t);
  const lead = countInBeats(bpmM);
  const t0 = 0.4 + lead * spb;
  const total = totalBeats(t);
  const strikes = play(t0, spb, groups);
  const seconds = Math.max(t0 + total * spb + 1.5, ...strikes.map((s) => s.start + s.dur + 1)) + (o.extraSeconds ?? 0);
  const clicks = Array.from({ length: Math.ceil(total) + lead }, (_, k) => ({ t: 0.4 + k * spb, accent: (k - lead) % bpmM === 0 }));
  await tick();
  const sig = renderPiano(strikes, seconds, { ...RAW, seed: o.seed ?? 3, clicks, clickLevel: 0.02 });
  for (const x of o.extras?.(t0, spb, seconds, groups) ?? []) for (let i = 0; i < Math.min(x.length, sig.length); i++) sig[i] += x[i];
  const an = new MicAnalyzer();
  let voiceRejected = 0;
  const heard: HeardEvent[] = [];
  const hop = Math.round(HOP * SIM_RATE);
  for (let i = FRAME, k = 0; i < sig.length; i += hop, k++) {
    if (k % 100 === 99) await tick();
    const tt = i / SIM_RATE;
    const fr = an.process(sig.subarray(i - FRAME, i), SIM_RATE, tt);
    if (fr.voice) voiceRejected++;
    const n = fr.note;
    if (n) heard.push({ beat: ((n.at ?? tt - 0.07) - t0) / spb, midi: n.midi });
  }
  const win = TIMING_WINDOWS.easy;
  const gradeInput = os.map((g, i) => ({ index: g.notes[0].index, start: g.start, midi: groups[i].midi }));
  const verdicts = gradeTiming(gradeInput, heard, win.early, win.late);
  const tv = analyzeTempo(gradeInput, heard, verdicts, win);
  const pulse = analyzePulse(gradeInput, heard, win.late);
  const review: RunReview = {
    mode: 'tempo',
    beatsPerMeasure: bpmM,
    phrases: phraseRanges(t),
    measureOffset: 0,
    hints: 'names',
    notes: os.map((g, i) => ({
      ...tv[i],
      notes: g.notes.map((n) => ({ index: n.index, hand: n.hand, midi: pitchesOf(n).map(pitchToMidi), beats: n.beats, finger: n.finger })),
      start: g.start,
      measure: g.notes[0].measure,
    })),
    pulse: pulseNote(pulse, bpm),
  };
  return { heard, verdicts, score: score(verdicts), pulse, point: teach(review), review, voiceRejected };
}
