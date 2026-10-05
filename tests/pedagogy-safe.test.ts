import { describe, expect, it } from 'vitest';
import {
  FRESH_DAYS,
  WEEKS,
  buildSessionPlan,
  dailyLesson,
  masteredSongs,
  reviewSegment,
  reviewSongStep,
  reviewWeight,
  songFresh,
  songMastered,
  targetMemory,
  weekPassed,
  weekPlan,
} from '../src/lessons/lessonEngine';
import { findTune } from '../src/music/exercises';
import { countWords, loopStreak } from '../src/music/timing';
import { SONGS, handOnsets, onsets, otherHandNotes, phraseRanges } from '../src/music/tune';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import type { SongRun } from '../src/progress/schema';
import { validateAppData } from '../src/progress/schema';

const DAY = 86_400_000;
const T0 = new Date(2026, 9, 5, 17, 0, 0).getTime();

/** Kho dữ liệu có đồng hồ chỉnh được (ngày thứ `day` tính từ T0). */
function clockStore() {
  let t = T0;
  const st = new ProgressStore(new MemoryStorage(), () => new Date(t));
  return { st, at: (day: number) => (t = T0 + day * DAY) };
}

const run = (songId: string, extra: Partial<SongRun> = {}): Omit<SongRun, 'ts'> => ({
  songId,
  mode: 'tempo',
  level: 2,
  bpm: 60,
  hints: 'full',
  phrase: null,
  total: 10,
  hits: 10,
  source: 'parent',
  passed: true,
  ...extra,
});

describe('1. Tập tách tay (bài hai tay)', () => {
  const tune = findTune('ode_to_joy_both')!;

  it('handOnsets chỉ giữ nốt của tay đã chọn; tay kia là "đệm"', () => {
    expect(tune.lh).toBeDefined();
    const rh = handOnsets(tune, 'RH');
    const lh = handOnsets(tune, 'LH');
    expect(rh.length).toBeGreaterThan(0);
    expect(lh.length).toBeGreaterThan(0);
    expect(rh.every((o) => o.notes.every((n) => n.hand === 'RH'))).toBe(true);
    expect(lh.every((o) => o.notes.every((n) => n.hand === 'LH'))).toBe(true);
    expect(handOnsets(tune, null)).toEqual(onsets(tune));
    expect(otherHandNotes(tune, 'RH').every((n) => n.hand === 'LH')).toBe(true);
    expect(otherHandNotes(tune, 'RH').length).toBe(tune.lh!.filter((n) => !n.rest).length);
    expect(otherHandNotes(tune, null)).toEqual([]);
  });

  it('lượt TÁCH TAY không tính "đã thuộc" / tiêu chí tuần 10; lượt hai tay thì tính', () => {
    const { st } = clockStore();
    st.setCurrentWeek(10);
    const s = st.startSession('w10-l1');
    st.addSongRun(s.id, run('ode_to_joy_both', { hand: 'RH' }));
    st.addSongRun(s.id, run('ode_to_joy_both', { hand: 'LH' }));
    expect(validateAppData(st.get())).toEqual([]);
    expect(songMastered(st.get(), 'ode_to_joy_both')).toBe(false);
    expect(weekPassed(10, st.get())).toBe(false);
    st.addSongRun(s.id, run('ode_to_joy_both'));
    expect(songMastered(st.get(), 'ode_to_joy_both')).toBe(true);
    expect(weekPassed(10, st.get())).toBe(true);
  });

  it('tiêu chí tuần 5 (theo nhịp ≥ 60) cũng bỏ qua lượt có cờ tách tay', () => {
    const { st } = clockStore();
    st.setCurrentWeek(5);
    const s = st.startSession('w5-l1');
    st.addSongRun(s.id, run('ode_to_joy_easy', { hand: 'RH' }));
    expect(weekPassed(5, st.get())).toBe(false);
  });

  it('schema: hand chỉ nhận RH / LH (không có = hai tay)', () => {
    const { st } = clockStore();
    const s = st.startSession('w10-l1');
    st.addSongRun(s.id, run('ode_to_joy_both'));
    const d = JSON.parse(st.exportJSON());
    expect(validateAppData(d)).toEqual([]);
    d.sessions[0].songRuns[0].hand = 'X';
    expect(validateAppData(d).some((e: string) => e.includes('songRuns[0]'))).toBe(true);
  });
});

