/**
 * (+ 2026-10-16, OWNER duyệt — rà soát của giáo viên có kinh nghiệm) Ba trợ giúp quanh buổi học:
 * 1. "📍 Tìm Đô giữa" đầu buổi (lessons/middleC.ts) — khi nào hiện;
 * 2. "👪 Bố mẹ 30 giây — hôm nay để ý" (lessons/parentFocus.ts) — chọn MỘT điều;
 * 3. "🎁 Chọn 1 bài con thích" (lessons/rewardSongs.ts) — ai được thưởng, chọn bài nào;
 * + AN TOÀN TIẾN ĐỘ: bé thật tuần 4 — bài "Học tiếp", tiêu chí tuần, "đã thuộc" không đổi.
 */
import { describe, expect, it } from 'vitest';
import { WEEKS, buildSessionPlan, criterionProgress, findLesson, nextLesson, songMastered, weekPassed } from '../src/lessons/lessonEngine';
import {
  MIDDLE_C_MAX_WEEK,
  OCTAVE_EVENT_GAP_MS,
  middleCReason,
  noteOctaveEvent,
  octaveTrouble,
  positionChange,
  readOctaveLog,
  markMiddleCFound,
  markMiddleCShown,
  withOctaveEvent,
  type OctaveLog,
} from '../src/lessons/middleC';
import { parentFocus, thumbKeyName } from '../src/lessons/parentFocus';
import { hadKindStop, rewardChoices, rewardEligible, rewardLessonId, rewardPlayOptions } from '../src/lessons/rewardSongs';
import { judgeWait, setOctaveObserver, waitJudgeInit } from '../src/music/waitJudge';
import { foldSession } from '../src/progress/compaction';
import { emptyHistory } from '../src/progress/history';
import { MemoryStorage } from '../src/progress/ProgressStore';
import { defaultData, localDateStr, type AppData, type Session, type SongRun } from '../src/progress/schema';
import { middleCArtMarkup, blackAfter, WHITE_KEYS, MIDDLE_C_WHITE } from '../src/ui/components/art/middleCArt';
import { fixtureWeek4Child } from './fixtures/week4Child';

const NOW = new Date(2026, 9, 16, 17);
const T = NOW.getTime();
const TODAY = localDateStr(NOW);
const DAY = 86_400_000;
const lesson = (id: string) => {
  const l = findLesson(id);
  if (!l) throw new Error(id);
  return l;
};
const log = (...ago: number[]): OctaveLog => ({ events: ago.map((d) => T - d) });

const run = (songId: string, passed: boolean, ts: number, mode: 'wait' | 'tempo' = 'tempo', bpm = 60): SongRun => ({
  songId, mode, level: mode === 'tempo' ? 2 : undefined, bpm, hints: 'full', phrase: null, total: 20, hits: passed ? 19 : 10, source: 'mic', passed, ts,
}) as SongRun;
const sess = (lessonId: string, date: Date, runs: SongRun[]): Session => ({
  id: `t-${lessonId}-${date.getTime()}`, date: localDateStr(date), lessonId, parentAssessments: [], appAssessments: [], micAssessments: [],
  songRuns: runs, selfRating: 'all', startedAt: date.getTime(), endedAt: date.getTime() + 600e3, minutes: 10, completed: true, checklist: {},
});

