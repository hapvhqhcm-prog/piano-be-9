import { describe, expect, it } from 'vitest';
import { MemoryStorage, ProgressStore, STORAGE_KEY } from '../src/progress/ProgressStore';
import { defaultData, validateAppData } from '../src/progress/schema';
import { migrate } from '../src/progress/migrations';

const fixedNow = () => new Date(2026, 9, 4, 17, 0, 0);

describe('schema v1 (§7)', () => {
  it('dữ liệu mặc định hợp lệ, schemaVersion = 1, cài đặt mặc định đúng spec', () => {
    const d = defaultData(fixedNow());
    expect(validateAppData(d)).toEqual([]);
    expect(d.schemaVersion).toBe(1);
    expect(d.learner.createdAt).toBe('2026-10-04');
    expect(d.settings).toEqual({
      sessionMinutes: 15,
      autoAdvance: false,
      autoAdvanceDelaySec: 4,
      leftHandEnabled: false,
      dailyLimit: 'none',
      micEnabled: false, // micro mặc định TẮT
      micTuningCents: 0,
      micAutoNext: true,
      micSensitivity: 'normal',
      accompaniment: true,
      timing: 'easy',
      lastBackupAt: 0,
    });
  });

  it('migrate từ chối dữ liệu thiếu schemaVersion hoặc phiên bản mới hơn', () => {
    expect(() => migrate({})).toThrow();
    expect(() => migrate({ ...defaultData(), schemaVersion: 99 })).toThrow();
  });

  it('migrate điền trường thiếu', () => {
    const raw = { schemaVersion: 1, sessions: [{ id: 'a', date: '2026-10-04', lessonId: 'w1-l1' }] };
    const d = migrate(raw);
    expect(d.settings.autoAdvance).toBe(false);
    expect(d.sessions[0].parentAssessments).toEqual([]);
    expect(validateAppData(d)).toEqual([]);
  });
});

describe('ProgressStore', () => {
  it('tiến độ còn sau "reload" (tạo store mới cùng storage)', () => {
    const kv = new MemoryStorage();
    const a = new ProgressStore(kv, fixedNow);
    const s = a.startSession('w1-l1');
    a.addParentAssessment(s.id, 'C4', 'correct');
    a.markLessonCompleted('w1-l1');
    const b = new ProgressStore(kv, fixedNow);
    expect(b.get().sessions).toHaveLength(1);
    expect(b.get().sessions[0].parentAssessments[0]).toMatchObject({ note: 'C4', result: 'correct' });
    expect(b.get().progress.lessonsCompleted).toEqual(['w1-l1']);
    expect(JSON.parse(kv.getItem(STORAGE_KEY)!).schemaVersion).toBe(1);
  });

  it('PARENT và APP lưu ở hai trường riêng (§2)', () => {
    const st = new ProgressStore(new MemoryStorage(), fixedNow);
    const s = st.startSession('w2-l1');
    st.addParentAssessment(s.id, 'D4', 'retry');
    st.addAppAssessment(s.id, 'C4', 'D4');
    const saved = st.get().sessions[0];
    expect(saved.parentAssessments).toEqual([{ note: 'D4', result: 'retry', ts: expect.any(Number) }]);
    expect(saved.appAssessments).toEqual([
      { expected: 'C4', actual: 'D4', correct: false, ts: expect.any(Number) },
    ]);
    expect('kind' in saved.parentAssessments[0]).toBe(false);
  });

  it('sửa được kết quả PARENT vừa bấm', () => {
    const st = new ProgressStore(new MemoryStorage(), fixedNow);
    const s = st.startSession('w1-l1');
    st.addParentAssessment(s.id, 'C4', 'correct');
    st.amendLastParentAssessment(s.id, 'retry');
    expect(st.get().sessions[0].parentAssessments[0].result).toBe('retry');
    st.setParentAssessment(s.id, 0, 'correct');
    expect(st.get().sessions[0].parentAssessments[0].result).toBe('correct');
  });

  it('sao theo ngày suy ra từ tự đánh giá', () => {
    const st = new ProgressStore(new MemoryStorage(), fixedNow);
    const s = st.startSession('w1-l1');
    st.setSelfRating(s.id, 'all');
    st.finishSession(s.id);
    expect(st.get().progress.practiceDays['2026-10-04']).toEqual({ minutes: 1, stars: 3 });
  });

  it('xuất → nhập lại cho cùng dữ liệu; nhập rác bị từ chối và không mất dữ liệu', () => {
    const st = new ProgressStore(new MemoryStorage(), fixedNow);
    st.startSession('w1-l1');
    const json = st.exportJSON();
    const other = new ProgressStore(new MemoryStorage(), fixedNow);
    expect(other.importJSON(json)).toEqual({ ok: true });
    expect(other.get()).toEqual(st.get());
    expect(other.importJSON('not json').ok).toBe(false);
    expect(other.importJSON('{"schemaVersion":1,"settings":{"sessionMinutes":99}}').ok).toBe(false);
    expect(other.get().sessions).toHaveLength(1);
  });

  it('buổi mở rồi thoát ngay (rỗng) bị bỏ; buổi có kết quả thì giữ', () => {
    const st = new ProgressStore(new MemoryStorage(), fixedNow);
    const a = st.startSession('w1-l1');
    st.addParentAssessment(a.id, 'C4', 'correct');
    const empty = st.startSession('w1-l2');
    expect(st.latestSession()?.id).toBe(a.id);
    st.discardSessionIfEmpty(empty.id);
    st.discardSessionIfEmpty(a.id);
    expect(st.get().sessions.map((s) => s.id)).toEqual([a.id]);
  });

  it('đặt lại toàn bộ dữ liệu', () => {
    const st = new ProgressStore(new MemoryStorage(), fixedNow);
    st.startSession('w1-l1');
    st.resetAll();
    expect(st.get()).toEqual(defaultData(fixedNow()));
  });

  it('dữ liệu hỏng được sao lưu sang khóa khác, app vẫn khởi động', () => {
    const kv = new MemoryStorage();
    kv.setItem(STORAGE_KEY, '{hỏng');
    const st = new ProgressStore(kv, fixedNow);
    expect(st.recoveredFromCorrupt).toBe(true);
    expect(st.get().sessions).toEqual([]);
    expect(kv.getItem(`${STORAGE_KEY}:corrupt-${fixedNow().getTime()}`)).toBe('{hỏng');
  });
});

