/**
 * (+ 2026-10-09) Đo KHÁCH QUAN tiếng đàn tổng hợp — mô hình cũ ('classic') và mô hình ấm ('warm') — bằng bộ dựng
 * theo tham số (src/audio/voiceAnalysis.ts), so với các đặc tính đã biết của piano thật (xấp xỉ, theo tài liệu âm học):
 *  R1  Họa âm cao tắt nhanh hơn họa âm thấp (tổn hao tăng theo tần số: σ(f) ≈ b1 + b3·f² — Bensa và cs. 2003;
 *      Hall & Askenfelt). Mục tiêu: bậc 6 tắt nhanh hơn bậc 1 ≥ 1,3× (0,05–0,5 s) ở C3–C5.
 *  R2  Độ sáng (trọng tâm phổ) giảm rõ sau khi gõ (tiếng "tối dần").
 *  R3  Đánh mạnh sáng hơn đánh nhẹ (dạ búa cứng lại theo vận tốc) — kể cả ở treble.
 *  R4  Tắt 2 giai đoạn (prompt sound / aftersound — Weinreich 1977) — đã có từ mô hình cũ, phải giữ.
 *  R5  Bậc cao bị nâng cao (không hòa âm, f_k = k·f0·√(1+Bk²), B ~ 1e-4…1e-3 — Fletcher 1964).
 *  R6  Treble gần như sin (trọng tâm / f0 nhỏ) — bass giàu họa âm.
 * Cộng thêm hồi quy: độ to, mốc thời gian micro, hồi âm, số nút CPU.
 */
import { describe, expect, it } from 'vitest';
import {
  gainEvents,
  naturalDecay,
  paramAt,
  roomImpulse,
  roomImpulseStereo,
  stretchedPartial,
  voiceParams,
  warmVoiceParams,
  UNDAMPED_MIDI,
} from '../src/audio/pianoVoice';
import { nodesPerNote, partialDecayRate, rmsLevel, spectralCentroid } from '../src/audio/voiceAnalysis';
import { REVERB_GUARD_MS, WARM_REVERB_WET } from '../src/audio/AudioEngine';

const NOTES: Array<[string, number]> = [
  ['C2', 65.41],
  ['C3', 130.81],
  ['C4', 261.63],
  ['C5', 523.25],
  ['C6', 1046.5],
  ['C7', 2093],
];
const MODELS = ['classic', 'warm'] as const;
const db = (x: number) => 20 * Math.log10(x);

function metrics(model: (typeof MODELS)[number], f: number) {
  const c0 = spectralCentroid(model, f, 1, 10, 0.01);
  const c05 = spectralCentroid(model, f, 1, 10, 0.5);
  return {
    c0f: c0 / f,
    drop: c05 / c0,
    vel: spectralCentroid(model, f, 1.2, 10, 0.01) / spectralCentroid(model, f, 0.3, 10, 0.01),
    d1: partialDecayRate(model, f, 1, 0.05, 0.5),
    d6: partialDecayRate(model, f, 6, 0.05, 0.5),
    rms: db(rmsLevel(model, f, 1, 0.8, 0, 0.5)),
  };
}

describe('tiếng đàn — bảng đo cũ / mới (in ra để báo cáo)', () => {
  it('in bảng', () => {
    const rows = ['model   note c/f0@10ms c(0.5s)/c(10ms) ff/pp k1dB/s k6dB/s k6/k1 RMSdB'];
    for (const m of MODELS)
      for (const [n, f] of NOTES) {
        const r = metrics(m, f);
        rows.push(
          [m.padEnd(7), n, r.c0f.toFixed(2), r.drop.toFixed(2), r.vel.toFixed(2), r.d1.toFixed(1), r.d6.toFixed(1), (r.d6 / r.d1).toFixed(2), r.rms.toFixed(1)].join('  '),
        );
      }
    console.log(rows.join('\n'));
    expect(rows.length).toBe(13);
  });
});

