import { describe, expect, it, vi } from 'vitest';
import { AudioEngine, MAX_PEDAL_VOICES, REVERB_GUARD_MS } from '../src/audio/AudioEngine';
import {
  PEDAL_DAMPER_SCALE,
  PEDAL_RING,
  RESONANCE_SECONDS,
  naturalDecay,
  stringResonanceIR,
  voiceParams,
  warmVoiceParams,
} from '../src/audio/pianoVoice';
import { nodesPerNote } from '../src/audio/voiceAnalysis';
import { SONGS, lhTimeline, noteStyles, pedalLength, timeline, tunePedal, type Tune, type TuneNote } from '../src/music/tune';
import { PEDAL_DOWN_S, PEDAL_UP_S, eventsFromTune, pedalOfTune, soundPlan } from '../src/ui/components/demo';

/** (+ 2026-10-12) Tiếng pedal vang Cấp 4: lịch nốt, cộng hưởng dây, số nút, micro bỏ qua tiếng ngân. */

const rh = (pitch: string, beats: number, extra: Partial<TuneNote> = {}): TuneNote => ({ pitch, beats, ...extra }) as TuneNote;
const base = (o: Partial<Tune>): Tune =>
  ({ id: 't', title: 't', titleVi: 't', hand: 'RH', bpm: 60, timeSignature: '4/4', notes: [], ...o }) as Tune;

describe('pedalLength — nốt ngân tới lúc thay / nhả pedal', () => {
  const segs: Array<[number, number]> = [
    [0, 4],
    [4, 8],
  ];
  it('nốt kêu trong khoảng pedal → tới cuối khoảng; ngoài pedal → giữ nguyên', () => {
    expect(pedalLength(1, 0.95, segs)).toBe(3);
    expect(pedalLength(4, 0.95, segs)).toBe(4);
    expect(pedalLength(8, 0.95, segs)).toBe(0.95);
    expect(pedalLength(9, 2, segs)).toBe(2);
  });
  it('thay pedal: nốt còn GIỮ PHÍM lúc đạp lại được bắt lại (tới cuối khoảng mới); nhả phím trước thì tắt', () => {
    // nốt từ phách 3, giữ phím 2 phách (qua lúc thay pedal ở phách 4) → bắt lại tới 8
    expect(pedalLength(3, 2, segs)).toBe(5);
    // nhả phím trước lúc thay → chỉ tới lúc thay
    expect(pedalLength(3, 0.95, segs)).toBe(1);
    // phím giữ trước khi pedal đạp lần đầu → được bắt
    expect(pedalLength(-1, 1.5, segs)).toBe(5);
  });
  it('không bao giờ ngắn hơn lúc giữ phím', () => {
    expect(pedalLength(2, 5, segs)).toBe(6);
    expect(pedalLength(0, 10, segs)).toBe(10);
  });
});

