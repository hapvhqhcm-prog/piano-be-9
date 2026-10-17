/**
 * (+ 2026-10-12) GIỮ MÀN HÌNH SÁNG khi bé đang học.
 * Bé đàn trên đàn thật nên có khi vài phút không chạm iPad → iPad tự tối / khóa (Tự động khóa 2 phút) → micro bị cắt,
 * buổi học đứt quãng. Dùng Screen Wake Lock API (Safari 16.4+; iPadOS 26 có cả ở app trên màn hình chính).
 *
 * Theo HOẠT ĐỘNG, không giữ mãi: có chạm màn hình hoặc micro nghe tiếng đàn → giữ sáng; IDLE_MS không có gì → thả
 * (bé bỏ đi thì iPad vẫn tự tắt như bình thường, không hao pin). iOS tự thả khi app bị ẩn → hiện lại mà vừa có
 * hoạt động thì xin lại. Trình duyệt không hỗ trợ → không làm gì.
 */
export const WAKE_IDLE_MS = 5 * 60_000;

interface Sentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', fn: () => void): void;
}
interface WakeLockApi {
  request(type: 'screen'): Promise<Sentinel>;
}

export interface WakeEnv {
  api: WakeLockApi | null;
  now(): number;
  visible(): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(t: unknown): void;
}

export class ActivityWakeLock {
  private sentinel: Sentinel | null = null;
  private pending = false;
  private lastActive = -Infinity;
  private timer: unknown = null;
  /** (+ 2026-10-17) Số lần iPad TỪ CHỐI giữ màn hình sáng (pin yếu / Chế độ nguồn điện thấp…) — 🩺 + lời khuyên Tự động khóa */
  denials = 0;
  private deniedListeners = new Set<() => void>();

  constructor(
    private readonly env: WakeEnv,
    private readonly idleMs = WAKE_IDLE_MS,
  ) {}

  /** (+ 2026-10-17) Báo mỗi lần bị từ chối giữ sáng (App ghi lại + hiện lời khuyên MỘT lần). */
  onDenied(fn: () => void): () => void {
    this.deniedListeners.add(fn);
    return () => this.deniedListeners.delete(fn);
  }

  get supported(): boolean {
    return !!this.env.api;
  }

  /** Đang giữ màn hình sáng (chẩn đoán / test). */
  get held(): boolean {
    return !!this.sentinel && !this.sentinel.released;
  }

  /** Có hoạt động (chạm, micro nghe tiếng đàn). */
  poke(): void {
    if (!this.env.api) return;
    this.lastActive = this.env.now();
    if (!this.held) void this.acquire();
    this.schedule();
  }

  /** App hiện lại: iOS đã tự thả khi ẩn → xin lại nếu vừa có hoạt động. */
  onVisible(): void {
    if (this.env.now() - this.lastActive < this.idleMs) void this.acquire();
  }

  release(): void {
    if (this.timer !== null) this.env.clearTimer(this.timer);
    this.timer = null;
    const s = this.sentinel;
    this.sentinel = null;
    if (s && !s.released) void s.release().catch(() => undefined);
  }

  private schedule(): void {
    if (this.timer !== null) this.env.clearTimer(this.timer);
    this.timer = this.env.setTimer(() => {
      this.timer = null;
      const idle = this.env.now() - this.lastActive;
      if (idle >= this.idleMs) this.release();
      else this.schedule();
    }, this.idleMs);
  }

  private async acquire(): Promise<void> {
    const api = this.env.api;
    if (!api || this.pending || this.held || !this.env.visible()) return;
    this.pending = true;
    try {
      const s = await api.request('screen');
      s.addEventListener('release', () => {
        if (this.sentinel === s) this.sentinel = null;
      });
      this.sentinel = s;
    } catch {
      /* bị từ chối (vd pin yếu / chế độ nguồn điện thấp) — không giữ được; báo để bố mẹ chỉnh Tự động khóa */
      this.denials++;
      this.deniedListeners.forEach((fn) => {
        try {
          fn();
        } catch {
          /* bỏ qua */
        }
      });
    } finally {
      this.pending = false;
    }
  }
}

/** Gắn vào trang: chạm bất kỳ (pha capture) + hiện lại app. Trả về đối tượng để micro báo hoạt động. */
export function installWakeLock(): ActivityWakeLock {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as (Navigator & { wakeLock?: WakeLockApi }) | undefined;
  const lock = new ActivityWakeLock({
    api: nav?.wakeLock && typeof nav.wakeLock.request === 'function' ? nav.wakeLock : null,
    now: () => Date.now(),
    visible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  });
  if (!lock.supported || typeof document === 'undefined') return lock;
  document.addEventListener('pointerdown', () => lock.poke(), { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lock.onVisible();
  });
  return lock;
}
