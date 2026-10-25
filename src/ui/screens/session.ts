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
import { lazy, lazyScreen } from '../lazy';
import { setOctaveObserver } from '../../music/waitJudge';
import { noteOctaveEvent, type MiddleCReason } from '../../lessons/middleC';
import type { StretchOffer } from '../../lessons/sessionSelectors';
import { STRETCH_LESSON_PREFIX } from '../../lessons/adaptive';
import { readTheorySeen, theoryBadge, unseenOf, withTheorySeen } from '../../lessons/theorySeen';
import type { TheoryId } from '../../lessons/types';
import { startSessionFlow, type EndInfo, type FlowView, type SessionFlow } from './sessionFlow';

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
// (+ 2026-10-17) 🎹 Nhạc công nhỏ (dịch giọng, đệm hợp âm, đàn theo tai, đánh bóng, buổi diễn nhỏ) — chunk riêng
const musicianMod = lazy(() => import('./musician'));
type ImprovHooks = Parameters<typeof import('./improv').improvScreen>[1];
type StageHooks = Parameters<typeof import('./stage').stageScreen>[1];
const improvScreen = (app: App, hooks: ImprovHooks): Screen => lazyScreen(improvMod, (m) => m.improvScreen(app, hooks));

/**
 * (+ 2026-10-16, OWNER duyệt "Tự cân độ khó theo bé") ⭐ Thử thách nhỏ TÙY CHỌN ở màn kết (lessons/sessionSelectors.stretchOffer):
 * bài hát → buổi riêng `stretch-song-<bài>` (lessons/sessionKind 'stretch': không vào tiêu chí tuần, không vào "đã thuộc",
 * không phải buổi bài học, không tính vào chỉ số độ khó); đọc nhạc → màn "Đọc nhạc 1 phút" (không ghi gì).
 */
function playStretch(app: App, offer: StretchOffer, done: () => void): void {
  if (offer.kind === 'sight') {
    app.show(sightDailyScreen(app, offer.step, { onDone: done, onBack: done }));
    return;
  }
  const tune = findTune(offer.songId);
  if (!tune) return done();
  const store = app.store;
  const session = store.startSession(`${STRETCH_LESSON_PREFIX}${tune.id}`);
  const close = (): void => {
    app.mic.stop();
    const cur = store.get().sessions.find((x) => x.id === session.id);
    if (cur && cur.songRuns.length) store.finishSession(session.id);
    else store.discardSessionIfEmpty(session.id);
    done();
  };
  app.show(
    songScreen(
      app,
      tune,
      offer.kind === 'faster'
        ? { mode: 'tempo', level: 2, bpm: offer.bpm, hints: 'names', free: true, intro: '⭐ Thử thách nhỏ — nhanh hơn một chút! Chưa được cũng không sao.' }
        : { mode: 'wait', hints: 'full', free: true, intro: '⭐ Thử thách nhỏ — bài khó hơn một chút, từng nốt nhé!' },
      { onRun: (run) => store.addSongRun(session.id, run), onDone: close, onBack: close },
    ),
  );
}
const stageScreen = (app: App, hooks: StageHooks): Screen => lazyScreen(stageMod, (m) => m.stageScreen(app, hooks));

/**
 * Chạy một buổi (v5.1 — ≤ 7 màn): [v5.2: Khởi động bằng nhạc + câu nhắc tư thế (+ thẻ tư thế đầy đủ đầu tuần) + khởi động
 * tay 30"] → Ôn nhanh → Khởi động tai/đọc nốt → (v5.2: Đọc nhạc 1 phút, từ tuần 8) → Bài mới → (Ôn bài cũ)
 * → Màn kết (Con làm thầy + Dễ/Vừa/Khó). Hết thời lượng buổi: sau hoạt động đang làm → sang màn kết (§9, không khóa).
 * Chỉ bước 'activity' đánh dấu activityDoneId (học tiếp); các bước khác không ghi tiến độ bài.
 * (+ 2026-10-17) Điều phối (thứ tự, quay lại, hết giờ, chơi lại, màn kết) ở sessionFlow.ts (test được); file này chỉ dựng màn.
 */
