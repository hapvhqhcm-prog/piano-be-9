/**
 * (+ 2026-10-09) Tự học lệch dây đàn nhà (src/audio/autoTune.ts): bộ ước lượng, bộ gom khung trên giả lập đàn cơ,
 * lệch họa âm ở nốt trầm (Đô3–Sol3: YIN + NNLS), lưu Cài đặt (schema), MicListener.
 */
import { describe, expect, it } from 'vitest';
import { AUTO_TUNE, TuningEstimator, TuningLearner, describeAutoTune, emptyAutoTuning, pcCents, registerOf, validAutoTuning } from '../src/audio/autoTune';
import { analyzeChord, CHORD_FRAME } from '../src/audio/chordVerify';
import { MicAnalyzer } from '../src/audio/micAnalyzer';
import { MicListener } from '../src/audio/MicListener';
import { centsAt, NoteTracker, type Tuning } from '../src/audio/pitchDetect';
import type { AudioEngine } from '../src/audio/AudioEngine';
import { defaultData, validateAppData as validate } from '../src/progress/schema';
import { renderPiano, stretch, type SimNote, type SimOptions } from './pianoSim';
import { RAW } from './weekSim';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe('TuningEstimator', () => {
  it('chưa áp dụng khi < 12 nốt; đủ 12 nốt đều nhau → áp dụng trung vị', () => {
    const e = new TuningEstimator();
    for (let i = 0; i < AUTO_TUNE.minNotes - 1; i++) expect(e.add(60 + (i % 8), -40 + (i % 3))).toBe(false);
    expect(e.active).toBe(false);
    expect(e.centsAtMidi(64)).toBe(0);
    expect(e.add(64, -41)).toBe(true);
    expect(e.active).toBe(true);
    expect(Math.abs(e.centsAtMidi(64) + 40)).toBeLessThanOrEqual(1);
  });

  it('theo âm khu ("giãn dây"): trầm / giữa / cao riêng, nội suy giữa các âm khu', () => {
    const e = new TuningEstimator();
    for (let i = 0; i < 8; i++) {
      e.add(50, -12);
      e.add(64, 0);
      e.add(79, 10);
    }
    const st = e.stats();
    expect(st.applied).toEqual([-12, 0, 10]);
    expect(e.centsAtMidi(40)).toBe(-12);
    expect(e.centsAtMidi(90)).toBe(10);
    expect(e.centsAtMidi(65.5)).toBe(0);
    expect(e.centsAtMidi(60)).toBeGreaterThan(-12);
    expect(e.centsAtMidi(60)).toBeLessThan(0);
    expect(e.centsAtMidi(72)).toBeGreaterThan(0);
    expect(describeAutoTune(st)).toContain('đang bù -12/0/+10c');
  });

  it('âm khu chưa đủ nốt → dùng trung vị cả đàn', () => {
    const e = new TuningEstimator();
    for (let i = 0; i < 14; i++) e.add(62, -30);
    e.add(84, -10);
    expect(e.stats().applied).toEqual([-30, -30, -30]);
  });

  it('không trôi theo nốt lạ: lệch > ±60 c bị bỏ; sau 4 số đo, lệch > 35 c so với ước lượng bị bỏ', () => {
    const e = new TuningEstimator();
    expect(e.add(60, 95)).toBe(false); // nhầm phím bên cạnh
    expect(e.add(60, -70)).toBe(false);
    for (let i = 0; i < 20; i++) e.add(60 + (i % 5), -45 + (i % 3) - 1);
    const before = e.stats();
    const r = rng(3);
    // 30 % số đo "lạ" (giọng nói / nốt ma lọt qua) rải ±60 c
    for (let i = 0; i < 40; i++) e.add(64, r() < 0.3 ? -60 + r() * 120 : -45 + (r() - 0.5) * 6);
    expect(Math.abs(e.stats().applied![1] - before.applied![1])).toBeLessThanOrEqual(3);
  });

  it('trễ (hysteresis): thay đổi < 4 c không đổi giá trị áp dụng', () => {
    const e = new TuningEstimator();
    for (let i = 0; i < 12; i++) e.add(64, -20);
    expect(e.stats().applied).toEqual([-20, -20, -20]);
    let changed = false;
    for (let i = 0; i < 24; i++) changed = e.add(64, -17) || changed;
    expect(changed).toBe(false);
    expect(e.stats().applied).toEqual([-20, -20, -20]);
    for (let i = 0; i < 24; i++) e.add(64, -14);
    // đổi theo từng bước ≥ 4 c (−20 → −15), rồi đứng yên khi chỉ còn lệch 1 c
    expect(e.stats().applied![1]).toBeGreaterThanOrEqual(-15);
    expect(e.stats().applied![1]).toBeLessThanOrEqual(-14);
  });

  it('phân tán lớn → không áp dụng', () => {
    const e = new TuningEstimator();
    const xs = [-55, -5, -30, -50, -10];
    for (let i = 0; i < 24; i++) e.add(64, xs[i % 5]);
    // mọi số đo trong ±35 c quanh trung vị nhưng rải rộng → MAD lớn
    expect(e.stats().mad!).toBeGreaterThan(AUTO_TUNE.maxMad);
    expect(e.active).toBe(false);
  });

  it('đàn vừa được lên dây lại: 8 số đo liền nhau cùng lệch hẳn → học lại', () => {
    const e = new TuningEstimator();
    for (let i = 0; i < 24; i++) e.add(64, -45);
    expect(e.centsAtMidi(64)).toBe(-45);
    for (let i = 0; i < 7; i++) e.add(64, 0);
    expect(e.centsAtMidi(64)).toBe(-45);
    e.add(64, 1);
    expect(e.active).toBe(false); // mới 8 số đo — chờ đủ 12
    for (let i = 0; i < 4; i++) e.add(64, 0);
    expect(e.centsAtMidi(64)).toBe(0);
  });

  it('lưu / nạp (Cài đặt) + kiểm tra dữ liệu; schema chấp nhận trường tùy chọn hợp lệ, chặn dữ liệu hỏng', () => {
    const e = new TuningEstimator();
    for (let i = 0; i < 30; i++) e.add([50, 64, 76][i % 3], -25);
    const st = e.state;
    expect(validAutoTuning(st)).toBe(true);
    expect(st.mid.length).toBeLessThanOrEqual(AUTO_TUNE.ring);
    expect(JSON.stringify(st).length).toBeLessThan(400);
    const e2 = new TuningEstimator(JSON.parse(JSON.stringify(st)));
    expect(e2.stats()).toEqual(e.stats());
    expect(validAutoTuning(emptyAutoTuning())).toBe(true);
    for (const bad of [null, 5, { low: [], mid: [], high: [] }, { low: [99], mid: [], high: [], ap: null }, { low: [], mid: [], high: [], ap: [1, 2] }, { low: 'x', mid: [], high: [], ap: null }])
      expect(validAutoTuning(bad)).toBe(false);
    // dữ liệu hỏng → bộ ước lượng bắt đầu trống (không vỡ)
    expect(new TuningEstimator({ low: [999] } as never).stats().n).toBe(0);
    const d = defaultData();
    expect(validate(d)).toEqual([]);
    expect(validate({ ...d, settings: { ...d.settings, micAutoTune: st } })).toEqual([]);
    expect(validate({ ...d, settings: { ...d.settings, micAutoTune: { low: [1] } } })).toContain('settings.micAutoTune');
  });

  it('âm khu & cent theo tên nốt', () => {
    expect([registerOf(59), registerOf(60), registerOf(71), registerOf(72)]).toEqual(['low', 'mid', 'mid', 'high']);
    const f = 440 * Math.pow(2, (60 - 69 - 0.4) / 12);
    expect(pcCents(f, 60)).toBeCloseTo(-40, 5);
    expect(pcCents(f * 2, 60)).toBeCloseTo(-40, 5); // nhảy quãng 8 vẫn cùng tên
    expect(Math.abs(pcCents(f, 62))).toBeGreaterThan(60);
  });
});

