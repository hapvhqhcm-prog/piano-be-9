/**
 * (+ 2026-10-15) "🎨 Nốt màu" (OWNER duyệt): tô đầu nốt trên khuông theo tên nốt (bảng màu an toàn cho người mù màu —
 * src/music/engrave.ts NOTE_COLORS) và tô nhẹ cùng màu lên phím trắng của bàn phím ảo.
 * Chế độ lưu trên máy (như "🔢 Hiện số ngón"): 'auto' = bật ở tuần 1–8, 'on' luôn bật, 'off' tắt.
 * (2026-10-15, OWNER duyệt — "Bớt màu & tên nốt sớm hơn", rà soát của thầy giáo): 'auto' TẮT màu ở lượt THEO NHỊP của bài
 * QUEN (bé đã đạt trọn bài — songFamiliar) từ tuần NOTE_COLOR_FAMILIAR_TEMPO_OFF_FROM (4) để bé đọc khuông; lần đầu gặp bài
 * (chế độ chờ) vẫn có màu tới hết tuần 8. Cùng ý: từ tuần STAFF_ONLY_FAMILIAR_FROM (6) lượt theo nhịp của bài quen chỉ còn
 * khuông (readingHints — không tên nốt, không phím sáng). 'on' / 'off' của bố mẹ luôn thắng (chỉ màu).
 * Nhận xét kiểu thầy giáo (xanh/đỏ/xám/cam) luôn thay màu tên nốt khi đang hiện (staffView.ts).
 */
export type NoteColorMode = 'auto' | 'on' | 'off';
export const NOTE_COLOR_KEY = 'piano-be-9-note-colors';
/** Tuần cuối cùng "Tự động" còn bật nốt màu */
export const NOTE_COLOR_WEEKS = 8;
/** (2026-10-15) Từ tuần này "Tự động" tắt màu ở lượt theo nhịp của bài QUEN */
export const NOTE_COLOR_FAMILIAR_TEMPO_OFF_FROM = 4;
/** (2026-10-15) Từ tuần này lượt theo nhịp của bài QUEN chỉ hiện khuông (gợi ý 'staff') */
export const STAFF_ONLY_FAMILIAR_FROM = 6;

/** Lượt đang mở: theo nhịp? bài đã quen (đã đạt trọn bài, chế độ nào cũng được)? */
export interface ReadingCtx {
  tempo: boolean;
  familiar: boolean;
  /** Bài có bè tay trái (khóa Fa) — trước tuần học khóa Fa thì KHÔNG bỏ tên nốt (bé chưa được dạy đọc khóa Fa) */
  bass?: boolean;
}

/** Tuần dạy khóa Fa (đọc nốt tay trái trên khuông) — trước đó bài tay trái giữ tên nốt. */
export const BASS_CLEF_TAUGHT_WEEK = 11;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function noteColorMode(storage: Pick<Storage, 'getItem'> | null = safeStorage()): NoteColorMode {
  try {
    const v = storage?.getItem(NOTE_COLOR_KEY);
    return v === 'on' || v === 'off' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setNoteColorMode(m: NoteColorMode, storage: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStorage()): void {
  try {
    if (m === 'auto') storage?.removeItem(NOTE_COLOR_KEY);
    else storage?.setItem(NOTE_COLOR_KEY, m);
  } catch {
    /* chế độ riêng tư — chỉ nhớ trong lần mở này */
  }
}

/** Có tô màu không, theo chế độ và tuần hiện tại của bé (+ 2026-10-15: lượt theo nhịp của bài quen — xem đầu file). */
export function noteColorsOn(mode: NoteColorMode, week: number, ctx?: ReadingCtx): boolean {
  if (mode === 'on') return true;
  if (mode !== 'auto' || week < 1 || week > NOTE_COLOR_WEEKS) return false;
  return !(ctx?.tempo && ctx.familiar && week >= NOTE_COLOR_FAMILIAR_TEMPO_OFF_FROM);
}

/**
 * (2026-10-15) Gợi ý thực dùng cho lượt bài hát trong buổi học: từ tuần STAFF_ONLY_FAMILIAR_FROM, lượt THEO NHỊP của bài
 * QUEN → 'staff' (chỉ khuông); còn lại giữ gợi ý của bài học (lần đầu gặp bài ở chế độ chờ giữ phím sáng / tên nốt).
 */
export function readingHints<H extends 'full' | 'names' | 'staff'>(hints: H, week: number, ctx: ReadingCtx): H | 'staff' {
  if (ctx.bass && week < BASS_CLEF_TAUGHT_WEEK) return hints;
  return ctx.tempo && ctx.familiar && week >= STAFF_ONLY_FAMILIAR_FROM ? 'staff' : hints;
}
