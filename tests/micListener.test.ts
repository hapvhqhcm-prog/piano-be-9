import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MicListener, MIC_MUTE_GRACE_MS, MIC_RESUME_TIMEOUT_MS, MIC_STALE_MS, type MicState } from '../src/audio/MicListener';
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

  it('(+ 2026-10-08) ctx.resume() treo mãi (iOS sau cuộc gọi/Siri) → không kẹt "starting": tắt micro, lần chạm sau thử lại được', async () => {
    const { mic, ctx, tracks, getUserMedia, states } = setup();
    ctx.state = 'interrupted';
    ctx.resume.mockImplementation(() => new Promise<void>(() => undefined)); // không bao giờ xong
    const p = mic.start();
    expect(mic.state).toBe('starting');
    expect(await mic.start()).toBe('starting'); // chạm trong lúc chờ → bỏ qua
    await vi.advanceTimersByTimeAsync(MIC_RESUME_TIMEOUT_MS + 50);
    expect(await p).toBe('off');
    expect(mic.needsRestart).toBe(true);
    expect(tracks[0].readyState).toBe('ended'); // đã nhả micro
    expect(states[states.length - 1]).toBe('off');
    // iOS chạy lại âm thanh → lần chạm sau bật được
    ctx.resume.mockImplementation(async () => {
      ctx.state = 'running';
    });
    expect(await mic.start()).toBe('on');
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('ctx.resume() bị từ chối và context vẫn không chạy → báo off (không "on" giả)', async () => {
    const { mic, ctx, tracks } = setup();
    ctx.state = 'suspended';
    ctx.resume.mockImplementation(async () => {
      throw new Error('nope');
    });
    expect(await mic.start()).toBe('off');
    expect(tracks[0].readyState).toBe('ended');
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

describe('MicListener: bộ lọc iOS thật sự áp dụng, luồng cho "Nghe lại", thống kê', () => {
  it('xin micro tắt mọi xử lý giọng nói (cả voiceIsolation); trackInfo báo bộ lọc bị iOS ÉP bật', async () => {
    const { mic, getUserMedia } = setup();
    getUserMedia.mockImplementationOnce(async () => {
      const tr = {
        readyState: 'live',
        muted: false,
        stop: vi.fn(),
        onended: null,
        onmute: null,
        onunmute: null,
        getSettings: () => ({ echoCancellation: false, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 }),
      };
      return { getAudioTracks: () => [tr], getTracks: () => [tr] };
    });
    expect(mic.mediaStream).toBeNull();
    expect(mic.trackInfo()).toBeNull();
    await mic.start();
    const req = (getUserMedia.mock.calls[0] as unknown as [MediaStreamConstraints])[0].audio as Record<string, unknown>;
    expect(req).toMatchObject({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false });
    const info = mic.trackInfo()!;
    expect(info.forced).toEqual(['noiseSuppression', 'autoGainControl']);
    expect(info.sampleRate).toBe(48000);
    expect(info.fallback).toBe(false);
    expect(mic.mediaStream).not.toBeNull();
    mic.stop();
    expect(mic.mediaStream).toBeNull();
  });

  it('trình duyệt cũ từ chối tùy chọn (OverconstrainedError) → xin micro "trơn", vẫn bật; bị CHẶN thì báo denied', async () => {
    const { mic, getUserMedia } = setup();
    getUserMedia.mockImplementationOnce(async () => {
      throw Object.assign(new Error('x'), { name: 'OverconstrainedError' });
    });
    expect(await mic.start()).toBe('on');
    expect((getUserMedia.mock.calls[1] as unknown as [MediaStreamConstraints])[0].audio).toBe(true);
    expect(mic.trackInfo()!.fallback).toBe(true);
    expect(mic.trackInfo()!.forced).toEqual([]); // track giả không có getSettings → không đoán
    mic.stop();
    getUserMedia.mockImplementationOnce(async () => {
      throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
    });
    expect(await mic.start()).toBe('denied');
    expect(getUserMedia).toHaveBeenCalledTimes(3); // không thử lại khi bị chặn
  });

  it('thống kê khung: đếm khung, khoảng cách lớn nhất; bật lại thì đếm lại', async () => {
    const { mic } = setup();
    await mic.start();
    vi.advanceTimersByTime(1000);
    const st = mic.stats;
    expect(st.frames).toBeGreaterThanOrEqual(38);
    expect(st.maxGapMs).toBeLessThanOrEqual(30);
    expect(st.slowGaps).toBe(0);
    expect(mic.engine).toBeDefined();
    mic.stop();
    await mic.start();
    expect(mic.stats.frames).toBe(0);
  });
});
