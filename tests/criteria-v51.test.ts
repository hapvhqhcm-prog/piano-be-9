import { describe, expect, it } from 'vitest';
import { CRITERION_DAYS, WEEKS, criterionProgress, daysThisWeek, weekPassed } from '../src/lessons/lessonEngine';
import { BUSY_WEEK_DAYS, EFFORT_BY_DAYS_FROM, busyWeeks } from '../src/lessons/stickers';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import { defaultData, type AppData, type Session, type SongRun } from '../src/progress/schema';

/**
 * v5.1 (OWNER duyệt 2026-10-06 sau rà soát chuyên gia): tiêu chí chặt hơn & tiến độ theo NGÀY.
 * - Đêm thánh / Minuet / Für Elise: lượt THEO NHỊP ≥ 50 (không còn tính chế độ chờ).
 * - Tiêu chí APP (tai nghe / đọc nốt — chơi thử 2026-10-06: trò ≤ 6 lượt, tiêu chí ≥ 5/6 trong một buổi): cũng cần 2 ngày.
 * - Tuần dòng kẻ phụ (23) / nốt cao (26): thêm một lượt đọc nhạc đạt trong dải đó.
 * - criterionProgress(week, data) → { days, needDays } cho tiêu chí theo ngày (null nếu không theo ngày).
 * - Chăm chỉ theo NGÀY: daysThisWeek; sticker "tuần chăm chỉ" = ≥ 4 ngày, không mất sticker cũ.
 */

/** Kho có đồng hồ chỉnh được: day(k) = 10/10/2026 + k. */
function clock(start = 10) {
  let d = start;
  const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, d, 17));
  return { st, day: (k: number) => (d = start + k) };
}
const run = (o: Partial<SongRun>): Omit<SongRun, 'ts'> => ({
  songId: 'x', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 20, hits: 20, source: 'mic', passed: true, ...o,
});
const runIn = (st: ProgressStore, lessonId: string, r: Omit<SongRun, 'ts'>) => st.addSongRun(st.startSession(lessonId).id, r);
/** Một buổi trả lời `n` câu nốt `note` (APP) — `wrong` = chỉ số các câu trả lời SAI. */
function quizIn(st: ProgressStore, lessonId: string, note: string, n = 6, wrong: number[] = []): void {
  const s = st.startSession(lessonId);
  for (let i = 0; i < n; i++) st.addAppAssessment(s.id, note, wrong.includes(i) ? 'B4' : note);
}

describe('Đêm thánh / Minuet / Für Elise: cần lượt THEO NHỊP ≥ 50', () => {
  for (const [week, songId, lessonId] of [
    [24, 'silent_night', 'w24-l2'],
    [29, 'minuet_g', 'w29-l2'],
    [30, 'fur_elise', 'w30-l2'],
  ] as const) {
    it(`tuần ${week} (${songId})`, () => {
      const { st, day } = clock();
      for (const k of [0, 1]) {
        day(k);
        runIn(st, lessonId, run({ songId, mode: 'wait', level: undefined })); // chế độ chờ: không tính
        runIn(st, lessonId, run({ songId, bpm: 40 })); // theo nhịp nhưng chậm quá
      }
      expect(weekPassed(week, st.get())).toBe(false);
      expect(criterionProgress(week, st.get())).toEqual({ days: 0, needDays: 2 });
      day(0);
      runIn(st, lessonId, run({ songId, bpm: 50, hand: 'RH' })); // một tay: không tính
      runIn(st, lessonId, run({ songId, bpm: 50 }));
      expect(criterionProgress(week, st.get())).toEqual({ days: 1, needDays: 2 });
      day(1);
      runIn(st, lessonId, run({ songId, bpm: 50 }));
      expect(weekPassed(week, st.get())).toBe(true);
      expect(criterionProgress(week, st.get())).toEqual({ days: 2, needDays: 2 });
    });
  }
});

