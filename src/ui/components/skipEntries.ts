/**
 * (+ 2026-10-25, OWNER duyệt — bé: "Dạy piano quá dễ") Lối vào ở MÀN CHÍNH (không cần bố mẹ — OWNER 2026-10-25):
 * - trong 📋 Xem các bài: hàng "⚡ Thi vượt tuần" (lessons/testOut.testOutStatus) + hàng "🧭 Kiểm tra xếp lớp";
 * - lời mời kiểm tra xếp lớp MỘT LẦN cho bé đang làm gần như hoàn hảo (lessons/placement.placementOffer) — "Để sau" thì thôi.
 * Màn thi / kiểm tra nạp trễ (chunk riêng). home.ts chỉ gọi hai hàm dưới đây.
 */
import { MAX_WEEK } from '../../lessons/curriculum';
import { testOutStatus } from '../../lessons/testOut';
import { placementOffer } from '../../lessons/placement';
import type { App, Screen } from '../App';
import { button, h } from './dom';
import { lazy, lazyScreen } from '../lazy';
import '../../styles/skip.css';

const testOutMod = lazy(() => import('../screens/testOut'));
const placementMod = lazy(() => import('../screens/placement'));
const testOutScreen = (app: App): Screen => lazyScreen(testOutMod, (m) => m.testOutScreen(app));
const placementScreen = (app: App): Screen => lazyScreen(placementMod, (m) => m.placementScreen(app));

/** Hàng (dạng .lesson-row) cho danh sách bài trong 📋 Xem các bài. `blocked` = hết giờ hôm nay → `onBlocked`. */
export function skipRows(app: App, o: { blocked: boolean; onBlocked(): void }): HTMLElement[] {
  if (app.store.guest) return [];
  const data = app.store.get();
  const out: HTMLElement[] = [];
  const st = testOutStatus(data, app.store.today());
  const row = (emoji: string, title: string, test: string, onTap: (() => void) | null): HTMLButtonElement => {
    const b = h(
      'button',
      { class: 'lesson-row skip-row', type: 'button', 'data-test': test, onClick: () => (o.blocked ? o.onBlocked() : onTap?.()) },
      h('span', { class: 'lesson-emoji', 'aria-hidden': 'true' }, emoji),
      h('span', { class: 'lesson-title' }, title),
    );
    if (!onTap) b.disabled = true;
    return b;
  };
  if (st.why === 'ok') out.push(row('⚡', 'Thi vượt tuần', 'test-out', () => app.show(testOutScreen(app))));
  else if (st.why === 'cooldown') out.push(row('⚡', 'Thi vượt tuần — mai thi lại nhé', 'test-out', null));
  if (data.progress.currentWeek < MAX_WEEK - 1) out.push(row('🧭', 'Kiểm tra xếp lớp', 'placement', () => app.show(placementScreen(app))));
  return out;
}

/** Lời mời một lần (null = không mời). */
export function placementInvite(app: App, o: { blocked: boolean }): HTMLElement | null {
  if (app.store.guest || o.blocked) return null;
  let offer = false;
  try {
    offer = placementOffer(app.store.get());
  } catch {
    offer = false;
  }
  if (!offer) return null;
  const el: HTMLElement = h(
    'div',
    { class: 'skip-invite', 'data-test': 'placement-invite' },
    h('span', { class: 'skip-invite-text' }, '🚀 Thấy dễ quá? Kiểm tra xếp lớp 5 phút!'),
    button({ icon: '🧭', label: 'Thử ngay', kind: 'sun', onTap: () => app.show(placementScreen(app)) }),
    button({
      icon: '',
      label: 'Để sau',
      onTap: () => {
        app.store.updateSettings({ placementDismissed: app.store.today() });
        el.remove();
      },
    }),
  );
  return el;
}
