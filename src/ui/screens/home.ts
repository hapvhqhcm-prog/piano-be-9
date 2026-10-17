import { mascot } from '../components/mascot';
import { islandCardText, readSeenWeek, seaLayers, trailDots, trailLayer, trailStart, writeSeenWeek } from '../components/mapMotion';
import {
  MAX_SESSIONS_PER_DAY,
  WEEKS,
  criterionProgress,
  dailyLesson,
  levelOf,
  minutesToday,
  nextLesson,
  sessionsToday,
  weekComplete,
  weekPassed,
  weekPlan,
} from '../../lessons/lessonEngine';
import type { Lesson } from '../../lessons/types';
import type { App, Screen } from '../App';
import { button, h, toast } from '../components/dom';
import { parentButton } from '../components/longPress';
import { lazy, lazyScreen, prefetchLater, withLazy } from '../lazy';
import { parentGateScreen } from './parentGate';
import { earnedStickerIds, islandPassed } from '../../lessons/stickers';
import { storageStatus } from '../../progress/ProgressStore';
import { parentPill } from '../components/parentPill';
import { healthNow } from '../healthEnv';
import { cancelSpeech, speak } from '../../audio/voice';
import { speakChip } from '../components/speakChip';
import { challengeLine } from '../components/challengeSheet';
import { weeklyChallenge } from '../../lessons/challenges';
import { markSafePoint } from '../../pwa/updater';
import type { AppData } from '../../progress/schema';
import { welcomeBack } from '../../lessons/shortSession';
import { applyCosmetics, showUnlockCelebration, takeFreshUnlocks } from '../components/unlocksUi';
import { celebrations } from '../celebrationQueue';
import { gameKey, hasUnseen, newGameIds, newSongIds, songKey } from '../../lessons/discovery';
import { newDotOn } from '../components/newBadge';
import { SONGS } from '../../music/tune';
import { enterGuest, guestHomeScreen } from '../guest';
import '../../styles/pedagogy.css';
import '../../styles/longterm.css';
import '../../styles/kidux.css';
import '../../styles/kidhome.css';
import { playLabel } from '../../lessons/todayLabel';
import { stepTitle } from '../../lessons/stepTitle';
import { markSurpriseDay, readSurpriseDay, surpriseFree } from '../../lessons/kidRewards';

// Màn chính chỉ nạp phần cần để VẼ màn chính; các màn khác là chunk riêng (src/ui/lazy.ts).
// Buổi học (đường chính) được nạp ngầm ngay sau khi màn chính vẽ xong.
const sessionMod = lazy(() => import('./session'));
const libraryMod = lazy(() => import('./library'));
const freePlayMod = lazy(() => import('./freePlay'));
const stickersMod = lazy(() => import('./stickers'));
const gamesMod = lazy(() => import('./games'));
const shortMod = lazy(() => import('./shortSession'));
const startSession = (app: App, l: Lesson): void => withLazy(sessionMod, (m) => m.startSession(app, l));
const libraryScreen = (app: App): Screen => lazyScreen(libraryMod, (m) => m.libraryScreen(app));
const freePlayScreen = (app: App): Screen => lazyScreen(freePlayMod, (m) => m.freePlayScreen(app));
const stickersScreen = (app: App): Screen => lazyScreen(stickersMod, (m) => m.stickersScreen(app));
const gamesScreen = (app: App): Screen => lazyScreen(gamesMod, (m) => m.gamesScreen(app));

/**
 * Tranh đảo (do src/ui/components/art/islandArt.ts vẽ). Nạp "mềm" qua import.meta.glob: nếu file tranh
 * chưa có thì bản đồ dùng emoji — màn chính không bao giờ hỏng vì thiếu tranh.
 */
type IslandIconFn = (week: number, state: 'done' | 'current' | 'locked') => SVGElement;
const islandArtMod = import.meta.glob<{ islandIcon?: IslandIconFn }>('../components/art/islandArt.ts', { eager: true });
const islandIcon: IslandIconFn | undefined = Object.values(islandArtMod)[0]?.islandIcon;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Tên đảo mà hai chữ đầu là một loại địa danh (giữ cả cụm khi làm tên bí ẩn). */
const PLACE_2 = ['Thung lũng', 'Vũ hội', 'Sa mạc', 'Nhà hát', 'Thư viện', 'Cung điện', 'Lâu đài', 'Cầu thang', 'Sân khấu', 'Bến Đò', 'Đại hòa'];