describe('tiêu chí APP theo 2 ngày (tuần 3, 7, 23, 25, 26)', () => {
  it('tuần 3: hai buổi đạt CÙNG ngày chưa đủ; ngày thứ hai → qua', () => {
    const { st, day } = clock();
    quizIn(st, 'w3-l1', 'E4');
    quizIn(st, 'w3-l2', 'D4');
    expect(weekPassed(3, st.get())).toBe(false);
    expect(criterionProgress(3, st.get())).toEqual({ days: 1, needDays: 2 });
    day(2);
    quizIn(st, 'w3-l3', 'F4', 5);
    expect(weekPassed(3, st.get())).toBe(false); // chỉ 5 câu — chưa đủ 6 câu liên tiếp
    quizIn(st, 'w3-l3', 'F4', 6, [1, 4]);
    expect(weekPassed(3, st.get())).toBe(false); // 4/6 — chưa đủ
    quizIn(st, 'w3-l3', 'F4', 6, [3]);
    expect(weekPassed(3, st.get())).toBe(true);
    expect(criterionProgress(3, st.get())).toEqual({ days: 2, needDays: 2 });
  });

  it('tuần 23 dòng kẻ phụ: 2 ngày ≥ 5/6 + một lượt đọc nhạc qua vạch phụ; "●●" chỉ khi đủ cả hai', () => {
    const { st, day } = clock();
    quizIn(st, 'w23-l1', 'A3');
    day(1);
    quizIn(st, 'w23-l1', 'B3');
    expect(weekPassed(23, st.get())).toBe(false);
    // đủ ngày nhưng thiếu lượt đọc nhạc → tiến độ dừng ở needDays − 1
    expect(criterionProgress(23, st.get())).toEqual({ days: 1, needDays: 2 });
    runIn(st, 'w23-l3', run({ songId: 'sight:Am:RH', mode: 'wait', passed: false }));
    expect(weekPassed(23, st.get())).toBe(false);
    runIn(st, 'w23-l3', run({ songId: 'sight:Am:RH', mode: 'wait' }));
    expect(weekPassed(23, st.get())).toBe(true);
    expect(criterionProgress(23, st.get())).toEqual({ days: 2, needDays: 2 });
  });

  it('tuần 26 nốt cao: cần thêm một lượt đọc nhạc thế Đô cao (thế khác không tính)', () => {
    const { st, day } = clock();
    quizIn(st, 'w26-l1', 'E5');
    day(1);
    quizIn(st, 'w26-l1', 'G5');
    runIn(st, 'w26-l3', run({ songId: 'sight:G:RH', mode: 'wait' }));
    expect(weekPassed(26, st.get())).toBe(false);
    runIn(st, 'w26-l3', run({ songId: 'sight:C5:RH', mode: 'wait' }));
    expect(weekPassed(26, st.get())).toBe(true);
  });

  it('mọi tuần có tiêu chí APP đều có bài giúp đạt (đọc nhạc trong dải cho tuần 23 & 26)', () => {
    for (const w of WEEKS.filter((x) => x.criterion.who === 'APP')) {
      expect(w.warmup, `tuần ${w.week}`).toBeTruthy();
      expect(w.criterion.text, `tuần ${w.week}`).toContain('2 ngày');
    }
    const sights = (week: number) => WEEKS[week - 1].lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'sight' ? [a.position] : [])));
    expect(sights(23)).toContain('Am');
    expect(sights(26)).toContain('C5');
  });
});

