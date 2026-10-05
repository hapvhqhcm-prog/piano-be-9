import { describe, expect, it } from 'vitest';
import { weekPassed } from '../src/lessons/lessonEngine';
import { migrate, migrateCurriculum, renumberId } from '../src/progress/migrations';
import { MemoryStorage, ProgressStore, STORAGE_KEY } from '../src/progress/ProgressStore';
import { CURRICULUM_REV, defaultData, validateAppData } from '../src/progress/schema';

/**
 * Giáo trình rev 2 (OWNER duyệt 2026-10-05): chèn tuần 20 "Đọc nốt cao" → tuần 20–24 cũ thành 21–25.
 * Dữ liệu cũ (không có curriculumRev) được đánh số lại đúng MỘT lần.
 */
const fixedNow = () => new Date(2026, 9, 5, 17, 0, 0);

const session = (id: string, lessonId: string, extra: Record<string, unknown> = {}) => ({
  id,
  date: '2026-10-01',
  lessonId,
  parentAssessments: [],
  appAssessments: [],
  micAssessments: [],
  songRuns: [],
  selfRating: null,
  startedAt: 1,
  endedAt: 2,
  minutes: 10,
  completed: true,
  checklist: {},
  ...extra,
});

const run = (songId: string) => ({
  songId, mode: 'wait', bpm: 60, hints: 'names', phrase: null, total: 20, hits: 18, source: 'parent', passed: true, ts: 1,
});

/** Dữ liệu kiểu cũ (rev 1, 24 tuần): bé đang ở tuần 22 (Đọc nhạc hai khóa cũ). */
function oldData(week = 22): Record<string, unknown> {
  const d = JSON.parse(JSON.stringify(defaultData(fixedNow()))) as Record<string, unknown>;
  delete d.curriculumRev;
  d.progress = {
    currentWeek: week,
    lessonsCompleted: ['w5-l1', 'w19-l2', 'w20-l1', 'w20-l2', 'w21-l1', 'w21-l2', 'w22-l1'],
    practiceDays: {},
  };
  d.sessions = [
    session('a', 'w19-l1'),
    session('b', 'w20-l2', { songRuns: [run('minuet_g')] }), // Minuet cũ
    session('c', 'w21-l2', { songRuns: [run('fur_elise')] }), // Für Elise cũ
    session('d', 'w22-l1', { songRuns: [run('sight:C:RH')] }),
    session('e', 'w21-song-canon'), // bài tự chọn ở thư viện
    session('f', 'w2-l1'),
  ];
  return d;
}

