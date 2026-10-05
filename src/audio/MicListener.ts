import type { AudioEngine, EngineState } from './AudioEngine';
import { MicAnalyzer, type AppSound, type Sensitivity } from './micAnalyzer';
import type { HeardNote, PitchResult } from './pitchDetect';

/**
 * Micro nghe đàn cơ (OWNER mở khóa ARCHITECTURE LOCK ngày 2026-10-04).
 * - Xử lý ngay trên iPad, KHÔNG ghi âm, KHÔNG gửi đi đâu, chạy offline.
 * - Tắt lọc tiếng vọng/giảm ồn/tự chỉnh âm lượng để giữ nguyên cao độ.
 * - Bỏ qua khi chính app đang phát tiếng (âm mẫu, phím ảo) để không tự "nghe" mình.
 *   Tiếng tích máy đếm nhịp (≥ 5 kHz) bị bộ lọc chặn → KHÔNG bịt tai micro lúc có tiếng tích nữa.
 * - iOS hay làm micro "điếc" mà không báo (cuộc gọi, Siri, khóa màn hình, chuyển app): track bị 'mute',
 *   AudioContext 'interrupted', hoặc bộ đệm đứng yên. Mọi trường hợp → tắt micro, `needsRestart = true`,
 *   báo trạng thái 'off' (giao diện hiện micro tắt); App bật lại ở lần chạm kế tiếp (ensureMic).
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

/** Bộ đệm micro đứng yên (toàn 0 hoặc y hệt khung trước) bao lâu thì coi là micro đã "điếc". */
export const MIC_STALE_MS = 1000;
/** Track bị iOS 'mute' bao lâu (không tự 'unmute') thì coi là điếc. */
export const MIC_MUTE_GRACE_MS = 1000;
/** Số mẫu lấy làm "chữ ký" để nhận ra bộ đệm y hệt khung trước. */
const PROBES = 8;

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
  /** Tăng mỗi lần dừng — để start() đang chờ getUserMedia / hẹn giờ cũ biết là đã bị hủy */
  private gen = 0;
  private _needsRestart = false;
  /** Watchdog: chữ ký khung trước + lúc bắt đầu đứng yên (ms, −1 = không) */
  private probe = new Float32Array(PROBES);
  private staleSince = -1;
  private muteTimer: ReturnType<typeof setTimeout> | undefined;
  private onVisibility: (() => void) | null = null;
  /** Bỏ qua cao độ thêm bao lâu sau khi app im (tiếng vang trong phòng). */
  quietMarginMs = 200;
  /**
   * Bịt tai quanh tiếng tích máy đếm nhịp (ms). 0 = không bịt (mặc định: lọc bậc 4 đã chặn tiếng tích > 40 dB,
   * xem tests/micClick.test.ts). Chỉ tăng lên nếu loa/micro của một máy cụ thể làm tiếng tích lọt vào.
   */
  clickBlankMs = 0;
  /** Đồng hồ (ms) cho watchdog — tiêm vào để test; KHÔNG dùng ctx.currentTime vì nó đứng yên khi bị ngắt. */
  clock: () => number = () => Date.now();

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

  constructor(private readonly audio: AudioEngine) {
    // AudioContext bị iOS ngắt (cuộc gọi, Siri, báo thức…) → nguồn micro không còn chạy → coi là điếc
    audio.onStateChange?.((s: EngineState) => {
      if ((this._state === 'on' || this._state === 'starting') && (s === 'interrupted' || s === 'suspended' || s === 'closed')) {
        this.markDeaf();
      }
    });
  }

  get state(): MicState {
    return this._state;
  }

  /**
   * Micro đã bị iOS cắt ngầm và được tắt để bật lại — gọi start() (App.ensureMic) trong thao tác chạm kế tiếp.
   * Tự xóa khi start() thành công hoặc khi màn hình gọi stop() (không cần micro nữa).
   */
  get needsRestart(): boolean {
    return this._needsRestart;
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
   * Trả về thời điểm theo đồng hồ AudioContext (định vị trong khung phân tích, chính xác ~±5 ms).
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

  /** Micro còn nghe được thật không: track sống, không bị iOS 'mute', AudioContext đang chạy. */
  private healthy(): boolean {
    const tracks = this.stream?.getAudioTracks() ?? [];
    const live = tracks.some((t) => t.readyState === 'live' && !t.muted);
    return live && this.audio.context?.state === 'running';
  }

  /** Nên gọi trong thao tác chạm (iPad hỏi quyền micro ở lần đầu; bật lại AudioContext sau khi bị ngắt). */
  async start(): Promise<MicState> {
    if (this._state === 'starting') return this._state;
    if (this._state === 'on') {
      // iOS có thể đã cắt micro (khóa màn hình, chuyển app, cuộc gọi) mà không báo → kiểm tra track còn sống
      if (!this._needsRestart && this.healthy()) return this._state;
      this.teardown();
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
    let stream: MediaStream;
    try {
      this.audio.setAudioSessionType('play-and-record');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
    } catch (e) {
      if (myGen !== this.gen) return this._state;
      this.audio.setAudioSessionType('playback');
      const name = (e as { name?: string })?.name;
      this.setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      return this._state;
    }
    if (myGen !== this.gen) {
      // stop() đã được gọi trong lúc chờ → tắt micro ngay, không để micro mở ngầm
      stream.getTracks().forEach((t) => t.stop());
      return this._state;
    }
    this.stream = stream;
    for (const tr of stream.getAudioTracks()) {
      // iOS cắt micro hẳn → báo 'off' + cần bật lại, không "điếc" mãi
      tr.onended = () => myGen === this.gen && this.markDeaf();
      // iOS 'mute' track khi bị ngắt (cuộc gọi, Siri, app khác dùng micro); thường tự 'unmute' — chờ một chút
      tr.onmute = () => {
        if (myGen !== this.gen) return;
        clearTimeout(this.muteTimer);
        this.muteTimer = setTimeout(() => {
          if (myGen === this.gen && tr.muted) this.markDeaf();
        }, MIC_MUTE_GRACE_MS);
      };
      tr.onunmute = () => {
        if (myGen === this.gen) clearTimeout(this.muteTimer);
      };
    }
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    if (myGen !== this.gen) {
      stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      return this._state;
    }
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.buf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    // KHÔNG nối ra loa → không có tiếng hú
    this.source.connect(this.analyser);
    this.analyzer.reset(false);
    this.probe.fill(NaN);
    this.staleSince = -1;
    this.timer = window.setInterval(() => this.tick(), 25);
    // Quay lại app (sau khi chuyển app / khóa màn hình): micro còn nghe thật không?
    if (typeof document !== 'undefined' && !this.onVisibility) {
      this.onVisibility = () => {
        if (document.visibilityState === 'visible' && this._state === 'on' && !this.healthy()) this.markDeaf();
      };
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    this._needsRestart = false;
    this.setState('on');
    return this._state;
  }

  /** Micro bị cắt ngầm → tắt hẳn, đánh dấu cần bật lại ở lần chạm sau, báo 'off'. */
  private markDeaf(): void {
    if (this._state !== 'on' && this._state !== 'starting') return;
    this._needsRestart = true;
    this.teardown();
  }

  /** Watchdog: bộ đệm toàn 0 hoặc y hệt khung trước (nguồn micro đã ngừng chạy) quá MIC_STALE_MS. */
  private checkStale(buf: Float32Array): boolean {
    const n = buf.length;
    let same = true;
    let zero = true;
    for (let k = 0; k < PROBES; k++) {
      const v = buf[Math.floor(((k + 0.5) * n) / PROBES)];
      if (v !== this.probe[k]) same = false;
      if (v !== 0) zero = false;
      this.probe[k] = v;
    }
    if (zero && !same) {
      // chỉ vài mẫu = 0 thì chưa chắc → kiểm tra cả khung
      for (let i = 0; i < n; i++) {
        if (buf[i] !== 0) {
          zero = false;
          break;
        }
      }
    }
    if (!same && !zero) {
      this.staleSince = -1;
      return false;
    }
    const now = this.clock();
    if (this.staleSince < 0) this.staleSince = now;
    if (now - this.staleSince > MIC_STALE_MS) {
      this.markDeaf();
      return true;
    }
    return false;
  }

  private tick(): void {
    const analyser = this.analyser;
    const buf = this.buf;
    const ctx = this.audio.context;
    if (!analyser || !buf || !ctx) return;
    analyser.getFloatTimeDomainData(buf);
    if (this.checkStale(buf)) return;
    const since = this.audio.msSinceSound();
    const now = ctx.currentTime;
    const app: AppSound = this.audio.isSounding
      ? 'sounding'
      : this.clickBlankMs > 0 && this.audio.clickNear(now, this.clickBlankMs / 1000 + this.audio.outputLatency, 0.01)
        ? 'click'
        : since < this.quietMarginMs
          ? 'tail'
          : 'quiet';
    // Không ai cần cao độ (vd chỉ chấm vỗ nhịp) → bỏ YIN, đỡ CPU iPad cũ
    const needPitch = this.noteListeners.size > 0 || this.frameListeners.size > 0;
    const f = this.analyzer.process(buf, ctx.sampleRate, now, app, needPitch);
    // "Gõ/vỗ" (chấm vỗ nhịp): mốc thời gian định vị trong khung phân tích
    if (f.onset && now - this.lastClapAt > 0.15) {
      this.lastClapAt = now;
      const at = f.onsetAt >= 0 ? Math.min(now, f.onsetAt) : now - 0.035;
      this.onsetListeners.forEach((fn) => fn(at));
    }
    if (this.frameListeners.size) {
      const frame: MicFrame = { pitch: f.pitch, level: f.level, rms: f.rms, floor: f.floor, gate: f.gate, onset: f.onset, app };
      this.frameListeners.forEach((fn) => fn(frame));
    }
    if (f.note) {
      const n = f.note;
      this.noteListeners.forEach((fn) => fn(n));
    }
  }

  /** Màn hình không cần micro nữa: tắt hẳn (và thôi tự bật lại). */
  stop(): void {
    this._needsRestart = false;
    this.teardown();
  }

  private teardown(): void {
    this.gen++;
    window.clearInterval(this.timer);
    this.timer = undefined;
    clearTimeout(this.muteTimer);
    this.muteTimer = undefined;
    if (this.onVisibility && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.onVisibility = null;
    try {
      this.source?.disconnect();
    } catch {
      /* bỏ qua */
    }
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.onmute = null;
      t.onunmute = null;
      t.stop();
    });
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
