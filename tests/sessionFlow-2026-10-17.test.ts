/**
 * (+ 2026-10-17, rà soát kỹ sư trưởng) Điều phối buổi học (src/ui/screens/sessionFlow.ts) với App GIẢ (FlowEnv ghi lại các màn) +
 * ProgressStore THẬT: thứ tự mở đầu, quay lại, hết giờ, chơi lại sau buổi nhẹ tay, màn kết (banner / bài thưởng / thử thách /
 * biểu diễn — tối đa MỘT nút mời).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorage, ProgressStore, STORAGE_KEY } from '../src/progress/ProgressStore';
import { defaultData, localDateStr, type AppData, type Session, type SongRun } from '../src/progress/schema';
import { WEEKS, activityDoneId, findLesson } from '../src/lessons/lessonEngine';
import { makeHomework } from '../src/lessons/homework';
import { OCTAVE_LOG_KEY } from '../src/lessons/middleC';
import { canWrap, pickEndOffer, startSessionFlow, type EndInfo, type FlowView } from '../src/ui/screens/sessionFlow';
import type { Lesson } from '../src/lessons/types';
import type { StretchOffer } from '../src/lessons/sessionSelectors';

const NOW = new Date(2026, 9, 17, 17).getTime();
const DAY = 86_400_000;

const lesson = (id: string): Lesson => {
  const l = findLesson(id);
  if (!l) throw new Error(id);
  return l;
};

const run = (songId: string, passed: boolean, ts: number, extra: Partial<SongRun> = {}): SongRun =>
  ({ songId, mode: 'tempo', level: 2, bpm: 50, hints: 'names', phrase: null, total: 10, hits: passed ? 10 : 5, source: 'mic', passed, ts, ...extra }) as SongRun;

function sess(i: number, daysAgo: number, lessonId: string, runs: (t: number) => SongRun[], extra: Partial<Session> = {}): Session {
  const date = new Date(NOW - daysAgo * DAY);
  const t = date.getTime() - 3600e3;
  return {
    id: `s-${i}`, date: localDateStr(date), lessonId, parentAssessments: [], appAssessments: [], micAssessments: [], songRuns: runs(t),
    selfRating: 'all', startedAt: t, endedAt: t + 10 * 60e3, minutes: 10, completed: true, checklist: {}, ...extra,
  };
}

/** Bé ở tuần 6 (đã xong tuần 1–5): 'struggling' = 5 buổi có dừng nhẹ nhàng → nhẹ tay; 'cruising' = đúng hết → thử thách. */
function child(kind: 'struggling' | 'cruising'): AppData {
  const d = defaultData(new Date(NOW - 40 * DAY));
  d.progress.currentWeek = 6;
  d.progress.lessonsCompleted = WEEKS.slice(0, 5).flatMap((w) => w.lessons.map((l) => l.id));
  for (let i = 0; i < 5; i++) {
    d.sessions.push(
      kind === 'struggling'
        ? sess(i, 5 - i, 'w5-l1', (t) => [run('frog_hop', false, t + 1), run('frog_hop', false, t + 2), run('frog_hop', false, t + 3), run('mary_lamb', true, t + 4)], {
            kindStops: ['frog_hop'],
          })
        : sess(i, 5 - i, 'w5-l1', (t) => [run('frog_hop', true, t + 1, { source: 'parent', checklist: { notes: true, beat: true, fingers: true } })], {
            parentAssessments: ['C4', 'D4', 'E4'].map((note) => ({ note, result: 'correct' as const, ts: 0 })),
          }),
    );
  }
  return d;
}

/** App giả: ghi lại từng màn (nhãn), màn hiện tại, màn kết. */
function harness(data: AppData) {
  const clock = { now: NOW };
  const kv = new MemoryStorage();
  kv.setItem(STORAGE_KEY, JSON.stringify(data));
  const store = new ProgressStore(kv, () => new Date(clock.now), { saveDelayMs: 0, autoCompact: false, pageEvents: false });
  const log: string[] = [];
  const st: { cur: FlowView | null; ended: EndInfo | null; home: boolean } = { cur: null, ended: null, home: false };
  const env = {
    store,
    now: () => clock.now,
    show: (v: FlowView) => {
      st.cur = v;
      log.push(v.kind === 'step' ? v.step.kind : v.kind);
    },
    home: () => (st.home = true),
    stopMic: () => undefined,
    end: (e: EndInfo) => (st.ended = e),
  };
  const start = (l: Lesson, opts: { replay?: boolean; replayOf?: readonly number[] } = {}) => {
    log.length = 0;
    st.cur = null;
    st.ended = null;
    st.home = false;
    const flow = startSessionFlow(env, l, opts);
    flow.go(0);
    return flow;
  };
  const cur = (): FlowView => {
    if (!st.cur) throw new Error('chưa có màn');
    return st.cur;
  };
  /** Bấm "xong" cho tới khi tới màn kết (giới hạn bước phòng lặp vô hạn) */
  const finishAll = (each?: (v: FlowView) => void) => {
    for (let k = 0; k < 60 && !st.ended; k++) {
      each?.(cur());
      cur().onDone();
    }
    if (!st.ended) throw new Error('không tới màn kết');
  };
  return { store, clock, log, st, start, cur, finishAll };
}

