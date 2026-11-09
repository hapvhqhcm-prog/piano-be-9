/**
 * (+ 2026-11-09) Kho các lần bé báo "🙉 App nghe sai" — CHỈ trên iPad này (IndexedDB riêng 'piano-be-9-micclaims').
 * Mỗi lần: đoạn tiếng micro 4 giây (WAV 24 kHz, ≈ 190 KB) + bối cảnh (nốt cần đàn, micro nghe ra gì, mức tiếng, độ nhạy…).
 * Tối đa CLAIMS_MAX lần (đầy → bỏ lần cũ nhất). Không vào bản sao lưu. Bố mẹ gửi ở ⚙️ Cài đặt (micClaimShare.ts).
 * Không có IndexedDB / bị chặn → mọi hàm trả về rỗng / false, không ném lỗi.
 */
export const CLAIMS_MAX = 20;
const DB = 'piano-be-9-micclaims';
const STORE = 'claims';

export interface MicClaimRecord {
  id: string;
  /** ms */
  at: number;
  /** Màn nào: 'song-wait' | 'practice' … */
  where: string;
  songId?: string;
  /** Bối cảnh chẩn đoán (JSON thuần) */
  info: Record<string, unknown>;
  /** Tệp WAV */
  wav: ArrayBuffer;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => {
        if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(null);
      rq.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function all(db: IDBDatabase): Promise<MicClaimRecord[]> {
  return new Promise((resolve) => {
    try {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      rq.onsuccess = () => resolve(((rq.result ?? []) as MicClaimRecord[]).sort((a, b) => a.at - b.at));
      rq.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** Lưu một lần báo (đầy → xóa lần cũ nhất). true = đã lưu. */
export async function addClaim(r: MicClaimRecord): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  try {
    const old = await all(db);
    const drop = old.slice(0, Math.max(0, old.length - (CLAIMS_MAX - 1)));
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      for (const d of drop) st.delete(d.id);
      st.put(r);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  } finally {
    db.close();
  }
}

/** Mọi lần báo (cũ → mới). */
export async function listClaims(): Promise<MicClaimRecord[]> {
  const db = await open();
  if (!db) return [];
  try {
    return await all(db);
  } finally {
    db.close();
  }
}

/** Xóa hết. */
export async function clearClaims(): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  try {
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  } finally {
    db.close();
  }
}
