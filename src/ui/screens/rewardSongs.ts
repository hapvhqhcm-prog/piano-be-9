/**
 * (+ 2026-10-16, OWNER duyệt — rà soát của giáo viên có kinh nghiệm) "🎁 CHỌN 1 BÀI CON THÍCH" — màn chọn bài thưởng sau
 * một buổi suôn sẻ (nút ở màn kết buổi — sessionEnd.ts; không phải màn mừng, celebrationQueue không đổi). Chunk riêng.
 * 3–6 bài (lessons/rewardSongs.ts rewardChoices): bài con đã chơi và thích + MỘT bài "Mới". Chạm bài → chơi tự do
 * (Từng nốt; bài đã thuộc: theo nhịp ở tốc độ thoải mái — đổi được như ở Thư viện), gợi ý đầy đủ. Lượt chơi lưu trong buổi
 * `reward-song-<bài>` (như lượt Thư viện) nhưng KHÔNG tính tiêu chí tuần / "đã thuộc". Chơi xong → về màn chính.
 */
import { rewardChoices, rewardLessonId, rewardPlayOptions, type RewardChoice } from '../../lessons/rewardSongs';
import type { App, Screen } from '../App';
import { button, h } from '../components/dom';
import { newPillOn } from '../components/newBadge';
import { shortTitle, songEmoji } from '../components/songArt';
import { cancelSpeech, speak } from '../../audio/voice';
import { songScreen } from './song';
import '../../styles/kidux.css';
import '../../styles/rewardSongs.css';

export const REWARD_TITLE = '🎁 Chọn 1 bài con thích';

/** Chơi một bài thưởng: buổi riêng `reward-song-<bài>` (lượt vẫn lưu như ở Thư viện). */
export function playReward(app: App, c: RewardChoice, o: { onDone(): void; onBack(): void }): void {
  const store = app.store;
  const session = store.startSession(rewardLessonId(c.tune.id));
  const close = (then: () => void) => {
    app.mic.stop();
    const cur = store.get().sessions.find((x) => x.id === session.id);
    if (cur && cur.songRuns.length) store.finishSession(session.id);
    else store.discardSessionIfEmpty(session.id);
    then();
  };
  app.show(
    songScreen(
      app,
      c.tune,
      { ...rewardPlayOptions(c), free: true, intro: '🎁 Bài con chọn — đàn cho vui nhé!' },
      { onRun: (run) => store.addSongRun(session.id, run), onDone: () => close(o.onDone), onBack: () => close(o.onBack) },
    ),
  );
}

export function rewardSongsScreen(app: App, o: { exclude?: readonly string[]; onHome(): void }): Screen {
  return (root) => {
    const data = app.store.get();
    const choices = rewardChoices(data, o.exclude ?? []);
    const again = () => app.show(rewardSongsScreen(app, o));
    const stats = (c: RewardChoice) => (c.mastered ? 'Đã thuộc ⭐ · theo nhịp' : c.fresh ? 'Bài mới · từng nốt' : 'Từng nốt');
    const card = (c: RewardChoice) => {
      const el = h(
        'button',
        {
          class: `song-card reward-card${c.mastered ? ' is-star' : ''}`,
          type: 'button',
          onClick: () => playReward(app, c, { onDone: o.onHome, onBack: again }),
        },
        h('span', { class: 'song-card-emoji', 'aria-hidden': 'true' }, songEmoji(c.tune)),
        h('div', { class: 'song-card-title' }, h('span', {}, c.tune.vn ? h('span', { class: 'vn-flag' }, '🇻🇳 ') : '', shortTitle(c.tune))),
        h('div', { class: 'song-card-week' }, stats(c)),
      );
      return c.fresh ? newPillOn(el) : el;
    };
    root.append(
      h(
        'div',
        { class: 'screen reward-screen' },
        h('header', { class: 'topbar' }, h('div', { class: 'topbar-title' }, REWARD_TITLE)),
        h(
          'div',
          { class: 'reward-wrap scrollable' },
          h('p', { class: 'reward-lead' }, 'Phần thưởng cho buổi học hôm nay — con chọn bài nào cũng được, đàn cho vui nhé! 🎵'),
          choices.length
            ? h('div', { class: 'library reward-grid' }, ...choices.map(card))
            : h('p', { class: 'muted reward-lead' }, 'Chưa có bài nào — mai mình chọn nhé!'),
        ),
        h('div', { class: 'actions' }, button({ icon: '🌙', label: 'Để mai học tiếp', kind: 'primary', big: true, onTap: o.onHome })),
      ),
    );
    void speak(app, 'Con chọn một bài con thích nhé!');
    return () => cancelSpeech();
  };
}
