import type { Pitch } from './pitchTable';

/**
 * SỐ NGÓN — KHÓA CỨNG theo §6 (CURRICULUM LOCK). Không sửa nếu chưa có OWNER duyệt.
 * Tay phải, thế Đô: C4=1 · D4=2 · E4=3 · F4=4 · G4=5
 * Tay trái, thế Đô: C3=5 · D3=4 · E3=3 · F3=2 · G3=1
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

export function fingeringFor(hand: Hand): Readonly<Record<Pitch, number>> {
  return hand === 'RH' ? RH_FINGERING : LH_FINGERING;
}

export function fingerFor(pitch: Pitch, hand: Hand): number | undefined {
  return fingeringFor(hand)[pitch];
}

/** Các nốt hợp lệ của thế 5 ngón cho mỗi tay. */
export function handRange(hand: Hand): Pitch[] {
  return Object.keys(fingeringFor(hand));
}

/** Tay trái chỉ kích hoạt ở Phase 3 (tuần 6). */
export const LEFT_HAND_AVAILABLE_IN_PHASE_1 = false;
