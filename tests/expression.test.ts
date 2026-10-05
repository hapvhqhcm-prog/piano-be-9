import { describe, expect, it } from 'vitest';
import { MicAnalyzer } from '../src/audio/micAnalyzer';
import {
  judgeArticulation,
  judgeLoudness,
  noteShapes,
  onsetTimes,
  referenceLevel,
  type ExprFrame,
} from '../src/audio/expression';
import { renderPiano, SIM_RATE, type SimNote, type SimOptions } from './pianoSim';

/** Giống tests/micAnalyzer.test.ts: đàn cơ trong phòng thật (dây đôi/ba, vang phòng, ồn). */
const REAL: SimOptions = { strings: true, reverb: 0.6, gain: 0.08, noise: 0.006 };

/** Khung micro y như MicListener.onFrame (bước 25 ms, cửa sổ 2048 mẫu). */
function frames(notes: SimNote[], o: SimOptions = REAL): ExprFrame[] {
  const end = Math.max(...notes.map((n) => n.start + n.dur)) + 1;
  const sig = renderPiano(notes, end, o);
  const hop = Math.round(0.025 * SIM_RATE);
  const a = new MicAnalyzer();
  const out: ExprFrame[] = [];
  for (let i = 2048; i < sig.length; i += hop) {
    const t = i / SIM_RATE;
    const f = a.process(sig.subarray(i - 2048, i), SIM_RATE, t);
    out.push({ t, rms: f.rms, onset: f.onset, floor: f.floor });
  }
  return out;
}

const peaksOf = (notes: SimNote[], o?: SimOptions) => noteShapes(frames(notes, o)).map((s) => s.peak);
const repeat = (midi: number, n: number, vel: number, sp = 0.7): SimNote[] =>
  Array.from({ length: n }, (_, i) => ({ midi, start: 0.4 + i * sp, dur: 0.45, vel }));

describe('TO / NHỎ — so với tiếng "vừa" của chính bé', () => {
  it('đủ số lần gõ, kể cả đàn nhỏ', () => {
    expect(onsetTimes(frames(repeat(60, 3, 0.22))).length).toBe(3);
  });

  it.each([
    [48, REAL, 0.25],
    [60, REAL, 0.25],
    // micro xa hơn: nhỏ quá thì micro không nghe thấy lần gõ (màn chơi nhắc "nhỏ mà vẫn rõ tiếng")
    [67, { ...REAL, gain: 0.06 }, 0.3],
  ] as const)('nốt %i: to = f, nhỏ = p, vừa = không tính', { timeout: 30000 }, (midi, o, softVel) => {
    const ref = referenceLevel(peaksOf(repeat(midi, 2, 0.5), o));
    expect(ref).toBeGreaterThan(0);
    const loud = judgeLoudness(peaksOf(repeat(midi, 2, 0.95), o), ref, 'f');
    const soft = judgeLoudness(peaksOf(repeat(midi, 2, softVel), o), ref, 'p');
    const same = peaksOf(repeat(midi, 2, 0.5), o);
    expect(loud.ok).toBe(true);
    expect(soft.ok).toBe(true);
    // Đàn "vừa" như lúc đo: không được tính là to, cũng không phải nhỏ
    expect(judgeLoudness(same, ref, 'f').ok).toBe(false);
    expect(judgeLoudness(same, ref, 'p').ok).toBe(false);
    // Không lẫn: to không bao giờ thành nhỏ và ngược lại
    expect(judgeLoudness(peaksOf(repeat(midi, 2, 0.95), o), ref, 'p').ok).toBe(false);
    expect(judgeLoudness(peaksOf(repeat(midi, 2, softVel), o), ref, 'f').ok).toBe(false);
  });

  it('không nghe thấy gì → không đạt', () => {
    expect(judgeLoudness([], 0.02, 'p').ok).toBe(false);
    expect(judgeLoudness([0.05], 0, 'f').ok).toBe(false);
  });
});

describe('NGẮT / LIỀN — tiếng còn ngân sau khi gõ', () => {
  /** 4 nốt đi bậc (Đô Rê Mi Fa…) cách nhau `sp` giây; giữ phím `dur` giây. */
  const run = (base: number, sp: number, dur: number, vel: number): SimNote[] =>
    [0, 2, 4, 5].map((d, i) => ({ midi: base + d, start: 0.5 + i * sp, dur, vel }));

  // tay trái (Đô 3), giữa (Đô 4), cao (Sol 4) × nhanh/chậm × nhỏ/to
  const cases: Array<[number, number, number]> = [
    [48, 0.4, 0.7],
    [48, 1.0, 0.35],
    [60, 0.4, 0.35],
    [60, 0.7, 0.8],
    [60, 1.0, 0.6],
    [67, 0.4, 0.8],
    [67, 1.0, 0.35],
  ];

  it.each(cases)('nốt %i, cách %f s, lực %f: ngắt → NGẮT, giữ liền → LIỀN', { timeout: 30000 }, (base, sp, vel) => {
    for (const dur of [0.09, 0.15]) {
      const r = judgeArticulation(noteShapes(frames(run(base, sp, dur, vel))), 'stac');
      expect(r.notes).toBe(4);
      expect(r.heard, `ngắt giữ ${dur}s`).toBe('stac');
    }
    const leg = judgeArticulation(noteShapes(frames(run(base, sp, sp + 0.04, vel))), 'leg');
    expect(leg.notes).toBe(4);
    expect(leg.heard).toBe('leg');
    expect(leg.ok).toBe(true);
  });

  it('ngắt trên một phím lặp lại (Đô Đô Đô Đô) cũng nhận ra', { timeout: 30000 }, () => {
    const notes = Array.from({ length: 4 }, (_, i) => ({ midi: 60, start: 0.5 + i * 0.5, dur: 0.1, vel: 0.6 }));
    const r = judgeArticulation(noteShapes(frames(notes)), 'stac');
    expect(r.ok).toBe(true);
    // ngắt thì KHÔNG được chấm là liền
    expect(judgeArticulation(noteShapes(frames(notes)), 'leg').ok).toBe(false);
  });

  it('đàn liền nhanh không bị chấm là ngắt; nhả phím sớm (hở rõ) không được chấm là liền', { timeout: 30000 }, () => {
    const leg = noteShapes(frames(run(60, 0.4, 0.44, 0.6)));
    expect(judgeArticulation(leg, 'stac').ok).toBe(false);
    // nhả phím sau 0,2 s, nốt sau tới lúc 0,4 s → hở → không phải liền
    const detached = noteShapes(frames(run(60, 0.4, 0.2, 0.6)));
    expect(judgeArticulation(detached, 'leg').ok).toBe(false);
  });

  it('chỉ một nốt thì không chấm được liền', () => {
    const r = judgeArticulation([{ at: 0, peak: 0.02, keep: 0.4, dip: null, span: Infinity }], 'leg');
    expect(r.ok).toBe(false);
  });
});
