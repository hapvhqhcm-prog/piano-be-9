import type { Pitch } from './pitchTable';

/**
 * SỐ NGÓN — KHÓA CỨNG theo §6 (CURRICULUM LOCK). Không sửa nếu chưa có OWNER duyệt.
 * Tay phải, thế Đô: C4=1 · D4=2 · E4=3 · F4=4 · G4=5
 * Tay trái, thế Đô: C3=5 · D3=4 · E3=3 · F3=2 · G3=1
 *
 * Mở rộng (OWNER duyệt 2026-10-04, từ tuần 7): tay phải thêm La — A4=5.
 *
 * QUY TẮC SOL–LA (OWNER duyệt 2026-10-05, thay cho "ngón 5 lo cả Sol và La"):
 * - Tuần 1–6, thế Đô thuần (chưa có La): Sol = ngón 5 (G4=5) — KHÔNG đổi.
 * - Từ tuần 7, khi Sol và La đi cùng nhau (Sol–La–Sol…): bàn tay nhích sang phải một phím
 *   ("thế Đô nhích lên", RH_SOL_LA): Sol = ngón 4, La = ngón 5 → Sol–La–Sol đàn 4-5-4, không lặp ngón 5.
 *   Đô lúc đó do ngón cái duỗi xuống. Bài hát có La: số ngón ghi riêng từng nốt (scripts/gen-songs.py chọn).
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

/** Nốt mở rộng — chỉ dùng ở bài có đánh dấu `extension`. La luôn là ngón 5. */
export const RH_EXTENSION: Readonly<Record<Pitch, number>> = Object.freeze({ A4: 5 });

/**
 * "Thế Đô nhích lên" (OWNER duyệt 2026-10-05, từ tuần 7): khi Sol và La đi cùng nhau.
 * Rê=1 Mi=2 Fa=3 Sol=4 La=5 (Đô: ngón cái duỗi xuống). Sol–La = 4-5.
 */
export const RH_SOL_LA: Readonly<Record<Pitch, number>> = Object.freeze({ D4: 1, E4: 2, F4: 3, G4: 4, A4: 5 });

export function fingeringFor(hand: Hand): Readonly<Record<Pitch, number>> {
  return hand === 'RH' ? RH_FINGERING : LH_FINGERING;
}

/** Số ngón; `extended` = cho phép nốt duỗi ngón (A4). */
export function fingerFor(pitch: Pitch, hand: Hand, extended = false): number | undefined {
  const base = fingeringFor(hand)[pitch];
  if (base !== undefined) return base;
  return extended && hand === 'RH' ? RH_EXTENSION[pitch] : undefined;
}

/**
 * THẾ TAY (Cấp 2–3, OWNER yêu cầu hoàn thiện giáo trình 2026-10-04) — bảng số ngón cố định cho từng thế.
 * 'C' (§6) · 'MC' Đô giữa tay trái · 'G' thế Sol · 'D' thế Rê (Fa♯) · 'Cm' Đô thứ (Mi♭) · 'Am' La thứ
 * · 'C5' thế Đô cao tay phải (Đô5–Sol5, OWNER duyệt 2026-10-05; tuần 26 "Đọc nốt cao" ở giáo trình v5.1 31 tuần).
 * Bài có `position: "free"` dùng số ngón ghi riêng từng nốt (gam luồn ngón, đổi thế, bài cổ điển).
 */
export type PositionId = 'C' | 'MC' | 'G' | 'D' | 'Cm' | 'Am' | 'C5' | 'free';

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
    // Thế Đô cao: ngón cái ở Đô5 (khe 3 khóa Sol), ngón 5 ở Sol5 (trên đỉnh khuông)
    C5: { RH: Object.freeze({ C5: 1, D5: 2, E5: 3, F5: 4, G5: 5 }) },
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
