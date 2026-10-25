import { describe, expect, it } from 'vitest';
import { criterionProgress, weekPassed } from '../src/lessons/lessonEngine';
import { compactData } from '../src/progress/compaction';
import { MemoryStorage, ProgressStore, STORAGE_KEY } from '../src/progress/ProgressStore';
import { SETTLE_PASS, micHeard, pinnedSessionIds, settleLegacyReviews } from '../src/progress/reviewQueue';
import { ReviewAudioStore, memoryReviewBackend } from '../src/progress/reviewAudio';
import { defaultData, sanitizeReviews, validReviewItem, validateAppData, type AppData, type ReviewItem, type ReviewRun } from '../src/progress/schema';

/**
 * (2026-10-25, OWNER "bỏ phần phụ huynh") Hàng "🕑 Chờ bố mẹ xem" (2026-10-12) KHÔNG CÒN: app luôn là bé tự học — micro
 * chấm, chỗ micro không chấm được thì bé tự kiểm tra. Dữ liệu cũ còn mục chờ → dọn MỘT lần (settleLegacyReviews):
 * - lượt cả bài micro đã nghe ≥ 80% → ghi như micro chấm ĐẠT vào ĐÚNG buổi / ngày (quy tắc "2 ngày khác nhau" giữ đúng);
 * - còn lại (phiếu bố mẹ, thẻ xem tay, huy chương, thử thách) → bỏ, không ghi gì.
 * (Thay cho các test "Đạt / Chưa đạt / lời nhắc / hết hạn" của hàng chờ cũ.)
 */

const frog: ReviewRun = { songId: 'frog_hop', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 20 };
const T = (day: number) => new Date(2026, 9, day, 17).getTime();
const date = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;

/** Dữ liệu tuần 5 có buổi ngày `days` (mã s<day>) */
function week5(days: number[]): AppData {
  const d = defaultData(new Date(2026, 9, 1));
  d.progress.currentWeek = 5;
  for (const k of days)
    d.sessions.push({
      id: `s${k}`,
      date: date(k),
      lessonId: 'w5-l1',
      parentAssessments: [],
      appAssessments: [],
      micAssessments: [],
      songRuns: [],
      selfRating: null,
      startedAt: T(k),
      endedAt: T(k) + 600_000,
      minutes: 10,
      completed: true,
      checklist: {},
    });
  return d;
}
const song = (k: number, heard: number | null, p: Partial<ReviewItem> = {}): ReviewItem => ({
  id: `rv-${k}-${heard}`,
  kind: 'song',
  group: `song:${k}:${heard}`,
  label: 'Ếch nhảy — theo nhịp 60',
  date: date(k),
  ts: T(k) + 1000,
  sessionId: `s${k}`,
  lessonId: 'w5-l1',
  run: frog,
  ...(heard === null ? {} : { mic: `micro nghe chưa rõ (nghe được ${heard}/20 nốt)` }),
  ...p,
});

describe('micHeard: đọc nhận xét tạm của micro', () => {
  it('"nghe được X/Y nốt" → số; không có / sai → null', () => {
    expect(micHeard('micro nghe chưa rõ (nghe được 7/10 nốt)')).toEqual({ hits: 7, total: 10 });
    expect(micHeard('micro nghe chưa rõ')).toBeNull();
    expect(micHeard(undefined)).toBeNull();
    expect(micHeard('nghe được 12/10')).toBeNull();
    expect(SETTLE_PASS).toBe(0.8);
  });
});

