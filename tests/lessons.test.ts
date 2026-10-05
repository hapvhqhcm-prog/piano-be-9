import { describe, expect, it } from 'vitest';
import { LEVELS, MAX_WEEK, WEEKS, buildSessionPlan, dailyLesson, findLesson, levelOf, nextLesson, sessionsThisWeek, songMastered, streakDays, weekPassed } from '../src/lessons/lessonEngine';
import { PARENT_TIPS } from '../src/lessons/parentTips';
import { findTune } from '../src/music/exercises';
import { SONGS } from '../src/music/tune';
import { makeSightTune } from '../src/music/sightread';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import type { SongRun } from '../src/progress/schema';

const store = () => new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 4));

/** Kho có đồng hồ chỉnh được: day(k) = ngày 4/10 + k (giờ 17:00). */
function clock(startDay = 4) {
  let d = startDay;
  const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, d, 17));
  return { st, day: (k: number) => (d = startDay + k) };
}

/** Thêm một lượt chơi trong một buổi MỚI của bài `lessonId` (ngày hiện tại của đồng hồ). */
function runIn(st: ProgressStore, lessonId: string, r: Omit<SongRun, 'ts'>): void {
  st.addSongRun(st.startSession(lessonId).id, r);
}

describe('lessonEngine', () => {
  it('buổi tuần 1: Tư thế → Khởi động "Lên hay xuống?" → Bài mới → Con làm thầy → Tổng kết', () => {
    const kinds = buildSessionPlan(findLesson('w1-l1')!).map((s) => s.kind);
    expect(kinds).toEqual(['posture', 'quiz', 'activity', 'activity', 'teach', 'rating']);
  });

  it('từ tuần 2 có "Ôn nhanh" (nốt cũ); "Chơi lại" chỉ còn bài + tổng kết', () => {
    const st = store();
    ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4'].forEach((id) => st.markLessonCompleted(id));
    const plan = buildSessionPlan(findLesson('w2-l1')!, st.get(), { rng: () => 0.3 });
    // v5: bài đầu tuần 2 mở bằng 1' khởi động kỹ thuật (technique) rồi 2 hoạt động từng nốt
    expect(plan.map((s) => s.kind)).toEqual(['posture', 'review', 'quiz', 'activity', 'activity', 'activity', 'teach', 'rating']);
    const first = plan.find((s) => s.kind === 'activity');
    expect(first && first.kind === 'activity' && first.activity.kind).toBe('technique');
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
    expect(buildSessionPlan(findLesson('w10-stage')!, st.get()).map((s) => s.kind)).toEqual(['activity', 'rating']);
  });

  it('tuần 1 đi đúng thứ tự B1 → B5', () => {
    const steps = ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4'].flatMap((id) =>
      findLesson(id)!.activities.flatMap((a) => (a.kind === 'notes' ? [a.segment.step] : [])),
    );
    expect([...new Set(steps)]).toEqual(['B1', 'B2', 'B3', 'B4', 'B5']);
  });

  it('30 tuần (3 cấp × 10), mỗi tuần có bài, "con làm thầy" và tiêu chí; bài hát trong bài học đều tồn tại', () => {
    expect(WEEKS).toHaveLength(30);
    expect(MAX_WEEK).toBe(30);
    expect(WEEKS.map((w) => w.week)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    const ids = new Set<string>();
    for (const w of WEEKS) {
      expect(w.lessons.length).toBeGreaterThan(0);
      expect(w.teach.text.length).toBeGreaterThan(5);
      expect(w.criterion.text.length).toBeGreaterThan(5);
      for (const l of w.lessons) {
        expect(l.id.startsWith(`w${w.week}-`)).toBe(true);
        expect(l.week).toBe(w.week);
        expect(ids.has(l.id), l.id).toBe(false);
        ids.add(l.id);
        for (const a of l.activities) if (a.kind === 'song') expect(findTune(a.songId), a.songId).toBeDefined();
      }
    }
    // Mọi bài hát đều có trong ít nhất một bài học
    const used = new Set(WEEKS.flatMap((w) => w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : [])))));
    for (const s of SONGS) expect(used.has(s.id), s.id).toBe(true);
  });

  it('Học tiếp: bài chưa xong → bài kiểm tra → ôn', () => {
    const st = store();
    expect(nextLesson(st.get()).id).toBe('w1-l1');
    ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4'].forEach((id) => st.markLessonCompleted(id));
    expect(nextLesson(st.get()).id).toBe('w1-test');
  });

  it('tuần 1 (v5): C4 đúng 10 lần, được trượt TỐI ĐA 1 lần', () => {
    const st = store();
    const s = st.startSession('w1-test');
    for (let i = 0; i < 9; i++) st.addParentAssessment(s.id, 'C4', 'correct');
    expect(weekPassed(1, st.get())).toBe(false);
    st.addParentAssessment(s.id, 'C4', 'retry'); // trượt 1 lần
    st.addParentAssessment(s.id, 'C4', 'correct');
    expect(weekPassed(1, st.get())).toBe(true);
    st.addParentAssessment(s.id, 'C4', 'retry'); // trượt lần 2 → chưa qua
    expect(weekPassed(1, st.get())).toBe(false);
    st.amendLastParentAssessment(s.id, 'correct');
    expect(weekPassed(1, st.get())).toBe(true);
  });

  it('tuần 2 (v5): KHÔNG còn tự đánh giá — cần "Bánh nóng" trọn bài đạt ở 2 ngày khác nhau', () => {
    const { st, day } = clock();
    for (const r of ['all', 'all', 'all'] as const) st.setSelfRating(st.startSession('w2-l1').id, r);
    expect(weekPassed(2, st.get())).toBe(false);
    const hcb = (o: Partial<SongRun> = {}): Omit<SongRun, 'ts'> => ({
      songId: 'hot_cross_buns', mode: 'wait', bpm: 60, hints: 'full', phrase: null, total: 13, hits: 13, source: 'mic', passed: true, ...o,
    });
    runIn(st, 'w2-l3', hcb());
    runIn(st, 'w2-l3', hcb()); // cùng ngày → chưa đủ
    expect(weekPassed(2, st.get())).toBe(false);
    day(1);
    runIn(st, 'w2-l3', hcb({ phrase: [0, 2] })); // chỉ một câu → không tính
    expect(weekPassed(2, st.get())).toBe(false);
    runIn(st, 'w2-l3', hcb());
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
  it('micro nghe C4 đúng ngay 10 lần → qua tuần; trượt 2 lần → chưa qua; bố mẹ "Sửa" → qua', () => {
    const st = store();
    const s = st.startSession('w1-test');
    for (let i = 0; i < 6; i++) st.addMicAssessment(s.id, { expected: 'C4', firstHeard: 'C4', wrongCount: 0 });
    for (let i = 0; i < 4; i++) st.addParentAssessment(s.id, 'C4', 'correct');
    expect(weekPassed(1, st.get())).toBe(true);

    const st2 = store();
    const s2 = st2.startSession('w1-test');
    for (let i = 0; i < 10; i++) st2.addMicAssessment(s2.id, { expected: 'C4', firstHeard: 'C4', wrongCount: 0 });
    st2.addMicAssessment(s2.id, { expected: 'C4', firstHeard: 'D4', wrongCount: 1 });
    expect(weekPassed(1, st2.get())).toBe(true); // một lần trượt được phép
    st2.addMicAssessment(s2.id, { expected: 'C4', firstHeard: 'D4', wrongCount: 1 });
    expect(weekPassed(1, st2.get())).toBe(false);
    st2.overrideLastMic(s2.id, 'correct'); // micro nghe nhầm, bố mẹ sửa thành đúng
    expect(weekPassed(1, st2.get())).toBe(true);
  });
});

