import { describe, expect, it } from 'vitest';
import {
  ALBUM_ENABLED_KEY,
  AlbumStore,
  albumExt,
  albumFileName,
  idbAlbumBackend,
  isBetterTake,
  memoryAlbumBackend,
  type AlbumBackend,
} from '../src/progress/albumStore';

/** 🎧 Album của con: giữ 1 bản HAY NHẤT mỗi bài, giới hạn dung lượng, mọi lỗi bị nuốt (src/progress/albumStore.ts). */

const blob = (bytes: number, type = 'audio/mp4') => new Blob([new Uint8Array(bytes)], { type });
const take = (o: Partial<{ songId: string; stars: number; accuracy: number; seconds: number; bytes: number }> = {}) => ({
  songId: o.songId ?? 'twinkle',
  title: 'Sao nhỏ lấp lánh',
  blob: blob(o.bytes ?? 1000),
  seconds: o.seconds ?? 30,
  stars: o.stars ?? 2,
  accuracy: o.accuracy ?? 0.8,
});

function makeStore(opts: { maxBytes?: number } = {}) {
  let t = 1000;
  const be = memoryAlbumBackend();
  const store = new AlbumStore(be, { ...opts, now: () => (t += 1000) });
  return { be, store };
}

describe('isBetterTake', () => {
  it('nhiều sao hơn thắng; bằng sao → đúng nhiều hơn; bằng hết → bản mới', () => {
    expect(isBetterTake({ stars: 1, accuracy: 0.5 }, null)).toBe(true);
    expect(isBetterTake({ stars: 3, accuracy: 0.6 }, { stars: 2, accuracy: 1 })).toBe(true);
    expect(isBetterTake({ stars: 2, accuracy: 1 }, { stars: 3, accuracy: 0.6 })).toBe(false);
    expect(isBetterTake({ stars: 2, accuracy: 0.9 }, { stars: 2, accuracy: 0.8 })).toBe(true);
    expect(isBetterTake({ stars: 2, accuracy: 0.7 }, { stars: 2, accuracy: 0.8 })).toBe(false);
    expect(isBetterTake({ stars: 2, accuracy: 0.8 }, { stars: 2, accuracy: 0.8 })).toBe(true);
  });
});

