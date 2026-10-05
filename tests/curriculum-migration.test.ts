import { describe, expect, it } from 'vitest';
import { WEEKS, weekPassed } from '../src/lessons/lessonEngine';
import { REV3_LESSON_MAP, REV3_WEEK_MAP, migrate, migrateCurriculum, renumberId, renumberIdRev3 } from '../src/progress/migrations';
import { MemoryStorage, ProgressStore, STORAGE_KEY } from '../src/progress/ProgressStore';
import { CURRICULUM_REV, defaultData, validateAppData } from '../src/progress/schema';

/**
 * Giáo trình rev 2 (OWNER duyệt 2026-10-05): chèn tuần 20 "Đọc nốt cao" → tuần 20–24 cũ thành 21–25.
 * Giáo trình rev 3 (v5, OWNER duyệt 2026-10-05): 30 tuần — bảng OLD→NEW (REV3_WEEK_MAP).
 * Dữ liệu cũ được đánh số lại đúng MỘT lần mỗi bậc; rev 1 đi qua rev 2 rồi rev 3.
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

/** Dữ liệu kiểu rev 1 (24 tuần): bé đang ở tuần 22 (Đọc nhạc hai khóa cũ). */
function rev1Data(week = 22): Record<string, unknown> {
  const d = JSON.parse(JSON.stringify(defaultData(fixedNow()))) as Record<string, unknown>;
  delete d.curriculumRev;
  d.progress = {
    currentWeek: week,
    lessonsCompleted: ['w5-l1', 'w19-l2', 'w20-l1', 'w20-l2', 'w21-l1', 'w21-l2', 'w22-l1'],
    practiceDays: {},
  };
  d.sessions = [
    session('a', 'w19-l1'),
    session('b', 'w20-l2', { songRuns: [run('minuet_g')] }), // Minuet (rev 1: tuần 20)
    session('b2', 'w20-l2', { date: '2026-10-02', songRuns: [run('minuet_g')] }), // ngày thứ hai
    session('c', 'w21-l2', { songRuns: [run('fur_elise')] }), // Für Elise (rev 1: tuần 21)
    session('d', 'w22-l1', { songRuns: [run('sight:C:RH')] }),
    session('e', 'w21-song-canon'), // bài tự chọn ở thư viện
    session('f', 'w2-l1'),
  ];
  return d;
}

/** Dữ liệu kiểu rev 2 (25 tuần). */
function rev2Data(week: number, done: string[], sessions: Array<ReturnType<typeof session>>): Record<string, unknown> {
  const d = JSON.parse(JSON.stringify(defaultData(fixedNow()))) as Record<string, unknown>;
  d.curriculumRev = 2;
  d.progress = { currentWeek: week, lessonsCompleted: done, practiceDays: {} };
  d.sessions = sessions;
  return d;
}

describe('rev 1 → 2: đánh số lại tuần 20–24 → 21–25', () => {
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
});

