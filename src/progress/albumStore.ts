/**
 * (+ 2026-10-08, OWNER duyệt) 🎧 ALBUM CỦA CON — giữ BẢN THU HAY NHẤT của mỗi bài, CHỈ trên iPad này.
 *
 * - Mỗi bài tối đa 1 bản: bản mới chỉ thay bản cũ khi tốt hơn (nhiều sao hơn; bằng sao → đúng nhiều hơn;
 *   bằng hết → bản MỚI hơn).
 * - IndexedDB RIÊNG (DB 'piano-be-9-album', không dùng chung với bản sao tiến độ mirror.ts). Trình duyệt không có
 *   IndexedDB / bị chặn → không có Album (giao diện ẩn), mọi lỗi bị nuốt và trả về kết quả "không lưu".
 * - Giới hạn: mỗi bản ≤ ALBUM_MAX_SECONDS giây; tổng ≤ ALBUM_MAX_BYTES (đầy → KHÔNG lưu bản mới, không tự xoá bản cũ).
 * - Định dạng: đúng như MediaRecorder ghi (iPad Safari 'audio/mp4' AAC — nén sẵn); lưu dạng ArrayBuffer + mime
 *   (Safari cũ lưu Blob vào IndexedDB hay lỗi).
 * - KHÔNG nằm trong bản sao lưu JSON (quá nặng) — màn Phụ huynh nói rõ.
 * - Bật/tắt (màn Phụ huynh, mặc định BẬT) lưu ở localStorage khóa riêng — không đụng schema tiến độ.
 * - (+ 2026-10-16, OWNER duyệt — "Nghe lại tiến bộ của con") Ngoài bản hay nhất, giữ thêm BẢN ĐẦU TIÊN của mỗi bài (ô
 *   'first'): bản thu cả bài đầu tiên (chất lượng nào cũng được) KHÔNG BAO GIỜ bị thay. Không lưu hai lần: khi bản đầu còn
 *   là bản hay nhất thì chỉ có một bản (cờ `firstTake`); lần đầu bản hay nhất bị thay, bản cũ (= bản đầu) CHUYỂN sang ô
 *   'first'. Dung lượng tính chung; "Xóa Album" xóa cả hai ô. IndexedDB v3 thêm 2 kho (dữ liệu cũ giữ nguyên).
 */

/** Mỗi bản thu tối đa (giây). */
export const ALBUM_MAX_SECONDS = 90;
/** Tổng dung lượng Album tối đa (byte). */
export const ALBUM_MAX_BYTES = 60 * 1024 * 1024;
/** Ngắn hơn mức này (giây) không đáng lưu. */
export const ALBUM_MIN_SECONDS = 2;
/** Khóa localStorage của công tắc "Lưu bản thu vào Album" ('0' = tắt; không có = bật). */
export const ALBUM_ENABLED_KEY = 'piano-be-9-album-on';

/** Thông tin một bản thu (không kèm dữ liệu âm thanh). */
export interface AlbumMeta {
  songId: string;
  title: string;
  /** ms */
  savedAt: number;
  /** 0–3 */
  stars: number;
  /** 0–1: tỉ lệ đúng của lượt đó */
  accuracy: number;
  seconds: number;
  mime: string;
  /** byte */
  size: number;
  /**
   * (+ 2026-10-16) Đây là bản thu cả bài ĐẦU TIÊN của bài (lúc lưu chưa có bản nào). Bản cũ từ trước bản cập nhật không có cờ
   * này (không biết có phải lần đầu không) → giao diện gọi là "bản cũ nhất".
   */
  firstTake?: boolean;
}

export interface AlbumTake extends AlbumMeta {
  data: ArrayBuffer;
}

/** (+ 2026-10-16) Ô lưu của một bài: 'best' = bản hay nhất (mặc định), 'first' = bản đầu tiên (không bao giờ bị thay). */
export type AlbumSlot = 'best' | 'first';

