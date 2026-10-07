import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_ORDER,
  MAIN_TEMPO_SONG,
  challengeStreak,
  completedChallengeWeeks,
  curriculumWeekOf,
  eligibleChallenges,
  fasterTarget,
  recordChallenges,
  storedChallenges,
  weeklyChallenge,
  type ChallengeId,
} from '../src/lessons/challenges';
import { allStickers, earnedStickerIds } from '../src/lessons/stickers';
import { findSong } from '../src/music/tune';
import { compactData } from '../src/progress/compaction';
import { mondayKey } from '../src/progress/history';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import { defaultData, localDateStr, validateAppData, type AppData, type SongRun } from '../src/progress/schema';
import { migrate } from '../src/progress/migrations';

/** Kho có đồng hồ chỉnh được (giờ 17:00 mỗi ngày). */
function clock(start: Date) {
  let t = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 17);
  const st = new ProgressStore(new MemoryStorage(), () => t, { saveDelayMs: 0, pageEvents: false });
  return {
    st,
    /** Sang ngày "YYYY-MM-DD" */
    at: (d: string) => {
      const [y, m, dd] = d.split('-').map(Number);
      t = new Date(y, m - 1, dd, 17);
    },
    today: () => localDateStr(t),
  };
}
const run = (o: Partial<SongRun>): Omit<SongRun, 'ts'> => ({
  songId: 'x', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 20, hits: 20, source: 'mic', passed: true, ...o,
});
/** Một buổi HOÀN THÀNH có các lượt chơi `runs`. */
function sessionWith(st: ProgressStore, lessonId: string, runs: Array<Omit<SongRun, 'ts'>> = []): void {
  const s = st.startSession(lessonId);
  for (const r of runs) st.addSongRun(s.id, r);
  st.finishSession(s.id);
}
const addDays = (d: string, n: number) => {
  const [y, m, dd] = d.split('-').map(Number);
  return localDateStr(new Date(y, m - 1, dd + n));
};

/** Thứ 2 đầu tiên kể từ `from` mà thử thách là `id` (kho ≤ 7 → tối đa vài tuần). */
function mondayWith(data: Readonly<AppData>, from: string, id: ChallengeId): string {
  let m = mondayKey(from);
  for (let i = 0; i < 30; i++) {
    if (weeklyChallenge(data, m).id === id) return m;
    m = addDays(m, 7);
  }
  throw new Error(`không tìm thấy tuần có thử thách ${id}`);
}

/** Bé tuần 6, đã thuộc 4 bài (theo nhịp ≥ 60) từ tháng 9. */
function learner() {
  const c = clock(new Date(2026, 8, 1));
  c.st.setCurrentWeek(6);
  sessionWith(c.st, 'w5-l1', ['frog_hop', 'hot_cross_buns', 'mary_lamb', 'jingle_bells'].map((songId) => run({ songId })));
  return c;
}

describe('🏆 Thử thách tuần — chọn cố định', () => {
  it('tuần 1: chỉ có "Bốn ngày chăm"', () => {
    const d = defaultData(new Date(2026, 9, 5));
    expect(eligibleChallenges(d, '2026-10-05').map((p) => p.id)).toEqual(['days4']);
    expect(weeklyChallenge(d, '2026-10-07').id).toBe('days4');
  });

  it('cùng dữ liệu + cùng tuần → cùng thử thách; hai tuần liền nhau với cùng kho → khác nhau', () => {
    const { st } = learner();
    const d = st.get();
    const pool = eligibleChallenges(d, '2026-10-05').map((p) => p.id);
    expect(pool).toEqual(['days4', 'faster', 'perfect', 'review3', 'ear']);
    expect(pool).not.toContain('record'); // chưa chơi trò chơi nào
    const a = weeklyChallenge(d, '2026-10-07');
    expect(weeklyChallenge({ ...d }, '2026-10-09').id).toBe(a.id); // cùng tuần lịch (thứ 4 / thứ 6)
    const ids = Array.from({ length: 6 }, (_, i) => weeklyChallenge(d, addDays('2026-10-05', 7 * i)).id);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    // xoay vòng đủ kho
    expect(new Set(ids).size).toBe(pool.length);
  });

  it('không đổi giữa tuần khi bé qua đảo / thuộc thêm bài', () => {
    const c = learner();
    c.at('2026-10-05');
    const before = weeklyChallenge(c.st.get(), c.today()).id;
    sessionWith(c.st, 'w6-l1', [run({ songId: 'ode_to_joy_easy' }), run({ songId: 'twinkle_easy' })]);
    c.st.setCurrentWeek(7);
    c.at('2026-10-08');
    expect(curriculumWeekOf(c.st.get(), '2026-10-05')).toBe(6);
    expect(weeklyChallenge(c.st.get(), c.today()).id).toBe(before);
  });

  it('"Nhanh hơn": một nấc tốc độ trên tiêu chí (≥ +10)', () => {
    expect(fasterTarget('ode_to_joy_easy', 60)).toBe(72);
    expect(fasterTarget('frog_hop', 0)).toBe(72);
    expect(fasterTarget('ly_cay_da', 0)).toBe(50);
    expect(fasterTarget('silent_night', 50)).toBe(60);
    for (const [w, m] of Object.entries(MAIN_TEMPO_SONG)) {
      expect(findSong(m.songId), `tuần ${w}`).toBeTruthy();
      expect(fasterTarget(m.songId, m.minBpm)).toBeGreaterThanOrEqual((m.minBpm || Math.min(findSong(m.songId)!.bpm, 60)) + 10);
    }
  });

  it('kho thử thách có đủ 7 loại, thứ tự cố định', () => {
    expect(CHALLENGE_ORDER).toEqual(['days4', 'faster', 'perfect', 'review3', 'vn', 'ear', 'record']);
  });
});

