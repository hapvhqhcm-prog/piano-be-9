/**
 * (+ 2026-10-06) GỘP LỊCH SỬ — giữ localStorage nhỏ (Safari ~5 MB / nguồn).
 *
 * Rà soát độ bền 2026-10-06: dùng điển hình chạm trần ~5 MB sau ~1,5–2 năm (mỗi buổi ~1,6 K ký tự). Từ nay:
 * - GIỮ NGUYÊN mọi buổi trong COMPACT_WINDOW_DAYS (8 tuần) gần nhất — báo cáo "2 tuần gần đây", "Việc cần làm tối nay",
 *   các bảng "lượt chơi gần đây"… vẫn đọc buổi đầy đủ.
 * - Buổi CŨ hơn được GỘP vào `AppData.history` (tổng hợp cộng dồn — schema.History) chứa ĐÚNG những gì các hàm đọc
 *   lịch sử cần (bài đã thuộc, lần chơi gần nhất, trí nhớ nốt 5 lần gần nhất, tuần chăm chỉ, chuỗi ngày, ngày tập,
 *   sticker, báo cáo, bảng màn phụ huynh…). Kết quả các hàm đọc trước / sau khi gộp GIỐNG HỆT (tests/compaction.test.ts).
 * - Buổi của tuần giáo trình W chỉ được gộp khi các buổi cũ ĐÓ đã đủ để đạt tiêu chí tuần W (khi đó W được ghi vào
 *   history.passedWeeks — tiêu chí chỉ tăng nên weekPassed giữ nguyên). Tuần hiện tại / sắp tới chưa đạt giữ lại TOÀN BỘ
 *   buổi → tiêu chí, "còn 1 hôm", bài giúp đạt tiêu chí… tính như cũ. Tuần ĐÃ ĐI QUA mà chưa đạt (bố mẹ cho qua tay)
 *   cũng được gộp: tiêu chí của nó không còn quyết định gì (đảo < tuần hiện tại luôn sáng; sticker được lưu trước khi lùi tuần).
 *
 * Idempotent: buổi đã gộp bị xóa khỏi sessions, chạy lại không gộp thêm gì. Xuất / nhập JSON mang theo `history`.
 */
import { forEachTargetOutcome, foldSongRun, weekPassed } from '../lessons/lessonEngine';
import { DYNAMICS_ROUNDS, EFFORT_BY_DAYS_FROM, monotonicStickerIds } from '../lessons/stickers';
import { isLessonSession } from '../lessons/bonusStickers';
import { RATING_STARS, bumpDataRev, emptyHistory, foldParentStats, mondayKey, weekOfLessonId, weekdayIndex, type ParentStats } from './history';
import { sessionAnswers } from './answers';
import { localDateStr, type AppData, type CountPair, type History, type Session } from './schema';

/** Giữ nguyên các buổi trong ngần này ngày gần nhất (8 tuần). */
export const COMPACT_WINDOW_DAYS = 56;
/** Khi localStorage đầy: gộp mạnh hơn nhưng vẫn giữ ≥ 4 tuần (báo cáo so sánh 2 tuần gần đây với 2 tuần trước đó). */
export const EMERGENCY_WINDOW_DAYS = 28;
/** Số lần gặp gần nhất giữ lại cho mỗi nốt / việc (hộp Leitner ≤ 4 + "sai trong 5 lần gần nhất"). */
const TARGET_KEEP = 5;

export interface CompactResult {
  /** Số buổi đã gộp lần này */
  folded: number;
  /** Số buổi cũ hơn cửa sổ nhưng được giữ lại (tuần chưa đạt tiêu chí) */
  keptOld: number;
}

/** Số tuần giáo trình của mã bài ("w12-l3", "w31-daily", "w5-song-…"); null = không theo tuần. */
const weekOfLesson = weekOfLessonId;

/**
 * Gộp các buổi cũ hơn `windowDays` ngày (tính tới `now`) vào data.history. SỬA TẠI CHỖ `data`.
 * Chỉ tạo `history` khi thật sự gộp được buổi nào (dữ liệu nhỏ giữ nguyên hình dạng cũ).
 */
