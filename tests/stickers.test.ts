import { describe, expect, it } from 'vitest';
import { WEEKS } from '../src/lessons/lessonEngine';
import {
  FOLK_SONG_IDS,
  allStickers,
  bestStreak,
  busyWeeks,
  earnedStickerIds,
  newStickers,
} from '../src/lessons/stickers';
import { SONGS } from '../src/music/tune';
import { defaultData, type AppData, type Session, type SongRun } from '../src/progress/schema';

let seq = 0;
function session(p: Partial<Session> = {}): Session {
  seq++;
  return {
    id: `s${seq}`,
    date: '2026-10-01',
    lessonId: 'w1-l1',
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: [],
    selfRating: null,
    startedAt: 0,
    endedAt: null,
    minutes: 10,
    completed: true,
    checklist: {},
    ...p,
  };
}

function run(songId: string, p: Partial<SongRun> = {}): SongRun {
  return { songId, mode: 'tempo', bpm: 60, hints: 'full', total: 20, hits: 18, source: 'parent', passed: true, ts: 0, ...p };
}

function data(sessions: Session[] = [], currentWeek = 1): AppData {
  const d = defaultData(new Date(2026, 9, 4));
  d.sessions = sessions;
  d.progress.currentWeek = currentWeek;
  return d;
}

const earned = (d: AppData) => new Set(earnedStickerIds(d));

