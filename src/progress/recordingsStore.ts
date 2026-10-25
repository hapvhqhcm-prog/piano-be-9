/**
 * (+ 2026-10-25, bé xin "Làm một cái máy ghi âm") 📼 BẢN GHI CỦA CON — các bản ghi của 🎙️ Máy ghi âm (src/ui/screens/tapeRecorder.ts).
 *
 * - IndexedDB RIÊNG: DB 'piano-be-9-recordings' (không dùng chung với 🎧 Album 'piano-be-9-album' hay bản sao tiến độ).
 *   Trình duyệt không có IndexedDB → vẫn ghi & nghe được trong phiên (kho trong bộ nhớ), chỉ không giữ lại sau khi tắt app.
 * - Giới hạn: tối đa REC_MAX_COUNT bản, tổng ≤ REC_MAX_BYTES. Đầy → KHÔNG tự xoá: save() trả về danh sách bản CŨ NHẤT cần
 *   xoá để có chỗ (giao diện hỏi bé/bố mẹ "Xoá các bản cũ nhất?"), rồi saveFreeing() xoá đúng các bản đó và lưu.
 * - Tên mặc định "Bản ghi N" (N = số lớn nhất đang có + 1); emoji tuỳ chọn.
 * - 👤 KHÁCH CHƠI: bản ghi của khách vào kho TẠM trong bộ nhớ (guestRecordings) — nghe / chia sẻ được ngay, nhưng KHÔNG ghi
 *   xuống iPad và bị xoá khi thoát chế độ khách (ui/guest.ts gọi clearGuestRecordings). Danh sách của bé không bị đụng tới.
 * - Định dạng: đúng như MediaRecorder ghi (iPad: audio/mp4 AAC); lưu ArrayBuffer + mime (Safari cũ lưu Blob vào IndexedDB hay lỗi).
 * - Mọi lỗi bị nuốt (trả kết quả "không lưu" + lastError). Không nằm trong bản sao lưu JSON.
 */

/** Ghi tối đa (giây) — 3 phút. */
export const REC_MAX_SECONDS = 180;
/** Ngắn hơn mức này (giây) thì không lưu (bấm nhầm). */
export const REC_MIN_SECONDS = 1;
/** Số bản ghi tối đa. */
export const REC_MAX_COUNT = 30;
/** Tổng dung lượng tối đa (byte). */
export const REC_MAX_BYTES = 80 * 1024 * 1024;
/** Tên tối đa (ký tự). */
export const REC_NAME_MAX = 40;
/** Emoji cho bé chọn (cái đầu là mặc định). */
export const REC_EMOJIS = ['🎹', '🎵', '⭐', '🐸', '🚀', '🌈', '🐱', '🦖', '🎉', '❤️'] as const;
export const REC_DEFAULT_PREFIX = 'Bản ghi';

export interface RecMeta {
  id: string;
  name: string;
  emoji: string;
  /** ms */
  savedAt: number;
  seconds: number;
  mime: string;
  /** byte */
  size: number;
}

export interface RecTake extends RecMeta {
  data: ArrayBuffer;
}

export interface RecBackend {
  list(): Promise<RecMeta[]>;
  get(id: string): Promise<RecTake | null>;
  put(t: RecTake): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface RecInput {
  blob: Blob;
  seconds: number;
  name?: string;
  emoji?: string;
}

export type RecVerdict =
  | { saved: true; meta: RecMeta }
  | { saved: false; reason: 'too-short' | 'empty' | 'error' }
  /** Đầy: `oldest` = các bản cũ nhất phải xoá để có chỗ (rỗng nếu bản này lớn hơn cả kho) */
  | { saved: false; reason: 'full'; oldest: RecMeta[] };

const errMsg = (e: unknown) => (e instanceof Error ? e.message || e.name : String(e));

/** Tên mặc định kế tiếp: "Bản ghi N" với N = (số lớn nhất trong các tên "Bản ghi k" đang có, hoặc số bản) + 1. */
export function nextDefaultName(metas: readonly Pick<RecMeta, 'name'>[]): string {
  const re = new RegExp(`^${REC_DEFAULT_PREFIX}\\s+(\\d+)$`, 'u');
  let n = 0;
  for (const m of metas) {
    const k = re.exec(m.name.trim());
    if (k) n = Math.max(n, Number(k[1]));
  }
  return `${REC_DEFAULT_PREFIX} ${Math.max(n, 0) + 1}`;
}

/** Làm sạch tên bé gõ: bỏ xuống dòng / khoảng trắng thừa, cắt REC_NAME_MAX; rỗng → tên mặc định. */
export function cleanName(name: string | undefined, fallback: string): string {
  const t = (name ?? '').replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? [...t].slice(0, REC_NAME_MAX).join('') : fallback;
}

/**
 * Các bản CŨ NHẤT cần xoá để thêm một bản `size` byte mà không vượt giới hạn số bản / dung lượng (thuần — có test).
 * [] = còn chỗ. null = không thể (bản này lớn hơn cả kho).
 */
export function oldestToFree(metas: readonly RecMeta[], size: number, maxCount = REC_MAX_COUNT, maxBytes = REC_MAX_BYTES): RecMeta[] | null {
  if (size > maxBytes) return null;
  const sorted = [...metas].sort((a, b) => a.savedAt - b.savedAt);
  let count = sorted.length;
  let used = sorted.reduce((s, m) => s + (m.size || 0), 0);
  const out: RecMeta[] = [];
  for (const m of sorted) {
    if (count + 1 <= maxCount && used + size <= maxBytes) break;
    out.push(m);
    count--;
    used -= m.size || 0;
  }
  return count + 1 <= maxCount && used + size <= maxBytes ? out : null;
}

/** Đuôi tệp theo mime (iPad: .m4a). */
export function recExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  return 'm4a';
}