/** Lớp lưu trữ tối thiểu (IndexedDB thật, hoặc bộ nhớ trong test). Không truyền `slot` = ô 'best'. clear() xóa mọi ô. */
export interface AlbumBackend {
  list(slot?: AlbumSlot): Promise<AlbumMeta[]>;
  get(songId: string, slot?: AlbumSlot): Promise<AlbumTake | null>;
  put(take: AlbumTake, slot?: AlbumSlot): Promise<void>;
  remove(songId: string, slot?: AlbumSlot): Promise<void>;
  clear(): Promise<void>;
}

/** (+ 2026-10-16) Một bài có cả bản đầu tiên và bản hay nhất (khác nhau) — "🎧 Nghe lần đầu → hôm nay". */
export interface AlbumPair {
  first: AlbumMeta;
  best: AlbumMeta;
}

export type AlbumVerdict =
  | { saved: true; previous: AlbumTake | null }
  | { saved: false; reason: 'off' | 'too-short' | 'too-long' | 'not-better' | 'full' | 'error' };

/** Điểm của một lượt (để so bản thu). */
export interface TakeScore {
  stars: number;
  accuracy: number;
}

/** Bản mới có đáng thay bản cũ không (thuần — có test): nhiều sao hơn; bằng sao → đúng nhiều hơn; bằng hết → bản mới. */
export function isBetterTake(next: TakeScore, old: TakeScore | null | undefined): boolean {
  if (!old) return true;
  if (next.stars !== old.stars) return next.stars > old.stars;
  return next.accuracy >= old.accuracy - 1e-9;
}

/** Đuôi tệp theo mime (iPad: .m4a). */
export function albumExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('mp4') || m.includes('aac') || m.includes('m4a')) return 'm4a';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  return 'm4a';
}

/** Tên tệp để gửi ông bà: "Tên bài - 08-10-2026.m4a" (bỏ ký tự cấm trong tên tệp). */
export function albumFileName(meta: Pick<AlbumMeta, 'title' | 'savedAt' | 'mime'>): string {
  const d = new Date(meta.savedAt);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const title = meta.title.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Bai dan';
  return `${title} - ${dd}-${mm}-${d.getFullYear()}.${albumExt(meta.mime)}`;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message || e.name : String(e));

/** Logic Album trên một backend bất kỳ. Không bao giờ ném lỗi ra ngoài. */
export class AlbumStore {
  lastError: string | null = null;

  constructor(
    private readonly backend: AlbumBackend,
    private readonly opts: { maxBytes?: number; maxSeconds?: number; now?: () => number } = {},
  ) {}

  private get maxBytes(): number {
    return this.opts.maxBytes ?? ALBUM_MAX_BYTES;
  }
  private get maxSeconds(): number {
    return this.opts.maxSeconds ?? ALBUM_MAX_SECONDS;
  }

  /** Các bản thu, mới nhất trước ([] nếu lỗi). */
  async list(): Promise<AlbumMeta[]> {
    try {
      const l = await this.backend.list();
      return [...l].sort((a, b) => b.savedAt - a.savedAt);
    } catch (e) {
      this.lastError = errMsg(e);
      return [];
    }
  }

  async get(songId: string): Promise<AlbumTake | null> {
    try {
      return await this.backend.get(songId);
    } catch (e) {
      this.lastError = errMsg(e);
      return null;
    }
  }

  /** Tổng số bản + dung lượng (cho màn Phụ huynh) — cả bản hay nhất lẫn bản đầu tiên. */
  async usage(): Promise<{ count: number; bytes: number }> {
    const l = [...(await this.list()), ...(await this.listFirst())];
    return { count: l.length, bytes: l.reduce((s, m) => s + (m.size || 0), 0) };
  }

  /** (+ 2026-10-16) Các bản ĐẦU TIÊN đã tách khỏi bản hay nhất ([] nếu lỗi). */
  async listFirst(): Promise<AlbumMeta[]> {
    try {
      return await this.backend.list('first');
    } catch (e) {
      this.lastError = errMsg(e);
      return [];
    }
  }