describe('sổ sticker', () => {
  it('dữ liệu mới: chưa có sticker nào; id không trùng; mỗi sticker có tên và gợi ý', () => {
    const all = allStickers(data());
    expect(all.filter((s) => s.earned)).toEqual([]);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    for (const s of all) {
      expect(s.title.length).toBeGreaterThan(1);
      expect(s.hint.length).toBeGreaterThan(3);
    }
    // 1 đảo / tuần + 3 huy chương + 5 mốc bài + 4 mốc tuần chăm chỉ + dân ca + micro + 2 trò sắc thái
    // (sticker chuỗi ngày cũ chỉ xuất hiện khi bé đã nhận)
    expect(all).toHaveLength(WEEKS.length + 3 + 5 + 4 + 1 + 1 + 2);
  });

  it('đảo: các tuần trước tuần hiện tại đã qua; gợi ý ghi tên đảo', () => {
    const e = earned(data([], 4));
    expect(['island-1', 'island-2', 'island-3'].every((id) => e.has(id))).toBe(true);
    expect(e.has('island-4')).toBe(false);
    const sol = allStickers(data()).find((s) => s.id === `island-${WEEKS[10].week}`)!;
    expect(sol.hint).toBe(`Qua ${WEEKS[10].island}`);
  });

  it('mốc bài hát thuộc 1 / 5 / 10 (thuộc = theo nhịp ≥ 60, cả bài)', () => {
    const ids = SONGS.slice(0, 10).map((t) => t.id);
    const d = data([session({ songRuns: ids.map((id) => run(id)) })]);
    const e = earned(d);
    expect(e.has('songs-1') && e.has('songs-5') && e.has('songs-10')).toBe(true);
    expect(e.has('songs-20')).toBe(false);
    // Chơi chậm / chỉ một câu / chế độ chờ thì chưa tính là thuộc
    const slow = data([
      session({ songRuns: [run(ids[0], { bpm: 50 }), run(ids[1], { phrase: [0, 2] }), run(ids[2], { mode: 'wait' })] }),
    ]);
    expect(earned(slow).has('songs-1')).toBe(false);
  });

  it('tuần chăm chỉ: đếm tuần (thứ 2 → CN) có ≥ 4 buổi hoàn thành; mốc 1 / 3 / 6 / 10', () => {
    // Tuần 7–13/9: 4 buổi (2 buổi cùng ngày vẫn tính) · tuần 14–20/9: 3 buổi + 1 buổi chưa xong → chưa đủ
    const wk1 = ['2026-09-07', '2026-09-07', '2026-09-09', '2026-09-13'].map((date) => session({ date }));
    const wk2 = ['2026-09-14', '2026-09-15', '2026-09-16'].map((date) => session({ date }));
    const d = data([...wk1, ...wk2, session({ date: '2026-09-17', completed: false })]);
    expect(busyWeeks(d)).toBe(1);
    const e = earned(d);
    expect(e.has('week-1')).toBe(true);
    expect(e.has('week-3')).toBe(false);
    // Thêm 2 tuần đủ buổi (tuần qua tháng 28/9–4/10) → mốc 3
    const wk3 = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'].map((date) => session({ date }));
    const wk4 = ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-04'].map((date) => session({ date }));
    expect(busyWeeks(data([...wk1, ...wk2, ...wk3, ...wk4]))).toBe(3);
    expect(earned(data([...wk1, ...wk3, ...wk4])).has('week-3')).toBe(true);
    // Nghỉ cả tuần sau không mất sticker (chỉ tăng)
    expect(earned(data([...wk1, ...wk3, ...wk4, session({ date: '2026-10-20' })])).has('week-3')).toBe(true);
  });

  it('chuỗi ngày CŨ: sticker đã nhận trước ngày đổi được giữ; sau ngày đổi không có mốc chuỗi ngày mới', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-20'];
    const d = data(days.map((date) => session({ date })));
    expect(bestStreak(d)).toBe(7);
    const e = earned(d);
    expect(e.has('streak-3') && e.has('streak-7')).toBe(true);
    expect(e.has('streak-14')).toBe(false);
    // Sticker chưa nhận thì không hiện (không còn là mục tiêu)
    expect(allStickers(d).some((s) => s.id === 'streak-14')).toBe(false);
    // Qua tháng
    expect(bestStreak(data(['2026-09-30', '2026-10-01', '2026-10-02'].map((date) => session({ date }))))).toBe(3);
    const half = data([session({ date: '2026-09-01' }), session({ date: '2026-09-02', completed: false }), session({ date: '2026-09-03' })]);
    expect(bestStreak(half)).toBe(1);
    // Chuỗi ngày mới (sau ngày đổi) không tạo sticker chuỗi ngày
    const later = data(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].map((date) => session({ date })));
    expect([...earned(later)].some((id) => id.startsWith('streak-'))).toBe(false);
  });

  it('micro chấm trọn bài không sai: cần source mic, đạt, cả bài, đúng hết', () => {
    const id = SONGS[0].id;
    expect(earned(data([session({ songRuns: [run(id, { source: 'mic', hits: 19, total: 20 })] })])).has('mic-perfect')).toBe(false);
    expect(earned(data([session({ songRuns: [run(id, { source: 'parent', hits: 20, total: 20 })] })])).has('mic-perfect')).toBe(false);
    expect(earned(data([session({ songRuns: [run(id, { source: 'mic', hits: 8, total: 8, phrase: [0, 2] })] })])).has('mic-perfect')).toBe(false);
    expect(earned(data([session({ songRuns: [run(id, { source: 'mic', mode: 'wait', hits: 20, total: 20 })] })])).has('mic-perfect')).toBe(true);
    // Chỉ tập một tay thì chưa tính
    expect(earned(data([session({ songRuns: [run(id, { source: 'mic', hits: 20, total: 20, hand: 'RH' })] })])).has('mic-perfect')).toBe(false);
  });

  it('dân ca: thuộc bất kỳ bài dân ca nào', () => {
    expect(FOLK_SONG_IDS.length).toBeGreaterThanOrEqual(6);
    expect(FOLK_SONG_IDS).toContain('ly_cay_da');
    expect(earned(data([session({ songRuns: [run('ly_cay_da')] })])).has('folk')).toBe(true);
    expect(earned(data([session({ songRuns: [run('ly_cay_da', { bpm: 40 })] })])).has('folk')).toBe(false);
  });

  it('trò sắc thái: ≥ 3 lượt khác nhau đúng trong cùng một buổi, tách To/nhỏ và Ngắt/liền', () => {
    const pa = (note: string, result: 'correct' | 'retry' = 'correct') => ({ note, result, ts: 0 });
    const ok = data([session({ parentAssessments: [pa('dyn:loud-soft:0'), pa('dyn:loud-soft:1'), pa('dyn:loud-soft:2')] })]);
    expect(earned(ok).has('dyn-loud-soft')).toBe(true);
    expect(earned(ok).has('dyn-stac-leg')).toBe(false);
    const repeat = data([session({ parentAssessments: [pa('dyn:stac-leg:0'), pa('dyn:stac-leg:0'), pa('dyn:stac-leg:0'), pa('dyn:stac-leg:1', 'retry')] })]);
    expect(earned(repeat).has('dyn-stac-leg')).toBe(false);
  });

  it('huy chương cấp: bố mẹ trao huy chương ở buổi sân khấu tuần 10 / 20 / 30 (v5)', () => {
    const medal = (week: number) => session({ lessonId: `w${week}-stage`, parentAssessments: [{ note: 'medal', result: 'correct', ts: 0 }] });
    const e = earned(data([medal(10), medal(20)], 21));
    expect(e.has('medal-1') && e.has('medal-2')).toBe(true);
    expect(e.has('medal-3')).toBe(false);
  });

  it('newStickers: chỉ trả sticker vừa nhận so với danh sách trước buổi', () => {
    const before = data([], 2);
    const ids = earnedStickerIds(before);
    expect(ids).toEqual(['island-1']);
    const after = data([session({ songRuns: [run('ly_cay_da')] })], 3);
    expect(newStickers(ids, after).map((s) => s.id).sort()).toEqual(['folk', 'island-2', 'songs-1'].sort());
    expect(newStickers(earnedStickerIds(after), after)).toEqual([]);
  });
});