describe('LỖI ĐÃ SỬA: lên tuần 9+ không được làm mất dữ liệu', () => {
  it('lưu ở tuần 9 và tuần 24 → mở lại vẫn còn nguyên', () => {
    for (const week of [9, 16, 24]) {
      const kv = new MemoryStorage();
      const a = new ProgressStore(kv, fixedNow);
      a.setCurrentWeek(week);
      a.finishSession(a.startSession(`w${week}-l1`).id);
      const b = new ProgressStore(kv, fixedNow);
      expect(b.recoveredFromCorrupt).toBe(false);
      expect(b.get().progress.currentWeek).toBe(week);
      expect(b.get().sessions).toHaveLength(1);
    }
  });

  it('tự khôi phục từ bản "corrupt-*" do lỗi cũ (dữ liệu tuần 9 từng bị đặt lại)', () => {
    const kv = new MemoryStorage();
    const old = new ProgressStore(kv, fixedNow);
    old.setCurrentWeek(9);
    old.finishSession(old.startSession('w9-l1').id);
    const saved = kv.getItem(STORAGE_KEY)!;
    // Giả lập lỗi cũ: bản thật bị cất sang corrupt-*, bản chính là dữ liệu mới tinh
    kv.setItem(`${STORAGE_KEY}:corrupt-123`, saved);
    kv.setItem(STORAGE_KEY, JSON.stringify(defaultData(fixedNow())));
    const st = new ProgressStore(kv, fixedNow);
    expect(st.recoveredFromBackup).toBe(true);
    expect(st.get().progress.currentWeek).toBe(9);
    expect(st.get().sessions).toHaveLength(1);
    expect(kv.getItem(`${STORAGE_KEY}:corrupt-123`)).toBeNull();
  });

  it('nhập JSON sao lưu ở tuần 20 được chấp nhận', () => {
    const a = new ProgressStore(new MemoryStorage(), fixedNow);
    a.setCurrentWeek(20);
    const b = new ProgressStore(new MemoryStorage(), fixedNow);
    expect(b.importJSON(a.exportJSON())).toEqual({ ok: true });
    expect(b.get().progress.currentWeek).toBe(20);
  });
});
