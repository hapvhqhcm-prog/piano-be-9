/**
 * (+ 2026-10-16, OWNER duyệt) 1. "Tự cân độ khó theo bé" (lessons/adaptive.ts + sessionPlan gentleTodo + stretchOffer);
 * 2. "Đổi món cho đỡ chán" — xoay vòng trò khởi động (sessionSelectors warmupCandidates / rotateWarmup).
 * AN TOÀN TIẾN ĐỘ: mã bài / chỉ số hoạt động không đổi, tiêu chí không đổi, đường mặc định (bố mẹ chấm đúng hết) học bình thường.
 */
import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_WINDOW,
  GENTLE_START_BPM,
  STRETCH_LESSON_PREFIX,
  difficulty,
  difficultyText,
  hadKindStop,
  successIndex,
  scoreSession,
} from '../src/lessons/adaptive';
import { hadKindStop as hadKindStopReward } from '../src/lessons/rewardSongs';
import { MAX_QUIZ_ROUNDS, WEEKS, activityDoneId, buildSessionPlan, findLesson, nextLesson, startTempoBpm, weekPlan } from '../src/lessons/lessonEngine';
import { gentleTodo, type SessionStep } from '../src/lessons/sessionPlan';
import {
  WARMUP_RECENT_MAX,
  pushWarmupRecent,
  readWarmupRecent,
  rotateWarmup,
  stretchOffer,
  warmupCandidates,
} from '../src/lessons/sessionSelectors';
import { songFamiliar } from '../src/lessons/readingAids';
import { findTune } from '../src/music/exercises';
import type { QuizVariant } from '../src/practice/quiz';
import { buildWeeklySummary, weeklyText } from '../src/progress/weeklyReport';
import { mondayKey } from '../src/progress/history';
import { defaultData, localDateStr, type AppData, type Session, type SongRun } from '../src/progress/schema';
import { fixtureWeek4Child } from './fixtures/week4Child';

const NOW = new Date(2026, 9, 16, 17);
const T = NOW.getTime();
const DAY = 86_400_000;
const lesson = (id: string) => {
  const l = findLesson(id);
  if (!l) throw new Error(id);
  return l;
};

/* ---------------- Dữ liệu mẫu: ĐANG VẤP · BÌNH THƯỜNG · LƯỚT ---------------- */

const run = (songId: string, passed: boolean, ts: number, extra: Partial<SongRun> = {}): SongRun =>
  ({ songId, mode: 'tempo', level: 2, bpm: 50, hints: 'names', phrase: null, total: 10, hits: passed ? 10 : 5, source: 'mic', passed, ts, ...extra }) as SongRun;

function session(i: number, daysAgo: number, lessonId: string, runs: (ts: number) => SongRun[], extra: Partial<Session> = {}): Session {
  const date = new Date(T - daysAgo * DAY);
  const t = date.getTime() - 3600e3;
  return {
    id: `s-${i}`,
    date: localDateStr(date),
    lessonId,
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: runs(t),
    selfRating: 'all',
    startedAt: t,
    endedAt: t + 10 * 60e3,
    minutes: 10,
    completed: true,
    checklist: {},
    ...extra,
  };
}