describe('📍 Tìm Đô giữa — khi nào hiện', () => {
  const fx = () => fixtureWeek4Child(NOW);

  it('nhật ký lệch quãng 8: một đợt (< 1 phút) chỉ ghi một lần; ≥ 2 đợt trong 7 ngày → "hay lệch quãng 8"', () => {
    let l: OctaveLog = { events: [] };
    l = withOctaveEvent(l, T - 3 * DAY);
    l = withOctaveEvent(l, T - 3 * DAY + 5_000); // cùng lượt
    expect(l.events).toHaveLength(1);
    expect(octaveTrouble(l, T)).toBe(false);
    l = withOctaveEvent(l, T - 3 * DAY + OCTAVE_EVENT_GAP_MS + 1);
    expect(octaveTrouble(l, T)).toBe(true);
    // Quá 7 ngày → hết
    expect(octaveTrouble(log(8 * DAY, 9 * DAY), T)).toBe(false);
    // Đã tìm đúng Đô giữa SAU các lần lệch → hết
    expect(octaveTrouble({ ...log(3 * DAY, 2 * DAY), foundAt: T - DAY }, T)).toBe(false);
  });

  it('bộ nhớ trong máy: ghi / đọc / đánh dấu đã hiện, đã tìm đúng (hỏng → rỗng)', () => {
    const st = new MemoryStorage();
    noteOctaveEvent(T - 2 * DAY, st);
    noteOctaveEvent(T - DAY, st);
    expect(octaveTrouble(readOctaveLog(st), T)).toBe(true);
    markMiddleCShown(TODAY, st);
    expect(readOctaveLog(st).shownOn).toBe(TODAY);
    markMiddleCFound(T, st);
    expect(octaveTrouble(readOctaveLog(st), T + 1000)).toBe(false);
    st.setItem('piano-be-9-octave-log', '{hỏng');
    expect(readOctaveLog(st)).toEqual({ events: [] });
  });

  it('waitJudge báo lần lệch quãng 8 cho người nghe (mặc định không có ai nghe → hàm thuần)', () => {
    const seen: boolean[] = [];
    setOctaveObserver((up) => seen.push(up));
    try {
      const inp = { groups: [[60], [62]], cur: 0, phraseStarts: [0], heard: 72, t: 5, pair: 'unknown' as const };
      const r = judgeWait(waitJudgeInit(), inp);
      expect(r.verdict.kind).toBe('octave');
      expect(seen).toEqual([true]);
    } finally {
      setOctaveObserver(null);
    }
    const r2 = judgeWait(waitJudgeInit(), { groups: [[60]], cur: 0, phraseStarts: [0], heard: 48, t: 5, pair: 'unknown' });
    expect(r2.verdict.kind).toBe('octave');
    expect(seen).toHaveLength(1);
  });

  it('bé thật tuần 4, bài tiếp (đã học tuần 4 rồi) → KHÔNG hiện; hay lệch quãng 8 → hiện (lý do "octave"); đã hiện hôm nay → không', () => {
    const d = fx();
    const l = nextLesson(d, () => 0, NOW);
    expect(middleCReason(l, d, { now: T, today: TODAY, log: { events: [] } })).toBeNull();
    expect(middleCReason(l, d, { now: T, today: TODAY, log: log(2 * DAY, DAY) })).toBe('octave');
    expect(middleCReason(l, d, { now: T, today: TODAY, log: { ...log(2 * DAY, DAY), shownOn: TODAY } })).toBeNull();
  });

  // (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") Đô giữa CHỈ khi bé thật sự lệch quãng 8 — không còn "buổi đầu tuần"
  it('buổi ĐẦU của tuần ≤ 6 → KHÔNG còn hiện (chỉ khi lệch quãng 8); tuần 7+ không; buổi đầu tiên của bé không', () => {
    const d = fx();
    d.progress.currentWeek = 5;
    expect(middleCReason(lesson('w5-l1'), d, { now: T, today: TODAY })).toBeNull();
    expect(middleCReason(lesson('w5-l1'), d, { now: T, today: TODAY, log: log(2 * DAY, DAY) })).toBe('octave');
    expect(MIDDLE_C_MAX_WEEK).toBe(6);
    d.progress.currentWeek = 7;
    expect(middleCReason(lesson('w7-l1'), d, { now: T, today: TODAY })).toBeNull();
    const fresh = defaultData(NOW);
    expect(middleCReason(lesson('w1-l1'), fresh, { now: T, today: TODAY })).toBeNull();
    // Buổi đã có của tuần 5 → không lặp
    d.progress.currentWeek = 5;
    d.sessions.push(sess('w5-l1', new Date(T - DAY), [run('frog_hop', true, T - DAY, 'wait')]));
    expect(middleCReason(lesson('w5-l2'), d, { now: T, today: TODAY })).toBeNull();
  });

  it('bài mở THẾ TAY MỚI (thế Sol tuần 10, Đô giữa tay trái tuần 11, thế Rê tuần 16) → KHÔNG còn hiện Đô giữa (2026-10-17)', () => {
    expect(positionChange(lesson('w10-g'))?.position).toBe('G');
    expect(positionChange(lesson('w11-l2'))?.position).toBe('MC');
    expect(positionChange(lesson('w16-l2'))?.position).toBe('D');
    for (const id of ['w4-l2', 'w5-l1', 'w6-l3', 'w7-l2']) expect(positionChange(lesson(id)), id).toBeNull();
    const d = fx();
    d.progress.currentWeek = 10;
    for (let w = 5; w <= 10; w++) d.sessions.push(sess(`w${w}-l1`, new Date(T - (12 - w) * DAY), [run('hot_cross_buns', true, T - (12 - w) * DAY)]));
    expect(middleCReason(lesson('w10-g'), d, { now: T, today: TODAY })).toBeNull();
    d.progress.lessonsCompleted.push('w10-g');
    expect(middleCReason(lesson('w10-g'), d, { now: T, today: TODAY })).toBeNull();
  });

  it('kế hoạch buổi: bước tìm Đô giữa nằm TRONG bước mở đầu — số màn / thứ tự bước không đổi', () => {
    const d = fx();
    const l = nextLesson(d, () => 0, NOW);
    const a = buildSessionPlan(l, d, { now: T, rng: () => 0.3, songReview: true, sightRead: true, today: TODAY });
    const b = buildSessionPlan(l, d, { now: T, rng: () => 0.3, songReview: true, sightRead: true, today: TODAY, octaveLog: log(2 * DAY, DAY) });
    expect(b.map((s) => s.kind)).toEqual(a.map((s) => s.kind));
    expect(a[0].kind === 'posture' && a[0].middleC).toBeNull();
    expect(b[0].kind === 'posture' && b[0].middleC).toBe('octave');
    // Chơi lại → không có bước mở đầu
    expect(buildSessionPlan(l, d, { replay: true, now: T, octaveLog: log(2 * DAY, DAY) }).some((s) => s.kind === 'posture')).toBe(false);
  });

  it('tranh: 88 phím (52 trắng, 36 đen), Đô giữa là phím trắng thứ 24, có tên hãng / nhóm 2 phím đen', () => {
    let black = 0;
    for (let i = 0; i < WHITE_KEYS; i++) if (blackAfter(i)) black++;
    expect(WHITE_KEYS + black).toBe(88);
    expect('ABCDEFG'[MIDDLE_C_WHITE % 7]).toBe('C');
    const svg = middleCArtMarkup();
    expect(svg).toContain('TÊN HÃNG');
    expect(svg).toContain('2 phím đen');
    expect(svg).not.toContain('NaN');
  });
});