describe('criterionProgress — tiến độ theo ngày cho màn chính', () => {
  it('null cho tiêu chí không theo ngày: tuần 1 (một buổi), tuần huy chương 10 / 21 / 31', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 10));
    for (const w of [1, 10, 21, 31, 99]) expect(criterionProgress(w, st.get()), `tuần ${w}`).toBeNull();
  });

  it('mọi tuần còn lại (2–30 trừ 10, 21): { days: 0, needDays: 2 } khi chưa có dữ liệu', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 10));
    for (const w of WEEKS) {
      if ([1, 10, 21, 31].includes(w.week)) continue;
      expect(criterionProgress(w.week, st.get()), `tuần ${w.week}`).toEqual({ days: 0, needDays: CRITERION_DAYS });
    }
  });

  it('LUÔN khớp weekPassed: days === needDays ⇔ tuần đạt (giả lập ngẫu nhiên nhiều tuần)', () => {
    let x = 7;
    const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const songOf = (week: number) =>
      WEEKS[week - 1].lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' && !a.hand ? [{ l: l.id, s: a.songId }] : [])));
    for (const w of WEEKS) {
      if ([1, 10, 21, 31].includes(w.week)) continue;
      const { st, day } = clock();
      for (let i = 0; i < 6; i++) {
        day(Math.floor(rng() * 3));
        const opts = songOf(w.week);
        if (opts.length && rng() < 0.6) {
          const o = opts[Math.floor(rng() * opts.length)];
          runIn(st, o.l, run({ songId: o.s, bpm: rng() < 0.5 ? 50 : 72, hints: rng() < 0.5 ? 'staff' : 'names', mode: rng() < 0.3 ? 'wait' : 'tempo' }));
        } else if (w.warmup) quizIn(st, w.lessons[0].id, w.warmup.pool[0]);
        const p = criterionProgress(w.week, st.get())!;
        expect(p.days === p.needDays, `tuần ${w.week}`).toBe(weekPassed(w.week, st.get()));
        expect(p.days).toBeLessThanOrEqual(p.needDays);
      }
    }
  });

  it('tuần gam (20): tiến độ là tay CHẬM hơn', () => {
    const { st, day } = clock();
    runIn(st, 'w20-l1', run({ songId: 'scale_c_rh' }));
    day(1);
    runIn(st, 'w20-l1', run({ songId: 'scale_c_rh' }));
    expect(criterionProgress(20, st.get())).toEqual({ days: 0, needDays: 2 });
    runIn(st, 'w20-l2', run({ songId: 'scale_c_lh' }));
    expect(criterionProgress(20, st.get())).toEqual({ days: 1, needDays: 2 });
  });
});

describe('chăm chỉ theo NGÀY (không theo buổi)', () => {
  let seq = 0;
  const session = (date: string, completed = true): Session => ({
    id: `s${++seq}`, date, lessonId: 'w5-l1', parentAssessments: [], appAssessments: [], micAssessments: [], songRuns: [],
    selfRating: null, startedAt: 0, endedAt: null, minutes: 10, completed, checklist: {},
  });
  const data = (sessions: Session[]): AppData => ({ ...defaultData(new Date(2026, 9, 10)), sessions });

  it('daysThisWeek: 2 buổi cùng ngày = 1 ngày; buổi chưa xong / tuần trước không tính', () => {
    const d = data([session('2026-10-12'), session('2026-10-12'), session('2026-10-13'), session('2026-10-14', false), session('2026-10-11')]);
    expect(daysThisWeek(d, new Date(2026, 9, 15))).toBe(2); // thứ 2 12/10 → hôm nay 15/10
  });

  it('sticker tuần chăm chỉ (từ 6/10/2026): ≥ 4 NGÀY — 4 buổi trong 2 ngày không đủ', () => {
    expect(BUSY_WEEK_DAYS).toBe(4);
    expect(EFFORT_BY_DAYS_FROM).toBe('2026-10-06');
    const twoDays = ['2026-10-12', '2026-10-12', '2026-10-13', '2026-10-13'].map((x) => session(x));
    expect(busyWeeks(data(twoDays))).toBe(0);
    const fourDays = ['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-18'].map((x) => session(x));
    expect(busyWeeks(data(fourDays))).toBe(1);
  });

  it('sticker đã nhận theo quy tắc cũ (≥ 4 buổi trước 6/10/2026) KHÔNG bị thu hồi', () => {
    const old = ['2026-09-07', '2026-09-07', '2026-09-08', '2026-09-08'].map((x) => session(x)); // 4 buổi, 2 ngày
    expect(busyWeeks(data(old))).toBe(1);
    // Tuần 5/10 vắt qua ngày đổi: chỉ buổi trước 6/10 dùng quy tắc cũ
    const straddle = ['2026-10-05', '2026-10-05', '2026-10-07', '2026-10-07'].map((x) => session(x));
    expect(busyWeeks(data(straddle))).toBe(0);
  });
});