describe('Silent Night có pedal — lịch tiếng bài mẫu', () => {
  const song = SONGS.find((s) => s.id === 'silent_night_ped')!;
  it('bài có pedal; mỗi ô thay pedal', () => {
    expect(song).toBeTruthy();
    const segs = tunePedal(song);
    expect(segs.length).toBeGreaterThan(8);
    for (let i = 1; i < segs.length; i++) expect(segs[i][0]).toBeGreaterThanOrEqual(segs[i - 1][1] - 1e-9);
    expect(pedalOfTune(song)).toEqual(segs);
    expect(pedalOfTune({ ...song, lh: song.lh!.map(({ ped: _p, ...n }) => n) })).toEqual([]);
  });

  it('nốt trong pedal ngân TỚI lúc giảm chấn rơi (thay/nhả pedal + PEDAL_UP_S) — không sớm, không quá', () => {
    const spb = 60 / song.bpm!;
    const t0 = 10;
    const segs = tunePedal(song);
    const plan = soundPlan(eventsFromTune(song), spb, t0, segs);
    const ups = plan.pedals.map((p) => p[1]);
    let pedalled = 0;
    for (const n of plan.notes) {
      if (!n.pedal) continue;
      pedalled++;
      const end = n.when + n.dur;
      // kết thúc đúng ở một lần nhả pedal
      expect(ups.some((u) => Math.abs(u - end) < 1e-6)).toBe(true);
      // và lần nhả đó là của khoảng pedal chứa nốt (lần nhả đầu tiên SAU lúc nốt kêu — nhả của khoảng trước rơi ở +PEDAL_UP_S)
      const firstUp = ups.find((u) => u > n.when + PEDAL_UP_S + 1e-6)!;
      expect(end).toBeCloseTo(firstUp, 6);
    }
    expect(pedalled).toBeGreaterThan(plan.notes.length * 0.8);
    // đạp lại SAU nốt mới (nhấn sau), nhả NGAY lúc nốt mới kêu (nhả trước)
    plan.pedals.forEach(([d, u], i) => {
      expect(d).toBeCloseTo(t0 + segs[i][0] * spb + PEDAL_DOWN_S, 6);
      expect(u).toBeCloseTo(t0 + segs[i][1] * spb + PEDAL_UP_S, 6);
      expect(u).toBeGreaterThan(d);
    });
  });

  it('âm lượng và lúc bấm không đổi; độ dài kêu ≥ khi không có pedal', () => {
    const plain = { ...song, lh: song.lh!.map(({ ped: _p, ...n }) => n) };
    const a = soundPlan(eventsFromTune(song), 1, 0, tunePedal(song)).notes;
    const b = soundPlan(eventsFromTune(plain), 1, 0, []).notes;
    expect(a.length).toBe(b.length);
    a.forEach((n, i) => {
      expect(n.when).toBe(b[i].when);
      expect(n.vol).toBe(b[i].vol);
      expect(n.dur).toBeGreaterThanOrEqual(b[i].dur - 1e-9);
    });
    expect(b.every((n) => !n.pedal)).toBe(true);
  });

  it('thay pedal: nốt giữ phím qua lúc thay được bắt lại (noteStyles)', () => {
    // C4 giữ 3 phách từ phách 2, pedal thay ở phách 4 → ngân tới hết khoảng mới (8)
    const t = base({
      hand: 'BOTH',
      notes: [rh('E4', 2), rh('C4', 3), rh('D4', 3)],
      lh: [rh('C3', 2, { ped: 'start' }), rh('G3', 2), rh('C3', 2, { ped: 'change' }), rh('G3', 2, { ped: 'end' })],
    });
    const st = noteStyles(t);
    const mainIdx = timeline(t).filter((n) => !n.rest);
    const c4 = mainIdx[1];
    expect(st.get(c4.index)!.len).toBe(6);
    expect(st.get(c4.index)!.pedal).toBe(true);
    // D4 (phách 5) kêu trong khoảng mới → tới 8
    expect(st.get(mainIdx[2].index)!.len).toBe(3);
    const lh = lhTimeline(t);
    expect(st.get(lh[0].index)!.len).toBe(4);
    expect(st.get(lh[2].index)!.len).toBe(4);
  });
});

describe('pianoVoice — nốt pedal', () => {
  it('ngân quá naturalDecay (tới PEDAL_RING × naturalDecay); nhả sớm như thường', () => {
    for (const f of [130.81, 261.63, 523.25]) {
      const nd = naturalDecay(f);
      const plain = voiceParams(f, 1, 20);
      const ped = voiceParams(f, 1, 20, true);
      expect(plain.tOff).toBeCloseTo(nd, 6);
      expect(ped.tOff).toBeCloseTo(nd * PEDAL_RING, 6);
      expect(warmVoiceParams(f, 1, 20, true).tEnd).toBeGreaterThan(warmVoiceParams(f, 1, 20).tEnd);
      // ngắn hơn naturalDecay: như không pedal
      expect(voiceParams(f, 1, 0.5, true).tOff).toBe(voiceParams(f, 1, 0.5).tOff);
    }
  });
  it('nhả pedal: tiếng giảm chấn mỗi nốt nhỏ lại (mọi giảm chấn rơi cùng lúc)', () => {
    const a = warmVoiceParams(261.63, 1, 0.8).damperGain;
    const b = warmVoiceParams(261.63, 1, 0.8, true).damperGain;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeCloseTo(a * PEDAL_DAMPER_SCALE, 9);
  });
  it('IR cộng hưởng dây: đủ dài, chuẩn hóa, cộng hưởng ở tần số dây (Đô3) mạnh hơn giữa hai dây', () => {
    const sr = 8000;
    const ir = stringResonanceIR(sr);
    expect(ir.length).toBe(Math.floor(sr * RESONANCE_SECONDS));
    let peak = 0;
    for (const x of ir) {
      expect(Number.isFinite(x)).toBe(true);
      peak = Math.max(peak, Math.abs(x));
    }
    expect(peak).toBeCloseTo(1, 6);
    // Biên độ phổ (DFT một điểm) trong 0,2–1,2 s: tại Đô3 vs giữa Đô3 và Đô#3 (lệch 50 cent)
    const mag = (f: number) => {
      let re = 0;
      let im = 0;
      for (let i = Math.floor(0.2 * sr); i < Math.floor(1.2 * sr); i++) {
        re += ir[i] * Math.cos((2 * Math.PI * f * i) / sr);
        im += ir[i] * Math.sin((2 * Math.PI * f * i) / sr);
      }
      return Math.hypot(re, im);
    };
    expect(mag(130.81)).toBeGreaterThan(5 * mag(130.81 * Math.pow(2, 0.5 / 12)));
  });
});

