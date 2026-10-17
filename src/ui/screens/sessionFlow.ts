/**
 * (+ 2026-10-17, rà soát kỹ sư trưởng) ĐIỀU PHỐI một buổi học — tách khỏi session.ts để test được (KHÔNG import DOM / màn nào):
 * thứ tự bước, mở đầu (📍 Đô giữa → 📝 bài tập về nhà → 🎵 khởi động bằng nhạc → tư thế → khởi động tay), quay lại, hết giờ,
 * chơi lại, màn kết (banner sang tuần / 🎁 bài thưởng / ⭐ thử thách / 🎤 biểu diễn). session.ts chỉ DỰNG MÀN cho từng "view"
 * (FlowEnv.show) và màn kết (FlowEnv.end). Test: tests/sessionFlow-2026-10-17.test.ts (App giả + ProgressStore thật).
 *
 * Luật (đổi 2026-10-17):
 * - HẾT GIỜ: sau hoạt động đang làm → sang màn kết, NHƯNG chỉ khi buổi đã chạy ÍT NHẤT MỘT hoạt động của bài (canWrap).
 *   Đồng hồ vẫn tính từ đầu buổi (mở đầu dài — Đô giữa, bài tập về nhà… — không làm buổi mất bài học: bước trước bài
 *   (ôn nhanh, khởi động tai, đọc nhạc 1 phút) không bao giờ nhảy thẳng tới màn kết). Đây là luật đơn giản & chắc nhất: buổi
 *   nào cũng có ≥ 1 hoạt động của bài; phần còn lại học tiếp buổi sau (dấu "<bài>#<i>").
 * - MỞ ĐẦU chạy MỘT LẦN mỗi buổi: Đô giữa / dải "👪 Hôm nay để ý" chỉ hiện lần đầu (cờ của BUỔI, không của mỗi lần vào
 *   bước); quay lại từ bước 2 → về thẳng bước con CUỐI của mở đầu.
 * - (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") MỞ ĐẦU ≤ 60 giây (openingPlan): bài tập về nhà THAY khởi động bằng
 *   nhạc; thẻ tư thế đầy đủ ≤ 1 lần / tuần (ghi settings.postureFullAt); Đô giữa chỉ khi bé thật sự lệch quãng 8; không mời bài
 *   tập về nhà của bài đã thuộc. Thẻ "📘 Biết thêm" không còn là bước: hoạt động xong đầu tiên của buổi đánh dấu luôn các thẻ
 *   của bài là "đã làm" (chỉ số hoạt động giữ nguyên; không đổi "xong bài" — bài xong khi hoạt động cuối KHÔNG phải thẻ xong).
 * - CHƠI LẠI: chơi lại ĐÚNG các hoạt động vừa xong trong buổi (replayOf) và KHÔNG BAO GIỜ đánh dấu xong bài.
 * - MÀN KẾT: tối đa MỘT nút "mời" (pickEndOffer: ⭐ thử thách nhỏ > 🎁 bài thưởng > 🎤 biểu diễn) + các nút tiếp tục.
 */
import type { ProgressStore } from '../../progress/ProgressStore';
import type { SongRun } from '../../progress/schema';
import type { Lesson } from '../../lessons/types';
import { MAX_WEEK, activityDoneId, buildSessionPlan, levelOf, weekComplete, weekPlan, type SessionStep } from '../../lessons/lessonEngine';
import { nextReviewSkips, readReviewSkips } from '../../lessons/sessionPlan';
import { earnedStickerIds } from '../../lessons/stickers';
import { pendingHomework, type Homework } from '../../lessons/homework';
import { octaveTrouble, readOctaveLog, type MiddleCReason } from '../../lessons/middleC';
import { parentFocus, type ParentFocus } from '../../lessons/parentFocus';
import { handFocus, readHandLook } from '../../lessons/handTechnique';
import { rewardEligible } from '../../lessons/rewardSongs';
import { songMastered } from '../../lessons/songStats';
import { pushWarmupRecent, readWarmupRecent, stretchOffer, type StretchOffer } from '../../lessons/sessionSelectors';
import { concertOfferWeek } from '../../lessons/concert';
import { weekHeld } from './weekHold';

