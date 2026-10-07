import type { App } from '../App';
import { newStickers, type Sticker } from '../../lessons/stickers';
import { bonusForSession, isLessonSession, lastFinishedSession, recapLine, sessionRecap, type BonusEvent } from '../../lessons/bonusStickers';
import { weekPlan } from '../../lessons/lessonEngine';
import { stickerArt } from '../components/art/stickerArt';
import { bonusStickerArt, eggArt } from '../components/art/bonusArt';
import { islandArrival } from '../components/arrival';
import { mascot } from '../components/mascot';
import { confetti } from '../components/celebrate';
import { button, h } from '../components/dom';
import { cancelSpeech, speak } from '../../audio/voice';
import { stickersScreen } from './stickers';
import '../../styles/kidux.css';
import '../../styles/challenges.css';
import { weeklyChallenge, type WeeklyChallenge } from '../../lessons/challenges';

const KIND_ORDER: Sticker['kind'][] = ['challenge', 'medal', 'songs', 'week', 'streak', 'folk', 'mic', 'dynamics', 'island'];
/** (+ 2026-10-07) Tuần (thứ 2) đã mừng "hoàn thành thử thách tuần" — chỉ là tiện ích trong máy (mất thì mừng thêm tối đa một lần). */
const CHEERED_KEY = 'piano-be-9:challenge-cheered';
function cheeredFor(monday: string): boolean {
  try {
    return localStorage.getItem(CHEERED_KEY) === monday;
  } catch {
    return true; // không có bộ nhớ → chỉ mừng khi vừa nhận cúp (sticker mới)
  }
}
function markCheered(monday: string): void {
  try {
    localStorage.setItem(CHEERED_KEY, monday);
  } catch {
    /* bỏ qua */
  }
}

/** Thẻ "🏆 Con hoàn thành thử thách tuần!" (cúp của thử thách + tên thử thách). */
function challengeWin(app: App, c: WeeklyChallenge): HTMLElement {
  return h(
    'button',
    { class: 'chal-win', type: 'button', onClick: () => app.show(stickersScreen(app)), 'aria-label': 'Con hoàn thành thử thách tuần — xem sổ sticker' },
    h('div', { class: 'chal-win-cup', 'aria-hidden': 'true' }, stickerArt({ id: 'challenge-win', kind: 'challenge', title: '', hint: '', earned: true, challenge: c.id }, true)),
    h(
      'div',
      { class: 'sticker-reveal-text' },
      h('div', { class: 'chal-win-title' }, '🏆 Con hoàn thành thử thách tuần!'),
      h('div', { class: 'chal-win-sub' }, `${c.icon} ${c.title} · Cúp tuần đã vào sổ sticker 📒`),
    ),
  );
}
/** Số lần chạm để nở trứng */
const EGG_TAPS = 3;

/** Khoảnh khắc "Con nhận được sticker mới!" — tối đa 3 sticker hiện ra lần lượt. */
function stickerReveal(app: App, fresh: Sticker[], max = 3): HTMLElement {
  // Thành tích hiếm trước; đảo: đảo mới nhất trước
  const list = [...fresh].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (b.week ?? 0) - (a.week ?? 0) || (b.n ?? 0) - (a.n ?? 0),
  );
  const shown = list.slice(0, max);
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

/** Sticker bất ngờ: buổi đầu = "Chào mừng" (hiện ngay); các buổi khác = quả trứng lắc lư, chạm 3 lần để nở. */
function bonusCard(app: App, ev: BonusEvent): HTMLElement {
  const reveal = (card: HTMLElement, first: boolean) => {
    card.className = 'bonus-card opened';
    card.replaceChildren(
      h('div', { class: 'bonus-pic' }, bonusStickerArt(ev.sticker)),
      h(
        'div',
        { class: 'bonus-text' },
        h('div', { class: 'bonus-title' }, first ? '🎁 Sticker Chào mừng!' : `🎁 ${ev.sticker.title}!`),
        h('div', { class: 'bonus-sub' }, first ? 'Buổi học đầu tiên — chào mừng con!' : 'Đã dán vào sổ sticker 📒'),
      ),
    );
  };
  if (ev.kind === 'welcome') {
    const card = h('div', { class: 'bonus-card' });
    reveal(card, true);
    return card;
  }
  let taps = 0;
  const pic = h('div', { class: 'bonus-pic egg-wobble' }, eggArt(0));
  const hint = h('div', { class: 'bonus-sub' }, `Chạm ${EGG_TAPS} lần để mở!`);
  const card: HTMLButtonElement = h(
    'button',
    {
      class: 'bonus-card egg',
      type: 'button',
      'aria-label': 'Quả trứng bí ẩn — chạm để mở',
      onClick: () => {
        if (card.classList.contains('opened')) return app.show(stickersScreen(app));
        taps++;
        void app.audio.playPitch(taps === 1 ? 'E5' : taps === 2 ? 'G5' : 'C6', 0.25);
        if (taps < EGG_TAPS) {
          pic.replaceChildren(eggArt(taps));
          pic.classList.remove('egg-shake');
          void pic.offsetWidth;
          pic.classList.add('egg-shake');
          hint.textContent = `Còn ${EGG_TAPS - taps} lần nữa!`;
          return;
        }
        reveal(card, false);
        confetti(40);
        void app.audio.chime();
        void speak(app, `Oa! Con nhận được sticker ${ev.sticker.title}!`);
      },
    },
    pic,
    h('div', { class: 'bonus-text' }, h('div', { class: 'bonus-title' }, '🥚 Quả trứng bí ẩn!'), hint),
  );
  return card;
}

