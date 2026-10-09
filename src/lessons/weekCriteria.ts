/**
 * Tiêu chí qua tuần (bằng chứng lượt chơi, quy tắc 2 NGÀY, tai nghe / đọc nốt ≥ 5/6, huy chương) + tiến độ cho màn chính.
 */
import { findTune } from '../music/exercises';
import { beatsPerMeasure, measureCount } from '../music/tune';
import type { AppAssessment, AppData, Session } from '../progress/schema';
import { hist } from '../progress/history';
import { LEVELS, WEEKS, sessionsOfWeek, weekPlan } from './curriculum';
import { passedWhole, together, type Run } from './songStats';

const isPitch = (s: string) => /^[A-G](#|b)?\d$/.test(s);
/** Tuần 26 (v5.1): năm nốt cao thế Đô cao */
const HIGH_NOTES = ['C5', 'D5', 'E5', 'F5', 'G5'];
/** Tuần 23 (v5.1): nốt có dòng kẻ phụ (khởi động-chấm điểm của tuần) */
const LEDGER_NOTES = ['A3', 'B3', 'C4', 'G5', 'A5'];

/** Tiêu chí APP: trong MỘT buổi có EAR_WINDOW câu liên tiếp (đoán / đọc) đúng ≥ EAR_NEED (thay cho 8/10 cũ). */
export const EAR_WINDOW = 6;
export const EAR_NEED = 5;

/** Buổi có EAR_WINDOW (6) câu liên tiếp (đoán / đọc) đúng ≥ EAR_NEED (5). */
function earPassInSession(s: Session, accept: (a: AppAssessment) => boolean): boolean {
  const a = s.appAssessments.filter(accept);
  for (let i = 0; i + EAR_WINDOW <= a.length; i++) {
    if (a.slice(i, i + EAR_WINDOW).filter((x) => x.correct).length >= EAR_NEED) return true;
  }
  return false;
}

/**
 * v5.1 (OWNER duyệt 2026-10-06): tiêu chí APP (tai nghe / đọc nốt ≥ 5/6 — trước là 8/10) cũng theo quy tắc 2 NGÀY
 * như bài hát — trả về SỐ NGÀY khác nhau (session.date) có một buổi đạt ≥ 5/6.
 */
function earDays(sessions: readonly Session[], accept: (a: AppAssessment) => boolean): number {
  return new Set(sessions.filter((s) => earPassInSession(s, accept)).map((s) => s.date)).size;
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
      // APP: đoán nốt (có mốc Đô) đúng ≥ 5/6 — v5.1: ở 2 ngày
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
      // APP: đọc nốt có dòng kẻ phụ ≥ 5/6 (2 ngày) + v5.1: một lượt ĐỌC NHẠC qua vạch phụ đạt (thế La thứ / Đô giữa tay trái)
      return ear((a) => LEDGER_NOTES.includes(a.expected), sightOk(['Am', 'MC']));
    case 24:
      // v5.1: phải THEO NHỊP ≥ 50 (chế độ chờ không đủ cho bài biểu diễn)
      return song('silent_night', true, 50);
    case 25:
      return ear((a) => a.expected === 'major' || a.expected === 'minor');
    case 26:
      // APP: đọc nốt cao (Đô5–Sol5) ≥ 5/6 (2 ngày) + v5.1: một lượt đọc nhạc thế Đô cao đạt
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
    default: {
      // Cấp 4 (2026-10-08): tiêu chí dạng dữ liệu — mọi bài đạt ở ≥ 2 ngày (tiến độ = bài chậm nhất) + thẻ bố mẹ xác nhận
      const spec = WEEKS[week - 1]?.criterionSpec;
      if (!spec) return null;
      const days = Math.min(...spec.songs.map((x) => song(x.songId, !!x.tempo, x.minBpm ?? 0).days));
      return { days, extra: (spec.parentChecks ?? []).every((note) => parentCheckOk(sessions, note)) };
    }
  }
}

/** Cấp 4 — thẻ bố mẹ xác nhận (PARENT_ASSESSMENT `note`): lần chấm GẦN NHẤT trong các buổi của tuần là "Đúng rồi". */
function parentCheckOk(sessions: readonly Session[], note: string): boolean {
  let last: { ts: number; ok: boolean } | null = null;
  for (const s of sessions)
    for (const a of s.parentAssessments)
      if (a.note === note && (!last || a.ts >= last.ts)) last = { ts: a.ts, ok: a.result === 'correct' };
  return !!last?.ok;
}

/**
 * Tiêu chí qua tuần (§11; v5 — OWNER duyệt 2026-10-05; v5.1 — 2026-10-06). Hàm thuần — có test.
 * Tiêu chí BÀI HÁT: lượt chơi trọn bài (không tập một câu, không tách tay) đạt ở 2 NGÀY khác nhau (runDays).
 * v5.1: tiêu chí APP (tai nghe / đọc nốt ≥ 5/6 trong một buổi) cũng cần 2 ngày; Đêm thánh / Minuet / Für Elise cần lượt THEO NHỊP ≥ 50;
 * tuần dòng kẻ phụ / nốt cao cần thêm một lượt đọc nhạc đạt trong dải đó. Tuần 1 và huy chương giữ như cũ.
 */
export function weekPassed(week: number, data: Readonly<AppData>): boolean {
  // (+ 2026-10-06) Tuần đã đạt chỉ với các buổi ĐÃ GỘP (compaction.ts) — tiêu chí chỉ tăng nên vẫn đạt
  if (hist(data).passedWeeks.includes(week)) return true;
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
  // (+ 2026-10-06) Đã đạt chỉ với các buổi đã gộp (history.passedWeeks) → đủ ngày (như trước khi gộp)
  if (hist(data).passedWeeks.includes(week)) return { days: needDays, needDays };
  let days = Math.min(c.days, needDays);
  if (days >= needDays && !c.extra) days = needDays - 1;
  return { days, needDays };
}