/** localStorage giả cho nhật ký lệch quãng 8 (→ "📍 Tìm Đô giữa" đầu buổi) */
let savedLs: unknown;
beforeEach(() => {
  savedLs = (globalThis as { localStorage?: unknown }).localStorage;
});
afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = savedLs;
});
function octaveTroubleLs(): void {
  const ls = new MemoryStorage();
  ls.setItem(OCTAVE_LOG_KEY, JSON.stringify({ events: [NOW - 3 * 3600e3, NOW - 2 * 3600e3] }));
  (globalThis as { localStorage?: unknown }).localStorage = ls;
}

describe('sessionFlow — mở đầu buổi', () => {
  const hwFrog = () =>
    makeHomework({ songId: 'frog_hop', title: 'Ếch', phrase: null, place: 'Cả bài', mode: 'tempo', bpm: 50, date: localDateStr(new Date(NOW - DAY)), at: NOW - DAY });

  // (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") bài tập về nhà THAY khởi động bằng nhạc; khởi động tay chỉ khi không
  // có bài tập về nhà / thẻ tư thế
  it('thứ tự: Đô giữa → bài tập về nhà (THAY nhạc) → tư thế → bước 2 (không khởi động tay)', () => {
    octaveTroubleLs();
    const d = child('cruising');
    (d.settings as { postureFull?: boolean }).postureFull = true;
    d.settings.homework = hwFrog();
    const h = harness(d);
    const flow = h.start(lesson('w6-l1'));
    expect(flow.steps[0].kind).toBe('posture');
    for (let k = 0; k < 3; k++) h.cur().onDone();
    expect(h.log.slice(0, 3)).toEqual(['middleC', 'homework', 'posture']);
    expect(h.log[3]).toBe(flow.steps[1].kind);
    expect(h.log).not.toContain('music');
    expect(h.log).not.toContain('drill');
  });

  it('không có bài tập về nhà: nhạc → khởi động tay (thẻ tư thế chỉ khi `full`)', () => {
    const d = child('cruising');
    const h = harness(d);
    const flow = h.start(lesson('w6-l1'));
    const st0 = flow.steps[0];
    const full = st0.kind === 'posture' && st0.full;
    for (let k = 0; k < 2; k++) h.cur().onDone();
    expect(h.log.slice(0, 2)).toEqual(full ? ['music', 'posture'] : ['music', 'drill']);
    expect(h.log[2]).toBe(flow.steps[1].kind);
    expect(h.log).not.toContain('homework');
  });

  // (2026-10-25, OWNER "bỏ phần phụ huynh") dải "👪 Hôm nay để ý" đã bỏ: màn mở đầu không còn chữ cho bố mẹ
  it('mở đầu không còn dải "👪 Hôm nay để ý" (không có trường focus); quay lại vẫn về màn nhạc', () => {
    const d = child('cruising');
    const h = harness(d);
    h.start(lesson('w6-l1'));
    if (h.cur().kind === 'middleC') h.cur().onDone();
    const music = h.cur();
    expect(music.kind).toBe('music');
    expect('focus' in music).toBe(false);
    music.onDone();
    expect(['posture', 'drill']).toContain(h.cur().kind);
    h.cur().onBack();
    const again = h.cur();
    expect(again.kind).toBe('music');
    expect('focus' in again).toBe(false);
  });

  it('QUAY LẠI từ bước 2 → về bước con CUỐI của mở đầu; KHÔNG chạy lại Đô giữa / bài tập về nhà', () => {
    octaveTroubleLs();
    const d = child('cruising');
    d.settings.homework = hwFrog();
    const h = harness(d);
    const flow = h.start(lesson('w6-l1'));
    const full = flow.steps[0].kind === 'posture' && flow.steps[0].full;
    while (h.log[h.log.length - 1] !== (full ? 'posture' : 'homework')) h.cur().onDone();
    h.cur().onDone(); // sang bước 2
    const before = h.log.length;
    h.cur().onBack();
    expect(h.log.slice(before)).toEqual([full ? 'posture' : 'homework']);
    expect(h.log.filter((x) => x === 'middleC')).toHaveLength(1);
    // lùi tới màn đầu của mở đầu rồi lùi nữa → rời buổi
    for (let k = 0; k < 4 && !h.st.home; k++) h.cur().onBack();
    expect(h.st.home).toBe(true);
  });

  it('không mời bài tập về nhà của bài ĐÃ THUỘC', () => {
    const d = child('cruising');
    d.settings.homework = hwFrog();
    // frog_hop đã thuộc: trọn bài theo nhịp ≥ 60 đạt ở 2 ngày
    d.sessions.push(
      sess(10, 3, 'w5-l1', (t) => [run('frog_hop', true, t + 5, { bpm: 60 })]),
      sess(11, 2, 'w5-l1', (t) => [run('frog_hop', true, t + 5, { bpm: 60 })]),
    );
    const h = harness(d);
    h.start(lesson('w6-l1'));
    if (h.cur().kind === 'middleC') h.cur().onDone();
    expect(h.cur().kind).toBe('music');
  });
});