/** Bé ở tuần 6 (đã xong tuần 1–5), `n` buổi gần nhất theo `kind`. */
function child(kind: 'struggling' | 'normal' | 'cruising', n = 5): AppData {
  const d = defaultData(new Date(T - 40 * DAY));
  d.progress.currentWeek = 6;
  d.progress.lessonsCompleted = WEEKS.slice(0, 5).flatMap((w) => w.lessons.map((l) => l.id));
  for (let i = 0; i < n; i++) {
    const daysAgo = n - i;
    if (kind === 'struggling') {
      // 3 lượt chưa đạt liền (dừng nhẹ nhàng) + một lượt đạt bài khác
      d.sessions.push(session(i, daysAgo, 'w5-l1', (t) => [run('frog_hop', false, t + 1), run('frog_hop', false, t + 2), run('frog_hop', false, t + 3), run('mary_lamb', true, t + 4)]));
    } else if (kind === 'normal') {
      // ~80% (+ 2026-10-17: mỗi BÀI một phiếu — lượt tốt nhất): 4 bài đạt (Ếch đạt sau một lần thử lại) / 1 bài chưa
      d.sessions.push(
        session(i, daysAgo, 'w5-l1', (t) => [
          run('frog_hop', false, t + 1),
          run('frog_hop', true, t + 2),
          run('mary_lamb', true, t + 3),
          run('hot_cross_buns', true, t + 4),
          run('three_chicks', true, t + 5),
          run('au_clair', false, t + 6),
        ]),
      );
    } else {
      // bố mẹ chấm đúng hết (đường mặc định của e2e): nốt + lượt bài hát có phiếu 3 ý
      d.sessions.push(
        session(i, daysAgo, 'w5-l1', (t) => [run('frog_hop', true, t + 1, { source: 'parent', checklist: { notes: true, beat: true, fingers: true } })], {
          parentAssessments: ['C4', 'D4', 'E4'].map((note) => ({ note, result: 'correct' as const, ts: 0 })),
        }),
      );
    }
  }
  return d;
}

