import { describe, expect, it } from 'vitest';
import { buildSessionPlan, findLesson, nextLesson, weekPassed } from '../src/lessons/lessonEngine';
import { EarGame } from '../src/practice/EarGame';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';

const store = () => new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 4));

describe('lessonEngine', () => {
  it('buổi tuần 1: Tư thế → Bài mới → Tổng kết (chưa có tai nghe)', () => {
    const kinds = buildSessionPlan(findLesson('w1-l1')!).map((s) => s.kind);
    expect(kinds).toEqual(['posture', 'segment', 'segment', 'rating']);
  });

  it('buổi tuần 2–3 có Tai nghe; "Chơi lại" bỏ tư thế và tai nghe', () => {
    expect(buildSessionPlan(findLesson('w2-l1')!).map((s) => s.kind)).toEqual([
      'posture', 'ear', 'segment', 'segment', 'rating',
    ]);
    expect(buildSessionPlan(findLesson('w3-l2')!, { replay: true }).map((s) => s.kind)).toEqual([
      'segment', 'rating',
    ]);
  });

  it('tuần 1 đi đúng thứ tự B1 → B5', () => {
    const steps = ['w1-l1', 'w1-l2', 'w1-l3'].flatMap((id) => findLesson(id)!.segments.map((s) => s.step));
    expect(steps).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B5']);
  });

  it('Học tiếp: bài chưa xong → bài kiểm tra → ôn', () => {
    const st = store();
    expect(nextLesson(st.get()).id).toBe('w1-l1');
    ['w1-l1', 'w1-l2', 'w1-l3'].forEach((id) => st.markLessonCompleted(id));
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

describe('EarGame (APP_ASSESSMENT)', () => {
  it('chỉ tính lần chạm đầu tiên mỗi lượt; chấm đúng', () => {
    let i = 0;
    const seq = [0, 0.5, 0.9];
    const g = new EarGame(['C4', 'D4', 'E4'], 2, () => seq[i++ % seq.length]);
    const p = g.next()!;
    expect(g.answer(p)).toEqual({ expected: p, actual: p, correct: true });
    expect(g.answer('E4')).toBeNull();
    const q = g.next()!;
    const wrong = q === 'C4' ? 'D4' : 'C4';
    expect(g.answer(wrong)?.correct).toBe(false);
    expect(g.done).toBe(true);
    expect(g.score).toBe(1);
    expect(g.next()).toBeNull();
  });

  it('không lặp lại nốt ngay lượt kế tiếp', () => {
    const g = new EarGame(['C4', 'D4'], 6, () => 0);
    let prev = '';
    for (let r = 0; r < 6; r++) {
      const p = g.next()!;
      expect(p).not.toBe(prev);
      prev = p;
      g.answer(p);
    }
  });
});
