/**
 * Kế hoạch MỘT buổi học (các bước, giới hạn số màn). Nội dung các bước phụ: sessionSelectors.ts, targetMemory.ts.
 */
import type { QuizSpec } from '../practice/quiz';
import { localDateStr, type AppData } from '../progress/schema';
import { sessionCount } from '../progress/history';
import type { Activity, Lesson, Segment, TechniqueDrill, TheoryId } from './types';
import type { Hand, PositionId } from '../piano/fingering';
import { MAX_QUIZ_ROUNDS, activityDoneId, weekPlan } from './curriculum';
import { reviewSegment } from './targetMemory';
import { middleCReason, type MiddleCReason, type OctaveLog } from './middleC';
import { sightDailyFits } from './sessionEstimate';
import { findTune } from '../music/exercises';
import {
  postureFull,
  readWarmupRecent,
  reviewSongStep,
  rotateWarmup,
  sessionDrill,
  sightDailyStep,
  warmupCandidates,
  warmupIntro,
  warmupMusic,
  warmupTitle,
  type WarmupMusic,
} from './sessionSelectors';
import { difficulty } from './adaptive';
import { songEverPlayed } from './songStats';
import { weekPassed } from './weekCriteria';
import { sessionKind } from './sessionKind';

export type SessionStep =
  /**
   * Bước MỞ ĐẦU (một chấm tiến trình): v5.2 — khởi động bằng nhạc (`warmup`, kèm câu nhắc tư thế một dòng) →
   * thẻ tư thế ĐẦY ĐỦ chỉ khi `full` (postureFull) → v5.1: MỘT bài khởi động kỹ thuật ~30 giây (`drill`, xoay vòng — sessionDrill).
   */
  | {
      kind: 'posture';
      full: boolean;
      drill: TechniqueDrill;
      warmup: WarmupMusic;
      /**
       * (+ 2026-10-16, OWNER duyệt) "📍 Tìm Đô giữa trên đàn thật" ≤ 20 giây ĐẦU buổi (cùng chấm tiến trình — không thêm màn):
       * lý do hiện (lessons/middleC.ts middleCReason); null = không hiện. Không ghi gì vào buổi / tiêu chí.
       */
      middleC: MiddleCReason | null;
    }
  | { kind: 'review'; segment: Segment }
  | { kind: 'quiz'; title: string; intro: string; quiz: QuizSpec; warmup: boolean }
  | { kind: 'activity'; activity: Activity; last: boolean; /** vị trí trong lesson.activities */ index: number }
  /**
   * v5 — "Ôn bài cũ": MỘT câu (câu 1) của một bài 2–4 tuần trước, theo nhịp Mức 2.
   * KHÔNG phải hoạt động của bài học: session.ts không đánh dấu activityDoneId, không tính "xong bài".
   * Lượt chơi ghi phrase ≠ null → không ảnh hưởng tiêu chí tuần / "đã thuộc".
   */
  | {
      kind: 'review-song';
      songId: string;
      phrase: [number, number];
      /** 60 = đã thuộc · 56 = đã đạt (bài quen) · 50 = chưa · 40 = bài có móc kép (tốc độ mặc định của bài là 40) */
      bpm: number;
      level: 2;
      hints: 'full' | 'names';
      intro: string;
    }
  /**
   * v5.1 — MÀN KẾT (gộp "Con làm thầy" + tự chấm Dễ/Vừa/Khó thành MỘT màn): `teach` = thẻ "Con làm thầy"
   * (null khi chơi lại / sân khấu). Ghi cả hai dữ liệu như trước: PARENT_ASSESSMENT 'teach-back' và selfRating.
   */
  /**
   * v5.2 (OWNER duyệt 2026-10-08) — ĐỌC NHẠC 1 PHÚT MỖI NGÀY (từ tuần SIGHT_DAILY_WEEK): một đoạn MỚI do app sinh
   * (music/sightread.ts) trong thế tay hiện tại, chơi Từng nốt. Như 'review-song': KHÔNG phải hoạt động của bài
   * (không activityDoneId) và không ghi lượt chơi → không đổi tiến độ / tiêu chí / học tiếp.
   */
  | {
      kind: 'sight-daily';
      position: Exclude<PositionId, 'free'>;
      hand: Hand;
      measures: number;
      timeSignature: '4/4' | '3/4' | '2/4';
      rhythm: 1 | 2;
      /** names = có tên nốt; staff = chỉ khuông (rút dần theo tuần — sightDailyHints) */
      hints: 'names' | 'staff';
      startAnywhere: boolean;
    }
  | {
      kind: 'closing';
      teach: { emoji: string; text: string } | null;
      /**
       * (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") Thẻ "📘 Biết thêm" của bài — không còn là bước của buổi; màn kết
       * hiện chip "📘 1 thẻ mới" (không bắt buộc, không đổi tiến độ). Không có = bài không có thẻ / chơi lại.
       */
      theory?: TheoryId[];
    };

