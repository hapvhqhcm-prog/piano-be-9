import { findTune } from '../music/exercises';
import { beatsPerMeasure, measureCount, phraseRanges } from '../music/tune';
import { makeQuestion, type QuizSpec } from '../practice/quiz';
import type { AppAssessment, AppData, Session } from '../progress/schema';
import type { Activity, LevelInfo, Lesson, Segment, Target, TechniqueDrill, WeekPlan } from './types';
import { LEVEL2_WEEKS } from './level2';
import { LEVEL3_WEEKS } from './level3';
import { SONGS } from '../music/tune';
import { WEEK1 } from './week1';
import { WEEK2 } from './week2';
import { WEEK3 } from './week3';
import { WEEK4 } from './week4';
import { WEEK5 } from './week5';
import { WEEK6 } from './week6';
import { WEEK7 } from './week7';
import { WEEK8 } from './week8';
import { WEEK9 } from './week9';
import { WEEK10 } from './week10';

/**
 * Giáo trình v5 (OWNER duyệt 2026-10-05, theo rà soát của chuyên gia sư phạm) — 3 cấp:
 * Cấp 1 (1–10), Cấp 2 (11–21), Cấp 3 (22–31). Thêm tuần CỦNG CỐ (5, 13, 23) và tuần dạy nhịp/đọc nhạc trước bài cần
 * (9 nhịp 2/4, 18 móc kép & Tập-tễnh, 19 nghịch phách & dây nối); trò sáng tạo; tiêu chí cần 2 NGÀY.
 * v5.1 (OWNER duyệt 2026-10-06, rà soát chuyên gia lần 2) — 31 tuần (Cấp 2 có 11 tuần — tuần 18 cũ quá tải nên tách đôi):
 * buổi ngắn (≤ MAX_SESSION_STEPS màn, ≤ ~12 phút); khởi động kỹ thuật ~30 giây MỖI buổi (sau tư thế); "Con làm thầy" gộp
 * với tự chấm thành MỘT màn kết; tách tay sẵn ở bài hai tay đầu tuần; tiêu chí APP cũng cần 2 ngày.
 * Dữ liệu cũ (rev 1/2/3) đánh số lại ở progress/migrations.ts (bảng OLD→NEW).
 * Mục tiêu cuối nói thật: ≈ hoàn thành Faber cấp 1 / đầu cấp 2 (không phải "thành thạo" theo nghĩa nhạc viện).
 */
export const WEEKS: readonly WeekPlan[] = [
  WEEK1, WEEK2, WEEK3, WEEK4, WEEK5, WEEK6, WEEK7, WEEK8, WEEK9, WEEK10,
  ...LEVEL2_WEEKS,
  ...LEVEL3_WEEKS,
];

export const LEVELS: readonly LevelInfo[] = [
  {
    level: 1,
    name: 'Cấp 1 · Làm quen',
    goal: 'Thế Đô hai tay, nhịp Đi – Chạy-chạy – 2/4, đọc nốt khóa Sol theo nốt mốc & quãng, ứng tấu phím đen',
    weeks: [1, 10],
  },
  {
    level: 2,
    name: 'Cấp 2 · Hai tay',
    goal: 'Đô giữa & khóa Fa, hai tay cùng lúc, thế Sol, phím đen, nhịp 3/4, chấm dôi, móc kép, nghịch phách, gam, sáng tác 4 ô nhịp',
    weeks: [11, 21],
  },
  {
    level: 3,
    name: 'Cấp 3 · Vững vàng',
    goal: 'Hợp âm, dòng kẻ phụ & khuông lớn, đổi thế, trưởng/thứ, đọc hai khóa, Minuet & Für Elise giản lược — ≈ hoàn thành Faber cấp 1 / đầu cấp 2',
    weeks: [22, 31],
  },
];

export function levelOf(week: number): LevelInfo {
  return LEVELS.find((l) => week >= l.weeks[0] && week <= l.weeks[1]) ?? LEVELS[LEVELS.length - 1];
}
export const MAX_WEEK = WEEKS.length;
/** @deprecated giữ tên cũ cho mã Phase 1 */
export const PHASE1_WEEKS = WEEKS;

/** Tối đa 2 buổi/ngày (§11) — chỉ nhắc nhẹ, không khóa (§9). */
export const MAX_SESSIONS_PER_DAY = 2;

export function weekPlan(week: number): WeekPlan {
  return WEEKS[Math.min(Math.max(week, 1), MAX_WEEK) - 1];
}

export function findLesson(id: string): Lesson | undefined {
  for (const w of WEEKS) {
    const l = w.lessons.find((x) => x.id === id);
    if (l) return l;
  }
  return undefined;
}

/** Tuần bắt đầu dùng tay trái (Hồ Tấm Gương) — v5: tuần 7 (trước đây tuần 6, §6). */
export const LEFT_HAND_WEEK = 7;

/** Tay trái được kích hoạt từ tuần LEFT_HAND_WEEK. */
export function leftHandActive(data: Readonly<AppData>): boolean {
  return data.progress.currentWeek >= LEFT_HAND_WEEK || data.settings.leftHandEnabled;
}

export function sessionsOfWeek(data: Readonly<AppData>, week: number): Session[] {
  return data.sessions.filter((s) => s.lessonId.startsWith(`w${week}-`));
}

