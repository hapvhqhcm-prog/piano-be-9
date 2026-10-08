import { describe, expect, it } from 'vitest';
import { NoteTracker, detectPitch, nearestNote } from '../src/audio/pitchDetect';
import { midiToFreq, pitchToMidi } from '../src/piano/pitchTable';

const SR = 48000;
const N = 2048;

/** Tín hiệu giống piano: cơ bản + họa âm mạnh (bậc 2 to hơn cả cơ bản ở nốt trầm). */
function pianoLike(freq: number, amp = 0.3, offset = 0): Float32Array {
  const b = new Float32Array(N);
  const partials = [
    [1, 0.6],
    [2, 0.9],
    [3, 0.35],
    [4, 0.2],
    [5, 0.1],
  ];
  for (let i = 0; i < N; i++) {
    const t = (i + offset) / SR;
    let v = 0;
    for (const [k, a] of partials) v += a * Math.sin(2 * Math.PI * freq * k * t * (1 + 0.0004 * (k - 1)));
    b[i] = amp * v * 0.5;
  }
  return b;
}

function noise(amp: number): Float32Array {
  const b = new Float32Array(N);
  let s = 12345;
  for (let i = 0; i < N; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    b[i] = amp * (s / 0x7fffffff - 0.5);
  }
  return b;
}

describe('detectPitch (YIN)', () => {
  const notes = ['C3', 'E3', 'G3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5'];
  it.each(notes)('nhận đúng %s (tín hiệu có họa âm mạnh) trong ±15 cents', (p) => {
    const f = midiToFreq(pitchToMidi(p));
    const r = detectPitch(pianoLike(f), SR);
    expect(r).not.toBeNull();
    const n = nearestNote(r!.freq);
    expect(n.midi).toBe(pitchToMidi(p));
    expect(Math.abs(n.cents)).toBeLessThan(15);
  });

  it('im lặng → null', () => {
    expect(detectPitch(new Float32Array(N), SR)).toBeNull();
  });

  it('tiếng ồn → null hoặc độ rõ thấp', () => {
    const r = detectPitch(noise(0.3), SR);
    expect(r === null || r.clarity < 0.8).toBe(true);
  });

  it('bù được đàn nhà lệch dây (-40 cents)', () => {
    const f = midiToFreq(60) * Math.pow(2, -40 / 1200);
    const r = detectPitch(pianoLike(f), SR)!;
    expect(nearestNote(r.freq, -40).midi).toBe(60);
    expect(Math.abs(nearestNote(r.freq, -40).cents)).toBeLessThan(10);
  });
});

describe('NoteTracker', () => {
  it('chỉ báo nốt khi ổn định đủ khung, mỗi lần nhấn báo 1 lần', () => {
    const tr = new NoteTracker(3);
    const c4 = { freq: 261.6, clarity: 0.95, rms: 0.2 };
    expect(tr.push(c4)).toBeNull();
    expect(tr.push(c4)).toBeNull();
    expect(tr.push(c4)?.midi).toBe(60);
    expect(tr.push(c4)).toBeNull(); // vẫn đang ngân
    expect(tr.push({ ...c4, rms: 0.1 })).toBeNull(); // tắt dần
  });

  it('nhấn lại cùng phím (âm lượng bật tăng) được báo lại', () => {
    const tr = new NoteTracker(2);
    const c4 = (rms: number) => ({ freq: 261.6, clarity: 0.95, rms });
    tr.push(c4(0.2));
    expect(tr.push(c4(0.2))?.midi).toBe(60);
    tr.push(c4(0.08));
    tr.push(c4(0.05));
    expect(tr.push(c4(0.25))).toBeNull(); // onset → bắt đầu đếm lại
    expect(tr.push(c4(0.24))?.midi).toBe(60);
  });

  it('sau im lặng, cùng nốt được báo lại; đổi nốt được báo', () => {
    const tr = new NoteTracker(2);
    const n = (freq: number) => ({ freq, clarity: 0.95, rms: 0.2 });
    tr.push(n(261.6));
    expect(tr.push(n(261.6))?.midi).toBe(60);
    tr.push(null);
    tr.push(n(261.6));
    expect(tr.push(n(261.6))?.midi).toBe(60);
    tr.push(n(293.7));
    expect(tr.push(n(293.7))?.midi).toBe(62);
  });
});