describe('adaptive — chỉ số thành công & chế độ', () => {
  it('hadKindStop chuyển sang adaptive.ts, rewardSongs export lại cùng hàm', () => {
    expect(hadKindStopReward).toBe(hadKindStop);
  });

  it('ba mẫu: đang vấp → gentle · bình thường → normal · lướt → stretch', () => {
    expect(difficulty(child('struggling'), T)).toMatchObject({ mode: 'gentle', why: 'kind-stops', sessions: 5 });
    const n = difficulty(child('normal'), T);
    expect(n.mode).toBe('normal');
    expect(n.index).toBeCloseTo(0.8, 5);
    expect(difficulty(child('cruising'), T)).toMatchObject({ mode: 'stretch', why: 'cruising' });
  });

  it('ít dữ liệu (< 3 buổi) → normal', () => {
    expect(difficulty(child('struggling', 2), T)).toMatchObject({ mode: 'normal', why: 'little-data' });
    expect(difficulty(defaultData(NOW), T).mode).toBe('normal');
  });

  it('chỉ số thấp (< 65%) không có dừng nhẹ nhàng → gentle', () => {
    const d = child('normal');
    for (const s of d.sessions) s.songRuns = s.songRuns.map((r, k) => ({ ...r, passed: k % 2 === 0 && k < 3 }));
    // mỗi buổi 2/5 đạt, không bài nào chưa đạt 3 lần liền
    expect(d.sessions.every((s) => !hadKindStop(s))).toBe(true);
    expect(difficulty(d, T)).toMatchObject({ mode: 'gentle', why: 'low' });
  });

  it('chỉ xét DIFFICULTY_WINDOW buổi gần nhất: buổi vấp cũ không kéo mãi', () => {
    const d = child('struggling', 5);
    const good = child('normal', 5).sessions.map((s, i) => ({ ...s, id: `g-${i}`, startedAt: s.startedAt + 10 * DAY, date: localDateStr(new Date(s.startedAt + 10 * DAY)) }));
    // đẩy buổi vấp về quá khứ
    d.sessions = d.sessions.map((s) => ({ ...s, startedAt: s.startedAt - 20 * DAY })).concat(good);
    expect(DIFFICULTY_WINDOW).toBe(5);
    expect(difficulty(d, T + 20 * DAY).mode).toBe('normal');
  });

  it('bài tập về nhà còn chờ + chỉ số < 75% → gentle; lướt mà còn bài tập → không stretch', () => {
    const d = child('normal');
    const hw = { songId: 'frog_hop', title: 'Ếch', phrase: null, place: 'Cả bài', mode: 'tempo', bpm: 40, date: localDateStr(new Date(T - 2 * DAY)), at: T - 2 * DAY, text: 'x' };
    // 70%: 7 bài đạt / 10 bài (mỗi bài một phiếu)
    for (const s of d.sessions) s.songRuns = Array.from({ length: 10 }, (_, k) => run(`p${k}`, k < 7, s.startedAt + k));
    const idx = difficulty(d, T).index!;
    expect(idx).toBeGreaterThanOrEqual(0.65);
    expect(idx).toBeLessThan(0.75);
    expect(difficulty(d, T).mode).toBe('normal');
    (d.settings as { homework?: unknown }).homework = hw;
    d.sessions = [...d.sessions]; // dữ liệu test: đổi mảng để tính lại
    expect(difficulty(d, T)).toMatchObject({ mode: 'gentle', why: 'homework', homework: true });
    const c = child('cruising');
    (c.settings as { homework?: unknown }).homework = hw;
    expect(difficulty(c, T).mode).toBe('normal');
  });

  it('buổi tùy chọn (bài thưởng, thử thách nhỏ) và buổi đang mở hôm nay không tính', () => {
    const d = child('cruising');
    const fails = (t: number) => [run('x', false, t + 1), run('x', false, t + 2), run('x', false, t + 3)];
    d.sessions.push(session(90, 0.5, `${STRETCH_LESSON_PREFIX}frog_hop`, fails), session(91, 0.5, 'reward-song-frog_hop', fails));
    d.sessions.push(session(92, 0, 'w6-l1', fails, { endedAt: null, completed: false }));
    expect(difficulty(d, T).mode).toBe('stretch');
  });

  it('chỉ số = trung bình các loại (micro · lượt · đố · bố mẹ), mỗi loại một phiếu', () => {
    const s = session(0, 1, 'w5-l1', (t) => [run('a', true, t), run('b', false, t + 1)], {
      micAssessments: Array.from({ length: 100 }, (_, k) => ({ expected: 'C4', firstHeard: 'C4', firstTry: true, wrongCount: 0, ts: k })),
      parentAssessments: [
        { note: 'teach-back', result: 'correct', ts: 0 },
        { note: 'C4', result: 'retry', ts: 0 },
      ],
    });
    // micro 100% · lượt 50% · bố mẹ 0% (thẻ "Con làm thầy" không tính) → 50%
    expect(successIndex([scoreSession(s)])).toBeCloseTo(0.5, 5);
    expect(successIndex([])).toBeNull();
  });

  it('dòng cho bố mẹ', () => {
    expect(difficultyText({ mode: 'gentle' })).toBe('Đang nhẹ tay vì con vấp nhiều — 2 buổi tới ôn kỹ');
    expect(difficultyText({ mode: 'stretch' })).toBe('Con đang làm tốt — buổi học thêm thử thách (nhanh hơn, bài khó hơn)');
  });
});

/* ---------------- Buổi NHẸ TAY: tách bài, không đổi mã ---------------- */

const acts = (steps: SessionStep[]) => steps.filter((s): s is Extract<SessionStep, { kind: 'activity' }> => s.kind === 'activity');