describe('👪 Bố mẹ 30 giây — chọn MỘT điều để ý', () => {
  it('thế tay mới → "ngón cái đặt đúng …" (ưu tiên nhất, hơn cả lỗi tay)', () => {
    const f = parentFocus(lesson('w10-g'), { hand: 'tip', octave: true });
    expect(f.id).toBe('position');
    expect(f.text).toContain('Sol');
    expect(thumbKeyName('MC', 'LH')).toBe('Đô giữa');
    expect(thumbKeyName('C5', 'RH')).toBe('Đô cao');
    // Bài đã học xong → thế tay không còn "mới"
    expect(parentFocus(lesson('w10-g'), { lessonDone: true }).id).not.toBe('position');
  });

  it('bố mẹ vừa nhắc lỗi tay → đúng điều đó; rồi tới Đô giữa (lệch quãng 8)', () => {
    expect(parentFocus(lesson('w4-l3'), { hand: 'wrist', octave: true })).toMatchObject({ id: 'hand', text: expect.stringContaining('cổ tay') });
    expect(parentFocus(lesson('w4-l3'), { octave: true })).toMatchObject({ id: 'octave', text: expect.stringContaining('Đô giữa') });
  });

  it('bài đàn liền → "nối liền"; bài theo nhịp → "đếm thầm"; còn lại → "ngón cong"', () => {
    const legato = WEEKS.flatMap((w) => w.lessons).find((l) => l.activities.some((a) => a.kind === 'dynamics' && a.mode === 'stac-leg' && a.rounds.some((r) => r.want === 'leg')));
    expect(legato).toBeDefined();
    expect(parentFocus(legato!).id).toBe('legato');
    const tempo = parentFocus(lesson('w4-l3'));
    expect(tempo.id).toBe('tempo');
    expect(tempo.text).toContain('1-2');
    expect(parentFocus(lesson('w1-l1')).id).toBe('posture');
  });

  it('mọi bài của giáo trình: luôn có một dòng ngắn (≤ 45 ký tự) và một câu đầy đủ', () => {
    for (const w of WEEKS)
      for (const l of w.lessons) {
        const f = parentFocus(l);
        expect(f.text.length, l.id).toBeLessThanOrEqual(45);
        expect(f.detail.length, l.id).toBeGreaterThan(20);
      }
  });
});

