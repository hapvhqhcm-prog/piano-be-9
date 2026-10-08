import type { Sensitivity } from './micAnalyzer';

/**
 * TỰ TĂNG ĐỘ NHẠY TRONG BUỔI HỌC (OWNER 2026-10-08: "nhiều lúc phải đánh thật to mới nghe được").
 * Hàm/lớp THUẦN — MicListener đưa vào từng sự kiện: nốt NGHE ĐƯỢC, hoặc "SUÝT NGHE" (tiếng có cao độ rõ vừa bật lên
 * nhưng dưới ngưỡng hiện tại, trên ngưỡng của độ nhạy kế tiếp — MicAnalyzer.nearMiss).
 *
 * Giới hạn chặt (không tự đổi lung tung):
 * - chỉ TĂNG, mỗi lần MỘT bậc (Thấp → Vừa → Cao), không bao giờ tự giảm;
 * - mỗi lần bật micro tối đa MỘT lần;
 * - cần ≥ AUTO_MIN_MISSES lần "suýt nghe" trong AUTO_WINDOW sự kiện gần nhất VÀ chiếm ≥ AUTO_MISS_SHARE;
 * - app báo cho phụ huynh (thông báo + ghi nhật ký, hiện trong "Cài micro" và "Kiểm tra iPad").
 */
export const AUTO_WINDOW = 12;
export const AUTO_MIN_MISSES = 4;
export const AUTO_MISS_SHARE = 0.4;

const NEXT: Record<Sensitivity, Sensitivity | null> = { low: 'normal', normal: 'high', high: null };

export interface AutoSensChange {
  from: Sensitivity;
  to: Sensitivity;
  /** Trong cửa sổ đánh giá: số nốt nghe được / số lần "suýt nghe" */
  heard: number;
  missed: number;
}

export class SensitivityAdvisor {
  /** true = "suýt nghe", false = nghe được (cửa sổ trượt) */
  private events: boolean[] = [];
  private used = false;

  heard(): void {
    this.push(false);
  }

  nearMiss(): void {
    this.push(true);
  }

  private push(miss: boolean): void {
    this.events.push(miss);
    if (this.events.length > AUTO_WINDOW) this.events.shift();
  }

  /** Nên tăng độ nhạy không (một bậc, tối đa một lần cho tới reset()). */
  advise(current: Sensitivity): AutoSensChange | null {
    const to = NEXT[current];
    if (this.used || !to) return null;
    const missed = this.events.filter(Boolean).length;
    if (missed < AUTO_MIN_MISSES || missed / this.events.length < AUTO_MISS_SHARE) return null;
    this.used = true;
    const heard = this.events.length - missed;
    this.events = [];
    return { from: current, to, heard, missed };
  }

  /** Bật micro mới (phiên mới): cho phép tự chỉnh lại một lần. */
  reset(): void {
    this.events = [];
    this.used = false;
  }
}
