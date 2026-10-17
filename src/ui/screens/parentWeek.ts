/**
 * (+ 2026-10-17, OWNER duyệt) Màn Phụ huynh — phần TUẦN:
 * - "🗓️ Tuần N" — tiến độ mục tiêu tuần + "Vì sao?" bằng số liệu của app (tiêu chí theo ngày, độ khó + lý do từ
 *   lessons/adaptive.ts, khi nào sang tuần mới) + "⏸ Ở lại tuần này thêm";
 * - "💡 Tuần N: 3 điều cần nhớ" — gộp 3 thẻ mẹo cũ (bố mẹ chú ý tuần này · khi nào bấm "Đúng rồi" · thẻ nhắc nhanh);
 *   lần đầu mỗi tuần mở sẵn, sau đó thu gọn;
 * - "🧩 Thiết lập một lần" (thu gọn, có ✓): micro, Màn hình chính, giờ tập, bài bố mẹ thêm.
 */
import type { AppData } from '../../progress/schema';
import { criterionProgress, weekPassed, weekPlan, levelOf } from '../../lessons/lessonEngine';
import { difficulty, difficultyText, DIFFICULTY_MIN_SESSIONS, type Difficulty } from '../../lessons/adaptive';
import { parentTip } from '../../lessons/parentTips';
import { isStandalone } from '../../progress/backup';
import { button, h } from '../components/dom';
import { installCard } from '../components/installCard';
import { reminderCard } from '../components/reminderCard';
import { readiness, tonightPlan, WHO_TEXT } from './tonight';
import { micTestScreen, segmented, type ParentCtx } from './parentShared';
import { parentSongsCard } from './parentSongsCard';
import { tagGuide } from './parentHelp';

/** Lý do độ khó bằng lời thường (từ Difficulty.why + số liệu). */
export function difficultyWhy(df: Pick<Difficulty, 'why' | 'index' | 'sessions' | 'kindStops'>): string {
  const pct = df.index === null ? null : Math.round(df.index * 100);
  switch (df.why) {
    case 'little-data':
      return `Chưa đủ ${DIFFICULTY_MIN_SESSIONS} buổi có kết quả để app tự cân (mới ${df.sessions}).`;
    case 'low':
      return `${df.sessions} buổi gần đây con đúng khoảng ${pct}% (dưới 65%).`;
    case 'kind-stops':
      return `${df.kindStops} buổi gần đây app phải cho con dừng nhẹ nhàng ở một bài khó.`;
    case 'homework':
      return 'Còn bài tập về nhà chưa xong mà con còn vấp.';
    case 'cruising':
      return `3 buổi gần nhất con đúng trên 92%, không vấp lượt nào.`;
    default:
      return pct === null ? 'Kết quả các buổi gần đây ổn định.' : `${df.sessions} buổi gần đây con đúng khoảng ${pct}% — vừa sức.`;
  }
}

/** Khi nào sang tuần mới — một câu. */
function nextWeekText(d: Readonly<AppData>, now: Date): string {
  const week = d.progress.currentWeek;
  const r = readiness(d, now);
  const t = tonightPlan(d, now);
  const left = t.goal.lessonsLeft;
  if (r.held) return `⏸ Đang giữ ở tuần ${week} — app chưa sang tuần mới cho tới khi bố mẹ chọn “Không” bên dưới.`;
  if (weekPassed(week, d)) return left > 0 ? `Học nốt ${left} bài là app tự sang tuần ${week + 1}.` : `App sẽ sang tuần ${week + 1} ở buổi tới.`;
  const cp = criterionProgress(week, d);
  const parts: string[] = [];
  if (cp && cp.needDays > 0) parts.push(`đạt mục tiêu ở ${cp.needDays} ngày khác nhau (còn ${Math.max(0, cp.needDays - cp.days)} ngày)`);
  else parts.push('đạt mục tiêu tuần');
  if (left > 0) parts.push(`học xong ${left} bài còn lại`);
  return `Sang tuần ${week + 1} khi bé ${parts.join(' và ')}.`;
}