/** Chạy giả lập qua MicAnalyzer + TuningLearner; trả về các số đo được học. */
function learnRun(notes: SimNote[], seconds: number, o: SimOptions, expected: (t: number) => number[] | null): number[] {
  const sig = renderPiano(notes, seconds, { ...RAW, ...o });
  const an = new MicAnalyzer();
  const est = new TuningEstimator();
  const got: number[] = [];
  const add = est.add.bind(est);
  est.add = (m: number, c: number) => (got.push(Math.round(c)), add(m, c));
  const L = new TuningLearner(est);
  for (let i = 2048; i < sig.length; i += 1200) {
    const t = i / 48000;
    const f = an.process(sig.subarray(i - 2048, i), 48000, t);
    L.frame(f.pitch, f.note, f.onset, f.note ? expected(t) : null);
  }
  return got;
}

describe('TuningLearner trên giả lập đàn cơ', () => {
  it('đàn lệch −45 c: học được ~−45 c từ nốt đúng (Đô4–La4)', { timeout: 30000 }, () => {
    const seq = [60, 62, 64, 65, 67, 69, 67, 64];
    const notes = seq.map((m, k) => ({ midi: m, start: 2.5 + k * 0.7, dur: 0.6, vel: 0.35 + 0.1 * (k % 3) }));
    const got = learnRun(notes, 9, { detuneCents: -45, seed: 5 }, (t) => [seq[Math.max(0, Math.min(seq.length - 1, Math.floor((t - 2.5) / 0.7)))]]);
    expect(got.length).toBeGreaterThanOrEqual(6);
    for (const c of got) expect(Math.abs(c + 45)).toBeLessThanOrEqual(6);
  });

  it('bé đàn nhầm phím bên cạnh / app không chờ nốt → KHÔNG học', { timeout: 30000 }, () => {
    // chờ Mi4 mà bé đàn Fa4 (cách 100 c) hoặc Rê4 (200 c)
    const wrong = [65, 62, 65, 62].map((m, k) => ({ midi: m, start: 2.5 + k * 0.8, dur: 0.6, vel: 0.5 }));
    expect(learnRun(wrong, 6.5, { seed: 6 }, () => [64])).toEqual([]);
    const right = [64, 64].map((m, k) => ({ midi: m, start: 2.5 + k * 0.8, dur: 0.6, vel: 0.5 }));
    expect(learnRun(right, 4.5, { seed: 7 }, () => null)).toEqual([]);
  });
});

