import { describe, expect, it } from 'vitest';
import { FLOOR_MAX, MicAnalyzer, lowpass } from '../src/audio/micAnalyzer';
import { renderPiano, SIM_RATE, type SimNote, type SimOptions } from './pianoSim';

const REAL: SimOptions = { strings: true, reverb: 0.6, gain: 0.08, noise: 0.006 };

function rmsOf(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}

/** Chạy bộ phân tích trên cả tín hiệu (bước 25 ms) — trả về mọi lần gõ & nốt. */
function analyse(sig: Float32Array, sr = SIM_RATE, a = new MicAnalyzer()) {
  const hop = Math.round(0.025 * sr);
  const onsets: number[] = [];
  const notes: Array<{ t: number; midi: number; at?: number }> = [];
  const frames: Array<{ t: number; rms: number; gate: number; pitch: number | null }> = [];
  for (let i = 2048; i <= sig.length; i += hop) {
    const t = i / sr;
    const f = a.process(sig.subarray(i - 2048, i), sr, t);
    if (f.onset) onsets.push(f.onsetAt);
    if (f.note) notes.push({ t, midi: f.note.midi, at: f.note.at });
    frames.push({ t, rms: f.rms, gate: f.gate, pitch: f.pitch?.freq ?? null });
  }
  return { onsets, notes, frames };
}

describe('tiếng tích máy đếm nhịp không làm micro nghe nhầm (không cần bịt tai)', () => {
  it('bộ lọc bậc 4 chặn tiếng tích > 40 dB (cả 48 kHz và 44,1 kHz)', () => {
    for (const sr of [48000, 44100]) {
      for (const accent of [false, true]) {
        const sig = renderPiano([], 0.2, { sampleRate: sr, noise: 0, hum: 0, clicks: [{ t: 0.05, accent }], clickLevel: 0.5 });
        const frame = sig.subarray(Math.floor(0.04 * sr), Math.floor(0.04 * sr) + 2048);
        const out = new Float32Array(frame.length);
        lowpass(frame, sr, out);
        const db = 20 * Math.log10(rmsOf(out) / rmsOf(frame));
        expect(db, `${sr} Hz accent=${accent}`).toBeLessThan(-40);
      }
    }
  });

  it('chỉ có tiếng tích (to, sát micro) trong phòng yên: không có lần gõ, không có nốt', () => {
    const clicks = Array.from({ length: 16 }, (_, i) => ({ t: 0.5 + i * 0.5, accent: i % 4 === 0 }));
    for (const sensitivity of ['normal', 'high'] as const) {
      const sig = renderPiano([], 9, { noise: 0.004, hum: 0.002, clicks, clickLevel: 0.5 });
      const a = new MicAnalyzer();
      a.sensitivity = sensitivity;
      const r = analyse(sig, SIM_RATE, a);
      expect(r.onsets, sensitivity).toEqual([]);
      expect(r.notes, sensitivity).toEqual([]);
    }
  });

  it('bé gõ phím ĐÚNG phách (trùng tiếng tích): nhận đúng nốt, mốc thời gian lệch < 15 ms', { timeout: 30000 }, () => {
    const beats = Array.from({ length: 8 }, (_, i) => 0.5 + i * 0.6);
    const notes: SimNote[] = beats.map((t, i) => ({ midi: [60, 62, 64, 65, 67, 65, 64, 62][i], start: t, dur: 0.45 }));
    const sig = renderPiano(notes, 6, { ...REAL, clicks: beats.map((t, i) => ({ t, accent: i % 4 === 0 })), clickLevel: 0.4 });
    const r = analyse(sig);
    expect(r.notes.map((n) => n.midi)).toEqual(notes.map((n) => n.midi));
    r.notes.forEach((n, i) => expect(Math.abs(n.at! - beats[i]), `nốt ${i}`).toBeLessThan(0.015));
    // mỗi phách đúng 1 lần gõ
    expect(r.onsets.length).toBe(beats.length);
  });

  it('tiếng tích giữa hai nốt (bé đàn lệch phách) không tạo lần gõ thừa', { timeout: 30000 }, () => {
    const notes: SimNote[] = [0.5, 1.7, 2.9].map((t, i) => ({ midi: 60 + i * 2, start: t, dur: 0.4 }));
    const clicks = Array.from({ length: 12 }, (_, i) => ({ t: 0.2 + i * 0.3 }));
    const sig = renderPiano(notes, 4, { ...REAL, clicks, clickLevel: 0.5 });
    const r = analyse(sig);
    expect(r.onsets.length).toBe(3);
    expect(r.notes.map((n) => n.midi)).toEqual([60, 62, 64]);
  });
});

