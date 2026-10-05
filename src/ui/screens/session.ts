import { earnedStickerIds } from '../../lessons/stickers';
import { MAX_WEEK, activityDoneId, buildSessionPlan, levelOf, weekComplete, weekPlan } from '../../lessons/lessonEngine';
import type { Activity, Lesson, Segment } from '../../lessons/types';
import { findTune } from '../../music/exercises';
import { makeSightTune } from '../../music/sightread';
import type { App, Screen } from '../App';
import { h } from '../components/dom';
import { quizScreen } from './ear';
import { dynamicsScreen } from './dynamics';
import { homeScreen } from './home';
import { postureScreen } from './posture';
import { practiceScreen } from './practice';
import { ratingScreen } from './rating';
import { rhythmScreen } from './rhythm';
import { sessionEndScreen } from './sessionEnd';
import { songScreen } from './song';
import { stageScreen } from './stage';
import { teachScreen } from './teach';
import { techniqueScreen } from './technique';
import { improvScreen } from './improv';

/**
 * Chạy một buổi (v2): Tư thế → Ôn nhanh → Khởi động tai/đọc nốt → Bài mới → Con làm thầy → Tổng kết.
 * Hết thời lượng buổi: sau hoạt động đang làm → sang Con làm thầy/Tổng kết (§9, không khóa).
 */
