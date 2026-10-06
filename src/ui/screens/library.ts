import { songEverPlayed, songFresh, songMastered } from '../../lessons/lessonEngine';
import { starsFor } from '../../music/timing';
import { SONGS, type Tune } from '../../music/tune';
import { compositionToTune } from '../../practice/compose';
import { PRIVACY_NOTE, parentSongToTune } from '../../practice/parentSongs';
import type { Composition, ParentSong } from '../../progress/schema';
import type { App } from '../App';
import { actionBar, backButton, h, toast } from '../components/dom';
import { homeScreen } from './home';
import { songScreen } from './song';
import { shortTitle, songEmoji } from '../components/songArt';
import '../../styles/parentSongs.css';
import '../../styles/kidux.css';

/** Bộ lọc Thư viện (giữ trong lúc mở app): tất cả · 🇻🇳 Bài Việt Nam */
let libFilter: 'all' | 'vn' = 'all';

/**
 * Thư viện bài hát — bé TỰ CHỌN bài (động lực nội tại: quyền lựa chọn).
 * Bài của các tuần sau hiện khóa 🔒 kèm số tuần; không mở khóa bằng sao.
 */
export function libraryScreen(app: App) {
  return (root: HTMLElement) => {
    const data = app.store.get();
    const week = data.progress.currentWeek;
    // Số sao tốt nhất của từng bài (lượt chơi cả bài — không tính lượt tách tay)
    const best = new Map<string, number>();
    for (const ses of data.sessions)
      for (const r of ses.songRuns) {
        if (r.hand || r.total <= 0) continue;
        const st = starsFor(r.hits / r.total);
        if (st > (best.get(r.songId) ?? 0)) best.set(r.songId, st);
      }
    const card = (s: Tune) => {
      const open = (s.week ?? 1) <= week;
      const star = open && songMastered(data, s.id);
      // v5: đã thuộc nhưng lâu (> 3 tuần) chưa chơi lại → sao mờ, nhắc ôn (sticker vẫn giữ "đã từng thuộc")
      const faded = star && !songFresh(s.id, data);
      const nStars = star ? 3 : (best.get(s.id) ?? 0);
      if (!open) {
        // Bài chưa mở: BÓNG bí ẩn (emoji mờ + "?") — bé biết sắp có bài mới, không cần đọc chữ
        return h(
          'button',
          {
            class: 'song-card locked',
            type: 'button',
            'aria-label': `Bài khóa — mở ở Tuần ${s.week ?? '?'}`,
            onClick: () => toast(s.week ? `🔒 Bài này mở ở Tuần ${s.week} nhé` : '🔒 Bài này mở sau nhé'),
          },
          h('span', { class: 'song-card-emoji', 'aria-hidden': 'true' }, songEmoji(s)),
          h('div', { class: 'song-card-title' }, '? ? ?'),
          h('div', { class: 'song-card-week' }, `🔒 Tuần ${s.week}`),
        );
      }
      return h(
        'button',
        {
          class: `song-card${star ? ' is-star' : ''}`,
          type: 'button',
          onClick: () => playSong(app, s),
        },
        h('span', { class: 'song-card-emoji', 'aria-hidden': 'true' }, songEmoji(s)),
        h(
          'div',
          { class: 'song-card-title' },
          h('span', {}, s.vn ? h('span', { class: 'vn-flag', title: 'Bài Việt Nam' }, '🇻🇳 ') : '', shortTitle(s)),
        ),
        h(
          'div',
          { class: `song-card-stars${faded ? ' star-faded' : ''}`, 'aria-label': `${nStars} trên 3 sao` },
          '★'.repeat(nStars),
          h('span', { class: 'stars-off' }, '★'.repeat(3 - nStars)),
        ),
        h(
          'div',
          { class: 'song-card-sub' },
          // Dân ca Việt Nam: tên tiếng Việt đã ghi vùng miền — không lặp tên phiên âm (dân ca nước ngoài ghi đúng nước:
          // "Dân ca Pháp" — trước 2026-10-06 mọi bài "Dân ca …" đều hiện nhầm là "Dân ca Việt Nam"). Bài app tự sáng tác: không hiện tên tiếng Anh.
          // Bài nổi tiếng: tên nhạc sĩ (bố mẹ dễ nhận ra) thay cho tên tiếng Anh dài.
          `${s.vn === 'folk' ? 'Dân ca Việt Nam' : s.composer?.startsWith('Bài tự sáng tác') ? 'Bài sáng tác cho bé' : (s.composer ?? s.title).replace(/\s*\(.*\)$/, '').replace(/\s*".*"/, '')}${s.hand === 'LH' ? ' · tay trái' : s.hand === 'BOTH' ? ' · hai tay' : ''}`,
        ),
        // Tên Việt quen gọi khác (vd "Sao nhỏ lấp lánh") — chỉ tên, không có lời
        open && s.aka ? h('div', { class: 'song-card-aka' }, `còn gọi: “${s.aka}”`) : null,
        h('div', { class: 'song-card-week' }, faded ? 'Ôn lại nhé!' : star ? 'Đã thuộc!' : `Tuần ${s.week}`),
      );
    };
    // v5 — "🎼 Bài của con": bài bé tự sáng tác (trò Sáng tác), mới nhất trước; chạm để chơi như bài hát
    const mine = [...(data.compositions ?? [])].sort((a, b) => b.createdAt - a.createdAt);
    const compCard = (c: Composition) => {
      const d = new Date(c.createdAt);
      const bars = Math.round(c.notes.reduce((s, n) => s + n.beats, 0) / (Number(c.timeSignature.split('/')[0]) || 4));
      return h(
        'button',
        { class: 'song-card comp-card', type: 'button', onClick: () => playSong(app, compositionToTune(c)) },
        h('div', { class: 'song-card-title' }, h('span', {}, '🎼 ', c.title)),
        h('div', { class: 'song-card-sub' }, `Con sáng tác · ${bars} ô nhịp`),
        h('div', { class: 'song-card-week' }, `📅 ${d.getDate()} thg ${d.getMonth() + 1}`),
      );
    };
    // "📝 Bài bố mẹ thêm": bài bố mẹ tự nhập (chỉ lưu trên iPad này) — sửa/xóa ở màn Phụ huynh
    const parents = [...(data.parentSongs ?? [])].sort((a, b) => b.createdAt - a.createdAt);
    const parentCard = (c: ParentSong) => {
      const t = parentSongToTune(c);
      const bars = Math.round(c.notes.reduce((s, n) => s + n.beats, 0) / (Number(c.timeSignature.split('/')[0]) || 4));
      return h(
        'button',
        { class: 'song-card parent-song-card', type: 'button', onClick: () => playSong(app, t) },
        h('div', { class: 'song-card-title' }, h('span', {}, '📝 ', c.title)),
        h('div', { class: 'song-card-sub' }, `Bố mẹ thêm · ${bars} ô nhịp${t.hand === 'LH' ? ' · tay trái' : ''}`),
        h('div', { class: 'song-card-week' }, `Nhịp ${c.timeSignature}`),
      );
    };
    const parentSection = parents.length
      ? h(
          'section',
          { class: 'lib-parent' },
          h('h2', { class: 'lib-level' }, '📝 Bài bố mẹ thêm'),
          h('p', { class: 'lib-private' }, `🔒 ${PRIVACY_NOTE}`),
          h('div', { class: 'library' }, ...parents.map(parentCard)),
        )
      : null;
    const chip = (label: string, on: boolean, f: 'all' | 'vn') =>
      h(
        'button',
        {
          class: `seg-btn small${on ? ' on' : ''}`,
          type: 'button',
          'aria-pressed': String(on),
          onClick: () => {
            libFilter = f;
            app.show(libraryScreen(app));
          },
        },
        label,
      );
    const filterBar = h('div', { class: 'lib-filter', role: 'group', 'aria-label': 'Lọc bài' }, chip('🎵 Tất cả', libFilter === 'all', 'all'), chip('🇻🇳 Bài Việt Nam', libFilter === 'vn', 'vn'));
    const grid = (title: string, list: readonly Tune[]) =>
      list.length ? h('section', {}, h('h2', { class: 'lib-level' }, title), h('div', { class: 'library' }, ...list.map(card))) : null;
    const vnSections = [
      grid('🇻🇳 Dân ca Việt Nam', SONGS.filter((x) => x.vn === 'folk')),
      // Ca khúc nhạc sĩ Việt Nam đã thuộc về công chúng (Luật SHTT Điều 43): ghi tên nhạc sĩ trên thẻ, chỉ giai điệu
      grid('🎼 Nhạc sĩ Việt Nam xưa', SONGS.filter((x) => x.vn === 'composed')),
      grid('🎶 Bài quen hát lời Việt', SONGS.filter((x) => x.vn === 'lyrics')),
      parentSection,
      parents.length ? null : h('p', { class: 'muted lib-note' }, '📝 Bố mẹ có thể thêm bài con thích ở màn Phụ huynh → "📝 Thêm bài hát".'),
    ];
    // Playtest 2026-10: bé thấy NGAY bài đang tập + bài đã thuộc; bài đã mở khác ở dưới; bài chưa mở gom vào "Sắp mở" (gập)
    const isOpen = (x: Tune) => (x.week ?? 1) <= week;
    const learned = SONGS.filter((x) => isOpen(x) && songMastered(data, x.id));
    const current = SONGS.filter(
      (x) => isOpen(x) && !songMastered(data, x.id) && ((x.week ?? 1) >= week - 1 || songEverPlayed(data, x.id)),
    ).sort((a, b) => (b.week ?? 0) - (a.week ?? 0));
    const shown = new Set([...learned, ...current]);
    const otherOpen = SONGS.filter((x) => isOpen(x) && !shown.has(x)).sort((a, b) => (b.week ?? 0) - (a.week ?? 0));
    const locked = SONGS.filter((x) => !isOpen(x));
    const soon = locked.length
      ? h(
          'details',
          // Chưa mở bài nào (tuần 1): mở sẵn để bé thấy "sắp có bài"
          { class: 'lib-soon', ...(learned.length + current.length + otherOpen.length === 0 ? { open: true } : {}) },
          h('summary', { class: 'lib-level' }, `🔒 Sắp mở (${locked.length} bài)`),
          h('div', { class: 'library' }, ...locked.map(card)),
        )
      : null;
    const levelSections = [
      grid('🎯 Bài con đang tập', current),
      grid('⭐ Bài con đã thuộc', learned),
      grid('📚 Bài khác đã mở', otherOpen),
      soon,
    ];
    const mineSection = mine.length
      ? h('section', { class: 'lib-mine' }, h('h2', { class: 'lib-level' }, '🎼 Bài con sáng tác'), h('div', { class: 'library' }, ...mine.map(compCard)))
      : null;
    root.append(
      h(
        'div',
        { class: 'screen' },
        h('header', { class: 'topbar' }, h('div', { class: 'topbar-title' }, '🎵 Bài hát của con')),
        h(
          'div',
          { class: 'library-wrap scrollable' },
          h('p', { class: 'muted lib-note' }, `⭐ Đã thuộc ${SONGS.filter((x) => songMastered(data, x.id)).length}/${SONGS.length} bài — thuộc = đàn trọn bài theo nhịp từ 60 trở lên.`),
          filterBar,
          ...(libFilter === 'vn' ? vnSections : [mineSection, parentSection, ...levelSections]),
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
      // Bài con tự sáng tác (không có tuần) → luôn gợi ý đầy đủ
      { mode: 'wait', hints: week >= 8 && (s.week ?? week) < week - 1 ? 'names' : 'full', free: true },
      { onRun: (run) => store.addSongRun(session.id, run), onDone: leave, onBack: leave },
    ),
  );
}
