/**
 * (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") Buổi học gọn: mở đầu MỘT bước ≤ 60 giây, Đô giữa chỉ khi lệch quãng 8,
 * thẻ tư thế ≤ 1 lần / tuần (không hai buổi liền), trò đố ≤ 3 lượt (ngày chấm tiêu chí giữ đủ lượt), tối đa MỘT trò "chỉ trên
 * iPad" mỗi buổi, thẻ "📘 Biết thêm" ra khỏi buổi (chip ở màn kết — chỉ số hoạt động giữ nguyên, không đổi "xong bài").
 * An toàn tiến độ: bé thật (fixture tuần 4) — "Học tiếp" không đổi; MAX_SESSION_STEPS ≤ 7.
 */
import { describe, expect, it } from 'vitest';
import { MemoryStorage, ProgressStore, STORAGE_KEY } from '../src/progress/ProgressStore';
import { defaultData, localDateStr, type AppData, type Session } from '../src/progress/schema';
import { MAX_QUIZ_ROUNDS, MAX_SESSION_STEPS, WEEKS, activityDoneId, buildSessionPlan, findLesson, nextLesson, weekPlan } from '../src/lessons/lessonEngine';
import { IPAD_FUN, SESSION_QUIZ_ROUNDS } from '../src/lessons/sessionPlan';
import { postureFull } from '../src/lessons/sessionSelectors';
import { middleCReason } from '../src/lessons/middleC';
import { weekPassed } from '../src/lessons/weekCriteria';
import { newTheoryCards, readTheorySeen, theoryBadge, unseenOf, withTheorySeen } from '../src/lessons/theorySeen';
import { theoryUnlocked } from '../src/lessons/theory';
import { openingPlan, startSessionFlow, type EndInfo, type FlowView } from '../src/ui/screens/sessionFlow';
import { fixtureWeek4Child } from './fixtures/week4Child';
import type { Lesson } from '../src/lessons/types';

const NOW = new Date(2026, 9, 17, 17).getTime(); // thứ Bảy
const DAY = 86_400_000;
const lesson = (id: string): Lesson => {
  const l = findLesson(id);
  if (!l) throw new Error(id);
  return l;
};
const allLessons = () => WEEKS.flatMap((w) => w.lessons);

function sess(id: string, at: number, lessonId: string): Session {
  return {
    id, date: localDateStr(new Date(at)), lessonId, parentAssessments: [{ note: 'C4', result: 'correct', ts: at }], appAssessments: [], micAssessments: [],
    songRuns: [], selfRating: 'all', startedAt: at, endedAt: at + 600e3, minutes: 10, completed: true, checklist: {},
  };
}

describe('mở đầu buổi ≤ 60 giây', () => {
  it('openingPlan: bài tập về nhà THAY khởi động bằng nhạc; khởi động tay chỉ khi không có bài tập về nhà / thẻ tư thế', () => {
    expect(openingPlan({ full: false, homework: false })).toEqual({ homework: false, music: true, posture: false, drill: true });
    expect(openingPlan({ full: false, homework: true })).toEqual({ homework: true, music: false, posture: false, drill: false });
    expect(openingPlan({ full: true, homework: false })).toEqual({ homework: false, music: true, posture: true, drill: false });
    expect(openingPlan({ full: true, homework: true })).toEqual({ homework: true, music: false, posture: true, drill: false });
  });

  it('📍 Tìm Đô giữa CHỈ khi bé thật sự lệch quãng 8 (không vì buổi đầu tuần / thế tay mới)', () => {
    const d = fixtureWeek4Child(new Date(NOW));
    const today = localDateStr(new Date(NOW));
    for (const l of allLessons().filter((x) => x.week <= 12)) expect(middleCReason(l, d, { now: NOW, today, log: null }), l.id).toBeNull();
    const log = { events: [NOW - 3 * 3600e3, NOW - 2 * 3600e3] };
    expect(middleCReason(lesson('w4-l2'), d, { now: NOW, today, log })).toBe('octave');
    expect(middleCReason(lesson('w4-l2'), d, { now: NOW, today, log: { ...log, shownOn: today } })).toBeNull();
  });

  it('thẻ tư thế đầy đủ: tối đa MỘT lần mỗi tuần lịch và không bao giờ hai buổi liền', () => {
    const l = lesson('w6-l2');
    const base = (): AppData => {
      const d = defaultData(new Date(NOW - 40 * DAY));
      d.progress.currentWeek = 6;
      d.sessions.push(sess('a', NOW - 9 * DAY, 'w6-l1')); // tuần lịch trước, đã có buổi của tuần 6
      return d;
    };
    // buổi đầu của tuần lịch (chưa có buổi nào từ thứ 2) → có thẻ
    expect(postureFull(l, base(), NOW)).toBe(true);
    // đã hiện trong tuần này → không
    const d1 = base();
    d1.settings.postureFullAt = NOW - 2 * DAY;
    expect(postureFull(l, d1, NOW)).toBe(false);
    // hiện ở tuần trước, nhưng buổi gần nhất CHÍNH là buổi đã hiện → không (không hai buổi liền)
    const d2 = base();
    d2.settings.postureFullAt = NOW - 9 * DAY + 60e3;
    expect(postureFull(l, d2, NOW)).toBe(false);
    // hiện ở tuần trước, sau đó còn một buổi không hiện → luật cũ (buổi đầu tuần lịch) → có
    const d3 = base();
    d3.settings.postureFullAt = NOW - 12 * DAY;
    expect(postureFull(l, d3, NOW)).toBe(true);
    // bố mẹ bật "nhắc tư thế đầy đủ" → mọi buổi (như cũ)
    const d4 = base();
    d4.settings.postureFullAt = NOW - DAY;
    (d4.settings as { postureFull?: boolean }).postureFull = true;
    expect(postureFull(l, d4, NOW)).toBe(true);
  });
});

