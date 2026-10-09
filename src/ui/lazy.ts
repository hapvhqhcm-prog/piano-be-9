/**
 * NẠP MUỘN (code-splitting) cho các màn ít dùng / nặng — giữ đường Bắt đầu → Màn chính → Buổi học nhẹ trên iPad cũ.
 *
 * - Mỗi `lazy(() => import('./x'))` là MỘT chunk riêng; service worker precache mọi chunk (vite.config.ts) → offline vẫn chạy.
 * - Đã nạp xong → dùng NGAY, đồng bộ (vẫn trong thao tác chạm: iOS cần cho âm thanh / micro / giọng đọc).
 * - Chưa nạp: > 150 ms mới hiện "Đang mở…" (không nhấp nháy khi nhanh); lỗi (mất mạng lúc chưa cache…) → báo + thử lại.
 */
import type { Screen } from './App';
import { button, h, toast } from './components/dom';
import { isAtSafePoint } from '../pwa/updater';
import { logError } from '../pwa/errorLog';
import '../styles/lazy.css';

const SHOW_AFTER_MS = 150;

/**
 * (+ 2026-10-08) Nạp chunk lỗi ngay sau khi app cập nhật (trang còn chạy mã cũ, chunk cũ không còn) → tải lại trang
 * MỘT lần để chạy bản mới. Cờ + thời điểm trong sessionStorage chặn vòng lặp tải lại (lỗi thật / mất mạng).
 */
export const LAZY_RELOAD_KEY = 'piano-be-9-lazy-reload';
/** Trong ngần này ms kể từ lần tải lại trước → không tải lại nữa (hiện lỗi như cũ). */
export const LAZY_RELOAD_WINDOW_MS = 120_000;
/** Chờ chút để bé kịp đọc "Đang cập nhật app…" */
const RELOAD_DELAY_MS = 900;

export interface ReloadEnv {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => number;
  reload?: () => void;
  notify?: (text: string) => void;
  delayMs?: number;
}

/** Tải lại trang một lần (có chặn vòng lặp). Trả về true nếu sẽ tải lại. Không bao giờ ném lỗi. */
export function reloadOnceForUpdate(env: ReloadEnv = {}): boolean {
  try {
    const storage = env.storage !== undefined ? env.storage : globalThis.sessionStorage;
    if (!storage) return false; // không chặn được vòng lặp → không tự tải lại
    const now = (env.now ?? Date.now)();
    const last = Number(storage.getItem(LAZY_RELOAD_KEY));
    if (last && now - last >= 0 && now - last < LAZY_RELOAD_WINDOW_MS) return false;
    storage.setItem(LAZY_RELOAD_KEY, String(now));
    (env.notify ?? ((t: string) => toast(t, 3000)))('Đang cập nhật app…');
    const reload = env.reload ?? (() => window.location.reload());
    setTimeout(reload, env.delayMs ?? RELOAD_DELAY_MS);
    return true;
  } catch {
    return false;
  }
}

export interface LazyModule<T> {
  /** Module đã nạp (undefined = chưa) */
  readonly loaded: T | undefined;
  load(): Promise<T>;
  /** Nạp ngầm, bỏ qua lỗi */
  prefetch(): void;
}

export function lazy<T>(importer: () => Promise<T>): LazyModule<T> {
  let value: T | undefined;
  let pending: Promise<T> | null = null;
  const mod: LazyModule<T> = {
    get loaded() {
      return value;
    },
    load() {
      pending ??= importer().then(
        (m) => (value = m),
        (e: unknown) => {
          pending = null; // lần sau thử lại
          throw e;
        },
      );
      return pending;
    },
    prefetch() {
      if (value === undefined) mod.load().catch(() => undefined);
    },
  };
  return mod;
}

/** Nạp ngầm sau khi màn hiện tại đã vẽ xong và máy rảnh (Safari 15 chưa có requestIdleCallback). */
export function prefetchLater(mods: ReadonlyArray<LazyModule<unknown>>, delayMs = 1200): void {
  if (mods.every((m) => m.loaded !== undefined)) return;
  window.setTimeout(() => {
    for (const m of mods) m.prefetch();
  }, delayMs);
}