const isPitch = (s: string) => /^[A-G](#|b)?\d$/.test(s);
/** Tuần 26 (v5.1): năm nốt cao thế Đô cao */
const HIGH_NOTES = ['C5', 'D5', 'E5', 'F5', 'G5'];
/** Tuần 23 (v5.1): nốt có dòng kẻ phụ (khởi động-chấm điểm của tuần) */
const LEDGER_NOTES = ['A3', 'B3', 'C4', 'G5', 'A5'];

type Run = Session['songRuns'][number];
/** Lượt chơi đủ tay (không phải tập tách tay một bè của bài hai tay). */
const together = (r: Run) => !r.hand;
/** Lượt chơi đạt cả bài (không phải tập một câu, không phải tập tách tay). */
export const passedWhole = (r: Run, songId: string, tempo = false, minBpm = 0): boolean =>
  r.songId === songId && !r.phrase && together(r) && r.passed && (!tempo || r.mode === 'tempo') && r.bpm >= minBpm;

/** Bé đã THUỘC bài: chơi trọn theo nhịp ≥ tốc độ 60 và đạt (micro ≥ 80% hoặc bố mẹ xác nhận). "Đã từng thuộc" — giữ cho sticker. */
export function songMastered(data: Readonly<AppData>, songId: string): boolean {
  return data.sessions.some((s) => s.songRuns.some((r) => passedWhole(r, songId, true, 60)));
}

export function masteredSongs(data: Readonly<AppData>): string[] {
  return SONGS.filter((t) => songMastered(data, t.id)).map((t) => t.id);
}

const DAY_MS = 86_400_000;
/** Bài đã thuộc mà không chơi lại quá ngần này ngày → "ôn bài cũ" (ngắt quãng). */
export const FRESH_DAYS = 21;

/** Lần gần nhất chơi CẢ bài (mọi chế độ, cả tách tay; không tính tập một câu) — ms, 0 = chưa chơi. */
export function lastWholePlay(data: Readonly<AppData>, songId: string): number {
  let t = 0;
  for (const s of data.sessions) for (const r of s.songRuns) if (r.songId === songId && !r.phrase && r.ts > t) t = r.ts;
  return t;
}

/**
 * Bài còn "TƯƠI": đã thuộc VÀ có chơi cả bài trong FRESH_DAYS ngày qua.
 * Đã thuộc nhưng không tươi → mờ sao ở thư viện, được ưu tiên ôn (Luyện tập mỗi ngày, Ôn bài cũ trong buổi).
 */
export function songFresh(songId: string, data: Readonly<AppData>, now: number | Date = Date.now()): boolean {
  const t = typeof now === 'number' ? now : now.getTime();
  return songMastered(data, songId) && lastWholePlay(data, songId) >= t - FRESH_DAYS * DAY_MS;
}

/** Buổi có 10 câu liên tiếp (đoán / đọc) đúng ≥ 8. */
function ear8of10InSession(s: Session, accept: (a: AppAssessment) => boolean): boolean {
  const a = s.appAssessments.filter(accept);
  for (let i = 0; i + 10 <= a.length; i++) {
    if (a.slice(i, i + 10).filter((x) => x.correct).length >= 8) return true;
  }
  return false;
}

/**
 * v5.1 (OWNER duyệt 2026-10-06): tiêu chí APP (tai nghe / đọc nốt 8/10) cũng theo quy tắc 2 NGÀY như bài hát —
 * trả về SỐ NGÀY khác nhau (session.date) có một buổi đạt 8/10.
 */
function earDays(sessions: readonly Session[], accept: (a: AppAssessment) => boolean): number {
  return new Set(sessions.filter((s) => ear8of10InSession(s, accept)).map((s) => s.date)).size;
}

/**
 * v5 — Lượt chơi được tính làm BẰNG CHỨNG cho tiêu chí tuần (OWNER duyệt 2026-10-05, chuyên gia sư phạm:
 * "tiêu chí cũ qua được mà chưa thật sự có kỹ năng"):
 * - micro (source 'mic'): lượt ĐẠT (≥ 80% nốt đúng lúc);
 * - bố mẹ (source 'parent'): lượt ĐẠT và có PHIẾU 3 Ý (đúng nốt · đều nhịp · đúng ngón) — cả 3 đều đạt.
 * Dữ liệu CŨ: lượt "bố mẹ" ghi TRƯỚC LEGACY_RUN_CUTOFF (ngày phát hành v5) không có phiếu → vẫn tính như cũ,
 * để tuần bé đang học dở không bị tụt bằng chứng. (Tuần ĐÃ qua không bị đánh giá lại: bản đồ/sticker coi mọi tuần
 * < currentWeek là đã qua — weekPassed chỉ thật sự quyết định ở tuần hiện tại.) Lượt mới không phiếu → không tính.
 */
export const LEGACY_RUN_CUTOFF = new Date(2026, 9, 6).getTime();

export function runIsEvidence(r: Run): boolean {
  if (!r.passed) return false;
  if (r.source === 'mic') return true;
  if (r.checklist) return r.checklist.notes && r.checklist.beat && r.checklist.fingers;
  return r.ts < LEGACY_RUN_CUTOFF;
}

/** Tiêu chí bài hát cần đạt ở ít nhất ngần này NGÀY khác nhau (v5 — một lần "ăn may" không đủ). */
export const CRITERION_DAYS = 2;

/** Số NGÀY khác nhau (theo session.date) có lượt hợp lệ (runIsEvidence) thỏa `ok`. */
export function runDays(sessions: readonly Session[], ok: (r: Run) => boolean): number {
  return new Set(sessions.filter((s) => s.songRuns.some((r) => ok(r) && runIsEvidence(r))).map((s) => s.date)).size;
}

/** Có lượt hợp lệ (runIsEvidence) thỏa `ok` ở ít nhất `days` ngày KHÁC NHAU (theo session.date). */
export function passedOnDays(sessions: readonly Session[], ok: (r: Run) => boolean, days = CRITERION_DAYS): boolean {
  return runDays(sessions, ok) >= days;
}

/** Tuần có tiêu chí "huy chương" (buổi biểu diễn cuối mỗi cấp). */
const MEDAL_WEEKS = new Set(LEVELS.map((l) => l.weeks[1]));

/** Lượt đọc nhạc ngẫu nhiên (sight) ở một trong các thế tay `positions` (mã lượt "sight:<thế>:<tay>"). */
const sightIn = (r: Run, positions: readonly string[]) => r.songId.startsWith('sight') && positions.includes(r.songId.split(':')[1] ?? '');

/**
 * Phần tiêu chí TÍNH THEO NGÀY của tuần `week` (v5.1): `days` = số ngày khác nhau đã đạt; `extra` = điều kiện phụ
 * không theo ngày (mặc định true) — vd tuần dòng kẻ phụ / nốt cao cần thêm MỘT lượt đọc nhạc đạt trong dải đó.
 * null = tiêu chí không theo ngày (tuần 1: một buổi; tuần huy chương; tuần không có tiêu chí).
 * Tuần đạt ⇔ days ≥ CRITERION_DAYS && extra.
 */
function criterionDays(week: number, sessions: readonly Session[]): { days: number; extra: boolean } | null {
  /** Bài `songId` trọn bài (không tách tay, không một câu) đạt — số ngày (tempo: theo nhịp; minBpm: tốc độ tối thiểu). */
  const song = (songId: string, tempo = false, minBpm = 0) => ({ days: runDays(sessions, (r) => passedWhole(r, songId, tempo, minBpm)), extra: true });
  const ear = (accept: (a: AppAssessment) => boolean, extra = true) => ({ days: earDays(sessions, accept), extra });
  const sightOk = (positions: readonly string[]) => sessions.some((s) => s.songRuns.some((r) => sightIn(r, positions) && runIsEvidence(r)));
  switch (week) {
    case 2:
      // v5: thay "bé tự chọn Đàn được hết" (SELF) bằng bằng chứng: "Bánh nóng" trọn bài (chế độ chờ được tính)
      return song('hot_cross_buns');
    case 3:
      // APP: đoán nốt (có mốc Đô) đúng ≥ 8/10 — v5.1: ở 2 ngày
      return ear((a) => isPitch(a.expected));
    case 4:
      // Giữ nhịp đều ≥ 8 ô nhịp ở Mức 2 (ô 2/4 ngắn bằng nửa ô 4/4 → cần 16 ô)
      return {
        days: runDays(sessions, (r) => {
          const t = findTune(r.songId);
          return r.mode === 'tempo' && r.level === 2 && !r.phrase && together(r) && !!t && measureCount(t) >= (beatsPerMeasure(t) < 3 ? 16 : 8);
        }),
        extra: true,
      };
    case 5:
      return song('frog_hop', true);
    case 6:
      return song('ode_to_joy_easy', true, 60);
    case 7:
      // Như tuần 3, dải tay trái
      return ear((a) => isPitch(a.expected) && a.expected.endsWith('3'));
    case 8:
      return { days: runDays(sessions, (r) => passedWhole(r, 'ode_to_joy_easy', true) && r.hints === 'staff'), extra: true };
    case 9:
      return song('inh_la_oi', true);
    case 11:
      return song('question_answer');
    case 12:
      return song('ode_to_joy_both', true);
    case 13:
      return song('bell_tower', true);
    case 14:
      return song('ode_to_joy_g', true, 60);
    case 15:
      return song('waltz_cat', true);
    case 16:
      return song('ode_to_joy_d', true, 60);
    case 17:
      return song('ode_to_joy_original', true, 60);
    case 18:
      // Bài có móc kép khởi đầu ở tốc độ 40 — tiêu chí là ĐÚNG NHỊP, không đòi nhanh
      return song('ly_cay_da', true);
    case 19:
      // v5.1 — tuần mới "Phố Xích Lô": bài tổng hợp mọi nhịp nhanh của tuần 18–19
      return song('bac_kim_thang', true);
    case 20: {
      // Gam hai tay (lần lượt): mỗi tay đạt ở 2 ngày → tiến độ = tay CHẬM hơn
      const rh = song('scale_c_rh', true);
      const lh = song('scale_c_lh', true);
      return { days: Math.min(rh.days, lh.days), extra: true };
    }
    case 22:
      return song('ode_to_joy_chords', true);
    case 23:
      // APP: đọc nốt có dòng kẻ phụ 8/10 (2 ngày) + v5.1: một lượt ĐỌC NHẠC qua vạch phụ đạt (thế La thứ / Đô giữa tay trái)
      return ear((a) => LEDGER_NOTES.includes(a.expected), sightOk(['Am', 'MC']));
    case 24:
      // v5.1: phải THEO NHỊP ≥ 50 (chế độ chờ không đủ cho bài biểu diễn)
      return song('silent_night', true, 50);
    case 25:
      return ear((a) => a.expected === 'major' || a.expected === 'minor');
    case 26:
      // APP: đọc nốt cao (Đô5–Sol5) 8/10 (2 ngày) + v5.1: một lượt đọc nhạc thế Đô cao đạt
      return ear((a) => HIGH_NOTES.includes(a.expected), sightOk(['C5']));
    case 27: {
      // Đọc nhạc ngẫu nhiên: ≥ 5 đoạn đạt (bằng chứng hợp lệ), trải trên ≥ 2 ngày
      const sight = (r: Run) => r.songId.startsWith('sight');
      const n = sessions.flatMap((s) => s.songRuns).filter((r) => sight(r) && runIsEvidence(r)).length;
      return { days: runDays(sessions, sight), extra: n >= 5 };
    }
    case 28:
      return song('saints_both', true);
    case 29:
      return song('minuet_g', true, 50);
    case 30:
      return song('fur_elise', true, 50);
    default:
      return null;
  }
}

/**
 * Tiêu chí qua tuần (§11; v5 — OWNER duyệt 2026-10-05; v5.1 — 2026-10-06). Hàm thuần — có test.
 * Tiêu chí BÀI HÁT: lượt chơi trọn bài (không tập một câu, không tách tay) đạt ở 2 NGÀY khác nhau (runDays).
 * v5.1: tiêu chí APP (tai nghe / đọc nốt 8/10) cũng cần 2 ngày; Đêm thánh / Minuet / Für Elise cần lượt THEO NHỊP ≥ 50;
 * tuần dòng kẻ phụ / nốt cao cần thêm một lượt đọc nhạc đạt trong dải đó. Tuần 1 và huy chương giữ như cũ.
 */
export function weekPassed(week: number, data: Readonly<AppData>): boolean {
  const sessions = sessionsOfWeek(data, week);
  if (MEDAL_WEEKS.has(week)) {
    return sessions.some((s) => s.parentAssessments.some((a) => a.note === 'medal' && a.result === 'correct'));
  }
  if (week === 1) {
    // Tìm C4 ≥ 10 lần đúng, trượt TỐI ĐA 1 lần (v5 — chuyên gia UX: 10/10 tuyệt đối làm bé căng thẳng)
    // — bố mẹ xác nhận (PARENT) hoặc micro (MIC, đúng ngay lần đầu, không bị sửa)
    return sessions.some((s) => {
      if (s.lessonId !== 'w1-test') return false;
      const c4 = s.parentAssessments.filter((a) => a.note === 'C4');
      const mic = s.micAssessments.filter((a) => a.expected === 'C4');
      const micOk = (a: (typeof mic)[number]) => (a.parentOverride ? a.parentOverride === 'correct' : a.firstTry);
      const correct = c4.filter((a) => a.result === 'correct').length + mic.filter(micOk).length;
      const misses = c4.filter((a) => a.result === 'retry').length + mic.filter((a) => !micOk(a)).length;
      return correct >= 10 && misses <= 1;
    });
  }
  const c = criterionDays(week, sessions);
  return !!c && c.days >= CRITERION_DAYS && c.extra;
}

/**
 * Tuần XONG (được sang tuần mới) = đạt tiêu chí VÀ đã học hết các bài thường của tuần.
 * Rà soát 2026-10-05: trước đây chỉ cần đạt tiêu chí → giả lập "bé giỏi" đi hết 25 tuần trong ~47 buổi,
 * BỎ QUA 34 bài (có cả bài dạy nốt La, giọng thứ…) — các bài này không bao giờ được mời học nữa.
 */
export function weekComplete(week: number, data: Readonly<AppData>): boolean {
  if (!weekPassed(week, data)) return false;
  const done = new Set(data.progress.lessonsCompleted);
  return weekPlan(week)
    .lessons.filter((l) => !l.isWeekTest)
    .every((l) => done.has(l.id));
}

/** Mã đánh dấu đã xong hoạt động thứ i của một bài (lưu chung trong lessonsCompleted) — để học tiếp phần còn lại. */
export const activityDoneId = (lessonId: string, i: number): string => `${lessonId}#${i}`;

/** Bài "Học tiếp": bài đầu tiên chưa xong → bài kiểm tra tuần (nếu chưa qua) → bài cuối để ôn. */
export function nextLesson(data: Readonly<AppData>, rng: () => number = Math.random, now: number | Date = Date.now()): Lesson {
  const plan = weekPlan(data.progress.currentWeek);
  // Đã xong cả giáo trình (MAX_WEEK tuần) → luyện tập mỗi ngày, không có điểm dừng
  if (plan.week === MAX_WEEK && weekComplete(MAX_WEEK, data)) return dailyLesson(data, rng, now);
  const done = new Set(data.progress.lessonsCompleted);
  const regular = plan.lessons.filter((l) => !l.isWeekTest);
  const firstUndone = regular.find((l) => !done.has(l.id));
  if (firstUndone) return firstUndone;
  const test = plan.lessons.find((l) => l.isWeekTest);
  if (test && !weekPassed(plan.week, data)) return test;
  // Học hết bài nhưng CHƯA đạt tiêu chí (v5: phải đạt ở 2 ngày khác nhau) → mời lại đúng bài giúp đạt tiêu chí.
  // QA 2026-10-05: trước đây luôn mời bài CUỐI tuần → 15/30 tuần kẹt mãi nếu chỉ bấm "Học tiếp".
  if (!weekPassed(plan.week, data)) {
    const helper = criterionLesson(plan.week, data);
    if (helper) return helper;
  }
  return regular[regular.length - 1];
}

/* ---------- Bài nào giúp đạt tiêu chí tuần? (giả lập buổi học "hoàn hảo") ---------- */

/**
 * Một buổi giả lập: bé làm ĐÚNG hết mọi bước của buổi vào ngày `date`. v5.1: theo ĐÚNG kế hoạch buổi (buildSessionPlan) —
 * khởi động có thể bị bỏ (bài ≥ 3 bài hát, giới hạn số màn) → giả lập không được "cộng" khởi động mà buổi thật không có.
 */
function idealSession(lesson: Lesson, data: Readonly<AppData>, date: string, seq: number): Session {
  const parent: Session['parentAssessments'] = [];
  const app: AppAssessment[] = [];
  const runs: Session['songRuns'] = [];
  let x = seq * 7919 + 17;
  const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const answerQuiz = (q: QuizSpec) => {
    let prev;
    for (let k = 0; k < Math.max(10, q.rounds); k++) {
      prev = makeQuestion(q, rng, prev);
      app.push({ expected: prev.expected, actual: prev.expected, correct: true, ts: 0 });
    }
  };
  const steps = buildSessionPlan(lesson, data);
  for (const st of steps) if (st.kind === 'quiz') answerQuiz(st.quiz);
  for (const a of lesson.activities) {
    switch (a.kind) {
      case 'notes':
        for (const t of a.segment.targets) parent.push({ note: t.noteId, result: 'correct', ts: 0 });
        break;
      case 'quiz':
        answerQuiz(a.quiz);
        break;
      case 'song':
        runs.push({ songId: a.songId, mode: a.mode, level: a.mode === 'tempo' ? (a.level ?? 2) : undefined, bpm: 72, hints: a.hints, phrase: null, total: 10, hits: 10, source: 'mic', passed: true, ts: 0, ...(a.hand ? { hand: a.hand } : {}) });
        break;
      case 'sight':
        for (let k = 0; k < a.count; k++)
          runs.push({ songId: `sight:${a.position}:${a.hand}`, mode: 'wait', bpm: 60, hints: a.hints, phrase: null, total: 10, hits: 10, source: 'mic', passed: true, ts: 0 });
        break;
      case 'stage':
        parent.push({ note: 'medal', result: 'correct', ts: 0 });
        break;
      default:
        break;
    }
  }
  return {
    id: `ideal-${seq}`, date, lessonId: lesson.id, parentAssessments: parent, appAssessments: app, micAssessments: [],
    songRuns: runs, selfRating: null, startedAt: 0, endedAt: 0, minutes: 10, completed: true, checklist: {},
  };
}

/**
 * Bài thường của tuần mà nếu bé làm tốt ở 2 ngày nữa thì tuần ĐẠT tiêu chí; ưu tiên bài lâu chưa học.
 * Tiêu chí cần hai bài (vd tuần gam: tay phải + tay trái) → thử theo cặp, trả bài lâu chưa học hơn trong cặp.
 */
export function criterionLesson(week: number, data: Readonly<AppData>): Lesson | null {
  const regular = weekPlan(week).lessons.filter((l) => !l.isWeekTest);
  const lastPlayed = (id: string) => Math.max(0, ...data.sessions.filter((s) => s.lessonId === id).map((s) => s.startedAt));
  const order = [...regular].sort((a, b) => lastPlayed(a.id) - lastPlayed(b.id));
  const passesWith = (ls: Lesson[]) => {
    const extra: Session[] = [];
    ['9998-01-01', '9998-01-02'].forEach((d, di) => ls.forEach((l, li) => extra.push(idealSession(l, data, d, di * 10 + li))));
    return weekPassed(week, { ...data, sessions: [...data.sessions, ...extra] } as AppData);
  };
  for (const l of order) if (passesWith([l])) return l;
  for (const a of order) for (const b of order) if (a !== b && passesWith([a, b])) return a;
  return null;
}

export type SessionStep =
  /** Tư thế + v5.1: MỘT bài khởi động kỹ thuật ~30 giây (`drill`, xoay vòng theo buổi — sessionDrill) trên cùng một màn/chấm tiến trình */
  | { kind: 'posture'; short: boolean; drill: TechniqueDrill }
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
  | { kind: 'closing'; teach: { emoji: string; text: string } | null };

/** v5.1 — Buổi học tối đa ngần này màn (đếm cả tư thế, ôn nhanh, khởi động, hoạt động, ôn bài cũ, màn kết). */
export const MAX_SESSION_STEPS = 7;

/** Xoay vòng mặc định cho tuần không ghi `drills` — tuần ≤ 3 chỉ bài thả lỏng/dáng tay; luồn ngón cái từ tuần 16. */
const DEFAULT_DRILLS = (week: number): TechniqueDrill[] =>
  week <= 3
    ? ['hand-shape', 'arm-drop', 'wrist-circle']
    : week < 16
      ? ['hand-shape', 'finger-tap', 'wrist-circle', 'five-finger', 'arm-drop']
      : ['hand-shape', 'finger-tap', 'thumb-under', 'wrist-circle', 'five-finger'];

/** v5.1 — Bài khởi động ~30 giây của buổi thứ `n` (đếm mọi buổi đã có): xoay vòng trong WeekPlan.drills (hoặc mặc định). */
export function sessionDrill(week: number, n: number): TechniqueDrill {
  const plan = weekPlan(week);
  const list = plan.drills?.length ? plan.drills : DEFAULT_DRILLS(plan.week);
  return list[((n % list.length) + list.length) % list.length];
}

/** Mọi nốt rời (1 phím, không phải nhại lại/khuông) trong các hoạt động Từng nốt của bài. */
export function lessonNoteTargets(lesson: Lesson): Target[] {
  return lesson.activities.flatMap((a) =>
    a.kind === 'notes' ? a.segment.targets.filter((t) => t.keys.length === 1 && !t.sequence && !t.staff) : [],
  );
}

/**
 * Nốt rời dùng cho "Ôn nhanh" — GỒM cả nốt có khuông (thế Sol, khóa Fa, Fa♯…).
 * Lỗi cũ (chuyên gia sư phạm phát hiện 2026-10-05): lọc bỏ nốt có khuông → từ tuần 9 trở đi chỉ ôn mãi việc tìm phím tuần 1–6.
 */
function reviewableTargets(lesson: Lesson): Target[] {
  return lesson.activities.flatMap((a) =>
    a.kind === 'notes' ? a.segment.targets.filter((t) => t.keys.length === 1 && !t.sequence) : [],
  );
}

/** Khoảng ôn kiểu hộp Leitner (ngày) theo số lần ĐÚNG liên tiếp gần nhất: 0 → ôn ngay, 1 → sau 1 ngày, 2 → 3 ngày… */
const LEITNER_DAYS = [0, 1, 3, 7, 14];

export interface TargetMemory {
  /** Số lần sai trong 5 lần gần nhất */
  recentErrors: number;
  /** Số lần đúng liên tiếp tính từ lần gần nhất (hộp Leitner, tối đa 4) */
  box: number;
  /** Lần gần nhất gặp nốt này (ms) */
  lastSeen: number;
}

/**
 * Trí nhớ của bé về từng nốt rời — từ PARENT_ASSESSMENT (note = noteId; retry = sai) và MIC_ASSESSMENT
 * (expected = các phím nối "+"; sai = không đúng ngay lần đầu, trừ khi bố mẹ "Sửa" thành đúng).
 */
export function targetMemory(data: Readonly<AppData>): Map<string, TargetMemory> {
  const hist = new Map<string, Array<{ ok: boolean; ts: number }>>();
  const add = (k: string, ok: boolean, ts: number) => hist.set(k, [...(hist.get(k) ?? []), { ok, ts }]);
  for (const s of data.sessions) {
    for (const a of s.parentAssessments) add(a.note, a.result === 'correct', a.ts);
    for (const a of s.micAssessments) add(a.expected, a.parentOverride ? a.parentOverride === 'correct' : a.firstTry, a.ts);
  }
  const out = new Map<string, TargetMemory>();
  for (const [k, h] of hist) {
    h.sort((a, b) => a.ts - b.ts);
    let box = 0;
    for (let i = h.length - 1; i >= 0 && h[i].ok && box < 4; i--) box++;
    out.set(k, { recentErrors: h.slice(-5).filter((x) => !x.ok).length, box, lastSeen: h[h.length - 1].ts });
  }
  return out;
}

/**
 * Trọng số ôn của một nốt (kiểu Leitner): nốt hay sai gần đây và nốt đã "tới hạn" ôn được chọn nhiều hơn;
 * nốt vừa đúng nhiều lần liền, mới gặp hôm qua thì ít hơn (vẫn có thể ra — không bao giờ bằng 0).
 */
export function reviewWeight(t: Target, mem: Map<string, TargetMemory>, now: number): number {
  const m = mem.get(t.noteId) ?? mem.get(t.keys.join('+'));
  if (!m) return 1.5; // chưa gặp lần nào ở dạng nốt rời (vd học trong bài hát) → hơi ưu tiên
  const days = (now - m.lastSeen) / DAY_MS;
  const due = days >= LEITNER_DAYS[m.box];
  return (due ? 2 : 0.5) + 2 * Math.min(m.recentErrors, 3);
}

/**
 * "Ôn nhanh" (v2): 4 nốt xen kẽ lấy từ tuần trước và các bài đã học — gợi nhớ ngắt quãng.
 * v5 (sư phạm): chọn có TRỌNG SỐ — nốt hay sai / lâu chưa gặp ra nhiều hơn (reviewWeight). Chưa có dữ liệu → xáo đều như cũ.
 */
export function reviewSegment(
  lesson: Lesson,
  data: Readonly<AppData>,
  rng: () => number = Math.random,
  now: number = Date.now(),
): Segment | null {
  const mem = targetMemory(data);
  const done = new Set(data.progress.lessonsCompleted);
  const pools: Target[][] = [];
  for (const w of WEEKS) {
    if (w.week > lesson.week) break;
    const ts = w.lessons
      .filter((l) => l.id !== lesson.id && (w.week < lesson.week || done.has(l.id)))
      .flatMap(reviewableTargets);
    if (ts.length) pools.push(ts);
  }
  if (!pools.length) return null;
  const recent = pools[pools.length - 1];
  const older = pools.slice(0, -1).flat();
  const picked: Target[] = [];
  const seen = new Set<string>();
  const take = (from: Target[], n: number) => {
    const weights = from.map((t) => reviewWeight(t, mem, now));
    let arr: Target[];
    if (weights.every((w) => w === weights[0])) {
      // Mọi nốt ngang nhau → xáo trộn đều (Fisher–Yates) như trước
      arr = [...from];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1)) % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    } else {
      // Rút KHÔNG hoàn lại theo trọng số (mỗi noteId một lần) — xác định theo rng để test được
      const pool = new Map<string, { t: Target; w: number }>();
      from.forEach((t, i) => pool.has(t.noteId) || pool.set(t.noteId, { t, w: weights[i] }));
      const items = [...pool.values()];
      arr = [];
      while (items.length) {
        const total = items.reduce((s, x) => s + x.w, 0);
        let r = rng() * total;
        let k = 0;
        while (k < items.length - 1 && r >= items[k].w) r -= items[k++].w;
        arr.push(items.splice(k, 1)[0].t);
      }
    }
    for (const t of arr) {
      if (n <= 0) break;
      if (seen.has(t.noteId)) continue;
      seen.add(t.noteId);
      picked.push({ ...t, subtitle: t.hand === 'LH' ? 'Ôn bài cũ — tay trái' : 'Ôn bài cũ' });
      n--;
    }
  };
  take(recent, older.length ? 2 : 4);
  take(older, 4 - picked.length);
  take(recent, 4 - picked.length);
  if (picked.length < 2) return null;
  return {
    id: `review-${lesson.id}`,
    step: 'Ôn nhanh',
    title: 'Ôn nhanh ⚡',
    intro: 'Mình ôn lại vài nốt cũ thật nhanh nhé!',
    targets: picked,
  };
}