describe('tiêu chí tuần 4–10 (v5: bài hát cần 2 ngày)', () => {
  const run = (o: Partial<SongRun>): Omit<SongRun, 'ts'> => ({
    songId: 'ex_c_quarter', mode: 'tempo', level: 2, bpm: 60, hints: 'full',
    phrase: null, total: 32, hits: 30, source: 'mic', passed: true, ...o,
  });

  it('tuần 4: lượt Mức 2 trọn ≥ 8 ô nhịp đạt — ở 2 ngày', () => {
    const { st, day } = clock();
    runIn(st, 'w4-l2', run({ songId: 'hot_cross_buns' })); // 4 ô nhịp — chưa đủ
    runIn(st, 'w4-l2', run({ phrase: [0, 4] })); // chỉ một câu
    runIn(st, 'w4-l2', run({}));
    expect(weekPassed(4, st.get())).toBe(false); // mới 1 ngày
    day(2);
    runIn(st, 'w4-l2', run({ songId: 'hot_cross_buns' }));
    expect(weekPassed(4, st.get())).toBe(false);
    runIn(st, 'w4-l2', run({ songId: 'go_tell_aunt_rhody' })); // 8 ô 4/4
    expect(weekPassed(4, st.get())).toBe(true);
  });

  it('tuần 4: ô 2/4 ngắn — bài 2/4 phải ≥ 16 ô (bằng 8 ô 4/4)', () => {
    const { st, day } = clock();
    runIn(st, 'w4-l2', run({ songId: 'ly_cay_da' })); // 10 ô 2/4 = 5 ô 4/4 — chưa đủ
    day(1);
    runIn(st, 'w4-l2', run({ songId: 'ly_cay_da' }));
    expect(weekPassed(4, st.get())).toBe(false);
    runIn(st, 'w4-l2', run({ songId: 'inh_la_oi' })); // 16 ô 2/4
    day(2);
    runIn(st, 'w4-l2', run({ songId: 'inh_la_oi' }));
    expect(weekPassed(4, st.get())).toBe(true);
  });

  it('tuần 6: Ode to Joy trọn bài, 60 BPM, 2 ngày; tuần 8: chỉ nhìn khuông, 2 ngày', () => {
    const { st, day } = clock();
    runIn(st, 'w6-l2', run({ songId: 'ode_to_joy_easy', bpm: 50 }));
    day(1);
    runIn(st, 'w6-l2', run({ songId: 'ode_to_joy_easy' }));
    expect(weekPassed(6, st.get())).toBe(false); // ngày 1 chỉ 50 BPM
    day(3);
    runIn(st, 'w6-l2', run({ songId: 'ode_to_joy_easy' }));
    expect(weekPassed(6, st.get())).toBe(true);
    day(0); // 4/10 — trước ngày phát hành v5
    runIn(st, 'w8-l2', run({ songId: 'ode_to_joy_easy', hints: 'names' }));
    runIn(st, 'w8-l2', run({ songId: 'ode_to_joy_easy', hints: 'staff', source: 'parent' })); // trước ngày v5: lượt cũ không phiếu vẫn tính
    expect(weekPassed(8, st.get())).toBe(false);
    day(4);
    runIn(st, 'w8-l2', run({ songId: 'ode_to_joy_easy', hints: 'staff' }));
    expect(weekPassed(8, st.get())).toBe(true);
  });

  it('tuần 7: tai nghe tay trái 8/10; tuần 10: huy chương', () => {
    const st = store();
    const s7 = st.startSession('w7-l1');
    for (let i = 0; i < 8; i++) st.addAppAssessment(s7.id, 'E4', 'E4'); // dải tay phải không tính
    expect(weekPassed(7, st.get())).toBe(false);
    for (let i = 0; i < 9; i++) st.addAppAssessment(s7.id, 'E3', 'E3');
    st.addAppAssessment(s7.id, 'E3', 'D3');
    expect(weekPassed(7, st.get())).toBe(true);
    const s10 = st.startSession('w10-stage');
    expect(weekPassed(10, st.get())).toBe(false);
    st.addParentAssessment(s10.id, 'medal', 'correct');
    expect(weekPassed(10, st.get())).toBe(true);
  });
});