describe('sessionFlow — hết giờ', () => {
  it('canWrap: chỉ khi đã có ≥ 1 hoạt động của bài (hoặc buổi không có hoạt động)', () => {
    expect(canWrap({ now: 10, deadline: 5, activitiesDone: 0, hasActivities: true })).toBe(false);
    expect(canWrap({ now: 10, deadline: 5, activitiesDone: 1, hasActivities: true })).toBe(true);
    expect(canWrap({ now: 4, deadline: 5, activitiesDone: 1, hasActivities: true })).toBe(false);
    expect(canWrap({ now: 10, deadline: 5, activitiesDone: 0, hasActivities: false })).toBe(true);
  });

  it('mở đầu dài làm hết giờ → bước trước bài KHÔNG nhảy tới màn kết; sau hoạt động đầu tiên mới kết', () => {
    const d = child('cruising');
    d.progress.currentWeek = 9;
    d.progress.lessonsCompleted = WEEKS.slice(0, 8).flatMap((w) => w.lessons.map((l) => l.id));
    const l = WEEKS[8].lessons.find((x) => !x.isWeekTest && x.activities.length >= 2)!;
    const h = harness(d);
    const flow = h.start(l);
    const firstAct = flow.steps.findIndex((s) => s.kind === 'activity');
    const acts = flow.steps.filter((s) => s.kind === 'activity').length;
    expect(acts).toBeGreaterThanOrEqual(2);
    // buổi có bước trước bài (ôn nhanh / khởi động tai / đọc nhạc 1 phút)
    expect(firstAct).toBeGreaterThan(1);
    // hết giờ ngay trong mở đầu
    h.clock.now += 60 * 60_000;
    h.finishAll();
    expect(h.log.filter((x) => x === 'activity')).toHaveLength(1);
    expect(h.log[h.log.length - 1]).toBe('closing');
    // hoạt động đầu đã đánh dấu xong → buổi sau học tiếp phần còn lại
    const first = flow.steps[firstAct];
    if (first.kind === 'activity') expect(h.store.get().progress.lessonsCompleted).toContain(activityDoneId(l.id, first.index));
    expect(h.store.get().progress.lessonsCompleted).not.toContain(l.id);
  });

  it('còn giờ → đi hết các hoạt động như cũ', () => {
    const d = child('cruising');
    const l = lesson('w6-l1');
    const h = harness(d);
    const flow = h.start(l);
    h.finishAll();
    expect(h.log.filter((x) => x === 'activity')).toHaveLength(flow.steps.filter((s) => s.kind === 'activity').length);
  });
});

