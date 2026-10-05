import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../src/audio/AudioEngine';
import { analyzeChord, decoysOf, nnlsGram } from '../src/audio/chordVerify';
import { BLUETOOTH_LIKELY_MS, LATENCY_GAP, PING, estimateLatency } from '../src/audio/latency';
import { MicAnalyzer } from '../src/audio/micAnalyzer';
import { HISTORY_SIZE, MicListener } from '../src/audio/MicListener';
import { renderPiano, type SimOptions } from './pianoSim';

const REAL: SimOptions = { strings: true, reverb: 0.6, gain: 0.08, noise: 0.006 };

describe('chordVerify: các khối cơ bản', () => {
  it('NNLS: nghiệm không âm đúng với hệ đơn giản', () => {
    // G = I, b = (2, −1) → x = (2, 0)
    const x = nnlsGram(Float64Array.from([1, 0, 0, 1]), Float64Array.from([2, -1]), 2);
    expect(x[0]).toBeCloseTo(2);
    expect(x[1]).toBe(0);
  });

  it('mồi nhử: ±1 phím, quãng 8 trên/dưới, không trùng nốt cần đàn', () => {
    const d = decoysOf([48, 60]);
    expect(d.get(48)).toEqual([47, 49, 36]); // 60 là nốt cần đàn → không làm mồi nhử
    expect(d.get(60)).toEqual([59, 61, 72]);
  });

  it('khung trực tiếp: đủ nốt → có mặt; thiếu Mi → báo thiếu đúng Mi', () => {
    const sr = 48000;
    const seg = (ms: number[]) => renderPiano(ms.map((m) => ({ midi: m, start: 0, dur: 1, vel: 0.8 })), 0.3, REAL).subarray(2400, 2400 + 7200);
    const full = analyzeChord(seg([48, 64, 67]), sr, [48, 64, 67]);
    expect(full.conclusive).toBe(true);
    expect(full.missing).toEqual([]);
    const noE = analyzeChord(seg([48, 67]), sr, [48, 64, 67]);
    expect(noE.conclusive).toBe(true);
    expect(noE.missing).toEqual([64]);
  });

  it('chỉ có tiếng ồn → không kết luận (dùng cách cũ)', () => {
    const r = analyzeChord(renderPiano([], 0.2, { noise: 0.01 }).subarray(0, 7200), 48000, [60, 64, 67]);
    expect(r.conclusive).toBe(false);
  });
});

describe('MicListener.verifyChord: lấy đúng đoạn tín hiệu sau lần gõ', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup(sig: Float32Array, sr: number) {
    vi.useFakeTimers();
    let t = 0; // giây, đồng hồ AudioContext
    const ctx = {
      state: 'running',
      sampleRate: sr,
      get currentTime() {
        return t;
      },
      resume: async () => undefined,
      createMediaStreamSource: () => ({ connect: () => undefined, disconnect: () => undefined }),
      createAnalyser: () => ({
        fftSize: 0,
        getFloatTimeDomainData: (b: Float32Array) => {
          const end = Math.round(t * sr);
          for (let i = 0; i < b.length; i++) {
            const k = end - b.length + i;
            b[i] = k >= 0 && k < sig.length ? sig[k] : 0.0001 * Math.sin(k);
          }
        },
      }),
    };
    const audio = {
      context: ctx,
      isSounding: false,
      outputLatency: 0.02,
      msSinceSound: () => 10_000,
      clickNear: () => false,
      setMicActive: vi.fn(),
      onStateChange: () => () => undefined,
    };
    const tr = { readyState: 'live', muted: false, stop: () => undefined };
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getAudioTracks: () => [tr], getTracks: () => [tr] }) } });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('window', { setInterval, clearInterval });
    const mic = new MicListener(audio as unknown as AudioEngine);
    mic.clock = () => t * 1000;
    return {
      mic,
      audio,
      /** Chạy đồng hồ tới `until` giây theo bước 25 ms (MicListener.tick mỗi 25 ms) */
      advance(until: number) {
        while (t < until) {
          t += 0.025;
          vi.advanceTimersByTime(25);
        }
      },
    };
  }

  it('micro bật: hỏi ngay khi nghe nốt → trả lời ~200 ms sau lần gõ; đủ nốt / thiếu nốt', async () => {
    const sr = 48000;
    const sig = renderPiano(
      [
        { midi: 48, start: 0.5, dur: 0.6 },
        { midi: 64, start: 0.5, dur: 0.6 },
        { midi: 67, start: 0.5, dur: 0.6 },
        // lần 2: quên Mi
        { midi: 48, start: 2, dur: 0.6 },
        { midi: 67, start: 2, dur: 0.6 },
      ],
      3,
      REAL,
    );
    const { mic, advance } = setup(sig, sr);
    expect(await mic.start()).toBe('on');
    const onsets: number[] = [];
    mic.onOnset((at) => onsets.push(at));
    advance(0.6);
    expect(onsets.length).toBe(1);
    expect(Math.abs(onsets[0] - 0.5)).toBeLessThan(0.02);
    const p1 = mic.verifyChord([48, 64, 67]);
    advance(0.8);
    const r1 = await p1;
    expect(r1?.conclusive).toBe(true);
    expect(r1?.missing).toEqual([]);
    // Hỏi MUỘN (nốt đã ngân ~250 ms) vẫn lấy đúng đoạn sau lần gõ (còn trong bộ đệm HISTORY_SIZE mẫu)
    advance(2.25);
    expect(HISTORY_SIZE / sr).toBeGreaterThan(0.3);
    const r2 = await mic.verifyChord([48, 64, 67]);
    expect(r2?.missing).toEqual([64]);
    mic.stop();
    // Micro tắt → null (dùng cách cũ)
    expect(await mic.verifyChord([48, 64, 67])).toBeNull();
  });

  it('dừng micro khi đang chờ → trả về null, không treo', async () => {
    const sig = renderPiano([{ midi: 60, start: 0.3, dur: 0.5 }, { midi: 64, start: 0.3, dur: 0.5 }], 1, REAL);
    const { mic, advance } = setup(sig, 48000);
    await mic.start();
    advance(0.35);
    const p = mic.verifyChord([60, 64]);
    mic.stop();
    expect(await p).toBeNull();
  });

  it('độ trễ chấm nhịp: chưa đo → outputLatency; đã đo → số đo', async () => {
    const { mic } = setup(new Float32Array(10), 48000);
    expect(mic.inputOutputLatency()).toBeCloseTo(0.02);
    mic.latencyMs = 85;
    expect(mic.inputOutputLatency()).toBeCloseTo(0.085);
  });
});

