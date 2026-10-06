import type { AudioEngine } from './AudioEngine';

/**
 * v5.1 — "NGHE LẠI CON ĐÀN" (OWNER duyệt 2026-10-06): ghi âm TẠM vài chục giây khi bé đàn để bé nghe lại, tự nhận xét.
 * Chỉ giữ trong BỘ NHỚ (Blob/ObjectURL), không lưu xuống máy, không gửi đi; rời màn / tắt app là mất.
 *
 * HỢP ĐỒNG (agent âm thanh hiện thực; agent giao diện dùng trong song.ts):
 *   const rec = takeRecorder(app.mic)        // null nếu không hỗ trợ / micro chưa bật
 *   rec.start()                              // bắt đầu lượt đàn
 *   const clip = await rec.stop()            // kết thúc lượt → TakeClip | null
 *   clip.play(); clip.stopPlayback(); clip.dispose()   // nghe lại / dừng / giải phóng (gọi khi rời màn)
 *
 * HIỆN THỰC:
 * - MediaRecorder trên CHÍNH luồng micro đang nghe (MicListener.mediaStream) — không xin micro lần nữa, không ảnh hưởng
 *   nhận nốt (bộ phân tích vẫn đọc luồng qua Web Audio như cũ).
 * - Định dạng: iPad Safari 'audio/mp4' (AAC); trình duyệt khác 'audio/webm;codecs=opus'.
 * - Tối đa MAX_TAKE_SECONDS giây: quá thì tự dừng (stop() sau đó vẫn trả bản ghi đã có).
 * - Phát lại: giải mã bằng AudioContext dùng chung, CHUẨN HÓA âm lượng (tiếng đàn tới micro thường nhỏ) và đánh dấu
 *   "app đang phát" (AudioEngine.holdBusy) → micro không tự nghe lại tiếng đàn của chính bản ghi.
 *   Giải mã không được → phát bằng thẻ <audio> (ObjectURL), vẫn đánh dấu "đang phát".
 * - dispose(): dừng phát, thu hồi ObjectURL, bỏ dữ liệu.
 */
export interface TakeClip {
  /** Thời lượng (giây) */
  seconds: number;
  play(): Promise<void>;
  stopPlayback(): void;
  dispose(): void;
}

export interface TakeRecorder {
  start(): void;
  stop(): Promise<TakeClip | null>;
  /** Hủy, không giữ gì */
  cancel(): void;
}

/** Ghi tối đa (giây) — đủ một bài ngắn; bộ nhớ ~0,5 MB. */
export const MAX_TAKE_SECONDS = 60;
/** Ngắn hơn mức này (giây) thì không giữ (bấm nhầm). */
export const MIN_TAKE_SECONDS = 0.5;
/** Thứ tự ưu tiên định dạng ghi (iPad Safari chỉ có audio/mp4). */
export const RECORD_MIME_TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'] as const;
/** Phát lại: đỉnh tiếng được đưa về mức này (vừa phải, không chói), khuếch đại tối đa PLAYBACK_MAX_GAIN. */
export const PLAYBACK_PEAK = 0.5;
export const PLAYBACK_MAX_GAIN = 8;
/** onstop không tới (trình duyệt lỗi) → thôi chờ sau chừng này ms. */
const STOP_TIMEOUT_MS = 3000;

/** Phần MediaRecorder mà recorder dùng (để tiêm đối tượng giả khi test). */
export interface RecorderLike {
  readonly state: string;
  readonly mimeType?: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}
export interface RecorderCtor {
  new (stream: MediaStream, opts?: { mimeType?: string; audioBitsPerSecond?: number }): RecorderLike;
  isTypeSupported?(type: string): boolean;
}
/** Phần thẻ <audio> dùng khi không giải mã được. */
export interface AudioElementLike {
  onended: (() => void) | null;
  play(): Promise<void> | void;
  pause(): void;
}

