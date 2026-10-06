import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';
import {
  MAX_TAKE_SECONDS,
  pickMimeType,
  playbackGain,
  PLAYBACK_MAX_GAIN,
  takeRecorder,
  type RecorderDeps,
  type RecorderLike,
} from '../src/audio/recorder';

/**
 * "Nghe lại con đàn" (recorder.ts) với MediaRecorder / AudioContext / thẻ <audio> GIẢ:
 * chọn định dạng, ghi → dừng → nghe lại, giới hạn 60 s, hủy, giải phóng, đánh dấu "app đang phát" để micro bỏ qua.
 */

class FakeRecorder implements RecorderLike {
  static supported = ['audio/mp4'];
  static instances: FakeRecorder[] = [];
  static isTypeSupported(t: string) {
    return FakeRecorder.supported.includes(t);
  }
  state = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    readonly stream: MediaStream,
    readonly opts?: { mimeType?: string },
  ) {
    this.mimeType = opts?.mimeType ?? '';
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    // giống trình duyệt: dataavailable rồi stop, bất đồng bộ
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: this.mimeType }) });
      this.onstop?.();
    });
  }
}

function fakeCtx(peak = 0.05) {
  const sources: Array<{ onended: null | (() => void); started: boolean; stopped: boolean }> = [];
  const gains: Array<{ gain: { value: number } }> = [];
  const ctx = {
    state: 'running',
    destination: {},
    resume: vi.fn(async () => undefined),
    decodeAudioData: vi.fn((_ab: ArrayBuffer, ok: (b: unknown) => void) => {
      const data = new Float32Array(1000);
      data[500] = -peak;
      ok({ numberOfChannels: 1, getChannelData: () => data });
      return undefined;
    }),
    createBufferSource: () => {
      const s = {
        buffer: null as unknown,
        onended: null as null | (() => void),
        started: false,
        stopped: false,
        connect: vi.fn(),
        start() {
          s.started = true;
        },
        stop() {
          s.stopped = true;
          s.onended?.();
        },
      };
      sources.push(s);
      return s;
    },
    createGain: () => {
      const g = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(g);
      return g;
    },
  };
  return { ctx, sources, gains };
}

function setup(o: { ctx?: unknown; withStream?: boolean } = {}) {
  FakeRecorder.instances = [];
  let now = 1000;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const engine = new AudioEngine(() => {
    throw new Error('không dùng');
  });
  Object.defineProperty(engine, 'context', { get: () => o.ctx ?? null });
  const stream = {} as MediaStream;
  const mic = { mediaStream: o.withStream === false ? null : stream, engine };
  const revoked: string[] = [];
  const audios: Array<{ onended: null | (() => void); played: boolean; paused: boolean }> = [];
  const deps: RecorderDeps = {
    MediaRecorder: FakeRecorder,
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    createObjectURL: () => 'blob:take-1',
    revokeObjectURL: (u) => revoked.push(u),
    createAudio: () => {
      const a = {
        onended: null as null | (() => void),
        played: false,
        paused: false,
        play() {
          a.played = true;
          return Promise.resolve();
        },
        pause() {
          a.paused = true;
        },
      };
      audios.push(a);
      return a;
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const t of [...timers].sort((a, b) => a.at - b.at)) {
      if (t.at <= now && timers.includes(t)) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    }
  };
  return { engine, mic, deps, advance, revoked, audios };
}

describe('recorder — chọn định dạng & điều kiện', () => {
  it('iPad Safari → audio/mp4; Chrome/Firefox → webm/opus; không có isTypeSupported → để trình duyệt chọn', () => {
    expect(pickMimeType({ isTypeSupported: (t) => t === 'audio/mp4' })).toBe('audio/mp4');
    expect(pickMimeType({ isTypeSupported: (t) => t.startsWith('audio/webm') })).toBe('audio/webm;codecs=opus');
    expect(pickMimeType({})).toBeUndefined();
    expect(pickMimeType(undefined)).toBeUndefined();
  });

  it('micro chưa bật hoặc không có MediaRecorder → null (giao diện ẩn nút Nghe lại)', () => {
    const { mic, deps } = setup({ withStream: false });
    expect(takeRecorder(mic, deps)).toBeNull();
    expect(takeRecorder(null, deps)).toBeNull();
    const g = globalThis as { MediaRecorder?: unknown };
    const had = g.MediaRecorder;
    delete g.MediaRecorder;
    expect(takeRecorder({ mediaStream: {} as MediaStream }, {})).toBeNull();
    if (had) g.MediaRecorder = had;
  });

  it('âm lượng phát lại: chuẩn hóa tiếng nhỏ, có trần', () => {
    expect(playbackGain(0.05)).toBeCloseTo(10 > PLAYBACK_MAX_GAIN ? PLAYBACK_MAX_GAIN : 10);
    expect(playbackGain(0.25)).toBeCloseTo(2);
    expect(playbackGain(1)).toBeCloseTo(0.5);
    expect(playbackGain(0)).toBe(1);
  });
});