/** Kết thúc buổi (§9): KHÔNG khóa, không đếm ngược, không trừ gì. */
export function sessionEndScreen(
  app: App,
  o: {
    banner?: string;
    stickersBefore?: readonly string[];
    /** Buổi vừa xong (mặc định: buổi hoàn thành gần nhất) */
    sessionId?: string;
    /** Tuần TRƯỚC buổi này — có và khác tuần hiện tại → cảnh "cập bến đảo mới" (mặc định: suy ra từ banner) */
    weekBefore?: number;
    onReplay(): void;
    onHome(): void;
  },
) {
  return (root: HTMLElement) => {
    const data = app.store.get();
    const fresh0 = o.stickersBefore ? newStickers(o.stickersBefore, data) : [];
    // (+ 2026-10-07) 🏆 Mừng hoàn thành thử thách tuần MỘT lần: vừa nhận cúp ở buổi này, hoặc xong ở chỗ khác (Thư viện,
    // trò chơi…) mà chưa được mừng. Thẻ mừng thay cho ô "Cúp tuần" trong dải sticker mới (không lặp hai lần).
    const wc = weeklyChallenge(data, app.store.today());
    const cheer = wc.done && (fresh0.some((s) => s.kind === 'challenge' && s.monday === wc.monday) || !cheeredFor(wc.monday));
    if (cheer) markCheered(wc.monday);
    const fresh = cheer ? fresh0.filter((s) => !(s.kind === 'challenge' && s.monday === wc.monday)) : fresh0;
    const sess = o.sessionId ? (data.sessions.find((s) => s.id === o.sessionId) ?? null) : lastFinishedSession(data);
    const recap = sess ? recapLine(sessionRecap(sess)) : null;
    const bonus = sess && isLessonSession(sess) ? bonusForSession(data, sess.id) : null;
    // Sang tuần mới: session.ts báo bằng banner 🏅 / 🎉 (đã setCurrentWeek trước khi mở màn này)
    const week = data.progress.currentWeek;
    const from = o.weekBefore ?? (o.banner && /^(🏅|🎉)/u.test(o.banner) ? week - 1 : week);
    const advanced = from >= 1 && from < week;
    const rewards = fresh.length > 0 || !!bonus || cheer;
    let timer = 0;

    const content = () => {
      confetti(cheer ? 90 : o.banner || rewards ? 60 : 36);
      root.append(
        h(
          'div',
          { class: `screen center${rewards ? ' has-stickers' : ''}` },
          h('div', { class: 'hero-mascot' }, mascot('cheer', rewards ? 96 : 150)),
          h('h1', { class: 'hero-title' }, 'Con đã hoàn thành buổi hôm nay'),
          recap ? h('div', { class: 'recap-line' }, '🎹 ', recap) : null,
          o.banner ? h('div', { class: 'banner' }, o.banner) : null,
          rewards
            ? h(
                'div',
                { class: 'end-rewards' },
                cheer ? challengeWin(app, wc) : null,
                fresh.length ? stickerReveal(app, fresh, bonus || cheer ? 2 : 3) : null,
                bonus ? bonusCard(app, bonus) : null,
              )
            : null,
          h(
            'div',
            { class: 'end-actions' },
            button({ icon: '↻', label: 'Chơi lại bài vừa học', big: true, onTap: o.onReplay }),
            button({ icon: '🌙', label: 'Để mai học tiếp', kind: 'primary', big: true, onTap: o.onHome }),
          ),
        ),
      );
      // Bé đọc chậm → đọc to dòng tóm tắt
      const cheerText = cheer ? ' Con hoàn thành thử thách tuần rồi! Giỏi quá!' : '';
      if (recap || cheer) timer = window.setTimeout(() => void speak(app, `Con đã hoàn thành buổi hôm nay!${recap ? ` ${recap}` : ''}${cheerText}`), 500);
    };

    if (advanced) {
      const plan = weekPlan(week);
      root.append(islandArrival({ fromWeek: from, toWeek: week, toName: plan.island, toEmoji: plan.islandEmoji }, content));
    } else content();
    return () => {
      window.clearTimeout(timer);
      cancelSpeech();
    };
  };
}