export interface RecorderDeps {
  MediaRecorder?: RecorderCtor;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
  createObjectURL?: (b: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  createAudio?: (url: string) => AudioElementLike;
}

/** Micro mà recorder cần — MicListener đáp ứng (mediaStream + engine). */
export interface RecorderMic {
  readonly mediaStream: MediaStream | null;
  readonly engine?: AudioEngine | null;
}

/** Định dạng ghi được hỗ trợ đầu tiên; undefined = để trình duyệt tự chọn. */
export function pickMimeType(R: Pick<RecorderCtor, 'isTypeSupported'> | undefined): string | undefined {
  if (!R || typeof R.isTypeSupported !== 'function') return undefined;
  for (const t of RECORD_MIME_TYPES) {
    try {
      if (R.isTypeSupported(t)) return t;
    } catch {
      /* bỏ qua */
    }
  }
  return undefined;
}

/** Hệ số khuếch đại phát lại từ biên độ đỉnh của bản ghi (thuần — có test). */
export function playbackGain(peak: number): number {
  if (!(peak > 0)) return 1;
  return Math.max(0.3, Math.min(PLAYBACK_MAX_GAIN, PLAYBACK_PEAK / peak));
}

function peakOf(buf: AudioBuffer): number {
  let p = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i] < 0 ? -d[i] : d[i];
      if (v > p) p = v;
    }
  }
  return p;
}

function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    // Safari cũ chỉ có dạng callback; mới thì trả Promise — hỗ trợ cả hai
    const p = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

function defaults(d: RecorderDeps): Required<RecorderDeps> | null {
  const g = globalThis as unknown as {
    MediaRecorder?: RecorderCtor;
    URL?: typeof URL;
    Audio?: new (src: string) => HTMLAudioElement;
  };
  const R = d.MediaRecorder ?? g.MediaRecorder;
  if (typeof R !== 'function') return null;
  return {
    MediaRecorder: R,
    now: d.now ?? (() => Date.now()),
    setTimeout: d.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
    clearTimeout: d.clearTimeout ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>)),
    createObjectURL: d.createObjectURL ?? ((b) => g.URL!.createObjectURL(b)),
    revokeObjectURL: d.revokeObjectURL ?? ((u) => g.URL?.revokeObjectURL(u)),
    createAudio: d.createAudio ?? ((u) => new g.Audio!(u) as unknown as AudioElementLike),
  };
}

class Clip implements TakeClip {
  private url: string | null = null;
  private buffer: AudioBuffer | null = null;
  private stopCur: (() => void) | null = null;
  private disposed = false;

  constructor(
    private blob: Blob | null,
    readonly seconds: number,
    private readonly engine: AudioEngine | null,
    private readonly deps: Required<RecorderDeps>,
  ) {}

  async play(): Promise<void> {
    this.stopPlayback();
    if (this.disposed || !this.blob) return;
    const ctx = this.engine?.context ?? null;
    if (ctx && typeof ctx.decodeAudioData === 'function') {
      if (!this.buffer) {
        try {
          this.buffer = await decode(ctx, await this.blob.arrayBuffer());
        } catch {
          this.buffer = null;
        }
      }
      if (this.disposed) return;
      if (this.buffer) return this.playBuffer(ctx, this.buffer);
    }
    return this.playElement();
  }

  private playBuffer(ctx: AudioContext, buf: AudioBuffer): Promise<void> {
    if (ctx.state !== 'running') void ctx.resume?.().catch(() => undefined);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = playbackGain(peakOf(buf));
    src.connect(gain);
    gain.connect(ctx.destination);
    return new Promise<void>((resolve) => {
      let release: () => void = () => undefined;
      const finish = () => {
        if (this.stopCur !== stop) return;
        this.stopCur = null;
        release();
        try {
          gain.disconnect();
        } catch {
          /* bỏ qua */
        }
        resolve();
      };
      const stop = () => {
        try {
          src.stop();
        } catch {
          /* bỏ qua */
        }
        finish();
      };
      this.stopCur = stop;
      // Micro bỏ qua trong lúc phát (app đang phát) — rời màn (stopAll) cũng dừng luôn
      release = this.engine?.holdBusy(stop) ?? (() => undefined);
      src.onended = finish;
      try {
        src.start();
      } catch {
        finish();
      }
    });
  }

  private playElement(): Promise<void> {
    if (!this.blob) return Promise.resolve();
    if (!this.url) this.url = this.deps.createObjectURL(this.blob);
    const el = this.deps.createAudio(this.url);
    return new Promise<void>((resolve) => {
      let release: () => void = () => undefined;
      const finish = () => {
        if (this.stopCur !== stop) return;
        this.stopCur = null;
        el.onended = null;
        release();
        resolve();
      };
      const stop = () => {
        try {
          el.pause();
        } catch {
          /* bỏ qua */
        }
        finish();
      };
      this.stopCur = stop;
      release = this.engine?.holdBusy(stop) ?? (() => undefined);
      el.onended = finish;
      try {
        const p = el.play();
        if (p && typeof p.then === 'function') p.then(undefined, finish);
      } catch {
        finish();
      }
    });
  }