  /**
   * (+ 2026-10-16) Bản ĐẦU TIÊN (hoặc bản cũ nhất còn giữ) của một bài: ô 'first' nếu có; chưa có thì bản hay nhất khi nó
   * chính là bản đầu (cờ firstTake). null = chưa có.
   */
  async firstOf(songId: string): Promise<{ meta: AlbumMeta; slot: AlbumSlot } | null> {
    try {
      const f = (await this.backend.list('first')).find((m) => m.songId === songId);
      if (f) return { meta: f, slot: 'first' };
      const b = (await this.backend.list()).find((m) => m.songId === songId);
      return b?.firstTake ? { meta: b, slot: 'best' } : null;
    } catch (e) {
      this.lastError = errMsg(e);
      return null;
    }
  }

  /** (+ 2026-10-16) Đọc bản thu của một ô (null nếu không có / lỗi). */
  async getSlot(songId: string, slot: AlbumSlot): Promise<AlbumTake | null> {
    try {
      return await this.backend.get(songId, slot);
    } catch (e) {
      this.lastError = errMsg(e);
      return null;
    }
  }

  /** (+ 2026-10-16) Các bài có cả bản đầu tiên và bản hay nhất — bài có bản hay nhất mới nhất trước. */
  async pairs(): Promise<AlbumPair[]> {
    const firsts = await this.listFirst();
    if (!firsts.length) return [];
    const best = new Map((await this.list()).map((m) => [m.songId, m]));
    return firsts
      .flatMap((first) => {
        const b = best.get(first.songId);
        return b ? [{ first, best: b }] : [];
      })
      .sort((a, b) => b.best.savedAt - a.best.savedAt);
  }

  /**
   * Cân nhắc lưu bản thu của một lượt: chỉ lưu khi Album bật, độ dài hợp lệ, TỐT HƠN bản đang có và còn chỗ.
   * Trả về bản cũ (nếu có) để "Không lưu" hoàn tác được.
   */
  async consider(
    c: { songId: string; title: string; blob: Blob; seconds: number; stars: number; accuracy: number },
    enabled = albumEnabled(),
  ): Promise<AlbumVerdict> {
    if (!enabled) return { saved: false, reason: 'off' };
    if (!(c.seconds >= ALBUM_MIN_SECONDS)) return { saved: false, reason: 'too-short' };
    if (c.seconds > this.maxSeconds + 0.5) return { saved: false, reason: 'too-long' };
    try {
      const metas = await this.backend.list();
      const firsts = await this.backend.list('first');
      const old = metas.find((m) => m.songId === c.songId) ?? null;
      if (!isBetterTake(c, old)) return { saved: false, reason: 'not-better' };
      const hasFirst = firsts.some((m) => m.songId === c.songId);
      // (+ 2026-10-16) Bài chưa có ô 'first': bản đang có (bản đầu / bản cũ nhất còn giữ) CHUYỂN sang ô 'first' thay vì bị bỏ
      const moveOld = !!old && !hasFirst;
      const size = c.blob.size;
      const used =
        metas.reduce((s, m) => s + (m.songId === c.songId ? 0 : m.size || 0), 0) +
        firsts.reduce((s, m) => s + (m.size || 0), 0) +
        (moveOld && old ? old.size || 0 : 0);
      // Đầy: KHÔNG lưu bản mới (bản đầu tiên không bao giờ bị bỏ để lấy chỗ)
      if (size <= 0 || used + size > this.maxBytes) {
        // (+ 2026-10-17) nhớ "Album đầy" → màn Phụ huynh / màn Album báo cho bố mẹ (trước đây chỉ một dòng nhỏ ở màn bài hát)
        setAlbumFullAt((this.opts.now ?? Date.now)());
        return { saved: false, reason: 'full' };
      }
      const previous = old ? await this.backend.get(c.songId) : null;
      const data = await c.blob.arrayBuffer();
      const moved = moveOld && !!previous;
      if (moved && previous) await this.backend.put(previous, 'first');
      try {
        await this.backend.put({
          songId: c.songId,
          title: c.title,
          savedAt: (this.opts.now ?? Date.now)(),
          stars: Math.max(0, Math.min(3, Math.round(c.stars))),
          accuracy: Math.max(0, Math.min(1, c.accuracy || 0)),
          seconds: Math.round(c.seconds * 10) / 10,
          mime: c.blob.type || 'audio/mp4',
          size: data.byteLength,
          ...(!old && !hasFirst ? { firstTake: true } : {}),
          data,
        });
      } catch (e) {
        // Bản mới không ghi được → trả ô 'first' về như cũ (bản cũ vẫn là bản hay nhất)
        if (moved) await this.backend.remove(c.songId, 'first').catch(() => undefined);
        throw e;
      }
      this.lastError = null;
      setAlbumFullAt(null);
      return { saved: true, previous };
    } catch (e) {
      this.lastError = errMsg(e);
      return { saved: false, reason: 'error' };
    }
  }

