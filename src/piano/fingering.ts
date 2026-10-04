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

/**
 * THẾ TAY (Cấp 2–3, OWNER yêu cầu hoàn thiện giáo trình 2026-10-04) — bảng số ngón cố định cho từng thế.
 * 'C' (§6) · 'MC' Đô giữa tay trái · 'G' thế Sol · 'D' thế Rê (Fa♯) · 'Cm' Đô thứ (Mi♭) · 'Am' La thứ.
 * Bài có `position: "free"` dùng số ngón ghi riêng từng nốt (gam luồn ngón, đổi thế, bài cổ điển).
 */
export type PositionId = 'C' | 'MC' | 'G' | 'D' | 'Cm' | 'Am' | 'free';

export const POSITIONS: Readonly<Record<Exclude<PositionId, 'free'>, Partial<Record<Hand, Readonly<Record<Pitch, number>>>>>> =
  Object.freeze({
    C: { RH: RH_FINGERING, LH: LH_FINGERING },
    // Đô giữa tay trái: ngón cái ở Đô giữa, ngón út ở Fa3
    MC: { LH: Object.freeze({ C4: 1, B3: 2, A3: 3, G3: 4, F3: 5 }) },
    G: {
      RH: Object.freeze({ G4: 1, A4: 2, B4: 3, C5: 4, D5: 5 }),
      LH: Object.freeze({ G2: 5, A2: 4, B2: 3, C3: 2, D3: 1 }),
    },
    D: {
      RH: Object.freeze({ D4: 1, E4: 2, 'F#4': 3, G4: 4, A4: 5 }),
      LH: Object.freeze({ D3: 5, E3: 4, 'F#3': 3, G3: 2, A3: 1 }),
    },
    Cm: {
      RH: Object.freeze({ C4: 1, D4: 2, Eb4: 3, F4: 4, G4: 5 }),
      LH: Object.freeze({ C3: 5, D3: 4, Eb3: 3, F3: 2, G3: 1 }),
    },
    Am: {
      RH: Object.freeze({ A3: 1, B3: 2, C4: 3, D4: 4, E4: 5 }),
      LH: Object.freeze({ A2: 5, B2: 4, C3: 3, D3: 2, E3: 1 }),
    },
  });

/** Số ngón theo thế tay (so khớp theo cách viết nốt); 'C' kèm La duỗi khi `extended`. */
export function fingerInPosition(pitch: Pitch, hand: Hand, position: PositionId, extended = false): number | undefined {
  if (position === 'free') return undefined;
  if (position === 'C') return fingerFor(pitch, hand, extended);
  return POSITIONS[position][hand]?.[pitch];
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
