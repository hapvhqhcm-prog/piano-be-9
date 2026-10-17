/**
 * (+ 2026-10-17, OWNER duyệt) 👤 "KHÁCH CHƠI" — anh chị em / bạn bè chơi thử Thư viện, Đàn tự do, Trò chơi mà KHÔNG ghi
 * gì vào tiến độ của bé: không buổi học, không lượt chơi, không kỷ lục trò chơi, không lưu Album, không ảnh hưởng độ khó /
 * tiêu chí tuần, micro không tự học (độ nhạy / lệch dây). Chặn ở tầng dữ liệu: ProgressStore.enterGuest / exitGuest
 * (không ghi xuống bộ nhớ, thoát = trả lại đúng dữ liệu lúc vào). Băng "👤 Đang chơi chế độ khách — không lưu" + nút Thoát
 * luôn hiện trên cùng.
 */
import type { App, Screen } from './App';
import { button, h, toast } from './components/dom';
import { lazy, lazyScreen } from './lazy';
import '../styles/guest.css';

export const GUEST_BANNER_TEXT = '👤 Đang chơi chế độ khách — không lưu';

const libraryMod = lazy(() => import('./screens/library'));
const freePlayMod = lazy(() => import('./screens/freePlay'));
const gamesMod = lazy(() => import('./screens/games'));

let bannerEl: HTMLElement | null = null;

function removeBanner(): void {
  bannerEl?.remove();
  bannerEl = null;
}

function showBanner(app: App): void {
  if (typeof document === 'undefined') return;
  removeBanner();
  bannerEl = h(
    'div',
    { class: 'guest-banner', role: 'status' },
    h('span', {}, GUEST_BANNER_TEXT),
    button({ icon: '🚪', label: 'Thoát', onTap: () => exitGuest(app) }),
  );
  document.body.append(bannerEl);
}

function setMicLearning(app: App, on: boolean): void {
  const mic = app.micIfReady;
  if (!mic) return;
  mic.autoSensitivity = on;
  mic.autoTuneEnabled = on;
  // Thoát: bỏ những gì micro học được từ tiếng đàn của khách (nạp lại bản đã lưu)
  if (on) mic.loadAutoTune(app.store.settings.micAutoTune);
  if (on) mic.sensitivity = app.store.settings.micSensitivity;
}

/** Vào chế độ khách → màn chính của khách. */
export function enterGuest(app: App): void {
  if (!app.store.enterGuest()) {
    toast('Chưa vào được chế độ khách.');
    return;
  }
  setMicLearning(app, false);
  showBanner(app);
  app.show(guestHomeScreen(app));
}

/** Thoát chế độ khách: trả lại dữ liệu của bé, về màn chính của bé. */
export function exitGuest(app: App): void {
  app.store.exitGuest();
  removeBanner();
  setMicLearning(app, true);
  toast('👋 Hết lượt khách — về với bé nhé!');
  void import('./screens/home').then((m) => app.show(m.homeScreen(app))).catch(() => window.location.reload());
}

/** Màn chính khi khách chơi: chỉ Bài hát / Đàn tự do / Trò chơi + Thoát. */
export function guestHomeScreen(app: App): Screen {
  return (root) => {
    try {
      app.micIfReady?.stop();
    } catch {
      /* bỏ qua */
    }
    if (!bannerEl?.isConnected) showBanner(app);
    root.append(
      h(
        'div',
        { class: 'screen guest-home' },
        h(
          'div',
          { class: 'guest-home-main scrollable' },
          h('h1', {}, '👤 Khách chơi'),
          h('p', { class: 'lead' }, 'Chơi thoải mái nhé! Lượt chơi của khách không được lưu.'),
          h(
            'div',
            { class: 'guest-home-row' },
            button({ icon: '🎵', label: 'Bài hát', kind: 'sun', big: true, onTap: () => app.show(lazyScreen(libraryMod, (m) => m.libraryScreen(app))) }),
            button({ icon: '🎹', label: 'Đàn tự do', kind: 'mint', big: true, onTap: () => app.show(lazyScreen(freePlayMod, (m) => m.freePlayScreen(app))) }),
            button({ icon: '🎮', label: 'Trò chơi', big: true, onTap: () => app.show(lazyScreen(gamesMod, (m) => m.gamesScreen(app))) }),
          ),
          button({ icon: '🚪', label: 'Thoát chế độ khách', onTap: () => exitGuest(app) }),
        ),
      ),
    );
  };
}
