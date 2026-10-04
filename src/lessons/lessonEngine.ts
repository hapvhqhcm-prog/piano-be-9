import { findTune } from '../music/exercises';
import { measureCount } from '../music/tune';
import type { QuizSpec } from '../practice/quiz';
import type { AppAssessment, AppData, Session } from '../progress/schema';
import type { Activity, Lesson, Segment, Target, WeekPlan } from './types';
import { WEEK1 } from './week1';
import { WEEK2 } from './week2';
import { WEEK3 } from './week3';
import { WEEK4 } from './week4';
import { WEEK5 } from './week5';
import { WEEK6 } from './week6';
import { WEEK7 } from './week7';
import { WEEK8 } from './week8';

/** Giáo trình v2 — 8 tuần (OWNER duyệt 2026-10-04). */
export const WEEKS: readonly WeekPlan[] = [WEEK1, WEEK2, WEEK3, WEEK4, WEEK5, WEEK6, WEEK7, WEEK8];
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

/** Tay trái được kích hoạt từ tuần 6 (§6). */
export function leftHandActive(data: Readonly<AppData>): boolean {
  return data.progress.currentWeek >= 6 || data.settings.leftHandEnabled;
}

export function sessionsOfWeek(data: Readonly<AppData>, week: number): Session[] {
  return data.sessions.filter((s) => s.lessonId.startsWith(`w${week}-`));
}

const isPitch = (s: string) => /^[A-G]#?\d$/.test(s);

/** Có 10 câu liên tiếp (đoán cao độ) đúng ≥ 8 trong một buổi. */
function ear8of10(sessions: Session[], accept: (a: AppAssessment) => boolean): boolean {
  return sessions.some((s) => {
    const a = s.appAssessments.filter(accept);
    for (let i = 0; i + 10 <= a.length; i++) {
      if (a.slice(i, i + 10).filter((x) => x.correct).length >= 8) return true;
    }
    return false;
  });
}

/** Tiêu chí qua tuần (§11, v2). Hàm thuần — có test. */
export function weekPassed(week: number, data: Readonly<AppData>): boolean {
  const sessions = sessionsOfWeek(data, week);
  const runs = sessions.flatMap((s) => s.songRuns);
  switch (week) {
    case 1:
      // Tìm C4 đúng 10/10 — bố mẹ xác nhận (PARENT) hoặc micro (MIC, đúng ngay lần đầu, không bị sửa)
      return sessions.some((s) => {
        if (s.lessonId !== 'w1-test') return false;
        const c4 = s.parentAssessments.filter((a) => a.note === 'C4');
        const mic = s.micAssessments.filter((a) => a.expected === 'C4');
        const micOk = (a: (typeof mic)[number]) => (a.parentOverride ? a.parentOverride === 'correct' : a.firstTry);
        const correct = c4.filter((a) => a.result === 'correct').length + mic.filter(micOk).length;
        const misses = c4.filter((a) => a.result === 'retry').length + mic.filter((a) => !micOk(a)).length;
        return correct >= 10 && misses === 0;
      });
    case 2: {
      // SELF: 2 buổi liền đều "Đánh được hết"
      const rated = sessions.filter((s) => s.selfRating !== null);
      for (let i = 1; i < rated.length; i++) {
        if (rated[i - 1].selfRating === 'all' && rated[i].selfRating === 'all') return true;
      }
      return false;
    }
    case 3:
      // APP: đoán nốt (có mốc Đô) đúng ≥ 8/10
      return ear8of10(sessions, (a) => isPitch(a.expected));
    case 4:
      // Giữ nhịp đều ≥ 8 ô nhịp ở Mức 2
      return runs.some((r) => {
        const t = findTune(r.songId);
        return r.mode === 'tempo' && r.level === 2 && !r.phrase && r.passed && !!t && measureCount(t) >= 8;
      });
    case 5:
      return runs.some((r) => r.songId === 'ode_to_joy_easy' && r.mode === 'tempo' && r.bpm >= 60 && !r.phrase && r.passed);
    case 6:
      // Như tuần 3, dải tay trái
      return ear8of10(sessions, (a) => isPitch(a.expected) && a.expected.endsWith('3'));
    case 7:
      return runs.some(
        (r) => r.songId === 'ode_to_joy_easy' && r.mode === 'tempo' && r.hints === 'staff' && !r.phrase && r.passed,
      );
    case 8:
      return sessions.some((s) => s.parentAssessments.some((a) => a.note === 'medal' && a.result === 'correct'));
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
  | { kind: 'posture'; short: boolean }
  | { kind: 'review'; segment: Segment }
  | { kind: 'quiz'; title: string; intro: string; quiz: QuizSpec; warmup: boolean }
  | { kind: 'activity'; activity: Activity; last: boolean }
  | { kind: 'teach'; emoji: string; text: string }
  | { kind: 'rating' };

/** Mọi nốt rời (1 phím, không phải nhại lại/khuông) trong các hoạt động Từng nốt của bài. */
export function lessonNoteTargets(lesson: Lesson): Target[] {
  return lesson.activities.flatMap((a) =>
    a.kind === 'notes' ? a.segment.targets.filter((t) => t.keys.length === 1 && !t.sequence && !t.staff) : [],
  );
}

/**
 * "Ôn nhanh" (v2): 4 nốt xen kẽ lấy từ tuần trước và các bài đã học — gợi nhớ ngắt quãng.
 */
export function reviewSegment(lesson: Lesson, data: Readonly<AppData>, rng: () => number = Math.random): Segment | null {
  const done = new Set(data.progress.lessonsCompleted);
  const pools: Target[][] = [];
  for (const w of WEEKS) {
    if (w.week > lesson.week) break;
    const ts = w.lessons
      .filter((l) => l.id !== lesson.id && (w.week < lesson.week || done.has(l.id)))
      .flatMap(lessonNoteTargets);
    if (ts.length) pools.push(ts);
  }
  if (!pools.length) return null;
  const recent = pools[pools.length - 1];
  const older = pools.slice(0, -1).flat();
  const picked: Target[] = [];
  const seen = new Set<string>();
  const take = (from: Target[], n: number) => {
    // Xáo trộn (Fisher–Yates) rồi lấy lần lượt các nốt chưa có
    const arr = [...from];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1)) % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    for (const t of arr) {
      if (n <= 0) break;
      if (seen.has(t.noteId)) continue;
      seen.add(t.noteId);
      picked.push({ ...t, subtitle: t.hand === 'LH' ? 'Ôn bài cũ — tay trái' : 'Ôn bài cũ' });
      n--;
    }
  };
  take(recent, older.length ? 2 : 4);
  take(older, 4 - picked.length);
  take(recent, 4 - picked.length);
  if (picked.length < 2) return null;
  return {
    id: `review-${lesson.id}`,
    step: 'Ôn nhanh',
    title: 'Ôn nhanh ⚡',
    intro: 'Mình ôn lại vài nốt cũ thật nhanh nhé!',
    targets: picked,
  };
}

