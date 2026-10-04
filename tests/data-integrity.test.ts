import { describe, expect, it } from 'vitest';
import { MemoryStorage, ProgressStore, STORAGE_KEY } from '../src/progress/ProgressStore';
import { defaultData, validateAppData } from '../src/progress/schema';

const fixedNow = () => new Date(2026, 9, 4, 17, 0, 0);

/** Tạo dữ liệu có n buổi đã xong ở tuần `week`, trả về chuỗi JSON. */
function savedWith(week: number, n: number): string {
  const kv = new MemoryStorage();
  const st = new ProgressStore(kv, fixedNow);
  st.setCurrentWeek(week);
  for (let i = 0; i < n; i++) st.finishSession(st.startSession(`w${week}-l1`).id);
  return kv.getItem(STORAGE_KEY)!;
}

const keysOf = (kv: MemoryStorage) => Array.from({ length: kv.length }, (_, i) => kv.key(i)!);

describe('bản sao lưu "corrupt-*" không được đè lên dữ liệu thật', () => {
  it('khôi phục lỗi tuần 9 vẫn chạy, và chỉ một lần (bản đã dùng được cất sang archived-*)', () => {
    const kv = new MemoryStorage();
    kv.setItem(`${STORAGE_KEY}:corrupt-123`, savedWith(9, 2));
    kv.setItem(STORAGE_KEY, JSON.stringify(defaultData(fixedNow())));
    const st = new ProgressStore(kv, fixedNow);
    expect(st.recoveredFromBackup).toBe(true);
    expect(st.get().progress.currentWeek).toBe(9);
    expect(st.get().sessions).toHaveLength(2);
    expect(kv.getItem(`${STORAGE_KEY}:corrupt-123`)).toBeNull();
    expect(kv.getItem(`${STORAGE_KEY}:archived-123`)).not.toBeNull();
    // Mở lại: không "khôi phục" lần nữa
    expect(new ProgressStore(kv, fixedNow).recoveredFromBackup).toBe(false);
  });

  it('khôi phục được cả khi dữ liệu chính đang hỏng (bản hỏng vẫn được cất lại)', () => {
    const kv = new MemoryStorage();
    kv.setItem(`${STORAGE_KEY}:corrupt-123`, savedWith(9, 1));
    kv.setItem(STORAGE_KEY, '{hỏng');
    const st = new ProgressStore(kv, fixedNow);
    expect(st.recoveredFromBackup).toBe(true);
    expect(st.get().sessions).toHaveLength(1);
    expect(kv.getItem(`${STORAGE_KEY}:corrupt-${fixedNow().getTime()}`)).toBe('{hỏng');
  });

  it('bản cũ không được dùng (dữ liệu chính nhiều hơn) bị cất đi, không đè lên lần đặt lại sau', () => {
    const kv = new MemoryStorage();
    kv.setItem(`${STORAGE_KEY}:corrupt-123`, savedWith(9, 1));
    kv.setItem(STORAGE_KEY, savedWith(10, 3));
    const a = new ProgressStore(kv, fixedNow);
    expect(a.recoveredFromBackup).toBe(false);
    expect(a.get().sessions).toHaveLength(3);
    expect(keysOf(kv).some((k) => k.startsWith(`${STORAGE_KEY}:corrupt-`))).toBe(false);
    a.resetAll();
    const b = new ProgressStore(kv, fixedNow);
    expect(b.recoveredFromBackup).toBe(false);
    expect(b.get()).toEqual(defaultData(fixedNow()));
  });

  it('đặt lại toàn bộ → lần mở sau KHÔNG tự khôi phục bản corrupt-* cũ', () => {
    const kv = new MemoryStorage();
    const a = new ProgressStore(kv, fixedNow);
    // bản corrupt-* xuất hiện sau khi store đã mở (vd từ tab khác / bản cũ của app)
    kv.setItem(`${STORAGE_KEY}:corrupt-123`, savedWith(9, 2));
    a.resetAll();
    expect(kv.getItem(`${STORAGE_KEY}:corrupt-123`)).toBeNull();
    expect(kv.getItem(`${STORAGE_KEY}:archived-123`)).not.toBeNull(); // không mất gì
    const b = new ProgressStore(kv, fixedNow);
    expect(b.recoveredFromBackup).toBe(false);
    expect(b.get().sessions).toHaveLength(0);
  });

  it('nhập JSON → lần mở sau KHÔNG bị bản corrupt-* cũ đè lên', () => {
    const kv = new MemoryStorage();
    const a = new ProgressStore(kv, fixedNow);
    kv.setItem(`${STORAGE_KEY}:corrupt-123`, savedWith(9, 3));
    expect(a.importJSON(savedWith(12, 1))).toEqual({ ok: true });
    const b = new ProgressStore(kv, fixedNow);
    expect(b.recoveredFromBackup).toBe(false);
    expect(b.get().progress.currentWeek).toBe(12);
    expect(b.get().sessions).toHaveLength(1);
  });
});

describe('nhập JSON sai cấu trúc bị từ chối', () => {
  const base = () => JSON.parse(savedWith(3, 1));
  const songRun = { songId: 'twinkle', mode: 'wait', bpm: 60, hints: 'full', total: 8, hits: 8, source: 'mic', passed: true, ts: 1 };

  it('dữ liệu hợp lệ có songRuns được chấp nhận', () => {
    const d = base();
    d.sessions[0].songRuns = [songRun];
    d.sessions[0].selfRating = 'some';
    expect(validateAppData(d)).toEqual([]);
    expect(new ProgressStore(new MemoryStorage(), fixedNow).importJSON(JSON.stringify(d))).toEqual({ ok: true });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bad: Array<[string, (d: any) => void]> = [
    ['currentWeek không nguyên', (d) => (d.progress.currentWeek = 2.5)],
    ['currentWeek là chuỗi', (d) => (d.progress.currentWeek = '3')],
    ['songRun không phải object', (d) => (d.sessions[0].songRuns = ['x'])],
    ['songRun thiếu songId', (d) => (d.sessions[0].songRuns = [{ ...songRun, songId: 5 }])],
    ['songRun mode lạ', (d) => (d.sessions[0].songRuns = [{ ...songRun, mode: 'fast' }])],
    ['songRun passed không phải boolean', (d) => (d.sessions[0].songRuns = [{ ...songRun, passed: 'yes' }])],
    ['songRun bpm không phải số', (d) => (d.sessions[0].songRuns = [{ ...songRun, bpm: null }])],
    ['selfRating lạ', (d) => (d.sessions[0].selfRating = 'great')],
  ];
  for (const [name, mutate] of bad) {
    it(name, () => {
      const st = new ProgressStore(new MemoryStorage(), fixedNow);
      st.startSession('w1-l1');
      const d = base();
      mutate(d);
      expect(validateAppData(d).length).toBeGreaterThan(0);
      expect(st.importJSON(JSON.stringify(d)).ok).toBe(false);
      expect(st.get().sessions).toHaveLength(1); // dữ liệu cũ còn nguyên
    });
  }
});