describe('v5 — bằng chứng của bố mẹ: phiếu 3 ý', () => {
  // Sau ngày phát hành v5 (LEGACY_RUN_CUTOFF = 6/10/2026): lượt "bố mẹ" phải có phiếu 3 ý đều đạt
  const run = (o: Partial<SongRun>): Omit<SongRun, 'ts'> => ({
    songId: 'frog_hop', mode: 'tempo', level: 2, bpm: 60, hints: 'full',
    phrase: null, total: 32, hits: 32, source: 'parent', passed: true, ...o,
  });

  it('lượt bố mẹ KHÔNG phiếu (sau v5) không tính; phiếu thiếu một ý không tính; đủ 3 ý ở 2 ngày → qua', () => {
    const { st, day } = clock(10);
    runIn(st, 'w5-l1', run({}));
    runIn(st, 'w5-l1', run({ checklist: { notes: true, beat: false, fingers: true } }));
    day(1);
    runIn(st, 'w5-l1', run({ checklist: { notes: true, beat: true, fingers: true } }));
    expect(weekPassed(5, st.get())).toBe(false); // ngày đầu không có bằng chứng hợp lệ
    day(2);
    runIn(st, 'w5-l1', run({ checklist: { notes: true, beat: true, fingers: true } }));
    expect(weekPassed(5, st.get())).toBe(true);
  });

  it('micro: lượt đạt luôn tính; lượt không đạt không tính', () => {
    const { st, day } = clock(10);
    runIn(st, 'w5-l1', run({ source: 'mic' }));
    day(1);
    runIn(st, 'w5-l1', run({ source: 'mic', passed: false }));
    expect(weekPassed(5, st.get())).toBe(false);
    runIn(st, 'w5-l1', run({ source: 'mic' }));
    expect(weekPassed(5, st.get())).toBe(true);
  });
});

