import { describe, expect, it } from 'vitest';
import { MicAnalyzer, type AppSound } from '../src/audio/micAnalyzer';
import { meterPct } from '../src/audio/MicListener';
import { renderPiano, SIM_RATE, type SimNote, type SimOptions } from './pianoSim';

const REAL: SimOptions = { strings: true, reverb: 0.6, gain: 0.08, noise: 0.006 };

/** Chạy bộ phân tích; `app(t)` cho biết app đang phát tiếng hay không ở thời điểm t. */
function heard(notes: SimNote[], o: SimOptions, app: (t: number) => AppSound = () => 'quiet', a = new MicAnalyzer()) {
  const end = Math.max(...notes.map((n) => n.start + n.dur)) + 1;
  const sig = renderPiano(notes, end, o);
  const hop = Math.round(0.025 * SIM_RATE);
  const out: Array<{ t: number; midi: number }> = [];
  for (let i = 2048; i < sig.length; i += hop) {
    const t = i / SIM_RATE;
    const f = a.process(sig.subarray(i - 2048, i), SIM_RATE, t, app(t));
    if (f.note) out.push({ t, midi: f.note.midi });
  }
  return out;
}

describe('MicAnalyzer — tình huống thật', () => {
  it('bé nhại lại NGAY khi tiếng mẫu của app vừa tắt → vẫn nhận nốt', () => {
    // App phát tới 0,5 s, "đuôi" tới 0,7 s; bé đàn lúc 0,55 s (trong đuôi)
    const app = (t: number): AppSound => (t < 0.5 ? 'sounding' : t < 0.7 ? 'tail' : 'quiet');
    const a = new MicAnalyzer();
    a.reset(true); // như lúc chờ nốt mới
    const h = heard([{ midi: 64, start: 0.55, dur: 0.8 }], REAL, app, a);
    expect(h.map((x) => x.midi)).toEqual([64]);
  });

  it('tiếng của chính app (đang phát) không bị tính là bé đàn', () => {
    const app = (t: number): AppSound => (t < 1.0 ? 'sounding' : t < 1.2 ? 'tail' : 'quiet');
    const a = new MicAnalyzer();
    a.reset(true);
    // "tiếng app" = nốt bắt đầu khi app đang phát, còn ngân sau khi app im
    expect(heard([{ midi: 60, start: 0.3, dur: 1.4 }], REAL, app, a)).toEqual([]);
  });

  it('đàn rất nhỏ: độ nhạy Cao nghe được, Thấp thì bỏ qua', () => {
    const notes: SimNote[] = [60, 62, 64, 65].map((m, i) => ({ midi: m, start: 0.4 + i * 0.7, dur: 0.5, vel: 0.35 }));
    const o = { ...REAL, gain: 0.035, noise: 0.005 };
    const hi = new MicAnalyzer();
    hi.sensitivity = 'high';
    const lo = new MicAnalyzer();
    lo.sensitivity = 'low';
    expect(heard(notes, o, undefined, hi).length).toBeGreaterThanOrEqual(3);
    expect(heard(notes, o, undefined, lo).length).toBeLessThan(heard(notes, o, undefined, hi).length);
  });

  it('phòng im lặng: không báo nốt ma', () => {
    const sig = renderPiano([], 2, { noise: 0.004, hum: 0.003 });
    const a = new MicAnalyzer();
    a.sensitivity = 'high';
    const hop = Math.round(0.025 * SIM_RATE);
    let n = 0;
    for (let i = 2048; i < sig.length; i += hop) if (a.process(sig.subarray(i - 2048, i), SIM_RATE, i / SIM_RATE).note) n++;
    expect(n).toBe(0);
  });

  it('thanh âm lượng: ngưỡng ở giữa, im lặng ở đáy, to thì đầy', () => {
    expect(meterPct({ rms: 0.01, gate: 0.01 })).toBe(50);
    expect(meterPct({ rms: 0, gate: 0.01 })).toBe(0);
    expect(meterPct({ rms: 0.2, gate: 0.01 })).toBe(100);
    expect(meterPct({ rms: 0.002, gate: 0.01 })).toBeLessThan(20);
  });
});
