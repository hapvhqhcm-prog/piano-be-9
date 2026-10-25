import { describe, expect, it } from 'vitest';
import {
  REC_DEFAULT_PREFIX,
  REC_EMOJIS,
  REC_NAME_MAX,
  RecordingsStore,
  cleanName,
  clearGuestRecordings,
  guestRecordings,
  idbRecBackend,
  memoryRecBackend,
  nextDefaultName,
  oldestToFree,
  recExt,
  recFileName,
  recordingsFor,
  type RecMeta,
} from '../src/progress/recordingsStore';

/** 📼 Bản ghi của con (🎙️ Máy ghi âm) — src/progress/recordingsStore.ts: tên, giới hạn số bản / dung lượng, xoá, khách. */

const blob = (bytes: number, type = 'audio/mp4') => new Blob([new Uint8Array(bytes)], { type });
function makeStore(opts: { maxCount?: number; maxBytes?: number } = {}) {
  let t = 1000;
  const be = memoryRecBackend();
  return { be, store: new RecordingsStore(be, { ...opts, now: () => (t += 1000) }) };
}
const meta = (id: string, savedAt: number, size: number): RecMeta => ({ id, name: id, emoji: '🎹', savedAt, seconds: 5, mime: 'audio/mp4', size });

describe('đặt tên', () => {
  it('tên mặc định "Bản ghi N" = số lớn nhất + 1 (bỏ qua tên bé tự đặt)', () => {
    expect(nextDefaultName([])).toBe(`${REC_DEFAULT_PREFIX} 1`);
    expect(nextDefaultName([{ name: 'Bản ghi 1' }, { name: 'Bài của Bin' }, { name: 'Bản ghi 4' }])).toBe('Bản ghi 5');
    expect(nextDefaultName([{ name: 'Bài của Bin' }])).toBe('Bản ghi 1');
  });
  it('làm sạch tên: bỏ xuống dòng / khoảng thừa, cắt độ dài; rỗng → mặc định', () => {
    expect(cleanName('  Bài\n của   Bin ', 'X')).toBe('Bài của Bin');
    expect(cleanName('   ', 'Bản ghi 2')).toBe('Bản ghi 2');
    expect(cleanName(undefined, 'Bản ghi 2')).toBe('Bản ghi 2');
    expect([...cleanName('🎹'.repeat(60), 'X')]).toHaveLength(REC_NAME_MAX);
  });
  it('tên tệp chia sẻ + đuôi theo định dạng', () => {
    const at = new Date(2026, 9, 25, 10).getTime();
    expect(recFileName({ name: 'Bài: "Sao/nhỏ"', savedAt: at, mime: 'audio/mp4' })).toBe('Bài Sao nhỏ - 25-10-2026.m4a');
    expect(recExt('audio/webm;codecs=opus')).toBe('webm');
    expect(recExt('')).toBe('m4a');
  });
});

describe('oldestToFree', () => {
  it('còn chỗ → []; quá số bản / dung lượng → các bản CŨ NHẤT; lớn hơn cả kho → null', () => {
    const l = [meta('b', 2, 30), meta('a', 1, 30), meta('c', 3, 30)];
    expect(oldestToFree(l, 10, 5, 100)).toEqual([]);
    expect(oldestToFree(l, 10, 3, 1000)!.map((m) => m.id)).toEqual(['a']);
    expect(oldestToFree(l, 50, 10, 100)!.map((m) => m.id)).toEqual(['a', 'b']);
    expect(oldestToFree(l, 101, 10, 100)).toBeNull();
  });
});