/**
 * Kế hoạch một buổi (v5.1 — OWNER duyệt 2026-10-06: ≤ MAX_SESSION_STEPS màn, ≤ ~12 phút):
 * Tư thế + khởi động kỹ thuật 30" → Ôn nhanh 1' (từ tuần 2) → Khởi động tai/đọc nốt → Bài mới → (Ôn bài cũ) → Màn kết
 * (Con làm thầy + Dễ/Vừa/Khó). Khởi động tai/đọc nốt bị BỎ khi bài có ≥ 3 lượt bài hát (trừ tuần chấm bằng khởi động).
 * Quá MAX_SESSION_STEPS màn → bỏ lần lượt: Ôn bài cũ → khởi động (không phải tiêu chí) → Ôn nhanh. Hoạt động của bài không bị bỏ.
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
  if (warm && firstOfWeek && !criterionQuiz && lesson.week > 1) warm = weekPlan(lesson.week - 1).warmup ?? null;
  // Bài đã có quiz cùng kiểu → bỏ khởi động (khỏi hỏi một thứ hai lần liền)
  if (warm && todo.some((x) => x.activity.kind === 'quiz' && x.activity.quiz.variant === warm!.variant)) warm = null;
  // v5.1: bài có ≥ 3 lượt bài hát đã đủ dài → bỏ khởi động (trừ tuần chấm bằng khởi động — cần cho tiêu chí)
  if (warm && !criterionQuiz && todo.filter((x) => x.activity.kind === 'song').length >= 3) warm = null;
  const warmStep = (q: QuizSpec): SessionStep => {
    // Buổi chỉ 10–15': khởi động gọn 6 lượt; riêng tuần có tiêu chí "tai nghe 8/10" giữ đủ 10 lượt
    const quiz = criterionQuiz && q === plan.warmup ? q : { ...q, rounds: Math.min(q.rounds, 6) };
    return { kind: 'quiz', title: warmupTitle(quiz), intro: warmupIntro(quiz), quiz, warmup: true };
  };
  // Tuần chấm bằng khởi động (tai nghe / đọc nốt 8/10): buổi đầu học bài TRƯỚC, khởi động-chấm điểm SAU
  const warmAfter = !!warm && criterionQuiz && firstOfWeek;
  if (!opts.replay && !isStage) {
    const completed = data?.sessions.filter((s) => s.completed).length ?? 0;
    steps.push({ kind: 'posture', short: completed >= 3, drill: sessionDrill(lesson.week, data?.sessions.length ?? 0) });
    // Bài kiểm tra tuần: KHÔNG ôn nhanh (để kết quả ôn không lẫn vào tiêu chí, vd C4 10/10)
    const review = data && !lesson.isWeekTest ? reviewSegment(lesson, data, opts.rng, now) : null;
    if (review) steps.push({ kind: 'review', segment: review });
    if (warm && !warmAfter) steps.push(warmStep(warm));
  }
  todo.forEach((x, k) => steps.push({ kind: 'activity', activity: x.activity, index: x.index, last: k === todo.length - 1 }));
  if (!opts.replay && !isStage && warm && warmAfter) steps.push(warmStep(warm));
  // Ôn bài cũ (một câu, theo nhịp): SAU bài mới — hết giờ thì session.ts nhảy thẳng tới phần kết, bài mới không bị lấn
  if (opts.songReview && data && !opts.replay && !isStage && !lesson.isWeekTest && todo.length < 4 && !lesson.id.endsWith('-daily')) {
    const rs = reviewSongStep(lesson, data, now, opts.rng);
    if (rs) steps.push(rs);
  }
  let teach: { emoji: string; text: string } | null = null;
  if (!opts.replay && !isStage) {
    const daily = lesson.id.endsWith('-daily');
    teach = daily ? DAILY_TEACH[(data?.sessions.length ?? 0) % DAILY_TEACH.length] : plan.teach;
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
  return steps;
}

/**
 * Ước lượng THÔ thời lượng một buổi (phút), để kiểm "buổi ≤ ~12 phút" (test pacing). Không dùng để hẹn giờ.
 * v5.1 — phần cố định: tư thế + khởi động kỹ thuật 1,5 · ôn nhanh 1 · màn kết (con làm thầy + tự chấm) 1,5
 * · khởi động tai/đọc nốt 1,5 nếu buổi CÓ bước này (tuần có khởi động; bị bỏ khi bài ≥ 3 lượt bài hát hoặc ≥ 4 hoạt động,
 * trừ tuần chấm bằng khởi động). "Ôn bài cũ" không tính (chỉ có khi còn chỗ, và bị bỏ khi hết giờ).
 * Hoạt động: kỹ thuật 1 · từng nốt 0,3/việc · trò nghe/đọc 0,2/lượt · nhịp 0,4/mẫu · đọc nhạc 1/đoạn
 * · sáng tạo 2 (sáng tác 3) · sắc thái 0,3/lượt · bài hát chờ 3 giây/nốt (tách tay: chỉ nốt của tay đó) + 0,5
 * · theo nhịp 2 lượt cả bài + 0,5.
 */
