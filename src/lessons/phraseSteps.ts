/**
 * (2026-10-15, OWNER duyệt — rà soát của thầy giáo nhiều kinh nghiệm) "TỪNG CÂU RỒI CẢ BÀI":
 * lượt THEO NHỊP ĐẦU TIÊN của một bài mới (tuần ≥ PHRASE_STEPS_FROM_WEEK) đi theo thứ tự
 *   Câu 1 theo nhịp → Câu 2 theo nhịp → Cả bài (hoạt động gốc, giữ nguyên lời dẫn / mức / cờ).
 * Hai bước câu dùng chính tuỳ chọn `phrase` của hoạt động bài hát (lượt một câu không tính tiêu chí tuần — như tập câu khó),
 * luôn ở Mức 2 (con trỏ nhảy — băng chuyền chỉ ở lượt cả bài), cùng gợi ý với lượt cả bài.
 *
 * Áp dụng khi (đều là dữ liệu — xem `phraseStepsFor`):
 *  · tuần ≥ 6 (tuần 1–5 CHỈ THÊM VÀO CUỐI bài — bé đang ở tuần 4 có tiến độ "<bài>#<i>" đã lưu; không chèn bước),
 *  · đây là lượt theo nhịp ĐẦU TIÊN của bài trong giáo trình (thứ tự tuần → bài → hoạt động),
 *  · bài là BẢN NHẠC ≥ PHRASE_STEPS_MIN_MEASURES ô và ≥ 2 câu (không phải gam / rải / Alberti / bài tập ex_*),
 *  · bài học CHƯA tập tách tay / một câu của bài đó (bài Cấp 3–4 đã tập câu khó từng tay — chính là tập từng câu),
 *  · bài học không có trò SẮC THÁI (OWNER 2026-10-05: bài có trò sắc thái ≤ 3 hoạt động — tests/lessons.test.ts),
 *  · bài học không nằm trong PHRASE_STEPS_SKIP (buổi đã đầy: thêm 2 bước sẽ quá 7 màn hoặc quá 12 phút).
 * Áp MỘT chỗ: curriculum.ts (WEEKS = withPhraseSteps(dữ liệu gốc)) — mã bài giữ nguyên; tuần ≥ 6 chưa có tiến độ đã lưu.
 */
import { findTune } from '../music/exercises';
import { measureCount, phraseRanges } from '../music/tune';
import type { Activity, Lesson, WeekPlan } from './types';

export const PHRASE_STEPS_FROM_WEEK = 6;
export const PHRASE_STEPS_MIN_MEASURES = 8;

/**
 * Bài học KHÔNG thêm bước "từng câu" vì buổi đã đầy (đo bằng sessionEstimate + giới hạn 7 màn — tests/curriculum-teacher-2026-10-15
 * kiểm tra rằng mỗi mã ở đây quả thật sẽ vượt giới hạn nếu thêm). Ở các bài này bé vẫn có chip "Câu 1 / Câu 2" trên màn bài hát.
 */
export const PHRASE_STEPS_SKIP: ReadonlySet<string> = new Set([
  'w8-l4', // Cầu London + Ngôi sao (băng chuyền) — 6 hoạt động / 13,7'
  'w11-l4', // Nhịp 3 + Valse đu quay + thẻ nhạc lý — 6 hoạt động
  'w12-l3', // Bài ca niềm vui hai tay + ứng tấu — 12,1'
  'w14-l3', // hai bài thế Sol trong một buổi — 8 hoạt động
  'w22-l3', 'w22-l4', 'w23-l3', 'w25-l1', 'w25-ninja', 'w28-l2', 'w37-l2', 'w38-l3', 'w39-l1', 'w42-l2',
]);

const EXERCISE = /^(scale_|arpeggio_|alberti_|ex_)/;

type SongActivity = Extract<Activity, { kind: 'song' }>;

/** Hai bước "Câu 1", "Câu 2" (theo nhịp, Mức 2) trước lượt cả bài `whole`; [] nếu bài không đủ câu. */
export function phraseStepsFor(whole: SongActivity): SongActivity[] {
  const t = findTune(whole.songId);
  if (!t || EXERCISE.test(whole.songId) || measureCount(t) < PHRASE_STEPS_MIN_MEASURES) return [];
  const pr = phraseRanges(t);
  if (pr.length < 2) return [];
  const step = (k: 0 | 1): SongActivity => ({
    kind: 'song',
    songId: whole.songId,
    mode: 'tempo',
    level: 2,
    hints: whole.hints,
    phrase: [pr[k][0], pr[k][1]],
    intro: k === 0 ? 'Từng câu một: Câu 1 theo nhịp — chậm mà đều nhé!' : 'Giờ Câu 2 theo nhịp. Xong là ghép cả bài!',
  });
  return [step(0), step(1)];
}

/** Lượt theo nhịp ĐẦU TIÊN của mỗi bài trong giáo trình: "mã bài#chỉ số hoạt động" (tính trên dữ liệu GỐC, chưa thêm bước). */
function firstTempoKeys(weeks: readonly WeekPlan[], seen: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const w of weeks)
    for (const l of w.lessons)
      l.activities.forEach((a, i) => {
        if (a.kind !== 'song' || a.mode !== 'tempo') return;
        if (!seen.has(a.songId) && !a.phrase && !a.hand) out.add(`${l.id}#${i}`);
        seen.add(a.songId);
      });
  return out;
}

/** Bài học (gốc) có nên thêm bước "từng câu" trước hoạt động `i` không (bỏ qua giới hạn buổi — xem PHRASE_STEPS_SKIP). */
function wants(l: Lesson, i: number, first: Set<string>): SongActivity[] {
  const a = l.activities[i];
  if (a.kind !== 'song' || l.week < PHRASE_STEPS_FROM_WEEK || !first.has(`${l.id}#${i}`)) return [];
  if (l.activities.some((b) => b.kind === 'dynamics' || (b.kind === 'song' && b.songId === a.songId && (b.hand || b.phrase)))) return [];
  return phraseStepsFor(a);
}

/** Bài học sau khi thêm bước "từng câu" (không lọc PHRASE_STEPS_SKIP) — dùng cho test giới hạn buổi. */
export function lessonWithPhraseSteps(l: Lesson, first: Set<string>): Lesson {
  const acts = l.activities.flatMap((a, i) => [...wants(l, i, first), a]);
  return acts.length === l.activities.length ? l : { ...l, activities: acts };
}

/** Áp "từng câu rồi cả bài" cho CẢ giáo trình (tuần < 6 và bài trong PHRASE_STEPS_SKIP giữ nguyên; tuần không đổi giữ nguyên đối tượng). */
export function withPhraseSteps(weeks: readonly WeekPlan[]): WeekPlan[] {
  const first = firstTempoKeys(weeks, new Set());
  return weeks.map((w) => {
    const lessons = w.lessons.map((l) => (PHRASE_STEPS_SKIP.has(l.id) ? l : lessonWithPhraseSteps(l, first)));
    return lessons.every((l, i) => l === w.lessons[i]) ? w : { ...w, lessons };
  });
}

/** Mã "bài#i" của lượt theo nhịp đầu tiên của mỗi bài trong danh sách tuần (cho test). */
export function firstTempoActivities(weeks: readonly WeekPlan[]): Set<string> {
  return firstTempoKeys(weeks, new Set());
}
