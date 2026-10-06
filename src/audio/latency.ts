/**
 * ĐO ĐỘ TRỄ LOA → MICRO (màn "Thử micro" → "⏱️ Đo độ trễ").
 *
 * App phát vài tiếng "tinh" ngắn ở thời điểm biết trước (đồng hồ AudioContext); micro (đã tắt lọc tiếng vọng)
 * nghe lại chính tiếng đó → thời điểm micro bắt được lần gõ − thời điểm hẹn = độ trễ KHỨ HỒI
 * (loa phát chậm + micro thu chậm). Bé đàn theo tiếng tích NGHE THẤY, tiếng đàn lại tới app chậm thêm
 * độ trễ micro → khi chấm nhịp phải trừ đúng con số khứ hồi này.
 *
 * LƯU Ý: tiếng tích máy đếm nhịp (≥ 5 kHz) bị bộ lọc thông thấp của micro CHẶN (cố ý) → không dùng được để đo.
 * Dùng tiếng "tinh" Đô5 (523 Hz + họa âm 1046 Hz), lên rất nhanh — lọt qua bộ lọc, bộ bắt "gõ phím" bắt được.
 */

export const PING = {
  /** Đô5 */
  hz: 523.25,
  attack: 0.002,
  tau: 0.03,
  length: 0.15,
  gain: 0.6,
} as const;

/** Số tiếng "tinh" và khoảng cách giữa chúng (giây). */
export const LATENCY_PINGS = 6;
export const LATENCY_GAP = 0.6;
/** Chỉ tìm lần gõ trong khoảng này sau thời điểm hẹn (giây). */
export const LATENCY_MAX = 0.5;
/** Trên mức này: rất có thể đang dùng tai nghe / loa Bluetooth. */
export const BLUETOOTH_LIKELY_MS = 120;
// Giới hạn lưu trong Cài đặt: MIC_LATENCY_MAX_MS ở progress/schema.ts (kết quả đo luôn ≤ LATENCY_MAX = 500 ms).

export interface LatencyEstimate {
  /** Độ trễ khứ hồi (ms, trung vị các lần đo hợp lệ) */
  ms: number;
  /** Số lần đo được dùng / số tiếng "tinh" */
  used: number;
  total: number;
  /** Độ lệch lớn nhất giữa các lần đo hợp lệ và trung vị (ms) */
  spreadMs: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Ghép mỗi thời điểm hẹn với lần gõ ĐẦU TIÊN micro bắt được trong [hẹn, hẹn + LATENCY_MAX];
 * bỏ các lần lệch xa trung vị (> max(15 ms, 3 × độ lệch tuyệt đối trung vị)) — tiếng ho, tiếng vọng, xe chạy qua…
 * Cần ít nhất một nửa số lần (và ≥ 3) hợp lệ, nếu không trả về null (đo lại).
 */
export function estimateLatency(scheduled: number[], onsets: number[]): LatencyEstimate | null {
  const sorted = [...onsets].sort((a, b) => a - b);
  const lags: number[] = [];
  for (const t of scheduled) {
    const o = sorted.find((x) => x >= t && x <= t + LATENCY_MAX);
    if (o !== undefined) lags.push(o - t);
  }
  if (lags.length < 3) return null;
  const med = median(lags);
  const mad = median(lags.map((l) => Math.abs(l - med)));
  const lim = Math.max(0.015, 3 * mad);
  const good = lags.filter((l) => Math.abs(l - med) <= lim);
  if (good.length < Math.max(3, Math.ceil(scheduled.length / 2))) return null;
  const ms = median(good) * 1000;
  return {
    ms: Math.round(ms),
    used: good.length,
    total: scheduled.length,
    spreadMs: Math.round(Math.max(...good.map((l) => Math.abs(l * 1000 - ms)))),
  };
}
