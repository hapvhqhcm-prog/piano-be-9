/**
 * (+ 2026-10-12) 🕑 BẢN GHI ÂM CHỜ BỐ MẸ NGHE — lượt bé TỰ HỌC mà cần bố mẹ chấm (progress/reviewQueue.ts) được giữ tạm
 * một bản ghi (chính bản "🎧 Nghe lại" của màn bài hát — audio/recorder.ts) để bố mẹ ▶ nghe lại khi rảnh.
 *
 * - IndexedDB RIÊNG ('piano-be-9-review'; không chung với Album / bản sao tiến độ). Không có IndexedDB → không giữ bản ghi
 *   (hàng chờ vẫn chạy, chỉ thiếu nút ▶). Mọi lỗi bị nuốt.
 * - CHỈ trên iPad này, KHÔNG vào bản sao lưu JSON (bản sao lưu chỉ có thông tin mục chờ).
 * - Giới hạn: mỗi bản ≤ REVIEW_CLIP_MAX_SECONDS; tổng ≤ REVIEW_AUDIO_MAX_BYTES — đầy thì bỏ bản CŨ nhất (bản ghi chờ chỉ
 *   là tạm, bản mới quan trọng hơn).
 * - Tự xoá: khi bố mẹ đã chấm mục / mục hết hạn (14 ngày) — prune() bỏ mọi bản không còn mục chờ hoặc quá hạn.
 */

export const REVIEW_AUDIO_MAX_BYTES = 25 * 1024 * 1024;
export const REVIEW_CLIP_MAX_SECONDS = 90;
/** Ngắn hơn mức này (giây) không đáng giữ. */
export const REVIEW_CLIP_MIN_SECONDS = 1;
/** Quá ngần này ngày thì xoá (khớp REVIEW_EXPIRE_DAYS). */
export const REVIEW_CLIP_EXPIRE_DAYS = 14;

export interface ReviewClipMeta {
  /** Mã mục chờ (ReviewItem.id) */
  id: string;
  savedAt: number;
  seconds: number;
  mime: string;
  size: number;
}
export interface ReviewClip extends ReviewClipMeta {
  data: ArrayBuffer;
}

export interface ReviewAudioBackend {
  list(): Promise<ReviewClipMeta[]>;
  get(id: string): Promise<ReviewClip | null>;
  put(c: ReviewClip): Promise<void>;
  remove(id: string): Promise<void>;
}

export type SaveResult = { saved: true; evicted: string[] } | { saved: false; reason: 'too-short' | 'too-long' | 'too-big' | 'error' };

/** Logic trên một backend bất kỳ (thuần với backend bộ nhớ — có test). Không bao giờ ném lỗi ra ngoài. */
export class ReviewAudioStore {
  lastError: string | null = null;
  constructor(
    private readonly backend: ReviewAudioBackend,
    private readonly opts: { maxBytes?: number; now?: () => number } = {},
  ) {}

  private get maxBytes(): number {
    return this.opts.maxBytes ?? REVIEW_AUDIO_MAX_BYTES;
  }
  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** Lưu bản ghi của mục `id`; đầy thì bỏ bản cũ nhất cho đủ chỗ. */
  async save(id: string, blob: Blob, seconds: number): Promise<SaveResult> {
    if (!(seconds >= REVIEW_CLIP_MIN_SECONDS)) return { saved: false, reason: 'too-short' };
    if (seconds > REVIEW_CLIP_MAX_SECONDS + 0.5) return { saved: false, reason: 'too-long' };
    try {
      const data = await blob.arrayBuffer();
      if (!data.byteLength || data.byteLength > this.maxBytes) return { saved: false, reason: 'too-big' };
      const metas = (await this.backend.list()).filter((m) => m.id !== id).sort((a, b) => a.savedAt - b.savedAt);
      let used = metas.reduce((s, m) => s + (m.size || 0), 0);
      const evicted: string[] = [];
      while (used + data.byteLength > this.maxBytes && metas.length) {
        const m = metas.shift()!;
        await this.backend.remove(m.id);
        used -= m.size || 0;
        evicted.push(m.id);
      }
      await this.backend.put({ id, savedAt: this.now(), seconds: Math.round(seconds * 10) / 10, mime: blob.type || 'audio/mp4', size: data.byteLength, data });
      this.lastError = null;
      return { saved: true, evicted };
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      return { saved: false, reason: 'error' };
    }
  }