describe('NoteTracker — nốt cũ còn ngân', () => {
  it('reset(true): nốt đang ngân không được báo; gõ phím mới thì được báo', () => {
    const tr = new NoteTracker(2);
    const c4 = (rms: number) => ({ freq: 261.6, clarity: 0.95, rms });
    tr.push(c4(0.2));
    tr.push(c4(0.2));
    tr.reset(true); // sang nốt mới, dây Đô vẫn ngân
    expect(tr.push(c4(0.15))).toBeNull();
    expect(tr.push(c4(0.12))).toBeNull();
    expect(tr.push(c4(0.1))).toBeNull();
    // bé gõ Rê (âm lượng bật lên)
    const d4 = (rms: number) => ({ freq: 293.7, clarity: 0.95, rms });
    expect(tr.push(d4(0.3))).toBeNull();
    expect(tr.push(d4(0.29))?.midi).toBe(62);
  });
});

describe('NoteTracker — đàn khẽ khi nốt cũ còn ngân (OWNER 2026-10-08)', () => {
  const n = (freq: number, rms = 0.1, clarity = 0.95) => ({ freq, clarity, rms });
  it('"gõ theo cao độ": nốt KHÁC nốt bé vừa đàn, rõ & ổn định 3 khung → báo dù âm lượng không bật lên', () => {
    const tr = new NoteTracker(2);
    tr.push(n(261.6), 0, true, 0.1, 0.01);
    expect(tr.push(n(261.6), 0, false, 0.1, 0.01)?.midi).toBe(60);
    tr.reset(true); // app sang nốt sau, Đô còn ngân
    expect(tr.push(n(261.6), 0, false, 0.08, 0.01)).toBeNull();
    expect(tr.push(n(293.7), 0, false, 0.08, 0.01)).toBeNull();
    expect(tr.push(n(293.7), 0, false, 0.08, 0.01)).toBeNull();
    expect(tr.push(n(293.7), 0, false, 0.08, 0.01)?.midi).toBe(62);
  });
  it('không "gõ theo cao độ" cho: cùng nốt, quãng 8, cao độ mờ, hay sau tiếng APP (không biết nốt nào đang ngân)', () => {
    const run = (freq: number, clarity = 0.95, app = false) => {
      const tr = new NoteTracker(2);
      tr.push(n(261.6), 0, true, 0.1, 0.01);
      tr.push(n(261.6), 0, false, 0.1, 0.01);
      tr.reset(true);
      if (app) tr.forgetRinging();
      const out = [];
      for (let i = 0; i < 6; i++) out.push(tr.push(n(freq, 0.08, clarity), 0, false, 0.08, 0.01));
      return out.filter(Boolean).length;
    };
    expect(run(261.6)).toBe(0);
    expect(run(523.2)).toBe(0);
    expect(run(130.8)).toBe(0);
    expect(run(293.7, 0.7)).toBe(0);
    expect(run(293.7, 0.95, true)).toBe(0);
    expect(run(293.7)).toBe(1);
  });
  it('chu kỳ chung với nốt còn ngân (Sol4 + Mi4 → Đô2) không bị báo là nốt sai, kể cả có lần gõ', () => {
    const tr = new NoteTracker(2);
    tr.push(n(392), 0, true, 0.1, 0.01);
    expect(tr.push(n(392), 0, false, 0.1, 0.01)?.midi).toBe(67);
    tr.reset(true);
    tr.push(n(329.6), 0, true, 0.12, 0.01);
    for (let i = 0; i < 5; i++) expect(tr.push(n(65.4), 0, false, 0.1, 0.01)).toBeNull();
    // Đô3 (tay trái) sau Sol4 vẫn được nhận
    const t2 = new NoteTracker(2);
    t2.push(n(392), 0, true, 0.1, 0.01);
    t2.push(n(392), 0, false, 0.1, 0.01);
    t2.reset(true);
    t2.push(n(130.8), 0, true, 0.12, 0.01);
    expect(t2.push(n(130.8), 0, false, 0.12, 0.01)?.midi).toBe(48);
  });
});

describe('dải nghe mở rộng (Cấp 2–3)', () => {
  it.each(['C2', 'G2', 'D5', 'G5', 'E5'])('nhận đúng %s', (p) => {
    const f = midiToFreq(pitchToMidi(p));
    const r = detectPitch(pianoLike(f), SR);
    expect(r).not.toBeNull();
    expect(nearestNote(r!.freq).midi).toBe(pitchToMidi(p));
  });
});
