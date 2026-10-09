/**
 * Kho khóa–giá trị (localStorage) của ProgressStore: giao diện tối thiểu, bản trong bộ nhớ (test), khóa / giới hạn,
 * lỗi "hết chỗ", tình trạng lưu trữ (StorageStatus) cho giao diện. Hàm thuần — không giữ trạng thái.
 */

/** Giao diện tối thiểu của localStorage — tiêm vào để test không cần DOM. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Liệt kê khóa (localStorage có sẵn qua length/key) — để tìm bản sao lưu "corrupt-*" */
  readonly length?: number;
  key?(index: number): string | null;
}

export const STORAGE_KEY = 'piano-be-9';
/**
 * Giữ tối đa bao nhiêu bản "archived-*" (2026-10-06: 3 → 1 — rà soát độ bền: 3 bản đầy đủ làm localStorage ~5 MB
 * đầy sau ~1,3 năm). Bản cất là dữ liệu ĐÃ GỘP (compaction.ts) nên nhỏ.
 */
export const MAX_ARCHIVES = 1;
/**
 * (+ 2026-10-08) Giữ tối đa bao nhiêu bản "corrupt-*" KHÔNG đọc được. Mỗi lần mở app mà dữ liệu chính hỏng lại thêm
 * một bản → không dọn thì localStorage đầy dần. Giữ bản mới nhất (chờ bản sửa lỗi sau), bỏ các bản cũ hơn.
 */
export const MAX_UNREADABLE_CORRUPT = 1;
/** Ước lượng dung lượng localStorage của Safari theo KÝ TỰ (~5 MiB, mỗi ký tự UTF-16 = 2 byte). */
export const QUOTA_ESTIMATE_CHARS = 2_621_440;
/** Lời báo khi dữ liệu do bản app MỚI HƠN ghi (không đặt lại, không ghi đè — chờ cập nhật app). */
export const FUTURE_VERSION_MESSAGE = 'Dữ liệu từ phiên bản mới hơn — hãy cập nhật app';
/** Lời báo khi hết chỗ lưu (giao diện hiện băng chặn). */
export const STORAGE_FULL_MESSAGE = 'Bộ nhớ của iPad cho app đã đầy — tiến độ mới CHƯA được lưu. Hãy sao lưu (xuất JSON) rồi báo người cài app.';

/** Tình trạng lưu trữ — giao diện hiện băng cảnh báo khi !ok hoặc futureVersion. */
export interface StorageStatus {
  /** Lần ghi gần nhất thành công (và không ở chế độ "dữ liệu mới hơn") */
  ok: boolean;
  /** Tổng số ký tự (khóa + giá trị) trong localStorage của app */
  usedChars: number;
  /** Ước lượng giới hạn (ký tự) — QUOTA_ESTIMATE_CHARS */
  quotaEstimate: number;
  /** Lỗi ghi gần nhất (null = không lỗi) */
  lastError: string | null;
  /** Hết chỗ: đã gộp lịch sử + bỏ bản cất mà vẫn không ghi được → giao diện phải hiện băng CHẶN */
  full: boolean;
  /** Dữ liệu trong máy do bản app mới hơn ghi → giữ nguyên, không ghi gì; hiện FUTURE_VERSION_MESSAGE */
  futureVersion: boolean;
  /** Còn thay đổi chưa ghi xuống (đang chờ debounce) */
  pending: boolean;
  /** usedChars × 2 (UTF-16) / quotaEstimate × 2 / phần trăm đã dùng — cho dòng "Bộ nhớ dữ liệu" ở màn phụ huynh */
  usedBytes: number;
  quotaBytes: number;
  percent: number;
  /** Một câu cho phụ huynh: dung lượng, hoặc lời báo hết chỗ / dữ liệu bản mới hơn */
  text: string;
}

const sizeText = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export function makeStatus(s: Omit<StorageStatus, 'usedBytes' | 'quotaBytes' | 'percent' | 'text'>): StorageStatus {
  const usedBytes = s.usedChars * 2;
  const quotaBytes = s.quotaEstimate * 2;
  const percent = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));
  const text = s.futureVersion
    ? FUTURE_VERSION_MESSAGE
    : s.full
      ? STORAGE_FULL_MESSAGE
      : s.lastError
        ? `Lỗi lưu dữ liệu: ${s.lastError}`
        : `Bộ nhớ dữ liệu: ${sizeText(usedBytes)} / ${sizeText(quotaBytes)} (${percent}%)`;
  return { ...s, usedBytes, quotaBytes, percent, text };
}

/** Tổng số ký tự (khóa + giá trị) app đang dùng trong kho */
export function usedChars(kv: KeyValueStorage): number {
  let used = 0;
  const n = kv.length ?? 0;
  for (let i = 0; i < n; i++) {
    const k = kv.key?.(i);
    if (!k) continue;
    try {
      used += k.length + (kv.getItem(k)?.length ?? 0);
    } catch {
      /* bỏ qua */
    }
  }
  if (!n) used = (kv.getItem(STORAGE_KEY)?.length ?? 0) + STORAGE_KEY.length;
  return used;
}

export class MemoryStorage implements KeyValueStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** Lỗi "hết chỗ" của localStorage (Safari: QuotaExceededError, mã 22; Firefox: 1014). */
export function isQuotaError(e: unknown): boolean {
  const x = e as { name?: string; code?: number } | null;
  return !!x && (x.name === 'QuotaExceededError' || x.name === 'NS_ERROR_DOM_QUOTA_REACHED' || x.code === 22 || x.code === 1014);
}

export const errText = (e: unknown) => (e instanceof Error ? e.message || e.name : String(e));
