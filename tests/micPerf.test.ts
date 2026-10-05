import { describe, expect, it } from 'vitest';
import { MicAnalyzer } from '../src/audio/micAnalyzer';
import { renderPiano, type SimNote } from './pianoSim';

/**
 * ĐO THỜI GIAN XỬ LÝ MỖI KHUNG (máy tính; iPad A9/A10 chậm hơn ~6–7 lần).
 * Micro chạy 40 khung/giây → mỗi khung phải xong rất nhanh để không giật hình/tiếng trên iPad cũ.
 */
function perFrameMs(sr: number, needPitch: boolean): number {
  const notes: SimNote[] = [60, 64, 67, 72, 48, 55].map((m, i) => ({ midi: m, start: 0.2 + i * 0.5, dur: 0.4 }));
  const sig = renderPiano(notes, 3.5, { sampleRate: sr, strings: true, reverb: 0.6, gain: 0.08, noise: 0.006 });
  const hop = Math.round(0.025 * sr);
  const a = new MicAnalyzer();
  // làm nóng JIT
  for (let i = 2048; i < sig.length; i += hop) a.process(sig.subarray(i - 2048, i), sr, i / sr, 'quiet', needPitch);
  let frames = 0;
  const t0 = performance.now();
  for (let rep = 0; rep < 3; rep++) {
    for (let i = 2048; i < sig.length; i += hop, frames++) a.process(sig.subarray(i - 2048, i), sr, i / sr, 'quiet', needPitch);
  }
  return (performance.now() - t0) / frames;
}

describe('thời gian xử lý mỗi khung micro', () => {
  it('đo & in kết quả (48 kHz / 44,1 kHz; có / không cần cao độ)', { timeout: 60000 }, () => {
    const r = {
      '48k cao độ': perFrameMs(48000, true),
      '44.1k cao độ': perFrameMs(44100, true),
      '48k chỉ nhịp': perFrameMs(48000, false),
    };
    console.log('\nms/khung: ' + Object.entries(r).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(' | ') + '\n');
    // Giới hạn lỏng (máy CI chậm): 25 ms = cả bước khung
    for (const v of Object.values(r)) expect(v).toBeLessThan(25);
    expect(r['48k chỉ nhịp']).toBeLessThan(r['48k cao độ']);
  });
});
