import { allStickers, type Sticker } from '../../lessons/stickers';
import { BONUS_POOL, WELCOME_STICKER, bonusCollection, type BonusDef } from '../../lessons/bonusStickers';
import { bonusStickerArt, eggArt } from '../components/art/bonusArt';
import '../../styles/kidux.css';
import type { App } from '../App';
import { stickerArt } from '../components/art/stickerArt';
import { actionBar, backButton, h, toast } from '../components/dom';
import { mascot } from '../components/mascot';
import { homeScreen } from './home';
import { CHALLENGE_INFO, challengeStreak, weeklyChallenge } from '../../lessons/challenges';
import '../../styles/challenges.css';

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

/** Ô sticker bất ngờ 🎁: đã có = tranh + tên (+ ×N); chưa có = quả trứng bí ẩn. */
function bonusCell(d: BonusDef, count: number): HTMLElement {
  const got = count > 0;
  const cell = h(
    'button',
    {
      class: `sticker-cell bonus-cell${got ? ' earned' : ' locked'}`,
      type: 'button',
      'aria-label': got ? `Sticker ${d.title}` : 'Sticker bí ẩn — chưa có',
      onClick: () => {
        if (!got) return toast('🥚 Sticker bí ẩn — thỉnh thoảng cuối buổi học sẽ có quả trứng!');
        cell.classList.remove('wiggle');
        void cell.offsetWidth;
        cell.classList.add('wiggle');
        toast(`🎁 ${d.title}`);
      },
    },
    h('span', { class: 'sticker-pic' }, got ? bonusStickerArt(d) : eggArt(0)),
    h('span', { class: 'sticker-name' }, got ? d.title : '???'),
    count > 1 ? h('span', { class: 'bonus-count' }, `×${count}`) : null,
  );
  return cell;
}

/** SỔ STICKER — bé xem các sticker đã sưu tầm (tính từ tiến độ, không lưu thêm). */
export function stickersScreen(app: App) {
  return (root: HTMLElement) => {
    const all = allStickers(app.store.get());
    const got = all.filter((s) => s.earned).length;
    const islands = all.filter((s) => s.kind === 'island');
    const others = all.filter((s) => s.kind !== 'island' && s.kind !== 'challenge');
    // (+ 2026-10-07) 🏆 Cúp tuần: mỗi tuần hoàn thành thử thách một cúp (mới nhất trước) + ô khóa của tuần này nếu chưa xong
    const cups = all.filter((s) => s.kind === 'challenge').reverse();
    const today = app.store.today();
    const wc = weeklyChallenge(app.store.get(), today);
    const streak = challengeStreak(app.store.get(), today);
    const cupCells = cups.map((s) => {
      const c = stickerCell(s);
      const info = s.challenge ? CHALLENGE_INFO[s.challenge as keyof typeof CHALLENGE_INFO] : undefined;
      if (info) c.setAttribute('title', `${info.icon} ${info.title}`);
      return c;
    });
    if (!wc.done) {
      cupCells.unshift(
        stickerCell({
          id: 'challenge-now',
          kind: 'challenge',
          title: 'Cúp tuần này',
          hint: `Tuần này: ${wc.icon} ${wc.title}`,
          earned: false,
          challenge: wc.id,
        }),
      );
    }
    const challengeSection = h(
      'section',
      { class: 'sticker-section' },
      h(
        'h2',
        { class: 'sticker-kicker' },
        '🏆 Thử thách',
        h('span', { class: 'sticker-count' }, `${cups.length} cúp`),
        streak >= 2 ? h('span', { class: 'chal-streak' }, `🔥 ${streak} tuần liền`) : null,
      ),
      h('div', { class: 'sticker-grid' }, ...cupCells),
    );
    // 🎁 Bất ngờ: Chào mừng + bộ sưu tập trứng (tính lại từ lịch sử buổi — không lưu thêm)
    const bonus = new Map(bonusCollection(app.store.get()).map((c) => [c.sticker.key, c.count]));
    const bonusDefs = [WELCOME_STICKER, ...BONUS_POOL];
    const bonusGot = bonusDefs.filter((d) => bonus.has(d.key)).length;
    const bonusSection = h(
      'section',
      { class: 'sticker-section' },
      h('h2', { class: 'sticker-kicker' }, '🎁 Bất ngờ', h('span', { class: 'sticker-count' }, `${bonusGot}/${bonusDefs.length}`)),
      h('div', { class: 'sticker-grid' }, ...bonusDefs.map((d) => bonusCell(d, bonus.get(d.key) ?? 0))),
    );
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
          challengeSection,
          bonusSection,
          section('🏝️ Các đảo', islands),
        ),
        actionBar(backButton(() => app.show(homeScreen(app)))),
      ),
    );
  };
}