describe('sessionFlow — chơi lại sau buổi nhẹ tay', () => {
  it('"Chơi lại bài vừa học" chơi lại ĐÚNG phần vừa học và KHÔNG tính xong bài', () => {
    const d = child('struggling');
    const l = lesson('w6-l1');
    const h = harness(d);
    const flow = h.start(l);
    const played = flow.steps.flatMap((s) => (s.kind === 'activity' ? [s.index] : []));
    expect(played.length).toBeLessThan(l.activities.length); // nhẹ tay → tách bài
    h.finishAll();
    expect(h.st.ended!.replayOf).toEqual(played);
    expect(h.store.get().progress.lessonsCompleted).not.toContain(l.id);
    // chơi lại
    const again = h.start(l, { replay: true, replayOf: h.st.ended!.replayOf });
    expect(again.steps.flatMap((s) => (s.kind === 'activity' ? [s.index] : []))).toEqual(played);
    expect(again.steps.some((s) => s.kind === 'activity' && s.last)).toBe(false);
    h.finishAll();
    expect(h.log.filter((x) => x === 'activity')).toHaveLength(played.length);
    expect(h.store.get().progress.lessonsCompleted).not.toContain(l.id);
    // chơi lại: không mời gì thêm
    expect(h.st.ended!.offer?.kind).not.toBe('reward');
  });
});

describe('sessionFlow — màn kết: tối đa MỘT nút mời', () => {
  const stretch: StretchOffer = { kind: 'faster', songId: 'frog_hop', bpm: 60, label: 'x' } as StretchOffer;

  it('pickEndOffer: thử thách nhỏ > bài thưởng > biểu diễn (lời mời của tuần — còn tới buổi sau)', () => {
    expect(pickEndOffer({ concertWeek: 3, stretch, reward: true })).toEqual({ kind: 'stretch', offer: stretch });
    expect(pickEndOffer({ concertWeek: 3, stretch: null, reward: true })).toEqual({ kind: 'reward' });
    expect(pickEndOffer({ concertWeek: 3, stretch: null, reward: false })).toEqual({ kind: 'concert', week: 3 });
    expect(pickEndOffer({ concertWeek: null, stretch: null, reward: false })).toBeNull();
  });

  it('bé lướt (chế độ thử thách) → mời ⭐ thử thách nhỏ (không kèm bài thưởng)', () => {
    const h = harness(child('cruising'));
    const l = WEEKS.flatMap((w) => w.lessons).find((x) => x.week <= 6 && x.activities.some((a) => a.kind === 'song' && a.songId === 'frog_hop' && a.mode === 'tempo' && !a.phrase && !a.hand))!;
    h.start(l);
    h.finishAll();
    expect(h.st.ended!.offer?.kind).toBe('stretch');
  });

  it('qua tuần 1 → banner "🏅", sang tuần 2, đúng MỘT nút mời; buổi có dừng nhẹ nhàng → không bài thưởng', () => {
    const d = defaultData(new Date(NOW - 10 * DAY));
    d.progress.lessonsCompleted = ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4'];
    const h = harness(d);
    const flow = h.start(lesson('w1-test'));
    h.finishAll((v) => {
      if (v.kind === 'step' && v.step.kind === 'activity') for (let k = 0; k < 10; k++) h.store.addParentAssessment(flow.sessionId, 'C4', 'correct');
    });
    const e = h.st.ended!;
    expect(e.banner).toMatch(/^🏅/u);
    expect(h.store.get().progress.currentWeek).toBe(2);
    expect(h.store.get().progress.lessonsCompleted).toContain('w1-test');
    expect(e.offer).not.toBeNull();
    // cùng buổi nhưng có "dừng nhẹ nhàng" (ghi tường minh) → không bài thưởng
    const d2 = defaultData(new Date(NOW - 10 * DAY));
    d2.progress.lessonsCompleted = ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4'];
    const h2 = harness(d2);
    const f2 = h2.start(lesson('w1-test'));
    f2.kindStop('frog_hop');
    h2.finishAll();
    expect(h2.st.ended!.offer?.kind).not.toBe('reward');
  });

  it('lượt đạt của bài tập về nhà / ôn bài cũ KHÔNG đủ để được thưởng khi bài chưa xong', () => {
    const d = child('cruising');
    const l = lesson('w6-l1');
    const h = harness(d);
    const flow = h.start(l);
    flow.otherRun(run('mary_lamb', true, 0));
    flow.otherRun(run('hot_cross_buns', true, 0));
    // hết giờ ngay sau hoạt động đầu → bài chưa xong
    let acted = false;
    h.finishAll((v) => {
      if (v.kind === 'step' && v.step.kind === 'activity' && !acted) {
        acted = true;
        h.clock.now += 60 * 60_000;
      }
    });
    if (!h.store.get().progress.lessonsCompleted.includes(l.id)) expect(h.st.ended!.offer?.kind).not.toBe('reward');
  });
});
