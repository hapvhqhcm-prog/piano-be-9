import type { App } from '../App';
import { mascot } from '../components/mascot';
import { backButton, button, h } from '../components/dom';

/**
 * "Con làm thầy" (v2) — 1 phút cuối buổi: bé dạy lại bố mẹ điều vừa học.
 * Dạy lại giúp nhớ lâu hơn và bé thấy tự hào.
 */
export function teachScreen(
  _app: App,
  o: { emoji: string; text: string; onDone(): void; onSkip(): void; onBack(): void },
) {
  return (root: HTMLElement) => {
    root.append(
      h(
        'div',
        { class: 'screen' },
        h(
          'div',
          { class: 'stage scrollable' },
          h('div', { class: 'step-tag' }, 'Con làm thầy'),
          h('div', { class: 'hero-mascot' }, mascot('wave', 120)),
          h('h1', { class: 'title' }, 'Bây giờ con là thầy giáo!'),
          h('p', { class: 'lead big teach-card' }, o.text),
        ),
        h(
          'div',
          { class: 'actions' },
          backButton(o.onBack),
          button({ icon: '⏭', label: 'Để sau', onTap: o.onSkip }),
          button({ icon: '😄', label: 'Bố mẹ đã học xong', kind: 'good', onTap: o.onDone }),
        ),
      ),
    );
  };
}
