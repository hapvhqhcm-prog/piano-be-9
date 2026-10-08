import { describe, expect, it } from 'vitest';
import { MicAnalyzer, type Sensitivity } from '../src/audio/micAnalyzer';
import { CandidateTally, chooseSensitivity, noteMargin, type NoteCheck } from '../src/audio/micTune';
import { renderPiano, type SimOptions } from './pianoSim';

/**
 * Tự chỉnh độ nhạy sau "Kiểm tra 5 nốt": chạy đúng như màn Thử micro (từng nốt một, đo RMS/ngưỡng/ồn nền/ứng viên)
 * trên GIẢ LẬP đàn cơ, rồi kiểm tra độ nhạy được chọn có làm micro nghe được các nốt không.
 */
const CHECK = [60, 62, 64, 65, 67];
const REAL: SimOptions = { strings: true, reverb: 0.6, gain: 0.08, noise: 0.006 };

function wizard(o: SimOptions, sens: Sensitivity, tuningCents = 0, vel = 0.7): NoteCheck[] {
  const sr = o.sampleRate ?? 48000;
  // 1 s im lặng đầu (micro vừa bật), mỗi nốt một ô 2 s
  const notes = CHECK.map((m, i) => ({ midi: m, start: 1 + i * 2, dur: 0.8, vel }));
  const sig = renderPiano(notes, 1 + CHECK.length * 2, o);
  const a = new MicAnalyzer();
  a.sensitivity = sens;
  a.tuningCents = tuningCents;
  const hop = Math.round(0.025 * sr);
  const checks: NoteCheck[] = [];
  let tally = new CandidateTally();
  for (let i = 2048; i < sig.length; i += hop) {
    const t = i / sr;
    const step = Math.floor((t - 0.9) / 2);
    if (step >= 0 && step < CHECK.length && !checks[step]) {
      a.reset(true);
      tally = new CandidateTally();
      checks[step] = { want: CHECK[step], result: 'none', heard: [], maxRms: 0, floor: 0, gate: 0, bestClarity: 0, candidates: [] };
    }
    const f = a.process(sig.subarray(i - 2048, i), sr, t);
    const c = step >= 0 ? checks[Math.min(step, CHECK.length - 1)] : undefined;
    if (!c || c.result === 'ok') continue;
    c.maxRms = Math.max(c.maxRms, f.rms);
    c.floor = f.floor;
    c.gate = f.gate;
    if (f.pitch && f.rms >= f.gate) {
      c.bestClarity = Math.max(c.bestClarity, f.pitch.clarity);
      tally.add(f.pitch.freq, f.pitch.clarity, tuningCents);
      c.candidates = tally.top();
    }
    if (f.note) {
      c.heard.push(f.note.midi);
      c.result = f.note.midi === c.want ? 'ok' : 'wrong';
    }
  }
  return checks;
}
const okCount = (cs: NoteCheck[]) => cs.filter((c) => c.result === 'ok').length;

