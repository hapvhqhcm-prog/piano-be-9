import { describe, expect, it, vi } from 'vitest';
import { AudioEngine, DEFAULT_ENVELOPE, envelopePoints, REVERB_GUARD_MS } from '../src/audio/AudioEngine';

describe('envelope ADSR', () => {
  it('bắt đầu và kết thúc ở 0, đỉnh = peak, thời gian tăng dần', () => {
    const pts = envelopePoints(1, 0.8);
    expect(pts[0]).toEqual({ t: 1, v: 0 });
    expect(pts[1].v).toBe(DEFAULT_ENVELOPE.peak);
    expect(pts[pts.length - 1].v).toBe(0);
    for (let i = 1; i < pts.length; i++) expect(pts[i].t).toBeGreaterThanOrEqual(pts[i - 1].t);
  });
});

/** AudioContext giả — kiểm chứng engine không tự tạo context trước unlock(). */
function fakeContext() {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  type FakeOsc = {
    frequency: { value: number };
    type: string;
    wave: unknown;
    setPeriodicWave: (w: unknown) => void;
    stop: ReturnType<typeof vi.fn>;
    onended: null | (() => void);
  };
  const oscs: FakeOsc[] = [];
  const waves: Array<{ real: Float32Array; imag: Float32Array }> = [];
  const ctx = {
    state: 'suspended',
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    onstatechange: null as null | (() => void),
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    createGain: () => ({ ...node(), gain: param() }),
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param(), Q: param(), gain: param() }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createConvolver: () => ({ ...node(), buffer: null }),
    createPeriodicWave: (real: Float32Array, imag: Float32Array) => {
      const w = { real, imag };
      waves.push(w);
      return w;
    },
    createBuffer: (_c: number, len: number) => {
      const d = new Float32Array(len);
      return { getChannelData: () => d };
    },
    createBufferSource: () => ({ ...node(), buffer: null, start: vi.fn(), stop: vi.fn(), onended: null }),
    createOscillator: () => {
      const o: FakeOsc & Record<string, unknown> = {
        ...node(),
        type: 'sine',
        wave: null,
        setPeriodicWave(w: unknown) {
          o.wave = w;
          o.type = 'custom';
        },
        frequency: { value: 0 },
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      oscs.push(o);
      return o;
    },
  };
  return { ctx, oscs, waves };
}

