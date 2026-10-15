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
  return h as Homework;
}

/** Bài tập quá ngần này ngày không mời nữa (bé đã sang bài khác — tránh mời mãi một chỗ cũ). */
export const HOMEWORK_MAX_DAYS = 14;

/** Bài tập giao từ một NGÀY TRƯỚC, chưa quá HOMEWORK_MAX_DAYS (đầu buổi hôm nay mời tập trước) — null = không có. */
export function pendingHomework(settings: Readonly<Settings> | undefined, today: string, now: number = Date.now()): Homework | null {
  const h = readHomework(settings);
  return h && h.date < today && now - h.at <= HOMEWORK_MAX_DAYS * 86_400_000 ? h : null;
}

/** Lượt `run` (ghi lúc `ts`) đã làm xong bài tập: đúng bài, ĐẠT, sau lúc giao; cả bài, hoặc câu chứa chỗ dặn. */
export function homeworkDone(h: Homework, run: Pick<SongRun, 'songId' | 'passed' | 'phrase' | 'hand'>, ts: number): boolean {
  if (run.songId !== h.songId || !run.passed || run.hand || ts < h.at) return false;
  if (!run.phrase) return true;
  return !!h.phrase && run.phrase[0] <= h.phrase[0] && run.phrase[1] >= h.phrase[1];
}