describe('2. Lặp câu 3 lần đúng liên tiếp', () => {
  it('lượt sạch +1, có sai về 0, đủ 3 thì xong', () => {
    let s = 0;
    const seq = [true, true, false, true, true, true];
    const done: boolean[] = [];
    for (const clean of seq) {
      const v = loopStreak(s, clean);
      s = v.streak;
      done.push(v.done);
    }
    expect(done).toEqual([false, false, false, false, false, true]);
    expect(s).toBe(3);
  });
});

describe('3. Đếm to', () => {
  it('lời đếm số cho mẫu nhịp: Đi · Đi · Chạy-chạy · Đi-i (vắt qua ô) · Suỵt · Đi-chấm chạy', () => {
    const cells = [
      { start: 0, beats: 1, hits: [0] },
      { start: 1, beats: 1, hits: [0] },
      { start: 2, beats: 1, hits: [0, 0.5] },
      { start: 3, beats: 2, hits: [0] },
      { start: 5, beats: 1, hits: [] },
      { start: 6, beats: 2, hits: [0, 1.5] },
    ];
    expect(countWords(cells)).toEqual(['1', '2', '3 và', '4 – 1', '(2)', '3 – 4 và']);
    expect(countWords([{ start: 0, beats: 3, hits: [0] }], 3)).toEqual(['1 – 2 – 3']);
  });
});

/** Một bài thường (không kiểm tra, không sân khấu) có < 4 hoạt động, có bài hát của 2–4 tuần trước. */
function shortLesson(minWeek = 8) {
  for (const w of WEEKS) {
    if (w.week < minWeek) continue;
    for (const l of w.lessons) {
      if (l.isWeekTest || l.activities.some((a) => a.kind === 'stage') || l.activities.length >= 4) continue;
      if (SONGS.some((s) => (s.week ?? 1) >= l.week - 4 && (s.week ?? 1) <= l.week - 2)) return l;
    }
  }
  throw new Error('không tìm thấy bài ngắn');
}

