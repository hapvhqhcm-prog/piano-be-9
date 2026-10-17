/**
 * (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") Thẻ "📘 Biết thêm" RA KHỎI buổi học → sống trong 📘 Từ điển nhạc nhỏ
 * (mở từ 🎮 Trò chơi / Thư viện) + chip KHÔNG bắt buộc "📘 1 thẻ mới" ở màn kết buổi. "Thẻ mới" = thẻ con ĐÃ ĐƯỢC MỞ KHÓA
 * (theory.theoryUnlocked: thẻ của tuần đã qua, hoặc bài chứa thẻ đã học) mà con CHƯA MỞ xem (settings.theorySeen).
 * Không ghi điểm, không đổi tiến độ / tiêu chí. Hàm thuần, NHẸ (không nạp dữ liệu nhạc lý — theory.ts nằm ở chunk riêng; nơi gọi
 * truyền danh sách thẻ đã mở khóa vào) — test: tests/sessionSixty-2026-10-17.test.ts.
 */
import type { AppData } from '../progress/schema';
import type { TheoryId } from './types';

/** Nhớ tối đa ngần này mã thẻ đã xem (giáo trình có ~30 thẻ). */
const SEEN_MAX = 200;

/** Đọc MỀM settings.theorySeen. */
export function readTheorySeen(settings: Readonly<AppData['settings']> | undefined): string[] {
  const v = (settings as { theorySeen?: unknown } | undefined)?.theorySeen;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, SEEN_MAX) : [];
}

/** Thêm các thẻ vừa xem (không trùng). Trả về null khi không có gì mới (khỏi ghi). */
export function withTheorySeen(seen: readonly string[], ids: readonly string[]): string[] | null {
  const add = ids.filter((id) => !seen.includes(id));
  return add.length ? [...seen, ...add].slice(-SEEN_MAX) : null;
}

/** Các thẻ đã mở khóa (`unlocked` = theory.theoryUnlocked(data)) mà con chưa xem (giữ thứ tự). */
export function newTheoryCards<T extends { id: string }>(data: Readonly<AppData>, unlocked: readonly T[]): T[] {
  const seen = new Set(readTheorySeen(data.settings));
  return unlocked.filter((c) => !seen.has(c.id));
}

/** Nhãn huy hiệu "📘 N thẻ mới" (null = không có thẻ mới). */
export function theoryBadge(n: number): string | null {
  return n > 0 ? `📘 ${n} thẻ mới` : null;
}

/** Thẻ của bài (chip màn kết) con chưa xem — rỗng = không hiện chip. */
export function unseenOf(data: Readonly<AppData>, ids: readonly TheoryId[]): TheoryId[] {
  const seen = new Set(readTheorySeen(data.settings));
  return ids.filter((id) => !seen.has(id));
}
