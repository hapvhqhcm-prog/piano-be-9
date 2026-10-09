import { pitchFreq, type Pitch } from '../piano/pitchTable';
import {
  ampsToTable,
  bodyAmps,
  brightAmps,
  brightEvents,
  cutoffEvents,
  gainEvents,
  harmonicTable,
  roomImpulse,
  roomImpulseStereo,
  thumpNoise,
  voiceParams,
  warmVoiceParams,
  waveKey,
  waveKeyFreq,
  type ParamEvent,
  type VoiceModel,
} from './pianoVoice';
import { PING } from './latency';

/**
 * AudioEngine — tiếng đàn tổng hợp "giống piano" (OWNER chọn thay cho sample Salamander):
 * 2 dây lệch nhẹ (PeriodicWave) + tiếng búa → lọc tối dần → bao biên 2 giai đoạn (xem pianoVoice.ts),
 * hồi âm phòng nhỏ ở bus chính; tiếng gõ nhịp; hẹn giờ nốt theo đồng hồ AudioContext.
 * (+ 2026-10-09) Mô hình "ấm" (mặc định, voiceModel = 'warm'): lớp thân + lớp sáng tắt nhanh & hơi lệch (không hòa âm),
 * tiếng giảm chấn, bus chung có cộng hưởng bầu đàn + trái/phải theo âm vực + hồi âm stereo. 'classic' = tiếng cũ (A/B).
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
  /** Bao biên âm lượng chính (stopAll() kéo về 0). */
  env: GainNode;
  /** Các gain khác đi thẳng ra bus (lớp sáng, búa/giảm chấn) — stopAll() cũng kéo về 0. */
  fades: GainNode[];
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  /** Khoảng vang [t0, t1) theo đồng hồ AudioContext — để đếm nốt CHỒNG NHAU thật (chế độ nhẹ). */
  t0: number;
  t1: number;
}

/** Số liệu CPU (đếm nút Web Audio) — trang ?soundtest hiển thị. */
export interface VoiceStats {
  /** Nốt đang vang (kể cả bè đệm). */
  voices: number;
  /** Nút Web Audio của các nốt đang vang (không tính bus chung). */
  liveNodes: number;
  /** Số nút của nốt vừa hẹn gần nhất. */
  lastNoteNodes: number;
  /** Đỉnh liveNodes từ lần resetStats(). */
  peakNodes: number;
  /** Số nốt đã chạy chế độ nhẹ từ lần resetStats(). */
  lightNotes: number;
  notes: number;
}

/**
 * Từ bao nhiêu nốt chồng nhau thì bỏ dây 2 + tiếng búa (+ lớp sáng) (đỡ CPU iPad cũ khi hợp âm/bè đệm dày).
 * (2026-10-09) Đếm nốt vang CÙNG LÚC với nốt mới (theo khoảng thời gian), không phải mọi nốt đã hẹn: màn mẫu hẹn cả bài
 * một lượt → trước đây chỉ 8 nốt đầu đủ tiếng, phần còn lại của bài mẫu toàn tiếng "nhẹ" 1 dây.
 */
const LIGHT_VOICE_THRESHOLD = 8;
/** Hồi âm còn nghe sau khi nốt tắt hẳn → cộng vào "app vừa im" để micro không bắt nhầm đuôi vang. */
export const REVERB_GUARD_MS = 150;
/**
 * Tiếng tích máy đếm nhịp (dùng chung với giả lập trong test). Lên 1,5 ms (không "bụp", phổ gọn),
 * tắt theo hàm mũ τ = 10 ms. Tần số ≥ 5 kHz để bộ lọc micro (2 × biquad 1,6 kHz) chặn > 40 dB.
 */
