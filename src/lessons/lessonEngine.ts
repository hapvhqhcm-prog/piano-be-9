/**
 * BỘ MÁY BÀI HỌC — điểm vào chung (giữ nguyên đường import cũ `lessons/lessonEngine` cho cả app lẫn tests).
 * Mã nằm ở các module con:
 * - curriculum.ts — danh sách tuần / cấp, tra cứu tuần & bài, hằng số chung
 * - songStats.ts — tổng hợp lượt chơi theo bài, đã thuộc / đã từng chơi
 * - freshness.ts — bài còn "tươi", đã xong giáo trình
 * - weekCriteria.ts — tiêu chí qua tuần, tuần xong, tiến độ theo ngày
 * - nextLesson.ts — "Học tiếp", bài giúp đạt tiêu chí, luyện tập mỗi ngày
 * - sessionPlan.ts — kế hoạch một buổi (các bước)
 * - sessionSelectors.ts — khởi động bằng nhạc / tư thế / kỹ thuật, đọc nhạc 1 phút, "Ôn bài cũ"
 * - targetMemory.ts — trí nhớ từng nốt (Leitner), "Ôn nhanh"
 * - sessionEstimate.ts — ước lượng thời lượng buổi
 * - calendar.ts — đếm buổi / ngày theo lịch, chuỗi ngày
 */
export {
  WEEKS,
  LEVELS,
  levelOf,
  MAX_WEEK,
  PHASE1_WEEKS,
  MAX_SESSIONS_PER_DAY,
  weekPlan,
  findLesson,
  LEFT_HAND_WEEK,
  leftHandActive,
  sessionsOfWeek,
  MAX_QUIZ_ROUNDS,
  activityDoneId,
} from './curriculum';
export { passedWhole, foldSongRun, songStats, songMastered, songEverPlayed, masteredSongs, lastWholePlay } from './songStats';
export { FRESH_DAYS, FRESH_DAYS_AFTER_CURRICULUM, curriculumDone, freshDays, songFresh } from './freshness';
export {
  EAR_WINDOW,
  EAR_NEED,
  LEGACY_RUN_CUTOFF,
  runIsEvidence,
  CRITERION_DAYS,
  runDays,
  weekPassed,
  weekComplete,
  criterionProgress,
} from './weekCriteria';
export { nextLesson, criterionLesson, dailyLesson } from './nextLesson';
export { type SessionStep, MAX_SESSION_STEPS, buildSessionPlan } from './sessionPlan';
export {
  type WarmupMusic,
  POSTURE_CUE,
  sessionDrill,
  type PostureSettings,
  postureFull,
  WARMUP_BEATS,
  lessonHandPosition,
  warmupMusic,
  sightDailyHints,
  sightDailyStep,
  reviewSongStep,
  warmupTitle,
} from './sessionSelectors';
export { lessonNoteTargets, type TargetMemory, targetMemory, forEachTargetOutcome, reviewWeight, reviewSegment } from './targetMemory';
export { SIGHT_DAILY_WEEK, SIGHT_DAILY_MIN, MAX_SESSION_MINUTES, sightDailyFits, estimateLessonMinutes } from './sessionEstimate';
export { sessionsToday, minutesToday, sessionsThisWeek, daysThisWeek, streakDays } from './calendar';
