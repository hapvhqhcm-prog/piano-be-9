import type { App } from '../App';
import { newStickers, type Sticker } from '../../lessons/stickers';
import { bonusForSession, isLessonSession, lastFinishedSession, recapLine, sessionRecap, type BonusEvent } from '../../lessons/bonusStickers';
import { nextLesson, weekPlan } from '../../lessons/lessonEngine';
import { stickerArt } from '../components/art/stickerArt';
import { bonusStickerArt, eggArt } from '../components/art/bonusArt';
import { islandIcon } from '../components/art/islandArt';
import { mascot } from '../components/mascot';
import { confetti } from '../components/celebrate';
import { button, h } from '../components/dom';
import { cancelSpeech, speak } from '../../audio/voice';
import { stickersScreen } from './stickers';
import '../../styles/kidux.css';
import '../../styles/challenges.css';
import '../../styles/kidhome.css';
import { weeklyChallenge, type WeeklyChallenge } from '../../lessons/challenges';
import { lazy, lazyScreen } from '../lazy';
import '../../styles/concert.css';
import '../../styles/rewardSongs.css';
import { celebrations } from '../celebrationQueue';
import { endScreenPlan, markSurpriseDay, readSurpriseDay, surpriseFree, type EndOfferKind } from '../../lessons/kidRewards';
import { playLabel } from '../../lessons/todayLabel';
import { stepTitle } from '../../lessons/stepTitle';
import { sessionMemTake } from './sessionTakes';
import { albumStore, type AlbumMeta } from '../../progress/albumStore';
import { clipFromBlob, type TakeClip } from '../../audio/recorder';
import { RATING_STARS } from '../../progress/history';
import type { Session } from '../../progress/schema';

/**
 * KẾT THÚC BUỔI (§9): KHÔNG khóa, không đếm ngược, không trừ gì.
 * (2026-10-17, OWNER duyệt "Gộp phần thưởng, kết buổi 1 màn") MỘT màn duy nhất — không còn cảnh "cập bến đảo" riêng /
 * dải sticker riêng:
 *   ⭐ sao của buổi + dòng tóm tắt
 *   MỘT thẻ nổi bật (lessons/kidRewards.endScreenPlan: cập bến đảo > cúp tuần > trứng / chào mừng > sticker mới)
 *   + một dòng "+N sticker mới trong sổ 📒" cho các thứ mới còn lại (vẫn đã nhận — chỉ không bày ra hết)
 *   🎧 Nghe con vừa đàn (bản thu của buổi này trong Album, nếu có) · Ngày mai: 🎵 <bài>
 *   tối đa MỘT lời mời (session chọn qua sessionFlow.pickEndOffer: ⭐ thử thách > 🎁 bài thưởng > 🎤 biểu diễn)
 *   ↻ Chơi lại (nhỏ) · 🌙 Để mai học tiếp (nút chính)
 * Một bất ngờ mỗi ngày: trứng đã có bất ngờ hôm nay (vd màn 🎁 Quà mới) → không bày quả trứng, chỉ đếm vào dòng "+N".
 */

// (+ 2026-10-08) 🎤 Biểu diễn cho cả nhà — chunk riêng (kéo theo sân khấu), nạp trước khi màn kết có lời mời
const concertMod = lazy(() => import('./concert'));

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

/** MỘT sticker mới (thẻ nổi bật) — chạm để xem sổ. */
function stickerReveal(app: App, s: Sticker): HTMLElement {
  return h(
    'button',
    { class: 'sticker-reveal', type: 'button', onClick: () => app.show(stickersScreen(app)), 'aria-label': `Sticker mới: ${s.title} — xem sổ sticker` },
    h('div', { class: 'sticker-reveal-pics' }, h('div', { class: 'sticker-reveal-item', style: { animationDelay: '0.35s' } }, stickerArt(s, true), h('span', {}, s.title))),
    h(
      'div',
      { class: 'sticker-reveal-text' },
      h('div', { class: 'sticker-reveal-title' }, 'Con nhận được sticker mới!'),
      h('div', { class: 'sticker-reveal-sub' }, 'Chạm để xem sổ sticker 📒'),
    ),
  );
}