describe('adaptive — kế hoạch buổi nhẹ tay', () => {
  it('w6-l1 (sắc thái MỚI + bài MỚI): buổi 1 chỉ một điều mới, không `last`; buổi sau học tiếp đúng chỉ số; đủ hết thì xong bài', () => {
    const d = child('struggling');
    const l = lesson('w6-l1');
    const p1 = acts(buildSessionPlan(l, d, { now: T }));
    expect(p1.length).toBeLessThan(l.activities.length);
    expect(p1.map((s) => s.index)).toEqual([0]);
    expect(p1.every((s) => !s.last)).toBe(true);
    // session.ts đánh dấu "<bài>#<i>" khi xong từng hoạt động
    d.progress.lessonsCompleted.push(...p1.map((s) => activityDoneId(l.id, s.index)));
    const p2 = acts(buildSessionPlan(l, d, { now: T }));
    expect(p2[0].index).toBe(1);
    // (+ 2026-10-17) thẻ "📘 Biết thêm" không còn là bước → hoạt động cuối KHÔNG phải thẻ mang `last`
    const lastReal = Math.max(...l.activities.flatMap((a, i) => (a.kind === 'theory' ? [] : [i])));
    expect(p2[p2.length - 1].index).toBe(lastReal);
    expect(p2[p2.length - 1].last).toBe(true);
    // mã bài không đổi, hoạt động y nguyên dữ liệu (cùng kiểu, cùng bài)
    for (const s of [...p1, ...p2]) expect(s.activity.kind).toBe(l.activities[s.index].kind);
    // bình thường (adaptive: false) → cả bài một buổi
    const all = acts(buildSessionPlan(l, d, { now: T, adaptive: false }));
    expect(all.map((s) => s.index)).toEqual([1, 2].filter((i) => l.activities[i].kind !== 'theory'));
  });

  it('gentleTodo: lượt sau của CÙNG bài mới không tính là điều mới; bài đã chơi không mới; luôn ≥ 1 hoạt động', () => {
    const d = child('struggling');
    const todo = lesson('w6-l3').activities.map((activity, index) => ({ activity, index }));
    const cut = gentleTodo(todo, d);
    expect(cut.map((x) => x.activity.kind === 'song' && x.activity.songId)).toContain('jingle_bells');
    expect(cut.filter((x) => x.activity.kind === 'song' && x.activity.songId === 'jingle_bells').length).toBeGreaterThanOrEqual(2);
    expect(gentleTodo(todo.slice(0, 1), d).length).toBe(1);
  });

  it('không tách: bài kiểm tra tuần, bài đã xong (học lại cho tiêu chí), chơi lại, luyện tập mỗi ngày', () => {
    const d = child('struggling');
    const test = weekPlan(6).lessons.find((l) => l.isWeekTest);
    if (test) expect(acts(buildSessionPlan(test, d, { now: T })).length).toBe(test.activities.filter((a) => a.kind !== 'theory').length);
    const done = lesson('w5-l1');
    expect(acts(buildSessionPlan(done, d, { now: T })).length).toBe(done.activities.filter((a) => a.kind !== 'theory').length);
    expect(acts(buildSessionPlan(lesson('w6-l1'), d, { now: T, replay: true })).length).toBe(lesson('w6-l1').activities.filter((a) => a.kind !== 'theory').length);
  });

  it('(+ 2026-10-17) nhẹ tay: mở tốc độ 40 CHỈ cho bài mới; bài bé ĐÃ đạt mở như thường và không giữ tên nốt & màu', () => {
    const d = child('struggling');
    expect(difficulty(d, T).mode).toBe('gentle');
    // bài đã đạt (Mary đạt theo nhịp ở mọi buổi) → tốc độ của bài, coi là quen
    const t = findTune('mary_lamb')!;
    expect(startTempoBpm(t, d)).toBe(t.bpm);
    expect(startTempoBpm(t, child('normal'))).toBe(t.bpm);
    expect(songFamiliar(child('normal'), 'mary_lamb')).toBe(true);
    expect(songFamiliar(d, 'mary_lamb')).toBe(true);
    // bài chưa đạt lần nào → nhẹ tay mở ≤ 40, chưa quen
    const fresh = findTune('ode_to_joy_easy')!;
    expect(startTempoBpm(fresh, d)).toBeLessThanOrEqual(GENTLE_START_BPM);
    expect(startTempoBpm(fresh, child('normal'))).toBeGreaterThanOrEqual(startTempoBpm(fresh, d));
    expect(songFamiliar(d, 'ode_to_joy_easy')).toBe(false);
  });

  it('đọc nhạc 1 phút trong buổi nhẹ tay có tên nốt', () => {
    const d = child('struggling');
    d.progress.currentWeek = 25;
    const l = weekPlan(25).lessons.find((x) => !x.isWeekTest)!;
    const sd = buildSessionPlan(l, d, { now: T, sightRead: true }).find((s) => s.kind === 'sight-daily');
    if (sd && sd.kind === 'sight-daily') expect(sd.hints).toBe('names');
  });

  it('AN TOÀN: bé lướt (bố mẹ chấm đúng hết — đường mặc định e2e) → kế hoạch bài y như khi tắt tự cân', () => {
    const d = child('cruising');
    for (const w of [6, 7, 8]) {
      for (const l of weekPlan(w).lessons) {
        const a = acts(buildSessionPlan(l, d, { now: T }));
        const b = acts(buildSessionPlan(l, d, { now: T, adaptive: false }));
        expect(a).toEqual(b);
        expect(a[a.length - 1]?.last ?? true).toBe(true);
      }
    }
    expect(nextLesson(d, () => 0.5, T).id).toBe('w6-l1');
  });

  it('bé thật tuần 4 (fixture): "Học tiếp" không đổi; kế hoạch vẫn có hoạt động của bài', () => {
    const d = fixtureWeek4Child(NOW);
    const l = nextLesson(d, () => 0.5, T);
    expect(l.id.startsWith('w4-')).toBe(true);
    const a = acts(buildSessionPlan(l, d, { now: T }));
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((s) => s.activity.kind === l.activities[s.index].kind)).toBe(true);
    // dữ liệu bé thật: ~67% → vừa sức (không tách bài)
    expect(difficulty(d, T).mode).toBe('normal');
  });
});

