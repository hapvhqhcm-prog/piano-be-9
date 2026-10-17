/**
 * (2026-10-17, OWNER duyệt "MỘT quy tắc sao lưu") MỘT viên nhỏ cho BỐ MẸ trên thanh trên cùng màn của bé (cạnh nút Phụ
 * huynh) — thay cho 3 viên cũ (nhắc sao lưu 14 ngày / báo cáo tuần / chờ bố mẹ xem). Ưu tiên:
 *   🕑 Chờ bố mẹ xem (N)  →  ⚠️ Nhờ bố mẹ sao lưu (quá 30 ngày)  →  📊 Báo cáo tuần đã sẵn sàng.
 * Chạm → cổng phụ huynh. Không có nút ẩn: muốn hết nhắc thì sao lưu / xem báo cáo (màn Phụ huynh, thẻ "Hôm nay bố mẹ cần").
 * Kiểu: .backup-nudge (kidux.css), .review-pill (selfstudy.css).
 */
import type { App } from '../App';
import { backupOverdue } from '../../progress/backup';
import { weeklyReportDue } from '../../progress/weeklyReportDue';
import { reviewPill } from '../selfStudy';
import { h } from './dom';

export type ParentPillKind = 'review' | 'backup' | 'weekly' | null;

/** Viên nào hiện (hàm thuần trên dữ liệu — test: tests/parentToday.test.ts). */
export function parentPillKind(d: Parameters<typeof weeklyReportDue>[0], pending: number, now: Date): ParentPillKind {
  if (pending > 0) return 'review';
  if (backupOverdue(d, now.getTime())) return 'backup';
  if (weeklyReportDue(d, now)) return 'weekly';
  return null;
}

export function parentPill(app: App, openParent: () => void, now: Date = new Date()): HTMLElement | null {
  const review = reviewPill(app, openParent);
  if (review) return review;
  let kind: ParentPillKind = null;
  try {
    kind = parentPillKind(app.store.get(), 0, now);
  } catch {
    kind = null; // nhắc phụ — lỗi thì thôi, không làm hỏng màn chính
  }
  if (!kind) return null;
  const backup = kind === 'backup';
  return h(
    'div',
    {
      class: `backup-nudge ${backup ? 'backup-overdue' : 'weekly-nudge'}`,
      style: backup
        ? { background: 'var(--coral-50, #fff1ee)', boxShadow: 'inset 0 0 0 2px var(--coral-400, #f08c78)', color: 'var(--coral-700, #a63a26)' }
        : { background: 'var(--violet-100)', boxShadow: 'inset 0 0 0 2px var(--violet-400)', color: 'var(--violet-600)' },
    },
    h(
      'button',
      {
        type: 'button',
        class: 'backup-nudge-open',
        style: { paddingRight: '14px' },
        'aria-label': backup ? 'Đã lâu chưa sao lưu tiến độ — nhờ bố mẹ mở màn Phụ huynh' : 'Báo cáo tuần cho bố mẹ đã sẵn sàng — mở màn Phụ huynh',
        onClick: openParent,
      },
      h('span', { 'aria-hidden': 'true' }, backup ? '⚠️' : '📊'),
      h('span', { class: 'backup-nudge-text' }, backup ? 'Nhờ bố mẹ sao lưu' : 'Báo cáo tuần đã sẵn sàng'),
    ),
  );
}
