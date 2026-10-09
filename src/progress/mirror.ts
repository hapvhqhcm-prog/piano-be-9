/**
 * (+ 2026-10-08) BẢN SAO THỨ HAI của tiến độ trong IndexedDB.
 *
 * Tiến độ chính vẫn nằm trong localStorage (đồng bộ, đơn giản). Bản sao này chỉ để CỨU khi localStorage trống / hỏng
 * (vd khóa bị xóa riêng, dữ liệu ghi dở, localStorage bị chặn → app chạy bằng bộ nhớ tạm):
 * - Ghi ngầm sau mỗi lần localStorage ghi thành công (gộp lại — MIRROR_DEBOUNCE_MS), không bao giờ chặn giao diện,
 *   mọi lỗi bị nuốt. Trình duyệt không có IndexedDB → không làm gì.
 * - Lúc mở app (main.ts, TRƯỚC khi tạo ProgressStore): CHỈ khi dữ liệu chính trống / không đọc được mà bản sao có
 *   dữ liệu thật → chép bản sao vào localStorage (bản hỏng được cất sang "corrupt-*" như cũ). Dữ liệu chính đọc được
 *   (kể cả dữ liệu của bản app mới hơn) KHÔNG BAO GIỜ bị bản sao đè lên.
 * Safari xóa dữ liệu trang (7 ngày không mở) thì xóa cả hai — việc đó vẫn cần "Sao lưu" (backup.ts).
 */
import { isFutureData, migrate } from './migrations';
import { sessionCount } from './history';
import { validateAppData, type AppData } from './schema';
import { STORAGE_KEY, type KeyValueStorage } from './ProgressStore';

/** Gộp nhiều lần ghi thành một (ms). */
export const MIRROR_DEBOUNCE_MS = 1500;
/** Chờ IndexedDB tối đa bao lâu lúc mở app (không để bé kẹt ở màn trắng). */
export const MIRROR_READ_TIMEOUT_MS = 1500;

/** Lớp lưu trữ tối thiểu (IndexedDB thật, hoặc bộ nhớ trong test). */
export interface MirrorBackend {
  read(): Promise<string | null>;
  write(json: string): Promise<void>;
}

const DB_NAME = 'piano-be-9-mirror';
const STORE = 'kv';
const KEY = 'main';

/** IndexedDB thật. null nếu trình duyệt không có (hoặc bị chặn). */
export function idbBackend(idb: IDBFactory | undefined = globalThis.indexedDB): MirrorBackend | null {
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
        if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE);
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
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | null): Promise<T> =>
    open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(STORE, mode);
          const rq = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve((rq?.result ?? null) as T);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error('idb abort'));
        }),
    ).catch((e: unknown) => {
      // Safari có thể ngắt kết nối IndexedDB khi app nằm nền lâu ("Connection to Indexed Database server lost") —
      // kết nối cũ hỏng vĩnh viễn → bỏ để lần ghi sau mở kết nối mới (không thì bản sao im lặng ngừng ghi tới khi mở lại app)
      dbp = null;
      throw e;
    });
  return {
    read: () =>
      run<{ json?: unknown } | null>('readonly', (s) => s.get(KEY)).then((v) => (typeof v?.json === 'string' ? v.json : null)),
    write: (json) => run<void>('readwrite', (s) => s.put({ json, savedAt: Date.now() }, KEY)).then(() => undefined),
  };
}

/** Bộ ghi gộp (debounce) — giao cho ProgressStore (StoreOptions.mirror). Không bao giờ ném lỗi. */
export class SaveMirror {
  private pending: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Lần ghi gần nhất thành công (ms) / lỗi gần nhất — cho màn 🩺 */
  lastSavedAt = 0;
  lastError: string | null = null;

  constructor(
    private readonly backend: MirrorBackend,
    private readonly delayMs = MIRROR_DEBOUNCE_MS,
  ) {}

