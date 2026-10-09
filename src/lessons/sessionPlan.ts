/**
 * Kế hoạch MỘT buổi học (các bước, giới hạn số màn). Nội dung các bước phụ: sessionSelectors.ts, targetMemory.ts.
 */
import type { QuizSpec } from '../practice/quiz';
import type { AppData } from '../progress/schema';
import { sessionCount } from '../progress/history';
import type { Activity, Lesson, Segment, TechniqueDrill } from './types';
import type { Hand, PositionId } from '../piano/fingering';
import { MAX_QUIZ_ROUNDS, activityDoneId, weekPlan } from './curriculum';
import { reviewSegment } from './targetMemory';
import { sightDailyFits } from './sessionEstimate';
import {
  postureFull,
  reviewSongStep,
  sessionDrill,
  sightDailyStep,
  warmupIntro,
  warmupMusic,
  warmupTitle,
  type WarmupMusic,
} from './sessionSelectors';

export type SessionStep =
  /**
   * Bước MỞ ĐẦU (một chấm tiến trình): v5.2 — khởi động bằng nhạc (`warmup`, kèm câu nhắc tư thế một dòng) →
   * thẻ tư thế ĐẦY ĐỦ chỉ khi `full` (postureFull) → v5.1: MỘT bài khởi động kỹ thuật ~30 giây (`drill`, xoay vòng — sessionDrill).
   */
  | { kind: 'posture'; full: boolean; drill: TechniqueDrill; warmup: WarmupMusic }
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
      /** 60 = đã thuộc · 50 = chưa · 40 = bài có móc kép (tốc độ mặc định của bài là 40) */
      bpm: 40 | 50 | 60;
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
  | { kind: 'closing'; teach: { emoji: string; text: string } | null };

/** v5.1 — Buổi học tối đa ngần này màn (đếm cả tư thế, ôn nhanh, khởi động, hoạt động, ôn bài cũ, màn kết). */
export const MAX_SESSION_STEPS = 7;

