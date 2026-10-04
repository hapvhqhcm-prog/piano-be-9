import { SONGS, type Tune } from '../../music/tune';
import type { App } from '../App';
import { actionBar, backButton, h } from '../components/dom';
import { homeScreen } from './home';
import { songScreen } from './song';

/**
 * Thư viện bài hát — bé TỰ CHỌN bài (động lực nội tại: quyền lựa chọn).
 * Bài của các tuần sau hiện khóa 🔒 kèm số tuần; không mở khóa bằng sao.
 */
export function libraryScreen(app: App) {
  return (root: HTMLElement) => {
    const week = app.store.get().progress.currentWeek;
    const card = (s: Tune) => {
      const open = (s.week ?? 1) <= week;
      return h(
        'button',
        {
          class: `song-card${open ? '' : ' locked'}`,
          type: 'button',
          onClick: () => open && playSong(app, s),
        },
        h('div', { class: 'song-card-title' }, open ? s.titleVi : `🔒 ${s.titleVi}`),
        h('div', { class: 'song-card-sub' }, `${s.title}${s.hand === 'LH' ? ' · tay trái' : ''}`),
        h('div', { class: 'song-card-week' }, `Tuần ${s.week}`),
      );
    };
    root.append(
      h(
        'div',
        { class: 'screen' },
        h('header', { class: 'topbar' }, h('div', { class: 'topbar-title' }, '🎵 Bài hát của con')),
        h('div', { class: 'library scrollable' }, ...SONGS.map(card)),
        actionBar(backButton(() => app.show(homeScreen(app)))),
      ),
    );
  };
}

/** Chơi một bài ngoài buổi học: vẫn lưu lượt chơi vào một buổi "tự do" của tuần hiện tại. */
export function playSong(app: App, s: Tune): void {
  const store = app.store;
  const week = store.get().progress.currentWeek;
  const session = store.startSession(`w${week}-song-${s.id}`);
  const leave = () => {
    app.mic.stop();
    const cur = store.get().sessions.find((x) => x.id === session.id);
    if (cur && cur.songRuns.length) store.finishSession(session.id);
    else store.discardSessionIfEmpty(session.id);
    app.show(libraryScreen(app));
  };
  app.show(
    songScreen(
      app,
      s,
      { mode: 'wait', hints: week >= 7 ? 'names' : 'full', free: true },
      { onRun: (run) => store.addSongRun(session.id, run), onDone: leave, onBack: leave },
    ),
  );
}