  /**
   * Hoàn tác một lần lưu: trả bản cũ về chỗ (hoặc xoá bản vừa lưu nếu trước đó chưa có). (+ 2026-10-16) Bản cũ vừa được
   * chuyển sang ô 'first' (cùng thời điểm lưu) → bỏ khỏi ô đó (nó lại là bản hay nhất, kiêm bản đầu).
   */
  async undo(songId: string, previous: AlbumTake | null): Promise<boolean> {
    try {
      if (previous) {
        await this.backend.put(previous);
        const f = (await this.backend.list('first')).find((m) => m.songId === songId);
        if (f && f.savedAt === previous.savedAt) await this.backend.remove(songId, 'first');
      } else await this.backend.remove(songId);
      return true;
    } catch (e) {
      this.lastError = errMsg(e);
      return false;
    }
  }

  /** Xóa một bài khỏi Album (cả bản hay nhất lẫn bản đầu tiên). */
  async remove(songId: string): Promise<boolean> {
    try {
      await this.backend.remove(songId);
      await this.backend.remove(songId, 'first');
      return true;
    } catch (e) {
      this.lastError = errMsg(e);
      return false;
    }
  }

  /**
   * (+ 2026-10-17) "🧹 Xóa bản hay nhất cũ" (bố mẹ chạm khi Album đầy): xóa các BẢN HAY NHẤT cũ nhất (savedAt) cho tới khi dung
   * lượng ≤ ALBUM_FREE_TARGET × giới hạn. KHÔNG BAO GIỜ xóa bản đầu tiên — cả ô 'first' lẫn bản hay nhất kiêm bản đầu
   * (cờ firstTake). Trả về số bản đã xóa + dung lượng giải phóng.
   */
  async freeOldBest(target: number = Math.floor(this.maxBytes * ALBUM_FREE_TARGET)): Promise<{ removed: number; freed: number }> {
    try {
      const best = await this.backend.list();
      const firsts = await this.backend.list('first');
      let used = [...best, ...firsts].reduce((s, m) => s + (m.size || 0), 0);
      let removed = 0;
      let freed = 0;
      for (const m of [...best].filter((x) => !x.firstTake).sort((a, b) => a.savedAt - b.savedAt)) {
        if (used <= target) break;
        await this.backend.remove(m.songId);
        used -= m.size || 0;
        freed += m.size || 0;
        removed++;
      }
      if (removed) setAlbumFullAt(null);
      return { removed, freed };
    } catch (e) {
      this.lastError = errMsg(e);
      return { removed: 0, freed: 0 };
    }
  }

  async clear(): Promise<boolean> {
    try {
      await this.backend.clear();
      setAlbumFullAt(null);
      return true;
    } catch (e) {
      this.lastError = errMsg(e);
      return false;
    }
  }
}

/** Backend trong bộ nhớ (test / trình duyệt không có IndexedDB thì KHÔNG dùng — Album ẩn). */
export function memoryAlbumBackend(): AlbumBackend & { takes: Map<string, AlbumTake>; firsts: Map<string, AlbumTake> } {
  const takes = new Map<string, AlbumTake>();
  const firsts = new Map<string, AlbumTake>();
  const of = (slot?: AlbumSlot) => (slot === 'first' ? firsts : takes);
  const meta = ({ data: _d, ...m }: AlbumTake): AlbumMeta => m;
  return {
    takes,
    firsts,
    list: async (slot) => [...of(slot).values()].map(meta),
    get: async (id, slot) => of(slot).get(id) ?? null,
    put: async (t, slot) => void of(slot).set(t.songId, t),
    remove: async (id, slot) => void of(slot).delete(id),
    clear: async () => {
      takes.clear();
      firsts.clear();
    },
  };
}