describe('Cấp 2–3 & luyện tập mỗi ngày', () => {
  const run = (o: Partial<SongRun>): Omit<SongRun, 'ts'> => ({
    songId: 'x', mode: 'tempo', level: 2, bpm: 60, hints: 'names',
    phrase: null, total: 20, hits: 18, source: 'mic', passed: true, ...o,
  });

  it('tiêu chí tuần 12, 18, 19, 22, 24, 25, 26, 28 (bài hát: 2 ngày)', () => {
    const { st, day } = clock();
    runIn(st, 'w12-l3', run({ songId: 'ode_to_joy_both', mode: 'wait' }));
    runIn(st, 'w12-l3', run({ songId: 'ode_to_joy_both' }));
    day(1);
    runIn(st, 'w12-l3', run({ songId: 'ode_to_joy_both', mode: 'wait' }));
    expect(weekPassed(12, st.get())).toBe(false);
    runIn(st, 'w12-l3', run({ songId: 'ode_to_joy_both' }));
    expect(weekPassed(12, st.get())).toBe(true);

    // Tuần 18: Lý cây đa theo nhịp (tốc độ 40 vẫn tính — bài có móc kép)
    day(0);
    runIn(st, 'w18-l2', run({ songId: 'ly_cay_da', bpm: 40 }));
    day(1);
    runIn(st, 'w18-l2', run({ songId: 'ly_cay_da', bpm: 40 }));
    expect(weekPassed(18, st.get())).toBe(true);

    // Tuần 19: gam MỖI tay ở 2 ngày
    day(0);
    runIn(st, 'w19-l1', run({ songId: 'scale_c_rh' }));
    runIn(st, 'w19-l2', run({ songId: 'scale_c_lh' }));
    day(1);
    runIn(st, 'w19-l1', run({ songId: 'scale_c_rh' }));
    expect(weekPassed(19, st.get())).toBe(false);
    runIn(st, 'w19-l2', run({ songId: 'scale_c_lh' }));
    expect(weekPassed(19, st.get())).toBe(true);

    // Tuần 22 (mới): đọc nốt có dòng kẻ phụ 8/10
    const s22 = st.startSession('w22-l1');
    for (let i = 0; i < 10; i++) st.addAppAssessment(s22.id, 'E4', 'E4');
    expect(weekPassed(22, st.get())).toBe(false);
    for (let i = 0; i < 8; i++) st.addAppAssessment(s22.id, 'A3', 'A3');
    for (let i = 0; i < 2; i++) st.addAppAssessment(s22.id, 'A5', 'G5');
    expect(weekPassed(22, st.get())).toBe(true);

    const s24 = st.startSession('w24-l1');
    for (let i = 0; i < 8; i++) st.addAppAssessment(s24.id, 'major', 'major');
    for (let i = 0; i < 2; i++) st.addAppAssessment(s24.id, 'minor', 'major');
    expect(weekPassed(24, st.get())).toBe(true);

    // Tuần 25: đọc nốt cao Đô5–Sol5 đúng 8/10 (nốt thấp hơn không tính)
    const s25 = st.startSession('w25-l1');
    for (let i = 0; i < 10; i++) st.addAppAssessment(s25.id, 'E4', 'E4');
    expect(weekPassed(25, st.get())).toBe(false);
    for (let i = 0; i < 8; i++) st.addAppAssessment(s25.id, 'F5', 'F5');
    for (let i = 0; i < 2; i++) st.addAppAssessment(s25.id, 'G5', 'E5');
    expect(weekPassed(25, st.get())).toBe(true);

    // Tuần 26: 5 đoạn đọc nhạc đạt, trải trên ≥ 2 ngày
    day(0);
    for (let i = 0; i < 5; i++) runIn(st, 'w26-l1', run({ songId: 'sight:C:RH', mode: 'wait' }));
    expect(weekPassed(26, st.get())).toBe(false);
    day(1);
    runIn(st, 'w26-l1', run({ songId: 'sight:C:LH', mode: 'wait' }));
    expect(weekPassed(26, st.get())).toBe(true);

    // Minuet giờ là tuần 28
    day(0);
    runIn(st, 'w28-l2', run({ songId: 'minuet_g', mode: 'wait' }));
    expect(weekPassed(28, st.get())).toBe(false);
    day(1);
    runIn(st, 'w28-l2', run({ songId: 'minuet_g', mode: 'wait' }));
    expect(weekPassed(28, st.get())).toBe(true);
  });

  it('bài đã thuộc = trọn bài theo nhịp ≥ 60; sau tuần 30 "Học tiếp" là luyện tập mỗi ngày', () => {
    const st = store();
    st.setCurrentWeek(30);
    const s = st.startSession('w30-stage');
    st.addSongRun(s.id, run({ songId: 'mary_lamb', bpm: 50 }));
    expect(songMastered(st.get(), 'mary_lamb')).toBe(false);
    st.addSongRun(s.id, run({ songId: 'mary_lamb' }));
    expect(songMastered(st.get(), 'mary_lamb')).toBe(true);
    expect(nextLesson(st.get()).id).toBe('w30-stage');
    st.addParentAssessment(s.id, 'medal', 'correct');
    const daily = nextLesson(st.get(), () => 0.4);
    expect(daily.id).toBe('w30-daily');
    expect(daily.activities[0].kind).toBe('sight');
    const songIds = daily.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : []));
    expect(songIds).toContain('mary_lamb'); // bài đã thuộc được ôn lại
    expect(songIds.filter((x) => x !== 'mary_lamb').length).toBeGreaterThanOrEqual(2); // bài đang tập: chờ + theo nhịp
    for (const id of songIds) expect(findTune(id)).toBeDefined();
    // Thế Đô cao (từ tuần 25) chỉ có tay phải — đoạn đọc nhạc sinh được với mọi rng
    for (let i = 0; i < 40; i++) {
      let k = i;
      const rng = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
      const sight = dailyLesson(st.get(), rng).activities[0];
      if (sight.kind === 'sight') {
        if (sight.position === 'C5') expect(sight.hand).toBe('RH');
        expect(() => makeSightTune(sight)).not.toThrow();
      }
    }
  });

  it('cấp độ theo tuần: 3 cấp × 10 tuần; mục tiêu cuối nói thật (Faber cấp 1 / đầu cấp 2)', () => {
    expect(levelOf(1).level).toBe(1);
    expect(levelOf(10).level).toBe(1);
    expect(levelOf(11).level).toBe(2);
    expect(levelOf(20).level).toBe(2);
    expect(levelOf(21).level).toBe(3);
    expect(levelOf(30).level).toBe(3);
    expect(LEVELS.map((l) => l.weeks)).toEqual([[1, 10], [11, 20], [21, 30]]);
    expect(LEVELS[2].goal).toContain('Faber cấp 1');
  });
});