export function compactData(data: AppData, now: Date, windowDays: number = COMPACT_WINDOW_DAYS): CompactResult {
  const cutoff = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - windowDays));
  const old = data.sessions.filter((s) => s.date < cutoff);
  if (!old.length) return { folded: 0, keptOld: 0 };
  const passedBefore = new Set(data.history?.passedWeeks ?? []);
  // Nhóm buổi cũ theo tuần giáo trình
  const groups = new Map<number | null, Session[]>();
  for (const s of old) {
    const w = weekOfLesson(s.lessonId);
    const g = groups.get(w);
    if (g) g.push(s);
    else groups.set(w, [s]);
  }
  const fold = new Set<Session>();
  const newlyPassed: number[] = [];
  for (const [w, g] of groups) {
    if (w === null || passedBefore.has(w)) {
      g.forEach((s) => fold.add(s));
      continue;
    }
    // Các buổi cũ CỦA RIÊNG tuần này (không dùng tổng hợp) đã đủ đạt tiêu chí? (tiêu chí chỉ tăng theo số buổi)
    if (weekPassed(w, { ...data, sessions: g, history: undefined })) {
      newlyPassed.push(w);
      g.forEach((s) => fold.add(s));
    } else if (w < data.progress.currentWeek) {
      // Tuần bé ĐÃ ĐI QUA mà chưa đạt (bố mẹ cho qua tay): tiêu chí tuần này không còn quyết định gì (đảo < tuần hiện tại
      // luôn sáng; huy chương / tuần 1 là tiêu chí MỘT buổi nên buổi cũ không đạt thì gộp cũng không mất gì) → gộp.
      // Đánh đổi (ghi rõ): nếu sau này bố mẹ LÙI về đúng tuần này, chấm "còn mấy hôm" chỉ tính lại buổi trong 8 tuần.
      g.forEach((s) => fold.add(s));
    }
  }
  if (!fold.size) return { folded: 0, keptOld: old.length };
  const h = data.history ?? emptyHistory();
  for (const s of data.sessions) if (fold.has(s)) foldSession(h, s);
  for (const w of newlyPassed) if (!h.passedWeeks.includes(w)) h.passedWeeks.push(w);
  h.passedWeeks.sort((a, b) => a - b);
  if (cutoff > h.compactedThrough) h.compactedThrough = cutoff;
  data.history = h;
  data.sessions = data.sessions.filter((s) => !fold.has(s));
  bumpDataRev(data);
  return { folded: fold.size, keptOld: old.length - fold.size };
}

/** Ghi lại sticker đảo / huy chương đang nhận (trước khi bố mẹ lùi tuần). Trả về true nếu có thêm. */
export function recordMonotonicStickers(data: AppData): boolean {
  const ids = monotonicStickerIds(data);
  const have = new Set(data.history?.stickers ?? []);
  const add = ids.filter((id) => !have.has(id));
  if (!add.length) return false;
  const h = (data.history ??= emptyHistory());
  h.stickers.push(...add);
  bumpDataRev(data);
  return true;
}

const inc = (p: CountPair, ok: boolean) => {
  p[1]++;
  if (ok) p[0]++;
};