export function startSession(app: App, lesson: Lesson, opts: { replay?: boolean } = {}): void {
  const store = app.store;
  // Đã qua tuần hiện tại TRƯỚC buổi này chưa — để 🏆 tuần cuối chỉ hiện đúng buổi vừa qua, không lặp mãi
  const passedBefore = weekComplete(store.get().progress.currentWeek, store.get());
  // Sticker đã có trước buổi — màn kết thúc so sánh để chúc mừng sticker MỚI
  const stickersBefore = earnedStickerIds(store.get());
  const session = store.startSession(lesson.id);
  // songReview: thêm bước "Ôn bài cũ" (một câu của bài 2–4 tuần trước) — không tính vào hoàn thành bài
  const steps = buildSessionPlan(lesson, store.get(), { ...opts, songReview: true, now: Date.now() });
  const wrapUp = steps.findIndex((s) => s.kind === 'teach' || s.kind === 'rating');
  const deadline = Date.now() + store.settings.sessionMinutes * 60_000;
  let lessonFinished = false;

  const finish = () => {
    app.mic.stop();
    store.finishSession(session.id);
    if (lessonFinished) store.markLessonCompleted(lesson.id);
    let banner: string | undefined;
    const week = store.get().progress.currentWeek;
    // Sang tuần mới khi ĐẠT TIÊU CHÍ và đã HỌC HẾT các bài của tuần (không bỏ sót bài dạy điều mới)
    if (lesson.week === week && weekComplete(week, store.get())) {
      if (week < MAX_WEEK) {
        store.setCurrentWeek(week + 1);
        const next = weekPlan(week + 1);
        banner =
          levelOf(week + 1).level !== levelOf(week).level
            ? `🎉 Con đã lên ${levelOf(week + 1).name}! Chặng mới: ${next.islandEmoji} ${next.island}.`
            : `🏅 Con đã qua ${weekPlan(week).island}! Chặng tiếp: ${next.islandEmoji} ${next.island}.`;
      } else if (!passedBefore) {
        banner = `🏆 Con đã hoàn thành cả ${MAX_WEEK} tuần — từ nay mỗi ngày có bài luyện tập mới!`;
      }
    }
    app.show(
      sessionEndScreen(app, {
        banner,
        stickersBefore,
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
        if (!tune) return () => void window.setTimeout(onComplete, 0);
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
      case 'dynamics':
        // v4 — sắc thái to/nhỏ, ngắt/liền: mỗi lượt ghi PARENT_ASSESSMENT `dyn:${mode}:${i}`
        return dynamicsScreen(app, {
          title: a.title,
          intro: a.intro,
          mode: a.mode,
          rounds: a.rounds,
          record: (id, r) => store.addParentAssessment(session.id, id, r),
          onDone: onComplete,
          onBack: onExit,
        });
      case 'sight': {
        // Đọc nhạc: mỗi lần một đoạn MỚI do máy sinh ra, chơi chế độ chờ
        let k = 0;
        const one = (): Screen => {
          const tune = makeSightTune(
            { position: a.position, hand: a.hand, measures: a.hand === 'LH' ? 2 : 3, rhythm: a.rhythm, timeSignature: a.timeSignature },
            Math.random,
            `sight:${a.position}:${a.hand}`,
          );
          tune.titleVi = `${a.title} (${k + 1}/${a.count})`;
          return songScreen(
            app,
            tune,
            { mode: 'wait', hints: a.hints, intro: 'Đoạn nhạc mới toanh — đọc rồi đàn nhé!' },
            {
              onRun: (run) => store.addSongRun(session.id, run),
              onDone: () => (++k < a.count ? app.show(one()) : onComplete()),
              onBack: onExit,
            },
          );
        };
        return one();
      }
      case 'technique':
        // v5 — khởi động kỹ thuật: mỗi bài ghi PARENT_ASSESSMENT `tech:${drill}`
        return techniqueScreen(app, {
          title: a.title,
          drills: a.drills,
          record: (id, r) => store.addParentAssessment(session.id, id, r),
          onDone: onComplete,
          onBack: onExit,
        });
      case 'improv':
        // v5 — sáng tạo: xong trò ghi PARENT_ASSESSMENT `improv:${mode}`; sáng tác lưu bài vào store.compositions
        return improvScreen(app, {
          title: a.title,
          intro: a.intro,
          mode: a.mode,
          position: a.position,
          bars: a.bars,
          record: (id, r) => store.addParentAssessment(session.id, id, r),
          onDone: onComplete,
          onBack: onExit,
        });
      case 'stage':
        return stageScreen(app, {
          level: a.level ?? 1,
          onRun: (run) => store.addSongRun(session.id, run),
          onMedal: () => store.addParentAssessment(session.id, 'medal', 'correct'),
          onDone: onComplete,
          onBack: onExit,
        });
    }
  };

  const withProgress =
    (screen: Screen, i: number): Screen =>
    (root) => {
      const cleanup = screen(root);
      root.append(
        h(
          'div',
          { class: 'session-progress', 'aria-hidden': 'true' },
          ...steps.map((_, k) => h('i', { class: k < i ? 'done' : k === i ? 'now' : undefined })),
        ),
      );
      return cleanup;
    };

  const go = (i: number): void => {
    if (i < 0) {
      app.mic.stop();
      store.discardSessionIfEmpty(session.id);
      return app.show(homeScreen(app));
    }
    const step = steps[i];
    // Vạch tiến trình nhỏ trên cùng màn: bé thấy buổi học còn mấy bước (chỉ là trang trí, không đổi logic)
    const show = (screen: Screen) => app.show(withProgress(screen, i));
    const next = () => go(i + 1);
    const back = () => go(i - 1);
    // Hết giờ: bỏ qua phần còn lại của bài, sang phần kết
    const nextOrWrap = () => (Date.now() >= deadline && i + 1 < wrapUp ? go(wrapUp) : next());
    switch (step.kind) {
      case 'posture':
        return show(postureScreen(app, { short: step.short, onDone: next, onBack: back }));
      case 'review':
        return show(segmentScreen(step.segment, nextOrWrap, back));
      case 'quiz':
        return show(
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
        return show(
          activityScreen(
            step.activity,
            () => {
              // Ghi nhận từng hoạt động xong → hết giờ giữa bài thì lần sau học tiếp phần còn lại
              if (!opts.replay) store.markLessonCompleted(activityDoneId(lesson.id, step.index));
              if (step.last) {
                lessonFinished = true;
                return next();
              }
              nextOrWrap();
            },
            back,
          ),
        );
      case 'review-song': {
        const tune = findTune(step.songId);
        if (!tune || Date.now() >= deadline) return next();
        return app.show(
          songScreen(
            app,
            tune,
            { mode: 'tempo', level: step.level, hints: step.hints, intro: step.intro, phrase: step.phrase, bpm: step.bpm, review: true },
            { onRun: (run) => store.addSongRun(session.id, run), onDone: nextOrWrap, onBack: back },
          ),
        );
      }
      case 'teach':
        return show(
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
        return show(
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
