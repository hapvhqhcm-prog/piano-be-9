/**
 * (+ 2026-10-16) Cách dạy của thầy, tiếp theo:
 * 1. (OWNER duyệt) "ĐỌC TRƯỚC, NGHE MẪU SAU" — từ tuần 8, bài gặp lần đầu trong buổi học (readingAids.readFirstDue);
 * 2. LÙI TỐC ĐỘ — vừa lên nấc mà 2 lượt liền chưa đạt → lùi một nấc (≥ 40), đạt 2 lượt liền mới lại nhanh hơn
 *    (songStats.tempoAdvice / todayTempoOutcomes);
 */
import { describe, expect, it } from 'vitest';
import {
  READ_FIRST_IDLE_MS,
  READ_FIRST_TEXT,
  READ_FIRST_WEEK,
  chantSongIds,
  readFirstDue,
  readFirstUnlocked,
} from '../src/lessons/readingAids';
import { TEMPO_FLOOR, notchBelow, tempoAdvice, todayTempoOutcomes, type TempoOutcome } from '../src/lessons/songStats';
import { findTune } from '../src/music/exercises';
import { expressionUsed } from '../src/music/tune';
import { defaultData, localDateStr, type AppData, type Session, type SongRun } from '../src/progress/schema';
import { fixtureWeek4Child } from './fixtures/week4Child';

const NOW = new Date(2026, 9, 16, 18);

function withWeek(week: number, runs: SongRun[] = []): AppData {
  const d = defaultData(NOW);
  d.progress.currentWeek = week;
  if (runs.length) d.sessions.push(session(runs));
  return d;
}
function session(runs: SongRun[], day = NOW): Session {
  const t = day.getTime();
  return {
    id: `t-${t}-${runs.length}`, date: localDateStr(day), lessonId: 'w8-l1', parentAssessments: [], appAssessments: [], micAssessments: [],
    songRuns: runs, selfRating: null, startedAt: t, endedAt: t + 600e3, minutes: 10, completed: true, checklist: {},
  };
}
const run = (songId: string, bpm: number, passed: boolean, ts: number, o: Partial<SongRun> = {}): SongRun => ({
  songId, mode: 'tempo', level: 2, bpm, hints: 'names', phrase: null, total: 20, hits: passed ? 19 : 10, source: 'mic', passed, ts, ...o,
});

describe('1. Đọc trước, nghe mẫu sau (OWNER duyệt)', () => {
  const song = findTune('london_bridge')!;
  it('tuần 8, bài gặp lần đầu trong buổi học → có; tuần 7 → không', () => {
    expect(READ_FIRST_WEEK).toBe(8);
    expect(readFirstDue(withWeek(8), song, {})).toBe(true);
    expect(readFirstDue(withWeek(12), song, {})).toBe(true);
    expect(readFirstDue(withWeek(7), song, {})).toBe(false);
  });
  it('không áp dụng: Thư viện, sân khấu, bước ôn, "Lặp 3 lần", đọc nhạc ngẫu nhiên', () => {
    const d = withWeek(9);
    for (const o of [{ free: true }, { stage: true }, { review: true }, { loop: true }]) expect(readFirstDue(d, song, o)).toBe(false);
    expect(readFirstDue(d, { ...song, id: 'sight-1' }, {})).toBe(false);
  });
  it('bài đã có lượt (kể cả một câu / chế độ chờ) → không còn "gặp lần đầu"', () => {
    expect(readFirstDue(withWeek(9, [run(song.id, 60, false, NOW.getTime(), { mode: 'wait', phrase: [0, 2] })]), song, {})).toBe(false);
  });
  it('không áp dụng: bài có cờ "Đọc nhịp trước" (chant) và bài có pedal (Cấp 4)', () => {
    const chantId = [...chantSongIds()][0];
    expect(chantId).toBeTruthy();
    expect(readFirstDue(withWeek(20), findTune(chantId)!, {})).toBe(false);
    const ped = findTune('silent_night_ped')!;
    expect(expressionUsed(ped).ped).toBe(true);
    expect(readFirstDue(withWeek(30), ped, {})).toBe(false);
  });
  it('bé thật (fixture tuần 4) chưa tới tuần 8 → màn bài hát không đổi', () => {
    const d = fixtureWeek4Child(NOW);
    expect(readFirstDue(d, song, {})).toBe(false);
  });
  it('nút nghe mẫu mở khi: bé đã thử / chờ 20 giây / sai 2 lần một chỗ', () => {
    expect(readFirstUnlocked({ attempted: false, idleMs: 0 })).toBe(false);
    expect(readFirstUnlocked({ attempted: false, idleMs: READ_FIRST_IDLE_MS - 1, wrongHere: 1 })).toBe(false);
    expect(readFirstUnlocked({ attempted: true, idleMs: 0 })).toBe(true);
    expect(readFirstUnlocked({ attempted: false, idleMs: 20_000 })).toBe(true);
    expect(readFirstUnlocked({ attempted: false, idleMs: 0, wrongHere: 2 })).toBe(true);
    expect(READ_FIRST_TEXT).toBe('Con thử tự đọc trước nhé — đọc xong mới nghe mẫu!');
  });
});