/** 🗓️ Tuần N — mục tiêu + Vì sao? + giữ tuần. Mốc Hướng dẫn: 'hold'. */
export function weekCard(c: ParentCtx, d: Readonly<AppData>, now: Date): HTMLElement {
  const week = d.progress.currentWeek;
  const plan = weekPlan(week);
  const r = readiness(d, now);
  const t = tonightPlan(d, now);
  const g = t.goal;
  const cp = criterionProgress(week, d);
  const df = difficulty(d, now);
  const days = g.daysThisWeek;
  const pct = Math.min(100, Math.round((days / 4) * 100));
  const passed = weekPassed(week, d);
  return h(
    'section',
    { class: `card week-card ready-card ${r.level}`, 'data-guide': 'hold' },
    h('h2', {}, `🗓️ Tuần ${week} · ${plan.islandEmoji} ${plan.title}`),
    h('p', { class: 'ready-title' }, r.title),
    h(
      'p',
      { class: 'week-goal' },
      h('b', {}, 'Mục tiêu: '),
      `${plan.criterion.text} (${WHO_TEXT[plan.criterion.who]}) — `,
      passed ? h('span', { class: 'met' }, '✅ đã đạt') : cp && cp.needDays > 0 ? `${Math.min(cp.days, cp.needDays)}/${cp.needDays} ngày` : '⏳ chưa đạt',
    ),
    h('div', { class: 'todo-meter', 'aria-hidden': 'true' }, h('i', { style: { width: `${pct}%` } })),
    h('p', { class: 'muted' }, `Tuần này đã học ${days} ngày — nên 4–5 ngày, nghỉ ngày nào cũng được.`),
    h(
      'details',
      { class: 'week-why' },
      h('summary', {}, 'Vì sao? (app tính thế nào)'),
      h(
        'ul',
        {},
        cp && cp.needDays > 0
          ? h('li', {}, `Mục tiêu tính theo NGÀY: phải đạt ở ${cp.needDays} ngày khác nhau (hai lần cùng ngày = một ngày). Đã có ${Math.min(cp.days, cp.needDays)}.`)
          : h('li', {}, 'Mục tiêu tuần này tính bằng một lần đạt (không cần nhiều ngày).'),
        h('li', {}, `${df.mode === 'gentle' ? '🐢' : df.mode === 'stretch' ? '⭐' : '🎚️'} ${difficultyText(df)}: ${difficultyWhy(df)}`),
        ...r.reasons.map((x) => h('li', {}, x)),
        h('li', {}, nextWeekText(d, now)),
        h('li', {}, `${levelOf(week).name}: ${levelOf(week).goal}`),
      ),
    ),
    r.stuck
      ? h(
          'div',
          { class: 'banner warn' },
          `⚠️ Bé đã ở tuần ${week} được ${r.daysOnWeek} ngày. Bình thường nếu bé bận/ốm — nếu tuần nào cũng thấy khó, tập chậm lại, ôn bài cũ và hỏi người hỗ trợ.`,
        )
      : null,
    h(
      'div',
      { class: 'hold-row' },
      h('span', {}, '⏸ Ở lại tuần này thêm:'),
      segmented(
        [
          { value: 'off', label: 'Không — tự sang tuần mới' },
          { value: 'on', label: `Có — giữ ở tuần ${week}` },
        ],
        r.held ? 'on' : 'off',
        (v) => c.set({ holdWeek: v === 'on' ? week : null }),
      ),
    ),
  );
}

/* ---------------- 💡 3 điều cần nhớ ---------------- */

const TIPS_KEY = 'piano-be-9:tips-seen-week';
function tipsSeen(week: number): boolean {
  try {
    return localStorage.getItem(TIPS_KEY) === String(week);
  } catch {
    return false;
  }
}
function markTips(week: number): void {
  try {
    localStorage.setItem(TIPS_KEY, String(week));
  } catch {
    /* bỏ qua */
  }
}

