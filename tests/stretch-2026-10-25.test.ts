/**
 * (+ 2026-10-25, OWNER duyệt — bé: "Dạy piano quá dễ") BÀI KHÓ HƠN CHO BÉ GIỎI: 'stretch' sau 2 buổi rất tốt; thử thách NẰM TRONG
 * buổi (bỏ ôn thừa / tập chậm bài đã vững, bước ⭐ xem trước bài tuần sau + bài khó hơn một bậc, bài quen mở đúng tốc độ bài).
 * Tiêu chí tuần, mã bài, chỉ số hoạt động không đổi.
 */
import { describe, expect, it } from 'vitest';
import { STRETCH_SESSIONS, difficulty } from '../src/lessons/adaptive';
import { WEEKS, buildSessionPlan, findLesson, startTempoBpm, weekPassed } from '../src/lessons/lessonEngine';
import { MAX_SESSION_STEPS, type SessionStep } from '../src/lessons/sessionPlan';
import { stretchExtras, stretchTrim } from '../src/lessons/stretchPlan';
import { findTune } from '../src/music/exercises';
import { defaultData, localDateStr, type AppData, type Session, type SongRun } from '../src/progress/schema';

const NOW = new Date(2026, 9, 25, 17);
const T = NOW.getTime();
const DAY = 86_400_000;

const run = (songId: string, ts: number, extra: Partial<SongRun> = {}): SongRun =>
  ({ songId, mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 10, hits: 10, source: 'mic', passed: true, ts, ...extra }) as SongRun;

function session(i: number, daysAgo: number, runs: SongRun[]): Session {
  const t = T - daysAgo * DAY - 3600e3;
  return {
    id: `s${i}`,
    date: localDateStr(new Date(t)),
    lessonId: 'w5-l1',
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: runs.map((r) => ({ ...r, ts: t + 1 })),
    selfRating: 'all',
    startedAt: t,
    endedAt: t + 600e3,
    minutes: 10,
    completed: true,
    checklist: {},
  };
}

/** Bé tuần 6, `n` buổi hoàn hảo gần nhất. */
function strong(n: number): AppData {
  const d = defaultData(new Date(T - 40 * DAY));
  d.progress.currentWeek = 6;
  d.progress.lessonsCompleted = WEEKS.slice(0, 5).flatMap((w) => w.lessons.map((l) => l.id));
  for (let i = 0; i < n; i++) d.sessions.push(session(i, n - i, [run('frog_hop', 0), run('mary_lamb', 0)]));
  return d;
}

describe('stretch — bật sớm hơn', () => {
  it(`${STRETCH_SESSIONS} buổi rất tốt là đủ (trước: 3)`, () => {
    expect(STRETCH_SESSIONS).toBe(2);
    expect(difficulty(strong(1), T).mode).toBe('normal');
    expect(difficulty(strong(2), T)).toMatchObject({ mode: 'stretch', why: 'cruising' });
    expect(difficulty(strong(5), T).mode).toBe('stretch');
  });
  it('một buổi có bài chưa đạt → không stretch', () => {
    const d = strong(2);
    d.sessions[1].songRuns.push(run('au_clair', d.sessions[1].startedAt + 2, { passed: false, hits: 4 }));
    expect(difficulty(d, T).mode).not.toBe('stretch');
  });
});

describe('stretch — thử thách trong buổi', () => {
  const kinds = (steps: SessionStep[]) => steps.map((s) => s.kind);
  it('bước ⭐ xem trước bài tuần sau + bài khó hơn; không "Ôn nhanh"; ≤ số màn tối đa; bài học vẫn xong được', () => {
    const d = strong(5);
    const l = findLesson('w6-l1')!;
    const steps = buildSessionPlan(l, d, { now: T, songReview: true, sightRead: true });
    expect(steps.length).toBeLessThanOrEqual(MAX_SESSION_STEPS);
    expect(kinds(steps)).not.toContain('review');
    const extra = steps.filter((s): s is Extract<SessionStep, { kind: 'stretch-song' }> => s.kind === 'stretch-song');
    expect(extra.length).toBeGreaterThan(0);
    for (const s of extra) expect((findTune(s.songId)?.week ?? 0) > 6).toBe(true);
    expect(steps.some((s) => s.kind === 'activity' && s.last)).toBe(true);
    // bình thường: không bước ⭐
    const normal = buildSessionPlan(l, strong(1), { now: T, songReview: true, sightRead: true });
    expect(kinds(normal)).not.toContain('stretch-song');
  });
  it('xem trước ưu tiên bài HAI TAY của tuần sau', () => {
    const d = strong(5);
    const wk = WEEKS.find((w) => w.lessons.some((l) => l.activities.some((a) => a.kind === 'song' && !!findTune(a.songId)?.lh)))!.week;
    const ex = stretchExtras(wk - 1, d);
    const prev = ex.find((s) => s.what === 'preview');
    expect(prev).toBeTruthy();
  });
  it('bỏ lượt tập chậm / tách tay của bài ĐÃ vững (đạt trọn bài theo nhịp), giữ bài chưa vững', () => {
    const d = strong(3);
    const todo = [
      { index: 0, activity: { kind: 'song' as const, songId: 'frog_hop', mode: 'wait' as const, hints: 'full' as const } },
      { index: 1, activity: { kind: 'song' as const, songId: 'frog_hop', mode: 'tempo' as const, hints: 'names' as const } },
      { index: 2, activity: { kind: 'song' as const, songId: 'ode_to_joy_easy', mode: 'wait' as const, hints: 'full' as const } },
    ];
    expect(stretchTrim(todo, d).map((x) => x.index)).toEqual([1, 2]);
  });
  it('bài quen (đạt từng nốt) mở đúng tốc độ bài khi stretch', () => {
    const t = findTune('ode_to_joy_easy')!;
    const d = strong(5);
    d.sessions[4].songRuns.push(run('ode_to_joy_easy', d.sessions[4].startedAt + 3, { mode: 'wait', level: undefined }));
    expect(startTempoBpm(t, d)).toBe(t.bpm);
  });
  it('tiêu chí tuần không đổi: bước ⭐ không làm tuần đạt', () => {
    const d = strong(5);
    expect(weekPassed(6, d)).toBe(false);
  });
});