/** Cộng MỘT buổi vào tổng hợp. */
export function foldSession(h: History, s: Session): void {
  // Sticker bất ngờ: giữ tóm tắt tối thiểu của buổi bài học đã hoàn thành — sổ sticker tính lại theo thứ tự thời gian
  if (s.completed && isLessonSession(s)) (h.bonusStubs ??= []).push({ id: s.id, date: s.date, lessonId: s.lessonId, t: s.startedAt });
  h.sessions++;
  if (s.completed) h.completed++;
  if (s.minutes > 0 || s.completed) h.counted++;
  if (h.firstDate === null || s.date < h.firstDate) h.firstDate = s.date;
  const nonEmpty =
    s.completed || s.selfRating !== null || s.parentAssessments.length + s.appAssessments.length + s.micAssessments.length + s.songRuns.length > 0;
  if (nonEmpty && (h.lastDate == null || s.date > h.lastDate)) h.lastDate = s.date;
  const wk = weekOfLessonId(s.lessonId);
  if (nonEmpty && wk !== null) {
    const wf = (h.weekFirst ??= {});
    if (!wf[wk] || s.date < wf[wk]) wf[wk] = s.date;
  }

  // Ngày tập — cùng quy tắc ProgressStore.recomputePracticeDays
  if (!(s.minutes === 0 && !s.selfRating)) {
    const d = (h.practiceDays[s.date] ??= [0, 0]);
    d[0] += s.minutes;
    if (s.selfRating) d[1] += RATING_STARS[s.selfRating];
  }
  // Tuần chăm chỉ / chuỗi ngày: bitmask ngày có buổi hoàn thành + số buổi theo quy tắc cũ
  if (s.completed) {
    const w = (h.weeks[mondayKey(s.date)] ??= [0, 0]);
    w[0] |= 1 << weekdayIndex(s.date);
    if (s.date < EFFORT_BY_DAYS_FROM) w[1]++;
  }
  // Bài hát
  for (const r of s.songRuns) {
    foldSongRun(h.songs, r);
    if (r.source === 'mic' && r.passed && !r.phrase && !r.hand && r.total > 0 && r.hits >= r.total) h.micPerfect = true;
  }
  // Trí nhớ nốt: giữ TARGET_KEEP lần gần nhất (theo ts) mỗi mã
  const touched = new Set<string>();
  forEachTargetOutcome(s, (k, ok, ts) => {
    (h.targets[k] ??= []).push([ts, ok ? 1 : 0]);
    touched.add(k);
  });
  for (const k of touched) {
    const list = h.targets[k];
    list.sort((a, b) => a[0] - b[0]);
    if (list.length > TARGET_KEEP) h.targets[k] = list.slice(-TARGET_KEEP);
  }
  // Trò sắc thái
  for (const mode of ['loud-soft', 'stac-leg'] as const) {
    const prefix = `dyn:${mode}:`;
    const n = new Set(s.parentAssessments.filter((a) => a.note.startsWith(prefix) && a.result === 'correct').map((a) => a.note)).size;
    if (n >= DYNAMICS_ROUNDS && !h.dynamicsDone.includes(mode)) h.dynamicsDone.push(mode);
  }
  for (const a of s.parentAssessments) if (a.note.startsWith('dyn:') && a.result === 'correct') h.dynamicsRounds++;
  // Báo cáo: độ chính xác theo kỹ năng
  for (const a of sessionAnswers(s)) inc(h.skills[a.skill], a.ok);
  // Màn phụ huynh: bảng theo nốt + "Kỹ năng của con"
  foldParentInto(h, s);
}

function foldParentInto(h: History, s: Session): void {
  const P = h.parent;
  const pAgg = new Map(Object.entries(P.p).map(([k, [c, r]]) => [k, { c, r }]));
  const aAgg = new Map(Object.entries(P.a).map(([k, [c, t]]) => [k, { c, t }]));
  const micAgg = new Map(Object.entries(P.m).map(([k, [t, first, over]]) => [k, { t, first, over }]));
  const pair = (p: CountPair) => ({ ok: p[0], all: p[1] });
  const skills: ParentStats['skills'] = { find: pair(P.find), ear: pair(P.ear), tempo: pair(P.tempo), sight: pair(P.sight) };
  foldParentStats(s, pAgg, aAgg, micAgg, skills);
  P.p = Object.fromEntries([...pAgg].map(([k, v]) => [k, [v.c, v.r]]));
  P.a = Object.fromEntries([...aAgg].map(([k, v]) => [k, [v.c, v.t]]));
  P.m = Object.fromEntries([...micAgg].map(([k, v]) => [k, [v.t, v.first, v.over]]));
  P.find = [skills.find.ok, skills.find.all];
  P.ear = [skills.ear.ok, skills.ear.all];
  P.tempo = [skills.tempo.ok, skills.tempo.all];
  P.sight = [skills.sight.ok, skills.sight.all];
}