describe('đánh số lại tuần 20–24 → 21–25', () => {
  it('renumberId chỉ đổi mã tuần 20–24', () => {
    expect(renumberId('w20-l1')).toBe('w21-l1');
    expect(renumberId('w24-stage')).toBe('w25-stage');
    expect(renumberId('w22-song-canon')).toBe('w23-song-canon');
    expect(renumberId('w24-daily')).toBe('w25-daily');
    expect(renumberId('w19-l2')).toBe('w19-l2');
    expect(renumberId('w2-l1')).toBe('w2-l1');
    expect(renumberId('w200-l1')).toBe('w200-l1');
    expect(renumberId('review-w20-l1')).toBe('review-w20-l1');
  });

  it('dữ liệu cũ ở tuần 22 → tuần 23, mã bài học / buổi được đánh số lại, tiến độ không mất', () => {
    const d = migrate(oldData(22));
    expect(validateAppData(d)).toEqual([]);
    expect(d.curriculumRev).toBe(CURRICULUM_REV);
    expect(d.progress.currentWeek).toBe(23);
    expect(d.progress.lessonsCompleted).toEqual(['w5-l1', 'w19-l2', 'w21-l1', 'w21-l2', 'w22-l1', 'w22-l2', 'w23-l1']);
    expect(d.sessions.map((s) => s.lessonId)).toEqual(['w19-l1', 'w21-l2', 'w22-l2', 'w23-l1', 'w22-song-canon', 'w2-l1']);
    // songRuns (mã bài hát) giữ nguyên
    expect(d.sessions[1].songRuns[0].songId).toBe('minuet_g');
    // Tiêu chí tuần vẫn đúng: Minuet (nay tuần 21), Für Elise (nay tuần 22)
    expect(weekPassed(21, d)).toBe(true);
    expect(weekPassed(22, d)).toBe(true);
    expect(weekPassed(20, d)).toBe(false); // tuần mới chưa có dữ liệu
  });

  it('dữ liệu cũ ở tuần 5 không đổi (trừ dấu curriculumRev)', () => {
    const raw = oldData(5);
    (raw.progress as { lessonsCompleted: string[] }).lessonsCompleted = ['w1-l1', 'w5-l1'];
    raw.sessions = [session('a', 'w5-l1'), session('b', 'w4-l2')];
    const d = migrate(raw);
    expect(d.progress.currentWeek).toBe(5);
    expect(d.progress.lessonsCompleted).toEqual(['w1-l1', 'w5-l1']);
    expect(d.sessions.map((s) => s.lessonId)).toEqual(['w5-l1', 'w4-l2']);
    expect(d.curriculumRev).toBe(CURRICULUM_REV);
  });

  it('dữ liệu cũ ở tuần 19 giữ tuần 19 (tuần 20 mới sẽ là tuần kế tiếp); tuần 24 cũ → 25', () => {
    expect(migrate(oldData(19)).progress.currentWeek).toBe(19);
    // tuần 20 cũ (Minuet chưa qua) → học tuần chuẩn bị mới trước
    expect(migrate(oldData(20)).progress.currentWeek).toBe(20);
    expect(migrate(oldData(24)).progress.currentWeek).toBe(25);
  });

  it('chạy đúng một lần (idempotent): dữ liệu đã có curriculumRev = 2 không bị đổi nữa', () => {
    const once = migrate(oldData(22));
    const twice = migrate(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(migrateCurriculum(once as unknown as Record<string, unknown>)).toBe(once);
  });

  it('cài mới bắt đầu ở rev 2 — mã tuần 20+ của bản mới KHÔNG bị dịch', () => {
    const st = new ProgressStore(new MemoryStorage(), fixedNow);
    expect(st.get().curriculumRev).toBe(CURRICULUM_REV);
    st.setCurrentWeek(21);
    st.markLessonCompleted('w21-l1');
    const kv = new MemoryStorage();
    kv.setItem(STORAGE_KEY, JSON.stringify(st.get()));
    const reopened = new ProgressStore(kv, fixedNow);
    expect(reopened.get().progress.currentWeek).toBe(21);
    expect(reopened.get().progress.lessonsCompleted).toEqual(['w21-l1']);
  });

  it('mở app với dữ liệu cũ trong localStorage → đánh số lại; lưu rồi mở lại vẫn giữ nguyên', () => {
    const kv = new MemoryStorage();
    kv.setItem(STORAGE_KEY, JSON.stringify(oldData(22)));
    const a = new ProgressStore(kv, fixedNow);
    expect(a.get().progress.currentWeek).toBe(23);
    a.markLessonCompleted('w23-l2'); // ghi xuống → có curriculumRev
    expect(JSON.parse(kv.getItem(STORAGE_KEY)!).curriculumRev).toBe(CURRICULUM_REV);
    const b = new ProgressStore(kv, fixedNow);
    expect(b.get().progress.currentWeek).toBe(23);
    expect(b.get().sessions.map((s) => s.lessonId)).toContain('w23-l1');
  });

  it('nhập JSON xuất từ bản cũ cũng được đánh số lại', () => {
    const st = new ProgressStore(new MemoryStorage(), fixedNow);
    expect(st.importJSON(JSON.stringify(oldData(24)))).toEqual({ ok: true });
    expect(st.get().progress.currentWeek).toBe(25);
  });

  it('curriculumRev sai kiểu bị từ chối', () => {
    expect(validateAppData({ ...defaultData(fixedNow()), curriculumRev: 'x' }).length).toBeGreaterThan(0);
    expect(validateAppData({ ...defaultData(fixedNow()), curriculumRev: 0 }).length).toBeGreaterThan(0);
  });
});
