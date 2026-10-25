import type { App } from '../App';
import { mascot } from '../components/mascot';
import { button, h } from '../components/dom';
import { speakChip } from '../components/speakChip';

export const TEACH_TITLE = 'Bây giờ con là thầy giáo!';

/**
 * "Con làm thầy" (v2) — bé dạy lại điều vừa học: dạy lại giúp nhớ lâu hơn và bé thấy tự hào.
 * (2026-10-25, OWNER "bỏ phần phụ huynh") bé giảng cho BÉ NỐT (linh vật) nghe — không cần bố mẹ. Nút "✅ Con giảng xong rồi".
 * v5.1 (OWNER duyệt 2026-10-06 — buổi ≤ 7 màn): KHÔNG còn là màn riêng — là THẺ ở đầu màn kết (rating.ts closingScreen),
 * cùng màn với câu "Hôm nay con thấy thế nào?". Nút "Con giảng xong rồi" gọi `onTaught` MỘT lần (PARENT_ASSESSMENT 'teach-back').
 * Không bấm = "để sau" (như nút "Để sau" cũ) — không ghi gì.
 */
/** Lời dạy lại của tuần / bài (dữ liệu có thể còn "chỉ bố mẹ") → bé giảng cho Bé Nốt. Thuần. */
export function kidTeachText(text: string): string {
  return text.replace(/(bố mẹ|Bố mẹ|cả nhà)/gu, 'Bé Nốt').replace(/👪\s*/gu, '');
}

export function teachCard(app: App, teach: { emoji: string; text: string }, onTaught: () => void): HTMLElement {
  let taught = false;
  const btn = button({
    icon: '✅',
    label: 'Con giảng xong rồi',
    kind: 'good',
    onTap: () => {
      if (taught) return;
      taught = true;
      onTaught();
      void app.audio.chime();
      btn.disabled = true;
      btn.querySelector('.btn-label')!.textContent = 'Bé Nốt hiểu rồi — con giỏi quá!';
      btn.querySelector('.btn-icon')!.textContent = '✓';
    },
  });
  return h(
    'div',
    { class: 'closing-teach' },
    h('div', { class: 'step-tag' }, `${teach.emoji} Con làm thầy`),
    h('div', { class: 'hero-mascot' }, mascot('wave', 72)),
    // (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") chữ của bé ngắn: nhãn "Con làm thầy" đã nói điều này — câu
    // TEACH_TITLE vẫn được đọc to cùng thẻ (rating.ts / speakChip bên dưới)
    h('p', { class: 'lead teach-card' }, kidTeachText(teach.text), speakChip(app, `${TEACH_TITLE} Con giảng cho Bé Nốt nghe nhé! ${kidTeachText(teach.text)}`)),
    h('div', { class: 'closing-teach-actions' }, h('p', { class: 'muted' }, 'Con giảng cho Bé Nốt nghe nhé!'), btn),
  );
}
