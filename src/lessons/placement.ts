/**
 * (+ 2026-10-25, OWNER duyệt — bé: "Dạy piano quá dễ") 🧭 KIỂM TRA XẾP LỚP (5–10 phút): BÉ tự bắt đầu (màn chính — mời MỘT lần
 * khi các buổi gần đây gần như hoàn hảo; luôn có trong 📋 Xem các bài), KHÔNG cần bố mẹ (OWNER 2026-10-25).
 * Chuỗi kiểm tra ngắn, KHÓ DẦN theo các mốc tuần (đọc nốt, giữ nhịp, bài một tay theo nhịp, khóa Fa, hai tay cùng lúc, thế Sol,
 * chấm dôi, gam, hợp âm…) — mỗi mốc = các bài / trò TIÊU CHÍ của tuần đó (lessons/testOut.ts testOutPlan, bỏ câu đố phụ),
 * dừng ở mốc ĐẦU TIÊN bé chưa làm được. Gợi ý tuần = tuần ngay sau mốc cao nhất đã qua; chỉ NHẢY TỚI (không bao giờ lùi);
 * áp dụng NGAY (không hỏi bố mẹ) + mừng cập bến.
 * Các tuần nhảy qua: progress.skips = 'placedOut' (qua cho tiến độ — weekPassed / weekComplete; KHÔNG sticker đảo / huy chương;
 * bài của tuần đó vẫn mở trong Thư viện vì Thư viện mở theo tuần hiện tại). Buổi kiểm tra: mã `placement-<ngày>` (lessons/
 * sessionKind 'check' — buổi tùy chọn: không vào chỉ số độ khó / "đã thuộc").
 * An toàn: "Tìm Đô giữa" / thẻ tư thế vẫn hiện ở bài đầu tuần mới như thường (sessionPlan — không bỏ cổng nào).
 * Module THUẦN (tests/placement-2026-10-25.test.ts). Màn: ui/screens/placement.ts (nạp trễ).
 */
import type { AppData, Session } from '../progress/schema';
import { MAX_WEEK, weekPlan } from './curriculum';
import { difficulty, scoreSession, successIndex } from './adaptive';
import { countsForDifficulty, PLACEMENT_LESSON_PREFIX } from './sessionKind';
import { gradeTestOut, testOutPlan, type TestOutPlan, type TestStep } from './testOut';
import { weekPassed } from './weekCriteria';
import { addSkips } from './weekSkips';

/**
 * Các MỐC kiểm tra (tuần mà tiêu chí là một kỹ năng mới rõ ràng). Qua mốc W = làm được kỹ năng tới hết tuần W.
 * 4 giữ nhịp · 5 bài theo nhịp · 6 tốc độ 60 · 8 chỉ nhìn khuông · 9 nhịp 2/4 tay phải · 12 hai tay cùng lúc · 14 thế Sol ·
 * 17 chấm dôi · 20 gam hai tay · 22 hai tay hợp âm · 24 bài biểu diễn ≥ 50 · 29 hai tay nhanh · 31 Für Elise.
 */
export const PLACEMENT_MARKS: readonly number[] = [4, 5, 6, 8, 9, 12, 14, 17, 20, 22, 24, 29, 31];
/** Tối đa ngần này mốc mỗi lần kiểm tra (≈ 5–10 phút). */
export const PLACEMENT_MAX_MARKS = 6;

export interface PlacementMark {
  week: number;
  plan: TestOutPlan;
}

/** Kế hoạch: các mốc từ tuần hiện tại trở đi (tối đa PLACEMENT_MAX_MARKS), mỗi mốc chỉ gồm bài / trò TIÊU CHÍ (bỏ câu đố phụ). */
export function placementMarks(currentWeek: number): PlacementMark[] {
  return PLACEMENT_MARKS.filter((w) => w >= currentWeek && w < MAX_WEEK)
    .slice(0, PLACEMENT_MAX_MARKS)
    .map((week) => {
      const p = testOutPlan(week);
      const steps = p.steps.filter((s) => !(s.kind === 'quiz' && s.concept) && s.kind !== 'notes' && s.kind !== 'stage');
      return { week, plan: { ...p, steps } };
    })
    .filter((m) => m.plan.steps.length > 0);
}