describe('🏆 Tiến độ & hoàn thành', () => {
  it('"Bốn ngày chăm": đếm NGÀY có buổi hoàn thành', () => {
    const c = learner();
    const m = mondayWith(c.st.get(), '2026-10-05', 'days4');
    c.at(m);
    expect(weeklyChallenge(c.st.get(), c.today())).toMatchObject({ have: 0, need: 4, done: false, text: '0/4 ngày' });
    for (const k of [0, 0, 1, 3]) {
      c.at(addDays(m, k));
      sessionWith(c.st, 'w6-l1');
    }
    expect(weeklyChallenge(c.st.get(), c.today())).toMatchObject({ have: 3, done: false, text: '3/4 ngày' });
    c.at(addDays(m, 6));
    sessionWith(c.st, 'w6-l1');
    const w = weeklyChallenge(c.st.get(), c.today());
    expect(w).toMatchObject({ have: 4, done: true, progress: 1 });
    // đã LƯU khi xong buổi
    expect(storedChallenges(c.st.get()).get(m)?.id).toBe('days4');
    expect(earnedStickerIds(c.st.get())).toContain(`challenge-${m}`);
  });

  it('"Nhanh hơn": chỉ tính lượt trọn bài theo nhịp ≥ tốc độ thử thách', () => {
    const c = learner();
    const m = mondayWith(c.st.get(), '2026-10-05', 'faster');
    c.at(addDays(m, 1));
    const w0 = weeklyChallenge(c.st.get(), c.today());
    expect(w0.action).toEqual({ kind: 'song', songId: 'ode_to_joy_easy', bpm: 72 });
    sessionWith(c.st, 'w6-l1', [run({ songId: 'ode_to_joy_easy', bpm: 60 }), run({ songId: 'ode_to_joy_easy', bpm: 72, phrase: [0, 2] })]);
    expect(weeklyChallenge(c.st.get(), c.today()).done).toBe(false);
    sessionWith(c.st, 'w6-l1', [run({ songId: 'ode_to_joy_easy', bpm: 72, source: 'parent', checklist: { notes: true, beat: false, fingers: true } })]);
    expect(weeklyChallenge(c.st.get(), c.today()).done).toBe(false); // phiếu bố mẹ chưa đủ 3 ý
    sessionWith(c.st, 'w6-l1', [run({ songId: 'ode_to_joy_easy', bpm: 72 })]);
    expect(weeklyChallenge(c.st.get(), c.today()).done).toBe(true);
  });

  it('"Không sai nốt": bài đã thuộc TRƯỚC tuần, micro đúng hết hoặc phiếu 3 ý ✓', () => {
    const c = learner();
    const m = mondayWith(c.st.get(), '2026-10-05', 'perfect');
    c.at(addDays(m, 2));
    sessionWith(c.st, 'w6-l1', [run({ songId: 'mary_lamb', hits: 19 }), run({ songId: 'twinkle_easy' })]);
    expect(weeklyChallenge(c.st.get(), c.today()).done).toBe(false);
    sessionWith(c.st, 'w6-l1', [run({ songId: 'mary_lamb', mode: 'wait', source: 'parent', hits: 0, checklist: { notes: true, beat: true, fingers: true } })]);
    expect(weeklyChallenge(c.st.get(), c.today()).done).toBe(true);
  });

  it('"Ôn 3 bài cũ": 3 bài KHÁC NHAU đã thuộc', () => {
    const c = learner();
    const m = mondayWith(c.st.get(), '2026-10-05', 'review3');
    c.at(addDays(m, 1));
    sessionWith(c.st, 'w6-l1', [run({ songId: 'frog_hop' }), run({ songId: 'frog_hop' }), run({ songId: 'ode_to_joy_easy' })]);
    expect(weeklyChallenge(c.st.get(), c.today())).toMatchObject({ have: 1, text: '1/3 bài' });
    sessionWith(c.st, 'w6-l1', [run({ songId: 'mary_lamb', mode: 'wait' }), run({ songId: 'jingle_bells', passed: false })]);
    expect(weeklyChallenge(c.st.get(), c.today()).have).toBe(2);
    sessionWith(c.st, 'w6-l1', [run({ songId: 'hot_cross_buns' })]);
    expect(weeklyChallenge(c.st.get(), c.today()).done).toBe(true);
  });

  it('"Bài quê hương": một bài dân ca / nhạc sĩ Việt Nam trọn bài (từ tuần 9)', () => {
    const c = learner();
    expect(eligibleChallenges(c.st.get(), '2026-10-05').some((p) => p.id === 'vn')).toBe(false); // tuần 6: chưa có dân ca
    c.st.setCurrentWeek(9);
    const m = mondayWith(c.st.get(), '2026-10-05', 'vn');
    expect(weeklyChallenge(c.st.get(), m).action).toEqual({ kind: 'library', filter: 'vn' });
    c.at(addDays(m, 3));
    sessionWith(c.st, 'w9-song-inh_la_oi', [run({ songId: 'inh_la_oi', mode: 'wait', phrase: [0, 2] }), run({ songId: 'jingle_bells', mode: 'wait' })]);
    expect(weeklyChallenge(c.st.get(), c.today()).done).toBe(false); // một câu / giai điệu nước ngoài lời Việt: chưa tính
    sessionWith(c.st, 'w9-song-inh_la_oi', [run({ songId: 'inh_la_oi', mode: 'wait' })]);
    expect(weeklyChallenge(c.st.get(), c.today()).done).toBe(true);
  });

  it('"Tai thính": 2 buổi có 5/6 câu đúng liên tiếp', () => {
    const c = learner();
    const m = mondayWith(c.st.get(), '2026-10-05', 'ear');
    c.at(addDays(m, 1));
    const quiz = (wrong: number[]) => {
      const s = c.st.startSession('w6-l1');
      for (let i = 0; i < 6; i++) c.st.addAppAssessment(s.id, 'E4', wrong.includes(i) ? 'F4' : 'E4');
      c.st.finishSession(s.id);
    };
    quiz([1, 3]);
    expect(weeklyChallenge(c.st.get(), c.today()).have).toBe(0);
    quiz([2]);
    expect(weeklyChallenge(c.st.get(), c.today())).toMatchObject({ have: 1, text: '1/2 lần' });
    quiz([]);
    expect(weeklyChallenge(c.st.get(), c.today()).done).toBe(true);
  });
});