/** Tên tệp để chia sẻ: "Bản ghi 1 - 25-10-2026.m4a" (bỏ ký tự cấm trong tên tệp). */
export function recFileName(m: Pick<RecMeta, 'name' | 'savedAt' | 'mime'>): string {
  const d = new Date(m.savedAt);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const name = m.name.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || REC_DEFAULT_PREFIX;
  return `${name} - ${dd}-${mm}-${d.getFullYear()}.${recExt(m.mime)}`;
}

/** Logic "Bản ghi của con" trên một backend bất kỳ. Không bao giờ ném lỗi ra ngoài. */
export class RecordingsStore {
  lastError: string | null = null;
  private seq = 0;

  constructor(
    private readonly backend: RecBackend,
    readonly opts: { maxCount?: number; maxBytes?: number; now?: () => number; temporary?: boolean } = {},
  ) {}

  get maxCount(): number {
    return this.opts.maxCount ?? REC_MAX_COUNT;
  }
  get maxBytes(): number {
    return this.opts.maxBytes ?? REC_MAX_BYTES;
  }
  /** Kho tạm (khách chơi / không có IndexedDB): mất khi tắt app / thoát khách. */
  get temporary(): boolean {
    return !!this.opts.temporary;
  }
  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** Các bản ghi, MỚI NHẤT trước ([] nếu lỗi). */
  async list(): Promise<RecMeta[]> {
    try {
      return [...(await this.backend.list())].sort((a, b) => b.savedAt - a.savedAt);
    } catch (e) {
      this.lastError = errMsg(e);
      return [];
    }
  }

  async get(id: string): Promise<RecTake | null> {
    try {
      return await this.backend.get(id);
    } catch (e) {
      this.lastError = errMsg(e);
      return null;
    }
  }

  async usage(): Promise<{ count: number; bytes: number }> {
    const l = await this.list();
    return { count: l.length, bytes: l.reduce((s, m) => s + (m.size || 0), 0) };
  }

  /** Tên mặc định cho bản ghi kế tiếp. */
  async defaultName(): Promise<string> {
    return nextDefaultName(await this.list());
  }

  /** Lưu một bản ghi. Đầy → { reason: 'full', oldest } (không tự xoá gì). */
  async save(c: RecInput): Promise<RecVerdict> {
    return this.saveInner(c, []);
  }

  /** Xoá đúng các bản `freeIds` (bé đã đồng ý) rồi lưu. Xoá xong vẫn chưa đủ chỗ → 'full' như save(). */
  async saveFreeing(c: RecInput, freeIds: readonly string[]): Promise<RecVerdict> {
    return this.saveInner(c, freeIds);
  }

