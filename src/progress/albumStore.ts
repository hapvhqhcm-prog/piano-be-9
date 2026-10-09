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
}

export interface AlbumTake extends AlbumMeta {
  data: ArrayBuffer;
}

/** Lớp lưu trữ tối thiểu (IndexedDB thật, hoặc bộ nhớ trong test). */
export interface AlbumBackend {
  list(): Promise<AlbumMeta[]>;
  get(songId: string): Promise<AlbumTake | null>;
  put(take: AlbumTake): Promise<void>;
  remove(songId: string): Promise<void>;
  clear(): Promise<void>;
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

  /** Tổng số bản + dung lượng (cho màn Phụ huynh). */
  async usage(): Promise<{ count: number; bytes: number }> {
    const l = await this.list();
    return { count: l.length, bytes: l.reduce((s, m) => s + (m.size || 0), 0) };
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
      const old = metas.find((m) => m.songId === c.songId) ?? null;
      if (!isBetterTake(c, old)) return { saved: false, reason: 'not-better' };
      const size = c.blob.size;
      const used = metas.reduce((s, m) => s + (m.songId === c.songId ? 0 : m.size || 0), 0);
      if (size <= 0 || used + size > this.maxBytes) return { saved: false, reason: 'full' };
      const previous = old ? await this.backend.get(c.songId) : null;
      const data = await c.blob.arrayBuffer();
      await this.backend.put({
        songId: c.songId,
        title: c.title,
        savedAt: (this.opts.now ?? Date.now)(),
        stars: Math.max(0, Math.min(3, Math.round(c.stars))),
        accuracy: Math.max(0, Math.min(1, c.accuracy || 0)),
        seconds: Math.round(c.seconds * 10) / 10,
        mime: c.blob.type || 'audio/mp4',
        size: data.byteLength,
        data,
      });
      this.lastError = null;
      return { saved: true, previous };
    } catch (e) {
      this.lastError = errMsg(e);
      return { saved: false, reason: 'error' };
    }
  }

  /** Hoàn tác một lần lưu: trả bản cũ về chỗ (hoặc xoá bản vừa lưu nếu trước đó chưa có). */
  async undo(songId: string, previous: AlbumTake | null): Promise<boolean> {
    try {
      if (previous) await this.backend.put(previous);
      else await this.backend.remove(songId);
      return true;
    } catch (e) {
      this.lastError = errMsg(e);
      return false;
    }
  }

  async remove(songId: string): Promise<boolean> {
    try {
      await this.backend.remove(songId);
      return true;
    } catch (e) {
      this.lastError = errMsg(e);
      return false;
    }
  }

  async clear(): Promise<boolean> {
    try {
      await this.backend.clear();
      return true;
    } catch (e) {
      this.lastError = errMsg(e);
      return false;
    }
  }
}

/** Backend trong bộ nhớ (test / trình duyệt không có IndexedDB thì KHÔNG dùng — Album ẩn). */
export function memoryAlbumBackend(): AlbumBackend & { takes: Map<string, AlbumTake> } {
  const takes = new Map<string, AlbumTake>();
  const meta = ({ data: _d, ...m }: AlbumTake): AlbumMeta => m;
  return {
    takes,
    list: async () => [...takes.values()].map(meta),
    get: async (id) => takes.get(id) ?? null,
    put: async (t) => void takes.set(t.songId, t),
    remove: async (id) => void takes.delete(id),
    clear: async () => takes.clear(),
  };
}

const DB_NAME = 'piano-be-9-album';
const STORE = 'takes';

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
      const rq = idb.open(DB_NAME, 1);
      rq.onupgradeneeded = () => {
        if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE, { keyPath: 'songId' });
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
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore, done: (v: T) => void) => void): Promise<T> =>
    open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(STORE, mode);
          let value: T = undefined as T;
          fn(tx.objectStore(STORE), (v) => (value = v));
          tx.oncomplete = () => resolve(value);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error('idb abort'));
        }),
    ).catch((e: unknown) => {
      // (rà soát 2026-10-09) Safari có thể ngắt kết nối khi app nằm nền lâu → kết nối cũ hỏng mãi; bỏ để lần sau mở mới
      dbp = null;
      throw e;
    });
  const isTake = (v: unknown): v is AlbumTake =>
    !!v && typeof v === 'object' && typeof (v as AlbumTake).songId === 'string' && (v as AlbumTake).data instanceof ArrayBuffer;
  return {
    // Duyệt con trỏ, chỉ giữ phần thông tin (không giữ dữ liệu âm thanh trong danh sách)
    list: () =>
      run<AlbumMeta[]>('readonly', (s, done) => {
        const out: AlbumMeta[] = [];
        done(out);
        const rq = s.openCursor();
        rq.onsuccess = () => {
          const cur = rq.result;
          if (!cur) return;
          const v = cur.value as unknown;
          if (isTake(v)) {
            const { data: _d, ...m } = v;
            out.push(m);
          }
          cur.continue();
        };
      }),
    get: (songId) =>
      run<AlbumTake | null>('readonly', (s, done) => {
        done(null);
        const rq = s.get(songId);
        rq.onsuccess = () => done(isTake(rq.result) ? rq.result : null);
      }),
    put: (t) => run<void>('readwrite', (s) => void s.put(t)),
    remove: (songId) => run<void>('readwrite', (s) => void s.delete(songId)),
    clear: () => run<void>('readwrite', (s) => void s.clear()),
  };
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

/** "1,2 MB" */
export function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
