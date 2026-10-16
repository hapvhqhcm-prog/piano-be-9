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
import { closingScreen } from './rating';
import { rhythmScreen } from './rhythm';
import { sessionEndScreen } from './sessionEnd';
import { songScreen } from './song';
import { sightDailyScreen } from './sightDaily';
import { techniqueScreen } from './technique';
import { homeworkScreen, warmupScreen } from './warmup';
import { pendingHomework, readHomework } from '../../lessons/homework';
import { weekHeld } from './weekHold';
import { lazy, lazyScreen } from '../lazy';
import { setOctaveObserver } from '../../music/waitJudge';
import { noteOctaveEvent, octaveTrouble, readOctaveLog, type MiddleCReason } from '../../lessons/middleC';
import { parentFocus, type ParentFocus } from '../../lessons/parentFocus';
import { handFocus, readHandLook } from '../../lessons/handTechnique';
import { rewardEligible } from '../../lessons/rewardSongs';

// (+ 2026-10-16) Mỗi lần bé đàn LỆCH QUÃNG 8 (waitJudge bước 8) → nhật ký nhỏ trong máy → mời "📍 Tìm Đô giữa" đầu buổi sau
setOctaveObserver(() => noteOctaveEvent());
// (+ 2026-10-16, OWNER duyệt) "📍 Tìm Đô giữa" đầu buổi · "🎁 Chọn 1 bài con thích" sau buổi suôn sẻ — chunk riêng
const middleCMod = lazy(() => import('./middleC'));
const rewardMod = lazy(() => import('./rewardSongs'));
const middleCScreen = (app: App, reason: MiddleCReason, hooks: { onDone(): void; onBack(): void }): Screen =>
  lazyScreen(middleCMod, (m) => m.middleCScreen(app, reason, hooks));

// Ít gặp trong buổi (sáng tạo / sân khấu) → chunk riêng, nạp trước ngay khi buổi học có bước đó.
const improvMod = lazy(() => import('./improv'));
const stageMod = lazy(() => import('./stage'));
// (2026-10-08) Hát trước khi đàn — chỉ tuần 6–10, chunk riêng
const singMod = lazy(() => import('./sing'));
type SingHooks = Parameters<typeof import('./sing').singScreen>[1];
const singScreen = (app: App, hooks: SingHooks): Screen => lazyScreen(singMod, (m) => m.singScreen(app, hooks));
// (2026-10-12) Thẻ "📘 Biết thêm" (nhạc lý nhẹ nhàng) — chunk riêng
const theoryMod = lazy(() => import('./theory'));
type ImprovHooks = Parameters<typeof import('./improv').improvScreen>[1];
type StageHooks = Parameters<typeof import('./stage').stageScreen>[1];
const improvScreen = (app: App, hooks: ImprovHooks): Screen => lazyScreen(improvMod, (m) => m.improvScreen(app, hooks));
const stageScreen = (app: App, hooks: StageHooks): Screen => lazyScreen(stageMod, (m) => m.stageScreen(app, hooks));

/**
 * Chạy một buổi (v5.1 — ≤ 7 màn): [v5.2: Khởi động bằng nhạc + câu nhắc tư thế (+ thẻ tư thế đầy đủ đầu tuần) + khởi động
 * tay 30"] → Ôn nhanh → Khởi động tai/đọc nốt → (v5.2: Đọc nhạc 1 phút, từ tuần 8) → Bài mới → (Ôn bài cũ)
 * → Màn kết (Con làm thầy + Dễ/Vừa/Khó). Hết thời lượng buổi: sau hoạt động đang làm → sang màn kết (§9, không khóa).
 * Chỉ bước 'activity' đánh dấu activityDoneId (học tiếp); các bước khác không ghi tiến độ bài.
 */
