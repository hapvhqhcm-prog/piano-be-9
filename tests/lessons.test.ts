import { describe, expect, it } from 'vitest';
import { WEEKS, buildSessionPlan, findLesson, nextLesson, weekPassed } from '../src/lessons/lessonEngine';
import { findTune } from '../src/music/exercises';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';

const store = () => new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 4));

describe('lessonEngine', () => {
  it('buổi tuần 1: Tư thế → Khởi động "Lên hay xuống?" → Bài mới → Con làm thầy → Tổng kết', () => {
    const kinds = buildSessionPlan(findLesson('w1-l1')!).map((s) => s.kind);
    expect(kinds).toEqual(['posture', 'quiz', 'activity', 'activity', 'teach', 'rating']);
  });

  it('từ tuần 2 có "Ôn nhanh" (nốt cũ); "Chơi lại" chỉ còn bài + tổng kết', () => {
    const st = store();
    ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4'].forEach((id) => st.markLessonCompleted(id));
    const plan = buildSessionPlan(findLesson('w2-l1')!, st.get(), { rng: () => 0.3 });
    expect(plan.map((s) => s.kind)).toEqual(['posture', 'review', 'quiz', 'activity', 'activity', 'teach', 'rating']);
    const review = plan.find((s) => s.kind === 'review');
    expect(review && review.kind === 'review' && review.segment.targets.length).toBeGreaterThanOrEqual(2);
    expect(buildSessionPlan(findLesson('w3-l2')!, st.get(), { replay: true }).map((s) => s.kind)).toEqual([
      'activity', 'activity', 'activity', 'rating',
    ]);
  });

  it('tư thế rút gọn sau 3 buổi; buổi Sân khấu không có tư thế/khởi động', () => {
    const st = store();
    for (let i = 0; i < 3; i++) st.finishSession(st.startSession('w1-l1').id);
    const p = buildSessionPlan(findLesson('w1-l2')!, st.get())[0];
    expect(p).toEqual({ kind: 'posture', short: true });
    expect(buildSessionPlan(findLesson('w8-stage')!, st.get()).map((s) => s.kind)).toEqual(['activity', 'rating']);
  });

  it('tuần 1 đi đúng thứ tự B1 → B5', () => {
    const steps = ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4'].flatMap((id) =>
      findLesson(id)!.activities.flatMap((a) => (a.kind === 'notes' ? [a.segment.step] : [])),
    );
    expect([...new Set(steps)]).toEqual(['B1', 'B2', 'B3', 'B4', 'B5']);
  });

  it('8 tuần, mỗi tuần có bài, khởi động, "con làm thầy" và tiêu chí; bài hát trong bài học đều tồn tại', () => {
    expect(WEEKS).toHaveLength(8);
    for (const w of WEEKS) {
      expect(w.lessons.length).toBeGreaterThan(0);
      expect(w.teach.text.length).toBeGreaterThan(5);
      expect(w.criterion.text.length).toBeGreaterThan(5);
      for (const l of w.lessons) {
        expect(l.id.startsWith(`w${w.week}-`)).toBe(true);
        for (const a of l.activities) if (a.kind === 'song') expect(findTune(a.songId), a.songId).toBeDefined();
      }
    }
    // Mọi bài hát đều được dùng trong ít nhất một bài học hoặc sân khấu/thư viện
    expect(new Set(WEEKS.flatMap((w) => w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : []))))).size).toBeGreaterThanOrEqual(15);
  });

  it('Học tiếp: bài chưa xong → bài kiểm tra → ôn', () => {
    const st = store();
    expect(nextLesson(st.get()).id).toBe('w1-l1');
    ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4'].forEach((id) => st.markLessonCompleted(id));
    expect(nextLesson(st.get()).id).toBe('w1-test');
  });

  it('tuần 1 qua khi phụ huynh xác nhận C4 đúng 10/10, không có "Thử lại"', () => {
    const st = store();
    const s = st.startSession('w1-test');
    for (let i = 0; i < 9; i++) st.addParentAssessment(s.id, 'C4', 'correct');
    expect(weekPassed(1, st.get())).toBe(false);
    st.addParentAssessment(s.id, 'C4', 'retry');
    st.addParentAssessment(s.id, 'C4', 'correct');
    expect(weekPassed(1, st.get())).toBe(false);
    st.amendLastParentAssessment(s.id, 'correct');
    st.setParentAssessment(s.id, 9, 'correct');
    expect(weekPassed(1, st.get())).toBe(true);
  });

  it('tuần 2 qua khi 2 buổi LIỀN bé chọn "Đánh được hết"', () => {
    const st = store();
    for (const r of ['all', 'some', 'all'] as const) st.setSelfRating(st.startSession('w2-l1').id, r);
    expect(weekPassed(2, st.get())).toBe(false);
    st.setSelfRating(st.startSession('w2-l2').id, 'all');
    expect(weekPassed(2, st.get())).toBe(true);
  });

  it('tuần 3 qua khi tai nghe đúng ≥ 8/10 (APP)', () => {
    const st = store();
    const s = st.startSession('w3-l1');
    for (let i = 0; i < 7; i++) st.addAppAssessment(s.id, 'C4', 'C4');
    for (let i = 0; i < 3; i++) st.addAppAssessment(s.id, 'G4', 'F4');
    expect(weekPassed(3, st.get())).toBe(false);
    const s2 = st.startSession('w3-l2');
    for (let i = 0; i < 8; i++) st.addAppAssessment(s2.id, 'E4', 'E4');
    for (let i = 0; i < 2; i++) st.addAppAssessment(s2.id, 'E4', 'D4');
    expect(weekPassed(3, st.get())).toBe(true);
  });

  it('tuần 3: lượt chơi bỏ dở rồi chơi lại trong cùng buổi vẫn chấm đúng', () => {
    const st = store();
    const s = st.startSession('w3-l1');
    for (let i = 0; i < 4; i++) st.addAppAssessment(s.id, 'C4', 'D4'); // bỏ dở, sai hết
    for (let i = 0; i < 9; i++) st.addAppAssessment(s.id, 'E4', 'E4');
    st.addAppAssessment(s.id, 'E4', 'F4');
    expect(weekPassed(3, st.get())).toBe(true);
  });
});

