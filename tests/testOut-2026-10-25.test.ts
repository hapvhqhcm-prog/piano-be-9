/**
 * (+ 2026-10-25, OWNER duyệt — bé: "Dạy piano quá dễ") ⚡ Thi vượt tuần (lessons/testOut.ts) + bản ghi cho qua (weekSkips.ts):
 * kế hoạch thi khớp tiêu chí của MỌI tuần, chấm một buổi, tự xác nhận khi micro không chấm được, chờ 1 ngày, an toàn tiến độ
 * (weekPassed / weekComplete / criterionProgress / gộp lịch sử / sticker / huy chương).
 */
import { describe, expect, it } from 'vitest';
import { MAX_WEEK, WEEKS, criterionProgress, nextLesson, weekComplete, weekPassed, weekPlan } from '../src/lessons/lessonEngine';
import { makeQuestion } from '../src/practice/quiz';
import { findTune } from '../src/music/exercises';
import {
  applyTestOutPass,
  gradeTestOut,
  noteTestOutFail,
  stepVerdict,
  testOutLessonId,
  testOutPlan,
  testOutStatus,
  type TestOutPlan,
} from '../src/lessons/testOut';
import { addSkips, placedOut, skipOf, skippedWeeks, withoutSkips } from '../src/lessons/weekSkips';
import { allStickers } from '../src/lessons/stickers';
import { compactData } from '../src/progress/compaction';
import { localDateStr, validateAppData, type AppData, type Session } from '../src/progress/schema';
import { fixtureWeek4Child } from './fixtures/week4Child';

const NOW = new Date(2026, 9, 25, 17);
const T = NOW.getTime();
const TODAY = localDateStr(NOW);