describe('🏆 "Phá kỷ lục" (data.games — có thể chưa có)', () => {
  it('không có data.games → không có trong kho; có → mốc đầu tuần + phá kỷ lục trong tuần', () => {
    const c = learner();
    expect(eligibleChallenges(c.st.get(), '2026-10-05').some((p) => p.id === 'record')).toBe(false);
    c.at('2026-09-20');
    c.st.recordGame('noteRush', 12);
    // tuần mới: chụp mốc kỷ lục
    let m = '2026-10-05';
    for (let i = 0; i < 30; i++) {
      c.at(m);
      c.st.recordChallenges();
      if (weeklyChallenge(c.st.get(), m).id === 'record') break;
      m = addDays(m, 7);
    }
    expect(weeklyChallenge(c.st.get(), m).id).toBe('record');
    expect(c.st.get().progress.gameBase).toEqual({ monday: m, bests: { noteRush: 12 } });
    c.at(addDays(m, 2));
    c.st.recordGame('noteRush', 10);
    expect(weeklyChallenge(c.st.get(), c.today()).done).toBe(false);
    c.st.recordGame('noteRush', 15);
    expect(weeklyChallenge(c.st.get(), c.today()).done).toBe(true);
    c.st.recordChallenges();
    expect(storedChallenges(c.st.get()).get(m)?.id).toBe('record');
    // tuần sau: mốc mới = 15, cúp tuần trước vẫn còn
    c.at(addDays(m, 7));
    c.st.recordChallenges();
    expect(c.st.get().progress.gameBase?.bests.noteRush).toBe(15);
    expect(completedChallengeWeeks(c.st.get()).has(m)).toBe(true);
  });
});

