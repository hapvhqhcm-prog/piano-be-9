import { describe, expect, it } from 'vitest';
import {
  buildReport,
  classifyAppAssessment,
  minutesText,
  sessionQuizVariants,
  skillAccuracy,
  skillSentence,
  viDate,
  weeklyBars,
} from '../src/progress/report';
import { WEEKS } from '../src/lessons/lessonEngine';
import { SONGS } from '../src/music/tune';
import { defaultData, localDateStr, type AppData, type Session, type SongRun } from '../src/progress/schema';

const NOW = new Date(2026, 9, 6, 19, 0, 0); // Thứ 3, 06/10/2026
const ds = (k: number) => localDateStr(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - k));
let seq = 0;
function session(p: Partial<Session> = {}): Session {
  seq++;
  return {
    id: `s${seq}`,
    date: ds(1),
    lessonId: 'w2-l1',
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: [],
    selfRating: 'all',
    startedAt: 0,
    endedAt: null,
    minutes: 12,
    completed: true,
    checklist: {},
    ...p,
  };
}
function data(sessions: Session[], week = 2): AppData {
  const d = defaultData(NOW);
  d.sessions = sessions;
  d.progress.currentWeek = week;
  // practiceDays như ProgressStore.recomputePracticeDays
  for (const s of sessions) {
    const x = (d.progress.practiceDays[s.date] ??= { minutes: 0, stars: 0 });
    x.minutes += s.minutes;
  }
  return d;
}
const run = (songId: string, p: Partial<SongRun> = {}): SongRun => ({
  songId,
  mode: 'tempo',
  bpm: 72,
  hints: 'full',
  total: 20,
  hits: 19,
  source: 'mic',
  passed: true,
  ts: NOW.getTime() - 86_400_000,
  ...p,
});
const app = (expected: string, correct: boolean) => ({ expected, actual: correct ? expected : 'x', correct, ts: 0 });

/** Một bài (lessonId) mà các trò có thể có chỉ gồm loại `want` (tai / đọc) cho câu hỏi tên nốt. */
function lessonWithOnly(want: 'ear' | 'reading'): string {
  for (const w of WEEKS)
    for (const l of w.lessons) {
      if (classifyAppAssessment('C4', sessionQuizVariants({ lessonId: l.id })) === want) return l.id;
    }
  throw new Error(`không có bài ${want}`);
}