/**
 * Kế hoạch một buổi v2 (vẫn 10–15'):
 * Tư thế 1' → Ôn nhanh 1' (từ tuần 2) → Khởi động tai/đọc nốt 2' → Bài mới → Con làm thầy 1' → Tổng kết 1'.
 * replay=true ("Chơi lại bài vừa học"): chỉ bài + tổng kết.
 */
export function buildSessionPlan(
  lesson: Lesson,
  data?: Readonly<AppData>,
  opts: { replay?: boolean; rng?: () => number } = {},
): SessionStep[] {
  const plan = weekPlan(lesson.week);
  const steps: SessionStep[] = [];
  const isStage = lesson.activities.some((a) => a.kind === 'stage');
  if (!opts.replay && !isStage) {
    const completed = data?.sessions.filter((s) => s.completed).length ?? 0;
    steps.push({ kind: 'posture', short: completed >= 3 });
    const review = data ? reviewSegment(lesson, data, opts.rng) : null;
    if (review) steps.push({ kind: 'review', segment: review });
    if (plan.warmup) {
      steps.push({ kind: 'quiz', title: warmupTitle(plan.warmup), intro: warmupIntro(plan.warmup), quiz: plan.warmup, warmup: true });
    }
  }
  lesson.activities.forEach((activity, i) =>
    steps.push({ kind: 'activity', activity, last: i === lesson.activities.length - 1 }),
  );
  if (!opts.replay && !isStage) steps.push({ kind: 'teach', ...plan.teach });
  steps.push({ kind: 'rating' });
  return steps;
}

export function warmupTitle(q: QuizSpec): string {
  return { updown: 'Lên hay xuống? ⬆️⬇️', stepskip: 'Bước hay nhảy? 🐸', identify: 'Nốt nào đây? 👂', read: 'Đọc nốt 📖' }[q.variant];
}

function warmupIntro(q: QuizSpec): string {
  return {
    updown: 'App đàn 2 nốt. Nốt sau CAO hơn (lên) hay THẤP hơn (xuống)?',
    stepskip: 'Hai nốt cạnh nhau là BƯỚC. Cách một phím là NHẢY.',
    identify: 'Đầu tiên app đàn nốt Đô làm mốc, rồi đàn một nốt bí ẩn. Con chạm đúng phím nhé!',
    read: 'Nốt hiện trên khuông — con chạm đúng phím trên iPad.',
  }[q.variant];
}

export function sessionsToday(data: Readonly<AppData>, today: string): Session[] {
  return data.sessions.filter((s) => s.date === today);
}

/** Phút đã học hôm nay (cho giới hạn ngày — Phase 3, chỉ khi phụ huynh bật). */
export function minutesToday(data: Readonly<AppData>, today: string): number {
  return data.progress.practiceDays[today]?.minutes ?? 0;
}
