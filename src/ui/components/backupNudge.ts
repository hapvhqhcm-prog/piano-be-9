/**
 * (+ 2026-10-08) Nhắc nhỏ ở màn chính của bé: "💾 Nhắc bố mẹ sao lưu" (viên nhỏ trên thanh trên cùng).
 * Hiện khi lần sao lưu gần nhất ≥ 14 ngày (hoặc chưa lần nào mà đã học ≥ 10 buổi) — backup.ts backupNudgeDue.
 * Chạm → cổng phụ huynh (rồi bố mẹ bấm "💾 Sao lưu" ở đầu màn Phụ huynh). ✕ → ẩn 3 ngày (không làm phiền).
 */
import type { App } from '../App';
import { backupNudgeDue } from '../../progress/backup';
import { sessionCount } from '../../progress/history';
import { h } from './dom';

export function backupNudge(app: App, openParent: () => void, now: number = Date.now()): HTMLElement | null {
  let due = false;
  try {
    const d = app.store.get();
    due = backupNudgeDue(d.settings, sessionCount(d), now);
  } catch {
    due = false; // nhắc phụ — lỗi thì thôi, không làm hỏng màn chính
  }
  if (!due) return null;
  // (+ 2026-10-09) Viên nhỏ trên thanh trên cùng (cạnh nút Phụ huynh) — kiểu ở src/styles/kidux.css (.backup-nudge)
  const el = h(
    'div',
    { class: 'backup-nudge' },
    h(
      'button',
      { type: 'button', class: 'backup-nudge-open', 'aria-label': 'Nhắc bố mẹ sao lưu tiến độ — mở màn Phụ huynh', onClick: openParent },
      h('span', { 'aria-hidden': 'true' }, '💾'),
      h('span', { class: 'backup-nudge-text' }, 'Nhắc bố mẹ sao lưu'),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'backup-nudge-hide',
        'aria-label': 'Ẩn nhắc sao lưu 3 ngày',
        onClick: () => {
          el.remove();
          try {
            app.store.updateSettings({ backupNudgeHiddenAt: Date.now() });
          } catch {
            /* bỏ qua */
          }
        },
      },
      '✕',
    ),
  );
  return el;
}
