/**
 * (+ 2026-10-09) "📊 Báo cáo tuần đã sẵn sàng" — phần NHẸ dùng ở màn chính (main chunk): chỉ xét ngày, không nạp giáo trình.
 * Báo cáo đầy đủ: progress/weeklyReport.ts (nạp muộn cùng màn ui/screens/weeklyReport.ts).
 *
 * Tuần lịch = thứ 2 → chủ nhật theo GIỜ MÁY (history.mondayKey). Từ thứ 2 (hoặc lần mở đầu tiên sau khi tuần cũ hết), nếu tuần
 * vừa qua có ít nhất một ngày tập và bố mẹ chưa xem báo cáo của tuần đó → hiện viên nhỏ cho BỐ MẸ (không phải màn mừng của bé).
 */
import { dayKey, mondayKey } from './history';
import type { AppData, Settings } from './schema';

/** Cài đặt thêm (cộng dồn, không cần migration): thứ 2 của tuần gần nhất bố mẹ đã mở báo cáo tuần. */
export type WeeklyReportSettings = Settings & { weeklyReportSeen?: string };

/** "YYYY-MM-DD" + k ngày (giờ máy). */
export function addDays(date: string, k: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + k));
}

/** Thứ 2 của tuần lịch ĐÃ HẾT gần nhất (tuần trước tuần chứa `now`). */
export function lastCompletedMonday(now: Date): string {
  return addDays(mondayKey(dayKey(now)), -7);
}

/** Tuần lịch [monday, monday + 7) có ít nhất một ngày tập? (ngày tập gồm cả phần đã gộp — progress.practiceDays) */
export function weekHasPractice(d: Readonly<AppData>, monday: string): boolean {
  const end = addDays(monday, 7);
  for (const date of Object.keys(d.progress.practiceDays ?? {})) if (date >= monday && date < end) return true;
  for (const s of d.sessions) if (s.date >= monday && s.date < end && (s.minutes > 0 || s.selfRating || s.completed)) return true;
  return false;
}

/**
 * Báo cáo tuần chờ bố mẹ xem: thứ 2 của tuần vừa hết (có ngày tập, chưa xem); null = không có gì mới.
 * Hàm thuần (test: tests/weeklyReport.test.ts).
 */
export function weeklyReportDue(d: Readonly<AppData>, now: Date): string | null {
  const last = lastCompletedMonday(now);
  const seen = (d.settings as Readonly<WeeklyReportSettings>).weeklyReportSeen;
  if (typeof seen === 'string' && seen >= last) return null;
  return weekHasPractice(d, last) ? last : null;
}
