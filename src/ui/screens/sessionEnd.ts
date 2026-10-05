import type { App } from '../App';
import { newStickers, type Sticker } from '../../lessons/stickers';
import { stickerArt } from '../components/art/stickerArt';
import { mascot } from '../components/mascot';
import { confetti } from '../components/celebrate';
import { button, h } from '../components/dom';
import { stickersScreen } from './stickers';

const KIND_ORDER: Sticker['kind'][] = ['medal', 'songs', 'streak', 'folk', 'mic', 'dynamics', 'island'];

/** Khoảnh khắc "Con nhận được sticker mới!" — tối đa 3 sticker hiện ra lần lượt. */
function stickerReveal(app: App, fresh: Sticker[]): HTMLElement {
  // Thành tích hiếm trước; đảo: đảo mới nhất trước
  const list = [...fresh].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (b.week ?? 0) - (a.week ?? 0) || (b.n ?? 0) - (a.n ?? 0),
  );
  const shown = list.slice(0, 3);
  const more = list.length - shown.length;
  return h(
    'button',
    { class: 'sticker-reveal', type: 'button', onClick: () => app.show(stickersScreen(app)), 'aria-label': 'Xem sổ sticker' },
    h(
      'div',
      { class: 'sticker-reveal-pics' },
      ...shown.map((s, i) =>
        h('div', { class: 'sticker-reveal-item', style: { animationDelay: `${0.35 + i * 0.25}s` } }, stickerArt(s, true), h('span', {}, s.title)),
      ),
    ),
    h(
      'div',
      { class: 'sticker-reveal-text' },
      h('div', { class: 'sticker-reveal-title' }, list.length > 1 ? `Con nhận được ${list.length} sticker mới!` : 'Con nhận được sticker mới!'),
      h('div', { class: 'sticker-reveal-sub' }, more > 0 ? `+${more} sticker nữa · ` : '', 'Chạm để xem sổ sticker 📒'),
    ),
  );
}

/** Kết thúc buổi (§9): KHÔNG khóa, không đếm ngược, không trừ gì. */
export function sessionEndScreen(
  app: App,
  o: { banner?: string; stickersBefore?: readonly string[]; onReplay(): void; onHome(): void },
) {
  return (root: HTMLElement) => {
    const fresh = o.stickersBefore ? newStickers(o.stickersBefore, app.store.get()) : [];
    confetti(o.banner || fresh.length ? 60 : 36);
    root.append(
      h(
        'div',
        { class: `screen center${fresh.length ? ' has-stickers' : ''}` },
        h('div', { class: 'hero-mascot' }, mascot('cheer', fresh.length ? 104 : 150)),
        h('h1', { class: 'hero-title' }, 'Con đã hoàn thành buổi hôm nay'),
        o.banner ? h('div', { class: 'banner' }, o.banner) : null,
        fresh.length ? stickerReveal(app, fresh) : null,
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
