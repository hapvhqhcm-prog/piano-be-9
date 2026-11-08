/**
 * (2026-11-08, OWNER: "Cứ nói chạm lại để bật âm thanh hoài, học cứ bị gián đoạn")
 *
 * iPad ngắt âm thanh của app trong chốc lát rất thường xuyên: lúc giọng đọc hướng dẫn nói, lúc micro bật/tắt,
 * thông báo, Siri… Trước đây chỉ cần âm thanh không chạy là hiện ngay màn che TOÀN MÀN HÌNH "Chạm để bật lại âm
 * thanh" → bé bị cắt ngang liên tục, dù vài trăm ms sau iPad đã tự cho chạy lại.
 *
 * Giờ:
 *  1. Âm thanh dừng → app tự thử bật lại (resume) ngay và vài lần sau đó, KHÔNG hiện gì.
 *  2. Đang có giọng đọc → không bao giờ báo (iPad ngắt âm thanh trong lúc đọc là bình thường).
 *  3. Chỉ khi đã dừng liên tục quá GRACE_MS mà tự bật không được → hiện một nút NHỎ ở góc (không che bài).
 *     Bất kỳ lần chạm nào (cả phím đàn trên màn) cũng bật lại tiếng — nút chỉ để bé biết.
 */
export const GRACE_MS = 2500;
/** Các lần tự thử bật lại sau khi âm thanh dừng (ms kể từ lúc dừng). */
export const RETRY_AT_MS = [0, 300, 800, 1500, 2300];

export interface ResumeEnv {
  /** Đã "Bắt đầu" và âm thanh đang dừng (suspended / interrupted) — cần bật lại. */
  needsResume(): boolean;
  /** Thử bật lại không cần thao tác chạm (iPad thường cho phép sau khi hết bị ngắt). */
  tryResume(): void;
  /** Giọng đọc đang nói. */
  speaking(): boolean;
  /** Trang đang hiện. */
  visible(): boolean;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
  /** Hiện / ẩn nút nhỏ. */
  setChip(show: boolean): void;
}

export class AudioResumeWatch {
  private since: number | null = null;
  private timers: unknown[] = [];
  private chip = false;
  /** Số lần đã hiện nút (chẩn đoán). */
  shown = 0;

  constructor(private readonly env: ResumeEnv) {}

  /** Gọi khi trạng thái âm thanh đổi / quay lại app / định kỳ. */
  check(): void {
    const e = this.env;
    if (!e.needsResume()) {
      this.reset();
      return;
    }
    if (this.since === null) {
      this.since = e.now();
      for (const at of RETRY_AT_MS) this.timers.push(e.setTimer(() => this.retry(), at));
      this.timers.push(e.setTimer(() => this.check(), GRACE_MS + 50));
      return;
    }
    const long = e.now() - this.since >= GRACE_MS;
    if (long && !e.speaking() && e.visible()) this.setChip(true);
    else if (e.speaking()) {
      // đang đọc: tính lại từ đầu sau khi đọc xong
      this.since = e.now();
      this.setChip(false);
      e.tryResume();
      this.timers.push(e.setTimer(() => this.check(), GRACE_MS + 50));
    }
  }

  private retry(): void {
    if (this.env.needsResume()) this.env.tryResume();
    else this.reset();
  }

  private reset(): void {
    this.since = null;
    for (const t of this.timers) this.env.clearTimer(t);
    this.timers = [];
    this.setChip(false);
  }

  private setChip(show: boolean): void {
    if (show === this.chip) return;
    this.chip = show;
    if (show) this.shown++;
    this.env.setChip(show);
  }

  get chipShown(): boolean {
    return this.chip;
  }
}
