/**
 * (+ 2026-10-25, OWNER duyệt — bé: "Dạy piano quá dễ") 🧭 Kiểm tra xếp lớp (lessons/placement.ts): mốc khó dần, dừng ở mốc đầu
 * chưa qua, chỉ nhảy tới, tuần nhảy qua = 'placedOut' (qua cho tiến độ, không sticker đảo / huy chương), dữ liệu bé thật tuần 4 → 9.
 */
import { describe, expect, it } from 'vitest';
import { MAX_WEEK, criterionProgress, nextLesson, weekComplete, weekPassed, weekPlan } from '../src/lessons/lessonEngine';
import {
  PLACEMENT_MARKS,
  PLACEMENT_MAX_MARKS,
  applyPlacement,
  markPassed,
  placementLessonId,
  placementMarks,
  placementOffer,
  placementTarget,
} from '../src/lessons/placement';
import { difficulty } from '../src/lessons/adaptive';
import { placedOut, skipOf, skippedWeeks } from '../src/lessons/weekSkips';
import { allStickers, islandPassed } from '../src/lessons/stickers';
import { sessionKind } from '../src/lessons/sessionKind';
import { compactData } from '../src/progress/compaction';
import { buildWeeklySummary, weeklyText } from '../src/progress/weeklyReport';
import { localDateStr, validateAppData, type Session } from '../src/progress/schema';
import { findTune } from '../src/music/exercises';
import { fixtureWeek4Child } from './fixtures/week4Child';

const NOW = new Date(2026, 9, 25, 17);
const T = NOW.getTime();
const TODAY = localDateStr(NOW);

const blank = (): Session => ({
  id: 'pl',
  date: TODAY,
  lessonId: placementLessonId(TODAY),
  parentAssessments: [],
  appAssessments: [],
  micAssessments: [],
  songRuns: [],
  selfRating: null,
  startedAt: T,
  endedAt: T,
  minutes: 8,
  completed: true,
  checklist: {},
});

describe('🧭 Kiểm tra xếp lớp — mốc & gợi ý', () => {
  it('mốc tăng dần, mỗi mốc có bài / trò tiêu chí, tối đa PLACEMENT_MAX_MARKS từ tuần hiện tại', () => {
    expect([...PLACEMENT_MARKS].sort((a, b) => a - b)).toEqual(PLACEMENT_MARKS);
    const m = placementMarks(4);
    expect(m.length).toBe(PLACEMENT_MAX_MARKS);
    expect(m[0].week).toBe(4);
    for (const x of m) {
      expect(x.plan.steps.length).toBeGreaterThan(0);
      expect(x.plan.steps.some((s) => s.kind === 'quiz' && s.concept)).toBe(false);
      for (const s of x.plan.steps) if (s.kind === 'song') expect(findTune(s.songId)).toBeTruthy();
    }
    expect(placementMarks(9)[0].week).toBe(9);
    expect(placementMarks(MAX_WEEK)).toEqual([]);
  });
  it('chỉ nhảy TỚI: không qua mốc nào → tuần hiện tại; qua 4–8 → tuần 9', () => {
    expect(placementTarget(4, [])).toBe(4);
    expect(placementTarget(4, [4, 5, 6, 8])).toBe(9);
    expect(placementTarget(12, [4])).toBe(12);
    expect(placementTarget(40, [31, 99])).toBe(MAX_WEEK);
  });
  it('mốc đạt khi micro chấm đạt / bé tự xác nhận lúc micro tắt; chưa đạt khi micro chấm trượt', () => {
    const mark = placementMarks(5)[0];
    expect(mark.week).toBe(5);
    const song = mark.plan.steps.find((s) => s.kind === 'song')!;
    expect(markPassed(mark, blank(), [])).toBe(false);
    // chưa đàn lượt nào → tự xác nhận không tính
    expect(markPassed(mark, blank(), [song.key])).toBe(false);
    const off = blank();
    off.songRuns.push({ songId: 'frog_hop', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 10, hits: 0, source: 'parent', passed: false, ts: T });
    expect(markPassed(mark, off, [song.key])).toBe(true);
    const s = blank();
    s.songRuns.push({ songId: 'frog_hop', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 10, hits: 3, source: 'mic', passed: false, ts: T });
    expect(markPassed(mark, s, [song.key])).toBe(false);
  });
  it('buổi kiểm tra là buổi tùy chọn (không vào chỉ số độ khó / không theo tuần)', () => {
    expect(sessionKind(placementLessonId(TODAY))).toBe('check');
  });
});