export const CLICK = {
  hz: 5000,
  accentHz: 6000,
  /** (+ 2026-10-09) Phách nhấn PHỤ (vd phách 4 của nhịp 6/8): giữa phách thường và phách mạnh */
  secondaryHz: 5500,
  normalGain: 0.3,
  accentGain: 0.5,
  secondaryGain: 0.4,
  attack: 0.0015,
  tau: 0.01,
  length: 0.06,
} as const;
/** Mức gửi hồi âm (ướt) — nhỏ, chỉ cho "có phòng". */
const REVERB_WET = 0.14;
/** Mô hình ấm: mức gửi hồi âm stereo (đuôi RT60 0,8 s ngắn hơn phòng cũ — xem tests/pianoTone.test.ts về mốc micro). */
export const WARM_REVERB_WET = 0.13;
/** Cộng hưởng bầu đàn (bus chung): đỉnh ấm ~230 Hz và "độ vang gỗ" ~2,7 kHz. */
export const BODY_EQ: ReadonlyArray<{ hz: number; q: number; db: number }> = [
  { hz: 230, q: 0.9, db: 2 },
  { hz: 2700, q: 1.2, db: 1.5 },
];
/** Các vị trí trái/phải dùng chung (nốt chọn vị trí gần nhất — không tốn nút theo nốt). */
export const PAN_POSITIONS = [-0.3, -0.15, 0, 0.15, 0.3] as const;

