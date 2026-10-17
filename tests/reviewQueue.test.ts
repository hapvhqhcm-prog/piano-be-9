import { describe, expect, it } from 'vitest';
import { criterionProgress, weekPassed } from '../src/lessons/lessonEngine';
import { compactData } from '../src/progress/compaction';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import {
  REVIEW_EXPIRE_DAYS,
  addReview,
  approveAll,
  approveReview,
  dismissReview,
  expireReviews,
  pendingCount,
  pinnedSessionIds,
  reminders,
  resolveReminders,
  studyModeToday,
} from '../src/progress/reviewQueue';
import { ReviewAudioStore, memoryReviewBackend } from '../src/progress/reviewAudio';
import { defaultData, sanitizeReviews, validReviewItem, validateAppData, type ReviewRun } from '../src/progress/schema';

/**
 * (+ 2026-10-12, OWNER duyệt "Bé tự học, bố mẹ đỡ vất"): hàng "🕑 Chờ bố mẹ xem".
 * - Mục chờ KHÔNG tính tiêu chí tuần tới khi bố mẹ "✅ Đạt"; Đạt = ghi như bố mẹ chấm vào ĐÚNG buổi / ngày bé làm
 *   (quy tắc "2 ngày khác nhau" vẫn đúng dù bố mẹ duyệt cả hai hôm cùng một lúc).
 * - Chưa đạt = bỏ, không ghi. Thẻ xem tay = lời nhắc. Hết hạn 14 ngày. Gộp lịch sử không gộp buổi còn mục chờ.
 */

/** Kho có đồng hồ chỉnh được: day(k) = 1/10/2026 + k, 17h. */
function clock(start = 1) {
  let d = start;
  const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, d, 17), { autoCompact: false });
  return { st, day: (k: number) => (d = start + k), now: () => new Date(2026, 9, d, 17).getTime() };
}
const frog: ReviewRun = { songId: 'frog_hop', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 20 };
/** Bé tự học: mở buổi tuần 5, đàn trọn "frog_hop" theo nhịp (micro tắt) → mục chờ */
function selfRun(st: ProgressStore, lessonId = 'w5-l1') {
  st.setStudyMode('self');
  st.startSession(lessonId);
  return st.deferReview({ kind: 'song', group: `song:${Math.random()}`, label: 'Ếch nhảy — theo nhịp 60', run: frog });
}

describe('cách học hôm nay', () => {
  it('mặc định có bố mẹ; chọn hôm nay chỉ có hiệu lực hôm nay; mặc định của bố mẹ', () => {
    const s = defaultData().settings;
    expect(studyModeToday(s, '2026-10-12')).toBe('parent');
    expect(studyModeToday({ ...s, studyMode: { mode: 'self', date: '2026-10-12' } }, '2026-10-12')).toBe('self');
    expect(studyModeToday({ ...s, studyMode: { mode: 'self', date: '2026-10-11' } }, '2026-10-12')).toBe('parent');
    expect(studyModeToday({ ...s, studyDefault: 'self', studyMode: { mode: 'parent', date: '2026-10-11' } }, '2026-10-12')).toBe('self');
  });
  it('store nhớ lựa chọn tới hết ngày', () => {
    const { st, day } = clock();
    st.setStudyMode('self');
    expect(st.studyMode()).toBe('self');
    day(1);
    expect(st.studyMode()).toBe('parent');
  });
});

