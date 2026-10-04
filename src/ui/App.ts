import type { AudioEngine } from '../audio/AudioEngine';
import { MicListener } from '../audio/MicListener';
import { markSafePoint } from '../pwa/updater';
import type { ProgressStore } from '../progress/ProgressStore';

/** Một màn hình: vẽ vào root, trả về hàm dọn dẹp (tùy chọn). */
export type Screen = (root: HTMLElement) => (() => void) | void;

export class App {
  private cleanup: (() => void) | null = null;
  /** Đã có ít nhất một lần chạm "Bắt đầu" (AudioContext đã được tạo). */
  started = false;
  /** Micro nghe đàn — chỉ bật khi phụ huynh cho phép trong Cài đặt. */
  readonly mic: MicListener;

  constructor(
    readonly root: HTMLElement,
    readonly audio: AudioEngine,
    readonly store: ProgressStore,
  ) {
    this.mic = new MicListener(audio);
  }

  /** Micro được bật trong Cài đặt và thiết bị hỗ trợ (cần HTTPS). */
  get micWanted(): boolean {
    return this.store.settings.micEnabled && MicListener.supported;
  }

  /** Bật micro nếu được phép (gọi trong thao tác chạm). Trả về true nếu đang nghe. */
  async ensureMic(): Promise<boolean> {
    if (!this.micWanted) return false;
    this.mic.tuningCents = this.store.settings.micTuningCents;
    return (await this.mic.start()) === 'on';
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
