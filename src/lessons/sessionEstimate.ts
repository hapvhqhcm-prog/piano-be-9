/**
 * Ước lượng THÔ thời lượng một buổi (phút) + bài có chỗ cho "Đọc nhạc 1 phút" không.
 */
import { findTune } from '../music/exercises';
import { slice } from '../music/tune';
import type { Lesson } from './types';
import { MAX_QUIZ_ROUNDS, weekPlan } from './curriculum';

/** v5.2 — Đọc nhạc 1 phút mỗi ngày bắt đầu từ tuần này. */
export const SIGHT_DAILY_WEEK = 8;
/** Ước lượng (phút) của bước đọc nhạc mỗi ngày. */
export const SIGHT_DAILY_MIN = 1;
/** Trần ước lượng một buổi (phút) — test pacing; bước đọc nhạc mỗi ngày chỉ thêm khi còn chỗ. */
export const MAX_SESSION_MINUTES = 12;

/**
 * Bài có chỗ cho "Đọc nhạc 1 phút" không: từ tuần SIGHT_DAILY_WEEK, không phải bài kiểm tra / sân khấu / luyện tập mỗi ngày,
 * bài chưa có hoạt động đọc nhạc riêng (có rồi thì chính nó là bài đọc nhạc hôm nay — "gộp"), và ước lượng buổi + 1 phút ≤ 12.
 */
export function sightDailyFits(lesson: Lesson): boolean {
  return (
    lesson.week >= SIGHT_DAILY_WEEK &&
    !lesson.isWeekTest &&
    !lesson.id.endsWith('-daily') &&
    !lesson.activities.some((a) => a.kind === 'sight' || a.kind === 'stage') &&
    baseLessonMinutes(lesson) + SIGHT_DAILY_MIN <= MAX_SESSION_MINUTES
  );
}

/**
 * Ước lượng THÔ thời lượng một buổi (phút), để kiểm "buổi ≤ ~12 phút" (test pacing). Không dùng để hẹn giờ.
 * v5.1 — phần cố định: tư thế + khởi động kỹ thuật 1,5 · ôn nhanh 1 · màn kết (con làm thầy + tự chấm) 1,5
 * · khởi động tai/đọc nốt 1,5 nếu buổi CÓ bước này (tuần có khởi động; bị bỏ khi bài ≥ 3 lượt bài hát hoặc ≥ 4 hoạt động,
 * trừ tuần chấm bằng khởi động). "Ôn bài cũ" không tính (chỉ có khi còn chỗ, và bị bỏ khi hết giờ).
 * v5.2: phần mở đầu 1,5 nay là khởi động bằng nhạc ~25" + câu nhắc tư thế + khởi động kỹ thuật 30" (THAY thẻ tư thế — không
 * thêm giờ); + 1 phút "Đọc nhạc mỗi ngày" khi bài có chỗ (sightDailyFits).
 * Hoạt động: kỹ thuật 1 · từng nốt 0,3/việc · trò nghe/đọc 0,2/lượt · nhịp 0,4/mẫu · đọc nhạc 1/đoạn
 * · sáng tạo 2 (sáng tác 3) · sắc thái 0,3/lượt · bài hát chờ 3 giây/nốt (tách tay: chỉ nốt của tay đó; một câu: chỉ ô của câu) + 0,5
 * · theo nhịp 2 lượt cả bài + 0,5.
 */
export function estimateLessonMinutes(lesson: Lesson): number {
  const m = baseLessonMinutes(lesson);
  return m && sightDailyFits(lesson) ? Math.round((m + SIGHT_DAILY_MIN) * 10) / 10 : m;
}

/** Ước lượng KHÔNG gồm bước "Đọc nhạc 1 phút" (v5.2) — xem estimateLessonMinutes. */
function baseLessonMinutes(lesson: Lesson): number {
  if (lesson.activities.some((a) => a.kind === 'stage')) return 0;
  const plan = weekPlan(lesson.week);
  const songs = lesson.activities.filter((a) => a.kind === 'song').length;
  const criterionQuiz = plan.criterion.who === 'APP';
  const warm = !!plan.warmup && (criterionQuiz || (songs < 3 && lesson.activities.length < 4));
  let m = 1.5 + 1 + 1.5 + (warm ? 1.5 : 0);
  for (const a of lesson.activities) {
    switch (a.kind) {
      case 'technique':
        m += 1;
        break;
      case 'notes':
        m += 0.3 * a.segment.targets.length;
        break;
      case 'quiz':
        m += 0.2 * Math.min(a.quiz.rounds, MAX_QUIZ_ROUNDS);
        break;
      case 'rhythm':
        m += 0.4 * a.patterns.length;
        break;
      case 'sight':
        m += a.count;
        break;
      case 'improv':
        m += a.mode === 'compose' ? 3 : 2;
        break;
      case 'dynamics':
        m += 0.3 * a.rounds.length;
        break;
      case 'sing':
        // (2026-10-08) hát rồi đàn: ~0,6 phút/lượt (nghe – hát từng nốt – đàn)
        m += 0.6 * a.rounds.length;
        break;
      case 'song': {
        const full = findTune(a.songId);
        if (!full) break;
        // v5.1: tập một câu (phrase) → chỉ tính các ô của câu đó
        const t = a.phrase ? slice(full, a.phrase[0], a.phrase[1]) : full;
        const voice = a.hand === 'RH' ? t.notes : a.hand === 'LH' ? (t.lh ?? t.notes) : [...t.notes, ...(t.lh ?? [])];
        const notes = voice.filter((n) => !n.rest).length;
        const beats = t.notes.reduce((x, n) => x + n.beats, 0);
        m += a.mode === 'wait' ? (notes * 3) / 60 + 0.5 : (2 * beats) / Math.max(40, t.bpm) + 0.5;
        break;
      }
      default:
        break;
    }
  }
  return Math.round(m * 10) / 10;
}