describe('tiêu chí tuần: chỉ tính sau khi bố mẹ Đạt, vào ĐÚNG ngày bé đàn', () => {
  it('hai hôm tự học → chưa đạt; bố mẹ duyệt cả hai vào hôm thứ 3 → đạt 2 ngày', () => {
    const { st, day } = clock();
    day(0);
    selfRun(st);
    day(1);
    selfRun(st);
    expect(pendingCount(st.get())).toBe(2);
    expect(weekPassed(5, st.get())).toBe(false);
    expect(criterionProgress(5, st.get())).toEqual({ days: 0, needDays: 2 });
    day(2);
    expect(st.approveAllReviews()).toBe(2);
    expect(pendingCount(st.get())).toBe(0);
    expect(weekPassed(5, st.get())).toBe(true);
    // Lượt ghi vào đúng buổi / ngày 1 & 2 (không phải hôm duyệt)
    const dates = st.get().sessions.filter((s) => s.songRuns.length).map((s) => s.date);
    expect(dates).toEqual(['2026-10-01', '2026-10-02']);
    const r = st.get().sessions[0].songRuns[0];
    expect(r).toMatchObject({ source: 'parent', passed: true, hits: 20, checklist: { notes: true, beat: true, fingers: true } });
  });
  it('hai lượt cùng MỘT ngày được duyệt = một ngày', () => {
    const { st } = clock();
    selfRun(st);
    selfRun(st);
    st.approveAllReviews();
    expect(criterionProgress(5, st.get())).toEqual({ days: 1, needDays: 2 });
  });
  it('🔁 Chưa đạt: bỏ mục, không ghi gì', () => {
    const { st } = clock();
    const id = selfRun(st);
    const before = JSON.stringify(st.get().sessions);
    expect(st.dismissReview(id)).toBe(true);
    expect(JSON.stringify(st.get().sessions)).toBe(before);
    expect(st.get().reviews).toBeUndefined();
  });
  it('kết quả micro vẫn tính ngay (hôm nay) — cùng tiêu chí với lượt được duyệt hôm trước', () => {
    const { st, day } = clock();
    selfRun(st); // hôm 1: chờ bố mẹ
    day(1);
    st.addSongRun(st.startSession('w5-l1').id, { ...frog, hits: 19, source: 'mic', passed: true });
    expect(criterionProgress(5, st.get())?.days).toBe(1);
    st.approveAllReviews();
    expect(weekPassed(5, st.get())).toBe(true);
  });
  it('tuần 1 (tìm Đô 10 lần): các lần bé tự chạm gộp vào MỘT mục; Đạt → qua tuần 1', () => {
    const { st } = clock();
    st.setStudyMode('self');
    st.startSession('w1-test');
    for (let i = 0; i < 10; i++) st.deferReview({ kind: 'check', group: 'notes:w1-test', label: 'Tìm Đô', notes: [{ note: 'C4', ts: Date.now() + i }] });
    expect(st.reviews()).toHaveLength(1);
    expect(st.reviews()[0].notes).toHaveLength(10);
    expect(weekPassed(1, st.get())).toBe(false);
    st.approveReview(st.reviews()[0].id);
    expect(weekPassed(1, st.get())).toBe(true);
  });
  it('huy chương cuối cấp (tuần 10) tính khi bố mẹ duyệt', () => {
    const { st } = clock();
    st.setStudyMode('self');
    st.startSession('w10-l3');
    st.deferReview({ kind: 'check', group: 'medal', label: 'Huy chương', notes: [{ note: 'medal', ts: 1 }] });
    expect(weekPassed(10, st.get())).toBe(false);
    st.approveAllReviews();
    expect(weekPassed(10, st.get())).toBe(true);
  });
  it('buổi đã bị xoá → tạo buổi tối thiểu cùng ngày & mã bài', () => {
    const d = defaultData(new Date(2026, 9, 1));
    const id = addReview(d, { kind: 'song', group: 'g', label: 'x', run: frog, lessonId: 'w5-l1', date: '2026-10-01', ts: 5 }, 10);
    approveReview(d, id);
    expect(d.sessions).toHaveLength(1);
    expect(d.sessions[0]).toMatchObject({ date: '2026-10-01', lessonId: 'w5-l1' });
    expect(d.sessions[0].songRuns[0].ts).toBe(5);
  });
});

describe('Cấp 4 — thẻ xem tay: lời nhắc, không chấm bằng tai', () => {
  it('relax:* thành lời nhắc (không Đạt được, không tính); bố mẹ ngồi cùng chấm thẻ → hết nhắc', () => {
    const { st, day } = clock();
    st.setStudyMode('self');
    st.startSession('w34-l2');
    st.deferReview({ kind: 'check', group: 'look:relax:shoulder', label: 'Vai thả lỏng (xem tay)', visual: true, notes: [{ note: 'relax:shoulder', ts: 1 }] });
    st.deferReview({ kind: 'check', group: 'look:relax:shoulder', label: 'Vai thả lỏng (xem tay)', visual: true, notes: [{ note: 'relax:shoulder', ts: 2 }] });
    expect(reminders(st.get())).toHaveLength(1);
    expect(reminders(st.get())[0].notes).toHaveLength(1); // nhắc một lần mỗi thẻ
    expect(pendingCount(st.get())).toBe(0);
    expect(st.approveReview(reminders(st.get())[0].id)).toBe(false);
    expect(st.approveAllReviews()).toBe(0);
    // Hôm sau có bố mẹ → chấm thẻ → lời nhắc tự xong
    day(1);
    const s = st.startSession('w34-l2');
    st.addParentAssessment(s.id, 'relax:shoulder', 'correct');
    expect(reminders(st.get())).toHaveLength(0);
  });
  it('bé tự học chấm thẻ (store ở chế độ tự học) → lời nhắc giữ nguyên', () => {
    const d = defaultData();
    addReview(d, { kind: 'check', group: 'look:relax:joint', label: 'x', visual: true, notes: [{ note: 'relax:joint', ts: 1 }] }, 1);
    expect(resolveReminders(d, 'relax:wrist')).toEqual([]);
    expect(reminders(d)).toHaveLength(1);
  });
});