/** Vòng "Đang mở…" nhỏ — chỉ hiện nếu chờ quá SHOW_AFTER_MS. Trả về hàm gỡ. */
function spinner(parent: HTMLElement, overlay: boolean): () => void {
  let el: HTMLElement | null = null;
  const t = window.setTimeout(() => {
    el = h(
      'div',
      { class: overlay ? 'lazy-loading lazy-overlay' : 'lazy-loading', role: 'status', 'aria-live': 'polite' },
      h('span', { class: 'lazy-dot', 'aria-hidden': 'true' }),
      'Đang mở…',
    );
    parent.append(el);
  }, SHOW_AFTER_MS);
  return () => {
    window.clearTimeout(t);
    el?.remove();
    el = null;
  };
}

/** Một màn nằm trong chunk riêng. `make` nhận module đã nạp, trả về Screen như thường. */
export function lazyScreen<T>(mod: LazyModule<T>, make: (m: T) => Screen): Screen {
  return (root) => {
    const ready = mod.loaded;
    if (ready !== undefined) return make(ready)(root);
    let alive = true;
    let cleanup: (() => void) | void;
    let hide = (): void => undefined;
    const attempt = (): void => {
      hide = spinner(root, false);
      mod.load().then(
        (m) => {
          hide();
          if (!alive) return;
          try {
            cleanup = make(m)(root);
          } catch (e) {
            // (rà soát 2026-10-09) Màn nạp muộn lỗi khi vẽ: App.show không bắt được (đã ra ngoài try của nó) → trước đây
            // màn trắng không nút. Giờ ghi nhật ký + hộp có nút mở lại app.
            console.error('lazy screen render', e);
            logError('screen', e);
            root.replaceChildren(
              h(
                'div',
                { class: 'lazy-loading lazy-error', role: 'alert' },
                h('p', {}, '🙈 Ối, có trục trặc nhỏ. Tiến độ của con vẫn được giữ.'),
                button({ icon: '↻', label: 'Mở lại app', kind: 'primary', onTap: () => window.location.reload() }),
              ),
            );
          }
        },
        (e: unknown) => {
          hide();
          if (!alive) return;
          console.warn('lazy screen', e);
          // Chỉ tự tải lại ở điểm an toàn (như withLazy): màn nạp muộn GIỮA buổi học (hát, ứng tấu, sân khấu…) mà tải lại
          // trang thì mất buổi đang học → hiện hộp "Thử lại" thay vào đó.
          if (isAtSafePoint() && reloadOnceForUpdate()) return;
          const box = h(
            'div',
            { class: 'lazy-loading lazy-error' },
            h('p', {}, 'Chưa mở được màn này.'),
            button({ icon: '↻', label: 'Thử lại', kind: 'primary', onTap: () => (box.remove(), attempt()) }),
            button({ label: 'Mở lại app', onTap: () => window.location.reload() }),
          );
          root.append(box);
        },
      );
    };
    attempt();
    return () => {
      alive = false;
      hide(); // rời màn khi đang chờ → "Đang mở…" không được hiện đè lên màn sau
      if (typeof cleanup === 'function') cleanup();
    };
  };
}

let busy = false;
/**
 * Chạy `use` với module đã nạp. Đã có sẵn → chạy ngay (đồng bộ). Chưa có → giữ màn hiện tại, hiện "Đang mở…" nếu lâu;
 * chạm thêm trong lúc chờ bị bỏ qua (không mở 2 lần).
 */
export function withLazy<T>(mod: LazyModule<T>, use: (m: T) => void): void {
  const ready = mod.loaded;
  if (ready !== undefined) {
    use(ready);
    return;
  }
  if (busy) return;
  busy = true;
  const hide = spinner(document.body, true);
  mod.load().then(
    (m) => {
      hide();
      busy = false;
      use(m);
    },
    (e: unknown) => {
      hide();
      busy = false;
      console.warn('lazy', e);
      // Chỉ tự tải lại khi ở điểm an toàn (màn chính…) — giữa buổi học thì không làm mất màn hiện tại
      if (isAtSafePoint() && reloadOnceForUpdate()) return;
      toast('Chưa mở được — thử lại nhé.');
    },
  );
}
