/**
 * NẠP MUỘN (code-splitting) cho các màn ít dùng / nặng — giữ đường Bắt đầu → Màn chính → Buổi học nhẹ trên iPad cũ.
 *
 * - Mỗi `lazy(() => import('./x'))` là MỘT chunk riêng; service worker precache mọi chunk (vite.config.ts) → offline vẫn chạy.
 * - Đã nạp xong → dùng NGAY, đồng bộ (vẫn trong thao tác chạm: iOS cần cho âm thanh / micro / giọng đọc).
 * - Chưa nạp: > 150 ms mới hiện "Đang mở…" (không nhấp nháy khi nhanh); lỗi (mất mạng lúc chưa cache…) → báo + thử lại.
 */
import type { Screen } from './App';
import { button, h, toast } from './components/dom';
import '../styles/lazy.css';

const SHOW_AFTER_MS = 150;

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
          cleanup = make(m)(root);
        },
        (e: unknown) => {
          hide();
          if (!alive) return;
          console.warn('lazy screen', e);
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
      toast('Chưa mở được — thử lại nhé.');
    },
  );
}