describe('rev 2 → 3 (giáo trình v5, 30 tuần): bảng OLD→NEW', () => {
  it('bảng tuần: đủ 25 tuần cũ, mỗi tuần cũ một tuần mới riêng, trong 1–30; tuần mới chèn = 5, 9, 13, 18, 22', () => {
    const olds = Object.keys(REV3_WEEK_MAP).map(Number);
    expect(olds.sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    const news = Object.values(REV3_WEEK_MAP);
    expect(new Set(news).size).toBe(25);
    for (const w of news) expect(w >= 1 && w <= 30).toBe(true);
    const inserted = Array.from({ length: 30 }, (_, i) => i + 1).filter((w) => !news.includes(w));
    expect(inserted).toEqual([5, 9, 13, 18, 22]);
    // Tuần 1 giữ nguyên; huy chương 8 / 16 / 25 → 10 / 20 / 30
    expect([REV3_WEEK_MAP[1], REV3_WEEK_MAP[8], REV3_WEEK_MAP[16], REV3_WEEK_MAP[25]]).toEqual([1, 10, 20, 30]);
  });

  it('bảng theo NỘI DUNG: bài chính của mỗi tuần cũ nay nằm trong tuần mới tương ứng', () => {
    // Bài hát đặc trưng của tuần cũ (rev 2)
    const SIGNATURE: Record<number, string> = {
      2: 'hot_cross_buns', 3: 'mary_lamb', 4: 'go_tell_aunt_rhody', 5: 'ode_to_joy_easy', 6: 'hot_cross_buns_lh',
      7: 'frere_jacques_easy', 8: 'this_old_man', 9: 'question_answer', 10: 'ode_to_joy_both', 11: 'ode_to_joy_g',
      12: 'waltz_cat', 13: 'ode_to_joy_d', 14: 'ode_to_joy_original', 15: 'scale_c_rh', 17: 'ode_to_joy_chords',
      18: 'silent_night', 19: 'ninja_tiptoe', 20: 'drifting_boat', 21: 'minuet_g', 22: 'fur_elise', 23: 'canon', 24: 'saints_both',
    };
    for (const [old, songId] of Object.entries(SIGNATURE)) {
      const w = WEEKS[REV3_WEEK_MAP[Number(old)] - 1];
      const songs = w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : [])));
      expect(songs, `tuần cũ ${old} → ${w.week}`).toContain(songId);
    }
    // Buổi biểu diễn vẫn là buổi biểu diễn
    for (const old of [8, 16, 25]) {
      expect(WEEKS[REV3_WEEK_MAP[old] - 1].lessons.some((l) => l.id === `w${REV3_WEEK_MAP[old]}-stage`)).toBe(true);
    }
  });

  it('renumberIdRev3: theo bảng tuần; bài chuyển tuần riêng (w14-bkt → w18-bkt); mã khác giữ nguyên', () => {
    expect(renumberIdRev3('w5-l1')).toBe('w6-l1');
    expect(renumberIdRev3('w8-stage')).toBe('w10-stage');
    expect(renumberIdRev3('w14-l1')).toBe('w17-l1');
    expect(renumberIdRev3('w14-bkt')).toBe('w18-bkt');
    expect(renumberIdRev3('w14-bkt#2')).toBe('w18-bkt#2');
    expect(renumberIdRev3('w21-l2')).toBe('w28-l2');
    expect(renumberIdRev3('w23-song-canon')).toBe('w26-song-canon');
    expect(renumberIdRev3('w25-daily')).toBe('w30-daily');
    expect(renumberIdRev3('w1-test')).toBe('w1-test');
    expect(renumberIdRev3('review-w5-l1')).toBe('review-w5-l1');
    expect(renumberIdRev3('w200-l1')).toBe('w200-l1');
    // Mọi bài chuyển tuần riêng đều tồn tại ở giáo trình mới
    for (const id of Object.values(REV3_LESSON_MAP)) expect(WEEKS.some((w) => w.lessons.some((l) => l.id === id)), id).toBe(true);
  });

  it('bé đang học dở tuần 5 cũ → tuần 6 mới (cùng nội dung); bài đã xong giữ; dấu "xong một phần" bị bỏ', () => {
    const raw = rev2Data(5, ['w1-l1', 'w4-l4', 'w5-l1', 'w5-l2#0'], [session('a', 'w5-l1'), session('b', 'w4-l2')]);
    const d = migrate(raw);
    expect(validateAppData(d)).toEqual([]);
    expect(d.curriculumRev).toBe(3);
    expect(d.progress.currentWeek).toBe(6);
    expect(d.progress.lessonsCompleted).toEqual(['w1-l1', 'w4-l4', 'w6-l1']);
    expect(d.sessions.map((s) => s.lessonId)).toEqual(['w6-l1', 'w4-l2']);
  });

  it('bé ở tuần 14 cũ đã học "Bắc kim thang" → tuần 17 mới; bài Bắc kim thang tính xong ở tuần 18', () => {
    const raw = rev2Data(14, ['w14-l1', 'w14-bkt'], [session('a', 'w14-bkt', { songRuns: [run('bac_kim_thang')] })]);
    const d = migrate(raw);
    expect(d.progress.currentWeek).toBe(17);
    expect(d.progress.lessonsCompleted).toEqual(['w17-l1', 'w18-bkt']);
    expect(d.sessions[0].lessonId).toBe('w18-bkt');
  });

  it('mọi tuần cũ 1–25 → tuần mới theo bảng', () => {
    for (let w = 1; w <= 25; w++) expect(migrate(rev2Data(w, [], [])).progress.currentWeek).toBe(REV3_WEEK_MAP[w]);
  });

  it('chạy đúng một lần (idempotent): dữ liệu rev 3 không bị đổi nữa', () => {
    const once = migrate(rev2Data(21, ['w21-l1'], [session('a', 'w21-l1')]));
    expect(once.progress.currentWeek).toBe(28);
    const twice = migrate(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(migrateCurriculum(once as unknown as Record<string, unknown>)).toBe(once);
  });
});

