import { SONGS } from '../music/tune';
import type { AppData } from '../progress/schema';
import { completedDates, dayKey, hist, memo, mondayKey, weekdayIndex } from '../progress/history';
import { LEVELS, WEEKS, masteredSongs, weekComplete, weekPassed } from './lessonEngine';

/**
 * SỔ STICKER — động lực cho bé: mỗi sticker được TÍNH LẠI hoàn toàn từ dữ liệu sẵn có
 * (tiến độ tuần, lượt chơi bài hát, buổi học…). Không lưu thêm gì → không bao giờ lệch với dữ liệu,
 * sao lưu/nhập JSON là có đủ sticker. Hàm thuần — có test (tests/stickers.test.ts).
 *
 * Sticker đã nhận KHÔNG mất (mọi mốc tính trên toàn bộ lịch sử, chỉ tăng).
 * (+ 2026-10-06) "Toàn bộ lịch sử" = tổng hợp đã gộp (AppData.history — progress/compaction.ts) + buổi còn giữ.
 * Riêng sticker đảo / huy chương được LƯU (history.stickers) trước khi bố mẹ lùi tuần, để không bị mất.
 *
 * "Tuần chăm chỉ" (2026-10-05) thay cho "chuỗi ngày liền": chuỗi ngày bị đứt làm trẻ nản; mục tiêu tuần
 * khớp với giáo trình 4–5 buổi/tuần và được nghỉ ngày nào cũng không sao.
 * v5.1 (OWNER duyệt 2026-10-06): tính theo NGÀY, không theo buổi — tuần chăm chỉ = ≥ BUSY_WEEK_DAYS NGÀY khác nhau có học
 * (2 buổi một ngày chỉ là 1 ngày: luyện đều mỗi ngày quan trọng hơn dồn). Sticker đã nhận KHÔNG mất: buổi trước
 * EFFORT_BY_DAYS_FROM vẫn được tính theo quy tắc cũ (≥ 4 buổi/tuần).
 * Sticker chuỗi ngày CŨ mà bé đã nhận trước ngày đổi vẫn được giữ (tính trên các buổi trước STREAK_RETIRED_AFTER).
 */
export type StickerKind = 'island' | 'songs' | 'streak' | 'week' | 'mic' | 'folk' | 'dynamics' | 'medal';

export interface Sticker {
  id: string;
  kind: StickerKind;
  /** Tên ngắn hiện dưới sticker */
  title: string;
  /** Gợi ý cách nhận (hiện khi còn khóa) */
  hint: string;
  earned: boolean;
  /** island / medal: số tuần; songs / streak / week: mốc số; medal: cấp; dynamics: kiểu trò */
  week?: number;
  n?: number;
  level?: number;
  mode?: 'loud-soft' | 'stac-leg';
}

export const SONG_MILESTONES = [1, 5, 10, 20, 40] as const;
/** (CŨ) mốc chuỗi ngày — chỉ còn để giữ sticker bé đã nhận trước khi đổi sang "tuần chăm chỉ". */
export const STREAK_MILESTONES = [3, 7, 14, 30] as const;
/** Ngày cuối cùng còn tính chuỗi ngày (buổi sau ngày này không tạo thêm sticker chuỗi ngày). */
export const STREAK_RETIRED_AFTER = '2026-10-05';
/** Mốc "tuần chăm chỉ": số tuần (thứ 2 → CN) có ≥ BUSY_WEEK_DAYS ngày học. */
export const BUSY_WEEK_MILESTONES = [1, 3, 6, 10] as const;
/** v5.1 — số NGÀY học khác nhau trong một tuần để là "tuần chăm chỉ". */
export const BUSY_WEEK_DAYS = 4;
/** v5.1 — ngày bắt đầu tính "tuần chăm chỉ" theo NGÀY; buổi trước ngày này giữ quy tắc cũ (≥ 4 BUỔI) để không mất sticker. */
export const EFFORT_BY_DAYS_FROM = '2026-10-06';
/** Số lượt đúng tối thiểu (các lượt khác nhau, trong một buổi) để tính là "chơi xong" trò to/nhỏ – ngắt/liền. */
export const DYNAMICS_ROUNDS = 3;

/** Đếm số bit 1 (số ngày trong bitmask tuần). */
const popcount = (x: number) => {
  let n = 0;
  for (; x; x &= x - 1) n++;
  return n;
};