describe('tiêu chí tuần 1 với micro', () => {
  it('micro nghe C4 đúng ngay 10 lần → qua tuần; một lần đàn nhầm trước → chưa qua', () => {
    const st = store();
    const s = st.startSession('w1-test');
    for (let i = 0; i < 6; i++) st.addMicAssessment(s.id, { expected: 'C4', firstHeard: 'C4', wrongCount: 0 });
    for (let i = 0; i < 4; i++) st.addParentAssessment(s.id, 'C4', 'correct');
    expect(weekPassed(1, st.get())).toBe(true);

    const st2 = store();
    const s2 = st2.startSession('w1-test');
    for (let i = 0; i < 10; i++) st2.addMicAssessment(s2.id, { expected: 'C4', firstHeard: 'C4', wrongCount: 0 });
    st2.addMicAssessment(s2.id, { expected: 'C4', firstHeard: 'D4', wrongCount: 1 });
    expect(weekPassed(1, st2.get())).toBe(false);
    st2.overrideLastMic(s2.id, 'correct'); // micro nghe nhầm, bố mẹ sửa thành đúng
    expect(weekPassed(1, st2.get())).toBe(true);
  });
});

describe('tiêu chí tuần 4–8 (v2)', () => {
  const run = (o: Partial<import('../src/progress/schema').SongRun>) => ({
    songId: 'ex_c_quarter', mode: 'tempo' as const, level: 2 as const, bpm: 60, hints: 'full' as const,
    phrase: null, total: 32, hits: 30, source: 'mic' as const, passed: true, ...o,
  });

  it('tuần 4: một lượt Mức 2 trọn ≥ 8 ô nhịp đạt', () => {
    const st = store();
    const s = st.startSession('w4-l2');
    st.addSongRun(s.id, run({ songId: 'hot_cross_buns' })); // 4 ô nhịp — chưa đủ
    expect(weekPassed(4, st.get())).toBe(false);
    st.addSongRun(s.id, run({ phrase: [0, 4] })); // chỉ một câu
    expect(weekPassed(4, st.get())).toBe(false);
    st.addSongRun(s.id, run({}));
    expect(weekPassed(4, st.get())).toBe(true);
  });

  it('tuần 5: Ode to Joy trọn bài, 60 BPM; tuần 7: chỉ nhìn khuông', () => {
    const st = store();
    const s5 = st.startSession('w5-l2');
    st.addSongRun(s5.id, run({ songId: 'ode_to_joy_easy', bpm: 50 }));
    expect(weekPassed(5, st.get())).toBe(false);
    st.addSongRun(s5.id, run({ songId: 'ode_to_joy_easy' }));
    expect(weekPassed(5, st.get())).toBe(true);
    const s7 = st.startSession('w7-l2');
    st.addSongRun(s7.id, run({ songId: 'ode_to_joy_easy', hints: 'names' }));
    expect(weekPassed(7, st.get())).toBe(false);
    st.addSongRun(s7.id, run({ songId: 'ode_to_joy_easy', hints: 'staff', source: 'parent' }));
    expect(weekPassed(7, st.get())).toBe(true);
  });

  it('tuần 6: tai nghe tay trái 8/10; tuần 8: huy chương', () => {
    const st = store();
    const s6 = st.startSession('w6-l1');
    for (let i = 0; i < 8; i++) st.addAppAssessment(s6.id, 'E4', 'E4'); // dải tay phải không tính
    expect(weekPassed(6, st.get())).toBe(false);
    for (let i = 0; i < 9; i++) st.addAppAssessment(s6.id, 'E3', 'E3');
    st.addAppAssessment(s6.id, 'E3', 'D3');
    expect(weekPassed(6, st.get())).toBe(true);
    const s8 = st.startSession('w8-stage');
    expect(weekPassed(8, st.get())).toBe(false);
    st.addParentAssessment(s8.id, 'medal', 'correct');
    expect(weekPassed(8, st.get())).toBe(true);
  });
});
