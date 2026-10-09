import { describe, expect, it } from 'vitest';
import { idbAlbumBackend, type AlbumTake } from '../src/progress/albumStore';

/**
 * IndexedDB giả tối thiểu (đủ cho idbAlbumBackend): open + nâng cấp phiên bản, nhiều kho trong một giao dịch,
 * get/put/delete/clear/getAll/openCursor. Đếm số lần ĐỌC bản thu (có âm thanh) để chứng minh list() không nạp âm thanh.
 */
function fakeIdb() {
  const dbs = new Map<string, { version: number; stores: Map<string, Map<string, unknown>> }>();
  const reads = { takeValues: 0 };
  const later = (fn: () => void) => queueMicrotask(fn);

  function makeTx(stores: Map<string, Map<string, unknown>>) {
    let pending = 0;
    const tx: Record<string, unknown> & { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; error: null } = {
      error: null,
    };
    const settle = () => {
      if (pending === 0) later(() => pending === 0 && tx.oncomplete?.());
    };
    const req = <T>(fn: () => T) => {
      const rq: { result?: T; onsuccess?: () => void; onerror?: () => void } = {};
      pending++;
      later(() => {
        rq.result = fn();
        rq.onsuccess?.();
        pending--;
        settle();
      });
      return rq;
    };
    tx.objectStore = (name: string) => {
      const s = stores.get(name)!;
      const count = (v: unknown) => {
        if (name === 'takes' && v) reads.takeValues++;
        return v;
      };
      return {
        get: (k: string) => req(() => count(s.get(k)) ?? undefined),
        put: (v: { songId: string }) => req(() => void s.set(v.songId, v)),
        delete: (k: string) => req(() => void s.delete(k)),
        clear: () => req(() => void s.clear()),
        getAll: () => req(() => [...s.values()].map(count)),
        openCursor: () => {
          const vals = [...s.values()];
          let i = 0;
          const rq: { result: unknown; onsuccess?: () => void } = { result: null };
          pending++;
          const step = () =>
            later(() => {
              if (i < vals.length) {
                const v = count(vals[i++]);
                rq.result = { value: v, continue: step };
                rq.onsuccess?.();
              } else {
                rq.result = null;
                rq.onsuccess?.();
                pending--;
                settle();
              }
            });
          step();
          return rq;
        },
      };
    };
    settle();
    return tx;
  }

  const factory = {
    open(name: string, version: number) {
      const rq: Record<string, unknown> & { onupgradeneeded?: () => void; onsuccess?: () => void } = {};
      later(() => {
        let db = dbs.get(name);
        const old = db?.version ?? 0;
        if (!db) dbs.set(name, (db = { version, stores: new Map() }));
        const handle = {
          objectStoreNames: { contains: (n: string) => db!.stores.has(n) },
          createObjectStore: (n: string) => db!.stores.set(n, new Map()),
          transaction: () => makeTx(db!.stores),
          close() {},
          onversionchange: null,
        };
        rq.result = handle;
        if (old < version) {
          db.version = version;
          rq.transaction = makeTx(db.stores);
          rq.onupgradeneeded?.();
        }
        // để cursor nâng cấp chạy xong rồi mới "success"
        setTimeout(() => rq.onsuccess?.(), 5);
      });
      return rq;
    },
  };
  return { factory: factory as unknown as IDBFactory, dbs, reads };
}

const take = (songId: string, bytes = 1000): AlbumTake => ({
  songId,
  title: songId,
  savedAt: 1,
  stars: 3,
  accuracy: 1,
  seconds: 10,
  mime: 'audio/mp4',
  size: bytes,
  data: new ArrayBuffer(bytes),
});

describe('Album IndexedDB — kho thông tin riêng (v2)', () => {
  it('list() không đọc dữ liệu âm thanh; put/remove/clear giữ hai kho khớp nhau', async () => {
    const { factory, reads } = fakeIdb();
    const be = idbAlbumBackend(factory)!;
    await be.put(take('a'));
    await be.put(take('b', 2000));
    reads.takeValues = 0;
    const l = await be.list();
    expect(l.map((m) => m.songId).sort()).toEqual(['a', 'b']);
    expect(l.every((m) => !('data' in m))).toBe(true);
    expect(reads.takeValues).toBe(0);
    expect((await be.get('b'))?.size).toBe(2000);
    await be.remove('a');
    expect((await be.list()).map((m) => m.songId)).toEqual(['b']);
    await be.clear();
    expect(await be.list()).toEqual([]);
    expect(await be.get('b')).toBeNull();
  });

  it('nâng cấp từ bản v1 (chỉ có kho bản thu): chép thông tin sang kho meta, không mất bản thu', async () => {
    const { factory, dbs } = fakeIdb();
    dbs.set('piano-be-9-album', { version: 1, stores: new Map([['takes', new Map([['x', take('x', 500)]])]]) });
    const be = idbAlbumBackend(factory)!;
    const l = await be.list();
    expect(l.map((m) => m.songId)).toEqual(['x']);
    expect((await be.get('x'))?.size).toBe(500);
  });
});
