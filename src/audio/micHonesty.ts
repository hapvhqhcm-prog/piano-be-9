/**
 * (+ 2026-10-08, OWNER duyệt) MICRO NÓI THẬT: khi bé có vẻ ĐANG ĐÀN (micro thấy tiếng gõ phím / tiếng "suýt nghe")
 * mà micro KHÔNG nhận ra nốt nào, liên tiếp MIC_DEAF_SITUATIONS lần → app nói thật "Micro nghe chưa rõ — không phải
 * lỗi của con" và mời bố mẹ chấm giúp. Micro nghe ra nốt (kể cả nốt SAI — đó là phản hồi bình thường) → đếm lại từ 0.
 *
 * Hàm thuần (có test): micHonestyStep(state, event) → { state, show }.
 * - 'activity' (thời điểm ms): tiếng đàn mà chưa ra nốt. Mở một "tình huống"; sau MIC_DEAF_WINDOW_MS vẫn không nghe ra
 *   nốt nào → tình huống đó tính là "micro điếc".
 * - 'tick' (ms): đồng hồ (đóng tình huống đã quá hạn).
 * - 'heard': micro nhận ra một nốt (đúng hay sai) → hết nghi ngờ.
 * - 'timeout': một lần chờ hết giờ khi micro bật (vd nhắc "App chưa nghe thấy") → cũng tính một tình huống.
 * - 'step': sang bước / nốt mới → được hiện lại thông báo (bộ đếm GIỮ — thêm MỘT tình huống nữa là nói ngay).
 */
export const MIC_DEAF_WINDOW_MS = 3000;
export const MIC_DEAF_SITUATIONS = 3;

export interface MicHonestyState {
  /** Tình huống đang mở (ms) — null = không có */
  since: number | null;
  /** Số tình huống "micro điếc" liên tiếp */
  misses: number;
  /** Đã hiện thông báo ở bước này */
  shown: boolean;
}

export type MicHonestyEvent =
  | { type: 'activity'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'heard' }
  | { type: 'timeout' }
  | { type: 'step' };

export const micHonestyInit = (): MicHonestyState => ({ since: null, misses: 0, shown: false });

export function micHonestyStep(
  s: MicHonestyState,
  e: MicHonestyEvent,
  opts: { windowMs?: number; situations?: number } = {},
): { state: MicHonestyState; show: boolean } {
  const windowMs = opts.windowMs ?? MIC_DEAF_WINDOW_MS;
  const need = opts.situations ?? MIC_DEAF_SITUATIONS;
  let { since, misses, shown } = s;
  const before = misses;
  switch (e.type) {
    case 'heard':
      return { state: { since: null, misses: 0, shown }, show: false };
    case 'step':
      return { state: { since: null, misses, shown: false }, show: false };
    case 'timeout':
      since = null;
      misses++;
      break;
    case 'activity':
    case 'tick':
      if (since !== null && e.at - since >= windowMs) {
        misses++;
        since = null;
      }
      if (e.type === 'activity' && since === null) since = e.at;
      break;
  }
  // Chỉ nói khi VỪA có thêm một tình huống (sang bước mới mà chưa có bằng chứng mới thì chưa nói)
  const show = !shown && misses > before && misses >= need;
  if (show) shown = true;
  return { state: { since, misses, shown }, show };
}