export type PostureStep = Extract<SessionStep, { kind: 'posture' }>;
export type PlainStep = Exclude<SessionStep, { kind: 'posture' }>;

interface Nav {
  onDone(): void;
  onBack(): void;
}

/** Một màn cần dựng (session.ts quyết định màn thật cho từng loại). */
export type FlowView =
  | ({ kind: 'middleC'; reason: MiddleCReason } & Nav)
  | ({ kind: 'homework'; homework: Homework; focus: ParentFocus | null } & Nav)
  | ({ kind: 'music'; step: PostureStep; focus: ParentFocus | null } & Nav)
  | ({ kind: 'posture'; step: PostureStep } & Nav)
  | ({ kind: 'drill'; step: PostureStep } & Nav)
  | ({ kind: 'step'; step: PlainStep } & Nav);

/** Nút "mời" DUY NHẤT ở màn kết (null = không mời gì). */
export type EndOffer = { kind: 'concert'; week: number } | { kind: 'stretch'; offer: StretchOffer } | { kind: 'reward' };

/**
 * (+ 2026-10-17) Màn kết chỉ có MỘT nút mời (iPad mini 1133×744 / 1080×810: phần thưởng + thử thách + hàng biểu diễn + sticker
 * + trứng + cúp tràn màn). Ưu tiên theo giá trị CỦA BUỔI NÀY:
 * 1. ⭐ thử thách nhỏ — hiếm (chỉ khi bé đang làm rất tốt), giúp tiến bộ, và chính nó cũng là "phần thưởng" vui;
 * 2. 🎁 bài thưởng — phản hồi ngay cho buổi suôn sẻ (mất đi nếu không hiện hôm nay);
 * 3. 🎤 biểu diễn cho cả nhà — lời mời của TUẦN, còn nguyên tới khi diễn (concertOfferWeek) → nhường chỗ, hiện ở buổi sau
 *    không có hai lời mời trên (vd buổi có dừng nhẹ nhàng, chơi lại).
 */
export function pickEndOffer(o: { concertWeek: number | null; stretch: StretchOffer | null; reward: boolean }): EndOffer | null {
  if (o.stretch) return { kind: 'stretch', offer: o.stretch };
  if (o.reward) return { kind: 'reward' };
  if (o.concertWeek !== null) return { kind: 'concert', week: o.concertWeek };
  return null;
}

/** Thông tin cho màn kết buổi. */
export interface EndInfo {
  sessionId: string;
  banner?: string;
  stickersBefore: string[];
  offer: EndOffer | null;
  /** Bài hát của bài học (bài thưởng xếp sau) */
  lessonSongs: string[];
  /** Hoạt động (chỉ số trong lesson.activities) vừa xong — "Chơi lại bài vừa học" chơi lại đúng các hoạt động này */
  replayOf: number[];
}

export interface FlowEnv {
  store: ProgressStore;
  now(): number;
  /** Dựng màn cho view ở bước thứ `stepIndex` (vạch tiến trình) */
  show(view: FlowView, stepIndex: number): void;
  /** Rời buổi về màn chính */
  home(): void;
  stopMic(): void;
  /** Màn kết buổi */
  end(info: EndInfo): void;
}

export interface FlowOpts {
  replay?: boolean;
  /** Chơi lại: các hoạt động vừa xong ở buổi trước */
  replayOf?: readonly number[];
}

export interface SessionFlow {
  readonly steps: readonly SessionStep[];
  readonly sessionId: string;
  go(i: number): void;
  /** Lượt bài hát của MỘT HOẠT ĐỘNG BÀI HỌC (bài hát / đọc nhạc / sân khấu) — ghi + đếm lượt đạt cho bài thưởng */
  lessonRun(run: Omit<SongRun, 'ts'>): void;
  /** Lượt bài hát khác của buổi (bài tập về nhà, ôn bài cũ) — chỉ ghi */
  otherRun(run: Omit<SongRun, 'ts'>): void;
  /** Thẻ "dừng nhẹ nhàng" hiện ở màn bài hát của một hoạt động bài học */
  kindStop(songId: string): void;
}