/** v5.1 — Buổi học tối đa ngần này màn (đếm cả tư thế, ôn nhanh, khởi động, hoạt động, ôn bài cũ, màn kết). */
export const MAX_SESSION_STEPS = 7;

/**
 * (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") Trò đố tai nghe / đọc nốt TRONG BUỔI tối đa ngần này lượt (khởi động và
 * trò trong bài) — trừ ngày chấm tiêu chí (tuần chấm bằng trò đố, chưa đạt): giữ đủ lượt của tuần (≤ MAX_QUIZ_ROUNDS).
 */
export const SESSION_QUIZ_ROUNDS = 3;

/** (+ 2026-10-17) Hoạt động "chỉ trên iPad" cho vui (trả lời trên màn hình / phím màn hình) — tối đa MỘT mỗi buổi. */
export const IPAD_FUN: ReadonlySet<Activity['kind']> = new Set(['quiz', 'improv', 'theory']);

/**
 * Kế hoạch một buổi (v5.1 — OWNER duyệt 2026-10-06: ≤ MAX_SESSION_STEPS màn, ≤ ~12 phút):
 * [v5.2: Khởi động bằng nhạc + câu nhắc tư thế (+ thẻ tư thế đầy đủ khi postureFull) + khởi động kỹ thuật 30"] → Ôn nhanh 1'
 * (từ tuần 2) → Khởi động tai/đọc nốt → (v5.2: Đọc nhạc 1 phút, từ tuần 8) → Bài mới → (Ôn bài cũ) → Màn kết
 * (Con làm thầy + Dễ/Vừa/Khó). Khởi động tai/đọc nốt bị BỎ khi bài có ≥ 3 lượt bài hát (trừ tuần chấm bằng khởi động).
 * Quá MAX_SESSION_STEPS màn → bỏ lần lượt: Ôn bài cũ → khởi động tai/đọc nốt (không phải tiêu chí) → Ôn nhanh
 * → Đọc nhạc 1 phút. Hoạt động của bài không bị bỏ. (v5.2: đọc nhạc mỗi ngày ưu tiên hơn Ôn nhanh — nó cũng là đọc nốt
 * trên khuông; bài đã có hoạt động đọc nhạc thì không thêm — "gộp".)
 * replay=true ("Chơi lại bài vừa học"): chỉ bài + màn kết (không thẻ "Con làm thầy"). (+ 2026-10-17) `replayOf` = các hoạt động
 * VỪA chơi (chỉ số trong lesson.activities) → chơi lại ĐÚNG các hoạt động đó (buổi nhẹ tay đã tách bài / học tiếp phần dở không
 * bị chơi lại cả bài); buổi chơi lại không bao giờ có `last` → không bao giờ tính "xong bài".
 */
