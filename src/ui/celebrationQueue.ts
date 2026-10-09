/**
 * (+ 2026-10-09, UX QA) MỖI LẦN MỞ APP TỐI ĐA MỘT MÀN MỪNG.
 *
 * Lần mở đầu sau cập nhật, bé ở tuần 4 có thể gặp liền: màn mừng "🎁 Con mở được 3 món quà", rồi học xong lại gặp
 * màn kết có sticker / quả trứng / cập bến đảo mới, về màn chính lại thêm "🎁 Quà mới" — quá nhiều cho trẻ 9 tuổi.
 * Quy tắc: một "lần mở app" (tải trang, hoặc quay lại sau khi app nằm nền ≥ OPEN_GAP_MS) chỉ có MỘT màn mừng.
 * - Màn kết buổi có phần thưởng (không hoãn được — sticker tính theo buổi) → ghi "đã mừng" cho lần mở này.
 * - Màn "🎁 Quà mới" ở màn chính là phần HOÃN được: lần mở này đã mừng rồi → để dành (món quà vẫn "chưa xem")
 *   tới lần mở sau.
 * Hàm THUẦN (test: tests/celebrationQueue.test.ts) + một bộ đếm dùng chung cho app (`celebrations`).
 */

/** App nằm nền (ẩn) từ ngần này trở lên rồi mở lại = một lần mở mới. */
export const OPEN_GAP_MS = 30 * 60_000;

export interface OpenTracker {
  /** Số thứ tự lần mở app (bắt đầu từ 1) */
  openId: number;
  /** Lúc app bị ẩn (ms); null = đang hiện */
  hiddenAt: number | null;
  /** Lần mở đã có màn mừng; null = chưa */
  celebratedIn: number | null;
}

export const initTracker = (): OpenTracker => ({ openId: 1, hiddenAt: null, celebratedIn: null });

/** App bị ẩn (chuyển app khác / khóa màn hình). */
export function onHidden(t: OpenTracker, now: number): OpenTracker {
  return t.hiddenAt === null ? { ...t, hiddenAt: now } : t;
}

/** App hiện lại: ẩn đủ lâu → lần mở mới (được mừng lại). */
export function onVisible(t: OpenTracker, now: number): OpenTracker {
  if (t.hiddenAt === null) return t;
  const fresh = now - t.hiddenAt >= OPEN_GAP_MS;
  return { ...t, hiddenAt: null, openId: fresh ? t.openId + 1 : t.openId };
}

/** Lần mở này còn được hiện màn mừng (hoãn được) không. */
export const canCelebrate = (t: OpenTracker): boolean => t.celebratedIn !== t.openId;

/** Ghi: lần mở này đã có màn mừng. */
export const markCelebrated = (t: OpenTracker): OpenTracker => ({ ...t, celebratedIn: t.openId });

/**
 * Bộ đếm dùng chung cho cả app (một trang = một bộ đếm). Tự nghe visibilitychange khi có `document`.
 */
class Celebrations {
  private t = initTracker();
  private listening = false;

  private listen(): void {
    if (this.listening || typeof document === 'undefined') return;
    this.listening = true;
    document.addEventListener('visibilitychange', () => {
      this.t = document.visibilityState === 'hidden' ? onHidden(this.t, Date.now()) : onVisible(this.t, Date.now());
    });
  }

  /** Lần mở này còn chỗ cho một màn mừng hoãn được (vd 🎁 Quà mới) không. */
  canShow(): boolean {
    this.listen();
    return canCelebrate(this.t);
  }

  /** Vừa hiện một màn mừng (màn kết có phần thưởng, 🎁 Quà mới…). */
  mark(): void {
    this.listen();
    this.t = markCelebrated(this.t);
  }

  /** Chỉ cho test / màn chụp. */
  reset(): void {
    this.t = initTracker();
  }
}

export const celebrations = new Celebrations();