describe('4. Ôn bài cũ trong buổi', () => {
  it('chỉ khi bật songReview; sau bài mới, trước Con làm thầy; KHÔNG phải bước "activity"', () => {
    const { st } = clockStore();
    const lesson = shortLesson();
    st.setCurrentWeek(lesson.week);
    const base = buildSessionPlan(lesson, st.get(), { rng: () => 0.3, now: T0 });
    expect(base.map((s) => s.kind)).not.toContain('review-song');
    const plan = buildSessionPlan(lesson, st.get(), { rng: () => 0.3, now: T0, songReview: true });
    const kinds = plan.map((s) => s.kind);
    expect(kinds.filter((k) => k === 'review-song')).toHaveLength(1);
    // Số bước hoạt động (đánh dấu xong theo index) không đổi
    expect(kinds.filter((k) => k === 'activity').length).toBe(base.filter((s) => s.kind === 'activity').length);
    const at = kinds.indexOf('review-song');
    expect(at).toBeGreaterThan(kinds.lastIndexOf('activity'));
    expect(kinds[at + 1]).toBe('teach');
    const step = plan[at];
    if (step.kind !== 'review-song') throw new Error();
    const t = findTune(step.songId)!;
    expect(t.week! >= lesson.week - 4 && t.week! <= lesson.week - 2).toBe(true);
    expect(step.phrase).toEqual(phraseRanges(t)[0]);
    expect(step.level).toBe(2);
    expect(step.bpm).toBe(50); // chưa thuộc → 50
  });

  it('không có ở bài kiểm tra tuần, "Chơi lại", bài dài (≥ 4 hoạt động), không có dữ liệu', () => {
    const { st } = clockStore();
    const test = WEEKS.flatMap((w) => w.lessons).find((l) => l.isWeekTest && l.week >= 8)!;
    st.setCurrentWeek(test.week);
    expect(buildSessionPlan(test, st.get(), { songReview: true, now: T0 }).map((s) => s.kind)).not.toContain('review-song');
    const lesson = shortLesson();
    expect(buildSessionPlan(lesson, st.get(), { songReview: true, replay: true, now: T0 }).map((s) => s.kind)).not.toContain('review-song');
    expect(buildSessionPlan(lesson, undefined, { songReview: true, now: T0 }).map((s) => s.kind)).not.toContain('review-song');
    const long = WEEKS.flatMap((w) => w.lessons).find((l) => l.week >= 8 && !l.isWeekTest && l.activities.length >= 4);
    if (long) expect(buildSessionPlan(long, st.get(), { songReview: true, now: T0 }).map((s) => s.kind)).not.toContain('review-song');
  });

  it('ưu tiên bài đã thuộc mà lâu chưa chơi (tốc độ 60), rồi bài lần gần nhất chưa đạt', () => {
    const { st, at } = clockStore();
    const lesson = shortLesson(10);
    const cands = SONGS.filter((s) => (s.week ?? 1) >= lesson.week - 4 && (s.week ?? 1) <= lesson.week - 2);
    expect(cands.length).toBeGreaterThanOrEqual(2);
    const [a, b] = [cands[cands.length - 1], cands[0]];
    st.setCurrentWeek(lesson.week);
    // Mọi bài khác: mới chơi đạt hôm nay (điểm thấp)
    at(40);
    const today = st.startSession(`w${lesson.week}-song-x`);
    for (const c of cands) st.addSongRun(today.id, run(c.id, { mode: 'wait', bpm: 40 }));
    // b: lượt gần nhất KHÔNG đạt
    st.addSongRun(today.id, run(b.id, { mode: 'wait', bpm: 40, passed: false }));
    const s1 = reviewSongStep(lesson, st.get(), T0 + 40 * DAY, () => 0.5)!;
    expect(s1.songId).toBe(b.id);
    // a: đã thuộc từ 40 ngày trước, không chơi CẢ bài từ đó → "phai" → ưu tiên nhất, tốc độ 60
    const { st: st2, at: at2 } = clockStore();
    st2.setCurrentWeek(lesson.week);
    at2(0);
    const old = st2.startSession(`w${lesson.week}-song-a`);
    st2.addSongRun(old.id, run(a.id));
    at2(40);
    const now = st2.startSession(`w${lesson.week}-song-x`);
    for (const c of cands) if (c.id !== a.id) st2.addSongRun(now.id, run(c.id, { mode: 'wait', bpm: 40, passed: c.id !== b.id }));
    const s2 = reviewSongStep(lesson, st2.get(), T0 + 40 * DAY, () => 0.5)!;
    expect(s2.songId).toBe(a.id);
    expect(s2.bpm).toBe(60);
  });

  it('lượt ôn (một câu) không làm bài thành "đã thuộc"', () => {
    const { st } = clockStore();
    const s = st.startSession('w10-l1');
    st.addSongRun(s.id, run('mary_lamb', { phrase: [0, 4] }));
    expect(songMastered(st.get(), 'mary_lamb')).toBe(false);
  });
});

describe('5. Độ "tươi" của bài đã thuộc', () => {
  it(`thuộc + chơi cả bài trong ${FRESH_DAYS} ngày = tươi; lâu hơn = phai (vẫn "đã từng thuộc")`, () => {
    const { st, at } = clockStore();
    const s = st.startSession('w3-l1');
    st.addSongRun(s.id, run('mary_lamb'));
    expect(songFresh('mary_lamb', st.get(), T0 + 10 * DAY)).toBe(true);
    expect(songFresh('mary_lamb', st.get(), new Date(T0 + 30 * DAY))).toBe(false);
    expect(songMastered(st.get(), 'mary_lamb')).toBe(true);
    // Chơi một câu không làm tươi lại; chơi cả bài (kể cả chế độ chờ) thì có
    at(30);
    st.addSongRun(s.id, run('mary_lamb', { phrase: [0, 4], mode: 'wait' }));
    expect(songFresh('mary_lamb', st.get(), T0 + 30 * DAY)).toBe(false);
    st.addSongRun(s.id, run('mary_lamb', { mode: 'wait', bpm: 40 }));
    expect(songFresh('mary_lamb', st.get(), T0 + 30 * DAY)).toBe(true);
    // Chưa thuộc thì không bao giờ "tươi"
    expect(songFresh('hot_cross_buns', st.get(), T0)).toBe(false);
  });

  it('Luyện tập mỗi ngày: bài "giữ phong độ" ưu tiên bài đã thuộc nhưng PHAI', () => {
    const { st, at } = clockStore();
    st.setCurrentWeek(25);
    const old = st.startSession('w25-song-a');
    st.addSongRun(old.id, run('mary_lamb'));
    at(40);
    const s = st.startSession('w25-song-b');
    for (const id of ['hot_cross_buns', 'au_clair', 'lightly_row']) st.addSongRun(s.id, run(id));
    expect(masteredSongs(st.get())).toContain('mary_lamb');
    const l = dailyLesson(st.get(), () => 0.99, T0 + 40 * DAY);
    const last = l.activities[l.activities.length - 1];
    expect(last.kind === 'song' && last.songId).toBe('mary_lamb');
    expect(last.kind === 'song' && last.intro).toContain('Ôn bài cũ');
  });
});