describe('tự phản biện: buổi gọn, mục tiêu tuần, mẹo bố mẹ', () => {
  it('khởi động tối đa 6 lượt, trừ tuần có tiêu chí tai nghe (giữ 10)', () => {
    for (const w of WEEKS) {
      const l = w.lessons.find((x) => !x.activities.some((a) => a.kind === 'stage'));
      if (!l || !w.warmup) continue;
      const q = buildSessionPlan(l).find((s) => s.kind === 'quiz');
      if (!q || q.kind !== 'quiz') continue;
      expect(q.quiz.rounds, `tuần ${w.week}`).toBe(w.criterion.who === 'APP' ? 10 : Math.min(w.warmup.rounds, 6));
    }
  });

  it('đếm buổi trong tuần lịch và chuỗi ngày liền', () => {
    const days = ['2026-09-28', '2026-10-02', '2026-10-03', '2026-10-04'];
    let k = 0;
    const st = new ProgressStore(new MemoryStorage(), () => {
      const [y, m, d] = days[Math.min(k, days.length - 1)].split('-').map(Number);
      return new Date(y, m - 1, d, 9);
    });
    for (k = 0; k < days.length; k++) st.finishSession(st.startSession('w1-l1').id);
    const today = new Date(2026, 9, 4, 20);
    expect(sessionsThisWeek(st.get(), today)).toBe(4); // thứ 2 28/9 → chủ nhật 4/10
    expect(streakDays(st.get(), today)).toBe(3); // 2, 3, 4/10
    expect(streakDays(st.get(), new Date(2026, 9, 5))).toBe(3); // hôm nay chưa học vẫn giữ chuỗi
    expect(streakDays(st.get(), new Date(2026, 9, 7))).toBe(0);
  });

  it('đủ mẹo cho bố mẹ cả 30 tuần', () => {
    for (let w = 1; w <= 30; w++) expect(PARENT_TIPS[w]?.length, `tuần ${w}`).toBeGreaterThan(20);
  });
});