function applyEvents(param: AudioParam, events: ParamEvent[], t0: number): void {
  for (const e of events) {
    const t = t0 + e.t;
    if (e.kind === 'set') param.setValueAtTime(e.v, t);
    else if (e.kind === 'ramp') param.linearRampToValueAtTime(e.v, t);
    else param.setTargetAtTime(e.v, t, e.tau);
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  /** Bus nhạc chính (mô hình ấm: sau cộng hưởng bầu đàn; có hồi âm stereo) → nén → loa. */
  private master: GainNode | null = null;
  private comp: AudioNode | null = null;
  /** Đầu vào bus ấm (trước cộng hưởng bầu đàn) và các bộ đặt trái/phải dùng chung. */
  private warmIn: AudioNode | null = null;
  private panners: AudioNode[] = [];
  /** Bus của tiếng cũ (chỉ dựng khi chọn 'classic' — trang A/B): master cũ + hồi âm mono cũ. */
  private classicMaster: GainNode | null = null;
  /** Kiểu tiếng đàn (A/B ở trang ?soundtest). Mặc định 'warm'. */
  voiceModel: VoiceModel = 'warm';
  private _stats: VoiceStats = { voices: 0, liveNodes: 0, lastNoteNodes: 0, peakNodes: 0, lightNotes: 0, notes: 0 };
  /** Bus khô (không hồi âm) cho tiếng tích nhịp — đuôi vang của tích sẽ lọt vào micro. */
  private dry: GainNode | null = null;
  private waves = new Map<number, PeriodicWave | null>();
  private noiseBuf: AudioBuffer | null = null;
  private voices = new Set<Voice>();
  /** Mọi nốt đã hẹn (kể cả bè đệm không chặn micro) — để stopAll() dừng hết. */
  private allVoices = new Set<Voice>();
  /** Tiếng gõ nhịp đã hẹn — stopAll() hủy luôn. */
  private clicks = new Set<OscillatorNode>();
  /** Thời điểm (đồng hồ AudioContext) các tiếng tích đã hẹn — để micro bỏ qua đúng lúc có tiếng tích. */
  private clickTimes: number[] = [];
  private listeners = new Set<(s: EngineState) => void>();
  private generation = 0;
  private busyCount = 0;
  /** Tiếng phát ngoài bộ tổng hợp đang giữ "bận" (holdBusy) — stopAll() dừng hết. */
  private externals = new Set<{ stop: () => void }>();
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
    // lastSoundEnd đã cộng REVERB_GUARD_MS (đuôi hồi âm) → có thể ở tương lai gần.
    return this.isSounding ? 0 : Math.max(0, now - this.lastSoundEnd);
  }

  private lastSoundEnd = 0;
  /** Kiểu phiên âm thanh đã thực sự đặt cho iOS (null = chưa đặt) — tránh đặt lại cùng giá trị. */
  private appliedSession: 'playback' | 'play-and-record' | null = null;
  private micActive = false;
  /**
   * Phụ huynh đã BẬT micro trong Cài đặt? (App gán.) Nếu có: giữ 'play-and-record' suốt — mỗi lần đổi kiểu phiên,
   * iOS đổi đường âm thanh → tiếng nhỏ đi / lẹt xẹt. Chỉ về 'playback' khi micro bị tắt trong Cài đặt.
   */
  recordSessionWanted: () => boolean = () => false;

  /**
   * iOS 17+: "playback" = vẫn kêu khi bật im lặng; "play-and-record" = khi đang dùng micro.
   * `force` = đặt lại kể cả khi giống lần trước (lúc unlock — iOS có thể đã tự đổi).
   */
  setAudioSessionType(type: 'playback' | 'play-and-record', force = false): void {
    if (!force && this.appliedSession === type) return;
    this.appliedSession = type;
    try {
      const nav = globalThis.navigator as unknown as { audioSession?: { type: string } } | undefined;
      if (nav?.audioSession) nav.audioSession.type = type;
    } catch {
      /* bỏ qua */
    }
  }

  /** Kiểu phiên cần có: đang dùng micro hoặc micro được bật trong Cài đặt → 'play-and-record'. */
  private wantedSession(): 'playback' | 'play-and-record' {
    let wanted = false;
    try {
      wanted = this.recordSessionWanted();
    } catch {
      /* bỏ qua */
    }
    return this.micActive || wanted ? 'play-and-record' : 'playback';
  }

  /** MicListener báo micro bật/tắt; cũng gọi lại sau khi đổi Cài đặt micro để đồng bộ kiểu phiên. */
  setMicActive(on: boolean): void {
    this.micActive = on;
    this.setAudioSessionType(this.wantedSession());
  }

  /** PHẢI gọi trong handler của thao tác chạm. */
  async unlock(): Promise<boolean> {
    this.setAudioSessionType(this.wantedSession(), true);
    if (!this.ctx) {
      this.ctx = this.factory();
      const ctx = this.ctx;
      const master = ctx.createGain();
      master.gain.value = 0.72;
      // Nén nhẹ, chỉ chặn đỉnh (mặc định −24 dB/12:1 bóp mất độ tắt dần tự nhiên của tiếng đàn)
      const comp = ctx.createDynamicsCompressor();
      try {
        comp.threshold.value = -12;
        comp.knee.value = 6;
        comp.ratio.value = 4;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
      } catch {
        /* bỏ qua */
      }
      master.connect(comp);
      comp.connect(ctx.destination);
      this.comp = comp;
      const dry = ctx.createGain();
      dry.gain.value = 0.8;
      dry.connect(comp);
      this.dry = dry;
      // Hồi âm phòng nhỏ STEREO (một ConvolverNode dùng chung, IR 2 kênh sinh thủ tục — không tải gì)
      try {
        if (typeof ctx.createConvolver === 'function') {
          const [l, r] = roomImpulseStereo(ctx.sampleRate);
          const buf = ctx.createBuffer(2, l.length, ctx.sampleRate);
          buf.getChannelData(0).set(l);
          buf.getChannelData(1).set(r);
          const conv = ctx.createConvolver();
          conv.buffer = buf;
          const wet = ctx.createGain();
          wet.gain.value = WARM_REVERB_WET;
          master.connect(conv);
          conv.connect(wet);
          wet.connect(comp);
        }
      } catch {
        /* không có hồi âm cũng được */
      }
      // Cộng hưởng bầu đàn (2 bộ lọc đỉnh dùng chung) → master
      let eqIn: AudioNode = master;
      try {
        for (const b of [...BODY_EQ].reverse()) {
          const f = ctx.createBiquadFilter();
          f.type = 'peaking';
          f.frequency.value = b.hz;
          f.Q.value = b.q;
          f.gain.value = b.db;
          f.connect(eqIn);
          eqIn = f;
        }
      } catch {
        eqIn = master;
      }
      this.warmIn = eqIn;
      // Trái/phải theo âm vực: vài bộ đặt vị trí DÙNG CHUNG (Safari 14.1+); thiếu thì đi thẳng (mono)
      this.panners = [];
      try {
        if (typeof (ctx as Partial<AudioContext>).createStereoPanner === 'function') {
          // StereoPanner (luật công suất đều) đưa nguồn mono ở giữa ra 0,707 mỗi kênh → bù √2 (một nút chung)
          const comp = ctx.createGain();
          comp.gain.value = Math.SQRT2;
          comp.connect(eqIn);
          for (const pos of PAN_POSITIONS) {
            const pn = ctx.createStereoPanner();
            pn.pan.value = pos;
            pn.connect(comp);
            this.panners.push(pn);
          }
        }
      } catch {
        this.panners = [];
      }
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
   * PeriodicWave theo dải âm vực (cache); null nếu trình duyệt không hỗ trợ.
   * kind: 'classic' = phổ cũ · 'body' = lớp thân (mô hình ấm) · 'bright' = lớp sáng (mô hình ấm).
   */
  private waveFor(ctx: AudioContext, freq: number, kind: 'classic' | 'body' | 'bright' = 'classic'): PeriodicWave | null {
    const band = waveKey(freq);
    const key = band + (kind === 'classic' ? 0 : kind === 'body' ? 1000 : 2000);
    let w = this.waves.get(key);
    if (w === undefined) {
      try {
        const bf = waveKeyFreq(band);
        const { real, imag } =
          kind === 'classic' ? harmonicTable(bf) : ampsToTable(kind === 'body' ? bodyAmps(bf) : brightAmps(bf));
        w = typeof ctx.createPeriodicWave === 'function' ? ctx.createPeriodicWave(real, imag) : null;
      } catch {
        w = null;
      }
      this.waves.set(key, w);
    }
    return w;
  }

  /** Bus của tiếng cũ (A/B): dựng lần đầu cần — y hệt chuỗi trước 2026-10-09 (master 0,72 + hồi âm mono cũ). */
  private classicBus(ctx: AudioContext): AudioNode | null {
    if (this.classicMaster) return this.classicMaster;
    const comp = this.comp;
    if (!comp) return this.master;
    const m = ctx.createGain();
    m.gain.value = 0.72;
    m.connect(comp);
    try {
      if (typeof ctx.createConvolver === 'function') {
        const ir = roomImpulse(ctx.sampleRate);
        const buf = ctx.createBuffer(1, ir.length, ctx.sampleRate);
        buf.getChannelData(0).set(ir);
        const conv = ctx.createConvolver();
        conv.buffer = buf;
        const wet = ctx.createGain();
        wet.gain.value = REVERB_WET;
        m.connect(conv);
        conv.connect(wet);
        wet.connect(comp);
      }
    } catch {
      /* bỏ qua */
    }
    this.classicMaster = m;
    return m;
  }

  /** Đầu vào bus ấm cho vị trí trái/phải `pan` (bộ đặt vị trí gần nhất, dùng chung). */
  private warmOut(pan: number): AudioNode | null {
    if (this.panners.length) {
      let best = 0;
      for (let i = 1; i < PAN_POSITIONS.length; i++) {
        if (Math.abs(PAN_POSITIONS[i] - pan) < Math.abs(PAN_POSITIONS[best] - pan)) best = i;
      }
      return this.panners[best] ?? this.warmIn;
    }
    return this.warmIn ?? this.master;
  }

  /** Số liệu CPU (đếm nút) — trang ?soundtest. */
  get stats(): VoiceStats {
    let live = 0;
    for (const v of this.allVoices) live += v.nodes.length;
    return { ...this._stats, voices: this.allVoices.size, liveNodes: live };
  }

  resetStats(): void {
    this._stats = { voices: 0, liveNodes: 0, lastNoteNodes: 0, peakNodes: 0, lightNotes: 0, notes: 0 };
  }

  /** Buffer nhiễu tiếng búa — tạo một lần, dùng chung. */
  private noise(ctx: AudioContext): AudioBuffer | null {
    if (!this.noiseBuf) {
      try {
        const data = thumpNoise(ctx.sampleRate);
        const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
        buf.getChannelData(0).set(data);
        this.noiseBuf = buf;
      } catch {
        return null;
      }
    }
    return this.noiseBuf;
  }

  /**
   * Hẹn giờ một nốt "giống piano" tại thời điểm `when` (giây, đồng hồ AudioContext) — mô hình ở pianoVoice.ts.
   * 'warm' (mặc định): 2 dây lệch ~1 cent (lớp thân) → lọc tối dần → bao biên 2 giai đoạn; + lớp sáng (bậc cao,
   *   nâng vài cent, tắt nhanh) + tiếng búa và tiếng giảm chấn (đi thẳng ra) → bộ đặt trái/phải dùng chung.
   *   9–10 nút/nốt (≤ 1,5 × mô hình cũ 7 nút); 3 nút khi đã có ≥ 8 nốt chồng nhau (chế độ nhẹ, như cũ).
   * 'classic': tiếng cũ, 7 nút (3 nút chế độ nhẹ).
   * Thời điểm im hẳn (tEnd) giữ như cũ (trừ dây cao không giảm chấn — dài hơn ≤ 0,25 s) → mốc micro không đổi.
   * track=false: không tính là "app đang phát" (để micro vẫn nghe được) — dùng cho bè đệm xa cao độ.
   */
  scheduleFreq(freq: number, when: number, duration = 0.9, volume = 1, track = true): Promise<void> {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return Promise.resolve();
    const warm = this.voiceModel === 'warm';
    const start = Math.max(when, ctx.currentTime);
    const wp = warm ? warmVoiceParams(freq, volume, duration) : null;
    const p = wp ?? voiceParams(freq, volume, duration);
    const end = start + p.tEnd;
    let overlapping = 0;
    for (const v of this.allVoices) if (v.t0 <= start + 1e-6 && v.t1 > start) overlapping++;
    const light = overlapping >= LIGHT_VOICE_THRESHOLD;
    const wave = this.waveFor(ctx, freq, warm ? 'body' : 'classic');
    const out = (wp ? this.warmOut(wp.pan) : this.classicBus(ctx)) ?? master;

    const env = ctx.createGain();
    applyEvents(env.gain, gainEvents(p), start);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0;
    applyEvents(lp.frequency, cutoffEvents(p), start);
    lp.connect(env);
    env.connect(out);

    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [env, lp];
    const fades: GainNode[] = [];
    const addString = (f: number, gain: number): void => {
      const osc = ctx.createOscillator();
      if (wave) osc.setPeriodicWave(wave);
      else osc.type = 'triangle';
      osc.frequency.value = f;
      if (gain === 1) osc.connect(lp);
      else {
        const g = ctx.createGain();
        g.gain.value = gain;
        osc.connect(g);
        g.connect(lp);
        nodes.push(g);
      }
      osc.start(start);
      osc.stop(end + 0.02);
      sources.push(osc);
      nodes.push(osc);
    };
    addString(freq, 1);
    if (!light) {
      addString(freq * Math.pow(2, p.detuneCents / 1200), p.string2Gain);
      // Lớp sáng (mô hình ấm): bậc cao, hơi nâng cao (không hòa âm), tắt nhanh — đi thẳng ra, không qua lọc
      const bright = wp && wp.brightGain > 0 ? this.waveFor(ctx, freq, 'bright') : null;
      if (wp && bright) {
        const ev = brightEvents(wp);
        const osc = ctx.createOscillator();
        osc.setPeriodicWave(bright);
        osc.frequency.value = freq * Math.pow(2, wp.brightCents / 1200);
        const g = ctx.createGain();
        applyEvents(g.gain, ev, start);
        osc.connect(g);
        g.connect(out);
        osc.start(start);
        osc.stop(Math.min(end, start + ev[ev.length - 1].t + 0.01));
        sources.push(osc);
        nodes.push(osc, g);
        fades.push(g);
      }
      const nb = p.thumpGain > 0 ? this.noise(ctx) : null;
      if (nb) {
        const src = ctx.createBufferSource();
        src.buffer = nb;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(p.thumpGain, start + 0.002);
        g.gain.setTargetAtTime(0, start + 0.002, p.thumpTau);
        src.connect(g);
        // Cũ: búa qua lọc + bao biên. Ấm: búa đi thẳng ra (mức đã nhân sẵn mức đỉnh nốt)
        g.connect(wp ? out : lp);
        // Lệch điểm đọc theo phím → các nốt trong hợp âm không trùng nhiễu
        src.start(start, (Math.round(freq * 7) % 40) / 1000);
        src.stop(start + Math.min(0.08, p.tEnd));
        sources.push(src);
        nodes.push(src, g);
        if (wp) fades.push(g);
        // Tiếng giảm chấn lúc nhả phím sớm: nhiễu trầm rất khẽ, dùng chung gain của búa
        if (wp && wp.damperGain > 0) {
          const t = start + wp.tOff;
          const d = ctx.createBufferSource();
          d.buffer = nb;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(wp.damperGain, t + 0.004);
          g.gain.setTargetAtTime(0, t + 0.004, 0.015);
          d.connect(g);
          d.start(t, 0.03 + (Math.round(freq * 3) % 30) / 1000);
          d.stop(Math.min(end, t + 0.07));
          sources.push(d);
          nodes.push(d);
        }
      }
    }

    const st = this._stats;
    st.notes++;
    st.lastNoteNodes = nodes.length;
    if (light) st.lightNotes++;
    const voice: Voice = { env, fades, sources, nodes, t0: start, t1: end };
    if (track) this.voices.add(voice);
    this.allVoices.add(voice);
    let live = 0;
    for (const v of this.allVoices) live += v.nodes.length;
    if (live > st.peakNodes) st.peakNodes = live;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.allVoices.delete(voice);
        if (track) {
          this.voices.delete(voice);
          this.lastSoundEnd = Date.now() + REVERB_GUARD_MS;
        }
        try {
          nodes.forEach((n) => n.disconnect());
        } catch {
          /* bỏ qua */
        }
        resolve();
      };
      sources[0].onended = finish;
      // Phòng khi context bị treo (onended không bao giờ tới).
      setTimeout(finish, (end - ctx.currentTime) * 1000 + 250);
    });
  }

  /**
   * Tiếng gõ nhịp (metronome): tiếng "ting" sin rất ngắn ở 5 kHz (phách mạnh: 6 kHz, to hơn) — rõ, không chói.
   * Cao hẳn trên dải micro nghe đàn: bộ lọc bậc 4 của micAnalyzer chặn > 40 dB → micro KHÔNG cần bỏ qua khung có tiếng tích,
   * bé gõ phím đúng phách vẫn được nghe & chấm giờ chính xác.
   * `accent`: true = phách mạnh · 'secondary' = phách nhấn phụ (5,5 kHz, to vừa — vd phách 4 của 6/8) · false = phách thường.
   */
  click(when: number, accent: boolean | 'secondary' = false): void {
    const ctx = this.ctx;
    const master = this.dry ?? this.master;
    if (!ctx || !master) return;
    const t = Math.max(when, ctx.currentTime);
    this.clickTimes = this.clickTimes.filter((c) => c > ctx.currentTime - 1);
    this.clickTimes.push(t);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = accent === 'secondary' ? CLICK.secondaryHz : accent ? CLICK.accentHz : CLICK.hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent === 'secondary' ? CLICK.secondaryGain : accent ? CLICK.accentGain : CLICK.normalGain, t + CLICK.attack);
    g.gain.setTargetAtTime(0, t + CLICK.attack, CLICK.tau);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + CLICK.length);
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

  /**
   * Tiếng "tinh" ngắn để ĐO ĐỘ TRỄ loa → micro (latency.ts): Đô5 + họa âm, lên ~2 ms.
   * KHÔNG dùng tiếng tích (≥ 5 kHz bị bộ lọc micro chặn). Không tính là "app đang phát" để micro vẫn bắt lần gõ.
   */
  ping(when: number): void {
    const ctx = this.ctx;
    const master = this.dry ?? this.master;
    if (!ctx || !master) return;
    const t = Math.max(when, ctx.currentTime);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(PING.gain, t + PING.attack);
    g.gain.setTargetAtTime(0, t + PING.attack, PING.tau);
    g.connect(master);
    const oscs = [1, 2].map((k) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = PING.hz * k;
      const og = ctx.createGain();
      og.gain.value = k === 1 ? 1 : 0.5;
      osc.connect(og);
      og.connect(g);
      osc.start(t);
      osc.stop(t + PING.length);
      return { osc, og };
    });
    oscs[0].osc.onended = () => {
      try {
        oscs.forEach(({ osc, og }) => (osc.disconnect(), og.disconnect()));
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

  /**
   * Tiếng phát NGOÀI bộ tổng hợp (vd "Nghe lại con đàn" — recorder.ts): đánh dấu app đang phát để micro bỏ qua.
   * Trả về hàm thả (gọi nhiều lần không sao). `stop` (tùy chọn) được gọi khi stopAll() — rời màn là tắt tiếng.
   */
  holdBusy(stop?: () => void): () => void {
    this.busyCount++;
    let done = false;
    const entry = { stop: stop ?? (() => undefined) };
    const release = () => {
      if (done) return;
      done = true;
      this.externals.delete(entry);
      this.lastSoundEnd = Date.now() + REVERB_GUARD_MS;
      this.busyCount--;
      if (this.busyCount === 0) {
        const w = this.idleWaiters;
        this.idleWaiters = [];
        w.forEach((fn) => fn());
      }
    };
    entry.stop = () => {
      try {
        stop?.();
      } catch {
        /* bỏ qua */
      }
      release();
    };
    this.externals.add(entry);
    return release;
  }

  /** Resolve khi không còn âm mẫu nào đang phát. */
  whenIdle(): Promise<void> {
    if (this.busyCount === 0) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  /**
   * Có tiếng tích trong khoảng [t − before, t + after] không (giây, đồng hồ AudioContext).
   * (Tiếng tích ≥ 5 kHz giờ bị bộ lọc micro chặn — micro không còn dùng hàm này để bịt tai; giữ để chẩn đoán.)
   */
  clickNear(t: number, before: number, after: number): boolean {
    return this.clickTimes.some((c) => c >= t - before && c <= t + after);
  }

  /** Độ trễ loa (giây) — bé đàn theo tiếng tích NGHE THẤY, trễ hơn lúc hẹn. */
  get outputLatency(): number {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    return c ? (c.outputLatency || c.baseLatency || 0) : 0;
  }

  stopAll(): void {
    this.generation++;
    for (const e of [...this.externals]) e.stop();
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
    this.clickTimes = [];
    for (const v of this.allVoices) {
      const g = v.env.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
      try {
        if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(now);
        else {
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
        }
        g.setTargetAtTime(0, now, 0.012); // tắt nhanh nhưng không "tách"
        for (const f of v.fades) {
          const fg = f.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
          if (typeof fg.cancelAndHoldAtTime === 'function') fg.cancelAndHoldAtTime(now);
          else fg.cancelScheduledValues(now);
          fg.setTargetAtTime(0, now, 0.012);
        }
        for (const s of v.sources) s.stop(now + 0.08);
      } catch {
        /* bỏ qua */
      }
    }
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