export function estimateLessonMinutes(lesson: Lesson): number {
  if (lesson.activities.some((a) => a.kind === 'stage')) return 0;
  const plan = weekPlan(lesson.week);
  const songs = lesson.activities.filter((a) => a.kind === 'song').length;
  const criterionQuiz = plan.criterion.who === 'APP';
  const warm = !!plan.warmup && (criterionQuiz || (songs < 3 && lesson.activities.length < 4));
  let m = 1.5 + 1 + 1.5 + (warm ? 1.5 : 0);
  for (const a of lesson.activities) {
    switch (a.kind) {
      case 'technique':
        m += 1;
        break;
      case 'notes':
        m += 0.3 * a.segment.targets.length;
        break;
      case 'quiz':
        m += 0.2 * a.quiz.rounds;
        break;
      case 'rhythm':
        m += 0.4 * a.patterns.length;
        break;
      case 'sight':
        m += a.count;
        break;
      case 'improv':
        m += a.mode === 'compose' ? 3 : 2;
        break;
      case 'dynamics':
        m += 0.3 * a.rounds.length;
        break;
      case 'song': {
        const t = findTune(a.songId);
        if (!t) break;
        const voice = a.hand === 'RH' ? t.notes : a.hand === 'LH' ? (t.lh ?? t.notes) : [...t.notes, ...(t.lh ?? [])];
        const notes = voice.filter((n) => !n.rest).length;
        const beats = t.notes.reduce((x, n) => x + n.beats, 0);
        m += a.mode === 'wait' ? (notes * 3) / 60 + 0.5 : (2 * beats) / Math.max(40, t.bpm) + 0.5;
        break;
      }
      default:
        break;
    }
  }
  return Math.round(m * 10) / 10;
}

