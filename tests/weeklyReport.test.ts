import { afterEach, describe, expect, it } from 'vitest';
import { compactData } from '../src/progress/compaction';
import { dayKey } from '../src/progress/history';
import { defaultData, localDateStr, type AppData, type Session, type SongRun } from '../src/progress/schema';
import {
  buildWeeklySummary,
  helpFor,
  historyMondays,
  improvementsOf,
  micNoteOf,
  praiseFor,
  weeklyText,
  type AdviceInput,
} from '../src/progress/weeklyReport';
import { addDays, lastCompletedMonday, weekHasPractice, weeklyReportDue } from '../src/progress/weeklyReportDue';
import { fixtureWeek4Child } from './fixtures/week4Child';

/** Thứ 4, 14/10/2026 10:00 giờ máy — tuần này bắt đầu thứ 2 12/10, tuần vừa hết 05/10 – 11/10. */
const NOW = new Date(2026, 9, 14, 10);
/** process.env (môi trường node của vitest; tsconfig không có kiểu node) */
const ENV = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

/** progress.practiceDays như ProgressStore.recomputePracticeDays (tổng hợp đã gộp + buổi còn giữ). */
function recompute(d: AppData): AppData {
  const days: AppData['progress']['practiceDays'] = {};
  for (const [date, [minutes, stars]] of Object.entries(d.history?.practiceDays ?? {})) days[date] = { minutes, stars };
  for (const s of d.sessions) {
    if (s.minutes === 0 && !s.selfRating) continue;
    const e = (days[s.date] ??= { minutes: 0, stars: 0 });
    e.minutes += s.minutes;
    if (s.selfRating) e.stars += 3;
  }
  d.progress.practiceDays = days;
  return d;
}

let n = 0;
function session(date: string, o: Partial<Session> = {}): Session {
  const [y, m, dd] = date.split('-').map(Number);
  const t = new Date(y, m - 1, dd, 18).getTime();
  return {
    id: `s${n++}`,
    date,
    lessonId: 'w5-l1',
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: [],
    selfRating: 'all',
    startedAt: t,
    endedAt: t + 600_000,
    minutes: 10,
    completed: true,
    checklist: {},
    ...o,
  };
}
function run(songId: string, date: string, o: Partial<SongRun> = {}): SongRun {
  const [y, m, dd] = date.split('-').map(Number);
  return { songId, mode: 'tempo', bpm: 60, hints: 'names', phrase: null, total: 20, hits: 18, source: 'mic', passed: true, ts: new Date(y, m - 1, dd, 18, 5).getTime(), ...o };
}
function base(): AppData {
  const d = defaultData(new Date(2026, 8, 1));
  d.progress.currentWeek = 5;
  return d;
}

const advice = (o: Partial<AdviceInput> = {}): AdviceInput => ({
  name: '',
  days: 4,
  mastered: [],
  improvements: [],
  concerts: { count: 0, audience: [], others: 0 },
  challenge: null,
  course: null,
  handsPct: null,
  struggle: null,
  mic: null,
  inProgress: false,
  ...o,
});

