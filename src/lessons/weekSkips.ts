/**
 * (+ 2026-10-25, OWNER duyệt — bé phản hồi "Dạy piano quá dễ") TUẦN ĐƯỢC CHO QUA bằng bản ghi tường minh (progress.skips):
 * - 'testedOut': ⚡ Thi vượt tuần đạt (lessons/testOut.ts) — đảo / sticker như thường (huy chương cấp vẫn cần lên sân khấu thật);
 * - 'placedOut': 🧭 Kiểm tra xếp lớp nhảy qua (lessons/placement.ts) — qua cho TIẾN ĐỘ, nhưng KHÔNG sticker đảo / huy chương.
 * Đọc MỀM (bản ghi hỏng bị bỏ qua). Module THUẦN, chỉ phụ thuộc progress/schema (weekCriteria / stickers / compaction đều nhập).
 * An toàn tiến độ: chỉ THÊM, không xóa; gộp lịch sử không đụng tới progress (bản ghi luôn còn).
 */
import type { AppData, WeekSkip } from '../progress/schema';

export type SkipKind = WeekSkip['kind'];

const isSkip = (x: unknown): x is WeekSkip => {
  const o = x as Partial<WeekSkip> | null;
  return !!o && typeof o === 'object' && (o.kind === 'testedOut' || o.kind === 'placedOut') && typeof o.at === 'number' && typeof o.date === 'string';
};

/** Bản ghi cho qua của tuần `week` (null = không có). */
export function skipOf(data: Readonly<Pick<AppData, 'progress'>>, week: number): WeekSkip | null {
  const m = data.progress?.skips;
  if (!m || typeof m !== 'object') return null;
  const r = (m as Record<string, unknown>)[String(week)];
  return isSkip(r) ? r : null;
}

/** Tuần được cho qua bằng kiểm tra xếp lớp (không sticker đảo / huy chương). */
export const placedOut = (data: Readonly<Pick<AppData, 'progress'>>, week: number): boolean => skipOf(data, week)?.kind === 'placedOut';

/** Mọi tuần có bản ghi cho qua (tăng dần). */
export function skippedWeeks(data: Readonly<Pick<AppData, 'progress'>>, kind?: SkipKind): number[] {
  const m = data.progress?.skips;
  if (!m || typeof m !== 'object') return [];
  return Object.entries(m as Record<string, unknown>)
    .filter(([, v]) => isSkip(v) && (!kind || v.kind === kind))
    .map(([k]) => Number(k))
    .filter((w) => Number.isInteger(w) && w > 0)
    .sort((a, b) => a - b);
}

/** Bản sao NÔNG của dữ liệu KHÔNG có bản ghi cho qua — để hỏi "tuần đạt bằng BẰNG CHỨNG thật chưa?" (huy chương, gộp lịch sử). */
export function withoutSkips<T extends Pick<AppData, 'progress'>>(data: Readonly<T>): T {
  if (!data.progress?.skips) return data as T;
  const { skips: _drop, ...progress } = data.progress;
  return { ...data, progress } as T;
}

/**
 * Ghi bản ghi cho qua cho các tuần `weeks` (SỬA TẠI CHỖ). Tuần đã có bản ghi giữ nguyên (không đổi 'testedOut' thành
 * 'placedOut'). Trả về số tuần vừa ghi.
 */
export function addSkips(data: AppData, weeks: readonly number[], kind: SkipKind, at: number, date: string): number {
  let n = 0;
  for (const w of weeks) {
    if (!Number.isInteger(w) || w < 1 || skipOf(data, w)) continue;
    (data.progress.skips ??= {})[String(w)] = { kind, at, date };
    n++;
  }
  return n;
}