export function buildSessionPlan(
  lesson: Lesson,
  data?: Readonly<AppData>,
  opts: {
    replay?: boolean;
    rng?: () => number;
    /** Giờ hiện tại (ms hoặc Date) — cho trọng số ôn / độ "tươi" của bài; mặc định Date.now() */
    now?: number | Date;
    /**
     * Thêm bước "Ôn bài cũ" (kind 'review-song') — BẬT TƯỜNG MINH vì session.ts phải biết chạy bước này
     * (bước lạ mà session.ts không xử lý → màn trắng). Mặc định tắt.
     */
    songReview?: boolean;
    /** v5.2 — Thêm bước "Đọc nhạc 1 phút" (kind 'sight-daily'); BẬT TƯỜNG MINH như songReview. Mặc định tắt. */
    sightRead?: boolean;
    /**
     * (+ 2026-10-16) Nhật ký lệch quãng 8 trong máy (lessons/middleC.ts readOctaveLog) + ngày hôm nay — cho bước "📍 Tìm Đô giữa".
     * Không truyền → chỉ xét thế tay mới / buổi đầu tuần ≤ 6 (ngày hôm nay suy từ `now`).
     */
    octaveLog?: OctaveLog | null;
    today?: string;
    /**
     * (+ 2026-10-16, OWNER duyệt "Tự cân độ khó theo bé") false = bỏ qua chế độ độ khó (lessons/adaptive.ts). Mặc định bật
     * khi có `data`: chế độ 'gentle' → buổi chỉ ≤ 1 hoạt động MỚI (gentleTodo), ưu tiên ôn, đọc nhạc có tên nốt.
     */
    adaptive?: boolean;
    /** (+ 2026-10-17) Chơi lại: chỉ số các hoạt động vừa chơi ở buổi trước (session.ts). Không có / rỗng = cả bài. */
    replayOf?: readonly number[];
    /** (+ 2026-10-17) Ghi lại: bước "Ôn bài cũ" có / bị bỏ vì quá số màn / không có (session.ts cập nhật settings.reviewSkips). */
    report?: { reviewSong?: 'kept' | 'dropped' | 'none' };
  } = {},
): SessionStep[] {
  const now = opts.now === undefined ? Date.now() : typeof opts.now === 'number' ? opts.now : opts.now.getTime();
  const plan = weekPlan(lesson.week);
  const steps: SessionStep[] = [];
  const isStage = lesson.activities.some((a) => a.kind === 'stage');
  const doneIds = new Set(data?.progress.lessonsCompleted ?? []);
  // Học tiếp phần còn dở: buổi trước hết giờ giữa bài → lần này chỉ làm các hoạt động CHƯA xong
  // (trước đây bài bị cắt vì hết giờ không bao giờ được tính xong → "Học tiếp" lặp lại mãi)
  let todo = lesson.activities.map((activity, index) => ({ activity, index }));
  if (opts.replay && opts.replayOf?.length) {
    const want = new Set(opts.replayOf);
    const again = todo.filter((x) => want.has(x.index));
    if (again.length) todo = again;
  } else if (!opts.replay && !doneIds.has(lesson.id)) {
    const rest = todo.filter((x) => !doneIds.has(activityDoneId(lesson.id, x.index)));
    if (rest.length) todo = rest;
  }
  // (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") Thẻ "📘 Biết thêm" (hoạt động 'theory') RA KHỎI buổi: không còn là
  // bước của buổi — thành chip "📘 1 thẻ mới" (không bắt buộc) ở màn kết + Từ điển nhạc nhỏ. Chỉ số hoạt động KHÔNG đổi;
  // hoạt động cuối KHÔNG phải thẻ mang `last` (xong nó = xong bài). Chỉ còn thẻ (dữ liệu cũ: bé học hết bài trừ thẻ) → giữ
  // thẻ làm bước như trước (để bài vẫn xong được).
  const theoryIds = todo.flatMap((x) => (x.activity.kind === 'theory' ? x.activity.ids : []));
  if (todo.some((x) => x.activity.kind !== 'theory')) todo = todo.filter((x) => x.activity.kind !== 'theory');
  // (+ 2026-10-16, OWNER duyệt "Tự cân độ khó theo bé") bé đang vấp nhiều → tách bài làm hai buổi: ≤ 1 hoạt động MỚI.
  // Mã bài / chỉ số hoạt động KHÔNG đổi: phần còn lại học ở buổi sau nhờ dấu "<bài>#<i>" (như hết giờ giữa bài).
  // Bài kiểm tra tuần / sân khấu / luyện tập mỗi ngày / chơi lại / bài ĐÃ xong (học lại để đạt tiêu chí — tách thì lượt
  // tiêu chí ở cuối bài không bao giờ tới): không tách.
  const gentle =
    !!data && opts.adaptive !== false && !opts.replay && !isStage && !lesson.isWeekTest && sessionKind(lesson.id) !== 'daily' && difficulty(data, now).mode === 'gentle';
  const splittable = gentle && !doneIds.has(lesson.id);
  let split = false;
  if (splittable) {
    const cut = gentleTodo(todo, data!);
    split = cut.length < todo.length;
    todo = cut;
  }
  // Khởi động: bài ĐẦU của tuần (chưa học) mà tuần không chấm bằng khởi động → dùng khởi động của tuần TRƯỚC,
  // để không hỏi nốt/khóa/giọng mới trước khi bài dạy (rà soát: tuần 9 khóa Fa, 11 thế Sol, 13 Fa♯, 17 trưởng/thứ…)
  const firstOfWeek = plan.lessons[0]?.id === lesson.id && !doneIds.has(lesson.id);
  const criterionQuiz = plan.criterion.who === 'APP';
  let warm: QuizSpec | null = plan.warmup;
  if (warm && firstOfWeek && !criterionQuiz && lesson.week > 1) {
    // v5.1: nội dung của tuần trước, SỐ LƯỢT của tuần này (tuần 1 chỉ 3 lượt — không kéo sang tuần 2)
    const prev = weekPlan(lesson.week - 1).warmup;
    warm = prev ? { ...prev, rounds: warm.rounds } : null;
  }
  // Bài đã có quiz cùng kiểu → bỏ khởi động (khỏi hỏi một thứ hai lần liền)
  if (warm && todo.some((x) => x.activity.kind === 'quiz' && x.activity.quiz.variant === warm!.variant)) warm = null;
  // v5.1: bài có ≥ 3 lượt bài hát đã đủ dài → bỏ khởi động (trừ tuần chấm bằng khởi động — cần cho tiêu chí)
  if (warm && !criterionQuiz && todo.filter((x) => x.activity.kind === 'song').length >= 3) warm = null;
  // (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") TỐI ĐA MỘT trò "chỉ trên iPad" mỗi buổi (trò đố / sáng tạo trên phím
  // màn hình): bài đã có một trò như vậy → bỏ trò khởi động (trừ ngày chấm tiêu chí bằng khởi động).
  // Ngày chấm tiêu chí = tuần chấm bằng khởi động mà CHƯA đạt (tiêu chí ≥ 5/6 trong một buổi cần đủ lượt).
  const criterionDay = criterionQuiz && !(data && weekPassed(lesson.week, data));
  if (warm && !criterionDay && todo.some((x) => IPAD_FUN.has(x.activity.kind))) warm = null;
  // (+ 2026-10-16, OWNER duyệt "Đổi món cho đỡ chán") XOAY VÒNG trò khởi động trong các trò cùng mục tiêu bé đã học
  // (sessionSelectors.warmupCandidates), không lặp trò của buổi trước (settings.warmupRecent — session.ts ghi khi chơi).
  // Tuần chấm bằng khởi động: GIỮ đúng trò của tuần tới khi đạt tiêu chí.
  if (warm && data && !opts.replay && (!criterionQuiz || weekPassed(lesson.week, data))) {
    const effWeek = firstOfWeek && !criterionQuiz && lesson.week > 1 ? lesson.week - 1 : lesson.week;
    const inLesson = new Set(todo.flatMap((x) => (x.activity.kind === 'quiz' ? [x.activity.quiz.variant] : [])));
    const cands = warmupCandidates(effWeek, warm).filter((q) => !inLesson.has(q.variant));
    warm = rotateWarmup(cands, readWarmupRecent(data.settings)) ?? warm;
  }
  const warmStep = (q: QuizSpec): SessionStep => {
    // v5.1 (OWNER duyệt 2026-10-06 sau buổi bé chơi thử): MỌI trò tai nghe / đọc nốt ≤ MAX_QUIZ_ROUNDS (6) lượt —
    // kể cả tuần chấm bằng khởi động (tiêu chí nay là ≥ 5/6 trong một buổi, ở 2 ngày)
    // (+ 2026-10-17, OWNER duyệt) trong buổi ≤ SESSION_QUIZ_ROUNDS (3) lượt — ngày chấm tiêu chí giữ đủ lượt của tuần
    const quiz = { ...q, rounds: Math.min(q.rounds, criterionDay ? MAX_QUIZ_ROUNDS : SESSION_QUIZ_ROUNDS) };
    return { kind: 'quiz', title: warmupTitle(quiz), intro: warmupIntro(quiz), quiz, warmup: true };
  };
  // Tuần chấm bằng khởi động (tai nghe / đọc nốt ≥ 5/6): buổi đầu học bài TRƯỚC, khởi động-chấm điểm SAU.
  // v5.1 (chơi thử 2026-10-06): tuần 1 khởi động tai luôn SAU bài — bé chạm đàn thật ngay sau tư thế.
  const warmAfter = !!warm && ((criterionQuiz && firstOfWeek) || lesson.week === 1);
  let opening: Extract<SessionStep, { kind: 'posture' }> | null = null;
  if (!opts.replay && !isStage) {
    // v5.2: mở đầu bằng NHẠC (bài khởi động chọn ở cuối, để không trùng bài "Ôn bài cũ"); thẻ tư thế đầy đủ chỉ khi postureFull
    opening = {
      kind: 'posture',
      full: postureFull(lesson, data, now),
      drill: sessionDrill(lesson.week, data ? sessionCount(data) : 0),
      warmup: { kind: 'riff', position: 'C', hand: 'RH', riffs: [] },
      middleC: middleCReason(lesson, data, { now, today: opts.today ?? localDateStr(new Date(now)), log: opts.octaveLog }),
    };
    steps.push(opening);
    // Bài kiểm tra tuần: KHÔNG ôn nhanh (để kết quả ôn không lẫn vào tiêu chí, vd C4 10/10)
    const review = data && !lesson.isWeekTest ? reviewSegment(lesson, data, opts.rng, now) : null;
    if (review) steps.push({ kind: 'review', segment: review });
    if (warm && !warmAfter) steps.push(warmStep(warm));
    // v5.2 — Đọc nhạc 1 phút: TRƯỚC bài mới (không bị "hết giờ" cắt mất); không phải hoạt động của bài
    if (opts.sightRead && data && sightDailyFits(lesson)) {
      const sd = sightDailyStep(lesson, data);
      // (+ 2026-10-16) nhẹ tay → đọc nhạc có tên nốt
      steps.push(gentle ? { ...sd, hints: 'names' } : sd);
    }
  }
  // v5.1: trò quiz trong bài cũng ≤ MAX_QUIZ_ROUNDS lượt (dữ liệu giáo trình đã ≤ 6; chặn thêm cho bài tự tạo về sau)
  // (+ 2026-10-17, OWNER duyệt) trò quiz trong bài ≤ SESSION_QUIZ_ROUNDS (3) lượt — trừ ngày chấm tiêu chí (tuần chấm bằng trò
  // đố chưa đạt: tiêu chí ≥ 5/6 câu liên tiếp trong MỘT buổi — weekCriteria.earPassInSession — cần đủ lượt)
  const quizCap = criterionDay ? MAX_QUIZ_ROUNDS : SESSION_QUIZ_ROUNDS;
  const capQuiz = (a: Activity): Activity =>
    a.kind === 'quiz' && a.quiz.rounds > quizCap ? { ...a, quiz: { ...a.quiz, rounds: quizCap } } : a;
  // `last` = hoạt động CUỐI của bài (xong → tính xong bài); buổi nhẹ tay đã tách bài → không có `last` (bài chưa xong)
  // (+ 2026-10-17) chơi lại → không `last` (chơi lại không bao giờ đánh dấu xong bài)
  todo.forEach((x, k) => steps.push({ kind: 'activity', activity: capQuiz(x.activity), index: x.index, last: !split && !opts.replay && k === todo.length - 1 }));
  if (!opts.replay && !isStage && warm && warmAfter) steps.push(warmStep(warm));
  // Ôn bài cũ (một câu, theo nhịp): SAU bài mới — hết giờ thì session.ts nhảy thẳng tới phần kết, bài mới không bị lấn
  let reviewSongId: string | null = null;
  if (opts.songReview && data && !opts.replay && !isStage && !lesson.isWeekTest && todo.length < 4 && sessionKind(lesson.id) !== 'daily') {
    const rs = reviewSongStep(lesson, data, now, opts.rng);
    if (rs) steps.push(rs);
    reviewSongId = rs?.songId ?? null;
  }
  let teach: { emoji: string; text: string } | null = null;
  if (!opts.replay && !isStage) {
    const daily = sessionKind(lesson.id) === 'daily';
    teach = daily ? DAILY_TEACH[(data ? sessionCount(data) : 0) % DAILY_TEACH.length] : lessonTeach(lesson);
  }
  // (+ 2026-10-17) thẻ "📘 Biết thêm" của bài (đã ra khỏi buổi) → chip KHÔNG bắt buộc ở màn kết (không khi chơi lại)
  const theory = !opts.replay && !todo.some((x) => x.activity.kind === 'theory') && theoryIds.length ? [...new Set(theoryIds)] : null;
  steps.push({ kind: 'closing', teach: teach ? { ...teach } : null, ...(theory ? { theory } : {}) });
  // v5.1 — giới hạn số màn: bỏ bước PHỤ theo thứ tự (ôn bài cũ → khởi động không phải tiêu chí → ôn nhanh)
  const drop = (pred: (s: SessionStep) => boolean) => {
    const k = steps.findIndex(pred);
    if (k >= 0) steps.splice(k, 1);
  };
  // (+ 2026-10-16) nhẹ tay → ưu tiên ÔN: bỏ đọc nhạc 1 phút trước
  if (gentle && steps.length > MAX_SESSION_STEPS) drop((s) => s.kind === 'sight-daily');
  // (+ 2026-10-17, rà soát giáo viên) ÔN NGẮT QUÃNG CHẮC CHẮN: "Ôn bài cũ" đã bị bỏ ở REVIEW_SONG_GUARANTEE buổi liền trước
  // (settings.reviewSkips) → lần này KHÔNG bỏ trước — bỏ các bước phụ khác trước, chỉ bỏ nó khi vẫn còn quá số màn.
  const guardReview = !!data && readReviewSkips(data.settings) >= REVIEW_SONG_GUARANTEE;
  if (steps.length > MAX_SESSION_STEPS && !guardReview) drop((s) => s.kind === 'review-song');
  if (steps.length > MAX_SESSION_STEPS && !criterionQuiz) drop((s) => s.kind === 'quiz' && s.warmup);
  if (steps.length > MAX_SESSION_STEPS) drop((s) => s.kind === 'review');
  if (steps.length > MAX_SESSION_STEPS) drop((s) => s.kind === 'sight-daily');
  if (steps.length > MAX_SESSION_STEPS) drop((s) => s.kind === 'review-song');
  if (opts.report) opts.report.reviewSong = !reviewSongId ? 'none' : steps.some((s) => s.kind === 'review-song') ? 'kept' : 'dropped';
  // v5.2 — bài khởi động bằng nhạc: không trùng bài "Ôn bài cũ" CÒN LẠI trong buổi
  if (opening) {
    const keptReview = !!reviewSongId && steps.some((s) => s.kind === 'review-song');
    // Ôn bài cũ bị bỏ vì quá số màn → dùng chính bài đến hạn ôn làm bài khởi động (giữ ôn ngắt quãng)
    opening.warmup = warmupMusic(lesson, data, keptReview ? [reviewSongId!] : [], keptReview ? null : reviewSongId);
  }
  return steps;
}