describe('2. Lùi tốc độ khi vừa lên nấc mà chưa chắc tay', () => {
  const o = (bpm: number, passed: boolean): TempoOutcome => ({ bpm, passed });
  it('đạt 50 → lên 60 → 2 lượt liền chưa đạt → lùi về 50', () => {
    expect(tempoAdvice([o(50, true), o(60, false)])).toEqual({ pullTo: null, hold: null });
    expect(tempoAdvice([o(50, true), o(60, false), o(60, false)])).toEqual({ pullTo: 50, hold: 50 });
  });
  it('chưa từng LÊN nấc (chưa đạt ở tốc độ chậm hơn) → không lùi; không bao giờ dưới 40', () => {
    expect(tempoAdvice([o(60, false), o(60, false)]).pullTo).toBeNull();
    expect(tempoAdvice([o(40, true), o(40, false), o(40, false)]).pullTo).toBeNull();
    expect(notchBelow(50)).toBe(40);
    expect(notchBelow(40)).toBe(TEMPO_FLOOR);
    expect(notchBelow(45)).toBe(40);
    expect(notchBelow(80)).toBe(72);
    expect(notchBelow(72)).toBe(60);
  });
  it('một lượt đạt xen giữa → không lùi (cần 2 lượt LIỀN chưa đạt)', () => {
    expect(tempoAdvice([o(50, true), o(60, false), o(60, true), o(60, false)]).pullTo).toBeNull();
  });
  it('không nhảy lên xuống: ở tốc độ đã lùi phải đạt 2 lượt liền mới thôi giữ', () => {
    const base = [o(50, true), o(60, false), o(60, false)];
    expect(tempoAdvice([...base, o(50, true)])).toEqual({ pullTo: null, hold: 50 });
    expect(tempoAdvice([...base, o(50, true), o(50, false)]).hold).toBe(50);
    expect(tempoAdvice([...base, o(50, true), o(50, false), o(50, true)]).hold).toBe(50);
    expect(tempoAdvice([...base, o(50, true), o(50, true)])).toEqual({ pullTo: null, hold: null });
    // bé tự chọn tốc độ cao hơn và ĐẠT → thôi giữ
    expect(tempoAdvice([...base, o(60, true)]).hold).toBeNull();
  });
  it('lên lại rồi lại hụt 2 lượt → lùi lần nữa', () => {
    const seq = [o(50, true), o(60, false), o(60, false), o(50, true), o(50, true), o(60, false), o(60, false)];
    expect(tempoAdvice(seq)).toEqual({ pullTo: 50, hold: 50 });
  });
  it('mở bài ở tốc độ của bài (sau khi đã đạt chậm) mà hụt 2 lượt → lùi một nấc trên thang', () => {
    expect(tempoAdvice([o(50, true), o(80, false), o(80, false)]).pullTo).toBe(72);
  });
  it('todayTempoOutcomes: chỉ lượt theo nhịp HÔM NAY, đúng câu, đủ tay, theo thứ tự', () => {
    const t = NOW.getTime();
    const y = t - 86_400_000;
    const d = withWeek(9, [
      run('s', 60, false, t + 3),
      run('s', 50, true, t + 1),
      run('s', 60, false, t + 2),
      run('s', 60, true, t + 4, { phrase: [0, 2] }),
      run('s', 60, true, t + 5, { hand: 'RH' }),
      run('s', 60, true, t + 6, { mode: 'wait' }),
      run('other', 60, true, t + 7),
    ]);
    d.sessions.push(session([run('s', 40, true, y)], new Date(y)));
    const outs = todayTempoOutcomes(d, 's', null, t + 10);
    expect(outs).toEqual([o(50, true), o(60, false), o(60, false)]);
    expect(tempoAdvice(outs).pullTo).toBe(50);
    expect(todayTempoOutcomes(d, 's', [0, 2], t + 10)).toEqual([o(60, true)]);
  });
});