describe('trò đố ≤ 3 lượt · tối đa MỘT trò "chỉ trên iPad"', () => {
  it('mọi bài: trò đố trong buổi ≤ 3 lượt (trừ ngày chấm tiêu chí bằng trò đố)', () => {
    for (const w of WEEKS) {
      const d = defaultData(new Date(NOW - 60 * DAY));
      d.progress.currentWeek = w.week;
      for (const l of w.lessons) {
        const criterionDay = w.criterion.who === 'APP' && !weekPassed(w.week, d);
        for (const s of buildSessionPlan(l, d, { now: NOW, songReview: true, sightRead: true })) {
          const q = s.kind === 'quiz' ? s.quiz : s.kind === 'activity' && s.activity.kind === 'quiz' ? s.activity.quiz : null;
          if (!q) continue;
          expect(q.rounds, l.id).toBeLessThanOrEqual(criterionDay ? MAX_QUIZ_ROUNDS : SESSION_QUIZ_ROUNDS);
        }
      }
    }
  });

  it('ngày chấm tiêu chí (tuần 3: tai nghe ≥ 5/6 trong một buổi): trò khởi động giữ đủ 6 lượt', () => {
    const d = defaultData(new Date(NOW - 30 * DAY));
    d.progress.currentWeek = 3;
    d.progress.lessonsCompleted = ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4', 'w1-test', 'w2-l1', 'w2-l2', 'w2-l3'];
    const plans = weekPlan(3).lessons.map((l) => buildSessionPlan(l, d, { now: NOW }));
    const quizzes = plans.flat().flatMap((s) => (s.kind === 'quiz' ? [s.quiz.rounds] : []));
    expect(quizzes.length).toBeGreaterThan(0);
    for (const r of quizzes) expect(r).toBe(Math.min(weekPlan(3).warmup!.rounds, MAX_QUIZ_ROUNDS));
  });

  it('bài đã có trò đố / sáng tạo trên phím màn hình → không thêm trò khởi động (trừ ngày chấm tiêu chí)', () => {
    for (const w of WEEKS) {
      const d = defaultData(new Date(NOW - 60 * DAY));
      d.progress.currentWeek = w.week;
      if (w.criterion.who === 'APP') continue;
      for (const l of w.lessons) {
        const plan = buildSessionPlan(l, d, { now: NOW });
        const fun = plan.some((s) => s.kind === 'activity' && IPAD_FUN.has(s.activity.kind));
        if (fun) expect(plan.some((s) => s.kind === 'quiz' && s.warmup), l.id).toBe(false);
      }
    }
  });
});

