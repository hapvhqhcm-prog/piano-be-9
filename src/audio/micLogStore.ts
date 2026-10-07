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
