/**
 * (+ 2026-10-08) Nhắc nhỏ ở màn chính của bé: "💾 Nhắc bố mẹ: sao lưu".
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
  const el = h(
    'div',
    {
      class: 'banner backup-nudge',
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 12px', fontSize: '0.95em' },
    },
    h(
      'button',
      {
        type: 'button',
        class: 'backup-nudge-open',
        style: { background: 'none', border: '0', font: 'inherit', color: 'inherit', padding: '6px 0', cursor: 'pointer', textAlign: 'left', flex: '1' },
        onClick: openParent,
      },
      '💾 Nhắc bố mẹ: sao lưu tiến độ',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'backup-nudge-hide',
        'aria-label': 'Ẩn nhắc sao lưu 3 ngày',
        style: { background: 'none', border: '0', font: 'inherit', color: 'inherit', padding: '6px 10px', cursor: 'pointer', opacity: '0.7' },
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