/**
 * Số tuần (thứ 2 → CN) "chăm chỉ" — chỉ tăng, không bao giờ giảm. v5.1: một tuần là chăm chỉ khi có ≥ BUSY_WEEK_DAYS
 * NGÀY khác nhau có buổi hoàn thành; HOẶC (giữ sticker đã nhận) ≥ 4 BUỔI hoàn thành tính riêng các buổi trước
 * EFFORT_BY_DAYS_FROM (quy tắc cũ — một tuần đã đạt theo quy tắc cũ không bao giờ bị mất).
 * (+ 2026-10-06) Gồm cả các buổi đã gộp (history.weeks: bitmask ngày + số buổi theo quy tắc cũ của từng tuần).
 */
export function busyWeeks(data: Readonly<AppData>): number {
  const weeks = new Map<string, [number, number]>();
  for (const [k, [mask, legacy]] of Object.entries(hist(data).weeks)) weeks.set(k, [mask, legacy]);
  for (const s of data.sessions) {
    if (!s.completed) continue;
    const k = mondayKey(s.date);
    const w = weeks.get(k) ?? [0, 0];
    w[0] |= 1 << weekdayIndex(s.date);
    if (s.date < EFFORT_BY_DAYS_FROM) w[1]++;
    weeks.set(k, w);
  }
  let n = 0;
  for (const [mask, legacy] of weeks.values()) if (popcount(mask) >= BUSY_WEEK_DAYS || legacy >= 4) n++;
  return n;
}

/** Chuỗi ngày học liên tiếp DÀI NHẤT từng có (chỉ tính buổi đã hoàn thành). `until`: chỉ tính các ngày ≤ until. */
export function bestStreak(data: Readonly<AppData>, until?: string): number {
  const days = [...completedDates(data)].filter((d) => !until || d <= until).sort();
  const set = new Set(days);
  let best = 0;
  for (const d of days) {
    const [y, m, dd] = d.split('-').map(Number);
    const prev = new Date(y, m - 1, dd - 1);
    if (set.has(dayKey(prev))) continue; // không phải ngày đầu chuỗi
    let n = 0;
    const cur = new Date(y, m - 1, dd);
    while (set.has(dayKey(cur))) {
      n++;
      cur.setDate(cur.getDate() + 1);
    }
    best = Math.max(best, n);
  }
  return best;
}

/** Bé đàn trọn một bài (cả bài, đủ cả hai tay — không phải một câu / một tay) mà micro chấm đúng hết mọi nốt. */
export function micPerfectRun(data: Readonly<AppData>): boolean {
  if (hist(data).micPerfect) return true;
  return data.sessions.some((s) =>
    s.songRuns.some((r) => r.source === 'mic' && r.passed && !r.phrase && !r.hand && r.total > 0 && r.hits >= r.total),
  );
}

export const FOLK_SONG_IDS: readonly string[] = SONGS.filter((t) => t.composer?.startsWith('Dân ca')).map((t) => t.id);

/** Đã chơi xong trò sắc thái `mode` (≥ DYNAMICS_ROUNDS lượt khác nhau được chấm đúng trong cùng một buổi). */
export function dynamicsDone(data: Readonly<AppData>, mode: 'loud-soft' | 'stac-leg'): boolean {
  if (hist(data).dynamicsDone.includes(mode)) return true;
  const prefix = `dyn:${mode}:`;
  return data.sessions.some(
    (s) =>
      new Set(s.parentAssessments.filter((a) => a.note.startsWith(prefix) && a.result === 'correct').map((a) => a.note))
        .size >= DYNAMICS_ROUNDS,
  );
}

/**
 * Đảo tuần `week` đã qua — cùng quy tắc với bản đồ ở màn chính.
 * (+ 2026-10-06) Đảo đã nhận KHÔNG mất khi bố mẹ lùi tuần (history.stickers — ProgressStore.setCurrentWeek ghi lại).
 * Màn chính nên dùng hàm này cho bản đồ để đảo đã qua vẫn sáng.
 */
export function islandPassed(week: number, data: Readonly<AppData>): boolean {
  return week < data.progress.currentWeek || hist(data).stickers.includes(`island-${week}`) || weekComplete(week, data);
}

/** Huy chương cấp (tuần biểu diễn `week`) — đã nhận thì giữ (history.stickers). */
const medalEarned = (level: number, week: number, data: Readonly<AppData>) =>
  hist(data).stickers.includes(`medal-${level}`) || weekPassed(week, data);