export function startSession(app: App, lesson: Lesson, opts: { replay?: boolean } = {}): void {
  const store = app.store;
  // Đã qua tuần hiện tại TRƯỚC buổi này chưa — để 🏆 tuần cuối chỉ hiện đúng buổi vừa qua, không lặp mãi
  const passedBefore = weekComplete(store.get().progress.currentWeek, store.get());
  // Sticker đã có trước buổi — màn kết thúc so sánh để chúc mừng sticker MỚI
  const stickersBefore = earnedStickerIds(store.get());
  const session = store.startSession(lesson.id);
  // songReview: thêm bước "Ôn bài cũ" (một câu của bài 2–4 tuần trước) — không tính vào hoàn thành bài
  // sightRead (v5.2): thêm "Đọc nhạc 1 phút" từ tuần 8 — cũng không tính vào hoàn thành bài
  const octaveLog = readOctaveLog();
  const steps = buildSessionPlan(lesson, store.get(), {
    ...opts,
    songReview: true,
    sightRead: true,
    now: Date.now(),
    octaveLog,
    today: store.today(),
  });
  // (+ 2026-10-16, OWNER duyệt) "👪 Bố mẹ 30 giây — hôm nay để ý: …" (một dòng chữ nhỏ đầu buổi; không ghi gì)
  let focus: ParentFocus | null = null;
  if (!opts.replay) {
    try {
      const d = store.get();
      focus = parentFocus(lesson, {
        hand: handFocus(d, Date.now(), readHandLook()),
        octave: octaveTrouble(octaveLog, Date.now()),
        lessonDone: d.progress.lessonsCompleted.includes(lesson.id),
      });
    } catch {
      focus = null;
    }
  }
  const wrapUp = steps.findIndex((s) => s.kind === 'closing');
  for (const s of steps) {
    if (s.kind === 'activity' && s.activity.kind === 'improv') improvMod.prefetch();
    if (s.kind === 'activity' && s.activity.kind === 'stage') stageMod.prefetch();
    if (s.kind === 'activity' && s.activity.kind === 'sing') singMod.prefetch();
    if (s.kind === 'posture' && s.middleC) middleCMod.prefetch();
  }
  const deadline = Date.now() + store.settings.sessionMinutes * 60_000;
  let lessonFinished = false;

  const finish = () => {
    app.mic.stop();
    store.finishSession(session.id);
    if (lessonFinished) store.markLessonCompleted(lesson.id);
    // (+ 2026-10-16, OWNER duyệt) Buổi suôn sẻ → nút "🎁 Chọn 1 bài con thích" ở màn kết (không phải màn mừng)
    const done = store.get().sessions.find((s) => s.id === session.id);
    const reward = rewardEligible({ session: done, lessonFinished, replay: opts.replay });
    if (reward) rewardMod.prefetch();
    const lessonSongs = lesson.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : []));
    let banner: string | undefined;
    const week = store.get().progress.currentWeek;
    // Sang tuần mới khi ĐẠT TIÊU CHÍ và đã HỌC HẾT các bài của tuần (không bỏ sót bài dạy điều mới)
    if (lesson.week === week && weekComplete(week, store.get())) {
      if (weekHeld(store.settings, week)) {
        // 👪 Bố mẹ chọn "Ở lại tuần này thêm" (màn Phụ huynh) → không tự sang tuần mới
      } else if (week < MAX_WEEK) {
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
        ...(reward
          ? {
              onReward: () =>
                app.show(lazyScreen(rewardMod, (m) => m.rewardSongsScreen(app, { exclude: lessonSongs, onHome: () => app.show(homeScreen(app)) }))),
            }
          : {}),
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
          // v5.1 — tách tay sẵn trong bài (hand: 'RH' | 'LH'), chỉ trên một câu khó (phrase); lượt một tay / một câu không tính tiêu chí tuần
          { mode: a.mode, level: a.level, hints: a.hints, intro: a.intro, hand: a.hand, ...(a.phrase ? { phrase: a.phrase } : {}), ...(a.pulseDrop ? { pulseDrop: true } : {}) },
          { onRun: (run) => store.addSongRun(session.id, run), onDone: onComplete, onBack: onExit },
        );
      }
      case 'rhythm':
        return rhythmScreen(app, {
          title: a.title,
          intro: a.intro,
          patterns: a.patterns,
          week: lesson.week,
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
      case 'sing':
        // (2026-10-08) Hát trước khi đàn: ghi PARENT_ASSESSMENT `sing:<nốt>` / `singplay:<nốt>`
        return singScreen(app, {
          title: a.title,
          intro: a.intro,
          rounds: a.rounds,
          record: (id, r) => store.addParentAssessment(session.id, id, r),
          onDone: onComplete,
          onBack: onExit,
        });
      case 'theory':
        return lazyScreen(theoryMod, (m) => m.theoryCardScreen(app, { ids: a.ids, onDone: onComplete, onBack: onExit }));
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
      case 'posture': {
        // v5.2 — MỞ ĐẦU BẰNG NHẠC (20–30 giây, bỏ qua được; câu nhắc tư thế một dòng) → thẻ tư thế ĐẦY ĐỦ chỉ khi step.full
        // → v5.1: MỘT bài khởi động tay ~30 giây. Cả ba trên cùng một chấm tiến trình. Khởi động bằng nhạc không ghi gì;
        // khởi động tay ghi PARENT_ASSESSMENT `tech:${drill}` như trước.
        // (+ 2026-10-16) Dải "👪 Hôm nay để ý" chỉ ở màn ĐẦU TIÊN có dải khởi động (bài tập về nhà, hoặc khởi động bằng nhạc)
        let focusShown = false;
        const takeFocus = (): ParentFocus | null => (focusShown ? null : ((focusShown = true), focus));
        // (+ 2026-10-16, sửa lỗi) MỌI hàm của bước khai báo TRƯỚC khi rẽ nhánh: trước đây nhánh "📝 Bài tập về nhà" `return`
        // trước khi `afterMusic` / `drill` được khai báo → xong bài tập về nhà, khởi động bằng nhạc gọi `afterMusic` →
        // ReferenceError (TDZ) → buổi kẹt ở màn khởi động.
        const posture = (): void => show(postureScreen(app, { onDone: drill, onBack: music }));
        const afterMusic = (): void => (step.full ? posture() : drill());
        const drill = (): void =>
          show(
            techniqueScreen(app, {
              title: 'Khởi động tay',
              drills: [step.drill],
              mini: true,
              record: (id, r) => store.addParentAssessment(session.id, id, r),
              onDone: next,
              onBack: step.full ? posture : music,
            }),
          );
        const music = (): void => show(warmupScreen(app, step.warmup, { onDone: afterMusic, onBack: back, focus: takeFocus() }));
        // (+ 2026-10-15) 📝 Bài tập về nhà của buổi trước (ngày trước) → mời tập TRƯỚC khởi động (bỏ qua được)
        const hw = opts.replay ? null : pendingHomework(store.settings, store.today());
        const homework = (): void =>
          hw ? show(homeworkScreen(app, hw, { onRun: (run) => store.addSongRun(session.id, run), onDone: music, onBack: back, focus: takeFocus() })) : music();
        // (+ 2026-10-16, OWNER duyệt) 📍 Tìm Đô giữa trên đàn thật (≤ 20 giây, bỏ qua được) — TRƯỚC mọi thứ khác của buổi
        if (step.middleC) return show(middleCScreen(app, step.middleC, { onDone: homework, onBack: back }));
        return homework();
      }
      case 'sight-daily':
        // v5.2 — Đọc nhạc 1 phút (đoạn mới mỗi lần): không đánh dấu activityDoneId, không ghi lượt chơi
        return show(sightDailyScreen(app, step, { onDone: nextOrWrap, onBack: back }));
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
        // v5.1: qua show() như mọi bước → vạch tiến trình buổi không biến mất ở bước này
        return show(
          songScreen(
            app,
            tune,
            { mode: 'tempo', level: step.level, hints: step.hints, intro: step.intro, phrase: step.phrase, bpm: step.bpm, review: true },
            { onRun: (run) => store.addSongRun(session.id, run), onDone: nextOrWrap, onBack: back },
          ),
        );
      }
      case 'closing':
        return show(
          closingScreen(app, {
            teach: step.teach,
            // (+ 2026-10-15) 📝 dòng "Bài tập về nhà" cho bố mẹ: chỗ thầy dặn trong buổi HÔM NAY
            homework: ((hw) => (hw && hw.date === store.today() ? hw.text : null))(readHomework(store.settings)),
            onTaught: () => store.addParentAssessment(session.id, 'teach-back', 'correct'),
            onRate: (r) => store.setSelfRating(session.id, r),
            onDone: finish,
            onBack: back,
          }),
        );
    }
  };

  // DEV (scripts/shots*.mjs): nhảy thẳng tới bước i của buổi để chụp màn từng bước
  if (import.meta.env.DEV) (window as unknown as { __session?: unknown }).__session = { steps, go };
  go(0);
}
