/**
 * 🎮 "Trò chơi" — 3 trò ôn kiến thức đã học (OWNER duyệt 2026-10-07): ⚡ Đọc nốt nhanh · 🥁 Đố nhịp · 🎵 Nghe đoán bài.
 * (+ 2026-10-09, OWNER duyệt "Thêm trò chơi luyện tai & nhịp") 🎧 Đoán nốt · 🎢 Lên hay xuống? · 🎯 Bắt nhịp ·
 * 🔁 Đàn lại giai điệu — mỗi trò một chunk nạp muộn (màn chọn trò không nặng thêm).
 * Nội dung mỗi trò lấy theo giáo trình tới tuần hiện tại (chỉ điều con đã học). Kỷ lục lưu ở AppData.games.
 */
import { SONGS } from '../../music/tune';
import { GAME_IDS, GAME_INFO, gameLock, unlockedGames, type GameId } from '../../practice/games/catalog';
import { gameKey, gamePlayed, newGameIds, withSeen } from '../../lessons/discovery';
import { newPillOn } from '../components/newBadge';
import { speak } from '../../audio/voice';
import type { App, Screen } from '../App';
import { backButton, h, toast } from '../components/dom';
import { mascot } from '../components/mascot';
import { homeScreen } from './home';
import { noteRushScreen } from './games/noteRush';
import { rhythmQuizScreen } from './games/rhythmQuiz';
import { songGuessScreen } from './games/songGuess';
import { lazy, lazyScreen, prefetchLater } from '../lazy';
import '../../styles/games.css';

const earMod = lazy(() => import('./games/earGuess'));
const contourMod = lazy(() => import('./games/contour'));
const beatMod = lazy(() => import('./games/beatCatch'));
const echoMod = lazy(() => import('./games/echo'));

const SCREENS: Record<GameId, (app: App, onHub: () => void) => Screen> = {
  noteRush: noteRushScreen,
  rhythmQuiz: rhythmQuizScreen,
  songGuess: songGuessScreen,
  earGuess: (app, onHub) => lazyScreen(earMod, (m) => m.earGuessScreen(app, onHub)),
  contour: (app, onHub) => lazyScreen(contourMod, (m) => m.contourScreen(app, onHub)),
  beatCatch: (app, onHub) => lazyScreen(beatMod, (m) => m.beatCatchScreen(app, onHub)),
  echo: (app, onHub) => lazyScreen(echoMod, (m) => m.echoScreen(app, onHub)),
};

export function gamesScreen(app: App): Screen {
  return (root) => {
    app.mic.stop();
    const data = app.store.get();
    const toHub = () => app.show(gamesScreen(app));
    const card = (id: GameId) => {
      const info = GAME_INFO[id];
      const lock = gameLock(id, data, SONGS);
      const g = app.store.gameScore(id);
      const b = h(
        'button',
        { class: `game-card gc-${id}${lock ? ' locked' : ''}`, type: 'button', 'data-game': id, 'aria-disabled': lock ? 'true' : null },
        h('span', { class: 'gc-emoji', 'aria-hidden': 'true' }, lock ? '🔒' : info.emoji),
        h('span', { class: 'gc-title' }, info.title),
        h('span', { class: 'gc-hint' }, lock ?? info.hint),
        !lock
          ? h(
              'span',
              { class: `gc-best${g ? '' : ' none'}` },
              g ? `🏆 ${g.best} ${info.unit}` : '✨ Chơi thử nào!',
            )
          : null,
      );
      // (+ 2026-10-10) "Mới": trò đã mở mà con chưa chơi xong lượt nào (tắt sau lượt đầu)
      if (!lock && !gamePlayed(data, id)) newPillOn(b);
      b.addEventListener('click', () => {
        if (lock) {
          toast(lock);
          void speak(app, lock);
          return;
        }
        app.show(SCREENS[id](app, toHub));
      });
      return b;
    };
    root.append(
      h(
        'div',
        { class: 'screen games-hub' },
        h(
          'header',
          { class: 'games-top' },
          mascot('wave', 72),
          h('h1', { class: 'title' }, '🎮 Trò chơi'),
        ),
        h('div', { class: 'stage scrollable' }, h('div', { class: `game-cards n${GAME_IDS.length}` }, ...GAME_IDS.map(card))),
        h('div', { class: 'actions' }, backButton(() => app.show(homeScreen(app)))),
      ),
    );
    // (+ 2026-10-10) Con đã THẤY các trò mới ở đây → tắt chấm trên nút 🎮 ở màn chính (viên "Mới" trên thẻ vẫn còn tới khi chơi)
    const seen = withSeen(data, newGameIds(data, unlockedGames(data, SONGS)).map(gameKey));
    if (seen) app.store.updateSettings({ seenNew: seen });
    // Nạp ngầm các trò mới (offline đã có trong precache — đây chỉ để chạm là mở ngay)
    prefetchLater([earMod, contourMod, beatMod, echoMod]);
  };
}