const blank = (week: number): Session => ({
  id: `t${week}`,
  date: TODAY,
  lessonId: testOutLessonId(week),
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

/** Buổi thi "bé làm đúng hết" (micro bật). */
function perfect(plan: TestOutPlan): Session {
  const s = blank(plan.week);
  let x = 7;
  const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  for (const st of plan.steps) {
    switch (st.kind) {
      case 'song': {
        const bpm = Math.max(st.bpm ?? 0, findTune(st.songId)?.bpm ?? 60);
        s.songRuns.push({ songId: st.songId, mode: st.mode, level: st.mode === 'tempo' ? 2 : undefined, bpm, hints: st.hints, phrase: null, total: 10, hits: 10, source: 'mic', passed: true, ts: T });
        break;
      }
      case 'quiz': {
        let prev;
        for (let k = 0; k < st.quiz.rounds; k++) {
          prev = makeQuestion(st.quiz, rng, prev);
          s.appAssessments.push({ expected: prev.expected, actual: prev.expected, correct: true, ts: T });
        }
        break;
      }
      case 'sight':
        for (let k = 0; k < st.count; k++)
          s.songRuns.push({ songId: `sight:${st.position}:${st.hand}`, mode: 'wait', bpm: 60, hints: st.hints, phrase: null, total: 10, hits: 10, source: 'mic', passed: true, ts: T });
        break;
      case 'notes':
        for (const t of st.segment.targets) s.parentAssessments.push({ note: t.noteId, result: 'correct', ts: T });
        break;
      case 'stage':
        s.parentAssessments.push({ note: 'medal', result: 'correct', ts: T });
        break;
    }
  }
  return s;
}

const conceptOf = (plan: TestOutPlan): [number, number] | null => {
  const c = plan.steps.find((s) => s.kind === 'quiz' && s.concept);
  return c && c.kind === 'quiz' ? [c.quiz.rounds, c.quiz.rounds] : null;
};

describe('⚡ Thi vượt tuần — kế hoạch khớp tiêu chí mọi tuần', () => {
  for (const w of WEEKS.map((x) => x.week)) {
    it(`tuần ${w}: buổi thi đúng hết → ĐẠT; buổi rỗng → CHƯA`, () => {
      const plan = testOutPlan(w);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(gradeTestOut(plan, perfect(plan), [], conceptOf(plan)).passed).toBe(true);
      const empty = gradeTestOut(plan, blank(w), [], null);
      expect(empty.passed).toBe(false);
      expect(empty.missing.length).toBeGreaterThan(0);
      // các bài trong kế hoạch có thật
      for (const st of plan.steps) if (st.kind === 'song') expect(findTune(st.songId), st.songId).toBeTruthy();
    });
  }

  it('tuần huy chương / tuần ôn: thi = biểu diễn', () => {
    for (const w of [10, 21, 33, 46]) expect(testOutPlan(w).steps.map((s) => s.kind)).toEqual(['stage']);
    expect(testOutPlan(10).perform).toBe(true);
    expect(WEEKS.filter((x) => x.criterionSpec?.spread).every((x) => testOutPlan(x.week).perform)).toBe(true);
  });

  it('tốc độ yêu cầu được mở sẵn (Bài ca niềm vui ♩60)', () => {
    const st = testOutPlan(6).steps.find((s) => s.kind === 'song');
    expect(st && st.kind === 'song' && st.bpm).toBe(60);
    // lượt chậm hơn tốc độ yêu cầu không đạt
    const s = blank(6);
    s.songRuns.push({ songId: 'ode_to_joy_easy', mode: 'tempo', level: 2, bpm: 50, hints: 'names', phrase: null, total: 10, hits: 10, source: 'mic', passed: true, ts: T });
    expect(gradeTestOut(testOutPlan(6), s, [], null).passed).toBe(false);
  });

  it('câu đố điều mới của tuần sai nhiều → chưa đạt (dù bài đạt)', () => {
    const plan = testOutPlan(5);
    expect(plan.steps.some((s) => s.kind === 'quiz' && s.concept)).toBe(true);
    const g = gradeTestOut(plan, perfect(plan), [], [1, 3]);
    expect(g.passed).toBe(false);
    expect(g.missing.some((m) => m.startsWith('Câu đố'))).toBe(true);
  });
});

describe('⚡ Thi vượt tuần — micro không chấm được → bé tự xác nhận', () => {
  it('micro tắt (lượt không micro): bước bài hát "unjudged"; tự xác nhận → đạt; chưa đàn lượt nào → "fail"', () => {
    const plan = testOutPlan(5);
    const s = blank(5);
    const song = plan.steps.find((x) => x.kind === 'song')!;
    expect(stepVerdict(song, s)).toBe('fail');
    s.songRuns.push({ songId: 'frog_hop', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 10, hits: 0, source: 'parent', passed: false, ts: T });
    expect(stepVerdict(song, s)).toBe('unjudged');
    expect(gradeTestOut(plan, s, [song.key], null).passed).toBe(true);
  });
  it('micro ĐÃ chấm chưa đạt → "fail" (tự xác nhận không thay được micro)', () => {
    const plan = testOutPlan(5);
    const s = blank(5);
    s.songRuns.push({ songId: 'frog_hop', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 10, hits: 4, source: 'mic', passed: false, ts: T });
    const song = plan.steps.find((x) => x.kind === 'song')!;
    expect(stepVerdict(song, s)).toBe('fail');
    expect(gradeTestOut(plan, s, [song.key], null).passed).toBe(false);
  });
  it('tuần chấm bằng trò đố: không tự xác nhận được (app tự chấm)', () => {
    const plan = testOutPlan(3);
    expect(gradeTestOut(plan, blank(3), plan.steps.map((s) => s.key), null).passed).toBe(false);
  });
  it('tự xác nhận KHÔNG ghi lượt giả vào buổi', () => {
    const plan = testOutPlan(5);
    const s = blank(5);
    s.songRuns.push({ songId: 'frog_hop', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 10, hits: 0, source: 'parent', passed: false, ts: T });
    gradeTestOut(plan, s, plan.steps.map((x) => x.key), null);
    expect(s.songRuns.length).toBe(1);
  });
});

describe('⚡ Thi vượt tuần — ghi kết quả & an toàn tiến độ (bé thật tuần 4)', () => {
  it('ĐẠT: testedOut + sang tuần 5; tuần 4 qua / xong; bài đầu tuần 5 là "Học tiếp"', () => {
    const d = fixtureWeek4Child(NOW);
    expect(d.progress.currentWeek).toBe(4);
    expect(weekPassed(4, d)).toBe(false);
    expect(testOutStatus(d, TODAY)).toEqual({ week: 4, why: 'ok' });
    expect(applyTestOutPass(d, 4, T, TODAY)).toBe(5);
    expect(skipOf(d, 4)?.kind).toBe('testedOut');
    expect(weekPassed(4, d) && weekComplete(4, d)).toBe(true);
    expect(criterionProgress(4, d)).toEqual({ days: 2, needDays: 2 });
    expect(nextLesson(d).id).toBe(weekPlan(5).lessons[0].id);
    expect(validateAppData(JSON.parse(JSON.stringify(d)))).toEqual([]);
    // sticker đảo tuần 4 có (thi vượt = qua đảo như thường)
    expect(allStickers(d).find((s) => s.id === 'island-4')?.earned).toBe(true);
  });
  it('CHƯA đạt: chờ 1 ngày cho tuần đó', () => {
    const d = fixtureWeek4Child(NOW);
    noteTestOutFail(d, 4, TODAY);
    expect(testOutStatus(d, TODAY).why).toBe('cooldown');
    const tomorrow = localDateStr(new Date(T + 86_400_000));
    expect(testOutStatus(d, tomorrow).why).toBe('ok');
  });
  it('tuần cuối không thi vượt; tuần đã xong → "done"', () => {
    const d = fixtureWeek4Child(NOW);
    d.progress.currentWeek = MAX_WEEK;
    expect(testOutStatus(d, TODAY).why).toBe('last');
    const e = fixtureWeek4Child(NOW);
    addSkips(e, [4], 'testedOut', T, TODAY);
    expect(testOutStatus(e, TODAY).why).toBe('done');
  });
  it('huy chương cấp chỉ khi lên sân khấu thật (bản ghi cho qua không cho huy chương)', () => {
    const d = fixtureWeek4Child(NOW);
    addSkips(d, [10], 'testedOut', T, TODAY);
    d.progress.currentWeek = 11;
    expect(weekPassed(10, d)).toBe(true);
    expect(allStickers(d).find((s) => s.id === 'medal-1')?.earned).toBe(false);
  });
  it('gộp lịch sử giữ bản ghi; tuần chỉ qua nhờ bản ghi không vào history.passedWeeks', () => {
    const d = fixtureWeek4Child(new Date(2026, 6, 1));
    addSkips(d, [4], 'testedOut', T, TODAY);
    d.progress.currentWeek = 5;
    compactData(d, NOW);
    expect(d.sessions.length).toBe(0);
    expect(weekPassed(4, d)).toBe(true);
    expect(d.history?.passedWeeks.includes(4)).toBe(false);
    expect(skippedWeeks(d)).toEqual([4]);
  });
  it('withoutSkips / placedOut đọc mềm; bản ghi hỏng bị bỏ qua', () => {
    const d = fixtureWeek4Child(NOW);
    (d.progress as { skips?: unknown }).skips = { 4: { kind: 'weird' }, 5: { kind: 'placedOut', at: 1, date: TODAY } };
    expect(skipOf(d, 4)).toBeNull();
    expect(placedOut(d, 5)).toBe(true);
    expect(withoutSkips(d as AppData).progress.skips).toBeUndefined();
  });
});