  save(json: string): void {
    this.pending = json;
    if (this.delayMs <= 0) return this.flush();
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  /** Ghi ngay bản đang chờ (trang sắp ẩn). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const json = this.pending;
    this.pending = null;
    if (json === null) return;
    try {
      this.backend.write(json).then(
        () => {
          this.lastSavedAt = Date.now();
          this.lastError = null;
        },
        (e: unknown) => {
          this.lastError = e instanceof Error ? e.message || e.name : String(e);
        },
      );
    } catch (e) {
      this.lastError = e instanceof Error ? e.message || e.name : String(e);
    }
  }
}

/** Dữ liệu đọc được (đã nâng cấp + hợp lệ) hay null. */
function readable(raw: string | null): AppData | null {
  if (!raw) return null;
  try {
    const d = migrate(JSON.parse(raw));
    return validateAppData(d).length === 0 ? d : null;
  } catch {
    return null;
  }
}

/** Chuỗi là dữ liệu của bản app mới hơn (không được coi là hỏng). */
function isFuture(raw: string | null): boolean {
  if (!raw) return false;
  try {
    return isFutureData(JSON.parse(raw));
  } catch {
    return false;
  }
}

/**
 * Kết quả khôi phục lúc mở app: 'restored' = đã chép bản sao vào localStorage; 'none' = không cần / bản sao không có gì;
 * 'unknown' = dữ liệu chính trống / hỏng mà KHÔNG đọc được bản sao (IndexedDB chậm quá thời gian chờ hoặc lỗi) —
 * bản sao có thể vẫn là bản tốt duy nhất → lần chạy này KHÔNG được ghi đè nó (main.ts không gắn SaveMirror).
 */
export type MirrorRestore = 'restored' | 'none' | 'unknown';

/**
 * Mở app: dữ liệu chính trống / hỏng mà bản sao IndexedDB có tiến độ thật → chép vào localStorage.
 * Trả về true nếu đã khôi phục. Không bao giờ ném lỗi; chờ IndexedDB tối đa `timeoutMs`.
 */
export async function restoreFromMirror(
  kv: KeyValueStorage,
  backend: MirrorBackend | null,
  opts: { now?: () => number; timeoutMs?: number } = {},
): Promise<boolean> {
  return (await restoreFromMirrorResult(kv, backend, opts)) === 'restored';
}

/** Như restoreFromMirror nhưng phân biệt "không đọc được bản sao" ('unknown') với "bản sao không có gì" ('none'). */
export async function restoreFromMirrorResult(
  kv: KeyValueStorage,
  backend: MirrorBackend | null,
  opts: { now?: () => number; timeoutMs?: number } = {},
): Promise<MirrorRestore> {
  if (!backend) return 'none';
  let raw: string | null;
  try {
    raw = kv.getItem(STORAGE_KEY);
  } catch {
    return 'none';
  }
  // Dữ liệu chính đọc được (hoặc của bản app mới hơn) → luôn thắng, không đọc bản sao
  if (readable(raw) || isFuture(raw)) return 'none';
  let copy: string | null = null;
  let answered = false; // IndexedDB đã trả lời (có / không có bản sao) — false = hết giờ chờ hoặc lỗi
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    copy = await Promise.race([
      backend.read().then(
        (v) => {
          answered = true;
          return v;
        },
        () => null,
      ),
      new Promise<null>((r) => (timer = setTimeout(() => r(null), opts.timeoutMs ?? MIRROR_READ_TIMEOUT_MS))),
    ]);
  } catch {
    copy = null;
  } finally {
    clearTimeout(timer);
  }
  if (!answered) return 'unknown';
  const d = readable(copy);
  if (!d || !copy || (sessionCount(d) === 0 && !d.learner.name)) return 'none';
  try {
    // Kiểm tra lại (tab khác có thể vừa ghi trong lúc chờ)
    const cur = kv.getItem(STORAGE_KEY);
    if (readable(cur) || isFuture(cur)) return 'none';
    if (cur) {
      try {
        kv.setItem(`${STORAGE_KEY}:corrupt-${(opts.now ?? Date.now)()}`, cur); // bản hỏng vẫn được cất như cũ
      } catch {
        /* hết chỗ cất bản hỏng — vẫn khôi phục (bản sao đọc được quý hơn) */
      }
    }
    kv.setItem(STORAGE_KEY, copy);
    return 'restored';
  } catch {
    return 'none';
  }
}