describe('🏆 Lưu, chuỗi tuần, gộp lịch sử', () => {
  /** Bé học đủ 4 ngày ở `weeks` tuần liên tiếp (thử thách nào cũng được — chỉ đếm tuần nào xong). */
  function busy(weeks: number, start = '2026-06-01') {
    const c = clock(new Date(2026, 5, 1));
    let m = start;
    const done: string[] = [];
    for (let i = 0; i < weeks; i++) {
      for (const k of [0, 1, 2, 3]) {
        c.at(addDays(m, k));
        sessionWith(c.st, 'w1-l1');
      }
      if (weeklyChallenge(c.st.get(), m).done) done.push(m);
      m = addDays(m, 7);
    }
    return { ...c, done, next: m };
  }

  it('tuần 1 (chỉ "Bốn ngày chăm"): chuỗi tuần liền + cúp theo tuần', () => {
    const c = busy(3);
    expect(c.done).toEqual(['2026-06-01', '2026-06-08', '2026-06-15']);
    expect(challengeStreak(c.st.get(), '2026-06-18')).toBe(3);
    expect(challengeStreak(c.st.get(), '2026-06-23')).toBe(3); // tuần mới chưa xong — chuỗi chưa đứt
    expect(challengeStreak(c.st.get(), '2026-06-30')).toBe(0); // bỏ một tuần
    const cups = allStickers(c.st.get()).filter((s) => s.kind === 'challenge');
    expect(cups.map((s) => s.id)).toEqual(c.done.map((m) => `challenge-${m}`));
    expect(cups[0]).toMatchObject({ title: 'Cúp tuần 1/6', challenge: 'days4', earned: true });
  });

  it('gộp lịch sử: cúp tuần không mất, kết quả giống hệt trước / sau khi gộp', () => {
    const c = busy(4);
    c.st.setCurrentWeek(2); // tuần 1 đã đi qua → buổi cũ được gộp
    // Không lưu gì (giả lập dữ liệu cũ chưa có progress.challenges) → chỉ suy ra từ buổi
    const d = structuredClone(c.st.get()) as AppData;
    delete d.progress.challenges;
    const before = earnedStickerIds({ ...d });
    expect(before.filter((x) => x.startsWith('challenge-'))).toHaveLength(4);
    const res = compactData(d, new Date(2026, 9, 7));
    expect(res.folded).toBeGreaterThan(0);
    expect(d.sessions).toHaveLength(0);
    expect(Object.keys(d.progress.challenges ?? {})).toEqual(c.done);
    expect(earnedStickerIds({ ...d })).toEqual(before);
    expect(challengeStreak({ ...d }, '2026-06-24')).toBe(4);
    // chạy lại: không đổi
    compactData(d, new Date(2026, 9, 8));
    expect(earnedStickerIds({ ...d })).toEqual(before);
  });

  it('store tự gộp (finishSession) vẫn giữ cúp', () => {
    const c = busy(2);
    c.st.setCurrentWeek(2);
    c.at('2026-10-06');
    sessionWith(c.st, 'w2-l1'); // gộp các buổi tháng 6
    const d = c.st.get();
    expect(d.history?.sessions).toBeGreaterThan(0);
    expect(allStickers(d).filter((s) => s.kind === 'challenge').map((s) => s.monday)).toEqual(['2026-06-01', '2026-06-08']);
  });

  it('cúp chỉ tăng: bản ghi đã lưu không bao giờ bị xóa', () => {
    const d = defaultData(new Date(2026, 9, 7));
    d.progress.challenges = { '2026-01-05': { id: 'vn', doneAt: 1 } };
    expect(recordChallenges(d, '2026-10-07', 5)).toBe(false);
    expect(completedChallengeWeeks(d).get('2026-01-05')).toEqual({ id: 'vn', doneAt: 1 });
    expect(allStickers(d).find((s) => s.id === 'challenge-2026-01-05')).toMatchObject({ earned: true, challenge: 'vn' });
  });
});

describe('🏆 Dữ liệu (schema / nhập JSON)', () => {
  it('progress.challenges / gameBase: hợp lệ, bản ghi hỏng bị bỏ qua khi đọc, giữ qua migrate', () => {
    const d = defaultData(new Date(2026, 9, 7)) as AppData;
    d.progress.challenges = { '2026-10-05': { id: 'days4', doneAt: 3 }, bad: { id: 1 } as never, '2026-09-28': null as never };
    d.progress.gameBase = { monday: '2026-10-05', bests: { noteRush: 4 } };
    expect(validateAppData(d)).toEqual([]);
    expect([...storedChallenges(d).keys()]).toEqual(['2026-10-05']);
    const m = migrate(JSON.parse(JSON.stringify(d)));
    expect(m.progress.challenges?.['2026-10-05']).toEqual({ id: 'days4', doneAt: 3 });
    expect(m.progress.gameBase).toEqual({ monday: '2026-10-05', bests: { noteRush: 4 } });
    expect(validateAppData({ ...d, progress: { ...d.progress, challenges: [] } })).toContain('progress.challenges');
  });
});
