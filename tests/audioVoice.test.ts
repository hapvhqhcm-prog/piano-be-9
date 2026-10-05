import { describe, expect, it } from 'vitest';
import {
  cutoffEvents,
  gainEvents,
  harmonicTable,
  naturalDecay,
  paramAt,
  registerGain,
  roomImpulse,
  thumpNoise,
  voiceParams,
  waveKey,
} from '../src/audio/pianoVoice';

const C2 = 65.41;
const C4 = 261.63;
const C6 = 1046.5;

describe('pianoVoice — bao biên', () => {
  it('bắt đầu 0, lên đỉnh sau ~3 ms, im hẳn ở tEnd', () => {
    const p = voiceParams(C4, 1, 1);
    const ev = gainEvents(p);
    expect(paramAt(ev, 0)).toBe(0);
    expect(paramAt(ev, p.attack)).toBeCloseTo(p.peak, 6);
    expect(paramAt(ev, p.attack / 2)).toBeCloseTo(p.peak / 2, 6);
    expect(paramAt(ev, p.tEnd + 0.01)).toBe(0);
    // ngay trước khi tắt hẳn còn rất nhỏ (không "tách")
    expect(paramAt(ev, p.tEnd - 1e-4)).toBeLessThan(p.peak * 0.01);
  });

  it('tắt 2 giai đoạn: nhanh lúc đầu, chậm về sau', () => {
    const p = voiceParams(C4, 1, 3);
    const ev = gainEvents(p);
    const db = (t: number) => 20 * Math.log10(paramAt(ev, t) / p.peak);
    const early = (db(0.01) - db(0.11)) / 0.1; // dB/s giai đoạn đầu
    const late = (db(0.8) - db(1.0)) / 0.2;
    expect(early).toBeGreaterThan(late * 2);
    expect(late).toBeGreaterThan(2);
    // tới thời gian tắt tự nhiên còn ~6 % đỉnh như engine cũ
    const tOff = naturalDecay(C4);
    expect(paramAt(ev, tOff - 0.01) / p.peak).toBeGreaterThan(0.04);
    expect(paramAt(ev, tOff - 0.01) / p.peak).toBeLessThan(0.09);
  });

  it('giữ phím ngắn → nhả sớm (giảm chấn), tổng thời lượng không dài hơn engine cũ quá nhiều', () => {
    const p = voiceParams(C4, 1, 0.3);
    expect(p.tOff).toBeCloseTo(0.3, 6);
    expect(p.tEnd - p.tOff).toBeLessThan(0.36);
    const ev = gainEvents(p);
    expect(paramAt(ev, p.tOff + 3 * p.tauRel)).toBeLessThan(paramAt(ev, p.tOff) * 0.06);
  });

  it('nốt trầm ngân lâu hơn, nốt cao tắt nhanh hơn', () => {
    const lo = voiceParams(C2, 1, 10);
    const mid = voiceParams(C4, 1, 10);
    const hi = voiceParams(C6, 1, 10);
    expect(lo.tOff).toBeGreaterThan(mid.tOff);
    expect(mid.tOff).toBeGreaterThan(hi.tOff);
    expect(lo.tau1).toBeGreaterThan(hi.tau1);
  });
});

describe('pianoVoice — độ sáng', () => {
  it('lọc tối dần theo thời gian', () => {
    const p = voiceParams(C4, 1, 2);
    const ev = cutoffEvents(p);
    expect(paramAt(ev, 0)).toBe(p.cutStart);
    expect(paramAt(ev, 0.3)).toBeLessThan(p.cutStart);
    expect(Math.abs(paramAt(ev, 3) - p.cutEnd)).toBeLessThan(p.cutEnd * 0.01);
    expect(p.cutEnd).toBeLessThan(p.cutStart);
  });

  it('đánh mạnh sáng hơn đánh nhẹ; cắt luôn trên tần số cơ bản', () => {
    for (const f of [C2, C4, C6]) {
      const soft = voiceParams(f, 0.3, 1);
      const loud = voiceParams(f, 1.2, 1);
      expect(loud.cutStart).toBeGreaterThan(soft.cutStart);
      expect(loud.cutEnd).toBeGreaterThanOrEqual(soft.cutEnd);
      expect(soft.cutEnd).toBeGreaterThan(f);
      expect(loud.cutStart).toBeLessThanOrEqual(15000);
      expect(loud.thumpGain).toBeGreaterThan(soft.thumpGain);
    }
  });

  it('âm lượng tỉ lệ vol; bass/treble được hạ nhẹ', () => {
    expect(voiceParams(C4, 0.5, 1).peak).toBeCloseTo(voiceParams(C4, 1, 1).peak / 2, 9);
    expect(registerGain(C4)).toBe(1);
    expect(registerGain(C2)).toBeLessThan(1);
    expect(registerGain(C2)).toBeGreaterThan(0.6);
    expect(registerGain(4186)).toBeLessThan(1);
    expect(voiceParams(C4, 0, 1).peak).toBe(0);
  });

  it('dây 2 lệch 0,3–1,6 cent', () => {
    for (let m = 36; m <= 96; m++) {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      const c = Math.abs(voiceParams(f, 1, 1).detuneCents);
      expect(c).toBeGreaterThanOrEqual(0.3);
      expect(c).toBeLessThanOrEqual(1.6);
    }
  });
});

describe('pianoVoice — phổ & bộ đệm', () => {
  it('bảng họa âm: DC = 0, giới hạn ~10 kHz, bậc cơ bản lớn nhất', () => {
    for (const f of [C2, C4, C6, 4186]) {
      const { real, imag } = harmonicTable(f);
      expect(real[0]).toBe(0);
      expect(imag[0]).toBe(0);
      expect((real.length - 1) * f).toBeLessThanOrEqual(10000 + f);
      const amp = (k: number) => Math.hypot(real[k], imag[k]);
      for (let k = 2; k < real.length; k++) expect(amp(k)).toBeLessThanOrEqual(amp(1) * 1.01 + (f < 110 ? 0.5 : 0));
    }
  });

  it('khóa sóng: cùng dải nửa quãng tám', () => {
    expect(waveKey(C4)).toBe(waveKey(C4 * 1.05));
    expect(waveKey(C2)).not.toBe(waveKey(C4));
  });

  it('nhiễu búa và IR hồi âm: hữu hạn, chuẩn hóa, tắt dần, hết ở cuối', () => {
    const n = thumpNoise(48000);
    expect(Math.max(...n.map(Math.abs))).toBeCloseTo(1, 6);
    const ir = roomImpulse(48000);
    expect(ir.every(Number.isFinite)).toBe(true);
    const rms = (a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += ir[i] * ir[i];
      return Math.sqrt(s / (b - a));
    };
    const head = rms(480, 4800);
    const mid = rms(19200, 24000);
    expect(mid).toBeLessThan(head * 0.2);
    expect(Math.abs(ir[ir.length - 1])).toBeLessThan(1e-6);
    expect(ir[0]).toBe(0); // trễ đầu
  });
});
