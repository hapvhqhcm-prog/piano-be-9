/**
 * (+ 2026-10-15, rà soát của giáo viên) "📝 BÀI TẬP VỀ NHÀ": chỗ thầy dặn luyện ở buổi gần nhất — một dòng cho BỐ MẸ,
 * vd "Câu 2 “Ếch con nhảy” — chậm 40, 3 lần đúng liền".
 * - Giao: màn kết quả bài hát (songResult) khi lượt chưa đạt / thầy chỉ ra một chỗ cần luyện → settings.homework.
 * - Hiện: màn kết của buổi (rating.closingScreen), ĐẦU buổi sau (khởi động mời tập bài này trước — có "Bỏ qua"),
 *   báo cáo tuần (progress/weeklyReport.ts).
 * - Xong: một lượt ĐẠT của đúng bài đó (cả bài, hoặc câu chứa chỗ dặn) sau lúc giao → xóa.
 * Hàm thuần (trừ kiểu Settings) — có test (tests/teacherStrict.test.ts).
 */
import type { Settings, SongRun } from '../progress/schema';
import { slowerBpm } from '../music/teacher';
import { START_SLOW_HARD_BPM } from './songStats';

export interface Homework {
  songId: string;
  /** Tên bài (hiện cho bố mẹ) */
  title: string;
  /** Chỗ luyện [ô đầu, ô cuối) tính theo CẢ BÀI; null = cả bài */
  phrase: [number, number] | null;
  /** "Câu 2" / "Ô 5–6" / "Cả bài" */
  place: string;
  mode: 'wait' | 'tempo';
  /** Tốc độ tập (đã hạ một nấc, không dưới 40 — trừ bài vốn chậm hơn) */
  bpm: number;
  /** Ngày giao (YYYY-MM-DD) */
  date: string;
  /** Lúc giao (ms) */
  at: number;
  /** Dòng cho bố mẹ */
  text: string;
  /**
   * (+ 2026-10-17, rà soát kỹ sư trưởng) Lúc GIAO LẦN ĐẦU (ms) / ngày giao lần đầu của bài tập này (cùng bài) — giao lại sau
   * một lượt chưa đạt đổi chỗ / chữ / `date` / `at` nhưng KHÔNG đổi mốc này → hạn bài tập không bị kéo dài mãi.
   * Không có (dữ liệu cũ) = `at` / `date`.
   */
  since?: number;
  sinceDate?: string;
  /** (+ 2026-10-17) Số lượt CHƯA ĐẠT của bài này kể từ lúc giao lần đầu (giới hạn HOMEWORK_MAX_FAILS). Không có = 0. */
  fails?: number;
}

/**
 * (+ 2026-10-17) Lời nhắn cho BỐ MẸ khi bài tập về nhà bị TẠM DỪNG vì bé đã thử quá HOMEWORK_TRY_DAYS ngày / HOMEWORK_MAX_FAILS
 * lượt chưa được (settings.homeworkNote). Trong HOMEWORK_TRY_DAYS ngày sau đó không giao lại bài tập cho đúng bài này.
 */
export interface HomeworkNote {
  songId: string;
  title: string;
  /** Ngày tạm dừng (YYYY-MM-DD) */
  date: string;
  text: string;
}

/** Số lượt đúng liền bố mẹ cho bé tập (như "🔁 Lặp 3 lần đúng") */
export const HOMEWORK_STREAK = 3;

/** Tốc độ tập ở nhà: chậm hơn một nấc so với lượt vừa chơi, không dưới 40 (bài vốn ≤ 40 giữ nguyên). */
export function homeworkBpm(bpm: number): number {
  if (bpm <= START_SLOW_HARD_BPM) return bpm;
  return Math.max(START_SLOW_HARD_BPM, slowerBpm(bpm));
}

export function homeworkText(h: Pick<Homework, 'title' | 'place' | 'mode' | 'bpm'>): string {
  const how = h.mode === 'tempo' ? `chậm ${h.bpm}` : 'từng nốt thật chậm';
  return `${h.place} “${h.title}” — ${how}, ${HOMEWORK_STREAK} lần đúng liền`;
}

export function makeHomework(p: Omit<Homework, 'text' | 'bpm'> & { bpm: number }): Homework {
  const bpm = p.mode === 'tempo' ? homeworkBpm(p.bpm) : p.bpm;
  const hw = { ...p, bpm };
  return { ...hw, text: homeworkText(hw) };
}

const isRange = (x: unknown): x is [number, number] =>
  Array.isArray(x) && x.length === 2 && x.every((v) => Number.isInteger(v) && v >= 0) && x[0] < x[1];

/** Đọc MỀM settings.homework: mục hỏng / thiếu → null. */
export function readHomework(settings: Readonly<Settings> | undefined): Homework | null {
  const h = (settings as { homework?: unknown } | undefined)?.homework as Partial<Homework> | null | undefined;
  if (!h || typeof h !== 'object') return null;
  if (typeof h.songId !== 'string' || typeof h.title !== 'string' || typeof h.place !== 'string' || typeof h.text !== 'string') return null;
  if (h.mode !== 'wait' && h.mode !== 'tempo') return null;
  if (typeof h.bpm !== 'number' || !(h.bpm > 0) || typeof h.date !== 'string' || typeof h.at !== 'number') return null;
  if (h.phrase !== null && !isRange(h.phrase)) return null;
  if (h.since !== undefined && typeof h.since !== 'number') return null;
  if (h.sinceDate !== undefined && typeof h.sinceDate !== 'string') return null;
  if (h.fails !== undefined && !(Number.isInteger(h.fails) && h.fails >= 0)) return null;
  return h as Homework;
}

