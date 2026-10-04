import type { App } from '../App';
import { mascot } from '../components/mascot';
import { button, h } from '../components/dom';
import { homeScreen } from './home';
import { markSafePoint } from '../../pwa/updater';

/** Màn đầu tiên: AudioContext CHỈ được tạo sau khi chạm "Bắt đầu" (§3). */
export function startScreen(app: App) {
  return (root: HTMLElement) => {
    markSafePoint(true);
    const name = app.store.get().learner.name;
    root.append(
      h(
        'div',
        { class: 'screen center' },
        h('div', { class: 'hero-mascot' }, mascot('wave', 150)),
        h('h1', { class: 'hero-title' }, name ? `Chào ${name}!` : 'Học Piano cùng bố mẹ'),
        h('p', { class: 'hero-sub' }, 'Đặt iPad lên giá nhạc, ngồi ngay ngắn nhé'),
        button({
          icon: '▶',
          label: 'Bắt đầu',
          kind: 'primary',
          big: true,
          onTap: async () => {
            await app.audio.unlock();
            app.started = true;
            app.show(homeScreen(app));
          },
        }),
      ),
    );
  };
}