describe('AlbumStore', () => {
  it('lưu bản đầu tiên; mỗi bài chỉ 1 bản; bản kém hơn không thay', async () => {
    const { be, store } = makeStore();
    expect(await store.consider(take({ stars: 2, accuracy: 0.8 }), true)).toEqual({ saved: true, previous: null });
    expect(await store.consider(take({ stars: 1, accuracy: 1 }), true)).toEqual({ saved: false, reason: 'not-better' });
    const r = await store.consider(take({ stars: 3, accuracy: 0.9, bytes: 2000 }), true);
    expect(r.saved).toBe(true);
    expect(r.saved && r.previous?.stars).toBe(2);
    expect(be.takes.size).toBe(1);
    const t = await store.get('twinkle');
    expect(t?.stars).toBe(3);
    expect(t?.size).toBe(2000);
    expect(t?.mime).toBe('audio/mp4');
    expect(t?.data.byteLength).toBe(2000);
  });

  it('bằng điểm → bản mới hơn thay bản cũ', async () => {
    const { store } = makeStore();
    await store.consider(take({ stars: 2, accuracy: 0.8 }), true);
    const before = (await store.list())[0].savedAt;
    expect((await store.consider(take({ stars: 2, accuracy: 0.8 }), true)).saved).toBe(true);
    expect((await store.list())[0].savedAt).toBeGreaterThan(before);
  });

  it('danh sách mới nhất trước, không kèm dữ liệu âm thanh; usage đếm đúng', async () => {
    const { store } = makeStore();
    await store.consider(take({ songId: 'a', bytes: 100 }), true);
    await store.consider(take({ songId: 'b', bytes: 300 }), true);
    const l = await store.list();
    expect(l.map((m) => m.songId)).toEqual(['b', 'a']);
    expect('data' in l[0]).toBe(false);
    expect(await store.usage()).toEqual({ count: 2, bytes: 400 });
  });

  it('tắt / quá ngắn / quá 90 s → không lưu', async () => {
    const { be, store } = makeStore();
    expect(await store.consider(take(), false)).toEqual({ saved: false, reason: 'off' });
    expect(await store.consider(take({ seconds: 1 }), true)).toEqual({ saved: false, reason: 'too-short' });
    expect(await store.consider(take({ seconds: 95 }), true)).toEqual({ saved: false, reason: 'too-long' });
    expect(be.takes.size).toBe(0);
  });

  it('giới hạn tổng dung lượng: đầy → không lưu bản mới, KHÔNG xoá bản cũ; thay bản cùng bài thì tính lại', async () => {
    const { be, store } = makeStore({ maxBytes: 1000 });
    expect((await store.consider(take({ songId: 'a', bytes: 600 }), true)).saved).toBe(true);
    expect(await store.consider(take({ songId: 'b', bytes: 500 }), true)).toEqual({ saved: false, reason: 'full' });
    expect([...be.takes.keys()]).toEqual(['a']);
    // Thay chính bài 'a' bằng bản to hơn nhưng vẫn ≤ giới hạn: dung lượng bản cũ không tính
    expect((await store.consider(take({ songId: 'a', bytes: 900, stars: 3 }), true)).saved).toBe(true);
  });

  it('hoàn tác ("Không lưu"): trả bản cũ về, hoặc xoá bản vừa lưu', async () => {
    const { be, store } = makeStore();
    const r1 = await store.consider(take({ stars: 1 }), true);
    expect(await store.undo('twinkle', r1.saved ? r1.previous : null)).toBe(true);
    expect(be.takes.size).toBe(0);
    await store.consider(take({ stars: 1 }), true);
    const r2 = await store.consider(take({ stars: 3 }), true);
    await store.undo('twinkle', r2.saved ? r2.previous : null);
    expect((await store.get('twinkle'))?.stars).toBe(1);
  });

  it('xoá một bài / xoá Album', async () => {
    const { be, store } = makeStore();
    await store.consider(take({ songId: 'a' }), true);
    await store.consider(take({ songId: 'b' }), true);
    expect(await store.remove('a')).toBe(true);
    expect([...be.takes.keys()]).toEqual(['b']);
    expect(await store.clear()).toBe(true);
    expect(be.takes.size).toBe(0);
  });

  it('backend lỗi → không ném, trả kết quả an toàn và ghi lastError', async () => {
    const boom = () => Promise.reject(new Error('QuotaExceededError'));
    const bad: AlbumBackend = { list: boom, get: boom, put: boom, remove: boom, clear: boom };
    const store = new AlbumStore(bad);
    expect(await store.consider(take(), true)).toEqual({ saved: false, reason: 'error' });
    expect(store.lastError).toBe('QuotaExceededError');
    expect(await store.list()).toEqual([]);
    expect(await store.get('x')).toBeNull();
    expect(await store.usage()).toEqual({ count: 0, bytes: 0 });
    expect(await store.undo('x', null)).toBe(false);
    expect(await store.clear()).toBe(false);
    // Ghi lỗi giữa chừng (list được, put lỗi)
    const half: AlbumBackend = { ...memoryAlbumBackend(), put: boom };
    expect(await new AlbumStore(half).consider(take(), true)).toEqual({ saved: false, reason: 'error' });
  });

  it('trình duyệt không có IndexedDB → không có Album', () => {
    expect(idbAlbumBackend(undefined)).toBeNull();
    expect(idbAlbumBackend({} as IDBFactory)).toBeNull();
  });

  it('công tắc Album dùng khóa localStorage riêng', () => {
    expect(ALBUM_ENABLED_KEY).toBe('piano-be-9-album-on');
  });
});

describe('tên tệp gửi ông bà', () => {
  it('đuôi theo định dạng (iPad: m4a) và bỏ ký tự cấm', () => {
    expect(albumExt('audio/mp4')).toBe('m4a');
    expect(albumExt('audio/webm;codecs=opus')).toBe('webm');
    const n = albumFileName({ title: 'Bài: "Mẹ/yêu"', savedAt: new Date(2026, 9, 8).getTime(), mime: 'audio/mp4' });
    expect(n).toBe('Bài Mẹ yêu - 08-10-2026.m4a');
  });
});
