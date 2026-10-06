import type { App } from '../App';
import { mascot } from '../components/mascot';
import { button, h } from '../components/dom';
import { speakChip } from '../components/speakChip';

export const TEACH_TITLE = 'Bây giờ con là thầy giáo!';

/**
 * "Con làm thầy" (v2) — bé dạy lại bố mẹ điều vừa học: dạy lại giúp nhớ lâu hơn và bé thấy tự hào.
 * v5.1 (OWNER duyệt 2026-10-06 — buổi ≤ 7 màn): KHÔNG còn là màn riêng — là THẺ ở đầu màn kết (rating.ts closingScreen),
 * cùng màn với câu "Hôm nay con thấy thế nào?". Nút "Bố mẹ đã học xong" gọi `onTaught` MỘT lần (PARENT_ASSESSMENT 'teach-back').
 * Không bấm = "để sau" (như nút "Để sau" cũ) — không ghi gì.
 */
export function teachCard(app: App, teach: { emoji: string; text: string }, onTaught: () => void): HTMLElement {
  let taught = false;
  const btn = button({
    icon: '👪',
    label: 'Bố mẹ đã học xong',
    kind: 'good',
    onTap: () => {
      if (taught) return;
      taught = true;
      onTaught();
      void app.audio.chime();
      btn.disabled = true;
      btn.querySelector('.btn-label')!.textContent = 'Bố mẹ đã học xong — giỏi quá!';
      btn.querySelector('.btn-icon')!.textContent = '✓';
    },
  });
  return h(
    'div',
    { class: 'closing-teach' },
    h('div', { class: 'step-tag' }, `${teach.emoji} Con làm thầy`),
    h('div', { class: 'hero-mascot' }, mascot('wave', 72)),
    h('h2', { class: 'title' }, TEACH_TITLE),
    h('p', { class: 'lead teach-card' }, teach.text, speakChip(app, `${TEACH_TITLE} ${teach.text}`)),
    h('div', { class: 'closing-teach-actions' }, btn),
  );
}