describe('thẻ "📘 Biết thêm" ra khỏi buổi', () => {
  it('không còn là bước; chip ở màn kết; chỉ số hoạt động giữ nguyên; hoạt động cuối (không phải thẻ) mang `last`', () => {
    let n = 0;
    for (const l of allLessons()) {
      if (!l.activities.some((a) => a.kind === 'theory') || l.activities.every((a) => a.kind === 'theory')) continue;
      n++;
      const plan = buildSessionPlan(l, undefined, { now: NOW });
      const acts = plan.filter((s) => s.kind === 'activity');
      expect(acts.some((s) => s.kind === 'activity' && s.activity.kind === 'theory'), l.id).toBe(false);
      expect(acts.map((s) => (s.kind === 'activity' ? s.index : -1))).toEqual(l.activities.flatMap((a, i) => (a.kind === 'theory' ? [] : [i])));
      const lastIdx = Math.max(...l.activities.flatMap((a, i) => (a.kind === 'theory' ? [] : [i])));
      expect(acts.filter((s) => s.kind === 'activity' && s.last).map((s) => (s.kind === 'activity' ? s.index : -1)), l.id).toEqual([lastIdx]);
      const closing = plan[plan.length - 1];
      expect(closing.kind === 'closing' && closing.theory?.length, l.id).toBeTruthy();
      // chơi lại: không chip
      const again = buildSessionPlan(l, undefined, { now: NOW, replay: true });
      const c2 = again[again.length - 1];
      expect(c2.kind === 'closing' && c2.theory).toBeFalsy();
    }
    expect(n).toBeGreaterThan(10);
  });

  it('dữ liệu cũ: chỉ còn thẻ chưa làm (mọi hoạt động khác đã xong) → thẻ vẫn là bước để bài xong được', () => {
    const l = lesson('w4-l4');
    const d = fixtureWeek4Child(new Date(NOW));
    d.progress.lessonsCompleted = d.progress.lessonsCompleted.filter((x) => !x.startsWith('w4-l4'));
    l.activities.forEach((a, i) => a.kind !== 'theory' && d.progress.lessonsCompleted.push(activityDoneId(l.id, i)));
    const acts = buildSessionPlan(l, d, { now: NOW }).filter((s) => s.kind === 'activity');
    expect(acts.map((s) => s.kind === 'activity' && s.activity.kind)).toEqual(['theory']);
    expect(acts[0].kind === 'activity' && acts[0].last).toBe(true);
  });

  it('buổi chạy hoạt động đầu tiên → thẻ của bài được đánh dấu "đã làm" (Từ điển mở khóa); xong bài như cũ', () => {
    const d = fixtureWeek4Child(new Date(NOW));
    d.progress.lessonsCompleted = d.progress.lessonsCompleted.filter((x) => !x.startsWith('w4-l4'));
    const kv = new MemoryStorage();
    kv.setItem(STORAGE_KEY, JSON.stringify(d));
    const store = new ProgressStore(kv, () => new Date(NOW), { saveDelayMs: 0, autoCompact: false, pageEvents: false });
    const st: { cur: FlowView | null; ended: EndInfo | null } = { cur: null, ended: null };
    const l = lesson('w4-l4');
    const flow = startSessionFlow(
      { store, now: () => NOW, show: (v) => (st.cur = v), home: () => undefined, stopMic: () => undefined, end: (e) => (st.ended = e) },
      l,
    );
    flow.go(0);
    const ti = l.activities.findIndex((a) => a.kind === 'theory');
    expect(ti).toBeGreaterThanOrEqual(0);
    for (let k = 0; k < 60 && !st.ended; k++) {
      st.cur!.onDone();
      if (st.cur?.kind === 'step' && st.cur.step.kind === 'closing') break;
    }
    expect(store.get().progress.lessonsCompleted).toContain(activityDoneId(l.id, ti));
    st.cur!.onDone();
    expect(st.ended).not.toBeNull();
    expect(store.get().progress.lessonsCompleted).toContain(l.id);
    expect(theoryUnlocked(store.get()).some((c) => l.activities.some((a) => a.kind === 'theory' && a.ids.includes(c.id)))).toBe(true);
  });

  it('"📘 N thẻ mới": thẻ đã mở khóa mà con chưa xem', () => {
    const d = fixtureWeek4Child(new Date(NOW));
    const unlocked = theoryUnlocked(d);
    expect(newTheoryCards(d, unlocked)).toHaveLength(unlocked.length);
    const seen = withTheorySeen(readTheorySeen(d.settings), unlocked.map((c) => c.id))!;
    d.settings.theorySeen = seen;
    expect(newTheoryCards(d, unlocked)).toHaveLength(0);
    expect(withTheorySeen(seen, [unlocked[0].id])).toBeNull();
    expect(unseenOf(d, ['step-skip'])).toEqual(seen.includes('step-skip') ? [] : ['step-skip']);
    expect(theoryBadge(1)).toBe('📘 1 thẻ mới');
    expect(theoryBadge(0)).toBeNull();
  });
});

describe('an toàn tiến độ', () => {
  it('bé thật (fixture tuần 4): "Học tiếp" không đổi; mọi buổi ≤ MAX_SESSION_STEPS (≤ 7) màn', () => {
    expect(MAX_SESSION_STEPS).toBeLessThanOrEqual(7);
    const d = fixtureWeek4Child(new Date(2026, 9, 12));
    expect(nextLesson(d, () => 0.3, new Date(2026, 9, 12, 17)).id).toBe('w4-l2');
    for (const l of allLessons()) {
      const plan = buildSessionPlan(l, d, { now: NOW, songReview: true, sightRead: true });
      expect(plan.length, l.id).toBeLessThanOrEqual(MAX_SESSION_STEPS);
    }
  });
});