/** (+ 2026-10-17) "Ôn bài cũ" bị bỏ ở ngần này buổi LIỀN gần nhất → buổi sau giữ bước ôn (buildSessionPlan). */
export const REVIEW_SONG_GUARANTEE = 2;

/** Đọc MỀM settings.reviewSkips (số buổi liền "Ôn bài cũ" bị bỏ vì quá số màn). */
export function readReviewSkips(settings: Readonly<AppData['settings']> | undefined): number {
  const v = (settings as { reviewSkips?: unknown } | undefined)?.reviewSkips;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0;
}

/** Giá trị mới của settings.reviewSkips sau khi lập kế hoạch một buổi (kept → 0, dropped → +1, none → giữ). */
export function nextReviewSkips(prev: number, r: 'kept' | 'dropped' | 'none' | undefined): number {
  return r === 'kept' ? 0 : r === 'dropped' ? prev + 1 : prev;
}

/** Hoạt động mang điều MỚI (tính vào giới hạn "≤ 1 điều mới" của buổi nhẹ tay). Trò đố, thẻ "Biết thêm", khởi động tay: không. */
const NEW_KINDS: ReadonlySet<Activity['kind']> = new Set(['notes', 'rhythm', 'sight', 'dynamics', 'sing', 'improv']);

/**
 * (+ 2026-10-16, OWNER duyệt "Tự cân độ khó theo bé") Buổi NHẸ TAY: lấy các hoạt động còn lại THEO THỨ TỰ, dừng trước
 * hoạt động MỚI thứ hai. "Mới" = bài hát bé chưa từng chơi (lượt sau của cùng bài trong buổi không tính lại), hoặc hoạt
 * động dạy / đọc / sáng tạo (NEW_KINDS). Luôn giữ ít nhất một hoạt động. Không đổi chỉ số hoạt động (`index`).
 */