describe('nốt trầm Đô3–Sol3: lệch họa âm (B) — YIN + NNLS', () => {
  // pianoSim có lệch họa âm: f_n = n·f0·√(1 + B·n²), B = 0,0012 dưới Sol3 (×2 = đàn đứng nhỏ)
  const BASS = [48, 50, 52, 53, 55];
  for (const inharm of [1, 2])
    for (const detune of [0, -45])
      it(`B ×${inharm}, lệch ${detune} c (+ giãn dây −8 c ở Đô3)`, { timeout: 60000 }, () => {
        const sim: SimOptions = { ...RAW, inharm, detuneCents: detune, stretchCents: stretch(-8, 10) };
        // 1) YIN: mỗi nốt trầm đàn riêng → nhận đúng nốt (bù bằng kết quả tự học của chính các nốt đó)
        const est = new TuningEstimator();
        const learner = new TuningLearner(est);
        const heard: number[] = [];
        const seq = [...BASS, ...BASS, ...BASS];
        const notes = seq.map((m, k) => ({ midi: m, start: 2.5 + k * 0.8, dur: 0.7, vel: 0.5 + 0.1 * (k % 3) }));
        const sig = renderPiano(notes, 2.5 + seq.length * 0.8 + 1, { ...sim, seed: 21 + inharm });
        const an = new MicAnalyzer();
        for (let i = 2048; i < sig.length; i += 1200) {
          const t = i / 48000;
          const f = an.process(sig.subarray(i - 2048, i), 48000, t);
          const k = Math.max(0, Math.min(seq.length - 1, Math.floor((t - 2.5) / 0.8)));
          if (learner.frame(f.pitch, f.note, f.onset, f.note ? [seq[k]] : null)) an.tuningAt = est.map();
          if (f.note) heard.push(f.note.midi);
        }
        expect(heard.filter((m, i) => m === seq[i]).length).toBeGreaterThanOrEqual(seq.length - 1);
        expect(est.active).toBe(true);
        // 2) NNLS (hai tay / hợp âm): quãng 5 tay trái Đô3+Sol3 + Mi4 tay phải; thiếu Sol3 phải bị phát hiện
        const tunings: Tuning[] = [0, est.map()!];
        const res = tunings.map((tun) => {
          const ok = renderPiano([48, 55, 64].map((m) => ({ midi: m, start: 0.5, dur: 1, vel: 0.6 })), 1.5, { ...sim, seed: 3 });
          const miss = renderPiano([48, 64].map((m) => ({ midi: m, start: 0.5, dur: 1, vel: 0.6 })), 1.5, { ...sim, seed: 4 });
          const seg = (x: Float32Array) => x.subarray(Math.round((0.5 + CHORD_FRAME.startAfter) * 48000), Math.round((0.5 + CHORD_FRAME.startAfter + CHORD_FRAME.length) * 48000));
          const a = analyzeChord(seg(ok), 48000, [48, 55, 64], tun);
          const b = analyzeChord(seg(miss), 48000, [48, 55, 64], tun);
          return { full: a.conclusive && a.missing.length === 0, caught: b.conclusive && b.missing.includes(55) };
        });
        // Sau tự học: luôn đúng. (Trước: đàn lệch −45 c thì khuôn họa âm lệch ngoài dung sai ±25 c)
        expect(res[1]).toEqual({ full: true, caught: true });
        if (detune === 0 && inharm === 1) expect(res[0]).toEqual({ full: true, caught: true });
        // nốt trầm: độ lệch áp dụng ≈ YIN đọc (lệch thật + giãn dây + lệch họa âm)
        const d50 = centsAt(est.map()!, 50) - (detune + stretch(-8, 10)(50));
        expect(d50).toBeGreaterThanOrEqual(-5);
        expect(d50).toBeLessThanOrEqual(16 * inharm + 6);
      });
});