  private async saveInner(c: RecInput, freeIds: readonly string[]): Promise<RecVerdict> {
    if (!(c.seconds >= REC_MIN_SECONDS)) return { saved: false, reason: 'too-short' };
    if (!c.blob || c.blob.size <= 0) return { saved: false, reason: 'empty' };
    try {
      let metas = await this.backend.list();
      if (freeIds.length) {
        for (const id of freeIds) await this.backend.remove(id);
        metas = metas.filter((m) => !freeIds.includes(m.id));
      }
      const need = oldestToFree(metas, c.blob.size, this.maxCount, this.maxBytes);
      if (need === null || need.length) return { saved: false, reason: 'full', oldest: need ?? [] };
      const data = await c.blob.arrayBuffer();
      const savedAt = this.now();
      const meta: RecMeta = {
        id: `r${savedAt.toString(36)}-${(this.seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
        name: cleanName(c.name, nextDefaultName(metas)),
        emoji: c.emoji && c.emoji.length <= 8 ? c.emoji : REC_EMOJIS[0],
        savedAt,
        seconds: Math.round(Math.min(REC_MAX_SECONDS, c.seconds) * 10) / 10,
        mime: c.blob.type || 'audio/mp4',
        size: data.byteLength,
      };
      await this.backend.put({ ...meta, data });
      this.lastError = null;
      return { saved: true, meta };
    } catch (e) {
      this.lastError = errMsg(e);
      return { saved: false, reason: 'error' };
    }
  }

  /** Đổi tên / emoji. */
  async rename(id: string, name: string, emoji?: string): Promise<boolean> {
    try {
      const t = await this.backend.get(id);
      if (!t) return false;
      await this.backend.put({ ...t, name: cleanName(name, t.name), ...(emoji ? { emoji } : {}) });
      return true;
    } catch (e) {
      this.lastError = errMsg(e);
      return false;
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      await this.backend.remove(id);
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

/** Backend trong bộ nhớ (khách chơi, không có IndexedDB, test). */
export function memoryRecBackend(): RecBackend & { takes: Map<string, RecTake> } {
  const takes = new Map<string, RecTake>();
  return {
    takes,
    list: async () => [...takes.values()].map(recMetaOf),
    get: async (id) => takes.get(id) ?? null,
    put: async (t) => void takes.set(t.id, t),
    remove: async (id) => void takes.delete(id),
    clear: async () => takes.clear(),
  };
}

/** Phần thông tin (bỏ dữ liệu âm thanh). */
export function recMetaOf(t: RecTake): RecMeta {
  const { data: _d, ...m } = t;
  return m;
}

const DB_NAME = 'piano-be-9-recordings';
const DB_VERSION = 1;
const CLIPS = 'clips';
/** Kho thông tin riêng: danh sách chỉ đọc kho này, không nạp cả chục MB âm thanh (giống albumStore v2). */
const META = 'meta';

function isRecTake(v: unknown): v is RecTake {
  return !!v && typeof v === 'object' && typeof (v as RecTake).id === 'string' && (v as RecTake).data instanceof ArrayBuffer;
}
function isRecMeta(v: unknown): v is RecMeta {
  return !!v && typeof v === 'object' && typeof (v as RecMeta).id === 'string' && typeof (v as RecMeta).size === 'number';
}

/** IndexedDB thật. null nếu trình duyệt không có (hoặc bị chặn). */
export function idbRecBackend(idb: IDBFactory | undefined = globalThis.indexedDB): RecBackend | null {
  try {
    if (!idb || typeof idb.open !== 'function') return null;
  } catch {
    return null;
  }
  let dbp: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      const rq = idb.open(DB_NAME, DB_VERSION);
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
        // Safari có thể ngắt kết nối khi app nằm nền lâu → bỏ kết nối cũ, lần sau mở mới
        dbp = null;
        throw e;
      });
  return {
    list: () =>
      run<RecMeta[]>([META], 'readonly', (tx, done) => {
        done([]);
        const rq = tx.objectStore(META).getAll();
        rq.onsuccess = () => done((rq.result as unknown[]).filter(isRecMeta).map((m) => ({ ...m })));
      }),
    get: (id) =>
      run<RecTake | null>([CLIPS], 'readonly', (tx, done) => {
        done(null);
        const rq = tx.objectStore(CLIPS).get(id);
        rq.onsuccess = () => done(isRecTake(rq.result) ? rq.result : null);
      }),
    put: (t) =>
      run<void>([CLIPS, META], 'readwrite', (tx) => {
        tx.objectStore(CLIPS).put(t);
        tx.objectStore(META).put(recMetaOf(t));
      }),
    remove: (id) =>
      run<void>([CLIPS, META], 'readwrite', (tx) => {
        tx.objectStore(CLIPS).delete(id);
        tx.objectStore(META).delete(id);
      }),
    clear: () =>
      run<void>([CLIPS, META], 'readwrite', (tx) => {
        tx.objectStore(CLIPS).clear();
        tx.objectStore(META).clear();
      }),
  };
}

let shared: RecordingsStore | undefined;
/** Kho bản ghi của bé (IndexedDB; không có thì kho tạm trong bộ nhớ — `temporary`). */
export function recordingsStore(): RecordingsStore {
  if (!shared) {
    let b: RecBackend | null = null;
    try {
      b = idbRecBackend();
    } catch {
      b = null;
    }
    shared = b ? new RecordingsStore(b) : new RecordingsStore(memoryRecBackend(), { temporary: true });
  }
  return shared;
}

let guest: RecordingsStore | null = null;
/** 👤 Kho TẠM của khách chơi (bộ nhớ) — xoá khi thoát chế độ khách. */
export function guestRecordings(): RecordingsStore {
  return (guest ??= new RecordingsStore(memoryRecBackend(), { temporary: true }));
}
/** Thoát / vào chế độ khách: bỏ hết bản ghi tạm của khách. */
export function clearGuestRecordings(): void {
  guest = null;
}
/** Kho đúng cho người đang dùng: khách → kho tạm; bé → kho của bé. */
export function recordingsFor(isGuest: boolean): RecordingsStore {
  return isGuest ? guestRecordings() : recordingsStore();
}