export function gentleTodo<T extends { activity: Activity; index: number }>(todo: readonly T[], data: Readonly<AppData>): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  let fresh = 0;
  for (const x of todo) {
    const a = x.activity;
    const isNew =
      a.kind === 'song' ? !a.songId.startsWith('sight') && !seen.has(a.songId) && !songEverPlayed(data, a.songId) : NEW_KINDS.has(a.kind);
    if (isNew && fresh >= 1 && out.length) break;
    if (isNew) fresh++;
    if (a.kind === 'song') seen.add(a.songId);
    out.push(x);
  }
  return out;
}

/**
 * (+ 2026-10-15, rà soát của giáo viên: thẻ "Con làm thầy" lặp y hệt 4 buổi một tuần) "Con làm thầy" của MỘT bài:
 * Lesson.teach (nếu dữ liệu có) → bài ĐẦU tuần: WeekPlan.teach → các bài khác: tạo từ nội dung chính của bài
 * (bài hát → nhịp → nốt mới → sắc thái → hát → sáng tạo → trò nghe → đọc nhạc). Không tạo được → WeekPlan.teach.
 */
export function lessonTeach(lesson: Lesson): { emoji: string; text: string } {
  if (lesson.teach) return lesson.teach;
  const plan = weekPlan(lesson.week);
  if (plan.lessons.findIndex((l) => l.id === lesson.id) <= 0) return plan.teach;
  return derivedTeach(lesson) ?? plan.teach;
}