/** Một mốc ĐẠT trong buổi kiểm tra (cùng cách chấm buổi thi vượt tuần, không câu đố phụ). */
export function markPassed(mark: PlacementMark, session: Session, selfOk: readonly string[]): boolean {
  return gradeTestOut(mark.plan, session, selfOk, null).passed;
}

/**
 * Tuần gợi ý sau kiểm tra: tuần ngay sau mốc cao nhất đã qua (các mốc phải qua LIÊN TIẾP từ đầu), không vượt MAX_WEEK, KHÔNG
 * BAO GIỜ thấp hơn tuần hiện tại. Không qua mốc nào → tuần hiện tại.
 */
export function placementTarget(currentWeek: number, passedMarks: readonly number[]): number {
  const top = passedMarks.length ? Math.max(...passedMarks) : 0;
  return Math.max(currentWeek, Math.min(MAX_WEEK, top + 1));
}

/** Mã buổi kiểm tra. */
export const placementLessonId = (date: string): string => `${PLACEMENT_LESSON_PREFIX}${date}`;

/**
 * Áp dụng kết quả (SỬA TẠI CHỖ): nhảy currentWeek tới `target` (chỉ khi lớn hơn), ghi 'placedOut' cho các tuần từ tuần hiện tại
 * tới target − 1 CHƯA đạt bằng chứng (tuần đã đạt / đã thi vượt giữ nguyên), ghi progress.placement. Trả về số tuần nhảy qua.
 */
export function applyPlacement(data: AppData, target: number, at: number, date: string): number {
  const from = data.progress.currentWeek;
  const to = Math.min(MAX_WEEK, Math.max(from, target));
  const skip: number[] = [];
  for (let w = from; w < to; w++) if (!weekPassed(w, data)) skip.push(w);
  addSkips(data, skip, 'placedOut', at, date);
  data.progress.currentWeek = to;
  data.progress.placement = { date, at, from, to };
  return to - from;
}

/* ---------- Mời kiểm tra (một lần) ---------- */

/** Số buổi bài học gần nhất (có dữ liệu chấm) xét để mời. */
export const OFFER_WINDOW = 5;
/** Chỉ số thành công tối thiểu trên OFFER_WINDOW buổi để mời ("gần như hoàn hảo"). */
export const OFFER_ABOVE = 0.9;

/**
 * Mời kiểm tra xếp lớp ở màn chính: chưa làm lần nào, chưa từ chối, không ở tuần cuối, và OFFER_WINDOW buổi gần nhất (bỏ buổi
 * tùy chọn) có chỉ số thành công ≥ OFFER_ABOVE, không buổi nào "dừng nhẹ nhàng" — hoặc chế độ độ khó đang 'stretch'.
 */
export function placementOffer(data: Readonly<AppData>, now: number | Date = Date.now()): boolean {
  if (data.progress.placement) return false;
  if ((data.settings as { placementDismissed?: unknown }).placementDismissed) return false;
  if (data.progress.currentWeek >= MAX_WEEK - 1) return false;
  const scores = data.sessions
    .filter((s) => s.completed && countsForDifficulty(s.lessonId))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map(scoreSession)
    .filter((sc) => sc.mic[1] + sc.runs[1] + sc.quiz[1] + sc.parent[1] > 0)
    .slice(-OFFER_WINDOW);
  if (scores.length >= OFFER_WINDOW && !scores.some((s) => s.kindStop) && (successIndex(scores) ?? 0) >= OFFER_ABOVE) return true;
  return difficulty(data, now).mode === 'stretch';
}

/** Lời ngắn cho bé về một mốc ("Mức 3 · Đảo …"). */
export function markTitle(mark: PlacementMark, k: number): string {
  const p = weekPlan(mark.week);
  return `Mức ${k + 1} · ${p.islandEmoji} ${p.island}`;
}

export type { TestStep };