const DB_NAME = 'piano-be-9-album';
/** v3 (+ 2026-10-16): thêm kho bản ĐẦU TIÊN (FIRST + FIRST_META) */
const DB_VERSION = 3;
const STORE = 'takes';
const META = 'meta';
const FIRST = 'firstTakes';
const FIRST_META = 'firstMeta';
/** [kho bản thu, kho thông tin] của một ô */
const storesOf = (slot?: AlbumSlot): [string, string] => (slot === 'first' ? [FIRST, FIRST_META] : [STORE, META]);

/** IndexedDB thật. null nếu trình duyệt không có (hoặc bị chặn). */
export function idbAlbumBackend(idb: IDBFactory | undefined = globalThis.indexedDB): AlbumBackend | null {
  try {
    if (!idb || typeof idb.open !== 'function') return null;
  } catch {
    return null;
  }
  let dbp: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      // v2 (rà soát 2026-10-09): thêm kho META riêng — danh sách Album chỉ đọc thông tin, KHÔNG nạp cả chục MB âm thanh
      // (trước đây duyệt con trỏ trên kho bản thu → iPad cũ có thể giật / văng tab khi Album gần đầy)
      // v3 (+ 2026-10-16): thêm hai kho của bản đầu tiên — kho cũ và dữ liệu cũ giữ nguyên
      const rq = idb.open(DB_NAME, DB_VERSION);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'songId' });
        if (!db.objectStoreNames.contains(FIRST)) db.createObjectStore(FIRST, { keyPath: 'songId' });
        if (!db.objectStoreNames.contains(FIRST_META)) db.createObjectStore(FIRST_META, { keyPath: 'songId' });
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, { keyPath: 'songId' });
          // Chép thông tin các bản thu sẵn có (bản v1) sang kho meta — một lần, trong giao dịch nâng cấp
          const tx = rq.transaction;
          if (tx) {
            const takes = tx.objectStore(STORE);
            const metas = tx.objectStore(META);
            const cur = takes.openCursor();
            cur.onsuccess = () => {
              const c = cur.result;
              if (!c) return;
              if (isTake(c.value)) metas.put(metaOf(c.value));
              c.continue();
            };
          }
        }
      };
      rq.onsuccess = () => {
        const db = rq.result;
        db.onversionchange = () => {
          db.close();
          dbp = null;
        };
        resolve(db);
      };
      rq.onerror = () => reject(rq.error);
      rq.onblocked = () => reject(new Error('idb blocked'));
    }).catch((e: unknown) => {
      dbp = null; // lần sau thử mở lại
      throw e;
    }));
  const run = <T>(
    stores: string[],
    mode: IDBTransactionMode,
    fn: (tx: IDBTransaction, done: (v: T) => void) => void,
  ): Promise<T> =>
    open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(stores, mode);
          let value: T = undefined as T;
          fn(tx, (v) => (value = v));
          tx.oncomplete = () => resolve(value);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error('idb abort'));
        }),
    ).catch((e: unknown) => {
      // (rà soát 2026-10-09) Safari có thể ngắt kết nối khi app nằm nền lâu → kết nối cũ hỏng mãi; bỏ để lần sau mở mới
      dbp = null;
      throw e;
    });
  return {
    // Chỉ đọc kho thông tin (nhỏ) — không chạm dữ liệu âm thanh
    list: (slot) => {
      const [, meta] = storesOf(slot);
      return run<AlbumMeta[]>([meta], 'readonly', (tx, done) => {
        done([]);
        const rq = tx.objectStore(meta).getAll();
        rq.onsuccess = () => done((rq.result as unknown[]).filter(isMeta).map((m) => ({ ...m })));
      });
    },
    get: (songId, slot) => {
      const [store] = storesOf(slot);
      return run<AlbumTake | null>([store], 'readonly', (tx, done) => {
        done(null);
        const rq = tx.objectStore(store).get(songId);
        rq.onsuccess = () => done(isTake(rq.result) ? rq.result : null);
      });
    },
    // Bản thu + thông tin ghi CÙNG một giao dịch (không lệch nhau)
    put: (t, slot) => {
      const [store, meta] = storesOf(slot);
      return run<void>([store, meta], 'readwrite', (tx) => {
        tx.objectStore(store).put(t);
        tx.objectStore(meta).put(metaOf(t));
      });
    },
    remove: (songId, slot) => {
      const [store, meta] = storesOf(slot);
      return run<void>([store, meta], 'readwrite', (tx) => {
        tx.objectStore(store).delete(songId);
        tx.objectStore(meta).delete(songId);
      });
    },
    // "Xóa Album": mọi ô
    clear: () =>
      run<void>([STORE, META, FIRST, FIRST_META], 'readwrite', (tx) => {
        for (const s of [STORE, META, FIRST, FIRST_META]) tx.objectStore(s).clear();
      }),
  };
}