/**
 * (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") Các màn con của bước MỞ ĐẦU (theo thứ tự): MỘT bài nhạc đầu buổi —
 * 📝 bài tập về nhà (nếu có) THAY cho 🎵 khởi động bằng nhạc; rồi thẻ tư thế ĐẦY ĐỦ (chỉ khi `full`); rồi khởi động tay 30"
 * chỉ khi KHÔNG có bài tập về nhà và không có thẻ tư thế (mở đầu ≤ 60 giây: bài tập về nhà đã dài hơn khởi động; thẻ tư thế
 * đã dạy dáng tay).
 */
export function openingPlan(o: { full: boolean; homework: boolean }): { homework: boolean; music: boolean; posture: boolean; drill: boolean } {
  return { homework: o.homework, music: !o.homework, posture: o.full, drill: !o.homework && !o.full };
}

/** Hết giờ có được nhảy tới màn kết không: chỉ khi đã có ≥ 1 hoạt động của bài chạy xong (hoặc buổi không có hoạt động nào). */
export function canWrap(o: { now: number; deadline: number; activitiesDone: number; hasActivities: boolean }): boolean {
  return o.now >= o.deadline && (o.activitiesDone > 0 || !o.hasActivities);
}

export function startSessionFlow(env: FlowEnv, lesson: Lesson, opts: FlowOpts = {}): SessionFlow {
  const store = env.store;
  const replay = !!opts.replay;
  // Đã qua tuần hiện tại TRƯỚC buổi này chưa — để 🏆 tuần cuối chỉ hiện đúng buổi vừa qua, không lặp mãi
  const passedBefore = weekComplete(store.get().progress.currentWeek, store.get());
  // Sticker đã có trước buổi — màn kết thúc so sánh để chúc mừng sticker MỚI
  const stickersBefore = earnedStickerIds(store.get());
  const session = store.startSession(lesson.id);
  const octaveLog = readOctaveLog();
  const report: { reviewSong?: 'kept' | 'dropped' | 'none' } = {};
  // songReview: thêm bước "Ôn bài cũ"; sightRead (v5.2): thêm "Đọc nhạc 1 phút" từ tuần 8 — cả hai không tính vào hoàn thành bài
  const steps = buildSessionPlan(lesson, store.get(), {
    replay,
    ...(opts.replayOf ? { replayOf: opts.replayOf } : {}),
    songReview: true,
    sightRead: true,
    now: env.now(),
    octaveLog,
    today: store.today(),
    report,
  });
  // (+ 2026-10-17) Đếm số buổi liền "Ôn bài cũ" bị bỏ vì quá số màn → buổi sau giữ bước ôn (sessionPlan REVIEW_SONG_GUARANTEE)
  if (!replay) {
    try {
      const prev = readReviewSkips(store.settings);
      const n = nextReviewSkips(prev, report.reviewSong);
      if (n !== prev) store.updateSettings({ reviewSkips: n });
    } catch {
      /* chỉ là tiện ích — không chặn buổi học */
    }
  }
  // (+ 2026-10-16, OWNER duyệt) "👪 Bố mẹ 30 giây — hôm nay để ý: …" (một dòng chữ nhỏ đầu buổi; không ghi gì)
  let focus: ParentFocus | null = null;
  if (!replay) {
    try {
      const d = store.get();
      focus = parentFocus(lesson, {
        hand: handFocus(d, env.now(), readHandLook()),
        octave: octaveTrouble(octaveLog, env.now()),
        lessonDone: d.progress.lessonsCompleted.includes(lesson.id),
      });
    } catch {
      focus = null;
    }
  }
  // (+ 2026-10-15) 📝 Bài tập về nhà của buổi trước (ngày trước) → mời tập TRƯỚC khởi động (bỏ qua được)
  // (+ 2026-10-17, OWNER duyệt) không mời bài tập về nhà cho bài bé ĐÃ THUỘC (bài tập cũ còn đó từ trước khi thuộc)
  const hw0 = replay ? null : pendingHomework(store.settings, store.today(), env.now());
  const hw = hw0 && !songMastered(store.get(), hw0.songId) ? hw0 : null;
  const wrapUp = steps.findIndex((s) => s.kind === 'closing');
  // (+ 2026-10-17) chỉ số các thẻ "📘 Biết thêm" của bài đã được đưa ra khỏi buổi (closing.theory) — đánh dấu "đã làm" ở trên
  const closingStep = steps[wrapUp];
  let theorySkipped: number[] =
    closingStep?.kind === 'closing' && closingStep.theory?.length
      ? lesson.activities.flatMap((a, k) => (a.kind === 'theory' && !steps.some((s) => s.kind === 'activity' && s.index === k) ? [k] : []))
      : [];
  const hasActivities = steps.some((s) => s.kind === 'activity');
  const deadline = env.now() + store.settings.sessionMinutes * 60_000;

  // ---- trạng thái của BUỔI (không của từng lần vào bước) ----
  let lessonFinished = false;
  let lessonPassed = 0;
  const played: number[] = [];
  let focusTaken = false;
  let middleCShown = false;
  const takeFocus = (): ParentFocus | null => (focusTaken ? null : ((focusTaken = true), focus));

  const finish = (): void => {
    env.stopMic();
    store.finishSession(session.id);
    // (+ 2026-10-17) chơi lại không bao giờ đánh dấu xong bài (buildSessionPlan cũng không cho `last` khi chơi lại)
    if (lessonFinished && !replay) store.markLessonCompleted(lesson.id);
    // (+ 2026-10-16, OWNER duyệt) Buổi suôn sẻ → nút "🎁 Chọn 1 bài con thích" ở màn kết (không phải màn mừng)
    const done = store.get().sessions.find((s) => s.id === session.id);
    const reward = rewardEligible({ session: done, lessonFinished, lessonPassed, replay });
    // (+ 2026-10-16) ⭐ Thử thách nhỏ khi bé đang làm rất tốt (chế độ 'stretch') — tùy chọn
    let stretch: StretchOffer | null = null;
    if (!replay) {
      try {
        stretch = stretchOffer(lesson, store.get(), env.now());
      } catch {
        stretch = null;
      }
    }
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
    // (+ 2026-10-08) 🎤 Mời biểu diễn cho cả nhà — mỗi tuần giáo trình một lần (sau khi đã sang tuần mới nếu có)
    let concertWeek: number | null = null;
    try {
      concertWeek = concertOfferWeek(store.get());
    } catch {
      concertWeek = null;
    }
    env.end({
      sessionId: session.id,
      banner,
      stickersBefore,
      offer: pickEndOffer({ concertWeek, stretch, reward }),
      lessonSongs,
      replayOf: [...played],
    });
  };

  const go = (i: number, fromBack = false): void => {
    if (i < 0) {
      env.stopMic();
      store.discardSessionIfEmpty(session.id);
      return env.home();
    }
    const step = steps[i];
    const show = (v: FlowView) => env.show(v, i);
    const next = () => go(i + 1);
    const back = () => go(i - 1, true);
    // Hết giờ: bỏ qua phần còn lại của bài, sang phần kết — chỉ khi đã có ≥ 1 hoạt động của bài (canWrap)
    const nextOrWrap = () =>
      canWrap({ now: env.now(), deadline, activitiesDone: played.length, hasActivities }) && i + 1 < wrapUp ? go(wrapUp) : next();
    switch (step.kind) {
      case 'posture': {
        // (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") MỞ ĐẦU MỘT bước ≤ 60 giây (openingPlan): 📝 bài tập về nhà (nếu
        // có) THAY cho khởi động bằng nhạc (không bao giờ cả hai) — câu nhắc tư thế một dòng nằm trên chính bài đó; thẻ tư thế
        // ĐẦY ĐỦ chỉ khi step.full (≤ 1 lần / tuần, không hai buổi liền); khởi động tay 30" chỉ khi không có hai thứ kia.
        const o = openingPlan({ full: step.full, homework: !!hw });
        const first = (): void => (o.homework ? homework() : music());
        const afterFirst = (): void => (o.posture ? posture() : o.drill ? drill() : next());
        const posture = (): void => {
          if (!replay) {
            try {
              store.updateSettings({ postureFullAt: env.now() });
            } catch {
              /* chỉ là tiện ích — không chặn buổi học */
            }
          }
          show({ kind: 'posture', step, onDone: o.drill ? drill : next, onBack: first });
        };
        const drill = (): void => show({ kind: 'drill', step, onDone: next, onBack: o.posture ? posture : first });
        const music = (): void => show({ kind: 'music', step, focus: takeFocus(), onDone: afterFirst, onBack: back });
        const homework = (): void => {
          show({ kind: 'homework', homework: hw!, focus: takeFocus(), onDone: afterFirst, onBack: back });
        };
        // (+ 2026-10-17) quay lại từ bước sau → về bước con CUỐI của mở đầu (không chạy lại Đô giữa / bài tập về nhà / nhạc)
        if (fromBack) return o.drill ? drill() : o.posture ? posture() : first();
        // (+ 2026-10-16, OWNER duyệt) 📍 Tìm Đô giữa trên đàn thật (≤ 20 giây, bỏ qua được) — TRƯỚC mọi thứ khác của buổi
        if (step.middleC && !middleCShown) {
          middleCShown = true;
          return show({ kind: 'middleC', reason: step.middleC, onDone: first, onBack: back });
        }
        return first();
      }
      case 'sight-daily':
      case 'review':
        return show({ kind: 'step', step, onDone: nextOrWrap, onBack: back });
      case 'quiz':
        // (+ 2026-10-16, "Đổi món cho đỡ chán") ghi trò khởi động vừa chơi → buổi sau không lặp trò này
        if (step.warmup && !replay) {
          try {
            store.updateSettings({ warmupRecent: pushWarmupRecent(readWarmupRecent(store.settings), step.quiz.variant) });
          } catch {
            /* chỉ là tiện ích xoay vòng — không chặn buổi học */
          }
        }
        return show({ kind: 'step', step, onDone: nextOrWrap, onBack: back });
      case 'activity':
        return show({
          kind: 'step',
          step,
          onDone: () => {
            // Ghi nhận từng hoạt động xong → hết giờ giữa bài thì lần sau học tiếp phần còn lại
            if (!played.includes(step.index)) played.push(step.index);
            if (!replay) store.markLessonCompleted(activityDoneId(lesson.id, step.index));
            // (+ 2026-10-17) thẻ "📘 Biết thêm" của bài (ra khỏi buổi) → "đã làm" (mở trong Từ điển / chip màn kết)
            if (!replay && theorySkipped.length) {
              for (const k of theorySkipped) store.markLessonCompleted(activityDoneId(lesson.id, k));
              theorySkipped = [];
            }
            if (step.last) {
              lessonFinished = true;
              return next();
            }
            nextOrWrap();
          },
          onBack: back,
        });
      case 'review-song':
        if (env.now() >= deadline) return next();
        return show({ kind: 'step', step, onDone: nextOrWrap, onBack: back });
      case 'closing':
        return show({ kind: 'step', step, onDone: finish, onBack: back });
    }
  };

  return {
    steps,
    sessionId: session.id,
    go: (i: number) => go(i),
    lessonRun: (run) => {
      store.addSongRun(session.id, run);
      if (run.passed) lessonPassed++;
    },
    otherRun: (run) => store.addSongRun(session.id, run),
    kindStop: (songId) => store.markKindStop(session.id, songId),
  };
}