describe('tuần lịch (thứ 2 → CN, giờ máy)', () => {
  it('tuần vừa hết đổi đúng lúc nửa đêm CN → thứ 2', () => {
    expect(lastCompletedMonday(new Date(2026, 9, 11, 23, 59))).toBe('2026-09-28');
    expect(lastCompletedMonday(new Date(2026, 9, 12, 0, 1))).toBe('2026-10-05');
    expect(lastCompletedMonday(NOW)).toBe('2026-10-05');
    expect(addDays('2026-10-26', 7)).toBe('2026-11-02'); // qua tháng
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04'); // qua năm
  });

  it('buổi CN thuộc tuần cũ, buổi thứ 2 thuộc tuần mới; chấm ngày đúng thứ', () => {
    const d = base();
    d.sessions.push(session('2026-10-11'), session('2026-10-12'), session('2026-10-05'));
    recompute(d);
    const a = buildWeeklySummary(d, '2026-10-05', NOW);
    expect(a.dayDots).toEqual([true, false, false, false, false, false, true]);
    expect(a.days).toBe(2);
    expect(a.inProgress).toBe(false);
    const b = buildWeeklySummary(d, '2026-10-12', NOW);
    expect(b.dayDots[0]).toBe(true);
    expect(b.days).toBe(1);
    expect(b.inProgress).toBe(true);
    // Truyền ngày giữa tuần → vẫn tính từ thứ 2
    expect(buildWeeklySummary(d, '2026-10-08', NOW).monday).toBe('2026-10-05');
  });

  describe('múi giờ khác (giờ máy, không phải UTC)', () => {
    const tz = ENV.TZ;
    afterEach(() => {
      if (tz === undefined) delete ENV.TZ;
      else ENV.TZ = tz;
    });
    for (const zone of ['Asia/Ho_Chi_Minh', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      it(`bài thuộc lúc 23:30 CN vẫn tính cho tuần đó (${zone})`, () => {
        ENV.TZ = zone;
        const d = base();
        const ts = new Date(2026, 9, 11, 23, 30).getTime();
        d.sessions.push(session('2026-10-11', { songRuns: [run('mary_lamb', '2026-10-11', { ts })] }));
        recompute(d);
        expect(buildWeeklySummary(d, '2026-10-05', NOW).mastered.map((s) => s.id)).toEqual(['mary_lamb']);
        expect(buildWeeklySummary(d, '2026-10-12', NOW).mastered).toEqual([]);
        expect(lastCompletedMonday(new Date(2026, 9, 12, 0, 5))).toBe('2026-10-05');
      });
    }
  });
});

describe('viên "Báo cáo tuần đã sẵn sàng"', () => {
  it('hiện khi tuần vừa hết có ngày tập và bố mẹ chưa xem; ẩn khi đã xem', () => {
    const d = base();
    d.sessions.push(session('2026-10-07'));
    recompute(d);
    expect(weeklyReportDue(d, NOW)).toBe('2026-10-05');
    (d.settings as { weeklyReportSeen?: string }).weeklyReportSeen = '2026-10-05';
    expect(weeklyReportDue(d, NOW)).toBeNull();
    // Tuần sau: lại có báo cáo mới
    d.sessions.push(session('2026-10-13'));
    recompute(d);
    expect(weeklyReportDue(d, new Date(2026, 9, 19, 8))).toBe('2026-10-12');
  });

  it('không hiện khi tuần vừa hết không tập ngày nào (kể cả tuần này có tập)', () => {
    const d = base();
    d.sessions.push(session('2026-09-30'), session('2026-10-13'));
    recompute(d);
    expect(weekHasPractice(d, '2026-10-05')).toBe(false);
    expect(weeklyReportDue(d, NOW)).toBeNull();
  });

  it('buổi mở rồi thoát (0 phút, không tự chấm) không tính', () => {
    const d = base();
    d.sessions.push(session('2026-10-06', { minutes: 0, selfRating: null, completed: false }));
    recompute(d);
    expect(weeklyReportDue(d, NOW)).toBeNull();
  });
});

describe('báo cáo một tuần — dữ liệu giống bé thật (tuần 4)', () => {
  const d = recompute(fixtureWeek4Child(NOW));
  const last = buildWeeklySummary(d, '2026-10-05', NOW);

  it('ngày, phút, buổi, sao khớp với buổi học của tuần', () => {
    const week = d.sessions.filter((s) => s.date >= '2026-10-05' && s.date <= '2026-10-11');
    const dates = new Set(week.map((s) => s.date));
    expect(last.days).toBe(dates.size);
    expect(last.minutes).toBe(week.reduce((a, s) => a + s.minutes, 0));
    expect(last.sessions).toBe(week.filter((s) => s.minutes > 0 || s.completed).length);
    expect(last.stars).toBe(week.filter((s) => s.selfRating).length * 3);
    expect(last.detail).toBe('full');
    expect(last.dayDots.filter(Boolean).length).toBe(last.days);
  });

  it('có tuần giáo trình, lời khen, việc bố mẹ giúp, bản chữ', () => {
    expect(last.course?.week).toBeGreaterThanOrEqual(3);
    expect(last.praise.length).toBeGreaterThanOrEqual(1);
    expect(last.praise.length).toBeLessThanOrEqual(2);
    expect(last.help.length).toBeGreaterThan(10);
    const text = weeklyText(last);
    expect(text).toContain('05/10 – 11/10/2026');
    expect(text).toContain(`Ngày tập: ${last.days}/7`);
    expect(text).toContain('Bố mẹ giúp:');
    expect(text).not.toContain('bé '); // chưa đặt tên → không có tên
    expect(weeklyText({ ...last, name: 'An' })).toContain('bé An');
  });

  it('bài thuộc từ đầu đều rơi đúng một tuần (không trùng, không sót)', () => {
    const all = historyMondays(d, NOW).flatMap((m) => buildWeeklySummary(d, m, NOW).mastered.map((s) => s.id));
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(['hot_cross_buns', 'mary_lamb', 'three_chicks'].filter((id) => all.includes(id)).sort());
    expect(all).toContain('hot_cross_buns');
  });

  it('lịch sử: tuần này + tối đa 8 tuần đã hết, không có tuần trước khi bé bắt đầu', () => {
    const ms = historyMondays(d, NOW);
    expect(ms[0]).toBe('2026-10-12');
    expect(ms.length).toBeLessThanOrEqual(9);
    const first = d.sessions.map((s) => s.date).sort()[0];
    expect(ms[ms.length - 1] <= first).toBe(true);
    expect(addDays(ms[ms.length - 1], 7) > first).toBe(true);
  });
});

describe('gộp lịch sử (compaction) — tuần cũ vẫn có phần còn lại', () => {
  it('ngày / phút / sao / bài thuộc giữ nguyên; số buổi, tiến bộ → null', () => {
    const fresh = recompute(fixtureWeek4Child(NOW));
    const mondays = historyMondays(fresh, NOW);
    const before = mondays.map((m) => buildWeeklySummary(fresh, m, NOW));
    const d = recompute(fixtureWeek4Child(NOW));
    const r = compactData(d, NOW, 7); // gộp mọi buổi cũ hơn 7 ngày (tuần 1–3 đã qua)
    expect(r.folded).toBeGreaterThan(0);
    recompute(d);
    let summaries = 0;
    for (const [i, m] of mondays.entries()) {
      const a = before[i];
      const b = buildWeeklySummary(d, m, NOW);
      expect(b.days).toBe(a.days);
      expect(b.dayDots).toEqual(a.dayDots);
      expect(b.minutes).toBe(a.minutes);
      expect(b.stars).toBe(a.stars);
      expect(b.mastered).toEqual(a.mastered);
      expect(b.course?.week).toBe(a.course?.week);
      if (b.detail !== 'full') {
        summaries++;
        expect(b.sessions).toBeNull();
        expect(b.wholeSongs).toBeNull();
        expect(b.improvements).toBeNull();
        expect(b.mic).toBeNull();
        if (a.challenge?.done) expect(b.challenge?.done).toBe(true);
        expect(weeklyText(b)).toContain('gộp bớt chi tiết');
      }
    }
    expect(summaries).toBeGreaterThan(0);
  });

  it('progress.practiceDays rỗng (dữ liệu dựng tay) → đọc phần đã gộp + buổi còn giữ', () => {
    const d = recompute(fixtureWeek4Child(NOW));
    const ms = historyMondays(d, NOW);
    const m = ms[ms.length - 1];
    const a = buildWeeklySummary(d, m, NOW);
    compactData(d, NOW, 7);
    d.progress.practiceDays = {};
    const b = buildWeeklySummary(d, m, NOW);
    expect(b.detail).not.toBe('full');
    expect([b.days, b.minutes, b.stars]).toEqual([a.days, a.minutes, a.stars]);
  });

  it('tuần cắt ngang mốc gộp → partial', () => {
    const d = base();
    d.history = emptyHist('2026-10-08');
    expect(buildWeeklySummary(d, '2026-10-05', NOW).detail).toBe('partial');
    expect(buildWeeklySummary(d, '2026-09-28', NOW).detail).toBe('summary');
    expect(buildWeeklySummary(d, '2026-10-12', NOW).detail).toBe('full');
  });
});

function emptyHist(through: string): NonNullable<AppData['history']> {
  return {
    v: 1,
    compactedThrough: through,
    sessions: 0,
    completed: 0,
    counted: 0,
    firstDate: null,
    practiceDays: {},
    weeks: {},
    songs: {},
    targets: {},
    micPerfect: false,
    dynamicsDone: [],
    dynamicsRounds: 0,
    passedWeeks: [],
    stickers: [],
    skills: { reading: [0, 0], ear: [0, 0], rhythm: [0, 0] },
    parent: { p: {}, a: {}, m: {}, find: [0, 0], ear: [0, 0], tempo: [0, 0], sight: [0, 0] },
  };
}

describe('tiến bộ trong tuần', () => {
  it('bài: % nốt đúng tăng ≥ 10 điểm; tốc độ vượt kỷ lục; nhịp đều hơn; hai tay', () => {
    const d = base();
    const rh = (pct: number, date: string): Partial<SongRun> => ({
      hands: { RH: { hits: pct, total: 100 }, LH: { hits: pct, total: 100 } },
      songId: 'ode_joy_hands',
      ts: run('x', date).ts,
    });
    d.sessions.push(
      session('2026-09-29', {
        songRuns: [run('mary_lamb', '2026-09-29', { hits: 12, passed: false }), { ...run('x', '2026-09-29'), ...rh(60, '2026-09-29') } as SongRun],
        parentAssessments: Array.from({ length: 6 }, (_, k) => ({ note: `rhythm:${k}`, result: k < 3 ? 'correct' : 'retry', ts: 0 }) as const),
      }),
      session('2026-10-06', {
        songRuns: [run('mary_lamb', '2026-10-06', { hits: 19, bpm: 72 }), { ...run('x', '2026-10-06'), ...rh(85, '2026-10-06') } as SongRun],
        parentAssessments: Array.from({ length: 6 }, (_, k) => ({ note: `rhythm:${k}`, result: k < 5 ? 'correct' : 'retry', ts: 0 }) as const),
      }),
    );
    recompute(d);
    const imp = improvementsOf(d, '2026-10-05');
    const kinds = imp.map((i) => i.kind);
    expect(kinds).toContain('song');
    expect(imp.find((i) => i.kind === 'song')).toMatchObject({ label: 'Chú cừu nhỏ', from: 60, to: 95 });
    expect(imp.length).toBeLessThanOrEqual(3);
    // hai tay 60 → 85 (+25), nhịp 50 → 83 (+33), bài 60 → 95 (+35): xếp theo mức tăng
    expect(kinds.slice(0, 3)).toEqual(['song', 'skill', 'hands']);
    const s = buildWeeklySummary(d, '2026-10-05', NOW);
    expect(s.handsPct).toBe(85);
    expect(weeklyText(s)).toContain('Tiến bộ');
  });

  it('không so được (tuần trước không có dữ liệu) → không bịa tiến bộ', () => {
    const d = base();
    d.sessions.push(session('2026-10-06', { songRuns: [run('mary_lamb', '2026-10-06')] }));
    expect(improvementsOf(d, '2026-10-05')).toEqual([]);
  });
});

describe('ghi chú micro', () => {
  it('tắt / nghe chưa chắc / bình thường', () => {
    expect(micNoteOf([session('2026-10-06', { songRuns: [run('a', '2026-10-06', { source: 'parent' })] })])?.kind).toBe('off');
    const mic = (over: boolean) => ({ expected: 'C4', firstHeard: 'C4', firstTry: true, wrongCount: 0, ts: 0, ...(over ? { parentOverride: 'correct' as const } : {}) });
    expect(micNoteOf([session('2026-10-06', { micAssessments: [mic(true), mic(true), mic(false), mic(false), mic(false)] })])?.kind).toBe('unreliable');
    expect(micNoteOf([session('2026-10-06', { micAssessments: [mic(false), mic(false), mic(false), mic(false), mic(true), mic(false)] })])).toBeNull();
    expect(micNoteOf([session('2026-10-06')])).toBeNull(); // không có gì để chấm
  });
});

describe('quy tắc "nên khen" & "bố mẹ giúp"', () => {
  it('khen: bài mới thuộc trước, tối đa 2 câu, không khen khi không tập', () => {
    const p = praiseFor(
      advice({
        days: 5,
        mastered: [{ id: 'mary_lamb', title: 'Mary có chú cừu non' }],
        challenge: { icon: '', title: 'Bốn ngày chăm', done: true, text: 'Xong!' },
      }),
    );
    expect(p).toHaveLength(2);
    expect(p[0]).toContain('Mary có chú cừu non');
    expect(p[1]).toContain('5 ngày');
    expect(praiseFor(advice({ days: 0, mastered: [{ id: 'x', title: 'X' }] }))).toEqual([]);
    expect(praiseFor(advice({ days: 2 }))[0]).toContain('2 ngày');
    expect(praiseFor(advice({ days: 2, concerts: { count: 1, audience: ['Ông', 'Bà'], others: 1 } }))[0]).toContain('3 người');
  });

  it('giúp: thứ tự ưu tiên', () => {
    expect(helpFor(advice({ days: 0 }))).toContain('giờ cố định');
    expect(helpFor(advice({ days: 5, mic: { kind: 'unreliable', text: '' }, handsPct: 40 }))).toContain('Cài micro');
    expect(helpFor(advice({ days: 5, handsPct: 55 }))).toContain('tách từng tay');
    const course = { week: 5, title: 't', island: 'i', islandEmoji: '', reached: [], passedNow: false, criterion: { text: 'Bài X trọn bài', days: 1, need: 2, passed: false, complete: false } };
    expect(helpFor(advice({ days: 5, course }))).toContain('còn 1 ngày');
    expect(helpFor(advice({ days: 2 }))).toContain('2 ngày');
    expect(helpFor(advice({ days: 5, struggle: 'Nốt Rê (D4)' }))).toContain('Nốt Rê');
    expect(helpFor(advice({ days: 5 }))).toContain('bài con thích');
  });
});

it('dayKey / localDateStr cùng một quy ước (giờ máy)', () => {
  const t = new Date(2026, 9, 11, 23, 59);
  expect(dayKey(t)).toBe(localDateStr(t));
});

describe('ảnh chia sẻ — chữ (không emoji, không kể trùng)', async () => {
  const { highlightLines, noEmoji, weeklyFileName } = await import('../src/ui/screens/weeklyReportImage');
  it('lọc emoji, giữ dấu tiếng Việt', () => {
    expect(noEmoji('đặt ⏰ nhắc giờ (nút “▶ Làm ngay”) 🇻🇳 Lý cây đa')).toBe('đặt nhắc giờ (nút “ Làm ngay”) Lý cây đa');
    expect(noEmoji('📝 Bài của bố')).toBe('Bài của bố');
  });
  it('bài mới thuộc không bị kể lại ở "chơi trọn"; tên tệp không có tên bé', () => {
    const d = base();
    d.learner.name = 'An';
    d.sessions.push(session('2026-10-06', { songRuns: [run('mary_lamb', '2026-10-06'), run('hot_cross_buns', '2026-10-06', { mode: 'wait' })] }));
    recompute(d);
    const s = buildWeeklySummary(d, '2026-10-05', NOW);
    const lines = highlightLines(s);
    expect(lines[0]).toContain('Thuộc bài mới');
    expect(lines.find((l) => l.startsWith('Chơi trọn'))).toMatch(/thêm 1 bài: “Bánh nóng”/);
    expect(weeklyFileName(s)).toBe('bao-cao-tuan-2026-10-05.png');
  });
});
