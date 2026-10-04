import { pitchFreq, type Pitch } from '../piano/pitchTable';

/**
 * AudioEngine — tiếng đàn tổng hợp "giống piano" (OWNER chọn thay cho sample Salamander):
 * 3 họa âm + tắt dần; tiếng gõ nhịp; hẹn giờ nốt theo đồng hồ AudioContext.
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
  extra?: OscillatorNode[];
  extraGains?: GainNode[];
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<Voice>();
  /** Mọi nốt đã hẹn (kể cả bè đệm không chặn micro) — để stopAll() dừng hết. */
  private allVoices = new Set<Voice>();
  /** Tiếng gõ nhịp đã hẹn — stopAll() hủy luôn. */
  private clicks = new Set<OscillatorNode>();
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

  /** AudioContext dùng chung (micro cũng gắn vào đây); null trước unlock(). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** App đang phát ra tiếng (âm mẫu, phím ảo, chuông) — micro phải bỏ qua lúc này. */
  get isSounding(): boolean {
    return this.voices.size > 0 || this.busyCount > 0;
  }

  /** Số ms kể từ khi app im hẳn (0 nếu đang phát). */
  msSinceSound(now = Date.now()): number {
    return this.isSounding ? 0 : now - this.lastSoundEnd;
  }

  private lastSoundEnd = 0;
  private sessionType: 'playback' | 'play-and-record' = 'playback';

  /**
   * iOS 17+: "playback" = vẫn kêu khi bật im lặng; "play-and-record" = khi đang dùng micro.
   */
  setAudioSessionType(type: 'playback' | 'play-and-record'): void {
    this.sessionType = type;
    try {
      const nav = globalThis.navigator as unknown as { audioSession?: { type: string } } | undefined;
      if (nav?.audioSession) nav.audioSession.type = type;
    } catch {
      /* bỏ qua */
    }
  }

  /** PHẢI gọi trong handler của thao tác chạm. */
  async unlock(): Promise<boolean> {
    this.setAudioSessionType(this.sessionType);
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

  /** Thời gian của AudioContext (giây) — dùng để hẹn giờ phát nốt theo nhịp. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Phát một tần số ngay; resolve khi nốt tắt hẳn. */
  playFreq(freq: number, duration = 0.9, volume = 1): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !this.master) return Promise.resolve();
    if (ctx.state !== 'running') ctx.resume().catch(() => undefined);
    return this.scheduleFreq(freq, ctx.currentTime + 0.01, duration, volume);
  }

  /**
   * Hẹn giờ một nốt "giống piano" tại thời điểm `when` (giây, đồng hồ AudioContext):
   * 3 họa âm (tam giác + sin bậc 2, 3), búa gõ nhanh rồi tắt dần; nốt trầm ngân lâu hơn nốt cao.
   * track=false: không tính là "app đang phát" (để micro vẫn nghe được) — dùng cho bè đệm xa cao độ.
   */
  scheduleFreq(freq: number, when: number, duration = 0.9, volume = 1, track = true): Promise<void> {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return Promise.resolve();
    const start = Math.max(when, ctx.currentTime);
    const peak = DEFAULT_ENVELOPE.peak * volume;
    // Thời gian tắt tự nhiên: ~2,4 s ở C3, ~1,1 s ở C5
    const decayT = Math.max(0.8, Math.min(2.6, 2.4 * Math.pow(130.8 / freq, 0.55)));
    const release = 0.12;
    const offAt = start + Math.min(duration, decayT);
    const end = offAt + release;

    const partials: Array<{ mult: number; type: OscillatorType; amp: number; speed: number }> = [
      { mult: 1, type: 'triangle', amp: 1, speed: 1 },
      { mult: 2.0016, type: 'sine', amp: 0.32, speed: 1.6 },
      { mult: 3.004, type: 'sine', amp: 0.12, speed: 2.4 },
    ];
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    for (const p of partials) {
      const osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = freq * p.mult;
      const g = ctx.createGain();
      const a = peak * p.amp;
      const t = decayT / p.speed;
      const env = g.gain;
      env.setValueAtTime(0, start);
      env.linearRampToValueAtTime(a, start + 0.005);
      // Tắt dần kiểu hàm mũ, xấp xỉ bằng các đoạn thẳng
      const pts: Array<[number, number]> = [
        [0.08, 0.62],
        [0.3, 0.38],
        [0.6, 0.2],
        [1, 0.07],
      ];
      for (const [ft, fv] of pts) {
        const at = start + 0.005 + ft * t;
        if (at >= offAt) break;
        env.linearRampToValueAtTime(a * fv, at);
      }
      env.linearRampToValueAtTime(a * 0.05, offAt);
      env.linearRampToValueAtTime(0, end);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(end + 0.02);
      oscs.push(osc);
      gains.push(g);
    }

    const voice: Voice = { osc: oscs[0], gain: gains[0], extra: oscs.slice(1), extraGains: gains.slice(1) };
    if (track) this.voices.add(voice);
    this.allVoices.add(voice);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.allVoices.delete(voice);
        if (track) {
          this.voices.delete(voice);
          this.lastSoundEnd = Date.now();
        }
        try {
          oscs.forEach((o) => o.disconnect());
          gains.forEach((g) => g.disconnect());
        } catch {
          /* bỏ qua */
        }
        resolve();
      };
      oscs[0].onended = finish;
      // Phòng khi context bị treo (onended không bao giờ tới).
      setTimeout(finish, (end - ctx.currentTime) * 1000 + 250);
    });
  }

  /**
   * Tiếng gõ nhịp (metronome): rất ngắn, cao (~1,6–2 kHz) — nằm ngoài dải micro nghe đàn
   * nên KHÔNG làm micro bỏ qua.
   */
  click(when: number, accent = false): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = Math.max(when, ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accent ? 2000 : 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.25 : 0.15, t + 0.002);
    g.gain.linearRampToValueAtTime(0, t + 0.035);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.05);
    this.clicks.add(osc);
    osc.onended = () => {
      this.clicks.delete(osc);
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* bỏ qua */
      }
    };
  }

  /** Tiếng vỗ tay của khán giả (sân khấu) — nhiễu trắng ngắt quãng. */
  applause(seconds = 2.5): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let clap = 0;
    for (let i = 0; i < len; i++) {
      if (Math.random() < 0.0009) clap = 1;
      clap *= 0.9993;
      const fade = Math.min(1, i / (0.3 * ctx.sampleRate), (len - i) / (0.8 * ctx.sampleRate));
      data[i] = (Math.random() * 2 - 1) * (0.15 + 0.6 * clap) * fade * 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start();
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
    for (const c of this.clicks) {
      try {
        c.stop(now);
      } catch {
        /* bỏ qua */
      }
    }
    this.clicks.clear();
    for (const v of this.allVoices) {
      const gs = [v.gain, ...(v.extraGains ?? [])];
      const os = [v.osc, ...(v.extra ?? [])];
      try {
        for (const g of gs) {
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(g.gain.value, now);
          g.gain.linearRampToValueAtTime(0, now + 0.04);
        }
        for (const o of os) o.stop(now + 0.05);
      } catch {
        /* bỏ qua */
      }
    }
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
