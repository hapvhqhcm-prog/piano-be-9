import { describe, expect, it } from 'vitest';
import { AlbumStore, memoryAlbumBackend, type AlbumBackend } from '../src/progress/albumStore';
import { compareWords, shortDay } from '../src/ui/components/progressCompare';

/**
 * (+ 2026-10-16, OWNER duyệt) "Nghe lại tiến bộ của con": Album giữ thêm BẢN ĐẦU TIÊN của mỗi bài (ô 'first'), không bao giờ
 * thay; không lưu hai lần (bản đầu còn là bản hay nhất thì chỉ một bản); dung lượng tính chung; "Xóa Album" xóa hết.
 */

const blob = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'audio/mp4' });
const take = (o: Partial<{ songId: string; stars: number; accuracy: number; bytes: number }> = {}) => ({
  songId: o.songId ?? 'rhody',
  title: 'Đi báo cô Rhody',
  blob: blob(o.bytes ?? 1000),
  seconds: 20,
  stars: o.stars ?? 1,
  accuracy: o.accuracy ?? 0.5,
});

function makeStore(opts: { maxBytes?: number } = {}) {
  let t = 1000;
  const be = memoryAlbumBackend();
  const store = new AlbumStore(be, { ...opts, now: () => (t += 1000) });
  return { be, store };
}