describe('AudioEngine', () => {
  it('không tạo AudioContext cho tới khi unlock() (thao tác chạm)', async () => {
    const { ctx } = fakeContext();
    const factory = vi.fn(() => ctx as unknown as AudioContext);
    const eng = new AudioEngine(factory);
    expect(eng.state).toBe('locked');
    await eng.playPitch('C4');
    expect(factory).not.toHaveBeenCalled();
    expect(await eng.unlock()).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('tiếng cũ (classic): 2 dây PeriodicWave đúng tần số (lệch < 2 cent), sóng dùng chung theo âm vực', async () => {
    const { ctx, oscs, waves } = fakeContext();
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.unlock();
    eng.voiceModel = 'classic';
    void eng.playPitch('A4');
    void eng.playPitch('C4');
    expect(oscs).toHaveLength(4);
    expect(oscs.every((o) => o.type === 'custom')).toBe(true);
    expect(oscs[0].frequency.value).toBe(440);
    const cents = (a: number, b: number) => Math.abs(1200 * Math.log2(a / b));
    expect(cents(oscs[1].frequency.value, 440)).toBeLessThan(2);
    expect(cents(oscs[1].frequency.value, 440)).toBeGreaterThan(0.2);
    expect(Math.abs(oscs[2].frequency.value - 261.63)).toBeLessThan(1);
    // A4 và C4 khác dải → 2 PeriodicWave; nốt lặp lại không tạo thêm
    void eng.playPitch('A4');
    expect(waves).toHaveLength(2);
    eng.stopAll();
  });

  it('tiếng ấm (mặc định): 2 dây lớp thân đúng tần số + lớp sáng hơi cao hơn (không hòa âm, 0,5–6 cent)', async () => {
    const { ctx, oscs, waves } = fakeContext();
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.unlock();
    expect(eng.voiceModel).toBe('warm');
    void eng.playPitch('A4');
    void eng.playPitch('C4');
    expect(oscs).toHaveLength(6);
    expect(oscs.every((o) => o.type === 'custom')).toBe(true);
    const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
    expect(oscs[0].frequency.value).toBe(440);
    expect(Math.abs(cents(oscs[1].frequency.value, 440))).toBeLessThan(2);
    expect(cents(oscs[2].frequency.value, 440)).toBeGreaterThanOrEqual(0.5);
    expect(cents(oscs[2].frequency.value, 440)).toBeLessThanOrEqual(6.001);
    // lớp sáng là sóng khác lớp thân; 2 dải âm vực × 2 lớp = 4 sóng; nốt lặp lại không tạo thêm
    expect(oscs[2].wave).not.toBe(oscs[0].wave);
    void eng.playPitch('A4');
    expect(waves).toHaveLength(4);
    eng.stopAll();
  });

  it('đếm nút CPU: ấm ≤ 1,5 × cũ mỗi nốt; chế độ nhẹ 3 nút như cũ', async () => {
    const { ctx } = fakeContext();
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.unlock();
    eng.voiceModel = 'classic';
    void eng.scheduleFreq(261.63, 0, 0.3, 1, false);
    const classic = eng.stats.lastNoteNodes;
    expect(classic).toBe(7);
    eng.voiceModel = 'warm';
    void eng.scheduleFreq(261.63, 0, 0.3, 1, false); // nhả sớm → có tiếng giảm chấn (nhiều nút nhất)
    const warmMax = eng.stats.lastNoteNodes;
    expect(warmMax).toBe(10);
    expect(warmMax).toBeLessThanOrEqual(classic * 1.5);
    void eng.scheduleFreq(261.63, 0, 5, 1, false); // giữ tới khi tắt tự nhiên → không có giảm chấn
    expect(eng.stats.lastNoteNodes).toBe(9);
    for (let i = 0; i < 10; i++) void eng.scheduleFreq(220 * Math.pow(2, i / 12), 0, 1, 0.5, false);
    expect(eng.stats.lastNoteNodes).toBe(3);
    expect(eng.stats.lightNotes).toBeGreaterThan(0);
    eng.stopAll();
  });

  it('khi đã nhiều nốt chồng nhau thì chuyển sang 1 dây (đỡ CPU) — cả hai kiểu tiếng', async () => {
    for (const model of ['classic', 'warm'] as const) {
      const { ctx, oscs } = fakeContext();
      const eng = new AudioEngine(() => ctx as unknown as AudioContext);
      await eng.unlock();
      eng.voiceModel = model;
      for (let i = 0; i < 12; i++) void eng.scheduleFreq(220 * Math.pow(2, i / 12), 0, 1, 0.5, false);
      // 8 nốt đầu: đủ lớp (cũ 2 dây; ấm 2 dây + lớp sáng); 4 nốt sau: 1 dây
      expect(oscs).toHaveLength(8 * (model === 'classic' ? 2 : 3) + 4);
      eng.stopAll();
    }
  });

  it('bài mẫu hẹn cả bài một lượt: chỉ nốt CHỒNG NHAU thật mới tính (không phải mọi nốt đã hẹn)', async () => {
    const { ctx } = fakeContext();
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.unlock();
    // 30 nốt nối tiếp (mỗi nốt 0,4 s, cách 0,5 s) — trước đây nốt thứ 9 trở đi thành tiếng "nhẹ" 1 dây
    for (let i = 0; i < 30; i++) void eng.scheduleFreq(261.63, i * 0.5, 0.4, 1, false);
    expect(eng.stats.lightNotes).toBe(0);
    expect(eng.stats.notes).toBe(30);
    eng.stopAll();
  });

  it('stopAll() giữa bài mẫu: nốt hẹn ở tương lai được gỡ ngay — không còn "đang phát" (micro nghe lại được)', async () => {
    const { ctx } = fakeContext();
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.unlock();
    // Bài mẫu hẹn cả bài một lượt (track = true như playNote của màn mẫu); nguồn giả KHÔNG bắn onended
    for (let i = 0; i < 20; i++) void eng.scheduleFreq(261.63, 1 + i * 0.5, 0.4);
    void eng.scheduleFreq(329.63, 0, 0.4); // nốt đang kêu lúc bấm Dừng
    expect(eng.isSounding).toBe(true);
    expect(eng.stats.voices).toBe(21);
    eng.stopAll();
    // Chỉ còn nốt đang kêu (tắt sau 0,08 s qua onended); 20 nốt chưa bắt đầu đã bị gỡ + ngắt nút
    expect(eng.stats.voices).toBe(1);
    // Nốt mới sau đó không bị tính "chồng nhau" với các nốt đã hủy
    eng.resetStats();
    void eng.scheduleFreq(261.63, 1.2, 0.4, 1, false);
    expect(eng.stats.lightNotes).toBe(0);
    eng.stopAll();
  });

  it('isSounding / msSinceSound tính cả đuôi hồi âm', async () => {
    vi.useFakeTimers();
    try {
      const { ctx, oscs } = fakeContext();
      const eng = new AudioEngine(() => ctx as unknown as AudioContext);
      const p = eng.unlock();
      await vi.advanceTimersByTimeAsync(10);
      await p;
      const done = eng.scheduleFreq(440, 0, 0.3, 1, true);
      expect(eng.isSounding).toBe(true);
      expect(eng.msSinceSound()).toBe(0);
      oscs[0].onended?.();
      await done;
      expect(eng.isSounding).toBe(false);
      const t = Date.now();
      expect(eng.msSinceSound(t)).toBe(0);
      expect(eng.msSinceSound(t + REVERB_GUARD_MS + 100)).toBe(100);
      // bè đệm (track=false) không chặn micro
      void eng.scheduleFreq(440, 0, 0.3, 1, false);
      expect(eng.isSounding).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