// (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") chữ của bé NGẮN (≤ ~12 tiếng + tên bài) — giọng đọc đọc to cả thẻ
const QUIZ_TEACH: Partial<Record<QuizSpec['variant'], string>> = {
  updown: 'Con đàn 2 nốt, đố bố mẹ: lên hay xuống?',
  stepskip: 'Con đàn 2 nốt, đố bố mẹ: bước hay nhảy?',
  identify: 'Con đàn một nốt, đố bố mẹ tên nốt!',
  read: 'Con chỉ một nốt, đố bố mẹ đọc tên.',
  majorminor: 'Con đàn hợp âm, đố bố mẹ: vui hay buồn?',
};

function derivedTeach(lesson: Lesson): { emoji: string; text: string } | null {
  const acts = lesson.activities;
  const last = <K extends Activity['kind']>(k: K) => [...acts].reverse().find((a): a is Extract<Activity, { kind: K }> => a.kind === k);
  const song = [...acts].reverse().find((a): a is Extract<Activity, { kind: 'song' }> => a.kind === 'song' && !a.songId.startsWith('sight') && !!findTune(a.songId));
  if (song) {
    const t = findTune(song.songId)!;
    const title = t.titleVi || t.title;
    const tempo = acts.some((a) => a.kind === 'song' && a.songId === song.songId && a.mode === 'tempo');
    return tempo
      ? { emoji: '🥁', text: `Con đếm 1-2-3-4, đàn “${title}” — bố mẹ vỗ tay theo.` }
      : { emoji: '🎹', text: `Con đàn câu đầu “${title}” cho bố mẹ nghe.` };
  }
  if (last('rhythm')) return { emoji: '👏', text: 'Con vỗ một mẫu nhịp, bố mẹ vỗ lại.' };
  const notes = last('notes');
  if (notes) return { emoji: '🖐️', text: `Con dạy bố mẹ “${notes.segment.title}”.` };
  if (last('dynamics')) return { emoji: '🦁', text: 'Con đàn TO rồi NHỎ — bố mẹ đoán nhé!' };
  if (last('sing')) return { emoji: '🎤', text: 'Con hát tên 3 nốt rồi đàn lại.' };
  if (last('improv')) return { emoji: '🎨', text: 'Con đàn bài tự nghĩ — bố mẹ đặt tên!' };
  const quiz = last('quiz');
  const qt = quiz ? QUIZ_TEACH[quiz.quiz.variant] : undefined;
  if (qt) return { emoji: '👂', text: qt };
  if (last('sight')) return { emoji: '🎼', text: 'Con chỉ một nốt trên khuông, nói tên nốt.' };
  return null;
}

/** "Con làm thầy" cho buổi luyện tập mỗi ngày — xoay vòng. */
const DAILY_TEACH: ReadonlyArray<{ emoji: string; text: string }> = [
  { emoji: '🎹', text: 'Con đàn bài con thích nhất cho bố mẹ nghe.' },
  { emoji: '🦁', text: 'Con đàn TO rồi NHỎ — bố mẹ đoán nhé!' },
  { emoji: '🖐️', text: 'Con chỉ bố mẹ ngón 1 đến ngón 5.' },
  { emoji: '🎼', text: 'Con chỉ một nốt trên khuông, nói tên nốt.' },
  { emoji: '👏', text: 'Con vỗ một nhịp, bố mẹ vỗ lại theo con.' },
  { emoji: '🌟', text: 'Con kể: hôm nay chỗ nào khó nhất?' },
];