/* ---------------- Thử thách nhỏ ---------------- */

describe('adaptive — thử thách nhỏ (stretch)', () => {
  it('chỉ khi lướt; "Thử nhanh hơn?" khi bài theo nhịp đã đạt dưới 72', () => {
    const d = child('cruising');
    // frog_hop đạt theo nhịp ở 50 → thử 60
    const l = WEEKS.flatMap((w) => w.lessons).find((x) => x.activities.some((a) => a.kind === 'song' && a.songId === 'frog_hop' && a.mode === 'tempo' && !a.phrase && !a.hand))!;
    const o = stretchOffer(l, d, T);
    expect(o).toMatchObject({ kind: 'faster', songId: 'frog_hop', bpm: 60 });
    expect(stretchOffer(l, child('normal'), T)).toBeNull();
    expect(stretchOffer(l, child('struggling'), T)).toBeNull();
  });

  it('không có bài theo nhịp đã đạt: tuần ≥ 8 → đọc nhạc; trước đó → bài Thư viện cao hơn một bậc (chưa chơi)', () => {
    const d = child('cruising');
    const o1 = stretchOffer(lesson('w6-l1'), d, T);
    expect(o1?.kind).toBe('library');
    if (o1?.kind === 'library') {
      const t = findTune(o1.songId)!;
      expect(t.week ?? 1).toBeGreaterThan(6);
      expect(t.week ?? 1).toBeLessThanOrEqual(8);
    }
    const l8 = weekPlan(9).lessons.find((x) => !x.isWeekTest && !x.activities.some((a) => a.kind === 'song' && a.mode === 'tempo'));
    if (l8) expect(stretchOffer(l8, d, T)?.kind).toBe('sight');
  });
});

/* ---------------- Báo cáo tuần ---------------- */

describe('adaptive — báo cáo tuần & màn phụ huynh', () => {
  it('tuần này có dòng độ khó; tuần cũ không', () => {
    const d = child('struggling');
    const mon = mondayKey(localDateStr(NOW));
    const s = buildWeeklySummary(d, mon, NOW);
    expect(s.pace).toEqual({ mode: 'gentle', text: difficultyText({ mode: 'gentle' }) });
    expect(weeklyText(s)).toContain('🎚️ Độ khó: Đang nhẹ tay');
    const old = buildWeeklySummary(d, localDateStr(new Date(T - 28 * DAY)), NOW);
    expect(old.pace).toBeNull();
  });
});

/* ---------------- Đổi món: xoay vòng khởi động ---------------- */