describe('RecordingsStore', () => {
  it('lưu: tên mặc định nối tiếp, emoji, danh sách MỚI NHẤT trước, đọc lại đúng dữ liệu', async () => {
    const { store } = makeStore();
    const a = await store.save({ blob: blob(100), seconds: 3.24 });
    expect(a.saved && a.meta.name).toBe('Bản ghi 1');
    expect(a.saved && a.meta.emoji).toBe(REC_EMOJIS[0]);
    expect(a.saved && a.meta.seconds).toBe(3.2);
    const b = await store.save({ blob: blob(200), seconds: 5, name: 'Bài của Bin', emoji: '🚀' });
    expect(b.saved && b.meta.name).toBe('Bài của Bin');
    expect(await store.defaultName()).toBe('Bản ghi 2');
    const l = await store.list();
    expect(l.map((m) => m.name)).toEqual(['Bài của Bin', 'Bản ghi 1']);
    const t = await store.get(l[0].id);
    expect(t?.data.byteLength).toBe(200);
    expect(t?.mime).toBe('audio/mp4');
    expect(t?.emoji).toBe('🚀');
    expect(await store.usage()).toEqual({ count: 2, bytes: 300 });
  });

  it('quá ngắn / rỗng → không lưu', async () => {
    const { store, be } = makeStore();
    expect(await store.save({ blob: blob(100), seconds: 0.4 })).toEqual({ saved: false, reason: 'too-short' });
    expect(await store.save({ blob: blob(0), seconds: 5 })).toEqual({ saved: false, reason: 'empty' });
    expect(be.takes.size).toBe(0);
  });

  it('đầy (số bản) → KHÔNG tự xoá, trả bản cũ nhất; saveFreeing xoá đúng bản đó rồi lưu', async () => {
    const { store, be } = makeStore({ maxCount: 3 });
    for (let i = 0; i < 3; i++) await store.save({ blob: blob(10), seconds: 2 });
    const v = await store.save({ blob: blob(10), seconds: 2, name: 'Mới' });
    expect(v.saved).toBe(false);
    if (v.saved || v.reason !== 'full') throw new Error('phải đầy');
    expect(v.oldest.map((m) => m.name)).toEqual(['Bản ghi 1']);
    expect(be.takes.size).toBe(3);
    const w = await store.saveFreeing({ blob: blob(10), seconds: 2, name: 'Mới' }, v.oldest.map((m) => m.id));
    expect(w.saved).toBe(true);
    expect((await store.list()).map((m) => m.name)).toEqual(['Mới', 'Bản ghi 3', 'Bản ghi 2']);
  });

  it('đầy (dung lượng) → nhiều bản cũ nhất; bản lớn hơn cả kho → oldest rỗng', async () => {
    const { store } = makeStore({ maxBytes: 100 });
    await store.save({ blob: blob(40), seconds: 2 });
    await store.save({ blob: blob(40), seconds: 2 });
    const v = await store.save({ blob: blob(70), seconds: 2 });
    expect(!v.saved && v.reason === 'full' && v.oldest.length).toBe(2);
    const big = await store.save({ blob: blob(101), seconds: 2 });
    expect(big).toEqual({ saved: false, reason: 'full', oldest: [] });
  });

  it('đổi tên / xoá / xoá hết', async () => {
    const { store } = makeStore();
    const a = await store.save({ blob: blob(10), seconds: 2 });
    if (!a.saved) throw new Error('phải lưu được');
    expect(await store.rename(a.meta.id, '  Bài vui ', '🐸')).toBe(true);
    expect((await store.list())[0]).toMatchObject({ name: 'Bài vui', emoji: '🐸' });
    expect(await store.rename('khong-co', 'x')).toBe(false);
    expect(await store.remove(a.meta.id)).toBe(true);
    expect(await store.list()).toEqual([]);
    await store.save({ blob: blob(10), seconds: 2 });
    expect(await store.clear()).toBe(true);
    expect(await store.usage()).toEqual({ count: 0, bytes: 0 });
  });

  it('lỗi backend bị nuốt → kết quả "không lưu" + lastError', async () => {
    const be = memoryRecBackend();
    be.put = async () => {
      throw new Error('QuotaExceeded');
    };
    const store = new RecordingsStore(be);
    expect(await store.save({ blob: blob(10), seconds: 2 })).toEqual({ saved: false, reason: 'error' });
    expect(store.lastError).toBe('QuotaExceeded');
  });
});

describe('👤 khách chơi', () => {
  it('khách → kho TẠM trong bộ nhớ, tách khỏi kho của bé; thoát khách thì mất', async () => {
    clearGuestRecordings();
    const g = recordingsFor(true);
    expect(g).toBe(guestRecordings());
    expect(g.temporary).toBe(true);
    expect(recordingsFor(false)).not.toBe(g);
    await g.save({ blob: blob(10), seconds: 2 });
    expect((await guestRecordings().list()).length).toBe(1);
    clearGuestRecordings();
    expect(await guestRecordings().list()).toEqual([]);
  });

  it('không có IndexedDB → kho của bé là kho tạm (vẫn ghi / nghe được trong phiên)', () => {
    expect(idbRecBackend(undefined)).toBeNull();
    expect(recordingsFor(false).temporary).toBe(typeof indexedDB === 'undefined');
  });
});
