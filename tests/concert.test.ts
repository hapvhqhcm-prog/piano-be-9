import { describe, expect, it } from 'vitest';
import {
  cleanAudience,
  concertDone,
  concertLog,
  concertOfferWeek,
  concertSongs,
  concertStickers,
  makeConcert,
  splitAudience,
  upsertConcert,
} from '../src/lessons/concert';
import { allStickers, earnedStickerIds, newStickers } from '../src/lessons/stickers';
import { compactData } from '../src/progress/compaction';
import { migrate } from '../src/progress/migrations';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import { defaultData, validateAppData, type AppData, type Session, type SongRun } from '../src/progress/schema';

let seq = 0;
function session(p: Partial<Session> = {}): Session {
  seq++;
  return {
    id: `s${seq}`,
    date: '2026-10-01',
    lessonId: 'w2-l1',
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
  return { songId, mode: 'tempo', bpm: 60, hints: 'names', total: 20, hits: 18, source: 'parent', passed: true, ts: 1, level: 2, ...p };
}
/** Tuần 2 đạt tiêu chí: "Bánh nóng" trọn bài đạt ở 2 ngày */
function week2Passed(dates: [string, string] = ['2026-10-01', '2026-10-02'], currentWeek = 2): AppData {
  const d = defaultData(new Date(2026, 9, 1));
  d.progress.currentWeek = currentWeek;
  d.sessions = dates.map((date, i) => session({ date, startedAt: i + 1, songRuns: [run('hot_cross_buns', { ts: i + 1 })] }));
  return d;
}
const concert = (week: number, p: Partial<Parameters<typeof makeConcert>[0]> = {}) =>
  makeConcert({ week, songId: 'hot_cross_buns', reactions: { clap: 3, heart: 2, star: 1 }, audience: ['Mẹ', 'Bà'], now: new Date(2026, 9, 3, 18), ...p });

describe('🎤 Biểu diễn cho cả nhà — khi nào được mời', () => {
  it('chưa đạt tiêu chí tuần (và chưa qua tuần nào) → không mời', () => {
    // tuần 1 chưa đạt (bài chơi được rồi nhưng tuần chưa qua) → không mời
    const d1 = week2Passed(undefined, 1);
    expect(concertOfferWeek(d1)).toBeNull();
    // tuần 3 mới đạt 1 ngày, tuần 2 (vừa qua) đã diễn → không mời
    const d = week2Passed(undefined, 3);
    upsertConcert(d, concert(2));
    d.sessions.push(session({ lessonId: 'w3-l1', date: '2026-10-05', songRuns: [run('hot_cross_buns', { ts: 9 })] }));
    expect(concertOfferWeek(d)).toBeNull();
    expect(concertOfferWeek(defaultData())).toBeNull();
  });

  it('đạt tiêu chí tuần hiện tại → mời tuần đó; bài tuần đó đứng đầu danh sách', () => {
    const d = week2Passed();
    expect(concertOfferWeek(d)).toBe(2);
    expect(concertSongs(d, 2)[0].id).toBe('hot_cross_buns');
  });

  it('MỘT lần mỗi tuần: đã diễn tuần 2 → không mời nữa', () => {
    const d = week2Passed();
    expect(upsertConcert(d, concert(2))).toBe(true);
    expect(concertDone(d, 2)).toBe(true);
    expect(concertOfferWeek(d)).toBeNull();
    // thêm buổi khác cho cùng tuần → bị bỏ qua (một sticker / tuần)
    expect(upsertConcert(d, concert(2, { now: new Date(2026, 9, 4) }))).toBe(false);
    expect(concertLog(d)).toHaveLength(1);
  });

  it('đã sang tuần mới (tuần mới chưa đạt) → mời tuần vừa qua nếu chưa diễn', () => {
    const d = week2Passed(undefined, 3);
    expect(concertOfferWeek(d)).toBe(2);
    upsertConcert(d, concert(2));
    expect(concertOfferWeek(d)).toBeNull();
  });

  it('không có bài nào chơi đạt → không mời', () => {
    const d = week2Passed(undefined, 3);
    // bỏ hết lượt chơi: tuần 2 vẫn "đã qua" nhưng không có bài để diễn
    d.sessions = [];
    expect(concertOfferWeek(d)).toBeNull();
  });

  it('tuần hòa nhạc cuối cấp (10) không mời — đã có sân khấu riêng', () => {
    const d = week2Passed(undefined, 11);
    expect(concertOfferWeek(d)).toBeNull(); // tuần 11 chưa đạt → tuần 10 = tuần hòa nhạc
  });
});

describe('nhật ký buổi diễn', () => {
  it('khán giả: gọn, không trùng, tách ô "Ai nữa?"', () => {
    expect(cleanAudience(['  Mẹ ', 'mẹ', '', 'Bà   nội'])).toEqual(['Mẹ', 'Bà nội']);
    expect(splitAudience('Cô Lan, bạn Minh và chú Tư')).toEqual(['Cô Lan', 'bạn Minh', 'chú Tư']);
    const c = concert(2, { reactions: { clap: -3, heart: 2.7, star: Number.NaN } });
    expect(c.reactions).toEqual({ clap: 0, heart: 2, star: 0 });
    expect(c.date).toBe('2026-10-03');
  });

  it('schema: hợp lệ; kiểu sai hẳn bị chặn; bản ghi hỏng bị bỏ qua khi đọc (không hỏng cả dữ liệu)', () => {
    const d = week2Passed();
    upsertConcert(d, concert(2));
    expect(validateAppData(d)).toEqual([]);
    expect(validateAppData({ ...d, concerts: 'x' })).toContain('concerts');
    const bad = { ...d, concerts: [...(d.concerts ?? []), { id: 'x' }, null] } as unknown as AppData;
    expect(validateAppData(bad)).toEqual([]);
    expect(concertLog(bad)).toHaveLength(1);
    // qua migrate (nhập JSON / mở app) vẫn giữ
    const m = migrate(JSON.parse(JSON.stringify(d)));
    expect(concertLog(m)).toEqual(concertLog(d));
  });

  it('GỘP LỊCH SỬ không làm mất buổi diễn / sticker', () => {
    const d = week2Passed(['2026-06-01', '2026-06-02'], 3);
    upsertConcert(d, concert(2, { now: new Date(2026, 5, 3) }));
    const before = earnedStickerIds(d);
    expect(before).toContain('concert-w2');
    const res = compactData(d, new Date(2026, 9, 7));
    expect(res.folded).toBe(2);
    expect(d.sessions).toHaveLength(0);
    expect(concertLog(d)).toHaveLength(1);
    expect(earnedStickerIds({ ...d })).toEqual(before);
    // sau gộp: tuần 2 vẫn "đã diễn", bài vẫn diễn được (tổng hợp lịch sử)
    expect(concertOfferWeek(d)).toBeNull();
    expect(concertSongs(d, 2).map((t) => t.id)).toContain('hot_cross_buns');
  });

  it('ProgressStore.saveConcert lưu vào localStorage, nạp lại vẫn còn; tự gộp khi kết buổi không mất', () => {
    const kv = new MemoryStorage();
    let t = new Date(2026, 5, 1, 17);
    const st = new ProgressStore(kv, () => t, { saveDelayMs: 0, pageEvents: false });
    expect(st.saveConcert(concert(2, { now: t }))).toBe(true);
    expect(st.saveConcert(concert(2, { now: t }))).toBe(false); // cùng tuần
    t = new Date(2026, 9, 7, 17);
    const s = st.startSession('w3-l1');
    st.finishSession(s.id); // tự gộp lịch sử
    const st2 = new ProgressStore(kv, () => t, { saveDelayMs: 0, pageEvents: false });
    expect(concertLog(st2.get()).map((c) => c.week)).toEqual([2]);
    expect(earnedStickerIds(st2.get())).toContain('concert-w2');
  });
});

describe('sticker 🎤 Buổi diễn', () => {
  it('một sticker / tuần có buổi diễn; dữ liệu mới không thêm ô khóa nào vào sổ', () => {
    expect(allStickers(defaultData()).some((s) => s.kind === 'concert')).toBe(false);
    const d = week2Passed(undefined, 4);
    const before = earnedStickerIds(d);
    upsertConcert(d, concert(2));
    upsertConcert(d, concert(3, { now: new Date(2026, 9, 9) }));
    const st = concertStickers(d);
    expect(st.map((s) => s.id)).toEqual(['concert-w2', 'concert-w3']);
    expect(st[0].n).toBe(6);
    expect(newStickers(before, { ...d }).map((s) => s.id)).toEqual(['concert-w2', 'concert-w3']);
  });
});