describe('tự chỉnh độ nhạy (thuần)', () => {
  const base = { want: 60, heard: [60], bestClarity: 0.9 };
  it('tiếng đàn nhỏ so với ồn nền → Cao, có câu giải thích', () => {
    const cs: NoteCheck[] = Array.from({ length: 5 }, () => ({ ...base, result: 'none', heard: [], maxRms: 0.006, floor: 0.0015, gate: 0.0045 }));
    const a = chooseSensitivity(cs, 'normal');
    expect(a.sensitivity).toBe('high');
    expect(a.changed).toBe(true);
    expect(a.message).toBe('Đã tự chỉnh độ nhạy: Cao — vì tiếng đàn tới micro khá nhỏ.');
  });
  it('phòng ồn mà đàn to → Thấp (bớt nghe nhầm tiếng ồn)', () => {
    const cs: NoteCheck[] = Array.from({ length: 5 }, () => ({ ...base, result: 'ok', maxRms: 0.08, floor: 0.006, gate: 0.018 }));
    expect(chooseSensitivity(cs, 'normal').sensitivity).toBe('low');
  });
  it('đang Cao, nghe đúng hết, dư nhiều → về Vừa; đang Thấp nghe tốt ở phòng yên → giữ Thấp', () => {
    const cs: NoteCheck[] = Array.from({ length: 5 }, () => ({ ...base, result: 'ok', maxRms: 0.05, floor: 0.001, gate: 0.002 }));
    expect(chooseSensitivity(cs, 'high').sensitivity).toBe('normal');
    const keep = chooseSensitivity(cs, 'low');
    expect(keep.sensitivity).toBe('low');
    expect(keep.changed).toBe(false);
  });
  it('một nốt bé quên đàn không kéo cả kết quả (lấy nốt nhỏ nhì)', () => {
    const cs: NoteCheck[] = Array.from({ length: 5 }, () => ({ ...base, result: 'ok', maxRms: 0.05, floor: 0.002, gate: 0.006 }));
    cs[2] = { ...cs[2], result: 'none', heard: [], maxRms: 0.0025 };
    expect(chooseSensitivity(cs, 'normal').sensitivity).toBe('normal');
  });
  it('sót/nghe sai dù tiếng đủ to: lệch nửa cung → gợi ý chỉnh theo đàn nhà; không thì → bớt ồn', () => {
    const loud = { maxRms: 0.05, floor: 0.002, gate: 0.006 };
    const semi: NoteCheck[] = [
      { ...base, ...loud, want: 60, result: 'wrong', heard: [59] },
      { ...base, ...loud, want: 62, result: 'none', heard: [], candidates: [{ midi: 61, frames: 6, clarity: 0.8, cents: 45 }] },
      { ...base, ...loud, want: 64, result: 'ok', heard: [64] },
    ];
    expect(chooseSensitivity(semi, 'normal').tips).toContain('calibrate');
    const noisy: NoteCheck[] = [
      { ...base, ...loud, want: 60, result: 'none', heard: [], bestClarity: 0.4 },
      { ...base, ...loud, want: 62, result: 'none', heard: [], bestClarity: 0.3 },
    ];
    expect(chooseSensitivity(noisy, 'normal').tips).toEqual(['quiet']);
  });
  it('micro không nghe thấy gì → không đổi', () => {
    const a = chooseSensitivity([{ ...base, result: 'none', heard: [], maxRms: 0, floor: 0, gate: 0 }], 'normal');
    expect(a.changed).toBe(false);
  });
  it('độ dư: tiếng to gấp đôi → dư gấp đôi', () => {
    expect(noteMargin({ maxRms: 0.02, floor: 0.002 }, 'normal')).toBeCloseTo(2 * noteMargin({ maxRms: 0.01, floor: 0.002 }, 'normal'));
  });
  it('đếm ứng viên: nốt nhiều khung nhất đứng đầu, kèm độ lệch cents', () => {
    const t = new CandidateTally();
    for (let i = 0; i < 5; i++) t.add(261.63 * Math.pow(2, 20 / 1200), 0.9);
    t.add(277.18, 0.7);
    t.add(500, 0.2); // không rõ → bỏ
    const top = t.top();
    expect(top.map((c) => c.midi)).toEqual([60, 61]);
    expect(top[0].cents).toBe(20);
  });
});

describe('tự chỉnh độ nhạy trên giả lập đàn cơ', { timeout: 120000 }, () => {
  it('đàn nhỏ / iPad xa: Vừa sót nốt → chọn Cao → nghe được', () => {
    const o = { ...REAL, gain: 0.015, noise: 0.006 };
    const before = wizard(o, 'normal', 0, 0.4);
    expect(okCount(before)).toBeLessThan(5);
    const adv = chooseSensitivity(before, 'normal');
    expect(adv.sensitivity).toBe('high');
    const after = wizard(o, adv.sensitivity, 0, 0.4);
    expect(okCount(after)).toBeGreaterThanOrEqual(okCount(before));
    expect(okCount(after)).toBeGreaterThanOrEqual(4);
  });
  it('đàn rõ, phòng bình thường: giữ Vừa', () => {
    const cs = wizard(REAL, 'normal');
    expect(okCount(cs)).toBe(5);
    expect(chooseSensitivity(cs, 'normal').sensitivity).toBe('normal');
  });
  it('phòng ồn (TV, quạt), đàn to: chọn Thấp và vẫn nghe đủ 5 nốt', () => {
    const o = { ...REAL, gain: 0.3, noise: 0.02, hum: 0.006 };
    const cs = wizard(o, 'normal', 0, 0.9);
    const adv = chooseSensitivity(cs, 'normal');
    expect(adv.sensitivity).toBe('low');
    expect(okCount(wizard(o, 'low', 0, 0.9))).toBe(5);
  });
  it('đàn lệch dây −60 cents: ứng viên lộ lệch nửa cung → gợi ý "Chỉnh theo đàn nhà"', () => {
    const cs = wizard({ ...REAL, detuneCents: -60 }, 'normal');
    expect(okCount(cs)).toBeLessThan(5);
    expect(chooseSensitivity(cs, 'normal').tips).toContain('calibrate');
  });
});