describe('6. Ôn nhanh có trọng số (Leitner)', () => {
  it('trọng số: chưa gặp 1,5; hay sai cao; đúng nhiều lần liền mới gặp hôm qua thấp', () => {
    const { st, at } = clockStore();
    const s = st.startSession('w2-l1');
    for (let i = 0; i < 3; i++) st.addParentAssessment(s.id, 'BAD', 'retry');
    for (let i = 0; i < 4; i++) st.addParentAssessment(s.id, 'GOOD', 'correct');
    at(1);
    const mem = targetMemory(st.get());
    const t = (noteId: string) => ({ noteId, title: noteId, keys: ['C4'] });
    expect(mem.get('BAD')).toMatchObject({ recentErrors: 3, box: 0 });
    expect(mem.get('GOOD')).toMatchObject({ recentErrors: 0, box: 4 });
    const now = T0 + DAY;
    expect(reviewWeight(t('NEW'), mem, now)).toBe(1.5);
    expect(reviewWeight(t('GOOD'), mem, now)).toBe(0.5); // hộp 4 → 14 ngày mới tới hạn
    expect(reviewWeight(t('GOOD'), mem, T0 + 20 * DAY)).toBe(2);
    expect(reviewWeight(t('BAD'), mem, now)).toBe(8);
  });

  it('micro: sai lần đầu = lỗi, trừ khi bố mẹ "Sửa" thành đúng', () => {
    const { st } = clockStore();
    const s = st.startSession('w2-l1');
    st.addMicAssessment(s.id, { expected: 'E4', firstHeard: 'D4', wrongCount: 1 });
    st.addMicAssessment(s.id, { expected: 'F4', firstHeard: 'E4', wrongCount: 1 });
    st.overrideLastMic(s.id, 'correct');
    const mem = targetMemory(st.get());
    expect(mem.get('E4')!.recentErrors).toBe(1);
    expect(mem.get('F4')!.recentErrors).toBe(0);
  });

  it('nốt hay sai được chọn nhiều hơn hẳn; cùng rng → cùng kết quả', () => {
    const { st } = clockStore();
    st.setCurrentWeek(12);
    const lesson = weekPlan(12).lessons[0];
    const seeded = (k: number) => {
      let x = k + 1;
      return () => (x = (x * 9301 + 49297) % 233280) / 233280;
    };
    const freq = (id: string) => {
      let n = 0;
      for (let k = 0; k < 200; k++) if (reviewSegment(lesson, st.get(), seeded(k), T0)?.targets.some((t) => t.noteId === id)) n++;
      return n;
    };
    // Một nốt có thể ôn (lấy từ lần chọn đầu)
    const all = new Set<string>();
    for (let k = 0; k < 50; k++) reviewSegment(lesson, st.get(), seeded(k), T0)?.targets.forEach((t) => all.add(t.noteId));
    expect(all.size).toBeGreaterThan(4);
    const target = [...all][0];
    const before = freq(target);
    const s = st.startSession(lesson.id);
    for (let i = 0; i < 4; i++) st.addParentAssessment(s.id, target, 'retry');
    const after = freq(target);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(before * 2);
    const a = reviewSegment(lesson, st.get(), seeded(7), T0);
    const b = reviewSegment(lesson, st.get(), seeded(7), T0);
    expect(a).toEqual(b);
    // Ôn nhanh vẫn có trong kế hoạch buổi (không đổi cấu trúc)
    expect(buildSessionPlan(lesson, st.get(), { rng: seeded(1), now: T0 }).map((x) => x.kind)).toContain('review');
  });
});