  stopPlayback(): void {
    this.stopCur?.();
  }

  dispose(): void {
    this.stopPlayback();
    this.disposed = true;
    if (this.url) this.deps.revokeObjectURL(this.url);
    this.url = null;
    this.buffer = null;
    this.blob = null;
  }
}

class Recorder implements TakeRecorder {
  private rec: RecorderLike | null = null;
  private startedAt = 0;
  private stoppedAt = 0;
  private capTimer: unknown = undefined;
  /** Kết quả của lượt đang ghi / đã tự dừng (chưa ai lấy) */
  private result: Promise<TakeClip | null> | null = null;
  private discard = false;

  constructor(
    private readonly mic: RecorderMic,
    private readonly deps: Required<RecorderDeps>,
    private readonly mime: string | undefined,
  ) {}

  start(): void {
    this.cancel();
    const stream = this.mic.mediaStream;
    if (!stream) return;
    const R = this.deps.MediaRecorder;
    let rec: RecorderLike;
    try {
      rec = this.mime ? new R(stream, { mimeType: this.mime, audioBitsPerSecond: 64000 }) : new R(stream);
    } catch {
      try {
        rec = new R(stream);
      } catch {
        return;
      }
    }
    const chunks: Blob[] = [];
    this.discard = false;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.onerror = () => resolve();
    });
    try {
      rec.start();
    } catch {
      return;
    }
    this.rec = rec;
    this.startedAt = this.deps.now();
    this.stoppedAt = 0;
    this.result = done.then(() => {
      if (this.discard) return null;
      const seconds = Math.min(MAX_TAKE_SECONDS, ((this.stoppedAt || this.deps.now()) - this.startedAt) / 1000);
      if (!chunks.length || seconds < MIN_TAKE_SECONDS) return null;
      const type = rec.mimeType || this.mime || chunks[0].type || 'audio/mp4';
      return new Clip(new Blob(chunks, { type }), Math.round(seconds * 10) / 10, this.mic.engine ?? null, this.deps);
    });
    // Quá giới hạn → tự dừng; stop() sau đó vẫn lấy được bản ghi
    this.capTimer = this.deps.setTimeout(() => this.halt(), MAX_TAKE_SECONDS * 1000);
  }

  /** Dừng MediaRecorder (nếu đang ghi). */
  private halt(): void {
    this.deps.clearTimeout(this.capTimer);
    this.capTimer = undefined;
    const rec = this.rec;
    this.rec = null;
    if (!rec) return;
    if (!this.stoppedAt) this.stoppedAt = this.deps.now();
    try {
      if (rec.state !== 'inactive') rec.stop();
      else rec.onstop?.();
    } catch {
      rec.onstop?.();
    }
  }

  stop(): Promise<TakeClip | null> {
    const result = this.result;
    this.result = null;
    this.halt();
    if (!result) return Promise.resolve(null);
    // onstop không bao giờ tới (lỗi trình duyệt) → không treo giao diện; bản ghi tới muộn thì bỏ
    return new Promise((resolve) => {
      let settled = false;
      const timer = this.deps.setTimeout(() => {
        settled = true;
        resolve(null);
      }, STOP_TIMEOUT_MS);
      void result.then((c) => {
        if (settled) return c?.dispose();
        settled = true;
        this.deps.clearTimeout(timer);
        resolve(c);
      });
    });
  }

  cancel(): void {
    const result = this.result;
    this.result = null;
    if (result) {
      this.discard = true;
      void result.then((c) => c?.dispose());
    }
    this.halt();
  }
}

/**
 * Tạo bộ ghi "Nghe lại con đàn" cho micro đang bật. null = không ghi được (trình duyệt không có MediaRecorder,
 * hoặc micro chưa bật) → giao diện ẩn nút Nghe lại.
 */
export function takeRecorder(mic: RecorderMic | null | undefined, deps: RecorderDeps = {}): TakeRecorder | null {
  if (!mic?.mediaStream) return null;
  const d = defaults(deps);
  if (!d) return null;
  return new Recorder(mic, d, pickMimeType(d.MediaRecorder));
}