describe('Album — bản đầu tiên của mỗi bài', () => {
  it('lượt cả bài đầu tiên (kém cũng được) là bản hay nhất kiêm bản đầu: một bản, cờ firstTake', async () => {
    const { be, store } = makeStore();
    expect((await store.consider(take({ stars: 0, accuracy: 0.3 }), true)).saved).toBe(true);
    expect(be.takes.get('rhody')?.firstTake).toBe(true);
    expect(be.firsts.size).toBe(0);
    const f = await store.firstOf('rhody');
    expect(f?.slot).toBe('best');
    expect(f?.meta.accuracy).toBe(0.3);
    expect(await store.pairs()).toEqual([]); // chưa có gì để so
  });

  it('bản hay nhất bị thay lần đầu → bản cũ CHUYỂN sang ô first; các lần thay sau không đụng tới bản đầu', async () => {
    const { be, store } = makeStore();
    await store.consider(take({ stars: 0, accuracy: 0.3, bytes: 100 }), true);
    const firstAt = be.takes.get('rhody')!.savedAt;
    await store.consider(take({ stars: 2, accuracy: 0.8, bytes: 200 }), true);
    expect(be.firsts.get('rhody')?.savedAt).toBe(firstAt);
    expect(be.firsts.get('rhody')?.firstTake).toBe(true);
    expect(be.takes.get('rhody')?.stars).toBe(2);
    expect(be.takes.get('rhody')?.firstTake).toBeUndefined();
    await store.consider(take({ stars: 3, accuracy: 1, bytes: 300 }), true);
    expect(be.firsts.get('rhody')?.savedAt).toBe(firstAt);
    expect(be.firsts.get('rhody')?.size).toBe(100);
    expect(be.takes.get('rhody')?.stars).toBe(3);
    // bản kém hơn: không lưu gì, bản đầu vẫn vậy
    expect((await store.consider(take({ stars: 0 }), true)).saved).toBe(false);
    const pairs = await store.pairs();
    expect(pairs).toHaveLength(1);
    expect(pairs[0].first.savedAt).toBe(firstAt);
    expect(pairs[0].best.stars).toBe(3);
    expect('data' in pairs[0].first).toBe(false);
    expect((await store.firstOf('rhody'))?.slot).toBe('first');
    expect((await store.getSlot('rhody', 'first'))?.data.byteLength).toBe(100);
    expect(await store.usage()).toEqual({ count: 2, bytes: 400 });
  });

  it('Album từ trước bản cập nhật (bản hay nhất không có cờ): bản cũ vẫn được giữ làm "bản cũ nhất"', async () => {
    const { be, store } = makeStore();
    be.takes.set('old', { songId: 'old', title: 'x', savedAt: 5, stars: 2, accuracy: 0.8, seconds: 10, mime: 'audio/mp4', size: 10, data: new ArrayBuffer(10) });
    expect(await store.firstOf('old')).toBeNull(); // không chắc là lần đầu → chưa so
    await store.consider(take({ songId: 'old', stars: 3, accuracy: 0.9 }), true);
    const f = await store.firstOf('old');
    expect(f?.slot).toBe('first');
    expect(f?.meta.savedAt).toBe(5);
    expect(f?.meta.firstTake).toBeUndefined();
  });

  it('"Không lưu" (hoàn tác) ngay sau khi bản cũ vừa chuyển sang ô first → trả về như cũ', async () => {
    const { be, store } = makeStore();
    await store.consider(take({ stars: 1 }), true);
    const r = await store.consider(take({ stars: 3 }), true);
    expect(be.firsts.size).toBe(1);
    expect(await store.undo('rhody', r.saved ? r.previous : null)).toBe(true);
    expect(be.firsts.size).toBe(0);
    expect(be.takes.get('rhody')?.stars).toBe(1);
    expect(be.takes.get('rhody')?.firstTake).toBe(true);
    // Hoàn tác khi ô first đã có từ trước: không đụng tới bản đầu
    await store.consider(take({ stars: 2 }), true);
    const r2 = await store.consider(take({ stars: 3 }), true);
    const firstAt = be.firsts.get('rhody')!.savedAt;
    await store.undo('rhody', r2.saved ? r2.previous : null);
    expect(be.firsts.get('rhody')?.savedAt).toBe(firstAt);
    expect(be.takes.get('rhody')?.stars).toBe(2);
  });

  it('Album tắt → không lưu gì (kể cả bản đầu)', async () => {
    const { be, store } = makeStore();
    expect(await store.consider(take(), false)).toEqual({ saved: false, reason: 'off' });
    expect(be.takes.size + be.firsts.size).toBe(0);
  });

  it('dung lượng tính chung; đầy thì không lưu bản mới và KHÔNG bỏ bản đầu', async () => {
    const { be, store } = makeStore({ maxBytes: 1000 });
    await store.consider(take({ songId: 'a', bytes: 300 }), true);
    await store.consider(take({ songId: 'a', bytes: 300, stars: 2 }), true); // bản đầu 300 chuyển sang ô first
    expect(await store.consider(take({ songId: 'b', bytes: 500 }), true)).toEqual({ saved: false, reason: 'full' });
    expect((await store.consider(take({ songId: 'b', bytes: 400 }), true)).saved).toBe(true);
    expect(be.firsts.get('a')?.size).toBe(300);
  });

  it('ghi bản mới lỗi → ô first trả về như cũ (bản cũ vẫn là bản hay nhất)', async () => {
    const mem = memoryAlbumBackend();
    let failBest = false;
    const be: AlbumBackend = {
      ...mem,
      put: async (t, slot) => {
        if (failBest && slot !== 'first') throw new Error('QuotaExceededError');
        return mem.put(t, slot);
      },
    };
    const store = new AlbumStore(be);
    await store.consider(take({ stars: 1 }), true);
    failBest = true;
    expect(await store.consider(take({ stars: 3 }), true)).toEqual({ saved: false, reason: 'error' });
    expect(mem.firsts.size).toBe(0);
    expect(mem.takes.get('rhody')?.stars).toBe(1);
  });

  it('Xóa Album / xóa một bài: xóa cả bản đầu', async () => {
    const { be, store } = makeStore();
    for (const id of ['a', 'b']) {
      await store.consider(take({ songId: id, stars: 1 }), true);
      await store.consider(take({ songId: id, stars: 3 }), true);
    }
    expect(be.firsts.size).toBe(2);
    await store.remove('a');
    expect([...be.firsts.keys()]).toEqual(['b']);
    expect([...be.takes.keys()]).toEqual(['b']);
    await store.clear();
    expect(be.takes.size + be.firsts.size).toBe(0);
    expect(await store.pairs()).toEqual([]);
  });

  it('backend lỗi → các hàm mới không ném', async () => {
    const boom = () => Promise.reject(new Error('x'));
    const store = new AlbumStore({ list: boom, get: boom, put: boom, remove: boom, clear: boom });
    expect(await store.listFirst()).toEqual([]);
    expect(await store.firstOf('a')).toBeNull();
    expect(await store.getSlot('a', 'first')).toBeNull();
    expect(await store.pairs()).toEqual([]);
  });
});

describe('🎧 Nghe lần đầu → hôm nay — lời và nhãn', () => {
  it('lần đầu thật / bản cũ nhất; hôm nay / bản hay nhất', () => {
    const now = new Date(2026, 9, 16, 15).getTime();
    const a = compareWords({ trueFirst: true, nowAt: now - 3600e3, today: now });
    expect(a.firstLabel).toBe('Lần đầu');
    expect(a.nowLabel).toBe('Hôm nay');
    expect(a.sayFirst).toContain('lần đầu con đàn');
    expect(a.sayNow).toBe('Còn đây là hôm nay!');
    const b = compareWords({ trueFirst: false, nowAt: now - 3 * 86400e3, today: now });
    expect(b.firstLabel).toBe('Ngày xưa');
    expect(b.nowLabel).toBe('Bản hay nhất');
    expect(b.sayFirst).toContain('cũ nhất');
  });

  it('ngày ngắn gọn (thêm năm khi khác năm)', () => {
    const today = new Date(2026, 9, 16);
    expect(shortDay(new Date(2026, 9, 3).getTime(), today)).toBe('3/10');
    expect(shortDay(new Date(2025, 11, 30).getTime(), today)).toBe('30/12/2025');
  });
});