function isTake(v: unknown): v is AlbumTake {
  return !!v && typeof v === 'object' && typeof (v as AlbumTake).songId === 'string' && (v as AlbumTake).data instanceof ArrayBuffer;
}

function isMeta(v: unknown): v is AlbumMeta {
  return !!v && typeof v === 'object' && typeof (v as AlbumMeta).songId === 'string' && typeof (v as AlbumMeta).size === 'number';
}

/** Phần thông tin của một bản thu (bỏ dữ liệu âm thanh). */
export function metaOf(t: AlbumTake): AlbumMeta {
  const { data: _d, ...m } = t;
  return m;
}

let shared: AlbumStore | null | undefined;
/** Album dùng chung của app; null = trình duyệt không có IndexedDB (ẩn mọi nút Album). */
export function albumStore(): AlbumStore | null {
  if (shared === undefined) {
    let b: AlbumBackend | null = null;
    try {
      b = idbAlbumBackend();
    } catch {
      b = null;
    }
    shared = b ? new AlbumStore(b) : null;
  }
  return shared;
}

function ls(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Công tắc "Lưu bản thu vào Album" (mặc định BẬT). */
export function albumEnabled(): boolean {
  try {
    return ls()?.getItem(ALBUM_ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAlbumEnabled(on: boolean): void {
  try {
    if (on) ls()?.removeItem(ALBUM_ENABLED_KEY);
    else ls()?.setItem(ALBUM_ENABLED_KEY, '0');
  } catch {
    /* bỏ qua */
  }
}

/** (+ 2026-10-17) "🧹 Xóa bản hay nhất cũ" giải phóng tới khi Album còn ≤ ngần này phần giới hạn. */
export const ALBUM_FREE_TARGET = 0.75;
/** (+ 2026-10-17) Lúc Album đầy gần nhất (bản thu hay hơn không lưu được) — localStorage, chỉ là tiện ích trong máy. */
export const ALBUM_FULL_KEY = 'piano-be-9-album-full';

/** Lúc Album đầy gần nhất (ms); null = không đầy (hoặc đã dọn / lưu được bản mới sau đó). */
export function albumFullAt(): number | null {
  try {
    const v = Number(ls()?.getItem(ALBUM_FULL_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setAlbumFullAt(at: number | null): void {
  try {
    if (at === null) ls()?.removeItem(ALBUM_FULL_KEY);
    else ls()?.setItem(ALBUM_FULL_KEY, String(at));
  } catch {
    /* bỏ qua */
  }
}

/** Cần báo bố mẹ "Album đầy": vừa có bản không lưu được vì đầy, hoặc dung lượng đã ≥ 95% giới hạn. */
export function albumShowsFull(bytes: number, max: number = ALBUM_MAX_BYTES, fullAt: number | null = albumFullAt()): boolean {
  return fullAt !== null || bytes >= max * 0.95;
}

/** "1,2 MB" */
export function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
