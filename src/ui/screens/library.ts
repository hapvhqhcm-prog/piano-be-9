import { LEVELS, songMastered } from '../../lessons/lessonEngine';
import { SONGS, type Tune } from '../../music/tune';
import type { App } from '../App';
import { actionBar, backButton, h, toast } from '../components/dom';
import { homeScreen } from './home';
import { songScreen } from './song';

/**
 * Thư viện bài hát — bé TỰ CHỌN bài (động lực nội tại: quyền lựa chọn).
 * Bài của các tuần sau hiện khóa 🔒 kèm số tuần; không mở khóa bằng sao.
 */
export function libraryScreen(app: App) {
  return (root: HTMLElement) => {
    const data = app.store.get();
    const week = data.progress.currentWeek;
    const card = (s: Tune) => {
      const open = (s.week ?? 1) <= week;
      const star = open && songMastered(data, s.id);
      return h(
        'button',
        {
          class: `song-card${open ? '' : ' locked'}`,
          type: 'button',
          onClick: () => (open ? playSong(app, s) : toast(s.week ? `🔒 Bài này mở ở Tuần ${s.week} nhé` : '🔒 Bài này mở sau nhé')),
        },
        h('div', { class: 'song-card-title' }, open ? `${star ? '⭐ ' : ''}${s.titleVi}` : `🔒 ${s.titleVi}`),
        h(
          'div',
          { class: 'song-card-sub' },
          // Dân ca: tên tiếng Việt đã ghi vùng miền — không lặp tên phiên âm tiếng Anh
          `${s.composer?.startsWith('Dân ca') ? 'Dân ca Việt Nam' : s.title}${s.hand === 'LH' ? ' · tay trái' : s.hand === 'BOTH' ? ' · hai tay' : ''}`,
        ),
        h('div', { class: 'song-card-week' }, star ? 'Đã thuộc!' : `Tuần ${s.week}`),
      );
    };
    root.append(
      h(
        'div',
        { class: 'screen' },
        h('header', { class: 'topbar' }, h('div', { class: 'topbar-title' }, '🎵 Bài hát của con')),
        h(
          'div',
          { class: 'library-wrap scrollable' },
          h('p', { class: 'muted lib-note' }, `⭐ Đã thuộc ${SONGS.filter((x) => songMastered(data, x.id)).length}/${SONGS.length} bài — thuộc = đàn trọn bài theo nhịp từ 60 trở lên.`),
          ...LEVELS.map((lv) =>
            h(
              'section',
              {},
              h('h2', { class: 'lib-level' }, lv.name),
              h('div', { class: 'library' }, ...SONGS.filter((x) => (x.week ?? 1) >= lv.weeks[0] && (x.week ?? 1) <= lv.weeks[1]).map(card)),
            ),
          ),
        ),
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
      // Bài mới (của tuần này/tuần trước) có gợi ý đầy đủ; bài cũ thì chỉ tên nốt (đổi được trong màn bài hát)
      { mode: 'wait', hints: week >= 7 && (s.week ?? 1) < week - 1 ? 'names' : 'full', free: true },
      { onRun: (run) => store.addSongRun(session.id, run), onDone: leave, onBack: leave },
    ),
  );
}
