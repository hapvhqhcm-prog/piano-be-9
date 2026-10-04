import { MAX_WEEK, buildSessionPlan, weekPassed, weekPlan } from '../../lessons/lessonEngine';
import type { Activity, Lesson, Segment } from '../../lessons/types';
import { findTune } from '../../music/exercises';
import type { App, Screen } from '../App';
import { quizScreen } from './ear';
import { homeScreen } from './home';
import { postureScreen } from './posture';
import { practiceScreen } from './practice';
import { ratingScreen } from './rating';
import { rhythmScreen } from './rhythm';
import { sessionEndScreen } from './sessionEnd';
import { songScreen } from './song';
import { stageScreen } from './stage';
import { teachScreen } from './teach';

/**
 * Chạy một buổi (v2): Tư thế → Ôn nhanh → Khởi động tai/đọc nốt → Bài mới → Con làm thầy → Tổng kết.
 * Hết thời lượng buổi: sau hoạt động đang làm → sang Con làm thầy/Tổng kết (§9, không khóa).
 */
export function startSession(app: App, lesson: Lesson, opts: { replay?: boolean } = {}): void {
  const store = app.store;
  const session = store.startSession(lesson.id);
  const steps = buildSessionPlan(lesson, store.get(), opts);
  const wrapUp = steps.findIndex((s) => s.kind === 'teach' || s.kind === 'rating');
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
        const next = weekPlan(week + 1);
        banner = `🏅 Con đã qua ${weekPlan(week).island}! Chặng tiếp: ${next.islandEmoji} ${next.island}.`;
      } else {
        banner = '🏰 Con đã chinh phục Lâu đài Âm nhạc — hoàn thành cả 8 tuần!';
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

  const practiceHooks = (onComplete: () => void, onExit: () => void) => ({
    record: (t: { noteId: string }, result: 'correct' | 'retry') => store.addParentAssessment(session.id, t.noteId, result),
    recordMic: (t: { keys: string[] }, info: { firstHeard: string; wrongCount: number }) =>
      store.addMicAssessment(session.id, { expected: t.keys.join('+'), firstHeard: info.firstHeard, wrongCount: info.wrongCount }),
    amendLast: (result: 'correct' | 'retry', source: 'parent' | 'mic') =>
      source === 'mic' ? store.overrideLastMic(session.id, result) : store.amendLastParentAssessment(session.id, result),
    onComplete,
    onExit,
  });

  const segmentScreen = (seg: Segment, onComplete: () => void, onExit: () => void): Screen =>
    practiceScreen(app, seg, practiceHooks(onComplete, onExit));

  const activityScreen = (a: Activity, onComplete: () => void, onExit: () => void): Screen => {
    switch (a.kind) {
      case 'notes':
        return segmentScreen(a.segment, onComplete, onExit);
      case 'quiz':
        return quizScreen(app, {
          title: a.title,
          intro: a.intro,
          quiz: a.quiz,
          onAnswer: (e, act) => store.addAppAssessment(session.id, e, act),
          onDone: onComplete,
          onBack: onExit,
        });
      case 'song': {
        const tune = findTune(a.songId);
        if (!tune) return () => onComplete();
        return songScreen(
          app,
          tune,
          { mode: a.mode, level: a.level, hints: a.hints, intro: a.intro },
          { onRun: (run) => store.addSongRun(session.id, run), onDone: onComplete, onBack: onExit },
        );
      }
      case 'rhythm':
        return rhythmScreen(app, {
          title: a.title,
          intro: a.intro,
          patterns: a.patterns,
          record: (id, r) => store.addParentAssessment(session.id, id, r),
          onDone: onComplete,
          onBack: onExit,
        });
      case 'stage':
        return stageScreen(app, {
          onRun: (run) => store.addSongRun(session.id, run),
          onMedal: () => store.addParentAssessment(session.id, 'medal', 'correct'),
          onDone: onComplete,
          onBack: onExit,
        });
    }
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
    // Hết giờ: bỏ qua phần còn lại của bài, sang phần kết
    const nextOrWrap = () => (Date.now() >= deadline && i + 1 < wrapUp ? go(wrapUp) : next());
    switch (step.kind) {
      case 'posture':
        return app.show(postureScreen(app, { short: step.short, onDone: next, onBack: back }));
      case 'review':
        return app.show(segmentScreen(step.segment, nextOrWrap, back));
      case 'quiz':
        return app.show(
          quizScreen(app, {
            title: step.title,
            intro: step.intro,
            quiz: step.quiz,
            onAnswer: (e, act) => store.addAppAssessment(session.id, e, act),
            onDone: nextOrWrap,
            onBack: back,
          }),
        );
      case 'activity':
        return app.show(
          activityScreen(
            step.activity,
            () => {
              if (step.last) {
                lessonFinished = true;
                return next();
              }
              nextOrWrap();
            },
            back,
          ),
        );
      case 'teach':
        return app.show(
          teachScreen(app, {
            emoji: step.emoji,
            text: step.text,
            onDone: () => {
              store.addParentAssessment(session.id, 'teach-back', 'correct');
              next();
            },
            onSkip: next,
            onBack: back,
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
