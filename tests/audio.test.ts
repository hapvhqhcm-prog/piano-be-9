import { describe, expect, it, vi } from 'vitest';
import { AudioEngine, DEFAULT_ENVELOPE, envelopePoints } from '../src/audio/AudioEngine';

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
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const oscs: Array<{ frequency: { value: number }; type: string }> = [];
  const ctx = {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    onstatechange: null as null | (() => void),
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    createGain: () => ({ ...node(), gain: param() }),
    createDynamicsCompressor: () => node(),
    createBuffer: () => ({}),
    createBufferSource: () => ({ ...node(), buffer: null, start: vi.fn() }),
    createOscillator: () => {
      const o = { ...node(), type: 'sine', frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(), onended: null };
      oscs.push(o);
      return o;
    },
  };
  return { ctx, oscs };
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

  it('oscillator triangle đúng tần số', async () => {
    const { ctx, oscs } = fakeContext();
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.unlock();
    void eng.playPitch('A4');
    void eng.playPitch('C4');
    // Mỗi nốt: âm cơ bản (tam giác) + họa âm bậc 2, 3
    const fundamentals = oscs.filter((o) => o.type === 'triangle');
    expect(fundamentals).toHaveLength(2);
    expect(fundamentals[0].frequency.value).toBe(440);
    expect(Math.abs(fundamentals[1].frequency.value - 261.63)).toBeLessThan(1);
    expect(oscs.filter((o) => o.type === 'sine').map((o) => Math.round(o.frequency.value / 440))).toContain(2);
  });
});