describe('MicListener: tự học + lưu', () => {
  it('chỉ học khi màn hình chờ nốt; báo lưu mỗi 4 số đo và khi giá trị áp dụng đổi; nạp lại / xóa', () => {
    const mic = new MicListener({ onStateChange: () => () => undefined } as unknown as AudioEngine);
    const saves: Array<{ n: number; applied: boolean }> = [];
    mic.onAutoTune((st, applied) => saves.push({ n: st.low.length + st.mid.length + st.high.length, applied }));
    const f0 = 440 * Math.pow(2, (64 - 69 - 0.3) / 12); // Mi4 lệch −30 c
    const learn = (mic as unknown as { learnTuning: (f: unknown, app: string) => void }).learnTuning.bind(mic);
    const strike = () => {
      learn({ pitch: { freq: f0, clarity: 0.95, rms: 0.01 }, note: { midi: 64, cents: -30, freq: f0 }, onset: false }, 'quiet');
      for (let k = 0; k < 8; k++) learn({ pitch: { freq: f0, clarity: 0.95, rms: 0.01 }, note: null, onset: false }, 'quiet');
    };
    strike();
    expect(mic.autoTune.stats().n).toBe(0); // không đặt `expected` → không học
    mic.expected = () => [64];
    for (let i = 0; i < 12; i++) strike();
    expect(mic.autoTune.stats().n).toBe(12);
    expect(mic.autoTune.centsAtMidi(64)).toBe(-30);
    expect(saves.filter((s) => s.applied)).toHaveLength(1);
    expect(saves.length).toBeGreaterThanOrEqual(3);
    expect(mic.effectiveTuning).toBeTypeOf('function');
    // app đang phát tiếng → không học
    const n = mic.autoTune.stats().n;
    learn({ pitch: { freq: f0, clarity: 0.95, rms: 0.01 }, note: { midi: 64, cents: -30, freq: f0 }, onset: false }, 'sounding');
    for (let k = 0; k < 8; k++) learn({ pitch: { freq: f0, clarity: 0.95, rms: 0.01 }, note: null, onset: false }, 'sounding');
    expect(mic.autoTune.stats().n).toBe(n);
    const saved = mic.autoTune.state;
    mic.loadAutoTune(null);
    expect(mic.effectiveTuning).toBe(0);
    mic.tuningCents = 12;
    expect(mic.effectiveTuning).toBe(12);
    mic.loadAutoTune(saved);
    expect(centsAt(mic.effectiveTuning, 64)).toBe(-30);
  });
});

describe('NoteTracker: nốt trầm "nhảy lên quãng 8" (YIN bắt họa âm 2)', () => {
  const hz = (m: number) => 440 * Math.pow(2, (m - 69 + 0.45) / 12);
  const fr = (m: number) => ({ freq: hz(m), clarity: 0.95, rms: 0.01 });
  it('Rê3 đang ngân → "Rê4" không có lần gõ mới: không báo; có lần gõ: báo; nốt giữa (Rê4 → Rê5) vẫn báo', () => {
    const t = new NoteTracker();
    const out: number[] = [];
    const push = (m: number, onset = false) => {
      const n = t.push(fr(m), 0, onset, 0.01);
      if (n) out.push(n.midi);
    };
    push(50, true);
    push(50);
    push(50);
    for (let i = 0; i < 4; i++) push(62);
    expect(out).toEqual([50]);
    push(62, true);
    push(62);
    expect(out).toEqual([50, 62]);
    push(74);
    push(74);
    expect(out).toEqual([50, 62, 74]);
  });
});
