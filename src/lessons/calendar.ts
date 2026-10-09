/**
 * Đếm theo lịch: buổi / phút hôm nay, buổi / ngày trong tuần lịch, chuỗi ngày liên tiếp.
 */
import type { AppData, Session } from '../progress/schema';
import { completedDates } from '../progress/history';

export function sessionsToday(data: Readonly<AppData>, today: string): Session[] {
  return data.sessions.filter((s) => s.date === today);
}

/** Phút đã học hôm nay (cho giới hạn ngày — Phase 3, chỉ khi phụ huynh bật). */
export function minutesToday(data: Readonly<AppData>, today: string): number {
  return data.progress.practiceDays[today]?.minutes ?? 0;
}

/** "YYYY-MM-DD" của thứ 2 đầu tuần lịch chứa `today`. */
export function mondayOf(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @deprecated v5.1 — đếm BUỔI (2 buổi một ngày = 2). Mục tiêu chăm chỉ nay tính theo NGÀY: dùng daysThisWeek.
 * Số buổi đã HOÀN THÀNH trong tuần lịch hiện tại (thứ 2 → chủ nhật).
 */
export function sessionsThisWeek(data: Readonly<AppData>, today: Date): number {
  const monday = mondayOf(today);
  return data.sessions.filter((s) => s.completed && s.date >= monday).length;
}

/**
 * v5.1 (OWNER duyệt 2026-10-06) — Số NGÀY KHÁC NHAU có ít nhất một buổi HOÀN THÀNH trong tuần lịch hiện tại
 * (thứ 2 → chủ nhật). Mục tiêu 4–5 ngày/tuần (§1) — hai buổi cùng ngày chỉ tính một ngày (luyện đều quan trọng hơn dồn).
 */
export function daysThisWeek(data: Readonly<AppData>, today: Date): number {
  const monday = mondayOf(today);
  return new Set(data.sessions.filter((s) => s.completed && s.date >= monday).map((s) => s.date)).size;
}

/** Chuỗi ngày liên tiếp có học (tính tới hôm nay hoặc hôm qua). */
export function streakDays(data: Readonly<AppData>, today: Date): number {
  const days = completedDates(data); // gồm cả ngày của các buổi đã gộp
  const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(key(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