describe('🎁 Chọn 1 bài con thích', () => {
  it('dừng nhẹ nhàng = một bài ≥ 3 lượt chưa đạt liền (lượt đạt sau đó xoá)', () => {
    expect(hadKindStop({ songRuns: [run('a', false, 1), run('a', false, 2), run('a', false, 3)] })).toBe(true);
    expect(hadKindStop({ songRuns: [run('a', false, 1), run('a', false, 2), run('a', true, 3)] })).toBe(false);
    expect(hadKindStop({ songRuns: [run('a', false, 1), run('b', false, 2), run('a', false, 3)] })).toBe(false);
  });

  it('được thưởng (+ 2026-10-17): KHÔNG dừng nhẹ nhàng VÀ (học xong bài HOẶC ≥ 2 lượt đạt của hoạt động bài học); chơi lại → không', () => {
    const none = { songRuns: [] as SongRun[] };
    const two = { songRuns: [run('a', true, 1), run('b', true, 2)] };
    const stop = { songRuns: [run('a', false, 1), run('a', false, 2), run('a', false, 3), run('b', true, 4)] };
    expect(rewardEligible({ session: none, lessonFinished: true, lessonPassed: 0 })).toBe(true);
    expect(rewardEligible({ session: none, lessonFinished: false, lessonPassed: 0 })).toBe(false);
    expect(rewardEligible({ session: two, lessonFinished: false, lessonPassed: 2 })).toBe(true);
    // 2 lượt đạt nhưng là bài tập về nhà / ôn bài cũ (không phải hoạt động bài học) → không
    expect(rewardEligible({ session: two, lessonFinished: false, lessonPassed: 0 })).toBe(false);
    expect(rewardEligible({ session: { songRuns: [run('a', true, 1)] }, lessonFinished: false, lessonPassed: 1 })).toBe(false);
    expect(rewardEligible({ session: stop, lessonFinished: true, lessonPassed: 1 })).toBe(false);
    expect(rewardEligible({ session: two, lessonFinished: true, lessonPassed: 2, replay: true })).toBe(false);
    expect(rewardEligible({ session: null, lessonFinished: true, lessonPassed: 0 })).toBe(false);
  });

  it('(+ 2026-10-17) buổi có dừng nhẹ nhàng (ghi tường minh) → KHÔNG thưởng dù có ≥ 2 lượt đạt ở đâu đó', () => {
    const s = { songRuns: [run('hw', true, 1), run('rv', true, 2), run('a', true, 3)], kindStops: ['b'] };
    expect(rewardEligible({ session: s, lessonFinished: false, lessonPassed: 2 })).toBe(false);
    expect(rewardEligible({ session: s, lessonFinished: true, lessonPassed: 2 })).toBe(false);
  });

  it('bé thật tuần 4: 3–6 bài ĐÃ MỞ, bài con thích trước, đúng MỘT bài "Mới"', () => {
    const d = fixtureWeek4Child(NOW);
    const c = rewardChoices(d);
    expect(c.length).toBeGreaterThanOrEqual(3);
    expect(c.length).toBeLessThanOrEqual(6);
    for (const x of c) {
      expect(x.tune.week ?? 1).toBeLessThanOrEqual(4);
      expect(x.tune.id.startsWith('sight')).toBe(false);
    }
    expect(c.filter((x) => x.fresh)).toHaveLength(1);
    expect(c[0].fresh).toBe(false);
    expect(new Set(c.map((x) => x.tune.id)).size).toBe(c.length);
    // Bài vừa học trong buổi → xếp sau (bài khác lên trước)
    const ex = rewardChoices(d, [c[0].tune.id]);
    expect(ex[0].tune.id).not.toBe(c[0].tune.id);
  });

  it('bài đã thuộc → theo nhịp ≤ 60, gợi ý đầy đủ; còn lại → Từng nốt', () => {
    const d = fixtureWeek4Child(NOW);
    for (const x of rewardChoices(d)) {
      const o = rewardPlayOptions(x);
      expect(o.hints).toBe('full');
      if (x.mastered) expect(o.mode === 'tempo' && (o.bpm ?? 0) <= 60).toBe(true);
      else expect(o.mode).toBe('wait');
    }
  });

  it('bé mới tinh (chưa đủ 3 bài) → không mời', () => {
    const d = defaultData(NOW);
    const c = rewardChoices(d);
    expect(c.length === 0 || c.length >= 3).toBe(true);
  });
});