/** Mốc GIAO LẦN ĐẦU của bài tập (dữ liệu cũ: lúc giao). */
export const homeworkSince = (h: Pick<Homework, 'at' | 'date' | 'since' | 'sinceDate'>): { at: number; date: string } => ({
  at: h.since ?? h.at,
  date: h.sinceDate ?? h.date,
});

/** Số ngày lịch giữa hai ngày "YYYY-MM-DD" (b − a). */
export function dayDiff(a: string, b: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((p(b) - p(a)) / 86_400_000);
}

/** (+ 2026-10-17) Một bài tập về nhà chỉ "sống" ngần này NGÀY kể từ lúc giao lần đầu (ngày giao + 3 ngày sau). */
export const HOMEWORK_TRY_DAYS = 3;
/** (+ 2026-10-17) … và tối đa ngần này lượt chưa đạt của bài đó (giao lại mỗi lượt chưa đạt). */
export const HOMEWORK_MAX_FAILS = 5;

/** Bài tập đã HẾT HẠN: quá HOMEWORK_TRY_DAYS ngày từ lúc giao lần đầu, quá HOMEWORK_MAX_FAILS lượt chưa đạt, hoặc quá HOMEWORK_MAX_DAYS. */
export function homeworkExpired(h: Homework, today: string, now: number = Date.now()): boolean {
  const s = homeworkSince(h);
  return (h.fails ?? 0) >= HOMEWORK_MAX_FAILS || dayDiff(s.date, today) > HOMEWORK_TRY_DAYS || now - s.at > HOMEWORK_MAX_DAYS * 86_400_000;
}

/** Đọc MỀM settings.homeworkNote. */
export function readHomeworkNote(settings: Readonly<Settings> | undefined): HomeworkNote | null {
  const n = (settings as { homeworkNote?: unknown } | undefined)?.homeworkNote as Partial<HomeworkNote> | null | undefined;
  if (!n || typeof n !== 'object') return null;
  if (typeof n.songId !== 'string' || typeof n.title !== 'string' || typeof n.date !== 'string' || typeof n.text !== 'string') return null;
  return n as HomeworkNote;
}

export const homeworkNoteText = (title: string): string =>
  `Bài tập “${title}” tạm dừng — con đã cố gắng nhiều lần rồi. Bố mẹ đừng ép thêm; thầy sẽ ôn chỗ này nhẹ nhàng ở các buổi sau.`;

/**
 * (+ 2026-10-17, rà soát kỹ sư trưởng) GIAO / GIAO LẠI bài tập sau một lượt của buổi học (songResult). Hàm thuần.
 * - Cùng bài với bài tập đang có: giữ mốc giao lần đầu (since / sinceDate), cộng một lượt chưa đạt (`failed`); hết hạn
 *   (homeworkExpired) → TẠM DỪNG: bỏ bài tập + lời nhắn cho bố mẹ (HomeworkNote).
 * - Bài khác: bài tập MỚI (mốc mới) — trừ khi bài đó vừa bị tạm dừng trong HOMEWORK_TRY_DAYS ngày (không giao lại ngay).
 * Trả về giá trị mới cho settings.homework / settings.homeworkNote (undefined = không đổi).
 */
export function reassignHomework(
  cur: Homework | null,
  note: HomeworkNote | null,
  next: Homework,
  o: { today: string; now: number; failed: boolean },
): { homework?: Homework | null; homeworkNote?: HomeworkNote | null } {
  if (cur && cur.songId === next.songId) {
    const s = homeworkSince(cur);
    const merged: Homework = { ...next, since: s.at, sinceDate: s.date, fails: (cur.fails ?? 0) + (o.failed ? 1 : 0) };
    if (homeworkExpired(merged, o.today, o.now)) {
      return { homework: null, homeworkNote: { songId: next.songId, title: next.title, date: o.today, text: homeworkNoteText(next.title) } };
    }
    return { homework: merged };
  }
  if (note && note.songId === next.songId && dayDiff(note.date, o.today) <= HOMEWORK_TRY_DAYS) return {};
  return { homework: { ...next, since: next.at, sinceDate: next.date, fails: 0 } };
}

/** Bài tập quá ngần này ngày không mời nữa (bé đã sang bài khác — tránh mời mãi một chỗ cũ). */
export const HOMEWORK_MAX_DAYS = 14;

/** Bài tập giao từ một NGÀY TRƯỚC, chưa quá HOMEWORK_MAX_DAYS (đầu buổi hôm nay mời tập trước) — null = không có. */
export function pendingHomework(settings: Readonly<Settings> | undefined, today: string, now: number = Date.now()): Homework | null {
  const h = readHomework(settings);
  // (+ 2026-10-17) hạn tính từ lúc giao LẦN ĐẦU (homeworkExpired) — giao lại không kéo dài hạn
  return h && h.date < today && !homeworkExpired(h, today, now) ? h : null;
}

/** Lượt `run` (ghi lúc `ts`) đã làm xong bài tập: đúng bài, ĐẠT, sau lúc giao; cả bài, hoặc câu chứa chỗ dặn. */
export function homeworkDone(h: Homework, run: Pick<SongRun, 'songId' | 'passed' | 'phrase' | 'hand'>, ts: number): boolean {
  if (run.songId !== h.songId || !run.passed || run.hand || ts < h.at) return false;
  if (!run.phrase) return true;
  return !!h.phrase && run.phrase[0] <= h.phrase[0] && run.phrase[1] >= h.phrase[1];
}