  async get(id: string): Promise<ReviewClip | null> {
    try {
      return await this.backend.get(id);
    } catch {
      return null;
    }
  }

  async has(): Promise<Set<string>> {
    try {
      return new Set((await this.backend.list()).map((m) => m.id));
    } catch {
      return new Set();
    }
  }

  async remove(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      try {
        await this.backend.remove(id);
      } catch {
        /* bỏ qua */
      }
    }
  }

  /** Bỏ mọi bản ghi không còn mục chờ (`keep`) hoặc quá hạn. Trả về mã đã bỏ. */
  async prune(keep: ReadonlySet<string>): Promise<string[]> {
    try {
      const cut = this.now() - REVIEW_CLIP_EXPIRE_DAYS * 86_400_000;
      const drop = (await this.backend.list()).filter((m) => !keep.has(m.id) || m.savedAt < cut).map((m) => m.id);
      await this.remove(drop);
      return drop;
    } catch {
      return [];
    }
  }

  /** Tổng dung lượng (byte). */
  async usage(): Promise<number> {
    try {
      return (await this.backend.list()).reduce((s, m) => s + (m.size || 0), 0);
    } catch {
      return 0;
    }
  }
}

/** Backend trong bộ nhớ (test). */
export function memoryReviewBackend(): ReviewAudioBackend & { clips: Map<string, ReviewClip> } {
  const clips = new Map<string, ReviewClip>();
  return {
    clips,
    list: async () => [...clips.values()].map(({ data: _d, ...m }) => m),
    get: async (id) => clips.get(id) ?? null,
    put: async (c) => void clips.set(c.id, c),
    remove: async (id) => void clips.delete(id),
  };
}

const DB_NAME = 'piano-be-9-review';
const CLIPS = 'clips';
const META = 'meta';

/** IndexedDB thật (kho thông tin riêng → liệt kê không nạp âm thanh). null nếu trình duyệt không có. */
export function idbReviewBackend(idb: IDBFactory | undefined = globalThis.indexedDB): ReviewAudioBackend | null {
  try {
    if (!idb || typeof idb.open !== 'function') return null;
  } catch {
    return null;
  }
  let dbp: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      const rq = idb.open(DB_NAME, 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains(CLIPS)) db.createObjectStore(CLIPS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
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
      dbp = null;
      throw e;
    }));
  const run = <T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction, done: (v: T) => void) => void): Promise<T> =>
    open()
      .then(
        (db) =>
          new Promise<T>((resolve, reject) => {
            const tx = db.transaction(stores, mode);
            let value: T = undefined as T;
            fn(tx, (v) => (value = v));
            tx.oncomplete = () => resolve(value);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error('idb abort'));
          }),
      )
      .catch((e: unknown) => {
        dbp = null;
        throw e;
      });
  const isMeta = (v: unknown): v is ReviewClipMeta => !!v && typeof v === 'object' && typeof (v as ReviewClipMeta).id === 'string';
  return {
    list: () =>
      run<ReviewClipMeta[]>([META], 'readonly', (tx, done) => {
        done([]);
        const rq = tx.objectStore(META).getAll();
        rq.onsuccess = () => done((rq.result as unknown[]).filter(isMeta).map((m) => ({ ...m })));
      }),
    get: (id) =>
      run<ReviewClip | null>([CLIPS], 'readonly', (tx, done) => {
        done(null);
        const rq = tx.objectStore(CLIPS).get(id);
        rq.onsuccess = () => {
          const v = rq.result as ReviewClip | undefined;
          done(v && v.data instanceof ArrayBuffer ? v : null);
        };
      }),
    put: (c) =>
      run<void>([CLIPS, META], 'readwrite', (tx) => {
        tx.objectStore(CLIPS).put(c);
        const { data: _d, ...m } = c;
        tx.objectStore(META).put(m);
      }),
    remove: (id) =>
      run<void>([CLIPS, META], 'readwrite', (tx) => {
        tx.objectStore(CLIPS).delete(id);
        tx.objectStore(META).delete(id);
      }),
  };
}

let shared: ReviewAudioStore | null | undefined;
/** Kho dùng chung của app; null = không có IndexedDB (không giữ bản ghi). */
export function reviewAudio(): ReviewAudioStore | null {
  if (shared === undefined) {
    let b: ReviewAudioBackend | null = null;
    try {
      b = idbReviewBackend();
    } catch {
      b = null;
    }
    shared = b ? new ReviewAudioStore(b) : null;
  }
  return shared;
}
