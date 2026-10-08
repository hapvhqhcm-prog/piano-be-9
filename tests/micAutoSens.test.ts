import { describe, expect, it } from 'vitest';
import { MicAnalyzer, type Sensitivity } from '../src/audio/micAnalyzer';
import { SensitivityAdvisor } from '../src/audio/micAutoSens';
import { renderPiano, SIM_RATE, type SimNote, type SimOptions } from './pianoSim';

/** Tự tăng độ nhạy trong buổi học (OWNER 2026-10-08: "phải đánh thật to mới nghe được"). */
describe('SensitivityAdvisor (thuần)', () => {
  it('nhiều lần "suýt nghe" → tăng MỘT bậc, chỉ MỘT lần mỗi phiên; Cao thì thôi', () => {
    const a = new SensitivityAdvisor();
    a.heard();
    a.nearMiss();
    a.heard();
    a.nearMiss();
    a.nearMiss();
    expect(a.advise('normal')).toBeNull(); // mới 3 lần
    a.nearMiss();
    expect(a.advise('normal')).toEqual({ from: 'normal', to: 'high', heard: 2, missed: 4 });
    for (let i = 0; i < 8; i++) a.nearMiss();
    expect(a.advise('high')).toBeNull();
    expect(a.advise('low')).toBeNull(); // đã dùng lượt của phiên này
    a.reset();
    for (let i = 0; i < 5; i++) a.nearMiss();
    expect(a.advise('low')?.to).toBe('normal');
  });
  it('phần lớn nốt nghe được, thỉnh thoảng sót → không đổi', () => {
    const a = new SensitivityAdvisor();
    for (let i = 0; i < 30; i++) (i % 4 === 0 ? a.nearMiss() : a.heard());
    expect(a.advise('normal')).toBeNull();
  });
});

const RAW: SimOptions = { strings: true, reverb: 0.6, legato: 0.25, gain: 0.004, noise: 0.00025, hum: 0.0001 };

/** Chạy như MicListener: nốt nghe được / "suýt nghe" → bộ tư vấn; áp dụng ngay khi được khuyên. */
function lesson(notes: SimNote[], o: SimOptions, sens: Sensitivity, seconds?: number) {
  const end = seconds ?? Math.max(...notes.map((n) => n.start + n.dur)) + 1;
  const sig = renderPiano(notes, end, o);
  const a = new MicAnalyzer();
  a.sensitivity = sens;
  const adv = new SensitivityAdvisor();
  const hop = Math.round(0.025 * SIM_RATE);
  let heard = 0;
  let near = 0;
  const changes: Array<{ t: number; to: Sensitivity }> = [];
  for (let i = 2048; i < sig.length; i += hop) {
    const f = a.process(sig.subarray(i - 2048, i), SIM_RATE, i / SIM_RATE);
    if (f.note) heard++;
    if (f.nearMiss) near++;
    if (f.note || f.nearMiss) {
      if (f.nearMiss) adv.nearMiss();
      else adv.heard();
      const c = adv.advise(a.sensitivity);
      if (c) {
        a.sensitivity = c.to;
        changes.push({ t: i / SIM_RATE, to: c.to });
      }
    }
  }
  return { heard, near, changes };
}

describe('"suýt nghe" trên giả lập đàn cơ', () => {
  const soft = (n: number): SimNote[] => Array.from({ length: n }, (_, i) => ({ midi: [60, 62, 64, 65, 67][i % 5], start: 0.5 + i * 0.8, dur: 0.6, vel: 0.25 + (i % 3) * 0.1 }));
  it('độ nhạy Thấp, bé đàn khẽ, micro "thô": nhận ra "suýt nghe" → tự lên Vừa → từ đó nghe được', { timeout: 30000 }, () => {
    const r = lesson(soft(16), RAW, 'low');
    expect(r.changes.length).toBe(1);
    expect(r.changes[0].to).toBe('normal');
    expect(r.changes[0].t).toBeLessThan(0.5 + 8 * 0.8);
    expect(r.heard).toBeGreaterThanOrEqual(8);
  });
  it('đàn rõ: không tự đổi; phòng yên / tiếng nói rì rầm / đuôi nốt: không "suýt nghe"', { timeout: 30000 }, () => {
    const loud = soft(12).map((n) => ({ ...n, vel: 0.9 }));
    const r = lesson(loud, RAW, 'normal');
    expect(r.changes).toEqual([]);
    expect(r.near).toBeLessThanOrEqual(1);
    expect(lesson([], { noise: 0.00025, hum: 0.0001 }, 'normal', 15).near).toBe(0);
    expect(lesson([], { noise: 0.0008, hum: 0.0003, ns: 12 }, 'normal', 15).near).toBe(0);
  });
});
