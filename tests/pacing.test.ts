import { describe, expect, it } from 'vitest';
import { activityDoneId, buildSessionPlan, findLesson, nextLesson, weekComplete, weekPassed, weekPlan } from '../src/lessons/lessonEngine';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';

const store = () => new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 5));

/** Tuần 3: tiêu chí APP = đoán nốt đúng 10/10 trong một buổi */
function passWeek3Criterion(st: ProgressStore): void {
  st.setCurrentWeek(3);
  const s = st.startSession(weekPlan(3).lessons[0].id);
  for (let i = 0; i < 10; i++) st.addAppAssessment(s.id, 'E4', 'E4');
  st.finishSession(s.id);
}

describe('nhịp độ giáo trình (rà soát 2026-10-05)', () => {
  it('đạt tiêu chí nhưng CHƯA học hết bài → chưa qua tuần, "Học tiếp" mời bài còn thiếu', () => {
    const st = store();
    passWeek3Criterion(st);
    expect(weekPassed(3, st.get())).toBe(true);
    expect(weekComplete(3, st.get())).toBe(false);
    const regular = weekPlan(3).lessons.filter((l) => !l.isWeekTest);
    st.markLessonCompleted(regular[0].id);
    expect(nextLesson(st.get()).id).toBe(regular[1].id);
    regular.forEach((l) => st.markLessonCompleted(l.id));
    expect(weekComplete(3, st.get())).toBe(true);
  });

  it('hết giờ giữa bài → lần sau chỉ làm các hoạt động CÒN LẠI', () => {
    const st = store();
    const lesson = findLesson('w1-l1')!;
    expect(lesson.activities.length).toBeGreaterThan(1);
    st.markLessonCompleted(activityDoneId(lesson.id, 0));
    const acts = buildSessionPlan(lesson, st.get()).filter((s) => s.kind === 'activity');
    expect(acts.map((s) => (s.kind === 'activity' ? s.index : -1))).toEqual(lesson.activities.map((_, i) => i).slice(1));
    // "Chơi lại" vẫn đủ cả bài
    expect(buildSessionPlan(lesson, st.get(), { replay: true }).filter((s) => s.kind === 'activity').length).toBe(lesson.activities.length);
  });

  it('bài ĐẦU tuần chưa học: khởi động không hỏi điều tuần này mới dạy (tuần 9 không đọc khóa Fa trước)', () => {
    const st = store();
    st.setCurrentWeek(9);
    const first = weekPlan(9).lessons[0];
    const q = buildSessionPlan(first, st.get()).find((s) => s.kind === 'quiz');
    const w9 = weekPlan(9).warmup;
    if (q && q.kind === 'quiz' && w9) expect(q.quiz).not.toEqual(w9);
    // Sau khi học bài đầu → các bài sau dùng khởi động của tuần 9
    st.markLessonCompleted(first.id);
    const second = weekPlan(9).lessons[1];
    const q2 = buildSessionPlan(second, st.get()).find((s) => s.kind === 'quiz');
    if (w9) expect(q2 && q2.kind === 'quiz' && q2.quiz.variant).toBe(w9.variant);
  });

  it('tuần chấm bằng khởi động (tuần 20 đọc nốt cao): buổi đầu học bài TRƯỚC rồi mới khởi động-chấm', () => {
    const st = store();
    st.setCurrentWeek(20);
    const kinds = buildSessionPlan(weekPlan(20).lessons[0], st.get()).map((s) => s.kind);
    const firstAct = kinds.indexOf('activity');
    const quizAt = kinds.lastIndexOf('quiz');
    expect(quizAt).toBeGreaterThan(firstAct);
  });

  it('giả lập "bé giỏi": mọi bài thường của mọi tuần đều được học trước khi sang tuần', () => {
    const st = store();
    // Không giả lập tiêu chí; chỉ kiểm: nextLesson luôn mời bài thường chưa học trước bài kiểm tra
    for (let w = 1; w <= 25; w++) {
      st.setCurrentWeek(w);
      const regular = weekPlan(w).lessons.filter((l) => !l.isWeekTest);
      for (const l of regular) {
        expect(nextLesson(st.get()).id).toBe(l.id);
        st.markLessonCompleted(l.id);
      }
    }
  });
});
