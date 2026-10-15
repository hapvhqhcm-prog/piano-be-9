/**
 * (+ 2026-10-15) ĐỒNG HỒ CON TRỎ MƯỢT — "vạch đang chơi" trên khuông trôi theo tiếng đàn, không giật.
 *
 * `AudioContext.currentTime` nhảy theo từng khối âm thanh (vài ms tới hơn 10 ms, không đều) — vẽ thẳng theo nó thì
 * con trỏ khựng/giật. Ở đây: nội suy bằng đồng hồ khung hình (performance.now / thời điểm requestAnimationFrame),
 * mỗi khung chỉ nhích dần (5 %) về đồng hồ âm thanh để khử trôi giữa hai đồng hồ; lệch quá xa (vd âm thanh tạm dừng,
 * máy chậm) → bám lại ngay. Trừ độ trễ loa (outputLatency) → con trỏ khớp tiếng bé NGHE THẤY. Không bao giờ chạy lùi.
 */
export class GlideClock {
  private base = Number.NaN;
  private perf0 = 0;
  private last = -Infinity;

  constructor(
    private readonly ctxNow: () => number,
    private readonly latency: () => number = () => 0,
  ) {}

  /** Thời điểm (giây, theo đồng hồ AudioContext) của tiếng đang phát ra loa ở khung hình `perfMs`. */
  now(perfMs: number): number {
    const ctx = this.ctxNow();
    let est = this.base + (perfMs - this.perf0) / 1000;
    if (!Number.isFinite(est) || Math.abs(est - ctx) > 0.06) {
      this.base = ctx;
      this.perf0 = perfMs;
      est = ctx;
    } else {
      const corr = (ctx - est) * 0.05;
      this.base += corr;
      est += corr;
    }
    const lat = this.latency();
    const out = Math.max(this.last, est - (Number.isFinite(lat) && lat > 0 && lat < 0.5 ? lat : 0));
    this.last = out;
    return out;
  }
}
