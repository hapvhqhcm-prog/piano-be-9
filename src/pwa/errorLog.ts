/**
 * (+ 2026-10-08) NHẬT KÝ LỖI nhỏ, cuộn vòng (chỉ trên iPad này, không gửi đi đâu).
 *
 * Lỗi JS trên iPad thật trước đây biến mất không dấu vết (không ai mở được bảng Web Inspector). Giờ:
 * - window.onerror + unhandledrejection + lỗi khi vẽ màn (App.show) → ghi vào localStorage, giữ ERROR_LOG_MAX dòng
 *   mới nhất (tin nhắn / stack đã cắt ngắn, kèm bản app, màn đang mở, thời điểm).
 * - Màn 🩺 Kiểm tra iPad đưa các dòng này vào bản kết quả bố mẹ sao chép / gửi người hỗ trợ.
 * Mọi hàm ở đây KHÔNG BAO GIỜ ném lỗi (ghi lỗi mà lại gây lỗi thì tệ hơn).
 */
import { APP_VERSION } from './updater';

/** Khóa riêng — KHÔNG bắt đầu bằng "piano-be-9:" (khóa đó dành cho bản cất corrupt-* / archived-*). */
export const ERROR_LOG_KEY = 'piano-be-9-errors';
export const ERROR_LOG_MAX = 20;
const MSG_MAX = 300;
const STACK_MAX = 800;

export interface ErrorEntry {
  /** Thời điểm (ms) */
  t: number;
  /** 'error' | 'rejection' | 'screen' | … */
  kind: string;
  msg: string;
  stack?: string;
  /** Bản app */
  v: string;
  /** Màn đang mở (class của màn) */
  screen?: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let screenProbe: (() => string | undefined) | null = null;
/** App cho biết màn đang mở (để ghi kèm lỗi). */
export function setScreenProbe(fn: (() => string | undefined) | null): void {
  screenProbe = fn;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Lỗi bất kỳ → { msg, stack } ngắn gọn. */
export function describeError(e: unknown): { msg: string; stack?: string } {
  try {
    if (e instanceof Error) {
      const msg = cut(`${e.name && e.name !== 'Error' ? `${e.name}: ` : ''}${e.message || ''}` || 'Error', MSG_MAX);
      return e.stack ? { msg, stack: cut(String(e.stack), STACK_MAX) } : { msg };
    }
    if (typeof e === 'string') return { msg: cut(e, MSG_MAX) };
    const o = e as { message?: unknown; name?: unknown } | null;
    if (o && typeof o.message === 'string') return { msg: cut(`${typeof o.name === 'string' ? `${o.name}: ` : ''}${o.message}`, MSG_MAX) };
    return { msg: cut(String(e), MSG_MAX) };
  } catch {
    return { msg: 'unknown error' };
  }
}

/** Các dòng đã ghi (cũ → mới). Hỏng / không có → []. */
export function readErrors(store: Store | null = defaultStore()): ErrorEntry[] {
  try {
    const raw = store?.getItem(ERROR_LOG_KEY);
    if (!raw) return [];
    const a = JSON.parse(raw) as unknown;
    return Array.isArray(a) ? (a.filter((x) => x && typeof x === 'object' && typeof (x as ErrorEntry).msg === 'string') as ErrorEntry[]) : [];
  } catch {
    return [];
  }
}

/** Ghi một lỗi (giữ ERROR_LOG_MAX dòng mới nhất). Không bao giờ ném lỗi. */
export function logError(kind: string, e: unknown, store: Store | null = defaultStore(), now: () => number = Date.now): void {
  try {
    const d = describeError(e);
    let screen: string | undefined;
    try {
      screen = screenProbe?.() || undefined;
    } catch {
      screen = undefined;
    }
    const entry: ErrorEntry = { t: now(), kind, msg: d.msg, v: APP_VERSION, ...(d.stack ? { stack: d.stack } : {}), ...(screen ? { screen: cut(screen, 60) } : {}) };
    const list = [...readErrors(store), entry].slice(-ERROR_LOG_MAX);
    try {
      store?.setItem(ERROR_LOG_KEY, JSON.stringify(list));
    } catch {
      // Bộ nhớ đầy → giữ ít dòng hơn (bỏ stack); vẫn không được thì thôi
      try {
        store?.setItem(ERROR_LOG_KEY, JSON.stringify(list.slice(-5).map(({ stack: _s, ...x }) => x)));
      } catch {
        /* bỏ qua */
      }
    }
  } catch {
    /* không bao giờ ném lỗi */
  }
}

/** Xóa nhật ký lỗi (màn 🩺). */
export function clearErrors(store: Pick<Storage, 'removeItem'> | null = defaultStore()): void {
  try {
    store?.removeItem(ERROR_LOG_KEY);
  } catch {
    /* bỏ qua */
  }
}

let installed = false;
/** Bắt mọi lỗi chưa xử lý (gọi một lần trong main.ts). */
export function installErrorCapture(win: Pick<Window, 'addEventListener'> = window): void {
  if (installed) return;
  installed = true;
  try {
    win.addEventListener('error', (ev: Event) => {
      const e = ev as ErrorEvent;
      // Lỗi nạp tài nguyên (<img>, <script>) không có message → bỏ qua cho gọn
      if (!e.message && !e.error) return;
      logError('error', e.error ?? `${e.message} (${e.filename ?? ''}:${e.lineno ?? 0})`);
    });
    win.addEventListener('unhandledrejection', (ev: Event) => {
      logError('rejection', (ev as PromiseRejectionEvent).reason);
    });
  } catch {
    /* bỏ qua */
  }
}