describe('warm-up — xoay vòng trò khởi động', () => {
  it('ứng viên tuần 4: trò của tuần trước tiên, rồi các trò đã học (mỗi kiểu một lần, số lượt của tuần)', () => {
    const c = warmupCandidates(4, weekPlan(4).warmup!);
    expect(c.map((q) => q.variant)).toEqual(['stepskip', 'identify', 'updown']);
    expect(c.every((q) => q.rounds === weekPlan(4).warmup!.rounds)).toBe(true);
    expect(warmupCandidates(1, weekPlan(1).warmup!).map((q) => q.variant)).toEqual(['updown']);
  });

  it('không bao giờ lặp trò của buổi trước; đi hết các trò trước khi lặp', () => {
    const cands = warmupCandidates(9, weekPlan(9).warmup!);
    expect(cands.length).toBeGreaterThanOrEqual(3);
    let recent: QuizVariant[] = [];
    const seq: QuizVariant[] = [];
    for (let i = 0; i < 12; i++) {
      const q = rotateWarmup(cands, recent)!;
      seq.push(q.variant);
      recent = pushWarmupRecent(recent, q.variant);
    }
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    expect(new Set(seq.slice(0, cands.length)).size).toBe(Math.min(cands.length, WARMUP_RECENT_MAX + 1));
    // một trò → giữ
    expect(rotateWarmup(cands.slice(0, 1), [cands[0].variant])).toBe(cands[0]);
  });

  it('readWarmupRecent đọc mềm, pushWarmupRecent ≤ WARMUP_RECENT_MAX', () => {
    expect(readWarmupRecent({ ...defaultData(NOW).settings, warmupRecent: ['read', 'xx', 3 as unknown as string, 'updown'] })).toEqual(['read', 'updown']);
    let r: QuizVariant[] = [];
    for (const v of ['updown', 'read', 'identify', 'stepskip', 'interval', 'landmark', 'theory', 'majorminor'] as QuizVariant[]) r = pushWarmupRecent(r, v);
    expect(r.length).toBe(WARMUP_RECENT_MAX);
    expect(r[0]).toBe('majorminor');
  });

  it('kế hoạch buổi (bé thật tuần 4): trò khởi động đổi theo buổi trước, vẫn ≤ MAX_QUIZ_ROUNDS lượt', () => {
    const d = fixtureWeek4Child(NOW);
    const l = lesson('w4-l2');
    const warm = (data: AppData) => buildSessionPlan(l, data, { now: T, adaptive: false }).find((s) => s.kind === 'quiz' && s.warmup);
    const seen: string[] = [];
    let last: string | null = null;
    for (let i = 0; i < 6; i++) {
      const w = warm(d);
      if (!w || w.kind !== 'quiz') break;
      expect(w.quiz.rounds).toBeLessThanOrEqual(MAX_QUIZ_ROUNDS);
      if (last) expect(w.quiz.variant).not.toBe(last);
      last = w.quiz.variant;
      seen.push(last);
      d.settings = { ...d.settings, warmupRecent: pushWarmupRecent(readWarmupRecent(d.settings), w.quiz.variant) };
    }
    if (seen.length) expect(new Set(seen).size).toBeGreaterThanOrEqual(2);
  });

  it('tuần chấm bằng khởi động (tuần 3, chưa đạt): GIỮ đúng trò của tuần dù buổi trước đã chơi', () => {
    const d = defaultData(NOW);
    d.progress.currentWeek = 3;
    d.progress.lessonsCompleted = [...WEEKS[0].lessons, ...WEEKS[1].lessons].map((l) => l.id).concat('w3-l1');
    d.settings = { ...d.settings, warmupRecent: ['identify'] };
    for (const l of weekPlan(3).lessons) {
      const w = buildSessionPlan(l, d, { now: T }).find((s) => s.kind === 'quiz' && s.warmup);
      if (w && w.kind === 'quiz') expect(w.quiz.variant).toBe('identify');
    }
  });
});
