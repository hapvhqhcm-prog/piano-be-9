import { describe, expect, it } from 'vitest';
import {
  MAX_SESSION_MINUTES,
  MAX_SESSION_STEPS,
  SIGHT_DAILY_WEEK,
  WARMUP_BEATS,
  WEEKS,
  activityDoneId,
  buildSessionPlan,
  dailyLesson,
  estimateLessonMinutes,
  findLesson,
  lessonHandPosition,
  nextLesson,
  sightDailyFits,
  sightDailyHints,
  warmupMusic,
  weekPlan,
  type SessionStep,
} from '../src/lessons/lessonEngine';
import { findTune } from '../src/music/exercises';
import { beatsPerMeasure, measureCount, phraseRanges, slice } from '../src/music/tune';
import { POSITIONS } from '../src/piano/fingering';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import type { SongRun } from '../src/progress/schema';
import { sightDailyTune } from '../src/ui/screens/sightDaily';

const T0 = new Date(2026, 9, 5, 17).getTime();
const store = () => new ProgressStore(new MemoryStorage(), () => new Date(T0));
const run = (songId: string, extra: Partial<SongRun> = {}): Omit<SongRun, 'ts'> => ({
  songId,
  mode: 'tempo',
  level: 2,
  bpm: 60,
  hints: 'full',
  phrase: null,
  total: 10,
  hits: 10,
  source: 'parent',
  passed: true,
  ...extra,
});
const opening = (plan: SessionStep[]) => {
  const p = plan[0];
  if (p.kind !== 'posture') throw new Error(`bước đầu là ${p.kind}`);
  return p;
};
/** Kho "đang học tuần w": các tuần trước đã xong, vài buổi cũ. */
function storeAt(week: number, done: string[] = []): ProgressStore {
  const st = store();
  for (const w of WEEKS) if (w.week < week) for (const l of w.lessons) st.markLessonCompleted(l.id);
  done.forEach((id) => st.markLessonCompleted(id));
  st.setCurrentWeek(week);
  for (let i = 0; i < 4; i++) st.finishSession(st.startSession(WEEKS[Math.max(0, week - 3)].lessons[0].id).id);
  return st;
}