/** 3 điều — thuần (test): mẹo của tuần, chuẩn bấm "Đúng rồi", cách nói khi bé vấp / mệt. */
export function threeTips(week: number): Array<{ icon: string; title: string; text: string }> {
  return [
    { icon: '👪', title: `Tuần ${week} chú ý`, text: parentTip(week) },
    {
      icon: '✅',
      title: 'Khi nào bấm “Đúng rồi”',
      text: 'Đúng phím sáng + đúng số ngón (ngập ngừng, còn nhỏ tiếng vẫn là Đúng). Sai ngón: nhắc nhẹ cho bé bấm lại. Sai phím: “Thử lại” — không chê.',
    },
    {
      icon: '💬',
      title: 'Khi bé vấp / mệt',
      text: '“Con thử chậm hơn nhé” · “Ngón số mấy nhỉ?” — chậm mà đúng hơn nhanh mà sai. Khen cụ thể; mệt thì nghỉ 1 phút hoặc mai học tiếp.',
    },
  ];
}

/** 💡 Tuần N: 3 điều cần nhớ — mở sẵn lần đầu mỗi tuần, sau đó thu gọn. Mốc Hướng dẫn: 'tips'. */
export function tipsCard(week: number): HTMLElement {
  const first = !tipsSeen(week);
  const det = h(
    'details',
    { class: 'card tips3', 'data-guide': 'tips' },
    h('summary', {}, h('h2', {}, `💡 Tuần ${week}: 3 điều cần nhớ`)),
    h(
      'ol',
      { class: 'tips3-list' },
      ...threeTips(week).map((x) => h('li', {}, h('b', {}, `${x.icon} ${x.title}: `), x.text)),
    ),
  );
  det.open = first;
  if (first) markTips(week);
  return det;
}

/* ---------------- 🧩 Thiết lập một lần ---------------- */

export function setupSection(c: ParentCtx, d: Readonly<AppData>, back: () => void): HTMLElement {
  const { app } = c;
  const micDone = !!d.settings.micEnabled;
  const homeDone = isStandalone();
  const reminderDone = !!(d.settings as { reminder?: unknown }).reminder;
  const songsDone = c.store.parentSongs().length > 0;
  const mark = (ok: boolean) => h('span', { class: `setup-mark${ok ? ' ok' : ''}`, 'aria-hidden': 'true' }, ok ? '✓' : '○');
  const n = [micDone, homeDone, reminderDone, songsDone].filter(Boolean).length;
  const det = h(
    'details',
    { class: 'setup-once' },
    h('summary', {}, `🧩 Thiết lập một lần (${n}/4 xong)`),
    h(
      'ul',
      { class: 'setup-list' },
      h(
        'li',
        {},
        mark(micDone),
        h('b', {}, '🎤 Micro'),
        h('span', { class: 'muted' }, micDone ? ' — đang dùng cho buổi học.' : ' — chưa dùng (không bắt buộc).'),
        button({ icon: '🎤', label: micDone ? 'Thử / chỉnh micro' : 'Cài micro (3 bước)', onTap: () => app.show(micTestScreen(app)) }),
      ),
      h('li', {}, mark(homeDone), h('b', {}, '📲 Màn hình chính'), h('span', { class: 'muted' }, homeDone ? ' — app đang mở từ biểu tượng 🎹.' : ' — chưa thêm (xem hướng dẫn bên dưới).')),
      h('li', {}, mark(reminderDone), h('b', {}, '⏰ Giờ tập'), h('span', { class: 'muted' }, reminderDone ? ' — đã đặt lời nhắc trong Lịch.' : ' — chưa đặt.')),
      h('li', {}, mark(songsDone), h('b', {}, '📝 Bài bố mẹ thêm'), h('span', { class: 'muted' }, songsDone ? ` — ${c.store.parentSongs().length} bài.` : ' — tùy chọn.')),
    ),
    installCard(),
    tagGuide(reminderCard(app), 'reminder'),
    tagGuide(parentSongsCard(c, back), 'songs'),
  );
  det.open = c.ui.setupOpen;
  det.addEventListener('toggle', () => (c.ui.setupOpen = det.open));
  return det;
}