/** AudioContext giả (như tests/audio.test.ts) + đếm convolver. */
function fakeContext() {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const oscs: Array<{ frequency: { value: number }; stop: ReturnType<typeof vi.fn>; onended: null | (() => void) }> = [];
  const gains: Array<{ gain: ReturnType<typeof param> }> = [];
  let convolvers = 0;
  const ctx = {
    state: 'suspended',
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    onstatechange: null as null | (() => void),
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    createGain: () => {
      const g = { ...node(), gain: param() };
      gains.push(g);
      return g;
    },
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param(), Q: param(), gain: param() }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createConvolver: () => {
      convolvers++;
      return { ...node(), buffer: null };
    },
    createPeriodicWave: (real: Float32Array, imag: Float32Array) => ({ real, imag }),
    createBuffer: (_c: number, len: number) => {
      const d = new Float32Array(len);
      return { getChannelData: () => d };
    },
    createBufferSource: () => ({ ...node(), buffer: null, start: vi.fn(), stop: vi.fn(), onended: null }),
    createOscillator: () => {
      const o = { ...node(), type: 'sine', setPeriodicWave: vi.fn(), frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(), onended: null as null | (() => void) };
      oscs.push(o);
      return o;
    },
  };
  return { ctx, oscs, gains, convolvers: () => convolvers };
}

async function engine() {
  const f = fakeContext();
  const eng = new AudioEngine(() => f.ctx as unknown as AudioContext);
  await eng.unlock();
  return { eng, ...f };
}

