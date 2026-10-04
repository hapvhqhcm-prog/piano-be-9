import type { AudioEngine } from './AudioEngine';
import { MicAnalyzer, type AppSound, type Sensitivity } from './micAnalyzer';
import type { HeardNote, PitchResult } from './pitchDetect';

/**
 * Micro nghe đàn cơ (OWNER mở khóa ARCHITECTURE LOCK ngày 2026-10-04).
 * - Xử lý ngay trên iPad, KHÔNG ghi âm, KHÔNG gửi đi đâu, chạy offline.
 * - Tắt lọc tiếng vọng/giảm ồn/tự chỉnh âm lượng để giữ nguyên cao độ.
 * - Bỏ qua khi chính app đang phát tiếng (âm mẫu, phím ảo) để không tự "nghe" mình.
 */
export type MicState = 'off' | 'starting' | 'on' | 'denied' | 'unsupported' | 'error';

export interface MicFrame {
  pitch: PitchResult | null;
  /** Biên độ đỉnh (thô) */
  level: number;
  /** Âm lượng sau lọc, mức ồn nền, ngưỡng nhận tiếng đàn */
  rms: number;
  floor: number;
  gate: number;
  onset: boolean;
  app: AppSound;
}

export class MicListener {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private timer: number | undefined;
  private analyzer = new MicAnalyzer();
  private lastClapAt = -1;
  private noteListeners = new Set<(n: HeardNote) => void>();
  private onsetListeners = new Set<(atCtxTime: number) => void>();
  private frameListeners = new Set<(f: MicFrame) => void>();
  private stateListeners = new Set<(s: MicState) => void>();
  private _state: MicState = 'off';
  /** Tăng mỗi lần stop() — để start() đang chờ getUserMedia biết là đã bị hủy */
  private gen = 0;
  /** Bỏ qua cao độ thêm bao lâu sau khi app im (tiếng vang trong phòng). */
  quietMarginMs = 200;

  /** Bù độ lệch dây của đàn nhà (cents), lấy từ Cài đặt. */
  get tuningCents(): number {
    return this.analyzer.tuningCents;
  }
  set tuningCents(c: number) {
    this.analyzer.tuningCents = c;
  }
  get sensitivity(): Sensitivity {
    return this.analyzer.sensitivity;
  }
  set sensitivity(s: Sensitivity) {
    this.analyzer.sensitivity = s;
  }

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

  /**
   * Tiếng gõ/vỗ tay (âm lượng bật lên đột ngột) — dùng để chấm VỖ NHỊP.
   * Trả về thời điểm theo đồng hồ AudioContext (đã trừ độ trễ ước tính).
   */
  onOnset(fn: (atCtxTime: number) => void): () => void {
    this.onsetListeners.add(fn);
    return () => this.onsetListeners.delete(fn);
  }

  onFrame(fn: (f: MicFrame) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  /** Bỏ trạng thái nốt đang ngân — gọi khi bắt đầu chờ một nốt mới. */
  resetTracker(): void {
    // Nốt cũ còn ngân không được tính cho nốt mới
    this.analyzer.reset(true);
  }

  /** Nên gọi trong thao tác chạm (iPad hỏi quyền micro ở lần đầu). */
  async start(): Promise<MicState> {
    if (this._state === 'starting') return this._state;
    if (this._state === 'on') {
      // iOS có thể đã cắt micro (khóa màn hình, chuyển app, cuộc gọi) mà không báo → kiểm tra track còn sống
      if (this.stream?.getAudioTracks().some((t) => t.readyState === 'live')) return this._state;
      this.stop();
    }
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
    const myGen = this.gen;
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
    if (myGen !== this.gen) {
      // stop() đã được gọi trong lúc chờ → tắt micro ngay, không để micro mở ngầm
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.audio.setAudioSessionType('playback');
      return 'off';
    }
    // iOS cắt micro (khóa màn hình, cuộc gọi…) → báo 'off' để lần chạm sau bật lại, không "điếc" mãi
    for (const tr of this.stream.getAudioTracks()) tr.onended = () => myGen === this.gen && this.stop();
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.buf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    // KHÔNG nối ra loa → không có tiếng hú
    this.source.connect(this.analyser);
    this.analyzer.reset(false);
    this.timer = window.setInterval(() => this.tick(), 25);
    this.setState('on');
    return this._state;
  }

  private tick(): void {
    const analyser = this.analyser;
    const buf = this.buf;
    const ctx = this.audio.context;
    if (!analyser || !buf || !ctx) return;
    analyser.getFloatTimeDomainData(buf);
    const since = this.audio.msSinceSound();
    const now = ctx.currentTime;
    // Khung 43 ms có chứa tiếng tích (dài ~35 ms, tới micro trễ thêm độ trễ loa) → bỏ qua
    const clickWin = 0.09 + this.audio.outputLatency;
    const app: AppSound = this.audio.isSounding
      ? 'sounding'
      : this.audio.clickNear(now, clickWin, 0.01)
        ? 'click'
        : since < this.quietMarginMs
          ? 'tail'
          : 'quiet';
    const f = this.analyzer.process(buf, ctx.sampleRate, now, app);
    // "Gõ/vỗ" (chấm vỗ nhịp): mốc thời gian lùi ~nửa cửa sổ phân tích + nửa bước
    if (f.onset && ctx.currentTime - this.lastClapAt > 0.15) {
      this.lastClapAt = ctx.currentTime;
      const at = ctx.currentTime - 0.035;
      this.onsetListeners.forEach((fn) => fn(at));
    }
    this.frameListeners.forEach((fn) =>
      fn({ pitch: f.pitch, level: f.level, rms: f.rms, floor: f.floor, gate: f.gate, onset: f.onset, app }),
    );
    if (f.note) {
      const n = f.note;
      this.noteListeners.forEach((fn) => fn(n));
    }
  }

  stop(): void {
    this.gen++;
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

/** Độ dài thanh âm lượng (0–100): theo thang log, NGƯỠNG NHẬN TIẾNG ĐÀN nằm ở giữa (50%). */
export function meterPct(f: Pick<MicFrame, 'rms' | 'gate'>): number {
  if (f.rms <= 0 || f.gate <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(50 + 15 * Math.log2(f.rms / f.gate))));
}
