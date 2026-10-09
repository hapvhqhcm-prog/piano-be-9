/**
 * Giáo trình: danh sách tuần / cấp, tra cứu tuần & bài, hằng số dùng chung của "bộ máy bài học" (lessonEngine.ts).
 */
import type { AppData, Session } from '../progress/schema';
import type { LevelInfo, Lesson, WeekPlan } from './types';
import { LEVEL2_WEEKS } from './level2';
import { LEVEL3_WEEKS } from './level3';
import { LEVEL4_WEEKS } from './level4';
import { WEEK1 } from './week1';
import { WEEK2 } from './week2';
import { WEEK3 } from './week3';
import { WEEK4 } from './week4';
import { WEEK5 } from './week5';
import { WEEK6 } from './week6';
import { WEEK7 } from './week7';
import { WEEK8 } from './week8';
import { WEEK9 } from './week9';
import { WEEK10 } from './week10';

/**
 * Giáo trình v5 (OWNER duyệt 2026-10-05, theo rà soát của chuyên gia sư phạm) — 3 cấp:
 * Cấp 1 (1–10), Cấp 2 (11–21), Cấp 3 (22–31). Thêm tuần CỦNG CỐ (5, 13, 23) và tuần dạy nhịp/đọc nhạc trước bài cần
 * (9 nhịp 2/4, 18 móc kép & Tập-tễnh, 19 nghịch phách & dây nối); trò sáng tạo; tiêu chí cần 2 NGÀY.
 * v5.1 (OWNER duyệt 2026-10-06, rà soát chuyên gia lần 2) — 31 tuần (Cấp 2 có 11 tuần — tuần 18 cũ quá tải nên tách đôi):
 * buổi ngắn (≤ MAX_SESSION_STEPS màn, ≤ ~12 phút); khởi động kỹ thuật ~30 giây MỖI buổi (sau tư thế); "Con làm thầy" gộp
 * với tự chấm thành MỘT màn kết; tách tay sẵn ở bài hai tay đầu tuần; tiêu chí APP cũng cần 2 ngày.
 * Dữ liệu cũ (rev 1/2/3) đánh số lại ở progress/migrations.ts (bảng OLD→NEW).
 * Mục tiêu cuối nói thật: ≈ hoàn thành Faber cấp 1 / đầu cấp 2 (không phải "thành thạo" theo nghĩa nhạc viện).
 */
export const WEEKS: readonly WeekPlan[] = [
  WEEK1, WEEK2, WEEK3, WEEK4, WEEK5, WEEK6, WEEK7, WEEK8, WEEK9, WEEK10,
  ...LEVEL2_WEEKS,
  ...LEVEL3_WEEKS,
  // Cấp 4 (OWNER duyệt 2026-10-08): tuần 32–43 thêm ở CUỐI — mã tuần/bài cũ không đổi, không cần migration
  ...LEVEL4_WEEKS,
];

export const LEVELS: readonly LevelInfo[] = [
  {
    level: 1,
    name: 'Cấp 1 · Làm quen',
    goal: 'Thế Đô hai tay, nhịp Đi – Chạy-chạy – 2/4, đọc nốt khóa Sol theo nốt mốc & quãng, ngẫu hứng phím đen',
    weeks: [1, 10],
  },
  {
    level: 2,
    name: 'Cấp 2 · Hai tay',
    goal: 'Đô giữa & khóa Fa, hai tay cùng lúc, thế Sol, phím đen, nhịp 3/4, chấm dôi, móc kép, nghịch phách, gam, sáng tác 4 ô nhịp',
    weeks: [11, 21],
  },
  {
    level: 3,
    name: 'Cấp 3 · Vững vàng',
    goal: 'Hợp âm, dòng kẻ phụ & khuông lớn, đổi thế, trưởng/thứ, đọc hai khóa, Minuet & Für Elise giản lược — ≈ hoàn thành Faber cấp 1 / đầu cấp 2',
    weeks: [22, 31],
  },
  {
    level: 4,
    name: 'Cấp 4 · Nghệ sĩ nhỏ',
    goal: 'Gam Sol, Fa, Rê trưởng & La thứ hai tay, hợp âm rải, bass Alberti, pedal, nhịp 6/8, to dần – nhỏ dần, Andante – Allegro — ≈ ABRSM Initial / đầu Grade 1',
    weeks: [32, 43],
  },
];

export function levelOf(week: number): LevelInfo {
  return LEVELS.find((l) => week >= l.weeks[0] && week <= l.weeks[1]) ?? LEVELS[LEVELS.length - 1];
}
export const MAX_WEEK = WEEKS.length;
/** @deprecated giữ tên cũ cho mã Phase 1 */
export const PHASE1_WEEKS = WEEKS;

/** Tối đa 2 buổi/ngày (§11) — chỉ nhắc nhẹ, không khóa (§9). */
export const MAX_SESSIONS_PER_DAY = 2;

export function weekPlan(week: number): WeekPlan {
  return WEEKS[Math.min(Math.max(week, 1), MAX_WEEK) - 1];
}

export function findLesson(id: string): Lesson | undefined {
  for (const w of WEEKS) {
    const l = w.lessons.find((x) => x.id === id);
    if (l) return l;
  }
  return undefined;
}

/** Tuần bắt đầu dùng tay trái (Hồ Tấm Gương) — v5: tuần 7 (trước đây tuần 6, §6). */
export const LEFT_HAND_WEEK = 7;

/** Tay trái được kích hoạt từ tuần LEFT_HAND_WEEK. */
export function leftHandActive(data: Readonly<AppData>): boolean {
  return data.progress.currentWeek >= LEFT_HAND_WEEK || data.settings.leftHandEnabled;
}

export function sessionsOfWeek(data: Readonly<AppData>, week: number): Session[] {
  return data.sessions.filter((s) => s.lessonId.startsWith(`w${week}-`));
}

/** Một ngày (ms). */
export const DAY_MS = 86_400_000;

/**
 * v5.1 (OWNER duyệt 2026-10-06 sau buổi bé chơi thử): trò tai nghe / đọc nốt tối đa ngần này lượt MỘT lần chơi
 * (khởi động lẫn hoạt động quiz trong bài) — buildSessionPlan cắt bớt nếu dữ liệu ghi nhiều hơn.
 */
export const MAX_QUIZ_ROUNDS = 6;

/** Mã đánh dấu đã xong hoạt động thứ i của một bài (lưu chung trong lessonsCompleted) — để học tiếp phần còn lại. */
export const activityDoneId = (lessonId: string, i: number): string => `${lessonId}#${i}`;