describe('mốc thời gian GÕ PHÍM (định vị trong khung 2048 mẫu)', () => {
  it('lệch < 12 ms ở 48 kHz và 44,1 kHz (trước: ±30 ms)', { timeout: 30000 }, () => {
    for (const sr of [48000, 44100]) {
      const notes: SimNote[] = [60, 64, 62, 67, 55, 72].map((m, i) => ({ midi: m, start: 0.4 + i * 0.55 + (i % 3) * 0.007, dur: 0.4 }));
      const r = analyse(renderPiano(notes, 4.2, { ...REAL, sampleRate: sr }), sr);
      expect(r.notes.length, `${sr}`).toBe(notes.length);
      r.notes.forEach((n, i) => expect(Math.abs(n.at! - notes[i].start), `${sr} nốt ${i}`).toBeLessThan(0.012));
    }
  });
});

describe('mức ồn nền không "bò" lên khi nốt ngân dài', () => {
  /** Tiếng ngân đều (như giữ phím + pedal / đàn điện) 15 s, có họa âm, trong phòng có ồn. */
  function sustained(seconds: number, amp: number, f0 = 220): Float32Array {
    const n = Math.floor(seconds * SIM_RATE);
    const out = renderPiano([], seconds, { noise: 0.004, hum: 0.002 });
    const s0 = Math.floor(0.3 * SIM_RATE);
    for (let i = s0; i < n; i++) {
      const t = (i - s0) / SIM_RATE;
      const env = Math.min(1, t / 0.005);
      out[i] += amp * env * (Math.sin(2 * Math.PI * f0 * t) + 0.5 * Math.sin(4 * Math.PI * f0 * t + 1) + 0.25 * Math.sin(6 * Math.PI * f0 * t + 2));
    }
    return out;
  }

  it('nốt ngân 15 s vẫn được nghe tới cuối (ngưỡng không vượt âm lượng nốt)', { timeout: 60000 }, () => {
    const r = analyse(sustained(15.5, 0.02));
    expect(r.notes.map((n) => n.midi)).toEqual([57]);
    const last = r.frames.filter((f) => f.t > 14.5);
    expect(last.length).toBeGreaterThan(30);
    for (const f of last) {
      expect(f.rms).toBeGreaterThan(f.gate * 2);
      expect(f.pitch).not.toBeNull();
      expect(Math.abs(f.pitch! - 220)).toBeLessThan(3);
    }
  });

  it('phòng thật sự ồn lên (quạt bật) → ngưỡng vẫn theo lên, nhưng có trần', { timeout: 30000 }, () => {
    const quiet = renderPiano([], 2, { noise: 0.003 });
    const loud = renderPiano([], 20, { noise: 0.03, seed: 3 });
    const sig = new Float32Array(quiet.length + loud.length);
    sig.set(quiet);
    sig.set(loud, quiet.length);
    const a = new MicAnalyzer();
    const r = analyse(sig, SIM_RATE, a);
    const g0 = r.frames.find((f) => f.t > 1.9)!.gate;
    const g1 = r.frames[r.frames.length - 1].gate;
    expect(g1).toBeGreaterThan(g0 * 2);
    expect(g1).toBeLessThanOrEqual(FLOOR_MAX * 3);
    expect(r.notes).toEqual([]);
  });
});