describe('tiếng ấm — đặc tính piano thật', () => {
  it('R1 họa âm cao tắt nhanh hơn (mới đạt, cũ gần như không)', () => {
    for (const [, f] of NOTES.slice(1, 4)) {
      const w = metrics('warm', f);
      const c = metrics('classic', f);
      expect(w.d6 / w.d1).toBeGreaterThanOrEqual(1.3);
      expect(w.d6 / w.d1).toBeGreaterThan(c.d6 / c.d1 + 0.25);
    }
  });

  it('R2 tối dần sau khi gõ — rõ hơn mô hình cũ ở giữa bàn phím', () => {
    for (const [, f] of NOTES.slice(1, 5)) {
      const w = metrics('warm', f);
      expect(w.drop).toBeLessThan(0.75);
      expect(w.drop).toBeLessThan(metrics('classic', f).drop);
    }
  });

  it('R3 đánh mạnh sáng hơn — ở mọi âm vực (cũ: treble gần như không đổi)', () => {
    for (const [, f] of NOTES) expect(metrics('warm', f).vel).toBeGreaterThan(1.2);
    expect(metrics('classic', 2093).vel).toBeLessThan(1.05);
  });

  it('R4 vẫn tắt 2 giai đoạn, mốc thời gian (tOff/tEnd) giữ như cũ cho dây có giảm chấn', () => {
    for (const [, f] of NOTES.slice(0, 5)) {
      for (const dur of [0.1, 0.4, 0.9, 3]) {
        const a = voiceParams(f, 1, dur);
        const b = warmVoiceParams(f, 1, dur);
        expect(b.tOff).toBeCloseTo(a.tOff, 9);
        expect(b.tEnd).toBeCloseTo(a.tEnd, 9);
      }
      const p = warmVoiceParams(f, 1, 10);
      const ev = gainEvents(p);
      const rate = (t0: number, t1: number) => db(paramAt(ev, t0) / paramAt(ev, t1)) / (t1 - t0);
      expect(rate(0.01, 0.06)).toBeGreaterThan(rate(p.tKnee + 0.1, p.tKnee + 0.3) * 1.5);
    }
  });

  it('dây không giảm chấn (từ Fa6): nhả phím tắt chậm hơn nhưng chỉ thêm ≤ 0,3 s', () => {
    const f = 440 * Math.pow(2, (UNDAMPED_MIDI + 3 - 69) / 12);
    const a = voiceParams(f, 1, 0.3);
    const b = warmVoiceParams(f, 1, 0.3);
    expect(b.tauRel).toBeGreaterThan(a.tauRel);
    expect(b.tEnd - a.tEnd).toBeLessThanOrEqual(0.3);
    expect(b.damperGain).toBe(0);
  });

  it('R5 lớp sáng nâng cao đúng cỡ không hòa âm của bậc 2–6 (vài cent)', () => {
    for (const [, f] of NOTES.slice(0, 5)) {
      const p = warmVoiceParams(f, 1, 1);
      const c2 = 1200 * Math.log2(stretchedPartial(f, 2) / (2 * f));
      const c6 = 1200 * Math.log2(stretchedPartial(f, 6) / (6 * f));
      expect(p.brightCents).toBeGreaterThanOrEqual(Math.min(c2, 0.5));
      expect(p.brightCents).toBeLessThanOrEqual(Math.max(c6, 6) + 1e-9);
    }
  });

  it('R6 treble gần sin, bass giàu họa âm; độ sáng lúc gõ giảm dần theo âm vực', () => {
    const c = NOTES.map(([, f]) => metrics('warm', f).c0f);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeLessThan(c[i - 1]);
    expect(c[c.length - 1]).toBeLessThan(2.5);
    expect(c[0]).toBeGreaterThan(5);
  });

  it('độ to (RMS 0–0,5 s) khớp mô hình cũ ± 1,5 dB ở mọi âm vực (A/B công bằng, không đổi mức với micro)', () => {
    for (const [, f] of NOTES) expect(Math.abs(metrics('warm', f).rms - metrics('classic', f).rms)).toBeLessThan(1.5);
  });

  it('tiếng giảm chấn chỉ khi nhả SỚM, rất khẽ (≤ −20 dB so với đỉnh nốt)', () => {
    const early = warmVoiceParams(261.63, 1, 0.3);
    expect(early.damperGain).toBeGreaterThan(0);
    expect(early.damperGain / early.peak).toBeLessThan(0.1);
    expect(warmVoiceParams(261.63, 1, naturalDecay(261.63) + 1).damperGain).toBe(0);
  });

  it('đặt trái/phải nhẹ theo âm vực: bass trái, treble phải, |pan| ≤ 0,3', () => {
    expect(warmVoiceParams(65.41, 1, 1).pan).toBeLessThan(0);
    expect(warmVoiceParams(261.63, 1, 1).pan).toBeCloseTo(0, 6);
    expect(warmVoiceParams(2093, 1, 1).pan).toBeGreaterThan(0);
    for (const [, f] of NOTES) expect(Math.abs(warmVoiceParams(f, 1, 1).pan)).toBeLessThanOrEqual(0.3);
  });
});

describe('micro & CPU', () => {
  it('đuôi hồi âm mới lúc micro trở lại "quiet" (tEnd + REVERB_GUARD_MS + 200 ms) không to hơn hồi âm cũ', () => {
    const sr = 48000;
    const tail = (ir: Float32Array, wet: number, ms: number) => {
      let s = 0;
      for (let i = Math.floor((ms / 1000) * sr); i < ir.length; i++) s += ir[i] * ir[i];
      return wet * Math.sqrt(s);
    };
    const quietMs = REVERB_GUARD_MS + 200; // MicListener.quietMarginMs = 200
    const old = tail(roomImpulse(sr), 0.14, quietMs);
    const [l, r] = roomImpulseStereo(sr);
    expect(tail(l, WARM_REVERB_WET, quietMs)).toBeLessThanOrEqual(old);
    expect(tail(r, WARM_REVERB_WET, quietMs)).toBeLessThanOrEqual(old);
    // và tổng năng lượng hồi âm (độ "phòng") không kém cũ quá 3 dB
    const all = (ir: Float32Array, wet: number) => tail(ir, wet, 0);
    expect(db(all(l, WARM_REVERB_WET) / all(roomImpulse(sr), 0.14))).toBeGreaterThan(-3);
  });

  it('số nút mỗi nốt: ấm ≤ 1,5 × cũ; chế độ nhẹ bằng cũ', () => {
    for (const [, f] of NOTES)
      for (const dur of [0.2, 0.8, 5]) {
        expect(nodesPerNote('warm', f, 1, dur, false)).toBeLessThanOrEqual(nodesPerNote('classic', f, 1, dur, false) * 1.5);
        expect(nodesPerNote('warm', f, 1, dur, true)).toBe(nodesPerNote('classic', f, 1, dur, true));
      }
  });
});
