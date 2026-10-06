import { describe, expect, it } from 'vitest';
import {
  BONUS_POOL,
  MAX_GAP,
  WELCOME_STICKER,
  bonusCollection,
  bonusForSession,
  bonusTimeline,
  hashStr,
  initialBonusState,
  stepBonus,
  lastFinishedSession,
  recapLine,
  sessionRecap,
} from '../src/lessons/bonusStickers';
import { defaultData, type AppData, type Session } from '../src/progress/schema';

let seq = 0;
function session(p: Partial<Session> = {}): Session {
  seq++;
  return {
    id: `k${seq.toString(36)}-${(seq * 7919).toString(36)}`,
    date: '2026-10-01',
    lessonId: 'w1-l1',
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: [],
    selfRating: null,
    startedAt: seq,
    endedAt: seq,
    minutes: 10,
    completed: true,
    checklist: {},
    ...p,
  };
}
const data = (sessions: Session[]): AppData => ({ ...defaultData(new Date(2026, 9, 4)), sessions });

describe('bonusStickers — sticker bất ngờ', () => {
  it('hashStr ổn định', () => {
    expect(hashStr('abc')).toBe(hashStr('abc'));
    expect(hashStr('abc')).not.toBe(hashStr('abd'));
  });

  it('buổi bài học đầu tiên = Chào mừng; buổi bài hát tự do / chưa xong không tính', () => {
    const free = session({ lessonId: 'w1-song-mary_lamb' });
    const open = session({ completed: false });
    const first = session();
    const tl = bonusTimeline(data([free, open, first]));
    expect(tl[0]).toMatchObject({ sessionId: first.id, kind: 'welcome', sticker: WELCOME_STICKER });
    expect(bonusForSession(data([free, open, first]), free.id)).toBeNull();
  });

  it('khoảng 1/4 buổi có trứng, không bao giờ quá MAX_GAP buổi liền không có', () => {
    const list = Array.from({ length: 200 }, () => session());
    const tl = bonusTimeline(data(list));
    const eggs = tl.filter((e) => e.kind === 'egg');
    expect(eggs.length).toBeGreaterThan(200 / 6);
    expect(eggs.length).toBeLessThan(200 / 2.5);
    const idx = eggs.map((e) => list.findIndex((s) => s.id === e.sessionId));
    let prev = 0;
    for (const i of idx) {
      expect(i - prev).toBeLessThanOrEqual(MAX_GAP);
      prev = i;
    }
  });

  it('ổn định: thêm buổi mới không đổi trứng của buổi cũ; ưu tiên sticker chưa có', () => {
    const list = Array.from({ length: 60 }, () => session());
    const a = bonusTimeline(data(list.slice(0, 30)));
    const b = bonusTimeline(data(list));
    expect(b.slice(0, a.length)).toEqual(a);
    const keys = b.filter((e) => e.kind === 'egg').map((e) => e.sticker.key);
    const firstN = keys.slice(0, Math.min(keys.length, BONUS_POOL.length));
    expect(new Set(firstN).size).toBe(firstN.length);
    const col = bonusCollection(data(list));
    expect(col[0].sticker.key).toBe('welcome');
    expect(col.reduce((n, c) => n + c.count, 0)).toBe(b.length);
  });

  it('gộp lịch sử (history.bonus = stepBonus…) không đổi sổ sticker lẫn trứng của các buổi còn lại', () => {
    const list = Array.from({ length: 40 }, () => session());
    const full = data(list);
    const st = initialBonusState();
    list.slice(0, 25).forEach((s) => stepBonus(st, s));
    const folded = { ...data(list.slice(25)), history: { bonus: st } } as unknown as AppData;
    expect(bonusCollection(folded)).toEqual(bonusCollection(full));
    expect(bonusTimeline(folded)).toEqual(bonusTimeline(full).filter((e) => list.slice(25).some((s) => s.id === e.sessionId)));
  });

  it('lastFinishedSession = buổi hoàn thành gần nhất', () => {
    const s1 = session({ endedAt: 100 });
    const s2 = session({ endedAt: 200 });
    const s3 = session({ completed: false, endedAt: null });
    expect(lastFinishedSession(data([s1, s2, s3]))?.id).toBe(s2.id);
  });
});

describe('sessionRecap — tóm tắt & sao cuối buổi', () => {
  it('đếm nốt, bỏ ghi nhận không phải nốt, sao theo đúng-ngay-lần-đầu', () => {
    const s = session({
      parentAssessments: [
        { note: 'C4', result: 'correct', ts: 0 },
        { note: 'D4', result: 'retry', ts: 0 },
        { note: 'D4', result: 'correct', ts: 0 },
        { note: 'tech:arm-drop', result: 'correct', ts: 0 },
        { note: 'teach-back', result: 'correct', ts: 0 },
      ],
      appAssessments: [{ expected: 'up', actual: 'up', correct: true, ts: 0 }],
      songRuns: [{ songId: 'x', mode: 'wait', bpm: 60, hints: 'full', total: 10, hits: 10, source: 'mic', passed: true, ts: 0 }],
    });
    const r = sessionRecap(s);
    expect(r.notes).toBe(12);
    expect(r.quizzes).toBe(1);
    expect(r.firstTry).toBeCloseTo(3 / 4);
    expect(r.stars).toBe(2);
    expect(recapLine(r)).toBe('Hôm nay con đàn 12 nốt và đoán đúng 1 câu đố!');
  });

  it('không bao giờ dưới 1 sao; không có dữ liệu → 3 sao, không có dòng tóm tắt', () => {
    const bad = session({ parentAssessments: [{ note: 'C4', result: 'retry', ts: 0 }, { note: 'C4', result: 'retry', ts: 0 }] });
    expect(sessionRecap(bad).stars).toBe(1);
    const empty = sessionRecap(session());
    expect(empty.stars).toBe(3);
    expect(recapLine(empty)).toBeNull();
  });
});
