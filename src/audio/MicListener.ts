import type { AudioEngine, EngineState } from './AudioEngine';
import { analyzeChord, CHORD_FRAME, CHORD_READY_AFTER, type ChordResult } from './chordVerify';
import { MicAnalyzer, type AppSound, type Sensitivity } from './micAnalyzer';
import { SensitivityAdvisor, type AutoSensChange } from './micAutoSens';
import type { HeardNote, PitchResult } from './pitchDetect';

/**
 * Micro nghe đàn cơ (OWNER mở khóa ARCHITECTURE LOCK ngày 2026-10-04).
 * - Xử lý ngay trên iPad, KHÔNG gửi đi đâu, chạy offline. Không ghi âm — TRỪ "Nghe lại con đàn" (recorder.ts,
 *   OWNER duyệt 2026-10-06): ghi tạm trong bộ nhớ khi bé bấm, rời màn là xóa, không lưu/gửi.
 * - Tắt lọc tiếng vọng/giảm ồn/tự chỉnh âm lượng/tách giọng để giữ nguyên tiếng đàn. iOS có thể vẫn ÉP bật
 *   (track.getSettings() cho biết) → `trackInfo()` báo lại để màn "Thử micro" ghi vào nhật ký.
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
/** Thông tin micro THẬT SỰ được áp dụng (để nhật ký chẩn đoán). */
export interface MicTrackInfo {
  /** Bộ lọc xử lý giọng nói mà trình duyệt báo là đang BẬT (undefined = trình duyệt không báo) */
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  voiceIsolation?: boolean;
  sampleRate?: number;
  channelCount?: number;
  latency?: number;
  /** Phải xin lại micro bằng { audio: true } vì trình duyệt từ chối các tùy chọn tắt lọc */
  fallback: boolean;
  /** Các bộ lọc bị ÉP bật dù app xin tắt (vd ['autoGainControl']) */
  forced: string[];
}

/** Thống kê từ lúc bật micro (nhật ký chẩn đoán): khung bị trễ = iPad bận / hẹn giờ bị dồn. */
export interface MicStats {
  frames: number;
  /** Khoảng cách lớn nhất giữa 2 khung (ms) — thiết kế 25 ms */
  maxGapMs: number;
  /** Số lần hai khung cách nhau > 60 ms */
  slowGaps: number;
  onsets: number;
  notes: number;
  /** Số khung bỏ qua vì app đang phát tiếng */
  appFrames: number;
  /** Số lần "suýt nghe" (tiếng có cao độ rõ nhưng dưới ngưỡng — đàn khẽ quá với độ nhạy đang dùng) */
  nearMisses: number;
}

/** Tùy chọn xin micro: tắt mọi xử lý giọng nói (giữ nguyên tiếng đàn). voiceIsolation: Safari/Chrome mới. */
export const MIC_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  voiceIsolation: false,
  channelCount: { ideal: 1 },
} as MediaTrackConstraints;

const PROCESSING_KEYS = ['echoCancellation', 'noiseSuppression', 'autoGainControl', 'voiceIsolation'] as const;

/** Đọc track.getSettings() an toàn (thiết bị/đối tượng giả có thể không có). */
export function readTrackInfo(track: MediaStreamTrack | undefined, fallback: boolean): MicTrackInfo {
  let st: Record<string, unknown> = {};
  try {
    st = (track?.getSettings?.() ?? {}) as Record<string, unknown>;
  } catch {
    /* bỏ qua */
  }
  const bool = (k: string) => (typeof st[k] === 'boolean' ? (st[k] as boolean) : undefined);
  const num = (k: string) => (typeof st[k] === 'number' ? (st[k] as number) : undefined);
  const info: MicTrackInfo = {
    echoCancellation: bool('echoCancellation'),
    noiseSuppression: bool('noiseSuppression'),
    autoGainControl: bool('autoGainControl'),
    voiceIsolation: bool('voiceIsolation'),
    sampleRate: num('sampleRate'),
    channelCount: num('channelCount'),
    latency: num('latency'),
    fallback,
    forced: [],
  };
  info.forced = PROCESSING_KEYS.filter((k) => info[k] === true);
  return info;
}