describe('recorder — ghi & nghe lại', () => {
  it('ghi trên CHÍNH luồng micro với audio/mp4 → dừng → bản ghi có thời lượng', async () => {
    const { mic, deps, advance } = setup();
    const rec = takeRecorder(mic, deps)!;
    rec.start();
    expect(FakeRecorder.instances).toHaveLength(1);
    expect(FakeRecorder.instances[0].stream).toBe(mic.mediaStream);
    expect(FakeRecorder.instances[0].opts?.mimeType).toBe('audio/mp4');
    advance(12_300);
    const clip = await rec.stop();
    expect(clip).not.toBeNull();
    expect(clip!.seconds).toBeCloseTo(12.3);
    // stop lần nữa: không còn gì
    expect(await rec.stop()).toBeNull();
  });

  it('bấm nhầm (< 0,5 s) → không giữ', async () => {
    const { mic, deps, advance } = setup();
    const rec = takeRecorder(mic, deps)!;
    rec.start();
    advance(200);
    expect(await rec.stop()).toBeNull();
  });

  it(`quá ${MAX_TAKE_SECONDS} s → tự dừng ghi; stop() sau đó vẫn lấy được bản ghi ${MAX_TAKE_SECONDS} s`, async () => {
    const { mic, deps, advance } = setup();
    const rec = takeRecorder(mic, deps)!;
    rec.start();
    advance(MAX_TAKE_SECONDS * 1000 + 10);
    expect(FakeRecorder.instances[0].state).toBe('inactive');
    advance(30_000);
    const clip = await rec.stop();
    expect(clip!.seconds).toBe(MAX_TAKE_SECONDS);
  });

  it('cancel() → không giữ gì; start() lại thì lượt cũ bị bỏ', async () => {
    const { mic, deps, advance } = setup();
    const rec = takeRecorder(mic, deps)!;
    rec.start();
    advance(3000);
    rec.cancel();
    expect(FakeRecorder.instances[0].state).toBe('inactive');
    expect(await rec.stop()).toBeNull();
    rec.start();
    rec.start();
    expect(FakeRecorder.instances).toHaveLength(3);
    expect(FakeRecorder.instances[1].state).toBe('inactive');
    advance(2000);
    expect((await rec.stop())!.seconds).toBeCloseTo(2);
  });

  it('nghe lại qua AudioContext: chuẩn hóa âm lượng, micro bỏ qua trong lúc phát (app đang phát)', async () => {
    const f = fakeCtx(0.1);
    const { mic, deps, advance, engine } = setup({ ctx: f.ctx });
    const rec = takeRecorder(mic, deps)!;
    rec.start();
    advance(5000);
    const clip = (await rec.stop())!;
    expect(engine.isSounding).toBe(false);
    const playing = clip.play();
    await vi.waitFor(() => expect(f.sources).toHaveLength(1));
    expect(f.sources[0].started).toBe(true);
    expect(f.gains[0].gain.value).toBeCloseTo(5);
    expect(engine.isSounding).toBe(true); // micro không tự nghe bản ghi
    f.sources[0].onended!(); // phát hết
    await playing;
    expect(engine.isSounding).toBe(false);
    expect(engine.msSinceSound()).toBe(0); // còn "đuôi" chờ vang tắt
  });

  it('stopPlayback() / rời màn (stopAll) dừng phát và thả "đang phát"', async () => {
    const f = fakeCtx();
    const { mic, deps, advance, engine } = setup({ ctx: f.ctx });
    const rec = takeRecorder(mic, deps)!;
    rec.start();
    advance(2000);
    const clip = (await rec.stop())!;
    const p1 = clip.play();
    await vi.waitFor(() => expect(f.sources).toHaveLength(1));
    clip.stopPlayback();
    await p1;
    expect(f.sources[0].stopped).toBe(true);
    expect(engine.isSounding).toBe(false);
    const p2 = clip.play();
    await vi.waitFor(() => expect(f.sources).toHaveLength(2));
    expect(f.ctx.decodeAudioData).toHaveBeenCalledTimes(1); // giải mã một lần
    engine.stopAll();
    await p2;
    expect(f.sources[1].stopped).toBe(true);
    expect(engine.isSounding).toBe(false);
  });

  it('không giải mã được → phát bằng thẻ <audio> (ObjectURL); dispose thu hồi URL', async () => {
    const f = fakeCtx();
    f.ctx.decodeAudioData = vi.fn((_ab: ArrayBuffer, _ok: (b: unknown) => void, bad?: (e: unknown) => void) => {
      bad?.(new Error('không giải mã được'));
      return undefined;
    });
    const { mic, deps, advance, engine, audios, revoked } = setup({ ctx: f.ctx });
    const rec = takeRecorder(mic, deps)!;
    rec.start();
    advance(2000);
    const clip = (await rec.stop())!;
    const p = clip.play();
    await vi.waitFor(() => expect(audios).toHaveLength(1));
    expect(audios[0].played).toBe(true);
    expect(engine.isSounding).toBe(true);
    audios[0].onended!();
    await p;
    expect(engine.isSounding).toBe(false);
    clip.dispose();
    expect(revoked).toEqual(['blob:take-1']);
    await clip.play(); // đã giải phóng → không làm gì
    expect(audios).toHaveLength(1);
  });

  it('chưa có AudioContext → vẫn nghe lại được bằng thẻ <audio>', async () => {
    const { mic, deps, advance, audios } = setup();
    const rec = takeRecorder(mic, deps)!;
    rec.start();
    advance(1500);
    const clip = (await rec.stop())!;
    const p = clip.play();
    await vi.waitFor(() => expect(audios).toHaveLength(1));
    clip.stopPlayback();
    await p;
    expect(audios[0].paused).toBe(true);
  });
});