describe('AudioEngine — pedal', () => {
  it('nốt pedal: KHÔNG thêm nút theo nốt; bus cộng hưởng dựng MỘT lần (3 nút dùng chung)', async () => {
    const { eng, convolvers } = await engine();
    const before = convolvers();
    void eng.scheduleFreq(261.63, 0, 0.3, 1, false);
    const plain = eng.stats.lastNoteNodes;
    expect(eng.resonanceNodes).toBe(0);
    void eng.scheduleFreq(261.63, 1, 0.3, 1, false, { pedal: true });
    expect(eng.stats.lastNoteNodes).toBe(plain);
    expect(eng.stats.lastNoteNodes).toBe(nodesPerNote('warm', 261.63, 1, 0.3, false));
    expect(eng.resonanceNodes).toBe(3);
    for (let i = 0; i < 5; i++) void eng.scheduleFreq(196 + i * 20, 2 + i, 3, 1, false, { pedal: true });
    eng.pedal(0, 5);
    eng.pedal(5, 8);
    expect(convolvers() - before).toBe(1);
    eng.stopAll();
  });

  it('đàn lại cùng phím khi pedal đang giữ → nốt cũ tắt nhanh (không chồng 2 nốt cùng dây)', async () => {
    const { eng, oscs } = await engine();
    void eng.scheduleFreq(130.81, 0, 6, 1, true, { pedal: true });
    const first = oscs.slice();
    void eng.scheduleFreq(130.81, 1.5, 6, 1, true, { pedal: true });
    // 2 dây lớp thân của nốt cũ bị dừng sớm (~1,5 + 0,25 s) thay vì ~6 s
    for (const o of first.slice(0, 2)) expect(o.stop.mock.calls.some(([t]) => Math.abs(t - 1.75) < 1e-6)).toBe(true);
    // khác phím: không bị tắt
    const second = oscs.slice(first.length, first.length + 2);
    void eng.scheduleFreq(196, 2, 6, 1, true, { pedal: true });
    for (const o of second) expect(o.stop.mock.calls.every(([t]) => t > 5)).toBe(true);
    eng.stopAll();
  });

  it(`giới hạn số nốt pedal vang cùng lúc (≤ ${MAX_PEDAL_VOICES}) → số nút đang sống có trần`, async () => {
    const { eng } = await engine();
    // 40 nốt khác phím, mỗi nốt 0,1 s, pedal giữ cả 8 s
    for (let i = 0; i < 40; i++) void eng.scheduleFreq(110 * Math.pow(2, i / 12), i * 0.1, 8 - i * 0.1, 0.6, true, { pedal: true });
    // Đếm nốt còn vang ở cuối (t1 > lúc nốt cuối + 0,25 s)
    const internal = eng as unknown as { allVoices: Set<{ t1: number }> };
    const ringing = [...internal.allVoices].filter((v) => v.t1 > 3.9 + 0.26).length;
    expect(ringing).toBeLessThanOrEqual(MAX_PEDAL_VOICES);
    expect(eng.stats.peakNodes).toBeLessThan(40 * 10);
    eng.stopAll();
  });

  it('micro: nốt pedal ngân dài vẫn là "app đang phát" tới khi tắt hẳn (+ REVERB_GUARD_MS)', async () => {
    vi.useFakeTimers();
    try {
      const f = fakeContext();
      const eng = new AudioEngine(() => f.ctx as unknown as AudioContext);
      const p = eng.unlock();
      await vi.advanceTimersByTimeAsync(10);
      await p;
      // Đô3 giữ bằng pedal 4 s (> naturalDecay 2,4 s) — trước đây nốt im ở 2,4 s
      const done = eng.scheduleFreq(130.81, 0, 4, 1, true, { pedal: true });
      const tEnd = warmVoiceParams(130.81, 1, 4, true).tEnd;
      expect(tEnd).toBeGreaterThan(4);
      // nguồn dừng đúng lúc tắt hẳn (sau nhả pedal)
      expect(f.oscs[0].stop.mock.calls[0][0]).toBeCloseTo(tEnd + 0.02, 6);
      f.ctx.currentTime = 3.5;
      expect(eng.isSounding).toBe(true);
      expect(eng.msSinceSound()).toBe(0);
      f.oscs[0].onended?.();
      await done;
      expect(eng.isSounding).toBe(false);
      const t = Date.now();
      expect(eng.msSinceSound(t)).toBe(0);
      expect(eng.msSinceSound(t + REVERB_GUARD_MS + 50)).toBe(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it('micro: lần đạp pedal (track) giữ "đang phát" tới lúc nhả + đuôi cộng hưởng; track=false không chặn; stopAll gỡ', async () => {
    vi.useFakeTimers();
    try {
      const f = fakeContext();
      const eng = new AudioEngine(() => f.ctx as unknown as AudioContext);
      const p = eng.unlock();
      await vi.advanceTimersByTimeAsync(10);
      await p;
      eng.pedal(0.1, 2);
      expect(eng.isSounding).toBe(true);
      await vi.advanceTimersByTimeAsync(1900);
      expect(eng.isSounding).toBe(true);
      await vi.advanceTimersByTimeAsync(300);
      expect(eng.isSounding).toBe(false);
      // + đuôi hồi âm như nốt thường
      expect(eng.msSinceSound()).toBe(0);
      expect(eng.msSinceSound(Date.now() + REVERB_GUARD_MS + 20)).toBeGreaterThanOrEqual(20);
      eng.pedal(0.1, 2, false);
      expect(eng.isSounding).toBe(false);
      eng.pedal(0.1, 5);
      expect(eng.isSounding).toBe(true);
      eng.stopAll();
      expect(eng.isSounding).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cổng cộng hưởng: mở chậm lúc đạp, đóng nhanh lúc nhả; stopAll đóng ngay', async () => {
    const { eng, gains } = await engine();
    eng.pedal(1, 3);
    const gate = gains.find((g) => g.gain.setTargetAtTime.mock.calls.some(([v, t]) => v === 1 && t === 1))!;
    expect(gate).toBeTruthy();
    const calls = gate.gain.setTargetAtTime.mock.calls;
    const open = calls.find(([v]) => v === 1)!;
    const close = calls.find(([v, t]) => v === 0 && t === 3)!;
    expect(open[2]).toBeGreaterThan(close[2]);
    eng.stopAll();
    expect(gate.gain.cancelScheduledValues).toHaveBeenCalled();
  });
});
