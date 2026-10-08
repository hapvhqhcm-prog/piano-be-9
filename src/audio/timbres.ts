/**
 * (+ 2026-10-08) 🎁 TIẾNG ĐÀN MỚI cho Đàn tự do (quà mở khóa theo đảo — lessons/unlocks.ts).
 * Tổng hợp nhẹ bằng Web Audio trên AudioContext dùng chung của AudioEngine — KHÔNG đụng tới tiếng piano của bài học
 * (AudioEngine giữ nguyên). Chỉ dùng ở màn Đàn tự do (không có micro) nên đi thẳng ra loa.
 */

export type TimbreId = 'musicbox' | 'marimba' | 'flute' | 'robot' | 'bell' | 'organ';

export const TIMBRE_IDS: readonly TimbreId[] = ['musicbox', 'marimba', 'flute', 'robot', 'bell', 'organ'];

interface Partial_ {
  /** bội số tần số */
  ratio: number;
  gain: number;
  type?: OscillatorType;
}

interface TimbreSpec {
  partials: Partial_[];
  attack: number;
  /** thời gian tắt dần (giây, hằng số thời gian setTarget) */
  decay: number;
  /** mức giữ (0 = tắt hẳn như gõ) */
  sustain: number;
  release: number;
  /** rung (Hz, độ sâu cent) */
  vibrato?: [number, number];
  /** lọc thông thấp (Hz) */
  lowpass?: number;
  volume: number;
}

/** Thông số từng tiếng — hàm thuần để test được. */
export const TIMBRES: Readonly<Record<TimbreId, TimbreSpec>> = {
  musicbox: { partials: [{ ratio: 1, gain: 1 }, { ratio: 4, gain: 0.25 }, { ratio: 6.3, gain: 0.08 }], attack: 0.003, decay: 0.35, sustain: 0, release: 0.2, volume: 0.32 },
  marimba: { partials: [{ ratio: 1, gain: 1 }, { ratio: 3.9, gain: 0.35 }, { ratio: 9.2, gain: 0.06 }], attack: 0.004, decay: 0.18, sustain: 0, release: 0.12, volume: 0.42 },
  flute: { partials: [{ ratio: 1, gain: 1, type: 'triangle' }, { ratio: 2, gain: 0.12 }], attack: 0.07, decay: 0.4, sustain: 0.75, release: 0.15, vibrato: [5.2, 12], volume: 0.3 },
  robot: { partials: [{ ratio: 1, gain: 1, type: 'square' }], attack: 0.004, decay: 0.25, sustain: 0.35, release: 0.06, lowpass: 1800, volume: 0.16 },
  bell: { partials: [{ ratio: 1, gain: 1 }, { ratio: 2.76, gain: 0.45 }, { ratio: 5.4, gain: 0.22 }, { ratio: 8.93, gain: 0.08 }], attack: 0.002, decay: 0.9, sustain: 0, release: 0.6, volume: 0.28 },
  organ: { partials: [{ ratio: 1, gain: 1 }, { ratio: 2, gain: 0.55 }, { ratio: 3, gain: 0.3 }, { ratio: 4, gain: 0.15 }], attack: 0.02, decay: 0.3, sustain: 0.85, release: 0.08, volume: 0.18 },
};

export const isTimbre = (x: unknown): x is TimbreId => typeof x === 'string' && (TIMBRE_IDS as readonly string[]).includes(x);

/** Phát MỘT nốt bằng tiếng `id` trên `ctx` (đã mở khóa). `duration`: giây giữ phím. */
export function playTimbre(ctx: AudioContext | null, id: TimbreId, freq: number, duration = 0.9): void {
  if (!ctx || !(freq > 0)) return;
  const spec = TIMBRES[id];
  try {
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    const t0 = ctx.currentTime + 0.005;
    const out = ctx.createGain();
    let tail: AudioNode = out;
    if (spec.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = spec.lowpass;
      out.connect(lp);
      tail = lp;
    }
    tail.connect(ctx.destination);
    const g = out.gain;
    const peak = spec.volume;
    const held = Math.max(0.05, duration);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(peak, t0 + spec.attack);
    g.setTargetAtTime(peak * spec.sustain, t0 + spec.attack, spec.decay);
    const off = t0 + spec.attack + (spec.sustain > 0 ? held : Math.max(held, spec.decay * 4));
    g.cancelScheduledValues(off);
    g.setTargetAtTime(0, off, spec.release / 3);
    const end = off + spec.release * 2 + 0.05;
    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    if (spec.vibrato) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = spec.vibrato[0];
      lfoGain = ctx.createGain();
      lfoGain.gain.value = freq * (2 ** (spec.vibrato[1] / 1200) - 1);
      lfo.connect(lfoGain);
      lfo.start(t0 + 0.12);
      lfo.stop(end);
    }
    for (const p of spec.partials) {
      const f = freq * p.ratio;
      if (f >= ctx.sampleRate / 2) continue;
      const osc = ctx.createOscillator();
      osc.type = p.type ?? 'sine';
      osc.frequency.value = f;
      if (lfoGain && p.ratio === 1) lfoGain.connect(osc.frequency);
      const pg = ctx.createGain();
      pg.gain.value = p.gain;
      osc.connect(pg);
      pg.connect(out);
      osc.start(t0);
      osc.stop(end);
      osc.onended = () => {
        try {
          pg.disconnect();
        } catch {
          /* bỏ qua */
        }
      };
    }
    window.setTimeout(() => {
      try {
        tail.disconnect();
        if (tail !== out) out.disconnect();
      } catch {
        /* bỏ qua */
      }
    }, (end - ctx.currentTime) * 1000 + 300);
  } catch {
    /* trình duyệt cũ: im lặng còn hơn sập màn */
  }
}
