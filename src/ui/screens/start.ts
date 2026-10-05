import type { App } from '../App';
import { heroArt } from '../components/art/heroArt';
import { button, h } from '../components/dom';
import { homeScreen } from './home';
import { onboardingScreen } from './onboarding';
import { markSafePoint } from '../../pwa/updater';

/** Màn đầu tiên: AudioContext CHỈ được tạo sau khi chạm "Bắt đầu" (§3). */
export function startScreen(app: App) {
  return (root: HTMLElement) => {
    markSafePoint(true);
    const name = app.store.get().learner.name;
    const art = heroArt();
    // Kích thước tranh: co theo cả chiều ngang lẫn chiều cao màn hình (tỉ lệ 400×240)
    art.setAttribute('style', 'display:block;width:min(560px, 84vw, 62vh);height:auto;margin:0 auto');
    root.append(
      h(
        'div',
        { class: 'screen center' },
        h('div', { class: 'hero-art-wrap' }, art),
        h('h1', { class: 'hero-title' }, 'Học Piano cùng bố mẹ'),
        h('p', { class: 'hero-sub' }, name ? `Chào ${name}! Đặt iPad lên giá nhạc, ngồi ngay ngắn nhé` : 'Đặt iPad lên giá nhạc, ngồi ngay ngắn nhé'),
        button({
          icon: '▶',
          label: 'Bắt đầu',
          kind: 'primary',
          big: true,
          onTap: async () => {
            await app.audio.unlock();
            app.started = true;
            // Lần đầu dùng app (chưa có buổi học nào, chưa xem hướng dẫn) → hướng dẫn nhanh cho bố mẹ
            const d = app.store.get();
            if (!d.settings.onboardedAt && d.sessions.length === 0) {
              app.show(onboardingScreen(app, { onDone: () => app.show(homeScreen(app)) }));
            } else app.show(homeScreen(app));
          },
        }),
      ),
    );
  };
}