describe('settleLegacyReviews: dọn hàng chờ cũ một lần', () => {
  it('không có hàng chờ → không đổi gì', () => {
    const d = week5([1]);
    const before = JSON.stringify(d.sessions);
    expect(settleLegacyReviews(d)).toEqual({ dropped: [], counted: 0 });
    expect(JSON.stringify(d.sessions)).toBe(before);
  });
  it('hai hôm micro nghe ≥ 80% → tính như micro chấm, vào ĐÚNG ngày → đạt 2 ngày', () => {
    const d = week5([1, 2]);
    d.reviews = [song(1, 17), song(2, 20)];
    expect(weekPassed(5, d)).toBe(false);
    const r = settleLegacyReviews(d);
    expect(r.counted).toBe(2);
    expect(r.dropped).toHaveLength(2);
    expect(d.reviews).toBeUndefined();
    expect(weekPassed(5, d)).toBe(true);
    const dates = d.sessions.filter((s) => s.songRuns.length).map((s) => s.date);
    expect(dates).toEqual([date(1), date(2)]);
    expect(d.sessions[0].songRuns[0]).toMatchObject({ source: 'mic', passed: true, hits: 17, total: 20, ts: T(1) + 1000 });
  });
  it('hai lượt cùng MỘT ngày = một ngày', () => {
    const d = week5([1]);
    d.reviews = [song(1, 18), song(1, 19, { id: 'b', group: 'b' })];
    settleLegacyReviews(d);
    expect(criterionProgress(5, d)).toEqual({ days: 1, needDays: 2 });
  });
  it('micro nghe < 80% / không có số → bỏ, không ghi gì', () => {
    const d = week5([1, 2]);
    d.reviews = [song(1, 15), song(2, null)];
    const before = JSON.stringify(d.sessions);
    expect(settleLegacyReviews(d)).toMatchObject({ counted: 0 });
    expect(JSON.stringify(d.sessions)).toBe(before);
    expect(weekPassed(5, d)).toBe(false);
  });
  it('thẻ / nốt bố mẹ xác nhận, lời nhắc xem tay, huy chương, thử thách → bỏ (không tính)', () => {
    const d = week5([1]);
    d.reviews = [
      { id: 'c4', kind: 'check', group: 'notes:w1-test', label: 'Tìm Đô', date: date(1), ts: T(1), sessionId: 's1', notes: Array.from({ length: 10 }, (_, i) => ({ note: 'C4', ts: T(1) + i })) },
      { id: 'look', kind: 'check', group: 'look:relax:wrist', label: 'xem tay', date: date(1), ts: T(1), visual: true, notes: [{ note: 'relax:wrist', ts: T(1) }] },
      { id: 'medal', kind: 'check', group: 'medal', label: 'Huy chương', date: date(1), ts: T(1), notes: [{ note: 'medal', ts: T(1) }] },
      { id: 'ch', kind: 'challenge', group: 'challenge:x', label: 'Thử thách', date: date(1), ts: T(1), challenge: 'teach' },
    ];
    const before = JSON.stringify(d.sessions);
    expect(settleLegacyReviews(d)).toEqual({ dropped: ['c4', 'look', 'medal', 'ch'], counted: 0 });
    expect(JSON.stringify(d.sessions)).toBe(before);
    expect(d.reviews).toBeUndefined();
  });
  it('buổi đã bị xoá → tạo buổi tối thiểu cùng ngày & mã bài', () => {
    const d = defaultData(new Date(2026, 9, 1));
    d.reviews = [song(3, 20, { sessionId: 'gone' })];
    settleLegacyReviews(d);
    expect(d.sessions).toHaveLength(1);
    expect(d.sessions[0]).toMatchObject({ date: date(3), lessonId: 'w5-l1' });
    expect(d.sessions[0].songRuns[0].ts).toBe(T(3) + 1000);
  });
  it('gọi lại → an toàn (không ghi hai lần)', () => {
    const d = week5([1]);
    d.reviews = [song(1, 20)];
    settleLegacyReviews(d);
    expect(settleLegacyReviews(d)).toEqual({ dropped: [], counted: 0 });
    expect(d.sessions[0].songRuns).toHaveLength(1);
  });
});

describe('kho: dọn khi mở app / nhập; gộp lịch sử', () => {
  it('mở app với dữ liệu còn hàng chờ → dọn, ghi xuống; takeDroppedReviews trả mã để xoá bản ghi âm', () => {
    const d = week5([1, 2]);
    d.reviews = [song(1, 20), song(2, 3)];
    const kv = new MemoryStorage();
    kv.setItem(STORAGE_KEY, JSON.stringify(d));
    const st = new ProgressStore(kv, () => new Date(2026, 9, 5, 9), { autoCompact: false });
    expect(st.get().reviews).toBeUndefined();
    expect(st.takeDroppedReviews()).toHaveLength(2);
    expect(st.takeDroppedReviews()).toEqual([]);
    expect(JSON.parse(kv.getItem(STORAGE_KEY)!).reviews).toBeUndefined();
    expect(criterionProgress(5, st.get())).toEqual({ days: 1, needDays: 2 });
  });
  it('xuất / nhập JSON: bản sao lưu cũ có hàng chờ (kể cả mục hỏng) → nhập được, được dọn', () => {
    const d = week5([1]);
    d.reviews = [song(1, 20)];
    const json = JSON.parse(JSON.stringify(d));
    json.reviews.push({ id: 'bad', kind: 'song', label: 'x' });
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 2, 17), { autoCompact: false });
    expect(st.importJSON(JSON.stringify(json))).toEqual({ ok: true });
    expect(st.get().reviews).toBeUndefined();
    expect(st.get().sessions[0].songRuns).toHaveLength(1);
  });
  it('gộp lịch sử: dữ liệu CHƯA dọn vẫn giữ buổi còn mục chờ; sau khi dọn thì gộp được, tiêu chí giữ nguyên', () => {
    const d = week5([1, 2]);
    d.reviews = [song(1, 20), song(2, 20)];
    d.progress.currentWeek = 6;
    const far = new Date(2026, 11, 30);
    expect(pinnedSessionIds(d).size).toBe(2);
    expect(compactData(d, far).folded).toBe(0);
    settleLegacyReviews(d);
    expect(pinnedSessionIds(d).size).toBe(0);
    expect(weekPassed(5, d)).toBe(true);
    expect(compactData(d, far).folded).toBe(2);
    expect(d.sessions).toHaveLength(0);
    expect(weekPassed(5, d)).toBe(true);
  });
  it('buổi vừa mở rồi Quay lại (trống) → bỏ như mọi buổi trống', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 2, 17), { autoCompact: false });
    const sid = st.startSession('w5-l1').id;
    st.discardSessionIfEmpty(sid);
    expect(st.get().sessions.some((s) => s.id === sid)).toBe(false);
  });
});

