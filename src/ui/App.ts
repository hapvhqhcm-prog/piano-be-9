import type { AudioEngine } from '../audio/AudioEngine';
import { MicListener } from '../audio/MicListener';
import { saveAutoSens } from '../audio/micLogStore';
import { SENS_NAME } from '../audio/micTune';
import { speechBusy } from '../audio/voice';
import { button, h, toast } from './components/dom';
import { requestPersistentStorage } from '../progress/backup';
import { markSafePoint } from '../pwa/updater';
import { logError, setScreenProbe } from '../pwa/errorLog';
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
    // Nhật ký lỗi ghi kèm màn đang mở
    setScreenProbe(() => this.root.firstElementChild?.className || undefined);
    // Micro được bật trong Cài đặt → giữ phiên 'play-and-record' suốt (đổi qua lại làm iOS nhỏ tiếng / lẹt xẹt)
    audio.recordSessionWanted = () => this.micWanted;
    // iOS cắt micro ngầm (cuộc gọi, khóa màn hình…) → micro báo 'off' + needsRestart → bật lại ở lần chạm sau
    this.mic.onState((s) => {
      if (s === 'off' && this.mic.needsRestart) this.armMicRestart();
    });
    // Giọng đọc hướng dẫn không đi qua AudioEngine → micro hỏi ở đây để không tính tiếng đọc là "bé đàn khẽ"
    this.mic.externalBusy = () => speechBusy();
    // Bé đàn khẽ nhiều lần không nghe được → micro tự tăng độ nhạy MỘT bậc: lưu, ghi nhật ký, báo phụ huynh
    this.mic.onAutoSensitivity((c) => {
      this.store.updateSettings({ micSensitivity: c.to });
      saveAutoSens({ at: new Date().toISOString(), ...c });
      toast(`🎤 Micro chưa nghe rõ tiếng đàn khẽ → đã tăng độ nhạy: ${SENS_NAME[c.from]} → ${SENS_NAME[c.to]}`, 4500);
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
    try {
      this.cleanup = screen(this.root) || null;
    } catch (e) {
      // (+ 2026-10-08) Màn lỗi khi vẽ → trước đây màn trắng, bé kẹt. Giờ: ghi nhật ký + màn "Ối" có nút về màn chính.
      console.error('screen', e);
      logError('screen', e);
      this.showRecovery();
    }
  }

  /** Màn "Ối, có trục trặc nhỏ" — luôn vẽ được (không phụ thuộc dữ liệu). */
  private showRecovery(): void {
    try {
      this.audio.stopAll();
    } catch {
      /* bỏ qua */
    }
    this.root.replaceChildren(
      h(
        'div',
        { class: 'screen' },
        h(
          'div',
          {
            class: 'stage app-recovery',
            role: 'alert',
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px', textAlign: 'center', padding: '32px', minHeight: '100%' },
          },
          h('h2', {}, '🙈 Ối, có trục trặc nhỏ'),
          h('p', {}, 'Tiến độ của con vẫn được giữ. Mình về màn chính rồi học tiếp nhé!'),
          button({
            icon: '🏠',
            label: 'Về màn chính',
            kind: 'primary',
            big: true,
            onTap: () =>
              void (this._started ? import('./screens/home').then((m) => this.show(m.homeScreen(this))) : import('./screens/start').then((m) => this.show(m.startScreen(this)))).catch(
                () => window.location.reload(),
              ),
          }),
          button({
            icon: '🩺',
            label: 'Kiểm tra iPad',
            onTap: () => void import('./screens/diagnostics').then((m) => this.show(m.diagnosticsScreen(this))).catch(() => window.location.reload()),
          }),
        ),
      ),
    );
    markSafePoint(true); // có bản mới (có thể đã sửa lỗi này) → cập nhật luôn
  }
}
