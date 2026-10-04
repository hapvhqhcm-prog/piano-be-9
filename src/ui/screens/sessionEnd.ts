import type { App } from '../App';
import { button, h } from '../components/dom';

/** Kết thúc buổi (§9): KHÔNG khóa, không đếm ngược, không trừ gì. */
export function sessionEndScreen(
  _app: App,
  o: { banner?: string; onReplay(): void; onHome(): void },
) {
  return (root: HTMLElement) => {
    root.append(
      h(
        'div',
        { class: 'screen center' },
        h('div', { class: 'hero-emoji huge' }, '🎉'),
        h('h1', { class: 'hero-title' }, 'Con đã hoàn thành buổi hôm nay'),
        o.banner ? h('div', { class: 'banner' }, o.banner) : null,
        h(
          'div',
          { class: 'end-actions' },
          button({ icon: '↻', label: 'Chơi lại bài vừa học', big: true, onTap: o.onReplay }),
          button({ icon: '🌙', label: 'Để mai học tiếp', kind: 'primary', big: true, onTap: o.onHome }),
        ),
      ),
    );
  };
}
