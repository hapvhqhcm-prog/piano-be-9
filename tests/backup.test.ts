import { describe, expect, it, vi } from 'vitest';
import { MAX_ARCHIVES, MemoryStorage, ProgressStore, STORAGE_KEY } from '../src/progress/ProgressStore';
import { exportBackup, requestPersistentStorage, type BackupEnv } from '../src/progress/backup';

function storeWithData(kv = new MemoryStorage(), t = 1_000_000) {
  let now = t;
  const store = new ProgressStore(kv, () => new Date(now));
  const s = store.startSession('w1-l1');
  store.setSelfRating(s.id, 'all');
  return { store, kv, tick: (ms: number) => (now += ms) };
}

/** document giả: thẻ <a> có thuộc tính download, ghi nhận click. */
function fakeDoc() {
  const clicks: string[] = [];
  const doc = {
    body: { append: vi.fn() },
    createElement: () => {
      const a = { href: '', download: '', click: () => clicks.push(a.download), remove: vi.fn() };
      return a;
    },
  };
  return { doc: doc as unknown as BackupEnv['document'], clicks };
}

const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';

describe('exportBackup: chỉ ghi "đã sao lưu" khi thật sự thành công', () => {
  it('có bảng Chia sẻ với file → shared, file JSON đúng nội dung', async () => {
    const { store } = storeWithData();
    let shared: File | undefined;
    const r = await exportBackup(store, {
      navigator: { canShare: () => true, share: async (d) => void (shared = d.files?.[0]) },
      now: () => 42,
    });
    expect(r).toBe('shared');
    expect(store.settings.lastBackupAt).toBe(42);
    expect(shared?.name).toMatch(/^piano-be-9-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(await shared!.text()).sessions.length).toBe(1);
  });

  it('bố/mẹ đóng bảng Chia sẻ → failed, KHÔNG ghi lastBackupAt, không tải/chép thay', async () => {
    const { store } = storeWithData();
    const writeText = vi.fn(async () => {});
    const { doc, clicks } = fakeDoc();
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    const r = await exportBackup(store, {
      navigator: { canShare: () => true, share: async () => Promise.reject(abort), clipboard: { writeText } },
      document: doc,
      createObjectURL: () => 'blob:x',
    });
    expect(r).toBe('failed');
    expect(store.settings.lastBackupAt).toBe(0);
    expect(writeText).not.toHaveBeenCalled();
    expect(clicks).toEqual([]);
  });

  it('không chia sẻ được file → tải file (Safari tab / máy tính)', async () => {
    const { store } = storeWithData();
    const { doc, clicks } = fakeDoc();
    const r = await exportBackup(store, {
      navigator: { canShare: () => false, share: async () => {} },
      document: doc,
      standalone: false,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
      now: () => 7,
    });
    expect(r).toBe('downloaded');
    expect(clicks.length).toBe(1);
    expect(store.settings.lastBackupAt).toBe(7);
  });

  it('app trên Màn hình chính của iPad: KHÔNG dùng thẻ tải (hỏng lặng lẽ) → sao chép', async () => {
    const { store } = storeWithData();
    const { doc, clicks } = fakeDoc();
    const writeText = vi.fn(async () => {});
    const json = store.exportJSON();
    const r = await exportBackup(store, {
      navigator: { userAgent: IPAD_UA, maxTouchPoints: 5, clipboard: { writeText } },
      document: doc,
      standalone: true,
      createObjectURL: () => 'blob:x',
    });
    expect(r).toBe('copied');
    expect(clicks).toEqual([]);
    expect(writeText).toHaveBeenCalledWith(json);
  });

  it('không cách nào được → failed, lastBackupAt giữ nguyên', async () => {
    const { store } = storeWithData();
    const r = await exportBackup(store, {
      navigator: { userAgent: IPAD_UA, maxTouchPoints: 5, clipboard: { writeText: async () => Promise.reject(new Error('no')) } },
      standalone: true,
    });
    expect(r).toBe('failed');
    expect(store.settings.lastBackupAt).toBe(0);
  });
});

describe('nhập JSON / đặt lại: cất dữ liệu hiện tại sang archived-* trước khi ghi đè', () => {
  it('resetAll cất bản cũ; nội dung cất = dữ liệu trước khi xóa', () => {
    const { store, kv } = storeWithData();
    const before = store.exportJSON();
    store.resetAll();
    expect(store.get().sessions.length).toBe(0);
    const keys = store.archivedKeys();
    expect(keys.length).toBe(1);
    expect(JSON.parse(kv.getItem(keys[0])!)).toEqual(JSON.parse(before));
  });

  it('importJSON cất bản cũ; nhập lỗi thì KHÔNG cất (dữ liệu không đổi)', () => {
    const { store } = storeWithData();
    const other = new ProgressStore(new MemoryStorage()).exportJSON();
    expect(store.importJSON('không phải json').ok).toBe(false);
    expect(store.archivedKeys().length).toBe(0);
    expect(store.importJSON(other).ok).toBe(true);
    expect(store.archivedKeys().length).toBe(1);
  });

  it('dữ liệu trống thì không cất; giữ tối đa MAX_ARCHIVES bản mới nhất', () => {
    const { store, kv, tick } = storeWithData();
    // bản cất cũ từ "corrupt-*" có sẵn
    kv.setItem(`${STORAGE_KEY}:archived-5`, store.exportJSON());
    const empty = new ProgressStore(new MemoryStorage()).exportJSON();
    const full = store.exportJSON();
    for (let i = 0; i < 5; i++) {
      tick(1000);
      store.importJSON(i % 2 ? empty : full);
    }
    const keys = store.archivedKeys();
    expect(keys.length).toBe(MAX_ARCHIVES);
    expect(keys).not.toContain(`${STORAGE_KEY}:archived-5`);
    // mới nhất là bản trước lần nhập cuối (dữ liệu "full" — lần nhập thứ 4 là full)
    expect(JSON.parse(kv.getItem(keys[0])!).sessions.length).toBe(1);
    // đặt lại khi đang trống → không thêm bản cất
    store.importJSON(empty);
    const n = store.archivedKeys().length;
    store.resetAll();
    expect(store.archivedKeys().length).toBe(n);
  });
});

describe('requestPersistentStorage', () => {
  it('đã bền → true, không hỏi lại; chưa → gọi persist(); không hỗ trợ → false', async () => {
    const persist = vi.fn(async () => true);
    expect(await requestPersistentStorage({ persisted: async () => true, persist })).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(await requestPersistentStorage({ persisted: async () => false, persist })).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(await requestPersistentStorage(undefined)).toBe(false);
    expect(await requestPersistentStorage({ persisted: async () => false, persist: async () => Promise.reject(new Error('x')) })).toBe(false);
  });
});
