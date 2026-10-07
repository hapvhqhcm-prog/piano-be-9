/**
 * 🏆 THỬ THÁCH TUẦN — dòng gọn ở khung mục tiêu màn chính + tấm chi tiết (cách làm, tiến độ, "Làm ngay").
 * Logic thuần: src/lessons/challenges.ts.
 */
import { sundayOf, type ChallengeAction, type WeeklyChallenge } from '../../lessons/challenges';
import { nextLesson } from '../../lessons/lessonEngine';
import { findSong } from '../../music/tune';
import type { App, Screen } from '../App';
import { lazy, lazyScreen, withLazy } from '../lazy';
import { button, h, toast } from './dom';
import { speakChip } from './speakChip';
import { stickerArt } from './art/stickerArt';
import { cancelSpeech } from '../../audio/voice';
import '../../styles/challenges.css';

const libraryMod = lazy(() => import('../screens/library'));
const sessionMod = lazy(() => import('../screens/session'));

/**
 * Màn "🎮 Trò chơi" (có thể chưa có trong bản này): nạp mềm qua import.meta.glob — không có file thì "Làm ngay"
 * mở buổi học tiếp (vẫn có trò nghe / đọc nốt ở phần khởi động).
 */
type GamesModule = Record<string, unknown>;
const gamesLoaders = import.meta.glob<GamesModule>('../screens/games*.ts');
const gamesLoader = Object.values(gamesLoaders)[0];
const gamesMod = gamesLoader ? lazy(gamesLoader) : null;
/** Hàm màn trò chơi trong module (gamesScreen / gamesHubScreen …): `(app) => Screen`. */
function gamesScreenOf(m: GamesModule): ((app: App) => Screen) | null {
  const key = ['gamesScreen', 'gamesHubScreen', 'gameHubScreen'].find((k) => typeof m[k] === 'function') ??
    Object.keys(m).find((k) => /screen$/i.test(k) && typeof m[k] === 'function');
  return key ? (m[key] as (app: App) => Screen) : null;
}

/** Chấm tiến độ ●●○○ */
function dots(c: WeeklyChallenge, cls = 'chal-dots'): HTMLElement {
  return h(
    'span',
    { class: cls, 'aria-hidden': 'true' },
    ...Array.from({ length: c.need }, (_, i) => h('span', { class: `cd${i < c.have ? ' on' : ''}` })),
  );
}

/** Số ngày còn lại trong tuần (kể cả hôm nay). */
function daysLeft(today: string, monday: string): number {
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = sundayOf(monday).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1;
}

/** Mở việc của thử thách. */
export function runChallengeAction(app: App, a: ChallengeAction): void {
  const startNext = () => withLazy(sessionMod, (m) => m.startSession(app, nextLesson(app.store.get())));
  switch (a.kind) {
    case 'song': {
      const t = findSong(a.songId);
      if (!t) return startNext();
      return withLazy(libraryMod, (m) => m.playSong(app, t, { mode: 'tempo', level: 2, bpm: a.bpm }));
    }
    case 'library':
      return app.show(lazyScreen(libraryMod, (m) => m.libraryScreen(app, a.filter ?? 'all')));
    case 'lesson':
      return startNext();
    case 'games': {
      if (!gamesMod) return startNext();
      gamesMod.load().then(
        (m) => {
          const make = gamesScreenOf(m);
          if (make) app.show(make(app));
          else startNext();
        },
        () => toast('Chưa mở được trò chơi — thử lại nhé'),
      );
      return;
    }
  }
}

/** Tấm chi tiết thử thách (nền mờ + thẻ giữa màn). Chạm nền mờ / "Đóng" để tắt. */
export function openChallengeSheet(app: App, c: WeeklyChallenge, today: string, opts: { blocked?: () => boolean; onBlocked?: () => void } = {}): void {
  const close = () => {
    cancelSpeech();
    wrap.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const left = daysLeft(today, c.monday);
  const speech = `Thử thách tuần: ${c.title}. ${c.desc}. ${c.howTo}`;
  const card = h(
    'div',
    { class: `dialog-card chal-card${c.done ? ' done' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': `Thử thách tuần: ${c.title}` },
    h(
      'div',
      { class: 'chal-head' },
      h(
        'div',
        { class: 'chal-cup', 'aria-hidden': 'true' },
        stickerArt({ id: 'challenge-now', kind: 'challenge', title: '', hint: '', earned: c.done, challenge: c.id }, c.done),
      ),
      h(
        'div',
        { class: 'chal-head-text' },
        h('div', { class: 'chal-kicker' }, '🏆 Thử thách tuần'),
        h('h2', { class: 'chal-title' }, h('span', { 'aria-hidden': 'true' }, c.icon), ' ', c.title, speakChip(app, speech)),
        h('p', { class: 'chal-desc' }, c.desc),
      ),
    ),
    h('p', { class: 'chal-how' }, c.howTo),
    h(
      'div',
      { class: 'chal-progress', 'aria-label': `Tiến độ ${c.have} trên ${c.need}` },
      dots(c, 'chal-dots big'),
      h('span', { class: 'chal-ptext' }, c.done ? '🏆 Xong rồi! Tuần sau có thử thách mới.' : c.need > 1 ? c.text : 'Chưa xong'),
      !c.done ? h('span', { class: 'chal-left' }, left <= 1 ? 'hôm nay là ngày cuối tuần' : `còn ${left} ngày`) : null,
    ),
    h(
      'div',
      { class: 'dialog-actions' },
      button({ label: 'Đóng', onTap: close }),
      c.done
        ? null
        : button({
            icon: '▶',
            label: 'Làm ngay',
            kind: 'primary',
            onTap: () => {
              close();
              if (opts.blocked?.() && c.action.kind === 'lesson') return opts.onBlocked?.();
              runChallengeAction(app, c.action);
            },
          }),
    ),
  );
  const wrap = h('div', { class: 'dialog-backdrop chal-backdrop' }, card);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
}

/** Dòng gọn ở khung mục tiêu màn chính: "🏆 Thử thách tuần: 🐇 Nhanh hơn ●○ chưa xong ›" — chạm mở tấm chi tiết. */
export function challengeLine(app: App, c: WeeklyChallenge, today: string, opts: { blocked?: () => boolean; onBlocked?: () => void } = {}): HTMLElement {
  return h(
    'button',
    {
      class: `chal-line${c.done ? ' done' : ''}`,
      type: 'button',
      'data-challenge': c.id,
      'aria-label': `Thử thách tuần: ${c.title} — ${c.done ? 'đã xong' : c.text}. Chạm để xem`,
      onClick: () => openChallengeSheet(app, c, today, opts),
    },
    h('span', { class: 'chal-label' }, h('span', { 'aria-hidden': 'true' }, '🏆'), ' Thử thách tuần:'),
    h('span', { class: 'chal-name' }, `${c.icon} ${c.title}`),
    c.done ? null : dots(c),
    // Chấm ●○ đã nói tiến độ — chữ chỉ hiện khi xong (đủ chỗ cho tên thử thách trên iPad mini)
    c.done ? h('span', { class: 'chal-note' }, 'Xong! ✓') : null,
    h('span', { class: 'chal-more', 'aria-hidden': 'true' }, '›'),
  );
}
