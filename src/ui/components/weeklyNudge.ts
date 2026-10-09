/**
 * (+ 2026-10-09) "📊 Báo cáo tuần đã sẵn sàng" — viên NHỎ cho BỐ MẸ trên thanh trên cùng màn chính (cạnh nút Phụ huynh).
 * Không phải màn mừng của bé (không đụng celebrationQueue): chỉ là một nút nhỏ, chạm → cổng phụ huynh.
 * Hiện từ thứ 2 (hoặc lần mở đầu sau khi tuần cũ hết) tới khi bố mẹ mở báo cáo tuần (progress/weeklyReportDue.ts).
 * Kiểu: dùng lại .backup-nudge (kidux.css), tô tím.
 */
import type { App } from '../App';
import { weeklyReportDue } from '../../progress/weeklyReportDue';
import { h } from './dom';

export function weeklyNudge(app: App, openParent: () => void, now: Date = new Date()): HTMLElement | null {
  let due: string | null = null;
  try {
    due = weeklyReportDue(app.store.get(), now);
  } catch {
    due = null; // nhắc phụ — lỗi thì thôi
  }
  if (!due) return null;
  return h(
    'div',
    {
      class: 'backup-nudge weekly-nudge',
      style: { background: 'var(--violet-100)', boxShadow: 'inset 0 0 0 2px var(--violet-400)', color: 'var(--violet-600)' },
    },
    h(
      'button',
      { type: 'button', class: 'backup-nudge-open', style: { paddingRight: '14px' }, 'aria-label': 'Báo cáo tuần cho bố mẹ đã sẵn sàng — mở màn Phụ huynh', onClick: openParent },
      h('span', { 'aria-hidden': 'true' }, '📊'),
      h('span', { class: 'backup-nudge-text' }, 'Báo cáo tuần đã sẵn sàng'),
    ),
  );
}
