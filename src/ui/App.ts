import type { AudioEngine } from '../audio/AudioEngine';
import type { ProgressStore } from '../progress/ProgressStore';

/** Một màn hình: vẽ vào root, trả về hàm dọn dẹp (tùy chọn). */
export type Screen = (root: HTMLElement) => (() => void) | void;

export class App {
  private cleanup: (() => void) | null = null;
  /** Đã có ít nhất một lần chạm "Bắt đầu" (AudioContext đã được tạo). */
  started = false;

  constructor(
    readonly root: HTMLElement,
    readonly audio: AudioEngine,
    readonly store: ProgressStore,
  ) {}

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
    this.cleanup = screen(this.root) || null;
  }
}