describe('🧭 Kiểm tra xếp lớp — bé thật tuần 4 nhảy tới tuần 9', () => {
  const jumped = () => {
    const d = fixtureWeek4Child(NOW);
    const n = applyPlacement(d, 9, T, TODAY);
    return { d, n };
  };
  it('currentWeek 9; tuần 4–8 placedOut; qua & xong; bài "Học tiếp" = bài đầu tuần 9', () => {
    const { d, n } = jumped();
    expect(n).toBe(5);
    expect(d.progress.currentWeek).toBe(9);
    expect(skippedWeeks(d, 'placedOut')).toEqual([4, 5, 6, 7, 8]);
    for (let w = 4; w <= 8; w++) {
      expect(weekPassed(w, d)).toBe(true);
      expect(weekComplete(w, d)).toBe(true);
    }
    expect(criterionProgress(9, d)?.days).toBe(0);
    expect(nextLesson(d).id).toBe(weekPlan(9).lessons[0].id);
    expect(d.progress.placement).toEqual({ date: TODAY, at: T, from: 4, to: 9 });
    expect(validateAppData(JSON.parse(JSON.stringify(d)))).toEqual([]);
  });
  it('tuần ĐÃ qua bằng bằng chứng không bị ghi đè; tuần 1–3 không đụng tới', () => {
    const { d } = jumped();
    for (const w of [1, 2, 3]) expect(skipOf(d, w)).toBeNull();
  });
  it('không sticker đảo của tuần nhảy qua (bản đồ vẫn sáng); không huy chương', () => {
    const d = fixtureWeek4Child(NOW);
    const before = new Set(allStickers(d).filter((s) => s.earned).map((s) => s.id));
    applyPlacement(d, 12, T, TODAY);
    const after = allStickers(d).filter((s) => s.earned && !before.has(s.id)).map((s) => s.id);
    expect(after.filter((id) => id.startsWith('island-') || id.startsWith('medal-'))).toEqual([]);
    expect(islandPassed(6, d)).toBe(true);
    expect(placedOut(d, 10)).toBe(true);
  });
  it('không bao giờ lùi tuần', () => {
    const d = fixtureWeek4Child(NOW);
    d.progress.currentWeek = 12;
    expect(applyPlacement(d, 9, T, TODAY)).toBe(0);
    expect(d.progress.currentWeek).toBe(12);
    expect(skippedWeeks(d)).toEqual([]);
  });
  it('gộp lịch sử: bản ghi còn, tuần vẫn qua, lịch sử nhất quán', () => {
    const d = fixtureWeek4Child(new Date(2026, 6, 1));
    applyPlacement(d, 9, T, TODAY);
    compactData(d, NOW);
    expect(d.sessions.length).toBe(0);
    for (let w = 4; w <= 8; w++) expect(weekPassed(w, d)).toBe(true);
    for (let w = 4; w <= 8; w++) expect(d.history?.passedWeeks.includes(w)).toBe(false);
    expect(nextLesson(d).id).toBe(weekPlan(9).lessons[0].id);
  });
  it('báo cáo tuần nhắc kiểm tra xếp lớp', () => {
    const { d } = jumped();
    const text = weeklyText(buildWeeklySummary(d, TODAY, NOW));
    expect(text).toMatch(/xếp lớp/i);
  });
});

describe('🧭 Mời kiểm tra (một lần)', () => {
  const perfectSessions = (n: number): Session[] =>
    Array.from({ length: n }, (_, i) => ({
      ...blank(),
      id: `p${i}`,
      lessonId: 'w4-l1',
      startedAt: T - (n - i) * 86_400_000,
      date: localDateStr(new Date(T - (n - i) * 86_400_000)),
      songRuns: [{ songId: 'hot_cross_buns', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 10, hits: 10, source: 'mic', passed: true, ts: T - (n - i) * 86_400_000 }],
    }));
  it('các buổi gần đây gần như hoàn hảo → mời; đã làm / đã từ chối → không', () => {
    const d = fixtureWeek4Child(NOW);
    d.sessions.push(...perfectSessions(5));
    expect(placementOffer(d, NOW)).toBe(true);
    d.settings.placementDismissed = TODAY;
    expect(placementOffer(d, NOW)).toBe(false);
    delete d.settings.placementDismissed;
    applyPlacement(d, 4, T, TODAY);
    expect(placementOffer(d, NOW)).toBe(false);
  });
  it('bé thật (có lượt trượt) → không mời khi chưa ở chế độ thử thách', () => {
    const d = fixtureWeek4Child(NOW);
    expect(placementOffer(d, NOW)).toBe(difficulty(d, NOW).mode === 'stretch');
  });
});
