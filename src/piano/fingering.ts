import type { Pitch } from './pitchTable';

/**
 * SỐ NGÓN — KHÓA CỨNG theo §6 (CURRICULUM LOCK). Không sửa nếu chưa có OWNER duyệt.
 * Tay phải, thế Đô: C4=1 · D4=2 · E4=3 · F4=4 · G4=5
 * Tay trái, thế Đô: C3=5 · D3=4 · E3=3 · F3=2 · G3=1
 *
 * Mở rộng (OWNER duyệt 2026-10-04, từ tuần 7): tay phải NGÓN 5 DUỖI lên La — A4=5.
 * Ngón 5 lo cả Sol và La; ngón cái vẫn ở Đô.
 */
export type Hand = 'RH' | 'LH';

export const RH_FINGERING: Readonly<Record<Pitch, number>> = Object.freeze({
  C4: 1,
  D4: 2,
  E4: 3,
  F4: 4,
  G4: 5,
});

export const LH_FINGERING: Readonly<Record<Pitch, number>> = Object.freeze({
  C3: 5,
  D3: 4,
  E3: 3,
  F3: 2,
  G3: 1,
});

/** Nốt mở rộng (duỗi ngón) — chỉ dùng ở bài có đánh dấu `extension`. */
export const RH_EXTENSION: Readonly<Record<Pitch, number>> = Object.freeze({ A4: 5 });

export function fingeringFor(hand: Hand): Readonly<Record<Pitch, number>> {
  return hand === 'RH' ? RH_FINGERING : LH_FINGERING;
}

/** Số ngón; `extended` = cho phép nốt duỗi ngón (A4). */
export function fingerFor(pitch: Pitch, hand: Hand, extended = false): number | undefined {
  const base = fingeringFor(hand)[pitch];
  if (base !== undefined) return base;
  return extended && hand === 'RH' ? RH_EXTENSION[pitch] : undefined;
}

/** Các nốt hợp lệ của thế 5 ngón (có thể kèm nốt duỗi). */
export function handRange(hand: Hand, extended = false): Pitch[] {
  const base = Object.keys(fingeringFor(hand));
  return extended && hand === 'RH' ? [...base, ...Object.keys(RH_EXTENSION)] : base;
}

/** Nốt được hiện số ngón khi chạm phím ảo: tay phải (kể cả La duỗi) và — từ tuần 6 — tay trái. */
export function fingerOnKeyboard(pitch: Pitch, leftHandActive: boolean): { finger: number; hand: Hand } | null {
  const rh = fingerFor(pitch, 'RH', true);
  if (rh !== undefined) return { finger: rh, hand: 'RH' };
  if (leftHandActive) {
    const lh = fingerFor(pitch, 'LH');
    if (lh !== undefined) return { finger: lh, hand: 'LH' };
  }
  return null;
}