/** Cập bến đảo mới — thẻ trên CÙNG màn kết (thay cảnh chạy riêng trước đây). */
function islandCard(app: App, toWeek: number, banner: string | undefined): HTMLElement {
  const plan = weekPlan(toWeek);
  let art: Node | string = plan.islandEmoji;
  try {
    art = islandIcon(toWeek, 'current');
  } catch {
    art = plan.islandEmoji;
  }
  return h(
    'button',
    { class: 'end-island', type: 'button', onClick: () => app.show(stickersScreen(app)), 'aria-label': `Con đã tới ${plan.island} — xem sổ sticker` },
    h('div', { class: 'end-island-art', 'aria-hidden': 'true' }, art, h('div', { class: 'end-island-pin' }, mascot('cheer', 44))),
    h(
      'div',
      { class: 'end-island-text' },
      h('div', { class: 'end-island-title' }, `🏝️ Con đã tới ${plan.island}!`),
      // Giữ lời 🏅/🎉 của session (lớp .banner — scripts/e2e.mjs đọc để biết đã sang tuần)
      banner ? h('div', { class: 'banner end-island-banner' }, banner) : null,
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

/** Sao của buổi (1–3): bé tự đánh giá → sao như màn chính (RATING_STARS); chưa có → sao tóm tắt (không bao giờ dưới 1). */
export function sessionStars(sess: Readonly<Session> | null): number {
  if (!sess) return 3;
  if (sess.selfRating) return Math.max(1, Math.min(3, RATING_STARS[sess.selfRating] ?? 3));
  return sessionRecap(sess).stars;
}

/**
 * Bản thu hay nhất CỦA BUỔI NÀY trong Album: bài có lượt trong buổi, lưu từ lúc buổi bắt đầu. null = không có.
 * Hàm thuần (test) — album lưu bản hay hơn bản cũ nên "lưu trong buổi" = lượt hay nhất của bài đó tới giờ.
 */
export function sessionTake(list: readonly AlbumMeta[], sess: Readonly<Pick<Session, 'startedAt' | 'songRuns'>> | null): AlbumMeta | null {
  if (!sess) return null;
  const songs = new Set(sess.songRuns.map((r) => r.songId));
  let best: AlbumMeta | null = null;
  for (const m of list) {
    if (!songs.has(m.songId) || m.savedAt < sess.startedAt) continue;
    if (!best || m.stars > best.stars || (m.stars === best.stars && m.accuracy > best.accuracy)) best = m;
  }
  return best;
}

/**
 * Nút "🎧 Nghe con vừa đàn" — bản ghi của BUỔI NÀY: bản hay nhất / bản cuối trong bộ nhớ (sessionTakes — có cả khi Album
 * không lưu bản mới), không có thì bản Album lưu trong buổi (tìm bất đồng bộ). Không có bản nào → không hiện gì.
 */
function listenSlot(app: App, sess: Session | null, alive: () => boolean): { el: HTMLElement; stop(): void } {
  const el = h('div', { class: 'end-listen-slot' });
  let clip: TakeClip | null = null;
  const stop = () => {
    clip?.stopPlayback();
    clip?.dispose();
    clip = null;
  };
  if (!sess) return { el, stop };
  const show = (title: string, load: () => Promise<TakeClip | null>) => {
    if (!alive() || el.querySelector('.end-listen')) return;
    const look = (icon: string, label: string) => {
      b.querySelector('.btn-icon')!.textContent = icon;
      b.querySelector('.btn-label')!.textContent = label;
    };
    const b = button({
      icon: '🎧',
      label: 'Nghe con vừa đàn',
      onTap: async () => {
        if (clip) {
          stop();
          return look('🎧', 'Nghe con vừa đàn');
        }
        const c = await load().catch(() => null);
        if (!c || !alive()) return;
        clip = c;
        look('⏸', 'Dừng');
        const mine = clip;
        await mine.play().catch(() => undefined);
        if (clip === mine) {
          stop();
          look('🎧', 'Nghe con vừa đàn');
        }
      },
    });
    b.classList.add('end-listen');
    b.setAttribute('aria-label', title ? `Nghe con vừa đàn ${title}` : 'Nghe con vừa đàn');
    el.append(b);
  };
  const tryMem = () => {
    const mem = sessionMemTake(sess.startedAt);
    if (mem) show(mem.title, async () => clipFromBlob(mem.blob, mem.seconds, app.audio));
    return !!mem;
  };
  if (tryMem()) return { el, stop };
  const store = sess.songRuns.length ? albumStore() : null;
  // Bản ghi của lượt cuối thường tới SAU khi màn này mở (MediaRecorder dừng bất đồng bộ) → thử lại một lần
  const later = setTimeout(() => {
    if (alive() && !el.querySelector('.end-listen')) tryMem();
  }, 1200);
  void (store ? store.list() : Promise.resolve([] as AlbumMeta[]))
    .then((list) => sessionTake(list, sess))
    .then((m) => {
      if (!m || !store) return;
      if (tryMem()) return;
      show(m.title, async () => {
        const t = await store.get(m.songId).catch(() => null);
        return t ? clipFromBlob(new Blob([t.data], { type: m.mime }), m.seconds, app.audio) : null;
      });
    })
    .catch(() => undefined);
  return {
    el,
    stop: () => {
      clearTimeout(later);
      stop();
    },
  };
}

export function sessionEndScreen(
  app: App,
  o: {
    banner?: string;
    stickersBefore?: readonly string[];
    /** Buổi vừa xong (mặc định: buổi hoàn thành gần nhất) */
    sessionId?: string;
    /** Tuần TRƯỚC buổi này — có và khác tuần hiện tại → thẻ "cập bến đảo mới" (mặc định: suy ra từ banner) */
    weekBefore?: number;
    /**
     * (+ 2026-10-16, OWNER duyệt) Buổi suôn sẻ → nút "🎁 Chọn 1 bài con thích" (lessons/rewardSongs.ts) — một NÚT, không phải
     * màn mừng (celebrationQueue không đổi). Không có → không hiện.
     */
    onReward?: () => void;
    /** (+ 2026-10-16, OWNER duyệt "Tự cân độ khó") ⭐ Thử thách nhỏ TÙY CHỌN khi bé đang làm rất tốt — một nút; không có → không hiện. */
    stretch?: { label: string; onTap: () => void };
    /**
     * (+ 2026-10-17) 🎤 Mời biểu diễn cho cả nhà (tuần — lessons/concert.concertOfferWeek). session.ts chọn TỐI ĐA MỘT nút mời
     * (sessionFlow.pickEndOffer: thử thách nhỏ > bài thưởng > biểu diễn) rồi chỉ truyền nút đó. Không có → không mời.
     */
    concertWeek?: number | null;
    onReplay(): void;
    onHome(): void;
  },
) {
  return (root: HTMLElement) => {
    const data = app.store.get();
    const today = app.store.today();
    const fresh0 = o.stickersBefore ? newStickers(o.stickersBefore, data) : [];
    // (+ 2026-10-07) 🏆 Mừng hoàn thành thử thách tuần MỘT lần: vừa nhận cúp ở buổi này, hoặc xong ở chỗ khác (Thư viện,
    // trò chơi…) mà chưa được mừng. Thẻ mừng thay cho ô "Cúp tuần" trong sticker mới (không lặp hai lần).
    const wc = weeklyChallenge(data, today);
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
    // TỐI ĐA MỘT lời mời (session đã chọn; ở đây giữ đúng thứ tự phòng khi nơi gọi truyền nhiều)
    const concertWeek = o.concertWeek ?? null;
    const offer: EndOfferKind | null = o.stretch ? 'stretch' : o.onReward ? 'reward' : concertWeek !== null ? 'concert' : null;
    const plan = endScreenPlan({
      advanced,
      fromWeek: from,
      toWeek: week,
      cheer,
      fresh,
      bonus,
      surpriseFree: surpriseFree(readSurpriseDay(), today),
      offer,
    });
    if (plan.usesSurprise) markSurpriseDay(today);
    // (+ 2026-10-09) Lần mở app này đã có màn mừng → màn "🎁 Quà mới" ở màn chính để dành tới lần mở sau (celebrationQueue)
    if (plan.celebrate) celebrations.mark();
    if (offer === 'concert') concertMod.prefetch();
    const openConcert = (w: number) => app.show(lazyScreen(concertMod, (m) => m.concertScreen(app, { week: w, onDone: o.onHome })));
    const stars = sessionStars(sess);
    // "Ngày mai: 🎵 …" — bài kế tiếp sau buổi này (cùng quy tắc với nút ▶ ở màn chính)
    let tomorrow: string | null = null;
    try {
      const nl = playLabel(nextLesson(data), data, { stepTitle });
      tomorrow = `${nl.icon} ${nl.text}`;
    } catch {
      tomorrow = null;
    }
    let disposed = false;
    const listen = listenSlot(app, sess, () => !disposed && root.isConnected);

    const hl = plan.highlight;
    const highlightEl =
      hl?.kind === 'island'
        ? islandCard(app, hl.toWeek, o.banner)
        : hl?.kind === 'cup'
          ? challengeWin(app, wc)
          : hl?.kind === 'egg' || hl?.kind === 'welcome'
            ? bonusCard(app, hl.bonus)
            : hl?.kind === 'sticker'
              ? stickerReveal(app, hl.sticker)
              : null;
    const offerEl =
      offer === 'stretch' && o.stretch
        ? button({ icon: '⭐', label: o.stretch.label, onTap: o.stretch.onTap })
        : offer === 'reward' && o.onReward
          ? button({ icon: '🎁', label: 'Chọn 1 bài con thích', kind: 'sun', onTap: o.onReward })
          : offer === 'concert' && concertWeek !== null
            ? button({ icon: '🎤', label: 'Biểu diễn cho cả nhà', kind: 'sun', onTap: () => openConcert(concertWeek) })
            : null;

    confetti(hl?.kind === 'island' || hl?.kind === 'cup' ? 90 : hl ? 60 : 36);
    root.append(
      h(
        'div',
        { class: `screen center end-one${hl ? ' has-stickers' : ''}` },
        h('div', { class: 'hero-mascot' }, mascot('cheer', hl ? 84 : 130)),
        h('h1', { class: 'hero-title' }, 'Con đã hoàn thành buổi hôm nay'),
        h(
          'div',
          { class: 'end-stars', 'aria-label': `Buổi này con được ${stars} sao` },
          h('span', { class: 'end-stars-row', 'aria-hidden': 'true' }, ...[0, 1, 2].map((i) => h('span', { class: `end-star${i < stars ? ' on' : ''}` }, '⭐'))),
          recap ? h('span', { class: 'recap-line' }, '🎹 ', recap) : null,
        ),
        // Banner không phải "sang đảo" (vd lời nhắn của buổi) vẫn hiện; banner sang đảo nằm trong thẻ đảo
        o.banner && hl?.kind !== 'island' ? h('div', { class: 'banner' }, o.banner) : null,
        highlightEl ? h('div', { class: 'end-rewards' }, highlightEl) : null,
        plan.more > 0
          ? h(
              'button',
              { class: 'end-more', type: 'button', onClick: () => app.show(stickersScreen(app)) },
              `+${plan.more} sticker mới trong sổ 📒`,
            )
          : null,
        h(
          'div',
          { class: 'end-next-row' },
          listen.el,
          tomorrow ? h('div', { class: 'end-tomorrow', 'data-test': 'tomorrow' }, h('span', { class: 'end-tomorrow-k' }, 'Ngày mai:'), ` ${tomorrow}`) : null,
        ),
        offerEl ? h('div', { class: 'end-reward end-offer' }, offerEl) : null,
        // .end-actions: scripts/e2e.mjs nhận ra màn kết buổi bằng lớp này
        h(
          'div',
          { class: 'end-actions' },
          ((b) => (b.classList.add('end-replay'), b))(button({ icon: '↻', label: 'Chơi lại', onTap: o.onReplay })),
          button({ icon: '🌙', label: 'Để mai học tiếp', kind: 'primary', big: true, onTap: o.onHome }),
        ),
      ),
    );
    // Bé đọc chậm → đọc to dòng tóm tắt
    const cheerText = cheer ? ' Con hoàn thành thử thách tuần rồi! Giỏi quá!' : '';
    const islandText = hl?.kind === 'island' ? ` Con đã tới ${weekPlan(hl.toWeek).island}!` : '';
    const timer =
      recap || cheer || islandText
        ? window.setTimeout(() => void speak(app, `Con đã hoàn thành buổi hôm nay!${islandText}${recap ? ` ${recap}` : ''}${cheerText}`), 500)
        : 0;
    return () => {
      disposed = true;
      listen.stop();
      window.clearTimeout(timer);
      cancelSpeech();
    };
  };
}
