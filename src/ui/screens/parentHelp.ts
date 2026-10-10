/**
 * (+ 2026-10-10) Màn Phụ huynh — phần "giúp bố mẹ biết app có gì":
 * - thẻ "🆕 Có gì mới" (src/pwa/changelog.ts) sau mỗi lần cập nhật — thu gọn được, "Đã xem" thì ẩn. CHỈ ở màn Phụ huynh;
 * - nút "📖 Hướng dẫn" ở đầu màn (làm nổi MỘT lần — settings.guideHintAt) → màn Hướng dẫn nhanh (parentGuide.ts, nạp muộn);
 * - cuộn tới một thẻ khi mở từ Hướng dẫn ("Mở ngay" → `data-guide`).
 */
import { LATEST_VERSION, whatsNew, type ChangelogEntry } from '../../pwa/changelog';
import { completedSessionCount } from '../../progress/history';
import type { AppData } from '../../progress/schema';
import type { App, Screen } from '../App';
import { button, h } from '../components/dom';
import { lazy, lazyScreen } from '../lazy';
import type { ParentCtx } from './parentShared';
import type { GuideAnchor } from './parentGuideData';
import '../../styles/parenthelp.css';

/** 📖 Hướng dẫn nhanh cho bố mẹ — chunk riêng */
export const parentGuideMod = lazy(() => import('./parentGuide'));
export const parentGuideScreen = (app: App): Screen => lazyScreen(parentGuideMod, (m) => m.parentGuideScreen(app));

/** Dữ liệu đã từng dùng (người dùng CŨ cập nhật lên) — khác với cài mới. */
export function hasHistory(d: Readonly<AppData>): boolean {
  return completedSessionCount(d) > 0 || d.settings.onboardedAt > 0 || d.sessions.length > 0;
}

/**
 * Gọi MỘT lần khi mở màn Phụ huynh: cài mới (chưa có lastSeenVersion, chưa học buổi nào) → ghi luôn bản hiện tại để
 * lần cập nhật sau mới hiện "Có gì mới". Trả về các bản cần hiện (rỗng = không hiện thẻ).
 */
export function syncWhatsNew(store: App['store']): ChangelogEntry[] {
  const d = store.get();
  const wn = whatsNew(d.settings.lastSeenVersion, hasHistory(d));
  if (wn.kind === 'first-install') store.updateSettings({ lastSeenVersion: LATEST_VERSION });
  return wn.entries;
}

const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function entryBlock(e: ChangelogEntry, tag: 'h3' | 'h4' = 'h3'): HTMLElement {
  return h(
    'div',
    { class: 'wn-entry' },
    h(tag, {}, `Bản ${e.version} · ${fmtDay(e.date)}`),
    h('ul', {}, ...e.items.map((x) => h('li', {}, x))),
  );
}

/**
 * Thẻ "🆕 Có gì mới". `ui.open` giữ trạng thái thu gọn qua các lần vẽ lại màn. Không còn gì mới → null.
 */
export function whatsNewCard(c: ParentCtx, d: Readonly<AppData>, ui: { open: boolean }, onGuide: () => void): HTMLElement | null {
  const wn = whatsNew(d.settings.lastSeenVersion, hasHistory(d));
  if (wn.kind !== 'update') return null;
  const [latest, ...older] = wn.entries;
  const toggle = h(
    'button',
    { type: 'button', class: 'wn-toggle', 'aria-expanded': String(ui.open) },
    ui.open ? 'Thu gọn ▴' : 'Xem ▾',
  );
  toggle.addEventListener('click', () => {
    ui.open = !ui.open;
    c.render();
  });
  const span =
    wn.entries.length > 1 ? `${wn.entries.length} bản cập nhật (từ bản ${older[older.length - 1].version})` : `bản ${latest.version}`;
  const seen = button({ icon: '✓', label: 'Đã xem', kind: 'good', onTap: () => c.set({ lastSeenVersion: LATEST_VERSION }) });
  return h(
    'section',
    { class: `card whatsnew${ui.open ? ' open' : ''}`, 'aria-label': 'Có gì mới trong app' },
    h('div', { class: 'wn-head' }, h('h2', {}, '🆕 Có gì mới'), h('span', { class: 'wn-span' }, span), toggle),
    ui.open ? entryBlock(latest) : null,
    ui.open && older.length
      ? h(
          'details',
          { class: 'wn-older' },
          h('summary', {}, `Xem thêm ${older.length} bản trước`),
          ...older.map((e) => entryBlock(e, 'h4')),
        )
      : null,
    h(
      'div',
      { class: 'row wn-actions' },
      seen,
      button({ icon: '📖', label: 'Hướng dẫn nhanh', onTap: onGuide }),
    ),
  );
}

/** Nút "📖 Hướng dẫn" ở đầu màn; `hint` = làm nổi (lần đầu mở màn Phụ huynh sau bản có Hướng dẫn mới). */
export function guideButton(onTap: () => void, hint: boolean): HTMLButtonElement {
  const b = button({ icon: '📖', label: 'Hướng dẫn', onTap });
  if (hint) {
    b.classList.add('guide-hint');
    b.append(h('span', { class: 'guide-hint-tag', 'aria-hidden': 'true' }, 'Mới'));
    b.setAttribute('aria-label', 'Hướng dẫn nhanh cho bố mẹ (mới)');
  }
  return b;
}

/** Lần đầu mở màn Phụ huynh từ khi có Hướng dẫn mới → true (và ghi lại để chỉ làm nổi MỘT lần). */
export function takeGuideHint(store: App['store']): boolean {
  if (store.get().settings.guideHintAt) return false;
  store.updateSettings({ guideHintAt: Date.now() });
  return true;
}

/** Mở từ Hướng dẫn ("Mở ngay"): cuộn tới thẻ `data-guide="<mốc>"` và nháy viền một lúc. */
export function focusGuideAnchor(scroller: HTMLElement, anchor: GuideAnchor): void {
  window.requestAnimationFrame(() => {
    const el = scroller.querySelector<HTMLElement>(`[data-guide="${anchor}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    el.classList.add('guide-flash');
    window.setTimeout(() => el.classList.remove('guide-flash'), 2600);
  });
}

/** Gắn mốc `data-guide` cho một thẻ (để Hướng dẫn cuộn tới). */
export function tagGuide<T extends HTMLElement | null>(el: T, anchor: GuideAnchor): T {
  if (el) el.dataset.guide = anchor;
  return el;
}
