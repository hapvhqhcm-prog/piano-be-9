import { mascot } from '../components/mascot';
import {
  daysThisWeek,
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
import type { App } from '../App';
import { button, h, toast } from '../components/dom';
import { parentButton } from '../components/longPress';
import { freePlayScreen } from './freePlay';
import { libraryScreen } from './library';
import { stickersScreen } from './stickers';
import { BUSY_WEEK_DAYS, earnedStickerIds, islandPassed } from '../../lessons/stickers';
import { storageStatus } from '../../progress/ProgressStore';
import { cancelSpeech, speak } from '../../audio/voice';
import { speakChip } from '../components/speakChip';
import { parentGateScreen } from './parentGate';
import { startSession } from './session';
import { markSafePoint } from '../../pwa/updater';
import type { AppData } from '../../progress/schema';
import '../../styles/pedagogy.css';
import '../../styles/kidux.css';

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
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map-path');
  svg.setAttribute('viewBox', '0 0 1000 150');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    // Cả hành trình (chấm trắng) + phần đã đi tới đảo hiện tại (chấm vàng)
    `<path d="${curve(n - 1)}" class="route"/>` + (curIdx > 0 ? `<path d="${curve(curIdx)}" class="route done"/>` : '');

  return h(
    'div',
    { class: 'map', role: 'list', 'aria-label': `Bản đồ ${lv.name}` },
    svg,
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
        here ? h('div', { class: 'island-pin', 'aria-hidden': 'true' }, mascot('happy', 34)) : null,
        h('div', { class: 'island-name' }, later ? teaserName(w.island) : w.island),
      );
    }),
  );
}

