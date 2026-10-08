/**
 * Nhật ký micro GẦN NHẤT (từ màn "🎤 Cài micro") — giữ lại để màn "🩺 Kiểm tra iPad" đính kèm khi gửi người hỗ trợ.
 * Khóa riêng trong localStorage (không nằm trong dữ liệu học của bé, không vào bản sao lưu). Chỉ số đo kỹ thuật.
 * Mọi thao tác bọc try/catch (localStorage có thể bị chặn / đầy).
 */
export const MIC_LOG_KEY = 'piano-be-9:mic-log';
/** Giữ tối đa bấy nhiêu nốt "đàn tự do" khi lưu (cho gọn). */
const KEEP_FREE_NOTES = 30;

type KV = Pick<Storage, 'getItem' | 'setItem'>;

function kv(): KV | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveMicLog(log: Record<string, unknown>, store: KV | null = kv()): void {
  if (!store) return;
  try {
    const free = log.free as { notes?: unknown[] } | undefined;
    const slim = free?.notes && free.notes.length > KEEP_FREE_NOTES ? { ...log, free: { ...free, notes: free.notes.slice(-KEEP_FREE_NOTES) } } : log;
    store.setItem(MIC_LOG_KEY, JSON.stringify(slim));
  } catch {
    /* đầy / bị chặn — bỏ qua */
  }
}

export function loadMicLog(store: KV | null = kv()): Record<string, unknown> | null {
  if (!store) return null;
  try {
    const raw = store.getItem(MIC_LOG_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Nhật ký "micro tự tăng độ nhạy" trong buổi học (micAutoSens.ts) — vài lần gần nhất, cho phụ huynh / người hỗ trợ xem. */
export const MIC_AUTO_KEY = 'piano-be-9:mic-auto';
const KEEP_AUTO = 5;

export interface AutoSensEntry {
  at: string;
  from: string;
  to: string;
  heard: number;
  missed: number;
}

export function saveAutoSens(e: AutoSensEntry, store: KV | null = kv()): void {
  if (!store) return;
  try {
    store.setItem(MIC_AUTO_KEY, JSON.stringify([...loadAutoSens(store), e].slice(-KEEP_AUTO)));
  } catch {
    /* đầy / bị chặn — bỏ qua */
  }
}

export function loadAutoSens(store: KV | null = kv()): AutoSensEntry[] {
  if (!store) return [];
  try {
    const v = JSON.parse(store.getItem(MIC_AUTO_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is AutoSensEntry => !!x && typeof x === 'object' && typeof (x as AutoSensEntry).to === 'string') : [];
  } catch {
    return [];
  }
}
