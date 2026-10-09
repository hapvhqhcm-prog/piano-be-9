import { describe, expect, it, vi } from 'vitest';
import { AudioEngine, CLICK } from '../src/audio/AudioEngine';
import { findSong, metronomeAccent, type Tune } from '../src/music/tune';

const tune = (timeSignature: string): Tune => ({ id: 'x', title: 'x', titleVi: 'x', hand: 'RH', bpm: 100, timeSignature, notes: [] });

describe('metronomeAccent — phách nhấn của máy đếm nhịp', () => {
  it('x/4 giữ như cũ: chỉ phách 1 mạnh', () => {
    for (const ts of ['2/4', '3/4', '4/4']) {
      const n = Number(ts[0]);
      for (let b = -2 * n; b < 3 * n; b++) expect(metronomeAccent(tune(ts), b)).toBe(((b % n) + n) % n === 0);
    }
  });

  it('6/8: mạnh–nhẹ–nhẹ–VỪA–nhẹ–nhẹ, cả khi đếm vào (phách âm)', () => {
    const t = tune('6/8');
    expect([0, 1, 2, 3, 4, 5].map((b) => metronomeAccent(t, b))).toEqual([true, false, false, 'secondary', false, false]);
    expect([-6, -5, -4, -3, -2, -1].map((b) => metronomeAccent(t, b))).toEqual([true, false, false, 'secondary', false, false]);
    expect(metronomeAccent(t, 9)).toBe('secondary');
  });

  it('nhịp ghép khác: 9/8, 12/8; 3/8 chỉ phách 1', () => {
    expect([0, 3, 6].map((b) => metronomeAccent(tune('9/8'), b))).toEqual([true, 'secondary', 'secondary']);
    expect([0, 3, 6, 9].map((b) => metronomeAccent(tune('12/8'), b))).toEqual([true, 'secondary', 'secondary', 'secondary']);
    expect([0, 1, 2].map((b) => metronomeAccent(tune('3/8'), b))).toEqual([true, false, false]);
  });

  it('bài 6/8 thật trong thư viện (Cấp 4) có phách 4 nhấn phụ', () => {
    const boat = findSong('boat_song_68');
    expect(boat?.timeSignature).toBe('6/8');
    expect(metronomeAccent(boat as Tune, 3)).toBe('secondary');
  });
});

describe('AudioEngine.click — 3 mức nhấn', () => {
  function fakeCtx() {
    const oscs: Array<{ frequency: { value: number } }> = [];
    const gains: number[] = [];
    const param = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn((v: number) => gains.push(v)),
      setTargetAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    });
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    const ctx = {
      state: 'suspended',
      currentTime: 0,
      sampleRate: 48000,
      destination: {},
      onstatechange: null,
      resume: vi.fn(async () => {
        ctx.state = 'running';
      }),
      createGain: () => ({ ...node(), gain: param() }),
      createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
      createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param(), Q: param() }),
      createConvolver: () => ({ ...node(), buffer: null }),
      createPeriodicWave: () => ({}),
      createBuffer: (_c: number, len: number) => {
        const d = new Float32Array(len);
        return { getChannelData: () => d };
      },
      createBufferSource: () => ({ ...node(), buffer: null, start: vi.fn(), stop: vi.fn(), onended: null }),
      createOscillator: () => {
        const o = { ...node(), type: 'sine', frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(), onended: null, setPeriodicWave: vi.fn() };
        oscs.push(o);
        return o;
      },
    };
    return { ctx, oscs, gains };
  }

  it('true / secondary / false → tần số & độ to giảm dần; lệnh cũ (boolean) không đổi', async () => {
    const { ctx, oscs, gains } = fakeCtx();
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.unlock();
    const g0 = gains.length;
    eng.click(1, true);
    eng.click(2, 'secondary');
    eng.click(3, false);
    eng.click(4);
    expect(oscs.slice(-4).map((o) => o.frequency.value)).toEqual([CLICK.accentHz, CLICK.secondaryHz, CLICK.hz, CLICK.hz]);
    expect(gains.slice(g0)).toEqual([CLICK.accentGain, CLICK.secondaryGain, CLICK.normalGain, CLICK.normalGain]);
    expect(CLICK.secondaryGain).toBeGreaterThan(CLICK.normalGain);
    expect(CLICK.secondaryGain).toBeLessThan(CLICK.accentGain);
    // Vẫn ≥ 5 kHz: bộ lọc micro chặn tiếng tích (không nghe nhầm thành nốt đàn)
    expect(CLICK.secondaryHz).toBeGreaterThanOrEqual(5000);
    eng.stopAll();
  });
});