describe('đo độ trễ loa → micro', () => {
  it('estimateLatency: trung vị, bỏ lần lệch xa, cần đủ lần đo', () => {
    const times = [1, 1.6, 2.2, 2.8, 3.4, 4];
    const lag = [0.08, 0.082, 0.079, 0.081, 0.08, 0.083];
    // thêm tiếng ho (lần gõ lạc) trước một tiếng "tinh" và một lần đo lệch xa
    const onsets = times.map((t, i) => t + lag[i]);
    onsets[3] = times[3] + 0.3;
    onsets.push(2.5);
    const est = estimateLatency(times, onsets)!;
    expect(est.ms).toBeGreaterThanOrEqual(79);
    expect(est.ms).toBeLessThanOrEqual(82);
    expect(est.used).toBe(5);
    expect(estimateLatency(times, [1.08, 1.68])).toBeNull();
  });

  /** Tiếng "tinh" (giống AudioEngine.ping) tới micro trễ `lat` giây, qua đường xử lý micro thật (MicAnalyzer). */
  function simulate(lat: number, sr: number, level = 0.15): number {
    const times = Array.from({ length: 6 }, (_, i) => 0.5 + i * LATENCY_GAP);
    const sig = renderPiano([], times[5] + 1, { ...REAL, sampleRate: sr });
    for (const t of times) {
      const s0 = Math.round((t + lat) * sr);
      for (let i = 0; i < PING.length * sr && s0 + i < sig.length; i++) {
        const tt = i / sr;
        const env = tt < PING.attack ? tt / PING.attack : Math.exp(-(tt - PING.attack) / PING.tau);
        sig[s0 + i] += level * env * (Math.sin(2 * Math.PI * PING.hz * tt) + 0.5 * Math.sin(4 * Math.PI * PING.hz * tt));
        // vọng phòng
        if (s0 + i + Math.round(0.03 * sr) < sig.length) sig[s0 + i + Math.round(0.03 * sr)] += 0.3 * level * env * Math.sin(2 * Math.PI * PING.hz * tt);
      }
    }
    const a = new MicAnalyzer();
    const hop = Math.round(0.025 * sr);
    const onsets: number[] = [];
    let last = -1;
    for (let i = 2048; i < sig.length; i += hop) {
      const now = i / sr;
      const f = a.process(sig.subarray(i - 2048, i), sr, now, 'quiet', false);
      if (f.onset && now - last > 0.15) {
        last = now;
        onsets.push(f.onsetAt >= 0 ? Math.min(now, f.onsetAt) : now - 0.035);
      }
    }
    return estimateLatency(times, onsets)?.ms ?? NaN;
  }

  it.each([
    [0.04, 48000],
    [0.085, 48000],
    [0.085, 44100],
    [0.25, 48000],
  ])('độ trễ %s s @ %s Hz đo được sai < 6 ms', (lat, sr) => {
    expect(Math.abs(simulate(lat, sr) - lat * 1000)).toBeLessThan(6);
  });

  it('tai nghe Bluetooth (~250 ms) vượt ngưỡng khuyên dùng loa iPad', () => {
    expect(simulate(0.25, 48000)).toBeGreaterThan(BLUETOOTH_LIKELY_MS);
  });
});
