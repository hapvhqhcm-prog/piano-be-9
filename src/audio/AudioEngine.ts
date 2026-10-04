import { pitchFreq, type Pitch } from '../piano/pitchTable';

/**
 * AudioEngine — Phase 1: OscillatorNode (triangle) + envelope ADSR ngắn.
 * Không phụ thuộc DOM: chỉ cần một AudioContext (được tiêm vào để test).
 * AudioContext chỉ được tạo/resume trong unlock(), gọi từ thao tác chạm.
 */

export interface Envelope {
  attack: number;
  decay: number;
  sustain: number; // tỉ lệ so với peak
  release: number;
  peak: number;
}

export const DEFAULT_ENVELOPE: Envelope = {
  attack: 0.012,
  decay: 0.25,
  sustain: 0.35,
  release: 0.35,
  peak: 0.5,
};

export interface EnvPoint {
  t: number;
  v: number;
}

/** Điểm envelope (thời gian tuyệt đối). Hàm thuần — có test. */
export function envelopePoints(start: number, duration: number, env: Envelope = DEFAULT_ENVELOPE): EnvPoint[] {
  const attackEnd = start + env.attack;
  const decayEnd = attackEnd + env.decay;
  const holdEnd = Math.max(decayEnd, start + duration);
  const sustainV = env.peak * env.sustain;
  return [
    { t: start, v: 0 },
    { t: attackEnd, v: env.peak },
    { t: decayEnd, v: sustainV },
    { t: holdEnd, v: sustainV },
    { t: holdEnd + env.release, v: 0 },
  ];
}

export type EngineState = 'locked' | 'running' | 'suspended' | 'interrupted' | 'closed';

type ContextFactory = () => AudioContext;

function defaultFactory(): AudioContext {
  const w = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('Thiết bị không hỗ trợ Web Audio');
  return new Ctor();
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<Voice>();
  private listeners = new Set<(s: EngineState) => void>();
  private generation = 0;
  private busyCount = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(private readonly factory: ContextFactory = defaultFactory) {}

  get state(): EngineState {
    if (!this.ctx) return 'locked';
    return this.ctx.state as EngineState;
  }

  get isRunning(): boolean {
    return this.state === 'running';
  }

  /** Có đang phát âm mẫu (sample/sequence) không. */
  get isBusy(): boolean {
    return this.busyCount > 0;
  }

  onStateChange(fn: (s: EngineState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const s = this.state;
    this.listeners.forEach((fn) => fn(s));
  }

  /** PHẢI gọi trong handler của thao tác chạm. */
  async unlock(): Promise<boolean> {
    // iOS 17+: để âm thanh vẫn phát khi bật công tắc im lặng.
    try {
      const nav = globalThis.navigator as unknown as { audioSession?: { type: string } } | undefined;
      if (nav?.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* bỏ qua */
    }
    if (!this.ctx) {
      this.ctx = this.factory();
      const master = this.ctx.createGain();
      master.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(this.ctx.destination);
      this.master = master;
      this.ctx.onstatechange = () => this.emit();
    }
    if (this.ctx.state !== 'running') {
      // resume() có thể treo trên iOS khi bị "interrupted" → không để bé kẹt ở màn Bắt đầu.
      await Promise.race([this.ctx.resume().catch(() => undefined), wait(1500)]);
    }
    // "Tích" im lặng để mở khóa hẳn trên iOS.
    try {
      const buf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {
      /* bỏ qua */
    }
    this.emit();
    return this.isRunning;
  }

  /** Phát một tần số; resolve khi nốt tắt hẳn. */
  playFreq(freq: number, duration = 0.9, volume = 1): Promise<void> {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return Promise.resolve();
    if (ctx.state !== 'running') ctx.resume().catch(() => undefined);

    const start = ctx.currentTime + 0.01;
    const env = { ...DEFAULT_ENVELOPE, peak: DEFAULT_ENVELOPE.peak * volume };
    const pts = envelopePoints(start, duration, env);
    const end = pts[pts.length - 1].t;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    for (const p of pts.slice(1)) gain.gain.linearRampToValueAtTime(p.v, p.t);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(end + 0.02);

    const voice: Voice = { osc, gain };
    this.voices.add(voice);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.voices.delete(voice);
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          /* bỏ qua */
        }
        resolve();
      };
      osc.onended = finish;
      // Phòng khi context bị treo (onended không bao giờ tới).
      setTimeout(finish, (end - start) * 1000 + 250);
    });
  }

  playPitch(pitch: Pitch, duration = 0.9): Promise<void> {
    return this.playFreq(pitchFreq(pitch), duration);
  }

  /**
   * Phát âm mẫu theo thứ tự; onEach để sáng phím tương ứng.
   * Bị hủy nếu stopAll() được gọi giữa chừng.
   */
  async playSequence(
    pitches: Pitch[],
    opts: { duration?: number; gap?: number; onEach?: (p: Pitch, on: boolean) => void } = {},
  ): Promise<void> {
    const gen = this.generation;
    const duration = opts.duration ?? 0.8;
    const gap = opts.gap ?? 0.15;
    this.busyCount++;
    try {
      for (let i = 0; i < pitches.length; i++) {
        const p = pitches[i];
        if (gen !== this.generation) return;
        opts.onEach?.(p, true);
        const playing = this.playPitch(p, duration);
        await wait((duration + gap) * 1000);
        opts.onEach?.(p, false);
        if (i === pitches.length - 1) await playing;
      }
    } finally {
      this.busyCount--;
      if (this.busyCount === 0) {
        const w = this.idleWaiters;
        this.idleWaiters = [];
        w.forEach((fn) => fn());
      }
    }
  }

  /** Chuông nhỏ khi đúng (không có âm tiêu cực khi sai — §10). */
  chime(): Promise<void> {
    void this.playFreq(783.99, 0.12, 0.5);
    return wait(110).then(() => this.playFreq(1046.5, 0.25, 0.5));
  }

  /** Resolve khi không còn âm mẫu nào đang phát. */
  whenIdle(): Promise<void> {
    if (this.busyCount === 0) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  stopAll(): void {
    this.generation++;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of this.voices) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(0, now + 0.04);
        v.osc.stop(now + 0.05);
      } catch {
        /* bỏ qua */
      }
    }
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