/**
 * Kế hoạch một buổi (v5.1 — OWNER duyệt 2026-10-06: ≤ MAX_SESSION_STEPS màn, ≤ ~12 phút):
 * [v5.2: Khởi động bằng nhạc + câu nhắc tư thế (+ thẻ tư thế đầy đủ khi postureFull) + khởi động kỹ thuật 30"] → Ôn nhanh 1'
 * (từ tuần 2) → Khởi động tai/đọc nốt → (v5.2: Đọc nhạc 1 phút, từ tuần 8) → Bài mới → (Ôn bài cũ) → Màn kết
 * (Con làm thầy + Dễ/Vừa/Khó). Khởi động tai/đọc nốt bị BỎ khi bài có ≥ 3 lượt bài hát (trừ tuần chấm bằng khởi động).
 * Quá MAX_SESSION_STEPS màn → bỏ lần lượt: Ôn bài cũ → khởi động tai/đọc nốt (không phải tiêu chí) → Ôn nhanh
 * → Đọc nhạc 1 phút. Hoạt động của bài không bị bỏ. (v5.2: đọc nhạc mỗi ngày ưu tiên hơn Ôn nhanh — nó cũng là đọc nốt
 * trên khuông; bài đã có hoạt động đọc nhạc thì không thêm — "gộp".)
 * replay=true ("Chơi lại bài vừa học"): chỉ bài + màn kết (không thẻ "Con làm thầy").
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
  if (!opts.replay && !doneIds.has(lesson.id)) {
    const rest = todo.filter((x) => !doneIds.has(activityDoneId(lesson.id, x.index)));
    if (rest.length) todo = rest;
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
  const warmStep = (q: QuizSpec): SessionStep => {
    // v5.1 (OWNER duyệt 2026-10-06 sau buổi bé chơi thử): MỌI trò tai nghe / đọc nốt ≤ MAX_QUIZ_ROUNDS (6) lượt —
    // kể cả tuần chấm bằng khởi động (tiêu chí nay là ≥ 5/6 trong một buổi, ở 2 ngày)
    const quiz = { ...q, rounds: Math.min(q.rounds, MAX_QUIZ_ROUNDS) };
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
    };
    steps.push(opening);
    // Bài kiểm tra tuần: KHÔNG ôn nhanh (để kết quả ôn không lẫn vào tiêu chí, vd C4 10/10)
    const review = data && !lesson.isWeekTest ? reviewSegment(lesson, data, opts.rng, now) : null;
    if (review) steps.push({ kind: 'review', segment: review });
    if (warm && !warmAfter) steps.push(warmStep(warm));
    // v5.2 — Đọc nhạc 1 phút: TRƯỚC bài mới (không bị "hết giờ" cắt mất); không phải hoạt động của bài
    if (opts.sightRead && data && sightDailyFits(lesson)) steps.push(sightDailyStep(lesson, data));
  }
  // v5.1: trò quiz trong bài cũng ≤ MAX_QUIZ_ROUNDS lượt (dữ liệu giáo trình đã ≤ 6; chặn thêm cho bài tự tạo về sau)
  const capQuiz = (a: Activity): Activity =>
    a.kind === 'quiz' && a.quiz.rounds > MAX_QUIZ_ROUNDS ? { ...a, quiz: { ...a.quiz, rounds: MAX_QUIZ_ROUNDS } } : a;
  todo.forEach((x, k) => steps.push({ kind: 'activity', activity: capQuiz(x.activity), index: x.index, last: k === todo.length - 1 }));
  if (!opts.replay && !isStage && warm && warmAfter) steps.push(warmStep(warm));
  // Ôn bài cũ (một câu, theo nhịp): SAU bài mới — hết giờ thì session.ts nhảy thẳng tới phần kết, bài mới không bị lấn
  let reviewSongId: string | null = null;
  if (opts.songReview && data && !opts.replay && !isStage && !lesson.isWeekTest && todo.length < 4 && !lesson.id.endsWith('-daily')) {
    const rs = reviewSongStep(lesson, data, now, opts.rng);
    if (rs) steps.push(rs);
    reviewSongId = rs?.songId ?? null;
  }
  let teach: { emoji: string; text: string } | null = null;
  if (!opts.replay && !isStage) {
    const daily = lesson.id.endsWith('-daily');
    teach = daily ? DAILY_TEACH[(data ? sessionCount(data) : 0) % DAILY_TEACH.length] : plan.teach;
  }
  steps.push({ kind: 'closing', teach: teach ? { ...teach } : null });
  // v5.1 — giới hạn số màn: bỏ bước PHỤ theo thứ tự (ôn bài cũ → khởi động không phải tiêu chí → ôn nhanh)
  const drop = (pred: (s: SessionStep) => boolean) => {
    const k = steps.findIndex(pred);
    if (k >= 0) steps.splice(k, 1);
  };
  if (steps.length > MAX_SESSION_STEPS) drop((s) => s.kind === 'review-song');
  if (steps.length > MAX_SESSION_STEPS && !criterionQuiz) drop((s) => s.kind === 'quiz' && s.warmup);
  if (steps.length > MAX_SESSION_STEPS) drop((s) => s.kind === 'review');
  if (steps.length > MAX_SESSION_STEPS) drop((s) => s.kind === 'sight-daily');
  // v5.2 — bài khởi động bằng nhạc: không trùng bài "Ôn bài cũ" CÒN LẠI trong buổi
  if (opening) {
    const keptReview = !!reviewSongId && steps.some((s) => s.kind === 'review-song');
    // Ôn bài cũ bị bỏ vì quá số màn → dùng chính bài đến hạn ôn làm bài khởi động (giữ ôn ngắt quãng)
    opening.warmup = warmupMusic(lesson, data, keptReview ? [reviewSongId!] : [], keptReview ? null : reviewSongId);
  }
  return steps;
}

/** "Con làm thầy" cho buổi luyện tập mỗi ngày — xoay vòng. */
const DAILY_TEACH: ReadonlyArray<{ emoji: string; text: string }> = [
  { emoji: '🎹', text: 'Con đàn cho bố mẹ nghe bài con thích nhất hôm nay.' },
  { emoji: '🦁', text: 'Con đàn một câu thật TO rồi thật NHỎ — bố mẹ đoán xem câu nào to?' },
  { emoji: '🖐️', text: 'Con chỉ cho bố mẹ ngón 1 đến ngón 5 và đặt tay vào thế Đô.' },
  { emoji: '🎼', text: 'Con chỉ cho bố mẹ một nốt trên khuông và nói tên nốt đó.' },
  { emoji: '👏', text: 'Con vỗ một nhịp, bố mẹ vỗ lại theo con.' },
  { emoji: '🌟', text: 'Con kể cho bố mẹ: hôm nay chỗ nào khó nhất, con đã vượt qua thế nào?' },
];
