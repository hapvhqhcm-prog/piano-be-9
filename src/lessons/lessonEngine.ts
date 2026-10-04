import type { AppData, Session } from '../progress/schema';
import type { Lesson, Segment, WeekPlan } from './types';
import { WEEK1 } from './week1';
import { WEEK2 } from './week2';
import { WEEK3 } from './week3';

/** Phase 1 chỉ có tuần 1–3. */
export const PHASE1_WEEKS: readonly WeekPlan[] = [WEEK1, WEEK2, WEEK3];
export const MAX_WEEK = PHASE1_WEEKS.length;

/** Thời lượng gợi ý (§11): Tư thế 1' → Tai nghe 2' (từ tuần 2) → Bài mới 6' → Tổng kết 1'. */
export const MAX_SESSIONS_PER_DAY = 2;

export function weekPlan(week: number): WeekPlan {
  return PHASE1_WEEKS[Math.min(Math.max(week, 1), MAX_WEEK) - 1];
}

export function findLesson(id: string): Lesson | undefined {
  for (const w of PHASE1_WEEKS) {
    const l = w.lessons.find((x) => x.id === id);
    if (l) return l;
  }
  return undefined;
}

export function sessionsOfWeek(data: Readonly<AppData>, week: number): Session[] {
  return data.sessions.filter((s) => s.lessonId.startsWith(`w${week}-`));
}

/** Tiêu chí qua tuần (§11). Hàm thuần — có test. */
export function weekPassed(week: number, data: Readonly<AppData>): boolean {
  const sessions = sessionsOfWeek(data, week);
  switch (week) {
    case 1:
      // Tìm C4 đúng 10/10 trong bài kiểm tra — bố mẹ xác nhận (PARENT)
      // hoặc micro nghe được (MIC, phải đúng ngay lần đầu và không bị bố mẹ sửa).
      return sessions.some((s) => {
        if (s.lessonId !== 'w1-test') return false;
        const c4 = s.parentAssessments.filter((a) => a.note === 'C4');
        const mic = s.micAssessments.filter((a) => a.expected === 'C4');
        const micOk = (a: (typeof mic)[number]) =>
          a.parentOverride ? a.parentOverride === 'correct' : a.firstTry;
        const correct = c4.filter((a) => a.result === 'correct').length + mic.filter(micOk).length;
        const misses = c4.filter((a) => a.result === 'retry').length + mic.filter((a) => !micOk(a)).length;
        return correct >= 10 && misses === 0;
      });
    case 2: {
      // SELF: 2 buổi liền (trong các buổi tuần 2 có tự đánh giá) đều "all".
      const rated = sessions.filter((s) => s.selfRating !== null);
      for (let i = 1; i < rated.length; i++) {
        if (rated[i - 1].selfRating === 'all' && rated[i].selfRating === 'all') return true;
      }
      return false;
    }
    case 3:
      // APP: tai nghe đúng ≥ 8 trên 10 câu liên tiếp trong một buổi
      // (xét mọi cửa sổ 10 câu — đúng cả khi bé Quay lại và chơi lại giữa chừng).
      return sessions.some((s) => {
        const a = s.appAssessments;
        for (let i = 0; i + 10 <= a.length; i++) {
          if (a.slice(i, i + 10).filter((x) => x.correct).length >= 8) return true;
        }
        return false;
      });
    default:
      return false;
  }
}

/** Bài "Học tiếp": bài đầu tiên chưa xong → bài kiểm tra tuần (nếu chưa qua) → bài cuối để ôn. */
export function nextLesson(data: Readonly<AppData>): Lesson {
  const plan = weekPlan(data.progress.currentWeek);
  const done = new Set(data.progress.lessonsCompleted);
  const regular = plan.lessons.filter((l) => !l.isWeekTest);
  const firstUndone = regular.find((l) => !done.has(l.id));
  if (firstUndone) return firstUndone;
  const test = plan.lessons.find((l) => l.isWeekTest);
  if (test && !weekPassed(plan.week, data)) return test;
  return regular[regular.length - 1];
}

export type SessionStep =
  | { kind: 'posture' }
  | { kind: 'ear'; pool: string[]; rounds: number }
  | { kind: 'segment'; segment: Segment; last: boolean }
  | { kind: 'rating' };

/**
 * Kế hoạch một buổi (§11): Tư thế → Tai nghe (từ tuần 2) → Bài mới → Tổng kết.
 * replay=true ("Chơi lại bài vừa học"): chỉ bài + tổng kết.
 */
export function buildSessionPlan(lesson: Lesson, opts: { replay?: boolean } = {}): SessionStep[] {
  const plan = weekPlan(lesson.week);
  const steps: SessionStep[] = [];
  if (!opts.replay) {
    steps.push({ kind: 'posture' });
    if (plan.earPool.length > 0 && plan.earRounds > 0) {
      steps.push({ kind: 'ear', pool: [...plan.earPool], rounds: plan.earRounds });
    }
  }
  lesson.segments.forEach((segment, i) =>
    steps.push({ kind: 'segment', segment, last: i === lesson.segments.length - 1 }),
  );
  steps.push({ kind: 'rating' });
  return steps;
}

export function sessionsToday(data: Readonly<AppData>, today: string): Session[] {
  return data.sessions.filter((s) => s.date === today);
}
