import { micModule, type App } from '../App';
import { heroArt } from '../components/art/heroArt';
import { button, h, toast } from '../components/dom';
import { lazy, lazyScreen, prefetchLater } from '../lazy';
import { markSafePoint } from '../../pwa/updater';
import { sessionCount } from '../../progress/history';

// Hướng dẫn nhanh chỉ dùng lần đầu → chunk riêng (nạp ngầm trên màn Bắt đầu nếu sắp cần)
const onboardingMod = lazy(() => import('./onboarding'));
// (+ 2026-10-09) Màn chính (+ tranh đảo, thử thách, mở khóa…) → chunk riêng, nạp NGAY khi màn Bắt đầu hiện: chunk chính
// nhẹ hơn (khởi động nhanh hơn trên iPad cũ); tới lúc bé chạm "Bắt đầu" thì đã nạp xong → mở đồng bộ như cũ.
// Chờ cả chunk micro (app.mic) — màn chính và mọi màn sau nó dùng micro đồng bộ.
const homeMod = lazy(() => Promise.all([import('./home'), micModule.load()]).then(([m]) => m));
const home = (app: App) => lazyScreen(homeMod, (m) => m.homeScreen(app));

/** Màn đầu tiên: AudioContext CHỈ được tạo sau khi chạm "Bắt đầu" (§3). */
export function startScreen(app: App) {
  return (root: HTMLElement) => {
    markSafePoint(true);
    prefetchLater([homeMod], 0);
    if (!app.store.get().settings.onboardedAt && sessionCount(app.store.get()) === 0) prefetchLater([onboardingMod], 400);
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
            // Không mở được âm thanh (máy lạ / lỗi Web Audio) → vẫn vào app, chỉ không có tiếng — không kẹt ở nút Bắt đầu
            try {
              await app.audio.unlock();
            } catch (e) {
              console.warn('audio unlock', e);
              toast('Chưa bật được âm thanh — app vẫn dùng được, thử mở lại sau nhé.');
            }
            app.started = true;
            // Lần đầu dùng app (chưa có buổi học nào, chưa xem hướng dẫn) → hướng dẫn nhanh cho bố mẹ
            const d = app.store.get();
            if (!d.settings.onboardedAt && sessionCount(d) === 0) {
              app.show(lazyScreen(onboardingMod, (m) => m.onboardingScreen(app, { onDone: () => app.show(home(app)) })));
            } else app.show(home(app));
          },
        }),
      ),
    );
  };
}