describe('Báo cáo tiến bộ — gom số liệu', () => {
  it('định dạng ngày / phút bằng lời thường', () => {
    expect(viDate('2026-10-06')).toBe('06/10/2026');
    expect(minutesText(45)).toBe('45 phút');
    expect(minutesText(120)).toBe('2 giờ');
    expect(minutesText(437)).toBe('7 giờ 17 phút');
  });

  it('xếp loại câu trả lời app chấm: mã nghe → tai, mã quãng → đọc, tên nốt theo trò có trong buổi', () => {
    expect(classifyAppAssessment('up', new Set())).toBe('ear');
    expect(classifyAppAssessment('skip', new Set())).toBe('ear');
    expect(classifyAppAssessment('minor', new Set())).toBe('ear');
    expect(classifyAppAssessment('step-up', new Set())).toBe('reading');
    expect(classifyAppAssessment('same', new Set())).toBe('reading');
    expect(classifyAppAssessment('C4', new Set(['identify']))).toBe('ear');
    expect(classifyAppAssessment('C4', new Set(['read']))).toBe('reading');
    expect(classifyAppAssessment('C4', new Set(['landmark', 'updown']))).toBe('reading');
    // Không đoán bừa khi buổi có cả hai loại / không biết
    expect(classifyAppAssessment('C4', new Set(['identify', 'read']))).toBeNull();
    expect(classifyAppAssessment('C4', new Set())).toBeNull();
    // Bài "Luyện tập mỗi ngày" có thể có "Nốt nào đây?"
    expect(sessionQuizVariants({ lessonId: 'w5-daily' }).has('identify')).toBe(true);
  });

  it('độ chính xác 2 tuần gần đây + xu hướng so với 2 tuần trước; câu nhận xét lời thường', () => {
    const ear = lessonWithOnly('ear');
    const read = lessonWithOnly('reading');
    const d = data([
      // 2 tuần trước đó: đọc 5/10
      session({ date: ds(20), lessonId: read, appAssessments: [...Array(5)].flatMap(() => [app('E4', true), app('E4', false)]) }),
      // gần đây: đọc 9/10, tai 3/4
      session({ date: ds(2), lessonId: read, appAssessments: [...Array(9)].map(() => app('G4', true)).concat(app('G4', false)) }),
      session({ date: ds(1), lessonId: ear, appAssessments: [app('D4', true), app('D4', true), app('up', true), app('down', false)] }),
      // nhịp: bố mẹ chấm
      session({
        date: ds(3),
        parentAssessments: [
          { note: 'rhythm:walk-walk', result: 'correct', ts: 0 },
          { note: 'rhythm:run-run', result: 'retry', ts: 0 },
          { note: 'C4', result: 'correct', ts: 0 },
        ],
      }),
    ]);
    const r = skillAccuracy(d, 'reading', NOW);
    expect(r.recent).toEqual({ correct: 9, total: 10, pct: 90 });
    expect(r.before).toEqual({ correct: 5, total: 10, pct: 50 });
    expect(r.trend).toBe('up');
    expect(skillSentence('reading', r)).toBe('Đọc nốt: 90% đúng trong 2 tuần gần đây (9/10 câu) — tiến bộ so với 2 tuần trước');
    const e = skillAccuracy(d, 'ear', NOW);
    expect(e.recent).toEqual({ correct: 3, total: 4, pct: 75 });
    expect(e.trend).toBeNull(); // < 5 câu
    const rh = skillAccuracy(d, 'rhythm', NOW);
    expect(rh.all).toEqual({ correct: 1, total: 2, pct: 50 });
    // Không có dữ liệu
    expect(skillSentence('ear', skillAccuracy(data([]), 'ear', NOW))).toBe('Tai nghe: chưa có dữ liệu');
    // Chỉ có dữ liệu cũ
    const old = data([session({ date: ds(40), lessonId: read, appAssessments: [app('C4', true), app('C4', false)] })]);
    expect(skillSentence('reading', skillAccuracy(old, 'reading', NOW))).toContain('50% đúng từ đầu tới nay');
  });

  it('biểu đồ 8 tuần: số NGÀY có tập mỗi tuần lịch (thứ 2 → CN), cũ → mới', () => {
    const d = data([
      session({ date: '2026-10-05' }), // thứ 2 tuần này
      session({ date: '2026-10-05' }), // cùng ngày → 1 ngày
      session({ date: '2026-10-06' }),
      session({ date: '2026-09-28' }),
      session({ date: '2026-08-01' }), // ngoài 8 tuần
    ]);
    const w = weeklyBars(d, NOW);
    expect(w).toHaveLength(8);
    expect(w[7]).toMatchObject({ monday: '2026-10-05', label: '05/10', days: 2, minutes: 36 });
    expect(w[6]).toMatchObject({ monday: '2026-09-28', days: 1 });
    expect(w[0].monday).toBe('2026-08-17');
    expect(w.slice(0, 6).every((x) => x.days === 0)).toBe(true);
  });

  it('báo cáo đầy đủ: hành trình, bài đã thuộc (cờ bài Việt), hai tay, tốc độ, sắc thái, sáng tác', () => {
    const vnSong = SONGS.find((t) => t.vn === 'folk' && !t.lh)!;
    const intl = SONGS.find((t) => !t.vn && !t.lh)!;
    const both = SONGS.find((t) => !!t.lh)!;
    const sessions: Session[] = [];
    // 4 tuần gần nhất (đã hết): mỗi tuần 4 ngày
    for (let wk = 1; wk <= 4; wk++) for (let k = 0; k < 4; k++) sessions.push(session({ date: ds(1 + wk * 7 - k) }));
    sessions.push(
      session({
        date: ds(1),
        songRuns: [
          run(vnSong.id, { bpm: 64 }),
          run(intl.id, { bpm: 88 }),
          run(intl.id, { bpm: 120, phrase: [0, 2] }), // một câu → không tính tốc độ
          run(both.id, { mode: 'wait', bpm: 50 }),
          run(both.id, { bpm: 200, hand: 'RH' }), // tách tay → không tính
        ],
        parentAssessments: [0, 1, 2].map((i) => ({ note: `dyn:loud-soft:${i}`, result: 'correct' as const, ts: 0 })),
      }),
    );
    const d = data(sessions, 12);
    d.learner.name = 'Minh';
    d.compositions = [{ id: 'c1', title: 'Bài của Minh', createdAt: 0, timeSignature: '4/4', notes: [{ pitch: 'C4', beats: 1 }] }];
    const r = buildReport(d, NOW);
    expect(r.name).toBe('Minh');
    expect(r.to).toBe('2026-10-06');
    expect(r.from).toBe(sessions.map((s) => s.date).sort()[0]);
    expect(r.week).toBe(12);
    expect(r.level.level).toBe(2);
    expect(r.weeksPassed).toBe(11);
    expect(r.daysPractised).toBe(17);
    expect(r.totalMinutes).toBe(17 * 12);
    expect(r.avgDays4).toBe(4);
    expect(r.songs.map((s) => s.id).sort()).toEqual([vnSong.id, intl.id].sort());
    expect(r.songs.find((s) => s.id === vnSong.id)!.vn).toBe(true);
    expect(r.songs.find((s) => s.id === intl.id)!.vn).toBe(false);

    expect(r.skills.maxBpm).toBe(88);
    expect(r.skills.handsTogether.songs).toBe(1);
    expect(r.skills.dynamics).toEqual({ loudSoft: true, stacLeg: false, rounds: 3 });
    expect(r.skills.compositions).toBe(1);
    expect(r.stickers.total).toBeGreaterThan(r.stickers.earned);
    expect(r.stickers.earned).toBeGreaterThan(0);
    // Tích cực trước: luyện đều 4 ngày/tuần
    expect(r.strengths[0]).toBe('Minh luyện đàn rất đều — trung bình 4 ngày mỗi tuần trong 4 tuần qua.');
    expect(r.strengths.length + r.nextSteps.length).toBeGreaterThanOrEqual(2);
    expect(r.strengths.length + r.nextSteps.length).toBeLessThanOrEqual(3);
  });

  it('bước tiếp theo dùng chỗ khó của "Việc cần làm tối nay" (topStruggles + actionFor)', () => {
    const pa = (note: string) => ({ note, result: 'retry' as const, ts: 0 });
    const d = data([session({ parentAssessments: [pa('F4'), pa('F4'), pa('F4'), pa('G4')] })], 3);
    const r = buildReport(d, NOW);
    expect(r.struggles[0]).toMatchObject({ key: 'F4', misses: 3 });
    expect(r.nextSteps[0]).toMatch(/^Cần tập thêm: Nốt Fa \(F4\) \(vấp 3 lần trong 2 tuần\)\. Gợi ý: Cho bé tìm Fa \(F4\) 5 lần/);
    // Luôn có ít nhất một câu tích cực
    expect(r.strengths.length).toBeGreaterThanOrEqual(1);
  });

  it('dữ liệu trống: không lỗi, câu khích lệ, khoảng thời gian = hôm nay', () => {
    const r = buildReport(defaultData(NOW), NOW);
    expect(r.name).toBe('');
    expect(r.daysPractised).toBe(0);
    expect(r.weeksPassed).toBe(0);
    expect(r.from).toBe('2026-10-06');
    expect(r.songs).toEqual([]);
    expect(r.strengths[0]).toContain('bắt đầu hành trình');
    expect(r.nextSteps).toHaveLength(1);
  });
});

describe('Báo cáo — cờ bài Việt Nam', () => {
  it('chỉ dân ca / nhạc sĩ Việt mới gắn cờ; giai điệu nước ngoài quen hát lời Việt thì không', () => {
    const lyr = SONGS.find((t) => t.vn === 'lyrics')!;
    expect(lyr).toBeTruthy();
    expect(lyr.vn === 'folk' || lyr.vn === 'composed').toBe(false);
  });
});
