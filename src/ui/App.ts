import type { AudioEngine } from '../audio/AudioEngine';
import { MicListener } from '../audio/MicListener';
import { requestPersistentStorage } from '../progress/backup';
import { markSafePoint } from '../pwa/updater';
import type { ProgressStore } from '../progress/ProgressStore';

/** Một màn hình: vẽ vào root, trả về hàm dọn dẹp (tùy chọn). */
export type Screen = (root: HTMLElement) => (() => void) | void;

export class App {
  private cleanup: (() => void) | null = null;
  private _started = false;
  /** Đã chờ lần chạm kế tiếp để bật lại micro (sau khi iOS cắt ngầm) */
  private micRearm: (() => void) | null = null;
  /** Micro nghe đàn — chỉ bật khi phụ huynh cho phép trong Cài đặt. */
  readonly mic: MicListener;
  /**
   * Dữ liệu đã được trình duyệt cho "lưu bền" chưa (null = chưa hỏi / đang hỏi).
   * false trên Safari tab thường là bình thường → màn phụ huynh nên khuyên "Thêm vào MH chính" (installCard).
   */
  storagePersisted: boolean | null = null;

  constructor(
    readonly root: HTMLElement,
    readonly audio: AudioEngine,
    readonly store: ProgressStore,
  ) {
    this.mic = new MicListener(audio);
    // Micro được bật trong Cài đặt → giữ phiên 'play-and-record' suốt (đổi qua lại làm iOS nhỏ tiếng / lẹt xẹt)
    audio.recordSessionWanted = () => this.micWanted;
    // iOS cắt micro ngầm (cuộc gọi, khóa màn hình…) → micro báo 'off' + needsRestart → bật lại ở lần chạm sau
    this.mic.onState((s) => {
      if (s === 'off' && this.mic.needsRestart) this.armMicRestart();
    });
  }

  /** Đã có ít nhất một lần chạm "Bắt đầu" (AudioContext đã được tạo). */
  get started(): boolean {
    return this._started;
  }
  set started(v: boolean) {
    const first = v && !this._started;
    this._started = v;
    // Lần chạm đầu tiên: xin trình duyệt đừng tự xóa dữ liệu (Safari xóa sau 7 ngày không dùng)
    if (first) {
      void requestPersistentStorage().then((ok) => {
        this.storagePersisted = ok;
      });
    }
  }

  /** Micro được bật trong Cài đặt và thiết bị hỗ trợ (cần HTTPS). */
  get micWanted(): boolean {
    return this.store.settings.micEnabled && MicListener.supported;
  }

  /**
   * Bật micro nếu được phép (gọi trong thao tác chạm). Trả về true nếu đang nghe.
   * Micro bị iOS cắt ngầm (mic.needsRestart) → start() tự tắt hẳn rồi bật lại.
   */
  async ensureMic(): Promise<boolean> {
    if (!this.micWanted) return false;
    this.mic.tuningCents = this.store.settings.micTuningCents;
    this.mic.sensitivity = this.store.settings.micSensitivity;
    this.mic.latencyMs = this.store.settings.micLatencyMs;
    return (await this.mic.start()) === 'on';
  }

  /** Chờ lần chạm kế tiếp (thao tác người dùng — iOS cần để mở lại micro/âm thanh) rồi bật lại micro. */
  private armMicRestart(): void {
    if (this.micRearm || typeof document === 'undefined') return;
    const handler = () => {
      this.micRearm?.();
      if (this.mic.needsRestart && this.mic.state === 'off') void this.ensureMic();
    };
    const opts = { capture: true } as const;
    document.addEventListener('pointerup', handler, opts);
    document.addEventListener('click', handler, opts);
    this.micRearm = () => {
      document.removeEventListener('pointerup', handler, opts);
      document.removeEventListener('click', handler, opts);
      this.micRearm = null;
    };
  }

  show(screen: Screen): void {
    const prev = this.cleanup;
    this.cleanup = null;
    try {
      prev?.();
    } catch (e) {
      console.warn('cleanup', e);
    }
    this.audio.stopAll();
    this.root.replaceChildren();
    this.root.scrollTop = 0;
    markSafePoint(false); // màn Bắt đầu / màn chính tự đánh dấu an toàn
    this.cleanup = screen(this.root) || null;
  }
}
