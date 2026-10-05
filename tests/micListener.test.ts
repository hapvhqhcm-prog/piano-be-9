import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MicListener, MIC_MUTE_GRACE_MS, MIC_STALE_MS, type MicState } from '../src/audio/MicListener';
import { MicAnalyzer } from '../src/audio/micAnalyzer';
import type { AudioEngine, EngineState } from '../src/audio/AudioEngine';

/**
 * Giả lập iOS làm micro "điếc" (cuộc gọi, Siri, khóa màn hình, chuyển app) bằng các đối tượng giả:
 * track bị 'mute', AudioContext 'interrupted', bộ đệm đứng yên, quay lại app.
 */
type Fill = (buf: Float32Array) => void;

function noise(): Fill {
  let s = 1;
  return (buf) => {
    for (let i = 0; i < buf.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      buf[i] = (s / 0xffffffff - 0.5) * 0.002;
    }
  };
}

function setup() {
  const fill = { fn: noise() };
  const engineListeners = new Set<(s: EngineState) => void>();
  const tracks: Array<{ readyState: string; muted: boolean; stop: () => void; onended: null | (() => void); onmute: null | (() => void); onunmute: null | (() => void) }> = [];
  const ctx = {
    state: 'running' as string,
    sampleRate: 48000,
    get currentTime() {
      return Date.now() / 1000;
    },
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
    createAnalyser: () => ({ fftSize: 0, getFloatTimeDomainData: (b: Float32Array) => fill.fn(b) }),
  };
  const audio = {
    context: ctx,
    isSounding: false,
    outputLatency: 0,
    msSinceSound: () => 10_000,
    clickNear: () => false,
    setAudioSessionType: vi.fn(),
    setMicActive: vi.fn(),
    onStateChange: (fn: (s: EngineState) => void) => {
      engineListeners.add(fn);
      return () => engineListeners.delete(fn);
    },
  };
  const getUserMedia = vi.fn(async () => {
    const tr = { readyState: 'live', muted: false, stop: vi.fn(() => (tr.readyState = 'ended')), onended: null, onmute: null, onunmute: null };
    tracks.push(tr);
    return { getAudioTracks: () => [tr], getTracks: () => [tr] };
  });
  const docListeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_t: string, fn: () => void) => docListeners.add(fn),
    removeEventListener: (_t: string, fn: () => void) => docListeners.delete(fn),
  };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('window', { setInterval, clearInterval });
  vi.stubGlobal('document', doc);
  const mic = new MicListener(audio as unknown as AudioEngine);
  const states: MicState[] = [];
  mic.onState((s) => states.push(s));
  const engineState = (s: EngineState) => {
    ctx.state = s;
    engineListeners.forEach((fn) => fn(s));
  };
  const showApp = (visible: boolean) => {
    doc.visibilityState = visible ? 'visible' : 'hidden';
    docListeners.forEach((fn) => fn());
  };
  return { mic, fill, ctx, tracks, getUserMedia, states, engineState, showApp, docListeners };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MicListener: iOS làm micro "điếc" → báo tắt, cần bật lại', () => {
  it('micro bình thường: vẫn bật sau nhiều giây', async () => {
    const { mic } = setup();
    expect(await mic.start()).toBe('on');
    vi.advanceTimersByTime(5000);
    expect(mic.state).toBe('on');
    expect(mic.needsRestart).toBe(false);
  });

  it('watchdog: bộ đệm toàn 0 quá 1 s → tắt, needsRestart; lần chạm sau bật lại được', async () => {
    const { mic, fill, states, getUserMedia } = setup();
    await mic.start();
    fill.fn = (b) => b.fill(0);
    vi.advanceTimersByTime(MIC_STALE_MS - 100);
    expect(mic.state).toBe('on'); // im lặng ngắn chưa kết luận
    vi.advanceTimersByTime(300);
    expect(mic.state).toBe('off');
    expect(mic.needsRestart).toBe(true);
    expect(states[states.length - 1]).toBe('off');
    fill.fn = noise();
    expect(await mic.start()).toBe('on');
    expect(mic.needsRestart).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('watchdog: bộ đệm y hệt khung trước (nguồn đứng) quá 1 s → tắt', async () => {
    const { mic, fill } = setup();
    await mic.start();
    const frozen = new Float32Array(2048);
    noise()(frozen);
    fill.fn = (b) => b.set(frozen);
    vi.advanceTimersByTime(MIC_STALE_MS + 200);
    expect(mic.state).toBe('off');
    expect(mic.needsRestart).toBe(true);
  });

  it("track bị 'mute' không tự 'unmute' → tắt; 'mute' rồi 'unmute' nhanh → vẫn bật", async () => {
    const a = setup();
    await a.mic.start();
    const tr = a.tracks[0];
    tr.muted = true;
    tr.onmute?.();
    vi.advanceTimersByTime(MIC_MUTE_GRACE_MS / 2);
    tr.muted = false;
    tr.onunmute?.();
    vi.advanceTimersByTime(MIC_MUTE_GRACE_MS * 2);
    expect(a.mic.state).toBe('on');
    tr.muted = true;
    tr.onmute?.();
    vi.advanceTimersByTime(MIC_MUTE_GRACE_MS + 50);
    expect(a.mic.state).toBe('off');
    expect(a.mic.needsRestart).toBe(true);
    expect(tr.readyState).toBe('ended'); // đã nhả micro
  });

  it("AudioContext bị ngắt ('interrupted') → tắt + needsRestart; start() (chạm) bật lại khi context chạy", async () => {
    const { mic, engineState, ctx } = setup();
    await mic.start();
    engineState('interrupted');
    expect(mic.state).toBe('off');
    expect(mic.needsRestart).toBe(true);
    ctx.state = 'suspended';
    expect(await mic.start()).toBe('on');
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('quay lại app: track đã bị mute / context không chạy → tắt; còn khỏe → giữ nguyên', async () => {
    const a = setup();
    await a.mic.start();
    a.showApp(false);
    a.showApp(true);
    expect(a.mic.state).toBe('on');
    a.tracks[0].muted = true;
    a.showApp(true);
    expect(a.mic.state).toBe('off');
    expect(a.mic.needsRestart).toBe(true);
  });

  it("start() khi đang 'on' nhưng track đã chết → bật lại thật (không trả 'on' giả)", async () => {
    const { mic, tracks, getUserMedia } = setup();
    await mic.start();
    tracks[0].readyState = 'ended';
    expect(await mic.start()).toBe('on');
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('stop() của màn hình: thôi cần bật lại, gỡ hết trình nghe', async () => {
    const { mic, fill, docListeners } = setup();
    await mic.start();
    expect(docListeners.size).toBe(1);
    fill.fn = (b) => b.fill(0);
    vi.advanceTimersByTime(MIC_STALE_MS + 200);
    expect(mic.needsRestart).toBe(true);
    mic.stop();
    expect(mic.needsRestart).toBe(false);
    expect(docListeners.size).toBe(0);
  });

  it('không ai cần cao độ (chỉ chấm vỗ nhịp) → bỏ YIN; có người nghe nốt → chạy YIN', async () => {
    const spy = vi.spyOn(MicAnalyzer.prototype, 'process');
    const { mic } = setup();
    await mic.start();
    const off = mic.onOnset(() => {});
    vi.advanceTimersByTime(100);
    expect(spy.mock.calls[spy.mock.calls.length - 1]?.[4]).toBe(false);
    const offNote = mic.onNote(() => {});
    vi.advanceTimersByTime(100);
    expect(spy.mock.calls[spy.mock.calls.length - 1]?.[4]).toBe(true);
    off();
    offNote();
  });
});
