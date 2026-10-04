import { MAX_SESSIONS_PER_DAY, nextLesson, sessionsToday, weekPlan } from '../../lessons/lessonEngine';
import type { Lesson } from '../../lessons/types';
import type { App } from '../App';
import { button, h } from '../components/dom';
import { parentButton } from '../components/longPress';
import { freePlayScreen } from './freePlay';
import { parentGateScreen } from './parentGate';
import { startSession } from './session';

export function homeScreen(app: App, banner?: string) {
  return (root: HTMLElement) => {
    const data = app.store.get();
    const plan = weekPlan(data.progress.currentWeek);
    const next = nextLesson(data);
    const done = new Set(data.progress.lessonsCompleted);
    const today = app.store.today();
    const todayStars = data.progress.practiceDays[today]?.stars ?? 0;
    const todayCount = sessionsToday(data, today).filter((s) => s.completed).length;

    const lessonChip = (l: Lesson) =>
      h(
        'button',
        {
          class: `chip${l.id === next.id ? ' chip-next' : ''}`,
          type: 'button',
          onClick: () => startSession(app, l),
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
          h('div', { class: 'topbar-title' }, `Tuần ${plan.week} · ${plan.title}`),
          parentButton(() => app.show(parentGateScreen(app))),
        ),
        h(
          'div',
          { class: 'stage' },
          banner ? h('div', { class: 'banner' }, banner) : null,
          button({
            icon: '▶',
            label: `Học tiếp: ${next.emoji} ${next.title}`,
            kind: 'primary',
            big: true,
            onTap: () => startSession(app, next),
          }),
          h('div', { class: 'chips' }, ...plan.lessons.map(lessonChip)),
          h(
            'div',
            { class: 'home-row' },
            button({ icon: '🎹', label: 'Đàn tự do', onTap: () => app.show(freePlayScreen(app)) }),
            h('div', { class: 'today-stars' }, 'Hôm nay: ', todayStars ? '★'.repeat(Math.min(todayStars, 9)) : '—'),
          ),
          todayCount >= MAX_SESSIONS_PER_DAY
            ? h('p', { class: 'soft-note' }, `Hôm nay con đã học ${todayCount} buổi rồi, giỏi quá! Nghỉ ngơi nhé 😊`)
            : null,
        ),
      ),
    );
  };
}
