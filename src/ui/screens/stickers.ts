import { allStickers, type Sticker } from '../../lessons/stickers';
import type { App } from '../App';
import { stickerArt } from '../components/art/stickerArt';
import { actionBar, backButton, h, toast } from '../components/dom';
import { mascot } from '../components/mascot';
import { homeScreen } from './home';

/** Một ô sticker: đã nhận = tranh màu + tên; chưa nhận = bóng xám + gợi ý cách nhận. */
export function stickerCell(s: Sticker, opts: { fresh?: boolean } = {}): HTMLElement {
  const cell = h(
    'button',
    {
      class: `sticker-cell${s.earned ? ' earned' : ' locked'}${opts.fresh ? ' fresh' : ''}`,
      type: 'button',
      'aria-label': s.earned ? `Sticker ${s.title}` : `Chưa có — ${s.hint}`,
      onClick: () => {
        if (s.earned) {
          cell.classList.remove('wiggle');
          void cell.offsetWidth;
          cell.classList.add('wiggle');
          toast(`🌟 ${s.title}`);
        } else toast(`🔒 ${s.hint}`);
      },
    },
    h('span', { class: 'sticker-pic' }, stickerArt(s)),
    h('span', { class: 'sticker-name' }, s.earned ? s.title : s.hint),
  );
  return cell;
}

/** SỔ STICKER — bé xem các sticker đã sưu tầm (tính từ tiến độ, không lưu thêm). */
export function stickersScreen(app: App) {
  return (root: HTMLElement) => {
    const all = allStickers(app.store.get());
    const got = all.filter((s) => s.earned).length;
    const islands = all.filter((s) => s.kind === 'island');
    const others = all.filter((s) => s.kind !== 'island');
    const section = (title: string, list: Sticker[]) =>
      h(
        'section',
        { class: 'sticker-section' },
        h(
          'h2',
          { class: 'sticker-kicker' },
          title,
          h('span', { class: 'sticker-count' }, `${list.filter((s) => s.earned).length}/${list.length}`),
        ),
        h('div', { class: 'sticker-grid' }, ...list.map((s) => stickerCell(s))),
      );
    root.append(
      h(
        'div',
        { class: 'screen stickers' },
        h(
          'header',
          { class: 'topbar' },
          h('div', { class: 'topbar-title' }, h('span', { 'aria-hidden': 'true' }, '📒'), h('span', {}, 'Sổ sticker của con')),
          h('div', { class: 'topbar-side' }, h('div', { class: 'sticker-total' }, `🌟 ${got}/${all.length}`)),
        ),
        h(
          'div',
          { class: 'sticker-wrap scrollable' },
          h(
            'div',
            { class: 'story-row sticker-intro' },
            mascot(got ? 'love' : 'wave', 64),
            h(
              'p',
              { class: 'story bubble' },
              got
                ? `Con đã sưu tầm ${got} sticker! Học tiếp để nhận thêm nhé.`
                : 'Sổ còn trống — học xong mỗi đảo, thuộc bài hát, tuần nào học đủ 4 buổi là có sticker!',
            ),
          ),
          section('🏆 Thành tích', others),
          section('🏝️ Các đảo', islands),
        ),
        actionBar(backButton(() => app.show(homeScreen(app)))),
      ),
    );
  };
}
