/**
 * Độ "TƯƠI" của bài đã thuộc (ôn ngắt quãng) + đã xong giáo trình chưa.
 */
import type { AppData } from '../progress/schema';
import { memo } from '../progress/history';
import { DAY_MS, MAX_WEEK } from './curriculum';
import { lastWholePlay, songMastered } from './songStats';
import { weekPassed } from './weekCriteria';

/** Bài đã thuộc mà không chơi lại quá ngần này ngày → "ôn bài cũ" (ngắt quãng). */
export const FRESH_DAYS = 21;
/**
 * (+ 2026-10-06) Sau khi XONG giáo trình (đạt tuần MAX_WEEK) bé giữ ~40–50 bài đã thuộc: 21 ngày làm ~70% bài mờ sao
 * vĩnh viễn → nới thành 45 ngày, và "Luyện tập mỗi ngày" xoay vòng bài lâu chưa chơi nhất (dailyLesson).
 */
export const FRESH_DAYS_AFTER_CURRICULUM = 45;

/** Đã xong giáo trình: đạt tiêu chí tuần cuối (MAX_WEEK). */
export function curriculumDone(data: Readonly<AppData>): boolean {
  return memo(data, 'curriculumDone', () => weekPassed(MAX_WEEK, data));
}

/** Số ngày bài đã thuộc còn "tươi": FRESH_DAYS, hoặc FRESH_DAYS_AFTER_CURRICULUM khi đã xong giáo trình. */
export function freshDays(data: Readonly<AppData>): number {
  return curriculumDone(data) ? FRESH_DAYS_AFTER_CURRICULUM : FRESH_DAYS;
}

/**
 * Bài còn "TƯƠI": đã thuộc VÀ có chơi cả bài trong freshDays(data) ngày qua (FRESH_DAYS; 45 ngày khi đã xong giáo trình).
 * Đã thuộc nhưng không tươi → mờ sao ở thư viện, được ưu tiên ôn (Luyện tập mỗi ngày, Ôn bài cũ trong buổi).
 */
export function songFresh(songId: string, data: Readonly<AppData>, now: number | Date = Date.now()): boolean {
  const t = typeof now === 'number' ? now : now.getTime();
  return songMastered(data, songId) && lastWholePlay(data, songId) >= t - freshDays(data) * DAY_MS;
}