export function homeScreen(app: App, banner?: string) {
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

    // Mục tiêu TUẦN (§1: 4–5 NGÀY/tuần — v5.1 đếm ngày, hai buổi cùng ngày = một ngày) + mục tiêu qua đảo.
    // Không hiện chuỗi ngày liền với bé: chuỗi bị "đứt" làm trẻ nản — nghỉ một ngày không sao, chỉ cần đủ ngày trong tuần.
    const now = new Date();
    const weekDone = daysThisWeek(data, now);
    // Đạt tiêu chí nhưng còn bài chưa học → tuần chưa qua; nhắc nhẹ còn mấy bài
    const leftLessons = plan.lessons.filter((l) => !l.isWeekTest && !done.has(l.id)).length;
    const goalMetNotDone = weekPassed(plan.week, data) && !weekComplete(plan.week, data) && leftLessons > 0;
    // v5.1: mục tiêu bằng lời của BÉ (kidGoal); chưa có thì lời tiêu chí. Lời đầy đủ + tiến độ ở màn Phụ huynh.
    const gd = goalDays(plan.week, data, today);
    const goalText = plan.kidGoal ? (gd ? stripKidDays(plan.kidGoal) : plan.kidGoal) : gd ? stripDaysTail(plan.criterion.text) : plan.criterion.text;
    // Chấm ngày của tiêu chí nằm ở hàng 2 (cạnh "Tuần này") để hàng 1 đủ chỗ cho lời mục tiêu — khung tối đa 2 dòng
    const daysEl = gd && !goalMetNotDone
      ? h(
          'span',
          {
            class: 'goal-days',
            'aria-label': `Đã đạt ${Math.min(gd.days, gd.needDays)} trên ${gd.needDays} ngày${gd.doneToday ? ', hôm nay đã đạt' : ''}`,
          },
          h('span', { 'aria-hidden': 'true' }, '🎯'),
          ...Array.from({ length: gd.needDays }, (_, i) => h('span', { class: `gd${i < gd.days ? ' on' : ''}`, 'aria-hidden': 'true' })),
          gd.doneToday
            ? h('span', { class: 'gd-note today' }, 'hôm nay ✓')
            : gd.days < gd.needDays
              ? h('span', { class: 'gd-note' }, `còn ${gd.needDays - gd.days} hôm`)
              : null,
        )
      : null;
    const goalRow = h(
      'div',
      { class: 'goal-row' },
      h(
        'div',
        { class: 'goal-dots', title: 'Mục tiêu: 4–5 ngày mỗi tuần', 'aria-label': `Tuần này đã học ${weekDone} trên 5 ngày` },
        h('span', { class: 'goal-label' }, 'Tuần này'),
        ...[0, 1, 2, 3, 4].map((i) => h('span', { class: `dot${i < weekDone ? ' on' : ''}` })),
      ),
      weekDone >= BUSY_WEEK_DAYS ? h('div', { class: 'streak week-star' }, '🌟 Tuần chăm chỉ!') : null,
      daysEl,
    );

    root.append(
      h(
        'div',
        { class: 'screen home' },
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
            todayStars ? h('div', { class: 'today-stars', 'aria-label': `Hôm nay được ${todayStars} sao` }, `⭐ ${Math.min(todayStars, 99)}`) : null,
            parentButton(() => app.show(parentGateScreen(app))),
          ),
        ),
        islandMap(app),
        h(
          'div',
          { class: 'home-main scrollable' },
          storageBanner(),
          banner ? h('div', { class: 'banner home-banner' }, banner) : null,
          h(
            'section',
            { class: 'quest-card' },
            h(
              'div',
              { class: 'story-row' },
              mascot('happy', 84),
              h('p', { class: 'story bubble' }, plan.story, speakChip(app, plan.story)),
            ),
            h(
              'div',
              { class: 'goal-panel' },
              goalMetNotDone
                ? h('div', { class: 'goal-target met' }, `🎯 Đạt mục tiêu rồi! Còn ${leftLessons} bài nữa là qua đảo`)
                : h(
                    'div',
                    { class: 'goal-target', title: plan.criterion.text },
                    h('span', { 'aria-hidden': 'true' }, '🎯'),
                    h('span', { class: 'goal-text' }, goalText),
                  ),
              goalRow,
            ),
            overLimit
              ? h('div', { class: 'banner rest' }, '🌙 Hôm nay con học đủ rồi. Mai mình học tiếp nhé!')
              : button({
                  icon: '▶',
                  label: `Học tiếp: ${next.emoji} ${next.title}`,
                  kind: 'primary',
                  big: true,
                  onTap: () => startSession(app, next),
                }),
            // Mẹo cho bố mẹ nằm ở màn Phụ huynh — màn chính ít chữ cho bé
            todayCount >= MAX_SESSIONS_PER_DAY && !overLimit
              ? h('p', { class: 'soft-note' }, `Hôm nay con đã học ${todayCount} buổi rồi, giỏi quá! Nghỉ ngơi nhé 😊`)
              : null,
          ),
          h(
            'section',
            { class: 'lesson-card', 'aria-label': 'Các bài của tuần' },
            h('h2', { class: 'card-kicker' }, `${plan.islandEmoji} Bài trong tuần`),
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
          ),
        ),
        h(
          'nav',
          { class: 'home-dock' },
          button({ icon: '🎵', label: 'Bài hát', kind: 'sun', onTap: () => app.show(libraryScreen(app)) }),
          button({ icon: '🎹', label: 'Đàn tự do', kind: 'mint', onTap: () => app.show(freePlayScreen(app)) }),
          stickerDockButton(app),
        ),
      ),
    );
    // Đọc to câu chuyện của tuần — mỗi ngày một lần (không phải mỗi lần về màn chính)
    // (hẹn giờ được gỡ khi rời màn — trước đây rời màn trong 0,6 s thì câu chuyện vẫn đọc đè lên màn kế tiếp)
    const storyTimer = shouldTellStory(today, plan.week) ? window.setTimeout(() => void speak(app, plan.story), 600) : 0;
    // Ghi hỏng khi đang ở màn chính → hiện băng chặn ngay (vẽ lại màn)
    const unStore = app.store.subscribe(() => {
      const st = storageStatus();
      if ((st.full || st.futureVersion) && !root.querySelector('.storage-alert')) app.show(homeScreen(app, banner));
    });
    return () => {
      unStore();
      window.clearTimeout(storyTimer);
      cancelSpeech();
    };
  };
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

/** Nút "Sổ sticker" ở thanh dưới (họ nút hồng riêng) — kèm số sticker đã có. */
function stickerDockButton(app: App): HTMLButtonElement {
  const b = button({ icon: '🌟', label: 'Sticker', onTap: () => app.show(stickersScreen(app)) });
  b.classList.add('btn-pink');
  const n = earnedStickerIds(app.store.get()).length;
  if (n) b.append(h('span', { class: 'dock-count', 'aria-label': `${n} sticker` }, String(n)));
  return b;
}