export function startSession(app: App, lesson: Lesson, opts: { replay?: boolean; replayOf?: readonly number[] } = {}): void {
  const store = app.store;
  const sid = (): string => flow.sessionId;

  const practiceHooks = (onComplete: () => void, onExit: () => void) => ({
    record: (t: { noteId: string }, result: 'correct' | 'retry') => store.addParentAssessment(sid(), t.noteId, result),
    recordMic: (t: { keys: string[] }, info: { firstHeard: string; wrongCount: number }) =>
      store.addMicAssessment(sid(), { expected: t.keys.join('+'), firstHeard: info.firstHeard, wrongCount: info.wrongCount }),
    amendLast: (result: 'correct' | 'retry', source: 'parent' | 'mic') =>
      source === 'mic' ? store.overrideLastMic(sid(), result) : store.amendLastParentAssessment(sid(), result),
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
          onAnswer: (e, act) => store.addAppAssessment(sid(), e, act),
          onDone: onComplete,
          onBack: onExit,
        });
      case 'song': {
        const tune = findTune(a.songId);
        if (!tune) return () => void window.setTimeout(onComplete, 0);
        // (+ 2026-10-17) "dừng nhẹ nhàng" chỉ tính cho bài hát của bài học, cả hai tay như bài (không lượt tách tay, không đọc nhạc)
        const countsStop = !a.hand && !a.songId.startsWith('sight');
        return songScreen(
          app,
          tune,
          // v5.1 — tách tay sẵn trong bài (hand: 'RH' | 'LH'), chỉ trên một câu khó (phrase); lượt một tay / một câu không tính tiêu chí tuần
          { mode: a.mode, level: a.level, hints: a.hints, intro: a.intro, hand: a.hand, ...(a.phrase ? { phrase: a.phrase } : {}), ...(a.pulseDrop ? { pulseDrop: true } : {}) },
          {
            onRun: (run) => flow.lessonRun(run),
            onDone: onComplete,
            onBack: onExit,
            ...(countsStop ? { onKindStop: () => flow.kindStop(a.songId) } : {}),
          },
        );
      }
      case 'rhythm':
        return rhythmScreen(app, {
          title: a.title,
          intro: a.intro,
          patterns: a.patterns,
          week: lesson.week,
          record: (id, r) => store.addParentAssessment(sid(), id, r),
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
          record: (id, r) => store.addParentAssessment(sid(), id, r),
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
              onRun: (run) => flow.lessonRun(run),
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
          record: (id, r) => store.addParentAssessment(sid(), id, r),
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
          record: (id, r) => store.addParentAssessment(sid(), id, r),
          onDone: onComplete,
          onBack: onExit,
        });
      case 'sing':
        // (2026-10-08) Hát trước khi đàn: ghi PARENT_ASSESSMENT `sing:<nốt>` / `singplay:<nốt>`
        return singScreen(app, {
          title: a.title,
          intro: a.intro,
          rounds: a.rounds,
          record: (id, r) => store.addParentAssessment(sid(), id, r),
          onDone: onComplete,
          onBack: onExit,
        });
      case 'theory':
        return lazyScreen(theoryMod, (m) => m.theoryCardScreen(app, { ids: a.ids, onDone: onComplete, onBack: onExit }));
      case 'musician':
        return lazyScreen(musicianMod, (m) =>
          m.musicianScreen(app, a, { week: lesson.week, onRun: (run) => flow.lessonRun(run), record: (id, r) => store.addParentAssessment(sid(), id, r), onDone: onComplete, onBack: onExit }),
        );
      case 'stage':
        return stageScreen(app, {
          level: a.level ?? 1,
          onRun: (run) => flow.lessonRun(run),
          onMedal: () => store.addParentAssessment(sid(), 'medal', 'correct'),
          onDone: onComplete,
          onBack: onExit,
        });
    }
  };

  /** (+ 2026-10-17) Chip "📘 1 thẻ mới" ở màn kết: thẻ của bài con chưa xem; chạm → thẻ (đánh dấu đã xem) → quay về màn kết. */
  const theoryChip = (ids: readonly TheoryId[] | undefined, back: () => void): { label: string; onOpen(): void } | null => {
    const fresh = ids?.length ? unseenOf(store.get(), ids) : [];
    if (!fresh.length) return null;
    return {
      label: theoryBadge(fresh.length) ?? '📘',
      onOpen: () => {
        const seen = withTheorySeen(readTheorySeen(store.settings), fresh);
        if (seen) store.updateSettings({ theorySeen: seen });
        app.show(lazyScreen(theoryMod, (m) => m.theoryCardScreen(app, { ids: fresh, onDone: back, onBack: back })));
      },
    };
  };

  /** Màn của một view (sessionFlow.FlowView). */
  const viewScreen = (v: FlowView): Screen => {
    switch (v.kind) {
      case 'middleC':
        return middleCScreen(app, v.reason, { onDone: v.onDone, onBack: v.onBack });
      case 'homework':
        return homeworkScreen(app, v.homework, { onRun: (run) => flow.otherRun(run), onDone: v.onDone, onBack: v.onBack });
      case 'music':
        return warmupScreen(app, v.step.warmup, { onDone: v.onDone, onBack: v.onBack });
      case 'posture':
        return postureScreen(app, { onDone: v.onDone, onBack: v.onBack });
      case 'drill':
        return techniqueScreen(app, {
          title: 'Khởi động tay',
          drills: [v.step.drill],
          mini: true,
          record: (id, r) => store.addParentAssessment(sid(), id, r),
          onDone: v.onDone,
          onBack: v.onBack,
        });
      case 'step': {
        const step = v.step;
        switch (step.kind) {
          case 'sight-daily':
            // v5.2 — Đọc nhạc 1 phút (đoạn mới mỗi lần): không đánh dấu activityDoneId, không ghi lượt chơi
            return sightDailyScreen(app, step, { onDone: v.onDone, onBack: v.onBack });
          case 'review':
            return segmentScreen(step.segment, v.onDone, v.onBack);
          case 'quiz':
            return quizScreen(app, {
              title: step.title,
              intro: step.intro,
              quiz: step.quiz,
              onAnswer: (e, act) => store.addAppAssessment(sid(), e, act),
              onDone: v.onDone,
              onBack: v.onBack,
            });
          case 'activity':
            return activityScreen(step.activity, v.onDone, v.onBack);
          case 'review-song': {
            const tune = findTune(step.songId);
            if (!tune) return () => void window.setTimeout(v.onDone, 0);
            return songScreen(
              app,
              tune,
              { mode: 'tempo', level: step.level, hints: step.hints, intro: step.intro, phrase: step.phrase, bpm: step.bpm, review: true },
              { onRun: (run) => flow.otherRun(run), onDone: v.onDone, onBack: v.onBack },
            );
          }
          case 'stretch-song': {
            // (+ 2026-10-25) ⭐ bước thử thách của bé giỏi (lessons/stretchPlan.ts): chỉ ghi lượt ĐẠT — thử chưa được không kéo
            // chỉ số độ khó / không thành "bài tập về nhà" (free); bỏ qua được bằng "Tiếp"
            const tune = findTune(step.songId);
            if (!tune) return () => void window.setTimeout(v.onDone, 0);
            return songScreen(
              app,
              tune,
              { mode: step.mode, level: 2, hints: step.hints, intro: step.intro, free: true },
              { onRun: (run) => (run.passed ? flow.otherRun(run) : undefined), onDone: v.onDone, onBack: v.onBack },
            );
          }
          case 'closing': {
            // (2026-10-25, OWNER "bỏ phần phụ huynh") không còn dòng "Bài tập về nhà" / lời nhắn cho bố mẹ ở màn kết
            return closingScreen(app, {
              teach: step.teach,
              // (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") thẻ "📘 Biết thêm" của bài → chip KHÔNG bắt buộc; mở xong quay
              // về màn kết (không đổi tiến độ — thẻ đã được đánh dấu "đã làm" khi buổi chạy hoạt động đầu tiên)
              theory: theoryChip(step.theory, () => flow.go(flow.steps.indexOf(step))),
              onTaught: () => store.addParentAssessment(sid(), 'teach-back', 'correct'),
              onRate: (r) => store.setSelfRating(sid(), r),
              onDone: v.onDone,
              onBack: v.onBack,
            });
          }
        }
      }
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
          ...flow.steps.map((_, k) => h('i', { class: k < i ? 'done' : k === i ? 'now' : undefined })),
        ),
      );
      return cleanup;
    };

  const end = (info: EndInfo): void => {
    const offer = info.offer;
    if (offer?.kind === 'reward') rewardMod.prefetch();
    app.show(
      sessionEndScreen(app, {
        banner: info.banner,
        stickersBefore: info.stickersBefore,
        // (+ 2026-10-17) tối đa MỘT nút mời (sessionFlow.pickEndOffer: ⭐ thử thách > 🎁 bài thưởng > 🎤 biểu diễn)
        ...(offer?.kind === 'concert' ? { concertWeek: offer.week } : {}),
        ...(offer?.kind === 'reward'
          ? {
              onReward: () =>
                app.show(lazyScreen(rewardMod, (m) => m.rewardSongsScreen(app, { exclude: info.lessonSongs, onHome: () => app.show(homeScreen(app)) }))),
            }
          : {}),
        ...(offer?.kind === 'stretch'
          ? { stretch: { label: offer.offer.label, onTap: () => playStretch(app, offer.offer, () => app.show(homeScreen(app))) } }
          : {}),
        // (+ 2026-10-17) "Chơi lại bài vừa học" = chơi lại ĐÚNG các hoạt động vừa xong (không cả bài, không tính xong bài)
        onReplay: () => startSession(app, lesson, { replay: true, replayOf: info.replayOf }),
        onHome: () => app.show(homeScreen(app)),
      }),
    );
  };

  const flow: SessionFlow = startSessionFlow(
    {
      store,
      now: () => Date.now(),
      show: (v, i) => app.show(withProgress(viewScreen(v), i)),
      home: () => app.show(homeScreen(app)),
      stopMic: () => app.mic.stop(),
      end,
    },
    lesson,
    opts,
  );
  for (const s of flow.steps) {
    if (s.kind === 'activity' && s.activity.kind === 'improv') improvMod.prefetch();
    if (s.kind === 'activity' && s.activity.kind === 'stage') stageMod.prefetch();
    if (s.kind === 'activity' && s.activity.kind === 'sing') singMod.prefetch();
    if (s.kind === 'posture' && s.middleC) middleCMod.prefetch();
  }

  // DEV (scripts/shots*.mjs): nhảy thẳng tới bước i của buổi để chụp màn từng bước
  if (import.meta.env.DEV) (window as unknown as { __session?: unknown }).__session = { steps: flow.steps, go: flow.go };
  flow.go(0);
}
