/**
 * (+ 2026-10-18) Hình học chung của HUY HIỆU SỐ NGÓN trên bàn phím ảo — dùng cho "bản đồ ngón" (keyboardHand.ts, nạp muộn)
 * và lớp "thầy đàn mẫu" dự phòng (demo.ts HandOverlay) để hai lớp đặt số ngón ĐÚNG MỘT CHỖ.
 * Tâm huy hiệu trên phím trắng nằm ở PHẦN DƯỚI phím (trên tên nốt), trên phím đen ở cuối phím đen (phím đen cao 60%).
 */
export const MAP_GEO = {
  /** khoảng cách tâm huy hiệu phím trắng tới đáy phím: max(lift·H, liftMin px) */
  whiteLift: 0.23,
  whiteLiftMin: 64,
  blackH: 0.6,
  blackLift: 0.11,
  blackLiftMin: 22,
  blackLiftMax: 36,
};

/** Tâm huy hiệu (px từ mép trên bàn phím) theo chiều cao bàn phím H. */
export function badgeY(H: number, black: boolean): number {
  if (black) return MAP_GEO.blackH * H - Math.max(MAP_GEO.blackLiftMin, Math.min(MAP_GEO.blackLiftMax, MAP_GEO.blackLift * H));
  return H - Math.max(MAP_GEO.whiteLift * H, MAP_GEO.whiteLiftMin);
}