/** Số mẫu lấy làm "chữ ký" để nhận ra bộ đệm y hệt khung trước. */
const PROBES = 8;
/** Khung phân tích cao độ / gõ phím (mẫu) — MicAnalyzer luôn nhận 2048 mẫu gần nhất. */
export const ANALYSIS_FRAME = 2048;
/**
 * Bộ đệm lấy từ AnalyserNode (mẫu): ~0,34 s ở 48 kHz — đủ để kiểm tra hợp âm (cần [gõ + 50 ms, gõ + 200 ms])
 * kể cả khi màn hình hỏi chậm vài khung. Chép 16384 số mỗi 25 ms là rất nhẹ.
 */
export const HISTORY_SIZE = 16384;

interface ChordRequest {
  midis: number[];
  onsetAt: number;
  resolve: (r: ChordResult | null) => void;
}

export class MicListener {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private timer: number | undefined;
  private analyzer = new MicAnalyzer();
  private lastClapAt = -1;
  private usedFallback = false;
  private lastTickAt = -1;
  private _stats: MicStats = MicListener.emptyStats();
  private noteListeners = new Set<(n: HeardNote) => void>();
  private onsetListeners = new Set<(atCtxTime: number) => void>();
  private frameListeners = new Set<(f: MicFrame) => void>();
  private stateListeners = new Set<(s: MicState) => void>();
  private autoSensListeners = new Set<(c: AutoSensChange) => void>();
  private advisor = new SensitivityAdvisor();
  /**
   * Tự tăng độ nhạy MỘT bậc khi bé đàn khẽ nhiều lần không nghe được (micAutoSens.ts). Màn "Cài micro" tắt đi
   * trong lúc kiểm tra (phụ huynh chỉnh tay / bài 5 nốt tự chỉnh).
   */
  autoSensitivity = true;
  /** App đang đọc to (giọng đọc không đi qua AudioEngine) → không tính "suýt nghe". App gán = speechBusy. */
  externalBusy: () => boolean = () => false;
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
  /**
   * Độ trễ khứ hồi loa → micro đã ĐO (ms, màn "Thử micro" → "Đo độ trễ"); 0 = chưa đo. App gán từ Cài đặt.
   */
  latencyMs = 0;
  /** Lần gõ phím gần nhất (đồng hồ AudioContext, giây); −1 = chưa có */
  private lastOnsetAt = -1;
  private chordRequests: ChordRequest[] = [];
  /** Thời điểm (đồng hồ AudioContext) của mẫu cuối trong `buf` — lúc lấy bộ đệm gần nhất */
  private bufTime = 0;
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

  private static emptyStats(): MicStats {
    return { frames: 0, maxGapMs: 0, slowGaps: 0, onsets: 0, notes: 0, appFrames: 0, nearMisses: 0 };
  }

  /** Luồng micro đang mở (null khi tắt) — recorder.ts ghi "Nghe lại con đàn" từ đây (cùng luồng, không ảnh hưởng nhận nốt). */
  get mediaStream(): MediaStream | null {
    return this._state === 'on' ? this.stream : null;
  }

  /** Bộ âm thanh dùng chung (recorder.ts phát lại qua đây → micro biết app đang phát, không tự nghe mình). */
  get engine(): AudioEngine {
    return this.audio;
  }

  /** Bộ lọc thật sự được áp dụng cho micro (null khi micro tắt). Đọc lại mỗi lần gọi (iOS có thể đổi khi phát tiếng). */
  trackInfo(): MicTrackInfo | null {
    const tr = this.stream?.getAudioTracks()[0];
    return tr ? readTrackInfo(tr, this.usedFallback) : null;
  }