/** Đảo chưa mở: chỉ hé lộ loại địa danh — "Rừng ?", "Thung lũng ?" — bé tò mò đoán (thay cho "Tuần 13"). */
export function teaserName(island: string): string {
  const two = PLACE_2.find((p) => island.startsWith(p));
  return `${two ?? island.split(/\s+/)[0]} ?`;
}

/**
 * v5.1 — Tiến độ tiêu chí theo NGÀY cho bé: ●○ + "hôm nay ✓" / "còn N hôm". null = tiêu chí không tính theo ngày.
 * "Hôm nay ✓" = hôm nay có góp một ngày (so với khi bỏ các buổi hôm nay ra) — chỉ dùng hợp đồng criterionProgress.
 */
export function goalDays(week: number, data: Readonly<AppData>, today: string): { days: number; needDays: number; doneToday: boolean } | null {
  const p = criterionProgress(week, data);
  if (!p || p.needDays <= 0) return null;
  const before = criterionProgress(week, { ...data, sessions: data.sessions.filter((s) => s.date !== today) });
  return { days: p.days, needDays: p.needDays, doneToday: p.days > (before?.days ?? 0) };
}

/** Lời người lớn "… — đạt ở 2 ngày khác nhau": chấm ngày đã nói thay → bỏ đuôi cho gọn (chỉ khi không có kidGoal). */
const stripDaysTail = (t: string) => t.replace(/\s*[—–-]\s*đạt ở \d+ ngày khác nhau\s*$/u, '');
/** Lời bé "… — 2 hôm nhé! 🐸": chấm ●○ + "còn N hôm" đã nói số hôm → bỏ cụm "2 hôm" cho vừa MỘT dòng (giữ emoji). */
export const stripKidDays = (t: string) =>
  t
    .replace(/\s*(?:[—–,]\s*)?(?:trong\s+)?\d+\s+hôm(?:\s+nhé)?!?/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/** Bản đồ "Hành trình tới Lâu đài Âm nhạc" — chỉ hiển thị tiến trình, không mở khóa bằng sao. */
function islandMap(app: App): HTMLElement {
  const data = app.store.get();
  const cur = data.progress.currentWeek;
  const lv = levelOf(cur);
  const weeks = WEEKS.filter((w) => w.week >= lv.weeks[0] && w.week <= lv.weeks[1]);
  const n = weeks.length;
  // Đảo xếp so le cao/thấp; đường đi chấm chấm uốn lượn nối các đảo (SVG nằm dưới)
  const xs = weeks.map((_, i) => ((i + 0.5) / n) * 1000);
  const ys = weeks.map((_, i) => (i % 2 ? 58 : 36)); // % chiều cao bản đồ
  const py = (i: number) => ys[i] * 1.5; // toạ độ y trong viewBox 1000×150 (gần đúng tỉ lệ thật → chấm tròn)
  const curve = (to: number) => {
    let d = `M ${xs[0]} ${py(0)}`;
    for (let i = 1; i <= to; i++) {
      const mx = (xs[i - 1] + xs[i]) / 2;
      d += ` C ${mx} ${py(i - 1)}, ${mx} ${py(i)}, ${xs[i]} ${py(i)}`;
    }
    return d;
  };
  const curIdx = weeks.findIndex((w) => w.week === cur);
  // (+ 2026-10-15) Tiến độ đổi từ lần trước (vd vừa qua đảo) → chấm vàng "chạy" từ đảo cũ tới đảo mới (mapMotion.ts)
  const from = trailStart(readSeenWeek(), cur, weeks.map((w) => w.week));
  writeSeenWeek(cur);
  const doneTo = from ?? curIdx;
  const pxW = Math.max(320, (typeof innerWidth === 'number' && innerWidth > 0 ? innerWidth : 1080) - 32);
  const pxH = typeof innerHeight === 'number' && innerHeight <= 760 ? 160 : 172; // chiều cao .map (theme.css)
  const trail = from !== null ? trailLayer(trailDots(xs, ys, from, curIdx, { pxW, pxH })) : null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map-path');
  svg.setAttribute('viewBox', '0 0 1000 150');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    // Cả hành trình (chấm trắng) + phần đã đi tới đảo hiện tại (chấm vàng)
    `<path d="${curve(n - 1)}" class="route"/>` + (doneTo > 0 ? `<path d="${curve(doneTo)}" class="route done"/>` : '');

  // (+ 2026-10-15) Chạm một đảo → thẻ nhỏ (tên + con học gì) ngay trên bản đồ — không chuyển màn. Chạm lại / chạm biển → đóng.
  let card: HTMLElement | null = null;
  let cardWeek = 0;
  let cardTimer = 0;
  const closeCard = () => {
    window.clearTimeout(cardTimer);
    card?.remove();
    card = null;
    cardWeek = 0;
  };
  const openCard = (i: number, state: 'done' | 'current' | 'locked') => {
    const w = weeks[i];
    const wasOpen = cardWeek === w.week;
    closeCard();
    if (wasOpen) return;
    const t = islandCardText({ week: w.week, island: w.island, emoji: w.islandEmoji, title: w.title, state, teaser: teaserName(w.island) });
    const W = map.clientWidth || 1000;
    const x = (xs[i] / 1000) * W;
    const cw = 260;
    // Bên phải đảo (đảo ở nửa trái) hoặc bên trái (đảo ở nửa phải) — không che chính đảo vừa chạm
    const left = x < W / 2 ? Math.min(W - cw - 8, x + 66) : Math.max(8, x - 66 - cw);
    card = h(
      'div',
      { class: `island-card ${ys[i] > 50 ? 'top' : 'bottom'}`, role: 'status', style: { left: `${Math.round(left)}px` } },
      h('div', { class: 'ic-head' }, h('span', {}, t.head), h('span', {}, t.tag)),
      h('div', { class: 'ic-name' }, t.name),
      h('div', { class: 'ic-body' }, t.body),
    );
    cardWeek = w.week;
    map.append(card);
    cardTimer = window.setTimeout(closeCard, 6000);
  };

  /** Ghim Bé Nốt trên đảo hiện tại; chấm đang chạy → Bé Nốt nhảy từ đảo cũ sang (--dx/--dy: đảo cũ so với đảo này, px). */
  const islandPin = (i: number) => {
    const pin = h('div', { class: `island-pin${from !== null ? ' traveling' : ''}`, 'aria-hidden': 'true' }, mascot('happy', 34));
    if (from !== null) {
      pin.style.setProperty('--dx', `${Math.round(((xs[from] - xs[i]) / 1000) * pxW)}px`);
      pin.style.setProperty('--dy', `${Math.round(((ys[from] - ys[i]) / 100) * pxH)}px`);
    }
    return pin;
  };

  const map: HTMLElement = h(
    'div',
    {
      class: 'map',
      role: 'list',
      'aria-label': `Bản đồ ${lv.name}`,
      onClick: (e: Event) => {
        if (!(e.target as Element | null)?.closest?.('.island-tap')) closeCard();
      },
    },
    ...seaLayers(),
    svg,
    trail,
    ...weeks.map((w, i) => {
      // Qua đảo: cùng quy tắc với sticker đảo (islandPassed — giữ nguyên sau khi gộp lịch sử / lùi tuần)
      const passed = islandPassed(w.week, data);
      const here = w.week === cur;
      const later = w.week > cur;
      const state = here ? 'current' : later ? 'locked' : 'done';
      // Đảo chưa mở: bóng bí ẩn + dấu "?" (không lộ tranh) — bé tò mò muốn đi tiếp
      const art = later
        ? h(
            'div',
            { class: 'island-art-wrap mystery', 'aria-hidden': 'true' },
            islandIcon ? islandIcon(w.week, 'done') : w.islandEmoji,
            h('span', { class: 'mystery-q' }, '?'),
          )
        : islandIcon
          ? h('div', { class: 'island-art-wrap', 'aria-hidden': 'true' }, islandIcon(w.week, state))
          : h('div', { class: 'island-emoji', 'aria-hidden': 'true' }, w.islandEmoji);
      return h(
        'div',
        {
          class: `island${here ? ' here' : ''}${passed ? ' passed' : ''}${later ? ' later' : ''}${islandIcon ? ' has-art' : ''}`,
          role: 'listitem',
          style: { left: `${(xs[i] / 10).toFixed(2)}%`, top: `${ys[i]}%` },
          'aria-label': later ? `Tuần ${w.week} — chưa mở` : `Tuần ${w.week}: ${w.island}${passed ? ' — đã qua' : here ? ' — con đang ở đây' : ''}`,
        },
        // Đảo hiện tại: quầng sáng "thở" — lớp riêng chỉ đổi opacity (không animate filter của tranh)
        here ? h('div', { class: 'island-glow', 'aria-hidden': 'true' }) : null,
        art,
        // Không có tranh: tự thêm huy hiệu ✓ / 🔒 (tranh đã có sẵn ngôi sao / ổ khóa)
        !islandIcon && passed ? h('div', { class: 'island-badge' }, '★') : null,
        // Đảo chưa mở: sương mù mềm trôi nhẹ
        later ? h('div', { class: 'island-fog', 'aria-hidden': 'true' }) : null,
        here ? islandPin(i) : null,
        h('div', { class: 'island-name' }, later ? teaserName(w.island) : w.island),
        h('button', {
          class: 'island-tap',
          type: 'button',
          'aria-label': later ? `Tuần ${w.week}: đảo bí mật` : `Xem đảo ${w.island}`,
          onClick: () => openCard(i, state),
        }),
      );
    }),
  );
  // Chi tiết riêng từng đảo (cua, hải âu, đèn lồng…) — nạp trễ sau khi bản đồ đã vẽ
  if (islandIcon)
    void import('../components/art/islandAccents')
      .then((m) => map.isConnected && m.decorateIslands(map))
      .catch(() => undefined);
  return map;
}

/** Tên nút ▶ hôm nay (lessons/todayLabel.playLabel) — dùng chung với dòng "Ngày mai" ở màn kết buổi. */
export const homePlayLabel = (l: Lesson, data: Readonly<AppData>) => playLabel(l, data, { stepTitle });

/**
 * (2026-10-17, OWNER duyệt "Màn chính: 1 nút to + bản đồ") MÀN CHÍNH CỦA BÉ: bản đồ đảo + MỘT nút ▶ to mang tên bài
 * hát / hoạt động hôm nay + hàng nhỏ 🎵 Bài hát · 🎮 Trò chơi · 🌟 Sticker. Mọi thứ khác (danh sách bài, Luyện tập mỗi
 * ngày, 🎹 Đàn tự do, mục tiêu đảo, thử thách tuần, 👤 Khách chơi) nằm sau link nhỏ "Xem các bài". Bé Nốt đứng trên
 * đảo hiện tại của bản đồ (không còn bong bóng chuyện). Bố mẹ: MỘT viên nhắc (parentPill) + nút Phụ huynh.
 * Kiểm thử: nút ▶ có data-test="continue"; link có data-test="lessons-toggle" (scripts/e2e.mjs, webkit-smoke.mjs).
 */
export function homeScreen(app: App, banner?: string) {
  // (+ 2026-10-17) 👤 Khách chơi: màn chính riêng (Bài hát / Đàn tự do / Trò chơi) — không có bài học của bé
  if (app.store.guest) return guestHomeScreen(app);
  return (root: HTMLElement) => {
    app.mic.stop(); // ở màn chính không cần nghe
    markSafePoint(true); // có bản mới thì cập nhật ngay tại đây
    const data = app.store.get();
    const plan = weekPlan(data.progress.currentWeek);
    const next = nextLesson(data);
    const done = new Set(data.progress.lessonsCompleted);
    const today = app.store.today();
    const todayStars = data.progress.practiceDays[today]?.stars ?? 0;
    const todayCount = sessionsToday(data, today).filter((s) => s.completed).length;
    const limit = data.settings.dailyLimit;
    const overLimit = limit !== 'none' && minutesToday(data, today) >= limit;
    const label = homePlayLabel(next, data);

    /** Hết chỗ lưu / dữ liệu của bản app mới hơn → băng CHẶN nổi bật: tiến độ mới sẽ không được lưu — nhờ bố mẹ */
    const storageBanner = (): HTMLElement | null => {
      const st = storageStatus();
      if (!st.full && !st.futureVersion) return null;
      return h(
        'div',
        { class: 'banner storage-alert', role: 'alert' },
        h('div', { class: 'storage-alert-text' }, `⚠️ ${st.text}`),
        button({ icon: '👪', label: 'Nhờ bố mẹ sao lưu', kind: 'retry', onTap: () => app.show(parentGateScreen(app)) }),
      );
    };
    const restToast = () => toast('🌙 Hôm nay con học đủ rồi — mai mình học tiếp nhé!');

    const lessonRow = (l: Lesson) =>
      h(
        'button',
        {
          class: `lesson-row${l.id === next.id ? ' is-next' : ''}${done.has(l.id) ? ' is-done' : ''}`,
          type: 'button',
          'data-lesson': l.id,
          onClick: () => (overLimit ? restToast() : startSession(app, l)),
        },
        h('span', { class: 'lesson-emoji', 'aria-hidden': 'true' }, l.emoji),
        h('span', { class: 'lesson-title' }, l.title),
        done.has(l.id)
          ? h('span', { class: 'lesson-done', 'aria-label': 'đã học' }, '✓')
          : l.id === next.id
            ? h('span', { class: 'lesson-next', 'aria-hidden': 'true' }, '▶')
            : null,
      );

    // Mục tiêu đảo (lời của BÉ — kidGoal; chưa có thì lời tiêu chí) + chấm NGÀY: chỉ trong phần "Xem các bài".
    // Không hiện chuỗi ngày liền với bé: chuỗi bị "đứt" làm trẻ nản.
    const leftLessons = plan.lessons.filter((l) => !l.isWeekTest && !done.has(l.id)).length;
    const goalMetNotDone = weekPassed(plan.week, data) && !weekComplete(plan.week, data) && leftLessons > 0;
    const gd = goalDays(plan.week, data, today);
    const goalText = plan.kidGoal ? (gd ? stripKidDays(plan.kidGoal) : plan.kidGoal) : gd ? stripDaysTail(plan.criterion.text) : plan.criterion.text;
    const daysEl =
      gd && !goalMetNotDone
        ? h(
            'span',
            {
              class: 'goal-days',
              'aria-label': `Đã đạt ${Math.min(gd.days, gd.needDays)} trên ${gd.needDays} ngày${gd.doneToday ? ', hôm nay đã đạt' : ''}`,
            },
            ...Array.from({ length: gd.needDays }, (_, i) => h('span', { class: `gd${i < gd.days ? ' on' : ''}`, 'aria-hidden': 'true' })),
            gd.doneToday
              ? h('span', { class: 'gd-note today' }, 'hôm nay ✓')
              : gd.days < gd.needDays
                ? h('span', { class: 'gd-note' }, `còn ${gd.needDays - gd.days} hôm`)
                : null,
          )
        : null;
    // (+ 2026-10-07) 🏆 Thử thách tuần: lưu tuần đã xong / chụp mốc kỷ lục trò chơi (chỉ ghi khi có đổi)
    app.store.recordChallenges();
    const wc = weeklyChallenge(app.store.get(), today);
    const chalLine = challengeLine(app, wc, today, {
      blocked: () => overLimit,
      onBlocked: restToast,
      onConfirmed: () => app.show(homeScreen(app, banner)),
    });
    // (+ 2026-10-08) 👋 Nghỉ ≥ 3 ngày: Bé Nốt chào "nhớ con" + chip Buổi ngắn 5 phút (bài con thích + 1 bài ôn)
    const now = new Date();
    const missed = welcomeBack(data, now) && !overLimit;
    const sayText = missed ? '👋 Bé Nốt nhớ con! Hôm nay mình chơi bài con thích nhé' : `Hôm nay mình chơi ${label.text} nhé!`;
    // 🎁 Quà mở khóa theo đảo: món mới → mặc luôn trang phục mới (Bé Nốt trên bản đồ đã mặc), màn mừng hiện sau khi vẽ.
    // (+ 2026-10-09) Mỗi lần mở app tối đa MỘT màn mừng (celebrationQueue). (+ 2026-10-17) MỘT BẤT NGỜ MỖI NGÀY
    // (lessons/kidRewards): hôm nay đã mở trứng ở màn kết → quà để dành (vẫn "chưa xem") tới ngày sau.
    const giftOk = celebrations.canShow() && surpriseFree(readSurpriseDay(), today);
    const freshUnlocks = giftOk ? takeFreshUnlocks(app) : (applyCosmetics(app.store.get()), []);
    if (freshUnlocks.length) {
      celebrations.mark();
      markSurpriseDay(today);
    }

    // Phần "Xem các bài" (thu gọn — bé không cần thấy hằng ngày)
    let moreOpen = false;
    const panel = h(
      'section',
      { class: 'home-lessons', id: 'home-lessons', hidden: true, 'aria-label': 'Các bài của tuần' },
      h('h2', { class: 'card-kicker' }, `${plan.islandEmoji} Bài trong tuần`),
      h('p', { class: 'home-story' }, plan.story),
      h(
        'div',
        { class: 'lesson-list' },
        ...plan.lessons.map(lessonRow),
        // Từ Cấp 2 (tuần 11, giáo trình v5): luyện tập mỗi ngày (bài đang tập + ôn bài đã thuộc + đọc nhạc mới)
        plan.week >= 11 && next.id !== `w${plan.week}-daily`
          ? h(
              'button',
              {
                class: 'lesson-row daily',
                type: 'button',
                onClick: () => (overLimit ? restToast() : startSession(app, dailyLesson(app.store.get()))),
              },
              h('span', { class: 'lesson-emoji', 'aria-hidden': 'true' }, '🔁'),
              h('span', { class: 'lesson-title' }, 'Luyện tập mỗi ngày'),
            )
          : null,
      ),
      h(
        'div',
        { class: 'home-goal' },
        goalMetNotDone
          ? h('div', { class: 'goal-target met' }, `🎯 Đạt mục tiêu rồi! Còn ${leftLessons} bài nữa là qua đảo`)
          : h('div', { class: 'goal-target', title: plan.criterion.text }, h('span', { 'aria-hidden': 'true' }, '🎯 '), h('span', { class: 'goal-text' }, goalText)),
        daysEl,
      ),
      chalLine,
      h(
        'div',
        { class: 'home-extra' },
        button({ icon: '🎹', label: 'Đàn tự do', kind: 'mint', onTap: () => app.show(freePlayScreen(app)) }),
        // (+ 2026-10-17, OWNER duyệt) 👤 Khách chơi (anh chị em / bạn bè) — dễ tìm nhưng không nổi bật; không lưu gì
        ((b) => (b.classList.add('home-guest-entry'), b))(button({ icon: '👤', label: 'Khách chơi (không lưu)', onTap: () => enterGuest(app) })),
      ),
    );
    const toggle: HTMLButtonElement = h(
      'button',
      {
        class: 'home-link lessons-toggle',
        type: 'button',
        'data-test': 'lessons-toggle',
        'aria-expanded': 'false',
        'aria-controls': 'home-lessons',
        onClick: () => {
          moreOpen = !moreOpen;
          panel.hidden = !moreOpen;
          toggle.setAttribute('aria-expanded', String(moreOpen));
          toggle.querySelector('.home-link-text')!.textContent = moreOpen ? 'Thu gọn' : 'Xem các bài';
          if (moreOpen) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        },
      },
      h('span', { 'aria-hidden': 'true' }, '📋 '),
      h('span', { class: 'home-link-text' }, 'Xem các bài'),
    );

    // NÚT ▶ TO: tên bài hát / hoạt động hôm nay. aria-label giữ "Học tiếp: …" cho trình đọc màn hình.
    const play = overLimit
      ? h('div', { class: 'banner rest' }, '🌙 Hôm nay con học đủ rồi. Mai mình học tiếp nhé!')
      : ((b) => {
          b.classList.add('home-play');
          b.setAttribute('data-test', 'continue');
          b.setAttribute('data-lesson-next', next.id);
          b.setAttribute('aria-label', `Học tiếp: ${label.text}`);
          return b;
        })(
          button({
            icon: '▶',
            label: `${label.icon} ${label.text}`,
            kind: 'primary',
            big: true,
            onTap: () => startSession(app, next),
          }),
        );

    const gamesBtn = gamesDockButton(app);
    root.append(
      h(
        'div',
        { class: 'screen home kid-home' },
        h(
          'header',
          { class: 'topbar' },
          h(
            'div',
            { class: 'topbar-title' },
            h('span', { class: 'level-tag' }, levelOf(plan.week).name),
            h('span', { class: 'topbar-week' }, `Tuần ${plan.week} · ${plan.island}`),
          ),
          h(
            'div',
            { class: 'topbar-side' },
            // (2026-10-17) MỘT viên cho bố mẹ: 🕑 Chờ bố mẹ xem → ⚠️ sao lưu (quá 30 ngày) → 📊 Báo cáo tuần (parentPill.ts)
            parentPill(app, () => app.show(parentGateScreen(app))),
            todayStars ? h('div', { class: 'today-stars', 'aria-label': `Hôm nay được ${todayStars} sao` }, `⭐ ${Math.min(todayStars, 99)}`) : null,
            // (+ 2026-10-17) ⚠️ trên nút Phụ huynh khi có điều cần bố mẹ chú ý (pwa/healthCheck.ts healthFlags)
            ((b) => {
              const n = healthNow(data).flags.length;
              if (n) {
                b.classList.add('attn');
                b.append(h('span', { class: 'parent-attn', 'aria-hidden': 'true' }, '⚠️'));
                b.setAttribute('aria-label', `Phụ huynh — nhấn giữ 2 giây (có ${n} điều cần chú ý)`);
              }
              return b;
            })(parentButton(() => app.show(parentGateScreen(app)))),
          ),
        ),
        islandMap(app),
        h(
          'div',
          { class: 'home-main kid-main scrollable' },
          storageBanner(),
          banner ? h('div', { class: 'banner home-banner' }, banner) : null,
          h(
            'section',
            { class: 'home-today' },
            h('div', { class: 'home-today-k' }, missed ? '👋 Bé Nốt nhớ con!' : 'Hôm nay', speakChip(app, sayText)),
            play,
            h(
              'div',
              { class: 'home-subrow' },
              // (+ 2026-10-12) 👪 Có bố mẹ / 👦 Con tự học — MỘT chip nhỏ, chạm để đổi (nhớ tới hết ngày)
              overLimit ? null : studyModeChip(app, () => app.show(homeScreen(app, banner))),
              missed
                ? ((b) => (b.classList.add('home-short'), b))(
                    button({ icon: '⏱', label: 'Buổi ngắn 5 phút', kind: 'sun', onTap: () => withLazy(shortMod, (m) => m.startShortSession(app)) }),
                  )
                : null,
              toggle,
            ),
            todayCount >= MAX_SESSIONS_PER_DAY && !overLimit
              ? h('p', { class: 'soft-note' }, `Hôm nay con đã học ${todayCount} buổi rồi, giỏi quá! Nghỉ ngơi nhé 😊`)
              : null,
          ),
          panel,
        ),
        h('nav', { class: 'home-dock kid-dock' }, libraryDockButton(app), gamesBtn, stickerDockButton(app)),
      ),
    );
    // (+ 2026-10-10) Chấm "mới" trên 🎮: trò đã mở mà con chưa thấy ở màn Trò chơi. Danh mục trò (khóa theo tuần) nằm
    // ở chunk riêng → đọc sau khi màn chính đã vẽ (chấm hiện sau một chút — không làm nặng màn chính)
    void import('../../practice/games/catalog')
      .then((m) => {
        const d = app.store.get();
        if (gamesBtn.isConnected && hasUnseen(d, newGameIds(d, m.unlockedGames(d, SONGS)).map(gameKey))) newDotOn(gamesBtn);
      })
      .catch(() => undefined);
    // Buổi học là việc bé bấm NGAY → tải sẵn sớm (300 ms, sau khi màn chính đã vẽ)
    prefetchLater([sessionMod], 300);
    // Đọc to "Hôm nay mình chơi …" — mỗi ngày một lần (không phải mỗi lần về màn chính); hẹn giờ gỡ khi rời màn.
    // (+ 2026-10-09) Có màn mừng quà → đọc SAU khi bé đóng màn mừng (không đọc chồng lên tiếng chuông mừng)
    const tell = !overLimit && shouldTellStory(today, plan.week);
    const storyTimer = tell && !freshUnlocks.length ? window.setTimeout(() => void speak(app, sayText), 600) : 0;
    // 🎁 Màn mừng quà mới (sau khi màn chính đã vẽ — bé thấy Bé Nốt mặc đồ mới phía sau)
    const unlockTimer = freshUnlocks.length
      ? window.setTimeout(
          () =>
            root.isConnected &&
            showUnlockCelebration(
              app,
              freshUnlocks,
              () => app.show(stickersScreen(app)),
              () => tell && root.isConnected && void speak(app, sayText),
            ),
          450,
        )
      : 0;
    // Ghi hỏng khi đang ở màn chính → hiện băng chặn ngay (vẽ lại màn)
    const unStore = app.store.subscribe(() => {
      const st = storageStatus();
      if ((st.full || st.futureVersion) && !root.querySelector('.storage-alert')) app.show(homeScreen(app, banner));
    });
    return () => {
      unStore();
      window.clearTimeout(storyTimer);
      window.clearTimeout(unlockTimer);
      cancelSpeech();
    };
  };
}

/** MỘT chip nhỏ cách học hôm nay: "👪 Có bố mẹ" ⇄ "👦 Con tự học" (chạm để đổi; nhớ tới hết ngày — store.studyMode). */
function studyModeChip(app: App, onChange: () => void): HTMLElement {
  const mode = app.store.studyMode();
  const self = mode === 'self';
  return h(
    'button',
    {
      type: 'button',
      class: `study-chip home-study on`,
      'data-mode': mode,
      'aria-label': `Hôm nay: ${self ? 'con tự học' : 'có bố mẹ ngồi cùng'}. Chạm để đổi`,
      onClick: () => {
        app.store.setStudyMode(self ? 'parent' : 'self');
        onChange();
      },
    },
    h('span', { 'aria-hidden': 'true' }, self ? '👦' : '👪'),
    ` ${self ? 'Con tự học' : 'Có bố mẹ'}`,
    h('span', { class: 'study-swap', 'aria-hidden': 'true' }, ' ⇄'),
  );
}

const STORY_KEY = 'piano-be-9:story-told';

/** Hôm nay đã kể chuyện tuần này chưa (lưu trong máy — chỉ là tiện ích, mất cũng không sao). */
function shouldTellStory(today: string, week: number): boolean {
  const key = `${today}:w${week}`;
  try {
    if (localStorage.getItem(STORY_KEY) === key) return false;
    localStorage.setItem(STORY_KEY, key);
  } catch {
    /* không có bộ nhớ → vẫn đọc */
  }
  return true;
}

/** Nút "🎵 Bài hát" ở thanh dưới — (+ 2026-10-10) chấm "mới" khi Thư viện có bài mới con chưa thấy (lessons/discovery.ts). */
function libraryDockButton(app: App): HTMLButtonElement {
  const b = button({ icon: '🎵', label: 'Bài hát', kind: 'sun', onTap: () => app.show(libraryScreen(app)) });
  const d = app.store.get();
  if (hasUnseen(d, newSongIds(d).map(songKey))) newDotOn(b);
  return b;
}

/** (+ 2026-10-07) Nút "🎮 Trò chơi" ở thanh dưới (họ nút xanh trời riêng). */
function gamesDockButton(app: App): HTMLButtonElement {
  const b = button({ icon: '🎮', label: 'Trò chơi', onTap: () => app.show(gamesScreen(app)) });
  b.classList.add('btn-games');
  return b;
}

/** Nút "Sổ sticker" ở thanh dưới (họ nút hồng riêng) — kèm số sticker đã có. */
function stickerDockButton(app: App): HTMLButtonElement {
  const b = button({ icon: '🌟', label: 'Sticker', onTap: () => app.show(stickersScreen(app)) });
  b.classList.add('btn-pink');
  const n = earnedStickerIds(app.store.get()).length;
  if (n) b.append(h('span', { class: 'dock-count', 'aria-label': `${n} sticker` }, String(n)));
  return b;
}