describe('sửa lỗi từ rà soát', () => {
  it('bài kiểm tra tuần không có "Ôn nhanh" (không lẫn vào tiêu chí C4)', () => {
    const st = store();
    ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4'].forEach((id) => st.markLessonCompleted(id));
    st.setCurrentWeek(2);
    const kinds = buildSessionPlan(findLesson('w1-test')!, st.get(), { rng: () => 0.1 }).map((s) => s.kind);
    expect(kinds).not.toContain('review');
  });

  it('APP_ASSESSMENT: Si giáng ≡ La thăng được chấm đúng', () => {
    const st = store();
    const s = st.startSession('w16-l1');
    st.addAppAssessment(s.id, 'Bb4', 'A#4');
    st.addAppAssessment(s.id, 'up', 'down');
    expect(st.get().sessions[0].appAssessments.map((a) => a.correct)).toEqual([true, false]);
  });
});

describe('sắc thái & kiểu đàn trong giáo trình (OWNER duyệt 2026-10-05)', () => {
  const dyn = WEEKS.flatMap((w) => w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'dynamics' ? [{ w: w.week, l, a }] : []))));

  it('To/nhỏ ở Cấp 1 (tuần 6–7), ngắt/liền ở Cấp 2 (tuần 12–13)', () => {
    const ls = dyn.filter((d) => d.a.mode === 'loud-soft');
    const sl = dyn.filter((d) => d.a.mode === 'stac-leg');
    expect(ls.length).toBeGreaterThan(0);
    expect(sl.length).toBeGreaterThan(0);
    expect(Math.min(...ls.map((d) => d.w))).toBeGreaterThanOrEqual(6);
    expect(Math.min(...ls.map((d) => d.w))).toBeLessThanOrEqual(7);
    expect(Math.min(...sl.map((d) => d.w))).toBeGreaterThanOrEqual(12);
    expect(Math.min(...sl.map((d) => d.w))).toBeLessThanOrEqual(13);
    for (const { a } of dyn) {
      expect(a.rounds.length).toBeGreaterThanOrEqual(4);
      expect(a.rounds.length).toBeLessThanOrEqual(8); // trò ngắn (~2 phút)
      for (const r of a.rounds) {
        expect(a.mode === 'loud-soft' ? ['p', 'f'] : ['stac', 'leg']).toContain(r.want);
        if (r.fingers) expect(r.fingers).toHaveLength(r.pitches.length);
        if (r.want === 'leg') expect(r.pitches.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('bài có trò sắc thái không dài hơn 3 hoạt động (buổi vẫn 10–15 phút)', () => {
    for (const { l } of dyn) expect(l.activities.length, l.id).toBeLessThanOrEqual(3);
  });

  it('tuần 25 "Đọc nốt cao": khởi động 10 lượt Đô5–Sol5, có bài thế Đô cao và đọc nhạc; Minuet tuần 28, Für Elise tuần 29', () => {
    const w = WEEKS[24];
    expect(w.week).toBe(25);
    expect(w.warmup?.pool).toEqual(['C5', 'D5', 'E5', 'F5', 'G5']);
    expect(w.warmup?.rounds).toBe(10);
    const acts = w.lessons.flatMap((l) => l.activities);
    expect(acts.some((a) => a.kind === 'song' && findTune(a.songId)?.position === 'C5')).toBe(true);
    expect(acts.some((a) => a.kind === 'sight' && a.position === 'C5')).toBe(true);
    expect(WEEKS[27].title).toContain('Minuet');
    expect(WEEKS[28].title).toContain('Für Elise');
    expect(findTune('minuet_g')?.week).toBe(28);
    expect(findTune('fur_elise')?.week).toBe(29);
  });
});
