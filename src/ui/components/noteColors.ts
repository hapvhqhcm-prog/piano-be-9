/**
 * (+ 2026-10-15) "🎨 Nốt màu" (OWNER duyệt): tô đầu nốt trên khuông theo tên nốt (bảng màu an toàn cho người mù màu —
 * src/music/engrave.ts NOTE_COLORS) và tô nhẹ cùng màu lên phím trắng của bàn phím ảo.
 * Chế độ lưu trên máy (như "✋ Hiện bàn tay"): 'auto' = bật ở tuần 1–8, 'on' luôn bật, 'off' tắt.
 * Nhận xét kiểu thầy giáo (xanh/đỏ/xám/cam) luôn thay màu tên nốt khi đang hiện (staffView.ts).
 */
export type NoteColorMode = 'auto' | 'on' | 'off';
export const NOTE_COLOR_KEY = 'piano-be-9-note-colors';
/** Tuần cuối cùng "Tự động" còn bật nốt màu */
export const NOTE_COLOR_WEEKS = 8;

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

/** Có tô màu không, theo chế độ và tuần hiện tại của bé. */
export function noteColorsOn(mode: NoteColorMode, week: number): boolean {
  return mode === 'on' || (mode === 'auto' && week >= 1 && week <= NOTE_COLOR_WEEKS);
}