describe('hết hạn & gộp lịch sử', () => {
  it(`mục quá ${REVIEW_EXPIRE_DAYS} ngày tự bỏ`, () => {
    const d = defaultData();
    const day = 86_400_000;
    addReview(d, { kind: 'challenge', group: 'c1', label: 'x', challenge: 'c', ts: 0 }, 0);
    addReview(d, { kind: 'challenge', group: 'c2', label: 'y', challenge: 'c', ts: 10 * day }, 10 * day);
    expect(expireReviews(d, 15 * day)).toHaveLength(1);
    expect(d.reviews).toHaveLength(1);
    expect(expireReviews(d, 30 * day)).toHaveLength(1);
    expect(d.reviews).toBeUndefined();
  });
  it('mở app (store mới) bỏ mục quá hạn', () => {
    const kv = new MemoryStorage();
    let d = 1;
    const st = new ProgressStore(kv, () => new Date(2026, 9, d, 17), { autoCompact: false });
    selfRun(st);
    st.flush();
    d = 20;
    const st2 = new ProgressStore(kv, () => new Date(2026, 9, d, 17), { autoCompact: false });
    expect(st2.reviews()).toHaveLength(0);
    expect(st2.takeDroppedReviews()).toHaveLength(1);
  });
  it('gộp lịch sử KHÔNG gộp buổi còn mục chờ; duyệt xong thì gộp được, tiêu chí giữ nguyên', () => {
    const { st, day } = clock();
    day(0);
    selfRun(st);
    day(1);
    selfRun(st);
    const data = st.get() as ReturnType<ProgressStore['get']> & object;
    const d = JSON.parse(JSON.stringify(data));
    d.progress.currentWeek = 6;
    const far = new Date(2026, 11, 30);
    expect(pinnedSessionIds(d).size).toBe(2);
    expect(compactData(d, far).folded).toBe(0);
    expect(d.sessions).toHaveLength(2);
    // Bố mẹ duyệt (muộn — buổi vẫn còn để ghi đúng ngày) → gộp được
    approveAll(d);
    expect(weekPassed(5, d)).toBe(true);
    expect(compactData(d, far).folded).toBe(2);
    expect(d.sessions).toHaveLength(0);
    expect(weekPassed(5, d)).toBe(true);
  });
  it('buổi chỉ có mục chờ không bị xoá khi "Quay lại" (discardSessionIfEmpty)', () => {
    const { st } = clock();
    selfRun(st);
    const sid = st.activeSessionId!;
    st.discardSessionIfEmpty(sid);
    expect(st.get().sessions.some((s) => s.id === sid)).toBe(true);
  });
});

describe('dữ liệu: kiểm tra, sao lưu / nhập', () => {
  it('xuất / nhập JSON giữ hàng chờ (thông tin, không âm thanh); mục hỏng bị bỏ', () => {
    const { st } = clock();
    selfRun(st);
    const json = JSON.parse(st.exportJSON());
    json.reviews.push({ id: 'bad', kind: 'song', label: 'x' });
    const st2 = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 2, 17), { autoCompact: false });
    expect(st2.importJSON(JSON.stringify(json))).toEqual({ ok: true });
    expect(st2.reviews()).toHaveLength(1);
    expect(st2.approveAllReviews()).toBe(1);
    expect(st2.get().sessions[0].songRuns).toHaveLength(1);
  });
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
  it('dismissReview / approveReview với mã không có', () => {
    const d = defaultData();
    expect(dismissReview(d, 'nope')).toBeNull();
    expect(approveReview(d, 'nope')).toBeNull();
  });
});

describe('bản ghi âm chờ bố mẹ nghe (reviewAudio)', () => {
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
