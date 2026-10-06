import { describe, expect, it } from 'vitest';
import { MAX_QUIZ_ROUNDS, MAX_WEEK, buildSessionPlan, nextLesson, weekComplete } from '../src/lessons/lessonEngine';
import type { Lesson } from '../src/lessons/types';
import { makeQuestion, type QuizSpec } from '../src/practice/quiz';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';

/**
 * QA 2026-10-05: bé GIỎI mà bố mẹ CHỈ bấm "Học tiếp" phải đi hết giáo trình (v5.1: 31 tuần), không kẹt ở tuần nào
 * (trước đây 15/30 tuần kẹt vì "Học tiếp" mời mãi bài cuối tuần, không phải bài cần cho tiêu chí 2 ngày).
 */
describe('đi hết giáo trình chỉ bằng "Học tiếp"', () => {
  it('bé làm đúng mọi thứ, 2 buổi/ngày → qua đủ 31 tuần', () => {
    let day = 0;
    let clock = 0;
    const now = () => new Date(2026, 10, 1 + day, 17, 0, clock++ % 60);
    const st = new ProgressStore(new MemoryStorage(), now);
    let x = 1;
    const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const quiz = (sid: string, q: QuizSpec) => {
      let prev;
      // chơi thử 2026-10-06: trò tai nghe / đọc nốt ≤ 6 lượt (tiêu chí ≥ 5/6) — đúng số lượt app hỏi
      for (let k = 0; k < Math.min(q.rounds, MAX_QUIZ_ROUNDS); k++) {
        prev = makeQuestion(q, rng, prev);
        st.addAppAssessment(sid, prev.expected, prev.expected);
      }
    };
    const play = (lesson: Lesson) => {
      // v5.1: theo ĐÚNG kế hoạch buổi (khởi động có thể bị bỏ khi bài dài / giới hạn 7 màn)
      const steps = buildSessionPlan(lesson, st.get());
      const s = st.startSession(lesson.id);
      for (const step of steps) if (step.kind === 'quiz') quiz(s.id, step.quiz);
      for (const a of lesson.activities) {
        if (a.kind === 'notes') a.segment.targets.forEach((t) => st.addParentAssessment(s.id, t.noteId, 'correct'));
        else if (a.kind === 'quiz') quiz(s.id, a.quiz);
        else if (a.kind === 'song')
          // v5.1: lượt tách tay ghi `hand` + câu khó `phrase` (không tính cho tiêu chí) — như song.ts
          st.addSongRun(s.id, { songId: a.songId, mode: a.mode, level: a.mode === 'tempo' ? (a.level ?? 2) : undefined, bpm: 72, hints: a.hints, phrase: a.phrase ?? null, total: 8, hits: 8, source: 'mic', passed: true, ...(a.hand ? { hand: a.hand } : {}) });
        else if (a.kind === 'sight')
          for (let k = 0; k < a.count; k++)
            st.addSongRun(s.id, { songId: `sight:${a.position}:${a.hand}`, mode: 'wait', bpm: 60, hints: a.hints, phrase: null, total: 8, hits: 8, source: 'mic', passed: true });
        else if (a.kind === 'stage') st.addParentAssessment(s.id, 'medal', 'correct');
      }
      st.setSelfRating?.(s.id, 'all');
      st.finishSession(s.id);
      st.markLessonCompleted(lesson.id);
      // như session.ts finish(): sang tuần khi đạt tiêu chí + học hết bài
      const w = st.get().progress.currentWeek;
      if (lesson.week === w && weekComplete(w, st.get()) && w < MAX_WEEK) st.setCurrentWeek(w + 1);
    };
    const stuck: number[] = [];
    let sessions = 0;
    while (sessions < 400) {
      const w = st.get().progress.currentWeek;
      if (w === MAX_WEEK && weekComplete(MAX_WEEK, st.get())) break;
      const before = w;
      play(nextLesson(st.get(), rng));
      sessions++;
      if (sessions % 2 === 0) day++;
      // cùng một tuần quá 14 buổi = kẹt
      if (st.get().progress.currentWeek === before && st.get().sessions.filter((s) => s.lessonId.startsWith(`w${w}-`)).length > 14) {
        stuck.push(w);
        break;
      }
    }
    expect(stuck).toEqual([]);
    expect(weekComplete(MAX_WEEK, st.get())).toBe(true);
    // Hợp lý: không quá nhanh (mỗi tuần ≥ 2 ngày vì tiêu chí 2 ngày ở nhiều tuần)
    expect(sessions).toBeGreaterThan(MAX_WEEK * 2);
  }, 60_000);
});
