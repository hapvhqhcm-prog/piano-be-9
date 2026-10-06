import { describe, expect, it } from 'vitest';
import { LEVELS, MAX_QUIZ_ROUNDS, MAX_WEEK, WEEKS, buildSessionPlan, criterionProgress, dailyLesson, daysThisWeek, findLesson, levelOf, nextLesson, sessionsThisWeek, songMastered, streakDays, weekPassed } from '../src/lessons/lessonEngine';
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
  it('buổi tuần 1 (chơi thử 2026-10-06): Tư thế 1 thẻ (+ khởi động tay) → Bài mới trên đàn thật → Khởi động "Lên hay xuống?" 3 lượt → Màn kết', () => {
    const plan = buildSessionPlan(findLesson('w1-l1')!);
    expect(plan.map((s) => s.kind)).toEqual(['posture', 'activity', 'activity', 'quiz', 'closing']);
    // buổi ĐẦU TIÊN: tư thế rút gọn 1 thẻ → màn thứ 3 (tư thế · khởi động tay · lời dẫn) đã là tìm sinh đôi trên đàn thật
    expect(plan[0].kind === 'posture' && plan[0].short).toBe(true);
    const first = plan[1];
    expect(first.kind === 'activity' && first.activity.kind === 'notes' && first.activity.segment.id).toBe('w1-b1');
    const q = plan[3];
    expect(q.kind === 'quiz' && q.warmup && q.quiz.variant === 'updown' && q.quiz.rounds).toBe(3);
    const last = plan[plan.length - 1];
    expect(last.kind === 'closing' && last.teach?.text).toBe(WEEKS[0].teach.text);
  });

  it('tư thế: buổi đầu 1 thẻ, buổi 2–3 đủ 3 thẻ, từ buổi 4 lại 1 thẻ', () => {
    const st = store();
    const short = () => {
      const p = buildSessionPlan(findLesson('w1-l2')!, st.get())[0];
      return p.kind === 'posture' && p.short;
    };
    expect(short()).toBe(true);
    st.finishSession(st.startSession('w1-l1').id);
    expect(short()).toBe(false);
    st.finishSession(st.startSession('w1-l1').id);
    expect(short()).toBe(false);
    st.finishSession(st.startSession('w1-l1').id);
    expect(short()).toBe(true);
  });

  it('từ tuần 2 có "Ôn nhanh" (nốt cũ); "Chơi lại" chỉ còn bài + tổng kết', () => {
    const st = store();
    ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4'].forEach((id) => st.markLessonCompleted(id));
    const plan = buildSessionPlan(findLesson('w2-l1')!, st.get(), { rng: () => 0.3 });
    // v5.1: khởi động kỹ thuật ~30" nằm trong bước tư thế (không còn là hoạt động riêng) — rồi 2 hoạt động từng nốt
    expect(plan.map((s) => s.kind)).toEqual(['posture', 'review', 'quiz', 'activity', 'activity', 'closing']);
    const first = plan.find((s) => s.kind === 'activity');
    expect(first && first.kind === 'activity' && first.activity.kind).toBe('notes');
    expect(plan[0].kind === 'posture' && WEEKS[1].drills).toContain(plan[0].kind === 'posture' ? plan[0].drill : '');
    const review = plan.find((s) => s.kind === 'review');
    expect(review && review.kind === 'review' && review.segment.targets.length).toBeGreaterThanOrEqual(2);
    expect(buildSessionPlan(findLesson('w3-l2')!, st.get(), { replay: true }).map((s) => s.kind)).toEqual([
      'activity', 'activity', 'activity', 'closing',
    ]);
    // "Chơi lại": màn kết KHÔNG có thẻ "Con làm thầy"
    const replay = buildSessionPlan(findLesson('w3-l2')!, st.get(), { replay: true });
    expect(replay[replay.length - 1]).toEqual({ kind: 'closing', teach: null });
  });

  it('tư thế rút gọn sau 3 buổi; buổi Sân khấu không có tư thế/khởi động', () => {
    const st = store();
    for (let i = 0; i < 3; i++) st.finishSession(st.startSession('w1-l1').id);
    const p = buildSessionPlan(findLesson('w1-l2')!, st.get())[0];
    expect(p.kind === 'posture' && p.short).toBe(true);
    expect(buildSessionPlan(findLesson('w10-stage')!, st.get()).map((s) => s.kind)).toEqual(['activity', 'closing']);
  });

  it('tuần 1 đi đúng thứ tự B1 → B5', () => {
    const steps = ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4'].flatMap((id) =>
      findLesson(id)!.activities.flatMap((a) => (a.kind === 'notes' ? [a.segment.step] : [])),
    );
    expect([...new Set(steps)]).toEqual(['B1', 'B2', 'B3', 'B4', 'B5']);
  });

  it('31 tuần (v5.1: 10 + 11 + 10), mỗi tuần có bài, "con làm thầy", tiêu chí và mục tiêu cho bé; bài hát trong bài học đều tồn tại', () => {
    expect(WEEKS).toHaveLength(31);
    expect(MAX_WEEK).toBe(31);
    expect(WEEKS.map((w) => w.week)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    const ids = new Set<string>();
    for (const w of WEEKS) {
      expect(w.lessons.length).toBeGreaterThan(0);
      expect(w.teach.text.length).toBeGreaterThan(5);
      expect(w.criterion.text.length).toBeGreaterThan(5);
      // v5.1: mục tiêu tuần bằng lời cho bé — ngắn, khác lời người lớn
      expect(w.kidGoal, `tuần ${w.week}`).toBeTruthy();
      expect(w.kidGoal!.length, `tuần ${w.week}`).toBeLessThanOrEqual(90);
      expect(w.kidGoal).not.toBe(w.criterion.text);
      for (const l of w.lessons) {
        expect(l.id.startsWith(`w${w.week}-`)).toBe(true);
        expect(l.week).toBe(w.week);
        expect(ids.has(l.id), l.id).toBe(false);
        ids.add(l.id);
        for (const a of l.activities) if (a.kind === 'song') expect(findTune(a.songId), a.songId).toBeDefined();
      }
    }
    // Mọi bài hát đều có trong ít nhất một bài học — trừ các bài Việt Nam bổ sung chỉ để trong Thư viện (OWNER 2026-10-06:
    // "phần lớn vào Thư viện, mở theo tuần"; Luyện tập mỗi ngày vẫn tự chọn chúng theo tuần)
    const LIBRARY_ONLY = new Set(['ngay_mua_vui', 'ly_con_sao', 'xuan_va_tuoi_tre', 'mua_roi', 'trong_com', 'beo_dat_may_troi',
      'dem_thu', 'con_thuyen_khong_ben', 'nguoi_oi_nguoi_o_dung_ve',
      // 2026-10-06: bài tự sáng tác lấp chỗ mỏng của kho bài — mở theo tuần trong Thư viện
      // (snail_stroll, sparrow_minuet, summer_shower thì nằm trong bài học tuần 3, 29, 30)
      'duckling_waddle', 'choo_choo_train', 'little_elephant', 'bear_lullaby', 'mid_autumn_night', 'robot_dance',
      'tet_rice_cake', 'kitten_stalks', 'flying_kite', 'boat_race']);
    const used = new Set(WEEKS.flatMap((w) => w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : [])))));
    for (const s of SONGS) expect(used.has(s.id) || LIBRARY_ONLY.has(s.id), s.id).toBe(true);
    for (const id of LIBRARY_ONLY) expect(used.has(id), id).toBe(false);
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

  it('tuần 3 qua khi tai nghe đúng ≥ 5/6 trong một buổi (APP; chơi thử 2026-10-06 — trước 8/10) — ở 2 ngày khác nhau', () => {
    const { st, day } = clock();
    const s = st.startSession('w3-l1');
    // 4/6: chưa đạt
    for (const ok of [true, false, true, true, false, true]) st.addAppAssessment(s.id, 'C4', ok ? 'C4' : 'D4');
    expect(criterionProgress(3, st.get())).toEqual({ days: 0, needDays: 2 });
    const s2 = st.startSession('w3-l2');
    // 5/6: đạt (một ngày)
    for (const ok of [true, true, false, true, true, true]) st.addAppAssessment(s2.id, 'E4', ok ? 'E4' : 'D4');
    expect(weekPassed(3, st.get())).toBe(false); // mới 1 ngày
    expect(criterionProgress(3, st.get())).toEqual({ days: 1, needDays: 2 });
    day(1);
    const s3 = st.startSession('w3-l3');
    for (let i = 0; i < 6; i++) st.addAppAssessment(s3.id, 'D4', 'D4');
    expect(weekPassed(3, st.get())).toBe(true);
  });

  it('tuần 3: lượt chơi bỏ dở rồi chơi lại trong cùng buổi vẫn chấm đúng', () => {
    const { st, day } = clock();
    for (const k of [0, 1]) {
      day(k);
      const s = st.startSession('w3-l1');
      for (let i = 0; i < 4; i++) st.addAppAssessment(s.id, 'C4', 'D4'); // bỏ dở, sai hết
      for (let i = 0; i < 9; i++) st.addAppAssessment(s.id, 'E4', 'E4');
      st.addAppAssessment(s.id, 'E4', 'F4');
    }
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

  it('tuần 7: tai nghe tay trái ≥ 5/6 ở 2 ngày; tuần 10: huy chương', () => {
    const { st, day } = clock();
    const s7 = st.startSession('w7-l1');
    for (let i = 0; i < 8; i++) st.addAppAssessment(s7.id, 'E4', 'E4'); // dải tay phải không tính
    expect(weekPassed(7, st.get())).toBe(false);
    for (let i = 0; i < 5; i++) st.addAppAssessment(s7.id, 'E3', 'E3');
    st.addAppAssessment(s7.id, 'E3', 'D3');
    expect(weekPassed(7, st.get())).toBe(false); // v5.1: mới 1 ngày
    day(1);
    const s7b = st.startSession('w7-l2');
    for (let i = 0; i < 6; i++) st.addAppAssessment(s7b.id, 'D3', 'D3');
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

  it('tiêu chí tuần 12, 18, 19, 20, 23, 25, 26, 27, 29 (v5.1: mọi tiêu chí theo ngày cần 2 ngày)', () => {
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

    // Tuần 19 (v5.1, mới): Bắc kim thang theo nhịp — 2 ngày
    day(0);
    runIn(st, 'w19-bkt', run({ songId: 'bac_kim_thang', bpm: 40 }));
    expect(weekPassed(19, st.get())).toBe(false);
    day(1);
    runIn(st, 'w19-bkt', run({ songId: 'bac_kim_thang', bpm: 40 }));
    expect(weekPassed(19, st.get())).toBe(true);

    // Tuần 20 (gam, tuần 19 cũ): MỖI tay ở 2 ngày
    day(0);
    runIn(st, 'w20-l1', run({ songId: 'scale_c_rh' }));
    runIn(st, 'w20-l2', run({ songId: 'scale_c_lh' }));
    day(1);
    runIn(st, 'w20-l1', run({ songId: 'scale_c_rh' }));
    expect(weekPassed(20, st.get())).toBe(false);
    runIn(st, 'w20-l2', run({ songId: 'scale_c_lh' }));
    expect(weekPassed(20, st.get())).toBe(true);

    // Tuần 23 (Cầu Vạch Phụ): đọc nốt có dòng kẻ phụ ≥ 5/6 ở 2 ngày + một lượt đọc nhạc qua vạch phụ
    const ledger = (k: number) => {
      day(k);
      const s23 = st.startSession('w23-l1');
      for (let i = 0; i < 10; i++) st.addAppAssessment(s23.id, 'E4', 'E4'); // nốt không có vạch phụ: không tính
      for (let i = 0; i < 5; i++) st.addAppAssessment(s23.id, 'A3', 'A3');
      st.addAppAssessment(s23.id, 'A5', 'G5');
    };
    ledger(0);
    expect(weekPassed(23, st.get())).toBe(false);
    ledger(1);
    expect(weekPassed(23, st.get())).toBe(false); // thiếu lượt đọc nhạc qua vạch phụ
    runIn(st, 'w23-l3', run({ songId: 'sight:C:RH', mode: 'wait' })); // thế Đô: không qua vạch phụ
    expect(weekPassed(23, st.get())).toBe(false);
    runIn(st, 'w23-l3', run({ songId: 'sight:Am:RH', mode: 'wait' }));
    expect(weekPassed(23, st.get())).toBe(true);

    // Tuần 25: vui/buồn ≥ 5/6 ở 2 ngày
    for (const k of [0, 1]) {
      day(k);
      const s25 = st.startSession('w25-l1');
      for (let i = 0; i < 5; i++) st.addAppAssessment(s25.id, 'major', 'major');
      st.addAppAssessment(s25.id, 'minor', 'major');
      expect(weekPassed(25, st.get())).toBe(k === 1);
    }

    // Tuần 26: đọc nốt cao Đô5–Sol5 đúng ≥ 5/6 (nốt thấp hơn không tính) ở 2 ngày + đọc nhạc thế Đô cao
    for (const k of [0, 1]) {
      day(k);
      const s26 = st.startSession('w26-l1');
      for (let i = 0; i < 10; i++) st.addAppAssessment(s26.id, 'E4', 'E4');
      for (let i = 0; i < 5; i++) st.addAppAssessment(s26.id, 'F5', 'F5');
      st.addAppAssessment(s26.id, 'G5', 'E5');
    }
    expect(weekPassed(26, st.get())).toBe(false);
    runIn(st, 'w26-l3', run({ songId: 'sight:C5:RH', mode: 'wait' }));
    expect(weekPassed(26, st.get())).toBe(true);

    // Tuần 27: 5 đoạn đọc nhạc đạt, trải trên ≥ 2 ngày
    day(0);
    for (let i = 0; i < 5; i++) runIn(st, 'w27-l1', run({ songId: 'sight:C:RH', mode: 'wait' }));
    expect(weekPassed(27, st.get())).toBe(false);
    day(1);
    runIn(st, 'w27-l1', run({ songId: 'sight:C:LH', mode: 'wait' }));
    expect(weekPassed(27, st.get())).toBe(true);

    // Minuet tuần 29 — v5.1: phải THEO NHỊP ≥ 50 (chế độ chờ không tính)
    day(0);
    runIn(st, 'w29-l2', run({ songId: 'minuet_g', mode: 'wait' }));
    runIn(st, 'w29-l2', run({ songId: 'minuet_g', bpm: 50 }));
    day(1);
    runIn(st, 'w29-l2', run({ songId: 'minuet_g', mode: 'wait' }));
    runIn(st, 'w29-l2', run({ songId: 'minuet_g', bpm: 40 })); // chậm quá
    expect(weekPassed(29, st.get())).toBe(false);
    runIn(st, 'w29-l2', run({ songId: 'minuet_g', bpm: 50 }));
    expect(weekPassed(29, st.get())).toBe(true);
  });

  it('bài đã thuộc = trọn bài theo nhịp ≥ 60; sau tuần 31 "Học tiếp" là luyện tập mỗi ngày', () => {
    const st = store();
    st.setCurrentWeek(31);
    const s = st.startSession('w31-stage');
    st.addSongRun(s.id, run({ songId: 'mary_lamb', bpm: 50 }));
    expect(songMastered(st.get(), 'mary_lamb')).toBe(false);
    st.addSongRun(s.id, run({ songId: 'mary_lamb' }));
    expect(songMastered(st.get(), 'mary_lamb')).toBe(true);
    expect(nextLesson(st.get()).id).toBe('w31-stage');
    st.addParentAssessment(s.id, 'medal', 'correct');
    const daily = nextLesson(st.get(), () => 0.4);
    expect(daily.id).toBe('w31-daily');
    expect(daily.activities[0].kind).toBe('sight');
    const songIds = daily.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : []));
    expect(songIds).toContain('mary_lamb'); // bài đã thuộc được ôn lại
    expect(songIds.filter((x) => x !== 'mary_lamb').length).toBeGreaterThanOrEqual(2); // bài đang tập: chờ + theo nhịp
    for (const id of songIds) expect(findTune(id)).toBeDefined();
    // Thế Đô cao (từ tuần 26) chỉ có tay phải — đoạn đọc nhạc sinh được với mọi rng
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

  it('cấp độ theo tuần (v5.1): 10 + 11 + 10 tuần; mục tiêu cuối nói thật (Faber cấp 1 / đầu cấp 2)', () => {
    expect(levelOf(1).level).toBe(1);
    expect(levelOf(10).level).toBe(1);
    expect(levelOf(11).level).toBe(2);
    expect(levelOf(21).level).toBe(2);
    expect(levelOf(22).level).toBe(3);
    expect(levelOf(31).level).toBe(3);
    expect(LEVELS.map((l) => l.weeks)).toEqual([[1, 10], [11, 21], [22, 31]]);
    expect(LEVELS[2].goal).toContain('Faber cấp 1');
  });
});

describe('tự phản biện: buổi gọn, mục tiêu tuần, mẹo bố mẹ', () => {
  it('chơi thử 2026-10-06: MỌI trò tai nghe / đọc nốt ≤ 6 lượt (khởi động & quiz trong bài, cả tuần có tiêu chí APP); tuần 1 khởi động 3 lượt', () => {
    expect(MAX_QUIZ_ROUNDS).toBe(6);
    for (const w of WEEKS) {
      if (w.warmup) expect(w.warmup.rounds, `khởi động tuần ${w.week}`).toBeLessThanOrEqual(MAX_QUIZ_ROUNDS);
      for (const l of w.lessons) {
        for (const a of l.activities) if (a.kind === 'quiz') expect(a.quiz.rounds, l.id).toBeLessThanOrEqual(MAX_QUIZ_ROUNDS);
        if (l.activities.some((a) => a.kind === 'stage')) continue;
        for (const s of buildSessionPlan(l)) {
          if (s.kind === 'quiz') expect(s.quiz.rounds, `${l.id} khởi động`).toBe(w.week === 1 ? 3 : Math.min(w.warmup!.rounds, MAX_QUIZ_ROUNDS));
          if (s.kind === 'activity' && s.activity.kind === 'quiz') expect(s.activity.quiz.rounds, l.id).toBeLessThanOrEqual(MAX_QUIZ_ROUNDS);
        }
      }
    }
    // Tuần chấm bằng khởi động: tiêu chí ≥ 5/6 → khởi động đủ 6 lượt
    for (const w of WEEKS.filter((x) => x.criterion.who === 'APP')) {
      expect(w.warmup?.rounds, `tuần ${w.week}`).toBe(MAX_QUIZ_ROUNDS);
      expect(w.criterion.text, `tuần ${w.week}`).toContain('5/6');
      expect(w.kidGoal, `tuần ${w.week}`).toMatch(/5 (nốt|lần)( trầm)? trong 6/);
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
    // v5.1: mục tiêu chăm chỉ tính theo NGÀY — thêm buổi thứ 2 trong cùng ngày 4/10 không tăng số ngày
    st.finishSession(st.startSession('w1-l2').id);
    expect(sessionsThisWeek(st.get(), today)).toBe(5);
    expect(daysThisWeek(st.get(), today)).toBe(4);
    expect(streakDays(st.get(), today)).toBe(3); // 2, 3, 4/10
    expect(streakDays(st.get(), new Date(2026, 9, 5))).toBe(3); // hôm nay chưa học vẫn giữ chuỗi
    expect(streakDays(st.get(), new Date(2026, 9, 7))).toBe(0);
  });

  it('đủ mẹo cho bố mẹ cả 31 tuần', () => {
    for (let w = 1; w <= 31; w++) expect(PARENT_TIPS[w]?.length, `tuần ${w}`).toBeGreaterThan(20);
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

  it('tuần 26 "Đọc nốt cao": khởi động 6 lượt Đô5–Sol5, có bài thế Đô cao và đọc nhạc; Minuet tuần 29, Für Elise tuần 30', () => {
    const w = WEEKS[25];
    expect(w.week).toBe(26);
    expect(w.warmup?.pool).toEqual(['C5', 'D5', 'E5', 'F5', 'G5']);
    expect(w.warmup?.rounds).toBe(6);
    const acts = w.lessons.flatMap((l) => l.activities);
    expect(acts.some((a) => a.kind === 'song' && findTune(a.songId)?.position === 'C5')).toBe(true);
    expect(acts.some((a) => a.kind === 'sight' && a.position === 'C5')).toBe(true);
    expect(WEEKS[28].title).toContain('Minuet');
    expect(WEEKS[29].title).toContain('Für Elise');
    expect(findTune('minuet_g')?.week).toBe(29);
    expect(findTune('fur_elise')?.week).toBe(30);
  });
});
