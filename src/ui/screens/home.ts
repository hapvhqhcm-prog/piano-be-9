import { mascot } from '../components/mascot';
import { parentTip } from '../../lessons/parentTips';
import {
  sessionsThisWeek,
  streakDays,
  MAX_SESSIONS_PER_DAY,
  WEEKS,
  dailyLesson,
  levelOf,
  minutesToday,
  nextLesson,
  sessionsToday,
  weekPassed,
  weekPlan,
} from '../../lessons/lessonEngine';
import type { Lesson } from '../../lessons/types';
import type { App } from '../App';
import { button, h } from '../components/dom';
import { parentButton } from '../components/longPress';
import { freePlayScreen } from './freePlay';
import { libraryScreen } from './library';
import { parentGateScreen } from './parentGate';
import { startSession } from './session';
import { markSafePoint } from '../../pwa/updater';

/** Bản đồ "Hành trình tới Lâu đài Âm nhạc" — chỉ hiển thị tiến trình, không mở khóa bằng sao. */
function islandMap(app: App): HTMLElement {
  const data = app.store.get();
  const cur = data.progress.currentWeek;
  const lv = levelOf(cur);
  return h(
    'div',
    { class: 'map', role: 'list', 'aria-label': `Bản đồ ${lv.name}` },
    ...WEEKS.filter((w) => w.week >= lv.weeks[0] && w.week <= lv.weeks[1]).map((w) => {
      const passed = w.week < cur || weekPassed(w.week, data);
      const here = w.week === cur;
      return h(
        'div',
        { class: `island${here ? ' here' : ''}${passed ? ' passed' : ''}${w.week > cur ? ' later' : ''}`, role: 'listitem' },
        h('div', { class: 'island-emoji' }, w.week > cur ? '☁️' : w.islandEmoji),
        h('div', { class: 'island-name' }, w.week > cur ? `Tuần ${w.week}` : w.island),
        passed ? h('div', { class: 'island-badge' }, '✓') : here ? h('div', { class: 'island-badge here' }, '📍') : null,
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

    const lessonChip = (l: Lesson) =>
      h(
        'button',
        {
          class: `chip${l.id === next.id ? ' chip-next' : ''}`,
          type: 'button',
          onClick: () => !overLimit && startSession(app, l),
        },
        h('span', { class: 'chip-emoji' }, l.emoji),
        h('span', {}, l.title),
        done.has(l.id) ? h('span', { class: 'chip-done' }, '✓') : null,
      );

    root.append(
      h(
        'div',
        { class: 'screen' },
        h(
          'header',
          { class: 'topbar' },
          h(
            'div',
            { class: 'topbar-title' },
            h('span', { class: 'level-tag' }, levelOf(plan.week).name),
            ` ${plan.islandEmoji} Tuần ${plan.week} · ${plan.island}`,
          ),
          parentButton(() => app.show(parentGateScreen(app))),
        ),
        islandMap(app),
        h(
          'div',
          { class: 'stage home-stage' },
          banner ? h('div', { class: 'banner' }, banner) : null,
          h('div', { class: 'story-row' }, mascot('happy', 64), h('p', { class: 'story bubble' }, plan.story)),
          // Mục tiêu tuần (§1: 4–5 buổi/tuần) + chuỗi ngày + mục tiêu qua đảo
          (() => {
            const now = new Date();
            const done = sessionsThisWeek(data, now);
            const streak = streakDays(data, now);
            return h(
              'div',
              { class: 'goal-row' },
              h(
                'div',
                { class: 'goal-dots', title: 'Mục tiêu: 4–5 buổi mỗi tuần' },
                'Tuần này: ',
                ...[0, 1, 2, 3, 4].map((i) => h('span', { class: `dot${i < done ? ' on' : ''}` })),
                ` ${Math.min(done, 9)}/5`,
              ),
              streak >= 2 ? h('div', { class: 'streak' }, `🔥 ${streak} ngày liền`) : null,
              h('div', { class: 'goal-text' }, `🎯 ${plan.criterion.text}`),
            );
          })(),
          overLimit
            ? h('div', { class: 'banner' }, '🌙 Hôm nay con học đủ rồi. Mai mình học tiếp nhé!')
            : button({
                icon: '▶',
                label: `Học tiếp: ${next.emoji} ${next.title}`,
                kind: 'primary',
                big: true,
                onTap: () => startSession(app, next),
              }),
          h(
            'div',
            { class: 'chips' },
            ...plan.lessons.map(lessonChip),
            // Từ Cấp 2: luyện tập mỗi ngày (bài đang tập + ôn bài đã thuộc + đọc nhạc mới)
            plan.week >= 9 && next.id !== `w${plan.week}-daily`
              ? h(
                  'button',
                  { class: 'chip', type: 'button', onClick: () => !overLimit && startSession(app, dailyLesson(app.store.get())) },
                  h('span', { class: 'chip-emoji' }, '🔁'),
                  h('span', {}, 'Luyện tập mỗi ngày'),
                )
              : null,
          ),
          h(
            'div',
            { class: 'home-row' },
            button({ icon: '🎵', label: 'Bài hát', onTap: () => app.show(libraryScreen(app)) }),
            button({ icon: '🎹', label: 'Đàn tự do', onTap: () => app.show(freePlayScreen(app)) }),
            h('div', { class: 'today-stars' }, 'Hôm nay: ', todayStars ? '★'.repeat(Math.min(todayStars, 9)) : '—'),
          ),
          h('p', { class: 'parent-tip' }, `👪 Bố mẹ: ${parentTip(plan.week)}`),
          todayCount >= MAX_SESSIONS_PER_DAY && !overLimit
            ? h('p', { class: 'soft-note' }, `Hôm nay con đã học ${todayCount} buổi rồi, giỏi quá! Nghỉ ngơi nhé 😊`)
            : null,
        ),
      ),
    );
  };
}