/** Sticker đảo / huy chương đang nhận được — ProgressStore lưu lại (history.stickers) trước khi lùi tuần. */
export function monotonicStickerIds(data: Readonly<AppData>): string[] {
  return allStickers(data)
    .filter((s) => s.earned && (s.kind === 'island' || s.kind === 'medal'))
    .map((s) => s.id);
}

/** Toàn bộ sticker (thứ tự hiển thị cố định), mỗi cái có cờ earned. Ghi nhớ theo phiên bản dữ liệu (trả về bản sao). */
export function allStickers(data: Readonly<AppData>): Sticker[] {
  return memo(data, 'allStickers', () => computeStickers(data)).map((s) => ({ ...s }));
}

function computeStickers(data: Readonly<AppData>): Sticker[] {
  const out: Sticker[] = [];
  for (const w of WEEKS) {
    out.push({
      id: `island-${w.week}`,
      kind: 'island',
      title: w.island,
      hint: `Qua ${w.island}`,
      earned: islandPassed(w.week, data),
      week: w.week,
    });
  }
  for (const lv of LEVELS) {
    const wk = lv.weeks[1];
    out.push({
      id: `medal-${lv.level}`,
      kind: 'medal',
      title: `Huy chương Cấp ${lv.level}`,
      hint: `Lên sân khấu tuần ${wk}`,
      earned: medalEarned(lv.level, wk, data),
      week: wk,
      level: lv.level,
    });
  }
  const mastered = masteredSongs(data);
  const songs = mastered.length;
  for (const n of SONG_MILESTONES) {
    out.push({
      id: `songs-${n}`,
      kind: 'songs',
      title: n === 1 ? 'Bài đầu tiên' : `${n} bài hát`,
      hint: n === 1 ? 'Thuộc 1 bài hát' : `Thuộc ${n} bài hát`,
      earned: songs >= n,
      n,
    });
  }
  const weeks = busyWeeks(data);
  for (const n of BUSY_WEEK_MILESTONES) {
    out.push({
      id: `week-${n}`,
      kind: 'week',
      title: n === 1 ? 'Tuần chăm chỉ' : `${n} tuần chăm chỉ`,
      hint: n === 1 ? `Học ${BUSY_WEEK_DAYS} ngày trong một tuần` : `${n} tuần, mỗi tuần học ${BUSY_WEEK_DAYS} ngày`,
      earned: weeks >= n,
      n,
    });
  }
  // Sticker chuỗi ngày cũ: chỉ hiện nếu bé ĐÃ nhận (trước ngày đổi) — không mất, không còn mốc mới
  const streak = bestStreak(data, STREAK_RETIRED_AFTER);
  for (const n of STREAK_MILESTONES) {
    if (streak < n) continue;
    out.push({ id: `streak-${n}`, kind: 'streak', title: `${n} ngày liền`, hint: `Học ${n} ngày liền nhau`, earned: true, n });
  }
  out.push({
    id: 'folk',
    kind: 'folk',
    title: 'Dân ca',
    hint: 'Thuộc một bài dân ca',
    earned: FOLK_SONG_IDS.some((id) => mastered.includes(id)),
  });
  out.push({
    id: 'mic-perfect',
    kind: 'mic',
    title: 'Đàn chuẩn',
    hint: 'Đàn trọn bài, micro nghe đúng hết',
    earned: micPerfectRun(data),
  });
  out.push({
    id: 'dyn-loud-soft',
    kind: 'dynamics',
    title: 'To và nhỏ',
    hint: 'Chơi xong trò To hay nhỏ',
    earned: dynamicsDone(data, 'loud-soft'),
    mode: 'loud-soft',
  });
  out.push({
    id: 'dyn-stac-leg',
    kind: 'dynamics',
    title: 'Ngắt và liền',
    hint: 'Chơi xong trò Ngắt hay liền',
    earned: dynamicsDone(data, 'stac-leg'),
    mode: 'stac-leg',
  });
  return out;
}

export function earnedStickerIds(data: Readonly<AppData>): string[] {
  return allStickers(data)
    .filter((s) => s.earned)
    .map((s) => s.id);
}

/** Sticker vừa nhận: có trong `after` (đã nhận) nhưng không có trong danh sách id `before`. */
export function newStickers(before: readonly string[], data: Readonly<AppData>): Sticker[] {
  const had = new Set(before);
  return allStickers(data).filter((s) => s.earned && !had.has(s.id));
}