  /** Micro vừa TỰ tăng độ nhạy (một bậc) — App lưu Cài đặt, ghi nhật ký, báo phụ huynh. */
  onAutoSensitivity(fn: (c: AutoSensChange) => void): () => void {
    this.autoSensListeners.add(fn);
    return () => this.autoSensListeners.delete(fn);
  }

  /** Thống kê từ lần bật micro gần nhất. */
  get stats(): MicStats {
    return { ...this._stats };
  }

  /** Mức ồn nền đang trong 2 giây "làm quen phòng". */
  get warmingUp(): boolean {
    return this.analyzer.warmingUp;
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

  /**
   * Độ trễ cần trừ khi chấm NHỊP (giây): bé đàn theo tiếng tích nghe thấy (trễ loa), tiếng đàn tới app trễ thêm (micro).
   * Đã đo (latencyMs > 0) → dùng số đo; chưa đo → ước lượng của trình duyệt (outputLatency) như trước.
   */
  inputOutputLatency(): number {
    return this.latencyMs > 0 ? this.latencyMs / 1000 : this.audio.outputLatency;
  }

  /**
   * KIỂM TRA HỢP ÂM: trong tiếng đàn ở lần gõ `onsetAt` (mặc định: lần gõ gần nhất) có đủ các nốt `midis` không?
   * Resolve khi đủ dữ liệu (~200 ms sau lần gõ). null = không kiểm tra được (micro tắt / chưa có lần gõ) →
   * dùng cách cũ (match.ts). Kết quả `conclusive = false` (tiếng nhỏ / ồn) → cũng nên dùng cách cũ.
   */
  verifyChord(midis: number[], onsetAt = this.lastOnsetAt): Promise<ChordResult | null> {
    if (this._state !== 'on' || !this.buf || onsetAt < 0 || midis.length < 2) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.chordRequests.push({ midis, onsetAt, resolve });
      // Dữ liệu có thể đã sẵn (màn hình hỏi muộn) → trả lời ngay, không chờ khung sau
      this.serveChords();
    });
  }

  /** Trả lời các yêu cầu kiểm tra hợp âm đã đủ dữ liệu (gọi sau mỗi khung). */
  private serveChords(): void {
    if (!this.chordRequests.length) return;
    const buf = this.buf;
    const ctx = this.audio.context;
    if (!buf || !ctx) return;
    const now = this.bufTime;
    const sr = ctx.sampleRate;
    const len = Math.round(CHORD_FRAME.length * sr);
    this.chordRequests = this.chordRequests.filter((rq) => {
      if (now < rq.onsetAt + CHORD_READY_AFTER) return true;
      // Mẫu cuối bộ đệm ≈ `now` → vị trí của [gõ + 50 ms, + 150 ms]; hỏi quá muộn thì lấy đoạn cũ nhất còn giữ
      let start = buf.length - Math.round((now - rq.onsetAt - CHORD_FRAME.startAfter) * sr);
      start = Math.max(0, Math.min(buf.length - len, start));
      let r: ChordResult | null = null;
      try {
        r = analyzeChord(buf.subarray(start, start + len), sr, rq.midis, this.tuningCents);
        // App đang phát tiếng (âm mẫu…) → micro nghe cả tiếng app → không kết luận
        if (this.audio.isSounding) r.conclusive = false;
      } catch {
        r = null;
      }
      rq.resolve(r);
      return false;
    });
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
      this.audio.setMicActive(true);
      this.usedFallback = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS, video: false });
      } catch (e) {
        // Trình duyệt cũ từ chối tùy chọn (OverconstrainedError/TypeError) → xin micro "trơn"; bị CHẶN thì thôi
        const name = (e as { name?: string })?.name;
        if (name !== 'OverconstrainedError' && name !== 'TypeError') throw e;
        if (myGen !== this.gen) throw e;
        this.usedFallback = true;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
    } catch (e) {
      if (myGen !== this.gen) return this._state;
      this.audio.setMicActive(false);
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
    this.analyser.fftSize = HISTORY_SIZE;
    this.buf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    // KHÔNG nối ra loa → không có tiếng hú
    this.source.connect(this.analyser);
    this.analyzer.reset(false);
    this.advisor.reset();
    this._stats = MicListener.emptyStats();
    this.lastTickAt = -1;
    this.lastOnsetAt = -1;
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
    const st = this._stats;
    const wall = this.clock();
    if (this.lastTickAt >= 0) {
      const gap = wall - this.lastTickAt;
      if (gap > st.maxGapMs) st.maxGapMs = gap;
      if (gap > 60) st.slowGaps++;
    }
    this.lastTickAt = wall;
    st.frames++;
    const since = this.audio.msSinceSound();
    const now = ctx.currentTime;
    this.bufTime = now;
    const app: AppSound = this.audio.isSounding
      ? 'sounding'
      : this.clickBlankMs > 0 && this.audio.clickNear(now, this.clickBlankMs / 1000 + this.audio.outputLatency, 0.01)
        ? 'click'
        : since < this.quietMarginMs
          ? 'tail'
          : 'quiet';
    // Không ai cần cao độ (vd chỉ chấm vỗ nhịp) → bỏ YIN, đỡ CPU iPad cũ
    const needPitch = this.noteListeners.size > 0 || this.frameListeners.size > 0;
    if (app !== 'quiet') st.appFrames++;
    const f = this.analyzer.process(buf.subarray(buf.length - ANALYSIS_FRAME), ctx.sampleRate, now, app, needPitch);
    // "Gõ/vỗ" (chấm vỗ nhịp): mốc thời gian định vị trong khung phân tích
    if (f.onset && now - this.lastClapAt > 0.15) {
      this.lastClapAt = now;
      const at = f.onsetAt >= 0 ? Math.min(now, f.onsetAt) : now - 0.035;
      this.lastOnsetAt = at;
      st.onsets++;
      this.onsetListeners.forEach((fn) => fn(at));
    }
    this.serveChords();
    if (this.frameListeners.size) {
      const frame: MicFrame = { pitch: f.pitch, level: f.level, rms: f.rms, floor: f.floor, gate: f.gate, onset: f.onset, app };
      this.frameListeners.forEach((fn) => fn(frame));
    }
    if (f.note) {
      const n = f.note;
      st.notes++;
      this.noteListeners.forEach((fn) => fn(n));
    }
    // Chỉ lúc có màn đang chờ nghe nốt, app im, không đọc to
    if (this.noteListeners.size && app === 'quiet' && (f.note || f.nearMiss) && !this.externalBusy()) {
      if (f.nearMiss) {
        st.nearMisses++;
        this.advisor.nearMiss();
      } else this.advisor.heard();
      const c = this.autoSensitivity ? this.advisor.advise(this.sensitivity) : null;
      if (c) {
        this.sensitivity = c.to;
        this.autoSensListeners.forEach((fn) => fn(c));
      }
    }
  }

  /** Màn hình không cần micro nữa: tắt hẳn (và thôi tự bật lại). */
  stop(): void {
    this._needsRestart = false;
    this.teardown();
    // Đồng bộ kiểu phiên âm thanh (vd vừa tắt micro trong Cài đặt → về 'playback')
    this.audio.setMicActive(false);
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
    const pending = this.chordRequests;
    this.chordRequests = [];
    pending.forEach((rq) => rq.resolve(null));
    if (this._state === 'on' || this._state === 'starting') {
      // Giữ 'play-and-record' nếu micro vẫn được bật trong Cài đặt (AudioEngine quyết định)
      this.audio.setMicActive(false);
      this.setState('off');
    }
  }
}

/** Độ dài thanh âm lượng (0–100): theo thang log, NGƯỠNG NHẬN TIẾNG ĐÀN nằm ở giữa (50%). */
export function meterPct(f: Pick<MicFrame, 'rms' | 'gate'>): number {
  if (f.rms <= 0 || f.gate <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(50 + 15 * Math.log2(f.rms / f.gate))));
}