describe('v5.2 — khởi động bằng nhạc (mở đầu mọi buổi)', () => {
  it('chưa thuộc bài nào → "thầy đàn — con đàn lại" trong thế tay hiện tại (tuần ≤ 3: chỉ bậc liền)', () => {
    const w = warmupMusic(findLesson('w1-l1')!, undefined);
    expect(w).toEqual({ kind: 'riff', position: 'C', hand: 'RH', riffs: [['C4', 'D4', 'E4'], ['E4', 'D4', 'C4']] });
    for (const wk of WEEKS) {
      const l = wk.lessons[0];
      const st = store();
      for (let i = 0; i < 5; i++) {
        const m = warmupMusic(l, st.get());
        if (m.kind !== 'riff') throw new Error();
        const map = POSITIONS[m.position][m.hand]!;
        expect(m.riffs.length, l.id).toBe(2);
        for (const r of m.riffs) for (const p of r) expect(map[p], `${l.id} ${p}`).toBeDefined();
        st.finishSession(st.startSession(l.id).id);
      }
    }
  });

  it('có bài đã thuộc → câu đầu (≤ 16 phách) theo nhịp; không trùng bài hôm nay; xoay vòng theo buổi', () => {
    const st = store();
    st.setCurrentWeek(4);
    const s = st.startSession('w3-l1');
    for (const id of ['mary_lamb', 'three_chicks', 'hot_cross_buns', 'snail_stroll']) if (findTune(id)) st.addSongRun(s.id, run(id));
    st.finishSession(s.id);
    const mastered = ['mary_lamb', 'three_chicks', 'hot_cross_buns', 'snail_stroll'].filter((id) => findTune(id));
    expect(mastered.length).toBeGreaterThanOrEqual(2);
    const lesson = findLesson('w4-l1')!;
    const inLesson = new Set(lesson.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : [])));
    const seen = new Set<string>();
    for (let k = 0; k < 4; k++) {
      const plan = buildSessionPlan(lesson, st.get(), { now: T0 });
      const w = opening(plan).warmup;
      if (w.kind !== 'song') throw new Error('phải là bài đã thuộc');
      expect(inLesson.has(w.songId)).toBe(false);
      const t = findTune(w.songId)!;
      const sl = slice(t, w.phrase[0], w.phrase[1]);
      expect(sl.notes.reduce((x, n) => x + n.beats, 0)).toBeLessThanOrEqual(WARMUP_BEATS + 1e-9);
      expect(w.phrase[0]).toBe(phraseRanges(t)[0][0]);
      expect(w.phrase[1]).toBeLessThanOrEqual(Math.min(phraseRanges(t)[0][1], measureCount(t)));
      expect(w.phrase[1] - w.phrase[0]).toBeGreaterThanOrEqual(1);
      expect(w.bpm).toBe(t.bpm <= 40 ? 40 : 60);
      seen.add(w.songId);
      st.finishSession(st.startSession('w4-l1').id);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('không trùng bài "Ôn bài cũ" của cùng buổi', () => {
    for (const wk of [8, 10, 12, 15]) {
      const st = storeAt(wk);
      const s = st.startSession(`w${wk - 2}-l1`);
      // Thuộc mọi bài 2–4 tuần trước → "Ôn bài cũ" chắc chắn chọn một bài đã thuộc
      for (const l of [...weekPlan(wk - 2).lessons, ...weekPlan(wk - 3).lessons])
        for (const a of l.activities) if (a.kind === 'song') st.addSongRun(s.id, run(a.songId));
      st.finishSession(s.id);
      for (const l of weekPlan(wk).lessons) {
        const plan = buildSessionPlan(l, st.get(), { songReview: true, sightRead: true, now: T0 + 86_400_000 });
        const rs = plan.find((p) => p.kind === 'review-song');
        if (l.activities.some((a) => a.kind === 'stage')) continue;
        const w = opening(plan).warmup;
        if (rs && rs.kind === 'review-song' && w.kind === 'song') expect(w.songId, l.id).not.toBe(rs.songId);
      }
    }
  });

  it('dựng kế hoạch không đổi tiến độ; bước mở đầu vẫn là "posture" (một chấm tiến trình)', () => {
    const st = storeAt(9);
    const before = JSON.stringify(st.get().progress);
    for (const l of weekPlan(9).lessons) buildSessionPlan(l, st.get(), { songReview: true, sightRead: true, now: T0 });
    expect(JSON.stringify(st.get().progress)).toBe(before);
  });
});

describe('v5.2 — đọc nhạc 1 phút mỗi ngày (từ tuần 8)', () => {
  it('chỉ khi bật sightRead, từ tuần 8; không ở bài kiểm tra / sân khấu / bài có đọc nhạc riêng / luyện tập mỗi ngày / chơi lại', () => {
    expect(SIGHT_DAILY_WEEK).toBe(8);
    let seen = 0;
    for (const w of WEEKS) {
      const st = storeAt(w.week);
      for (const l of w.lessons) {
        const plan = buildSessionPlan(l, st.get(), { songReview: true, sightRead: true, now: T0 });
        const has = plan.some((p) => p.kind === 'sight-daily');
        if (w.week < 8 || l.isWeekTest || l.activities.some((a) => a.kind === 'sight' || a.kind === 'stage')) expect(has, l.id).toBe(false);
        if (has) {
          seen++;
          expect(sightDailyFits(l), l.id).toBe(true);
          // TRƯỚC bài mới
          const k = plan.findIndex((p) => p.kind === 'sight-daily');
          expect(k, l.id).toBeLessThan(plan.findIndex((p) => p.kind === 'activity'));
        }
        expect(buildSessionPlan(l, st.get(), { songReview: true, now: T0 }).some((p) => p.kind === 'sight-daily')).toBe(false);
        expect(buildSessionPlan(l, st.get(), { sightRead: true, replay: true, now: T0 }).some((p) => p.kind === 'sight-daily')).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(30);
    const st = storeAt(31);
    const daily = dailyLesson(st.get(), () => 0.4, T0);
    expect(buildSessionPlan(daily, st.get(), { sightRead: true, now: T0 }).some((p) => p.kind === 'sight-daily')).toBe(false);
  });

  it(`≤ ${MAX_SESSION_STEPS} màn và ≤ ${MAX_SESSION_MINUTES} phút (ước lượng gồm cả 1 phút đọc nhạc); hoạt động của bài không bị cắt`, () => {
    for (const w of WEEKS) {
      const done: string[] = [];
      for (const l of w.lessons) {
        expect(estimateLessonMinutes(l), l.id).toBeLessThanOrEqual(MAX_SESSION_MINUTES);
        for (const rng of [() => 0.1, () => 0.7]) {
          const st = storeAt(w.week, done);
          const plan = buildSessionPlan(l, st.get(), { songReview: true, sightRead: true, rng, now: T0 });
          expect(plan.length, `${l.id}: ${plan.map((x) => x.kind).join(',')}`).toBeLessThanOrEqual(MAX_SESSION_STEPS);
          expect(plan[plan.length - 1].kind).toBe('closing');
          expect(plan.filter((x) => x.kind === 'activity')).toHaveLength(l.activities.length);
        }
        done.push(l.id);
      }
    }
  });

  it('luật bỏ bước khi quá số màn: Ôn bài cũ → khởi động tai/đọc nốt (không phải tiêu chí) → Ôn nhanh → Đọc nhạc 1 phút', () => {
    for (const w of WEEKS) {
      if (w.week < 8) continue;
      for (const l of w.lessons) {
        if (!sightDailyFits(l)) continue;
        const st = storeAt(w.week);
        const plan = buildSessionPlan(l, st.get(), { songReview: true, sightRead: true, rng: () => 0.3, now: T0 });
        const kinds = plan.map((p) => p.kind);
        // Còn bước đọc nhạc → không thể đã bỏ nó trong khi còn bước ưu tiên thấp hơn; mất bước đọc nhạc → các bước kia đã mất trước
        if (!kinds.includes('sight-daily')) {
          expect(kinds, l.id).not.toContain('review-song');
          expect(kinds, l.id).not.toContain('review');
          if (w.criterion.who !== 'APP') expect(plan.some((p) => p.kind === 'quiz' && p.warmup), l.id).toBe(false);
        }
        if (kinds.includes('review') || kinds.includes('review-song')) expect(kinds, l.id).toContain('sight-daily');
      }
    }
  });

  it('học tiếp giữa bài (resume): bước mở đầu + đọc nhạc không đổi chỉ số hoạt động; "Học tiếp" vẫn là bài đó', () => {
    const st = storeAt(9);
    const lesson = weekPlan(9).lessons.find((l) => sightDailyFits(l) && l.activities.length >= 2)!;
    expect(lesson).toBeTruthy();
    st.markLessonCompleted(activityDoneId(lesson.id, 0));
    const plan = buildSessionPlan(lesson, st.get(), { songReview: true, sightRead: true, now: T0 });
    expect(plan[0].kind).toBe('posture');
    const acts = plan.flatMap((s) => (s.kind === 'activity' ? [s.index] : []));
    expect(acts).toEqual(lesson.activities.map((_, i) => i).slice(1));
    const lastAct = plan.filter((s) => s.kind === 'activity').pop()!;
    expect(lastAct.kind === 'activity' && lastAct.last).toBe(true);
    expect(plan.filter((s) => s.kind === 'activity' && s.last)).toHaveLength(1);
    expect(nextLesson(st.get()).id).toBe(weekPlan(9).lessons.find((l) => !st.get().progress.lessonsCompleted.includes(l.id))!.id);
  });

  it('gợi ý rút dần: tên nốt (8–11) → xen kẽ (12–21) → chỉ khuông (22+)', () => {
    expect([8, 11].map((w) => sightDailyHints(w, 1))).toEqual(['names', 'names']);
    expect([sightDailyHints(15, 0), sightDailyHints(15, 1)]).toEqual(['names', 'staff']);
    expect([22, 30].map((w) => sightDailyHints(w, 0))).toEqual(['staff', 'staff']);
  });

  it('đoạn nhạc sinh ra: đúng thế tay, đúng nhịp, đủ ô, kết ở nốt chủ, mã bắt đầu bằng "sight" (không nhắc "bài mới")', () => {
    for (const w of WEEKS) {
      if (w.week < 8) continue;
      for (const l of w.lessons) {
        if (!sightDailyFits(l)) continue;
        const st = storeAt(w.week);
        const step = buildSessionPlan(l, st.get(), { sightRead: true, now: T0 }).find((p) => p.kind === 'sight-daily');
        if (!step || step.kind !== 'sight-daily') continue;
        let x = 7;
        const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
        const t = sightDailyTune(step, rng);
        expect(t.id.startsWith('sight')).toBe(true);
        expect(t.timeSignature).toBe(step.timeSignature);
        expect(measureCount(t)).toBe(step.measures);
        expect(beatsPerMeasure(t) * step.measures).toBeGreaterThanOrEqual(8);
        const map = POSITIONS[step.position][step.hand]!;
        for (const n of t.notes) expect(map[n.pitch!], `${l.id} ${n.pitch}`).toBe(n.finger);
        if (!step.startAnywhere) expect(t.notes[0].pitch).toBe(t.notes[t.notes.length - 1].pitch);
        if (step.rhythm === 1) expect(t.notes.every((n) => Number.isInteger(n.beats))).toBe(true);
      }
    }
  });

  it('thế tay hiện tại theo bài hát của bài (thế Sol ở tuần có bài thế Sol)', () => {
    const positions = new Set(WEEKS.filter((w) => w.week >= 8).flatMap((w) => w.lessons.map((l) => lessonHandPosition(l).position)));
    expect(positions.has('C')).toBe(true);
    expect(positions.has('G')).toBe(true);
  });
});