describe('🛡️ An toàn tiến độ (bé thật tuần 4)', () => {
  /** Thêm lượt bài thưởng ĐẠT theo nhịp 60 ở 2 ngày khác nhau (đủ để "thuộc" nếu là lượt thường). */
  const withReward = (d: AppData, songId: string, lessonId: (id: string) => string) => {
    for (const k of [2, 1]) {
      const at = new Date(T - k * DAY);
      d.sessions.push(sess(lessonId(songId), at, [run(songId, true, at.getTime(), 'tempo', 60), run(songId, true, at.getTime() + 1000, 'tempo', 60)]));
    }
    return d;
  };

  it('lượt bài thưởng: bài "Học tiếp", tiêu chí tuần 4, "đã thuộc" KHÔNG đổi (lượt Thư viện thường thì có đổi — đối chứng)', () => {
    const base = fixtureWeek4Child(NOW);
    const song = rewardChoices(base).find((c) => !c.mastered)?.tune.id ?? 'au_clair';
    expect(songMastered(base, song)).toBe(false);
    const rw = withReward(fixtureWeek4Child(NOW), song, rewardLessonId);
    expect(nextLesson(rw, () => 0, NOW).id).toBe(nextLesson(base, () => 0, NOW).id);
    expect(weekPassed(4, rw)).toBe(weekPassed(4, base));
    expect(criterionProgress(4, rw)).toEqual(criterionProgress(4, base));
    expect(songMastered(rw, song)).toBe(false);
    // Đối chứng: cùng các lượt ở Thư viện (w4-song-…) → thuộc
    const lib = withReward(fixtureWeek4Child(NOW), song, (id) => `w4-song-${id}`);
    expect(songMastered(lib, song)).toBe(true);
  });

  it('gộp lịch sử (compaction) cũng bỏ qua lượt bài thưởng khi tính "đã thuộc"', () => {
    const h = emptyHistory();
    for (const k of [2, 1]) {
      const at = new Date(T - k * DAY);
      foldSession(h, sess(rewardLessonId('mary_lamb'), at, [run('mary_lamb', true, at.getTime())]), 0);
    }
    expect(h.songs.mary_lamb?.m).toBeUndefined();
    expect(h.songs.mary_lamb?.r).toBeDefined();
  });

  it('bước tìm Đô giữa / lời nhắc bố mẹ không ghi gì vào dữ liệu: kế hoạch buổi của bài tiếp giống hệt (trừ trường middleC)', () => {
    const d = fixtureWeek4Child(NOW);
    const l = nextLesson(d, () => 0, NOW);
    expect(l.id).toBe('w4-l2');
    const a = buildSessionPlan(l, d, { now: T, rng: () => 0.5 });
    const b = buildSessionPlan(l, d, { now: T, rng: () => 0.5, octaveLog: log(DAY, 2 * DAY), today: TODAY });
    const strip = (s: (typeof a)[number]) => (s.kind === 'posture' ? { ...s, middleC: null } : s);
    expect(b.map(strip)).toEqual(a.map(strip));
  });
});