describe('dữ liệu cũ: kiểm tra cấu trúc (vẫn đọc được bản sao lưu cũ)', () => {
  it('validateAppData chặn hàng chờ / cài đặt sai kiểu', () => {
    const d = defaultData() as unknown as Record<string, unknown>;
    expect(validateAppData({ ...d, reviews: 'x' })).toContain('reviews');
    expect(validateAppData({ ...d, reviews: [{ id: 'a' }] })).toContain('reviews');
    const st = (d.settings as object);
    expect(validateAppData({ ...d, settings: { ...st, studyMode: { mode: 'kid', date: '2026-10-12' } } })).toContain('settings.studyMode');
    expect(validateAppData({ ...d, settings: { ...st, studyDefault: 'x' } })).toContain('settings.studyDefault');
    expect(validateAppData({ ...d, settings: { ...st, studyMode: { mode: 'self', date: '2026-10-12' }, studyDefault: 'self' } })).toEqual([]);
  });
  it('validReviewItem / sanitizeReviews', () => {
    const ok = { id: 'a', kind: 'check', group: 'g', label: 'l', date: '2026-10-12', ts: 1, notes: [{ note: 'C4', ts: 1 }] };
    expect(validReviewItem(ok)).toBe(true);
    expect(validReviewItem({ ...ok, notes: [] })).toBe(false);
    expect(validReviewItem({ ...ok, date: '12/10' })).toBe(false);
    expect(validReviewItem({ ...ok, kind: 'song' })).toBe(false);
    expect(validReviewItem({ ...ok, kind: 'song', run: frog })).toBe(true);
    expect(sanitizeReviews([ok, ok, { x: 1 }])).toHaveLength(1);
    expect(sanitizeReviews([])).toBeUndefined();
  });
});

describe('bản ghi âm cũ của hàng chờ (reviewAudio — App xoá hết sau khi dọn)', () => {
  const blob = (n: number) => new Blob([new Uint8Array(n)], { type: 'audio/mp4' });
  it('lưu / đọc; quá dài / quá ngắn không lưu', async () => {
    const s = new ReviewAudioStore(memoryReviewBackend());
    expect(await s.save('a', blob(100), 10)).toEqual({ saved: true, evicted: [] });
    expect((await s.get('a'))?.size).toBe(100);
    expect(await s.save('b', blob(100), 200)).toMatchObject({ saved: false, reason: 'too-long' });
    expect(await s.save('c', blob(100), 0.2)).toMatchObject({ saved: false, reason: 'too-short' });
  });
  it('đầy → bỏ bản CŨ nhất', async () => {
    let t = 0;
    const s = new ReviewAudioStore(memoryReviewBackend(), { maxBytes: 250, now: () => ++t });
    await s.save('a', blob(100), 5);
    await s.save('b', blob(100), 5);
    expect(await s.save('c', blob(100), 5)).toEqual({ saved: true, evicted: ['a'] });
    expect([...(await s.has())].sort()).toEqual(['b', 'c']);
  });
  it('prune: bỏ bản không còn mục chờ / quá hạn', async () => {
    let now = 0;
    const s = new ReviewAudioStore(memoryReviewBackend(), { now: () => now });
    await s.save('a', blob(10), 5);
    now = 20 * 86_400_000;
    await s.save('b', blob(10), 5);
    await s.save('c', blob(10), 5);
    expect((await s.prune(new Set(['a', 'b']))).sort()).toEqual(['a', 'c']);
    expect([...(await s.has())]).toEqual(['b']);
  });
});
