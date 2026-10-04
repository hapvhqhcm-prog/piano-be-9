import { MAX_WEEK, buildSessionPlan, weekPassed } from '../../lessons/lessonEngine';
import type { Lesson } from '../../lessons/types';
import type { App } from '../App';
import { earScreen } from './ear';
import { homeScreen } from './home';
import { postureScreen } from './posture';
import { practiceScreen } from './practice';
import { ratingScreen } from './rating';
import { sessionEndScreen } from './sessionEnd';

/**
 * Chạy một buổi theo §11: Tư thế → Tai nghe (từ tuần 2) → Bài mới → Tổng kết.
 * Hết thời lượng buổi: sau đoạn đang học → sang Tổng kết (§9, không khóa).
 */
export function startSession(app: App, lesson: Lesson, opts: { replay?: boolean } = {}): void {
  const store = app.store;
  const session = store.startSession(lesson.id);
  const steps = buildSessionPlan(lesson, opts);
  const ratingIndex = steps.findIndex((s) => s.kind === 'rating');
  const deadline = Date.now() + store.settings.sessionMinutes * 60_000;
  let lessonFinished = false;

  const finish = () => {
    app.mic.stop();
    store.finishSession(session.id);
    if (lessonFinished) store.markLessonCompleted(lesson.id);
    let banner: string | undefined;
    const week = store.get().progress.currentWeek;
    if (lesson.week === week && weekPassed(week, store.get())) {
      if (week < MAX_WEEK) {
        store.setCurrentWeek(week + 1);
        banner = `🏅 Con đã qua Tuần ${week}! Lần sau học Tuần ${week + 1}.`;
      } else {
        banner = `🏅 Con đã qua Tuần ${week}! Bố mẹ sẽ mở bài mới nhé.`;
      }
    }
    app.show(
      sessionEndScreen(app, {
        banner,
        onReplay: () => startSession(app, lesson, { replay: true }),
        onHome: () => app.show(homeScreen(app)),
      }),
    );
  };

  const go = (i: number): void => {
    if (i < 0) {
      app.mic.stop();
      store.discardSessionIfEmpty(session.id);
      return app.show(homeScreen(app));
    }
    const step = steps[i];
    const next = () => go(i + 1);
    const back = () => go(i - 1);
    switch (step.kind) {
      case 'posture':
        return app.show(postureScreen(app, { onDone: next, onBack: back }));
      case 'ear':
        return app.show(
          earScreen(app, {
            pool: step.pool,
            rounds: step.rounds,
            onAnswer: (expected, actual) => store.addAppAssessment(session.id, expected, actual),
            onDone: next,
            onBack: back,
          }),
        );
      case 'segment':
        return app.show(
          practiceScreen(app, step.segment, {
            record: (t, result) => store.addParentAssessment(session.id, t.noteId, result),
            recordMic: (t, info) =>
              store.addMicAssessment(session.id, {
                expected: t.keys.join('+'),
                firstHeard: info.firstHeard,
                wrongCount: info.wrongCount,
              }),
            amendLast: (result, source) =>
              source === 'mic'
                ? store.overrideLastMic(session.id, result)
                : store.amendLastParentAssessment(session.id, result),
            onComplete: () => {
              if (step.last) {
                lessonFinished = true;
                return go(ratingIndex);
              }
              if (Date.now() >= deadline) return go(ratingIndex);
              next();
            },
            onExit: back,
          }),
        );
      case 'rating':
        return app.show(
          ratingScreen(app, {
            onRate: (r) => store.setSelfRating(session.id, r),
            onDone: finish,
            onBack: back,
          }),
        );
    }
  };

  go(0);
}