describe('rev 1 → 2 → 3 (dữ liệu rất cũ đi qua cả hai bậc)', () => {
  it('rev 1 ở tuần 22 → rev 2 tuần 23 → rev 3 tuần 26; mã bài học / buổi đánh số lại hai bậc; tiến độ không mất', () => {
    const d = migrate(rev1Data(22));
    expect(validateAppData(d)).toEqual([]);
    expect(d.curriculumRev).toBe(CURRICULUM_REV);
    expect(d.progress.currentWeek).toBe(26);
    expect(d.progress.lessonsCompleted).toEqual(['w6-l1', 'w24-l2', 'w28-l1', 'w28-l2', 'w29-l1', 'w29-l2', 'w26-l1']);
    expect(d.sessions.map((s) => s.lessonId)).toEqual(['w24-l1', 'w28-l2', 'w28-l2', 'w29-l2', 'w26-l1', 'w29-song-canon', 'w2-l1']);
    // songRuns (mã bài hát) giữ nguyên
    expect(d.sessions[1].songRuns[0].songId).toBe('minuet_g');
  });

  it('rev 1: tuần 19 → 19 → 24; tuần 20 (Minuet chưa qua) → 20 "Nốt cao" → 25; tuần 24 → 25 → 30', () => {
    expect(migrate(rev1Data(19)).progress.currentWeek).toBe(24);
    expect(migrate(rev1Data(20)).progress.currentWeek).toBe(25);
    expect(migrate(rev1Data(24)).progress.currentWeek).toBe(30);
    expect(migrate(rev1Data(5)).progress.currentWeek).toBe(6);
  });

  it('tiêu chí tuần vẫn đúng tuần sau đánh số lại (Minuet đạt ở 2 ngày → tuần 28 mới)', () => {
    const raw = rev1Data(21);
    // rev 1: tuần 20 = Minuet, tuần 21 = Für Elise. Buổi ở tuần 21 rev 1 → 22 rev 2 → 29 rev 3
    raw.sessions = [
      session('m1', 'w21-l2', { songRuns: [run('minuet_g')] }),
      session('m2', 'w21-l2', { date: '2026-10-02', songRuns: [run('minuet_g')] }),
    ];
    const d = migrate(raw);
    expect(d.sessions.map((s) => s.lessonId)).toEqual(['w29-l2', 'w29-l2']);
    expect(weekPassed(29, d)).toBe(false); // Für Elise chưa chơi
    const raw2 = rev1Data(20);
    raw2.sessions = [
      session('m1', 'w20-l2', { songRuns: [run('minuet_g')] }),
      session('m2', 'w20-l2', { date: '2026-10-02', songRuns: [run('minuet_g')] }),
    ];
    const d2 = migrate(raw2);
    expect(d2.sessions.map((s) => s.lessonId)).toEqual(['w28-l2', 'w28-l2']);
    expect(weekPassed(28, d2)).toBe(true);
    expect(weekPassed(25, d2)).toBe(false); // tuần "Nốt cao" chưa có dữ liệu
  });
});

describe('lưu trữ & nhập JSON', () => {
  it('cài mới bắt đầu ở rev 3 — mã tuần của bản mới KHÔNG bị dịch', () => {
    const st = new ProgressStore(new MemoryStorage(), fixedNow);
    expect(st.get().curriculumRev).toBe(CURRICULUM_REV);
    expect(CURRICULUM_REV).toBe(3);
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
    kv.setItem(STORAGE_KEY, JSON.stringify(rev1Data(22)));
    const a = new ProgressStore(kv, fixedNow);
    expect(a.get().progress.currentWeek).toBe(26);
    a.markLessonCompleted('w26-l2'); // ghi xuống → có curriculumRev
    expect(JSON.parse(kv.getItem(STORAGE_KEY)!).curriculumRev).toBe(CURRICULUM_REV);
    const b = new ProgressStore(kv, fixedNow);
    expect(b.get().progress.currentWeek).toBe(26);
    expect(b.get().sessions.map((s) => s.lessonId)).toContain('w26-l1');
  });

  it('nhập JSON xuất từ bản cũ cũng được đánh số lại', () => {
    const st = new ProgressStore(new MemoryStorage(), fixedNow);
    expect(st.importJSON(JSON.stringify(rev1Data(24)))).toEqual({ ok: true });
    expect(st.get().progress.currentWeek).toBe(30);
    expect(st.importJSON(JSON.stringify(rev2Data(9, ['w9-l1'], [])))).toEqual({ ok: true });
    expect(st.get().progress.currentWeek).toBe(11);
    expect(st.get().progress.lessonsCompleted).toEqual(['w11-l1']);
  });

  it('curriculumRev sai kiểu bị từ chối', () => {
    expect(validateAppData({ ...defaultData(fixedNow()), curriculumRev: 'x' }).length).toBeGreaterThan(0);
    expect(validateAppData({ ...defaultData(fixedNow()), curriculumRev: 0 }).length).toBeGreaterThan(0);
    expect(validateAppData({ ...defaultData(fixedNow()), curriculumRev: 4 }).length).toBeGreaterThan(0);
  });
});