/**
 * Chọn bài cho bước "Ôn bài cũ": bài của tuần (lesson.week − 4 … lesson.week − 2), không có trong bài hôm nay.
 * Ưu tiên: đã thuộc nhưng không còn "tươi" (> FRESH_DAYS ngày) → lượt cả bài gần nhất KHÔNG đạt → lâu chưa chơi nhất.
 * Hoà điểm → rng. Tốc độ: 60 nếu bài đã thuộc, còn lại 50; v5.1: bài có móc kép (tốc độ mặc định 40) → 40.
 */
export function reviewSongStep(
  lesson: Lesson,
  data: Readonly<AppData>,
  now: number = Date.now(),
  rng: () => number = Math.random,
): Extract<SessionStep, { kind: 'review-song' }> | null {
  const inLesson = new Set(lesson.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : [])));
  const cands = SONGS.filter((t) => {
    const w = t.week ?? 1;
    return w >= lesson.week - 4 && w <= lesson.week - 2 && !inLesson.has(t.id) && !t.id.startsWith('sight');
  });
  if (!cands.length) return null;
  const scored = cands.map((t) => {
    const mastered = songMastered(data, t.id);
    const last = lastWholePlay(data, t.id);
    let lastRun: Run | undefined;
    for (const s of data.sessions) for (const r of s.songRuns) if (r.songId === t.id && (!lastRun || r.ts >= lastRun.ts)) lastRun = r;
    const lastAny = lastRun?.ts ?? 0;
    const days = lastAny ? Math.min(60, (now - lastAny) / DAY_MS) : 60;
    let score = days / 30; // 0…2: càng lâu chưa chơi càng cao
    if (mastered && last < now - FRESH_DAYS * DAY_MS) score += 3;
    if (lastRun && !lastRun.passed) score += 2;
    return { t, mastered, score: score + rng() * 0.01 };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const [a, b] = phraseRanges(best.t)[0];
  return {
    kind: 'review-song',
    songId: best.t.id,
    phrase: [a, b],
    bpm: best.t.bpm <= 40 ? 40 : best.mastered ? 60 : 50,
    level: 2,
    hints: lesson.week >= 8 ? 'names' : 'full',
    intro: '🔁 Ôn bài cũ — đàn lại câu đầu cho nhớ lâu nhé!',
  };
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

export function warmupTitle(q: QuizSpec): string {
  return {
    updown: 'Lên hay xuống? ⬆️⬇️',
    stepskip: 'Bước hay nhảy? 🐸',
    identify: 'Nốt nào đây? 👂',
    read: q.clef === 'bass' ? 'Đọc nốt khóa Fa 📖' : 'Đọc nốt 📖',
    majorminor: 'Vui hay buồn? 😊😢',
    interval: 'Bước hay nhảy trên khuông? 👣🐸',
    landmark: 'Nốt mốc 🏠',
  }[q.variant];
}

function warmupIntro(q: QuizSpec): string {
  return {
    updown: 'App đàn 2 nốt. Nốt sau CAO hơn (lên) hay THẤP hơn (xuống)?',
    stepskip: 'Hai nốt cạnh nhau là BƯỚC. Cách một phím là NHẢY.',
    identify: 'Đầu tiên app đàn nốt Đô làm mốc, rồi đàn một nốt bí ẩn. Con chạm đúng phím nhé!',
    read: 'Nốt hiện trên khuông — con chạm đúng phím trên iPad.',
    majorminor: 'App rải một hợp âm. Nghe VUI (trưởng) hay BUỒN (thứ)?',
    interval: 'Khuông hiện 2 nốt. Nốt sau GIỐNG, BƯỚC hay NHẢY so với nốt trước — đi lên hay đi xuống?',
    landmark: 'Nhìn nốt trên khuông — đó là nốt mốc nào? Chọn tên hoặc chạm phím.',
  }[q.variant];
}

export function sessionsToday(data: Readonly<AppData>, today: string): Session[] {
  return data.sessions.filter((s) => s.date === today);
}

/** Phút đã học hôm nay (cho giới hạn ngày — Phase 3, chỉ khi phụ huynh bật). */
export function minutesToday(data: Readonly<AppData>, today: string): number {
  return data.progress.practiceDays[today]?.minutes ?? 0;
}

/**
 * LUYỆN TẬP MỖI NGÀY (sau tuần cuối MAX_WEEK, hoặc bất cứ lúc nào từ Cấp 2). Ngưỡng tuần theo giáo trình v5.1 (31 tuần):
 * ôn đọc nhạc + 1 bài CHƯA thuộc (từng nốt → theo nhịp) + 1 bài ĐÃ thuộc (giữ phong độ — ôn ngắt quãng).
 * v5: bài đã thuộc ưu tiên bài KHÔNG còn "tươi" (songFresh — lâu chưa chơi lại) = "ôn bài cũ".
 */
export function dailyLesson(data: Readonly<AppData>, rng: () => number = Math.random, now: number | Date = Date.now()): Lesson {
  const week = data.progress.currentWeek;
  const open = SONGS.filter((s) => (s.week ?? 1) <= week);
  const mastered = new Set(masteredSongs(data));
  const pick = <T,>(arr: T[]): T | undefined => arr[Math.floor(rng() * arr.length) % Math.max(1, arr.length)];
  // Ưu tiên bài GẦN trình độ hiện tại (8 tuần gần nhất) — tránh tuần 31 lại tập bài tay trái tuần 7
  const recent = open.filter((s) => (s.week ?? 1) >= week - 8);
  const notMastered = open.filter((s) => !mastered.has(s.id));
  const recentNotMastered = notMastered.filter((s) => recent.includes(s));
  const learning =
    (rng() < 0.75 ? pick(recentNotMastered) : undefined) ?? pick(notMastered) ?? pick(recent) ?? pick(open);
  const keepable = open.filter((s) => mastered.has(s.id) && s.id !== learning?.id);
  const stale = keepable.filter((s) => !songFresh(s.id, data, now));
  // Một lần rng như trước: có bài "phai" thì chọn trong đó
  const keep = pick(stale.length ? stale : keepable);
  const keepStale = !!keep && stale.includes(keep);
  const positions = week >= 26 ? (['C', 'G', 'C5'] as const) : week >= 14 ? (['C', 'G'] as const) : (['C'] as const);
  const position = positions[Math.floor(rng() * positions.length) % positions.length];
  const activities: Activity[] = [
    {
      kind: 'sight',
      title: 'Đọc nhạc mỗi ngày',
      position,
      // Thế Đô cao chỉ có tay phải
      hand: week >= 11 && rng() < 0.3 && position !== 'C5' ? 'LH' : 'RH',
      count: 2,
      rhythm: week >= 17 ? 2 : 1,
      timeSignature: week >= 15 && rng() < 0.3 ? '3/4' : '4/4',
      hints: week >= 24 ? 'staff' : 'names',
    },
  ];
  if (learning) {
    activities.push({ kind: 'song', songId: learning.id, mode: 'wait', hints: week >= 24 ? 'names' : 'full', intro: 'Bài đang tập — từng nốt trước nhé.' });
    activities.push({ kind: 'song', songId: learning.id, mode: 'tempo', level: 2, hints: week >= 24 ? 'names' : 'full' });
  }
  // Xen kẽ cho đỡ nhàm: thường là ôn bài đã thuộc; thỉnh thoảng trò tai nghe hoặc to/nhỏ – ngắt/liền
  const extra = rng();
  if (extra < 0.2 && week >= 6) {
    activities.push({
      kind: 'dynamics',
      title: week >= 12 && rng() < 0.5 ? 'Ngắt hay liền?' : 'To hay nhỏ?',
      intro: 'Thầy đàn mẫu — con đàn lại thật rõ kiểu nhé!',
      ...(week >= 12 && rng() < 0.5
        ? {
            mode: 'stac-leg' as const,
            rounds: [
              { pitches: ['C4', 'D4', 'E4', 'F4'], want: 'leg' as const, fingers: [1, 2, 3, 4], hand: 'RH' as const },
              { pitches: ['G4', 'G4', 'G4'], want: 'stac' as const, fingers: [5, 5, 5], hand: 'RH' as const },
              { pitches: ['G4', 'F4', 'E4', 'D4'], want: 'leg' as const, fingers: [5, 4, 3, 2], hand: 'RH' as const },
              { pitches: ['C4', 'E4', 'G4'], want: 'stac' as const, fingers: [1, 3, 5], hand: 'RH' as const },
            ],
          }
        : {
            mode: 'loud-soft' as const,
            rounds: [
              { pitches: ['C4', 'E4', 'G4'], want: 'f' as const, fingers: [1, 3, 5], hand: 'RH' as const },
              { pitches: ['G4', 'E4', 'C4'], want: 'p' as const, fingers: [5, 3, 1], hand: 'RH' as const },
              { pitches: ['E4', 'D4', 'C4'], want: 'p' as const, fingers: [3, 2, 1], hand: 'RH' as const },
              { pitches: ['C4', 'D4', 'E4'], want: 'f' as const, fingers: [1, 2, 3], hand: 'RH' as const },
            ],
          }),
    });
  } else if (extra < 0.35 && week >= 3) {
    const quiz: QuizSpec =
      week >= 25 && rng() < 0.5
        ? { variant: 'majorminor', pool: ['C4', 'D4', 'F4', 'G4', 'A4'], rounds: 6 }
        : { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6 };
    activities.push({ kind: 'quiz', title: quiz.variant === 'majorminor' ? 'Vui hay buồn? 😊😢' : 'Nốt nào đây? 👂', intro: 'Đôi tai giỏi — nghe rồi chọn nhé!', quiz });
  } else if (keep) {
    activities.push({ kind: 'song', songId: keep.id, mode: 'tempo', level: 3, hints: 'names', intro: keepStale ? '🔁 Ôn bài cũ — lâu rồi chưa chơi, mình đàn lại nhé!' : 'Bài con đã thuộc — chơi lại cho nhớ lâu!' });
  }
  return { id: `w${week}-daily`, week, title: 'Luyện tập mỗi ngày', emoji: '🔁', activities };
}

/** "YYYY-MM-DD" của thứ 2 đầu tuần lịch chứa `today`. */
function mondayOf(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @deprecated v5.1 — đếm BUỔI (2 buổi một ngày = 2). Mục tiêu chăm chỉ nay tính theo NGÀY: dùng daysThisWeek.
 * Số buổi đã HOÀN THÀNH trong tuần lịch hiện tại (thứ 2 → chủ nhật).
 */
export function sessionsThisWeek(data: Readonly<AppData>, today: Date): number {
  const monday = mondayOf(today);
  return data.sessions.filter((s) => s.completed && s.date >= monday).length;
}

/**
 * v5.1 (OWNER duyệt 2026-10-06) — Số NGÀY KHÁC NHAU có ít nhất một buổi HOÀN THÀNH trong tuần lịch hiện tại
 * (thứ 2 → chủ nhật). Mục tiêu 4–5 ngày/tuần (§1) — hai buổi cùng ngày chỉ tính một ngày (luyện đều quan trọng hơn dồn).
 */
export function daysThisWeek(data: Readonly<AppData>, today: Date): number {
  const monday = mondayOf(today);
  return new Set(data.sessions.filter((s) => s.completed && s.date >= monday).map((s) => s.date)).size;
}

/** Chuỗi ngày liên tiếp có học (tính tới hôm nay hoặc hôm qua). */
export function streakDays(data: Readonly<AppData>, today: Date): number {
  const days = new Set(data.sessions.filter((s) => s.completed).map((s) => s.date));
  const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(key(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/**
 * v5.1 — Tiến độ tiêu chí theo NGÀY cho màn chính (vd ●○ "còn 1 hôm"): null = tiêu chí không tính theo ngày
 * (tuần 1 — một buổi thử thách; tuần huy chương 10/21/31; tuần ngoài giáo trình).
 * - `needDays` = CRITERION_DAYS (2).
 * - `days` = số ngày KHÁC NHAU (session.date) đã đạt phần tiêu chí theo ngày, tối đa `needDays`.
 *   Tuần gam (20): ngày của tay chậm hơn. Tuần cần thêm điều kiện phụ (23, 26: một lượt đọc nhạc đạt; 27: đủ 5 đoạn):
 *   khi đủ ngày mà còn thiếu điều kiện phụ thì `days` = needDays − 1 — để "●●" LUÔN đồng nghĩa với weekPassed.
 * Hàm thuần — có test (tests/criteria-v51.test.ts).
 */
export function criterionProgress(week: number, data: Readonly<AppData>): { days: number; needDays: number } | null {
  if (MEDAL_WEEKS.has(week) || week === 1) return null;
  const c = criterionDays(week, sessionsOfWeek(data, week));
  if (!c) return null;
  const needDays = CRITERION_DAYS;
  let days = Math.min(c.days, needDays);
  if (days >= needDays && !c.extra) days = needDays - 1;
  return { days, needDays };
}
