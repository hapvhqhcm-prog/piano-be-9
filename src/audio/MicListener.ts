import type { AudioEngine } from './AudioEngine';
import { DEFAULT_DETECT, NoteTracker, detectPitch, type HeardNote, type PitchResult } from './pitchDetect';

/**
 * Micro nghe đàn cơ (OWNER mở khóa ARCHITECTURE LOCK ngày 2026-10-04).
 * - Xử lý ngay trên iPad, KHÔNG ghi âm, KHÔNG gửi đi đâu, chạy offline.
 * - Tắt lọc tiếng vọng/giảm ồn/tự chỉnh âm lượng để giữ nguyên cao độ.
 * - Bỏ qua khi chính app đang phát tiếng (âm mẫu, phím ảo) để không tự "nghe" mình.
 */
export type MicState = 'off' | 'starting' | 'on' | 'denied' | 'unsupported' | 'error';

export interface MicFrame {
  pitch: PitchResult | null;
  level: number;
}

export class MicListener {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private timer: number | undefined;
  private tracker = new NoteTracker(3);
  private noteListeners = new Set<(n: HeardNote) => void>();
  private frameListeners = new Set<(f: MicFrame) => void>();
  private stateListeners = new Set<(s: MicState) => void>();
  private _state: MicState = 'off';
  /** Bù độ lệch dây của đàn nhà (cents), lấy từ Cài đặt. */
  tuningCents = 0;
  /** Bỏ qua thêm bao lâu sau khi app im (tiếng vang trong phòng). */
  quietMarginMs = 250;

  constructor(private readonly audio: AudioEngine) {}

  get state(): MicState {
    return this._state;
  }

  static get supported(): boolean {
    const md = globalThis.navigator?.mediaDevices as MediaDevices | undefined;
    return typeof md?.getUserMedia === 'function' && globalThis.isSecureContext === true;
  }

  private setState(s: MicState): void {
    this._state = s;
    this.stateListeners.forEach((fn) => fn(s));
  }

  onState(fn: (s: MicState) => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  onNote(fn: (n: HeardNote) => void): () => void {
    this.noteListeners.add(fn);
    return () => this.noteListeners.delete(fn);
  }

  onFrame(fn: (f: MicFrame) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  /** Bỏ trạng thái nốt đang ngân — gọi khi bắt đầu chờ một nốt mới. */
  resetTracker(): void {
    // Nốt cũ còn ngân không được tính cho nốt mới
    this.tracker.reset(true);
  }

  /** Nên gọi trong thao tác chạm (iPad hỏi quyền micro ở lần đầu). */
  async start(): Promise<MicState> {
    if (this._state === 'on' || this._state === 'starting') return this._state;
    if (!MicListener.supported) {
      this.setState('unsupported');
      return this._state;
    }
    const ctx = this.audio.context;
    if (!ctx) {
      this.setState('error');
      return this._state;
    }
    this.setState('starting');
    try {
      this.audio.setAudioSessionType('play-and-record');
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
    } catch (e) {
      this.audio.setAudioSessionType('playback');
      const name = (e as { name?: string })?.name;
      this.setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      return this._state;
    }
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.buf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    // KHÔNG nối ra loa → không có tiếng hú
    this.source.connect(this.analyser);
    this.tracker.reset();
    this.timer = window.setInterval(() => this.tick(), 40);
    this.setState('on');
    return this._state;
  }

  private tick(): void {
    const analyser = this.analyser;
    const buf = this.buf;
    const ctx = this.audio.context;
    if (!analyser || !buf || !ctx) return;
    analyser.getFloatTimeDomainData(buf);
    const appQuiet = this.audio.msSinceSound() > this.quietMarginMs;
    const pitch = appQuiet ? detectPitch(buf, ctx.sampleRate, DEFAULT_DETECT) : null;
    let level = 0;
    for (let i = 0; i < buf.length; i += 4) level = Math.max(level, Math.abs(buf[i]));
    this.frameListeners.forEach((fn) => fn({ pitch, level }));
    if (!appQuiet) {
      this.tracker.reset(true);
      return;
    }
    const note = this.tracker.push(pitch, this.tuningCents);
    if (note) this.noteListeners.forEach((fn) => fn(note));
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
    try {
      this.source?.disconnect();
    } catch {
      /* bỏ qua */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.buf = null;
    if (this._state === 'on' || this._state === 'starting') {
      this.audio.setAudioSessionType('playback');
      this.setState('off');
    }
  }
}
