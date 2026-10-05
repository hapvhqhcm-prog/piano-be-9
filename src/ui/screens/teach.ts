import type { App } from '../App';
import { mascot } from '../components/mascot';
import { backButton, button, h } from '../components/dom';
import { cancelSpeech, speak } from '../../audio/voice';
import { speakChip } from '../components/speakChip';

/**
 * "Con làm thầy" (v2) — 1 phút cuối buổi: bé dạy lại bố mẹ điều vừa học.
 * Dạy lại giúp nhớ lâu hơn và bé thấy tự hào.
 */
export function teachScreen(
  app: App,
  o: { emoji: string; text: string; onDone(): void; onSkip(): void; onBack(): void },
) {
  return (root: HTMLElement) => {
    const title = 'Bây giờ con là thầy giáo!';
    root.append(
      h(
        'div',
        { class: 'screen' },
        h(
          'div',
          { class: 'stage scrollable' },
          h('div', { class: 'step-tag' }, 'Con làm thầy'),
          h('div', { class: 'hero-mascot' }, mascot('wave', 120)),
          h('h1', { class: 'title' }, title),
          h('p', { class: 'lead big teach-card' }, o.text, speakChip(app, `${title} ${o.text}`)),
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
    const timer = window.setTimeout(() => void speak(app, `${title} ${o.text}`), 400);
    return () => {
      window.clearTimeout(timer);
      cancelSpeech();
    };
  };
}
