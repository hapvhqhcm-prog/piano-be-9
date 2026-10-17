/**
 * (+ 2026-10-17) Sửa lỗi theo rà soát kỹ sư trưởng + rà soát giáo viên dài hạn:
 * 2. bài tập về nhà có hạn cố định (giao lại không kéo dài), giới hạn lượt, không nuôi "nhẹ tay";
 * 3. MỘT định nghĩa "dừng nhẹ nhàng" (ghi tường minh; buổi cũ bỏ đọc nhạc / tách tay);
 * 4. sessionKind — buổi thử thách nhỏ / bài thưởng không vào "đã thuộc" / độ khó;
 * 9. Album đầy → báo bố mẹ + "Xóa bản hay nhất cũ" (không bao giờ xóa bản đầu tiên);
 * A. Cấp 4 không kẹt khi bố mẹ chấm "Chưa" một thẻ tay; B. "nhẹ tay" là ngoại lệ; C. ôn ngắt quãng được bảo đảm.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultData, localDateStr, type AppData, type Session, type SongRun } from '../src/progress/schema';
import {
  HOMEWORK_MAX_FAILS,
  HOMEWORK_TRY_DAYS,
  dayDiff,
  homeworkExpired,
  makeHomework,
  pendingHomework,
  reassignHomework,
  type Homework,
} from '../src/lessons/homework';
import { difficulty, hadKindStop, scoreSession, successIndex } from '../src/lessons/adaptive';
import { countsForMastery, isOptionalLessonId, lessonWeek, sessionKind } from '../src/lessons/sessionKind';
import { isLessonSession } from '../src/lessons/bonusStickers';
import { MASTERY_BPM, masteryBpm, songMastered, songStats } from '../src/lessons/songStats';
import { emptyHistory } from '../src/progress/history';
import { foldSession } from '../src/progress/compaction';
import { WEEKS, buildSessionPlan, criterionLesson, findLesson, nextLesson, weekPassed } from '../src/lessons/lessonEngine';
import { REVIEW_SONG_GUARANTEE, nextReviewSkips } from '../src/lessons/sessionPlan';
import { reviewSongStep } from '../src/lessons/sessionSelectors';
import { RELAX_CHECKS } from '../src/lessons/level4';
import { ALBUM_FULL_KEY, AlbumStore, albumFullAt, albumShowsFull, memoryAlbumBackend } from '../src/progress/albumStore';
import { MemoryStorage } from '../src/progress/ProgressStore';
import { SONGS } from '../src/music/tune';

const NOW = new Date(2026, 9, 17, 17).getTime();
const DAY = 86_400_000;
const today = localDateStr(new Date(NOW));
const dayStr = (daysAgo: number) => localDateStr(new Date(NOW - daysAgo * DAY));

const run = (songId: string, passed: boolean, ts: number, extra: Partial<SongRun> = {}): SongRun =>
  ({ songId, mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 10, hits: passed ? 10 : 5, source: 'mic', passed, ts, ...extra }) as SongRun;

function sess(id: string, daysAgo: number, lessonId: string, runs: SongRun[], extra: Partial<Session> = {}): Session {
  const t = NOW - daysAgo * DAY - 3600e3;
  return {
    id, date: dayStr(daysAgo), lessonId, parentAssessments: [], appAssessments: [], micAssessments: [], songRuns: runs,
    selfRating: 'all', startedAt: t, endedAt: t + 600e3, minutes: 10, completed: true, checklist: {}, ...extra,
  };
}

/* ---------------- 2. Bài tập về nhà ---------------- */

const hwOn = (daysAgo: number, songId = 'frog_hop'): Homework =>
  makeHomework({ songId, title: 'Ếch', phrase: [2, 4], place: 'Câu 2', mode: 'tempo', bpm: 50, date: dayStr(daysAgo), at: NOW - daysAgo * DAY });

describe('2. bài tập về nhà — hạn cố định, giới hạn lượt', () => {
  it('giao lại CÙNG bài giữ mốc giao lần đầu (trước đây: date/at mới → hạn 14 ngày bắt đầu lại)', () => {
    const first = reassignHomework(null, null, hwOn(2), { today: dayStr(2), now: NOW - 2 * DAY, failed: true }).homework!;
    expect(first.since).toBe(NOW - 2 * DAY);
    const again = reassignHomework(first, null, hwOn(0), { today, now: NOW, failed: true }).homework!;
    expect(again.date).toBe(today);
    expect(again.since).toBe(NOW - 2 * DAY);
    expect(again.sinceDate).toBe(dayStr(2));
    expect(again.fails).toBe(1);
  });

  it(`quá ${HOMEWORK_MAX_FAILS} lượt chưa đạt → tạm dừng + lời nhắn bố mẹ; không giao lại bài đó trong ${HOMEWORK_TRY_DAYS} ngày`, () => {
    let cur: Homework | null = reassignHomework(null, null, hwOn(0), { today, now: NOW, failed: true }).homework!;
    let note = null;
    for (let k = 0; k < HOMEWORK_MAX_FAILS; k++) {
      const p = reassignHomework(cur, note, hwOn(0), { today, now: NOW + k, failed: true });
      if (p.homework !== undefined) cur = p.homework;
      if (p.homeworkNote !== undefined) note = p.homeworkNote;
    }
    expect(cur).toBeNull();
    expect(note?.songId).toBe('frog_hop');
    expect(note?.text).toMatch(/tạm dừng/);
    // cùng bài, ngay sau đó → không giao lại
    expect(reassignHomework(null, note, hwOn(0), { today, now: NOW, failed: true })).toEqual({});
    // bài khác → giao bình thường
    expect(reassignHomework(null, note, hwOn(0, 'mary_lamb'), { today, now: NOW, failed: true }).homework?.songId).toBe('mary_lamb');
  });

  it(`quá ${HOMEWORK_TRY_DAYS} ngày kể từ lúc giao lần đầu → hết hạn (không mời nữa, không nuôi "nhẹ tay")`, () => {
    const h: Homework = { ...hwOn(1), since: NOW - 5 * DAY, sinceDate: dayStr(5), fails: 1 };
    expect(homeworkExpired(h, today, NOW)).toBe(true);
    expect(pendingHomework({ ...defaultData(new Date(NOW)).settings, homework: h }, today, NOW)).toBeNull();
    const fresh: Homework = { ...hwOn(1), since: NOW - 2 * DAY, sinceDate: dayStr(2), fails: 1 };
    expect(pendingHomework({ ...defaultData(new Date(NOW)).settings, homework: fresh }, today, NOW)).toEqual(fresh);
    expect(dayDiff('2026-10-14', '2026-10-17')).toBe(3);
  });

  it('chỉ số độ khó: bài tập "giao lại hôm qua" nhưng giao lần đầu 5 ngày trước → không còn tính là bài tập chờ', () => {
    const d = defaultData(new Date(NOW - 30 * DAY));
    d.progress.currentWeek = 4;
    for (let i = 0; i < 5; i++) d.sessions.push(sess(`n${i}`, 5 - i, 'w3-l1', [run('a', true, 0), run('b', true, 1), run('c', false, 2)]));
    d.settings.homework = { ...hwOn(1), since: NOW - 5 * DAY, sinceDate: dayStr(5), fails: 2 };
    expect(difficulty(d, NOW).homework).toBe(false);
    d.settings = { ...d.settings, homework: { ...hwOn(1), since: NOW - 2 * DAY, sinceDate: dayStr(2), fails: 2 } };
    d.sessions = [...d.sessions];
    expect(difficulty(d, NOW).homework).toBe(true);
  });
});

/* ---------------- 3. Dừng nhẹ nhàng ---------------- */

describe('3. "dừng nhẹ nhàng" — một định nghĩa', () => {
  it('buổi mới: đọc trường kindStops tường minh (không đoán từ lượt chơi)', () => {
    const fails = [run('frog_hop', false, 1), run('frog_hop', false, 2), run('frog_hop', false, 3)];
    expect(hadKindStop({ songRuns: fails, kindStops: [] })).toBe(false); // vd 3 lượt bài tập về nhà chưa đạt
    expect(hadKindStop({ songRuns: [], kindStops: ['frog_hop'] })).toBe(true);
  });

  it('buổi cũ: các đoạn đọc nhạc (chung mã sight:<thế>:<tay>) và lượt tách tay không tạo dừng giả', () => {
    const sight = [1, 2, 3].map((k) => run('sight:C:RH', false, k, { mode: 'wait' }));
    expect(hadKindStop({ songRuns: sight })).toBe(false);
    const hands = [1, 2, 3].map((k) => run('ode_to_joy_both', false, k, { hand: 'RH' }));
    expect(hadKindStop({ songRuns: hands })).toBe(false);
    expect(hadKindStop({ songRuns: [run('a', false, 1), run('a', false, 2), run('a', false, 3)] })).toBe(true);
    expect(scoreSession(sess('x', 1, 'w4-l1', sight)).kindStop).toBe(false);
  });
});

/* ---------------- 4. sessionKind ---------------- */

describe('4. sessionKind — một chỗ phân loại buổi', () => {
  it('phân loại mã bài', () => {
    expect(sessionKind('w4-l2')).toBe('lesson');
    expect(sessionKind('w1-test')).toBe('lesson');
    expect(sessionKind('w31-daily')).toBe('daily');
    expect(sessionKind('w4-song-frog_hop')).toBe('library');
    expect(sessionKind('w4-parent-now')).toBe('parent');
    expect(sessionKind('reward-song-frog_hop')).toBe('reward');
    expect(sessionKind('stretch-song-frog_hop')).toBe('stretch');
    expect(sessionKind('weird')).toBe('other');
    expect(lessonWeek('w12-l3')).toBe(12);
    expect(lessonWeek('stretch-song-w1-x')).toBeNull();
    expect(isOptionalLessonId('stretch-song-x')).toBe(true);
    expect(countsForMastery('w4-song-frog_hop')).toBe(true); // Thư viện: như cũ
    expect(isLessonSession({ lessonId: 'stretch-song-x' })).toBe(false);
    expect(isLessonSession({ lessonId: 'w4-l1' })).toBe(true);
  });

  it('lượt của buổi ⭐ thử thách nhỏ KHÔNG làm bài "đã thuộc" (trước đây chỉ bỏ bài thưởng)', () => {
    const d = defaultData(new Date(NOW - 10 * DAY));
    d.sessions.push(sess('s1', 3, 'stretch-song-frog_hop', [run('frog_hop', true, NOW - 3 * DAY)]));
    d.sessions.push(sess('s2', 1, 'stretch-song-frog_hop', [run('frog_hop', true, NOW - 1 * DAY)]));
    expect(songMastered(d, 'frog_hop')).toBe(false);
    expect(songStats(d).frog_hop?.r).toBeDefined(); // vẫn ghi "lần chơi gần nhất"
    // gộp lịch sử: cũng không thuộc
    const h = emptyHistory();
    for (const s of d.sessions) foldSession(h, s);
    expect(h.songs.frog_hop?.m).toBeUndefined();
    // cùng lượt trong buổi bài học → thuộc (2 ngày)
    const e = defaultData(new Date(NOW - 10 * DAY));
    e.sessions.push(sess('l1', 3, 'w2-l1', [run('frog_hop', true, NOW - 3 * DAY)]), sess('l2', 1, 'w2-l2', [run('frog_hop', true, NOW - DAY)]));
    expect(songMastered(e, 'frog_hop')).toBe(true);
  });

  it('buổi thử thách nhỏ / bài thưởng không vào chỉ số độ khó', () => {
    const d = defaultData(new Date(NOW - 30 * DAY));
    for (let i = 0; i < 5; i++) d.sessions.push(sess(`ok${i}`, 6 - i, 'w3-l1', [run('a', true, 0)]));
    const before = difficulty(d, NOW).sessions;
    d.sessions = [...d.sessions, sess('st', 0.5, 'stretch-song-a', [run('a', false, 0)]), sess('rw', 0.5, 'reward-song-a', [run('a', false, 0)])];
    expect(difficulty(d, NOW).sessions).toBe(before);
  });
});

/* ---------------- 9. Album đầy ---------------- */

describe('9. Album đầy', () => {
  let saved: unknown;
  beforeEach(() => {
    saved = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  });
  afterEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = saved;
  });
  const blob = (n: number) => new Blob([new Uint8Array(n)], { type: 'audio/mp4' });
  const take = (songId: string, bytes: number, stars = 1) => ({ songId, title: songId, blob: blob(bytes), seconds: 20, stars, accuracy: stars / 3 });

  it('đầy → ghi nhớ (bố mẹ được báo); lưu được bản mới / dọn xong → hết báo', async () => {
    let t = 1000;
    const be = memoryAlbumBackend();
    const store = new AlbumStore(be, { maxBytes: 1000, now: () => (t += 1000) });
    expect((await store.consider(take('a', 600), true)).saved).toBe(true);
    expect(albumFullAt()).toBeNull();
    expect(await store.consider(take('b', 600), true)).toEqual({ saved: false, reason: 'full' });
    expect(albumFullAt()).not.toBeNull();
    expect((globalThis as unknown as { localStorage: MemoryStorage }).localStorage.getItem(ALBUM_FULL_KEY)).toBeTruthy();
    expect(albumShowsFull(600, 1000)).toBe(true);
    await store.clear();
    expect(albumFullAt()).toBeNull();
    expect(albumShowsFull(100, 1000, null)).toBe(false);
    expect(albumShowsFull(960, 1000, null)).toBe(true);
  });

  it('"Xóa bản hay nhất cũ": xóa bản hay nhất CŨ NHẤT tới ≤ 75%; KHÔNG BAO GIỜ xóa bản đầu tiên', async () => {
    let t = 1000;
    const be = memoryAlbumBackend();
    const store = new AlbumStore(be, { maxBytes: 1000, now: () => (t += 1000) });
    // a: bản đầu (100) rồi bản hay hơn (200) → bản đầu sang ô first
    await store.consider(take('a', 100, 1), true);
    await store.consider(take('a', 200, 2), true);
    // b: chỉ một bản (kiêm bản đầu — firstTake)
    await store.consider(take('b', 300, 1), true);
    // c: bản đầu (100) rồi bản hay hơn (250)
    await store.consider(take('c', 100, 1), true);
    await store.consider(take('c', 250, 3), true);
    expect((await store.usage()).bytes).toBe(950);
    const r = await store.freeOldBest();
    expect(r.removed).toBe(1);
    expect(be.takes.has('a')).toBe(false); // bản hay nhất cũ nhất
    expect(be.takes.has('b')).toBe(true); // kiêm bản đầu → giữ
    expect(be.takes.has('c')).toBe(true);
    expect(be.firsts.has('a')).toBe(true); // bản đầu vẫn còn
    expect(be.firsts.has('c')).toBe(true);
    expect((await store.usage()).bytes).toBeLessThanOrEqual(750);
  });
});

/* ---------------- A. Cấp 4 không kẹt ---------------- */

describe('A. Cấp 4: bố mẹ chấm "Chưa" một thẻ tay → "Học tiếp" vẫn mời bài giúp đạt tiêu chí', () => {
  // (2026-10-17) rev 5: tuần gam Sol (32 cũ) nay là tuần 34
  it('tuần 34: criterionLesson không null sau một lần relax:* = "retry" thật', () => {
    const d = defaultData(new Date(NOW - 300 * DAY));
    d.progress.currentWeek = 34;
    const w32 = WEEKS[33];
    d.progress.lessonsCompleted = WEEKS.slice(0, 34).flatMap((w) => w.lessons.map((l) => l.id));
    const reg = w32.lessons.find((l) => !l.isWeekTest)!;
    d.sessions.push(
      sess('real', 1, reg.id, [], { parentAssessments: [{ note: RELAX_CHECKS[0], result: 'retry', ts: NOW - DAY }] }),
    );
    expect(weekPassed(34, d)).toBe(false);
    const helper = criterionLesson(34, d);
    expect(helper).not.toBeNull();
    expect(nextLesson(d, () => 0.5, NOW).id).toBe(helper!.id);
  });
});

/* ---------------- B. "Nhẹ tay" là ngoại lệ ---------------- */

/** Bộ sinh số ngẫu nhiên cố định (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mô phỏng 40 buổi (1 buổi/ngày): mỗi buổi 3 bài hát (thử tới khi đạt, tối đa 3 lần — lần thứ 3 chưa được = dừng nhẹ nhàng,
 * ghi tường minh như session.ts), 6 câu đố, 20 nốt micro; bài tập về nhà giao / xóa như songResult. Trả về tỉ lệ buổi 'gentle'.
 */
function gentleShare(p: { run: number; quiz: number; mic: number }, seed: number): number {
  const r = rng(seed);
  const d = defaultData(new Date(NOW - 60 * DAY));
  d.progress.currentWeek = 6;
  let gentle = 0;
  const N = 40;
  let hw: Homework | null = null;
  for (let i = 0; i < N; i++) {
    const day = N - i;
    const t0 = NOW - day * DAY;
    if (difficulty(d, t0).mode === 'gentle') gentle++;
    const runs: SongRun[] = [];
    const stops: string[] = [];
    let ts = t0;
    for (const song of [`p${i % 7}`, `p${(i + 1) % 7}`, `p${(i + 3) % 7}`]) {
      for (let k = 0; k < 3; k++) {
        const ok = r() < p.run;
        runs.push(run(song, ok, ++ts));
        if (ok) {
          if (hw?.songId === song) hw = null;
          break;
        }
        const next = makeHomework({ songId: song, title: song, phrase: null, place: 'Cả bài', mode: 'tempo', bpm: 50, date: localDateStr(new Date(t0)), at: t0 });
        const patch = reassignHomework(hw, null, next, { today: localDateStr(new Date(t0)), now: t0, failed: true });
        if (patch.homework !== undefined) hw = patch.homework;
        if (k === 2) stops.push(song);
      }
    }
    d.settings = { ...d.settings, homework: hw };
    d.sessions = [
      ...d.sessions,
      sess(`g${i}`, day, 'w6-l1', runs, {
        kindStops: stops,
        appAssessments: Array.from({ length: 6 }, () => {
          const ok = r() < p.quiz;
          return { expected: 'C4', actual: ok ? 'C4' : 'D4', correct: ok, ts: t0 };
        }),
        micAssessments: Array.from({ length: 20 }, () => {
          const ok = r() < p.mic;
          return { expected: 'C4', firstHeard: ok ? 'C4' : 'D4', firstTry: ok, wrongCount: ok ? 0 : 1, ts: t0 };
        }),
      }),
    ];
  }
  return gentle / N;
}

describe('B. hiệu chỉnh "nhẹ tay" (mục tiêu 75–85% thành công)', () => {
  const avg = { run: 0.7, quiz: 0.8, mic: 0.78 };
  const slow = { run: 0.45, quiz: 0.6, mic: 0.55 };
  const strong = { run: 0.92, quiz: 0.95, mic: 0.92 };
  const mean = (p: typeof avg) => [1, 2, 3, 4, 5].map((s) => gentleShare(p, s)).reduce((a, b) => a + b, 0) / 5;

  it('bé TRUNG BÌNH: nhẹ tay là ngoại lệ (≤ 20% buổi); bé GIỎI: hầu như không; bé CHẬM: nhiều hơn hẳn', () => {
    const a = mean(avg);
    const s = mean(slow);
    const g = mean(strong);
    console.log(`nhẹ tay: trung bình ${(a * 100).toFixed(0)}% · chậm ${(s * 100).toFixed(0)}% · giỏi ${(g * 100).toFixed(0)}%`);
    expect(a).toBeLessThanOrEqual(0.2);
    expect(g).toBeLessThanOrEqual(0.05);
    expect(s).toBeGreaterThan(a);
    expect(s).toBeGreaterThanOrEqual(0.3);
  });

  it('chỉ số: lượt TỐT NHẤT của mỗi bài trong buổi (thử lại rồi đạt = đạt)', () => {
    const s = sess('x', 1, 'w5-l1', [run('a', false, 1), run('a', false, 2), run('a', true, 3), run('b', true, 4)]);
    expect(scoreSession(s).runs).toEqual([2, 2]);
    expect(scoreSession(s).failedRun).toBe(false);
    expect(successIndex([scoreSession(s)])).toBe(1);
  });
});

/* ---------------- C. Ôn ngắt quãng bảo đảm ---------------- */

describe('C. "Ôn bài cũ" không bị bỏ mãi', () => {
  it('nextReviewSkips: giữ → 0, bị bỏ → +1, không có → giữ nguyên', () => {
    expect(nextReviewSkips(1, 'kept')).toBe(0);
    expect(nextReviewSkips(1, 'dropped')).toBe(2);
    expect(nextReviewSkips(1, 'none')).toBe(1);
    expect(REVIEW_SONG_GUARANTEE).toBe(2);
  });

  it(`bị bỏ ${REVIEW_SONG_GUARANTEE} buổi liền → buổi sau GIỮ bước ôn (bỏ bước phụ khác trước), vẫn ≤ 7 màn`, () => {
    // bé tuần 9: đã chơi & đạt nhiều bài cũ → có ứng viên "Ôn bài cũ"
    const d = defaultData(new Date(NOW - 80 * DAY));
    d.progress.currentWeek = 12;
    d.progress.lessonsCompleted = WEEKS.slice(0, 11).flatMap((w) => w.lessons.map((l) => l.id));
    const old = SONGS.filter((t) => (t.week ?? 1) <= 10 && !t.id.startsWith('sight'));
    d.sessions.push(sess('h', 20, 'w8-l1', old.map((t, k) => run(t.id, true, NOW - 20 * DAY + k))));
    let found = 0;
    for (const w of WEEKS.slice(8, 30)) {
      for (const l of w.lessons) {
        const r0: { reviewSong?: 'kept' | 'dropped' | 'none' } = {};
        const dd = { ...d, progress: { ...d.progress, currentWeek: l.week } } as AppData;
        buildSessionPlan(l, dd, { now: NOW, songReview: true, sightRead: true, report: r0, rng: () => 0.5 });
        if (r0.reviewSong !== 'dropped') continue;
        const guarded = { ...dd, settings: { ...dd.settings, reviewSkips: REVIEW_SONG_GUARANTEE } } as AppData;
        const r1: { reviewSong?: 'kept' | 'dropped' | 'none' } = {};
        const steps = buildSessionPlan(l, guarded, { now: NOW, songReview: true, sightRead: true, report: r1, rng: () => 0.5 });
        expect(steps.length).toBeLessThanOrEqual(7);
        if (r1.reviewSong === 'kept') found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('xoay vòng MỌI bài đã đạt (không chỉ bài đã thuộc / 3 tuần gần nhất): bài tuần đầu đã đạt vẫn được ôn ở tuần 12', () => {
    const d = defaultData(new Date(NOW - 80 * DAY));
    d.progress.currentWeek = 12;
    const w1 = SONGS.find((t) => (t.week ?? 1) <= 3 && !t.id.startsWith('sight'))!;
    expect(w1).toBeDefined();
    // đạt từng nốt (không theo nhịp ≥ 60 → chưa "thuộc")
    d.sessions.push(sess('h', 40, 'w2-l1', [run(w1.id, true, NOW - 40 * DAY, { mode: 'wait' })]));
    const l = WEEKS[11].lessons.find((x) => !x.isWeekTest)!;
    expect(songMastered(d, w1.id)).toBe(false);
    const rs = reviewSongStep(l, d, NOW, () => 0.5);
    expect(rs?.songId).toBe(w1.id);
  });
});

/* ---------------- Tốc độ thuộc bài = min(60, tốc độ của bài) ---------------- */

describe('(+ 2026-10-17, OWNER duyệt) thuộc bài ở tốc độ viết của bài khi bài viết chậm hơn 60', () => {
  const FOLK40 = ['ly_cay_da', 'bac_kim_thang', 'co_la', 'ly_ngua_o', 'ly_cay_bong', 'di_cay', 'ho_ba_li'];
  it('7 bài dân ca viết ở 40: masteryBpm = 40; bài khác = 60', () => {
    for (const id of FOLK40) expect(masteryBpm(id)).toBe(40);
    expect(masteryBpm('ode_to_joy_easy')).toBe(MASTERY_BPM);
    expect(masteryBpm('sight:C:RH')).toBe(MASTERY_BPM);
  });

  it('lượt trọn bài đạt ở 40, hai ngày → thuộc (đọc trực tiếp và sau khi gộp lịch sử); 39 → không', () => {
    const mk = (bpm: number) => {
      const d = defaultData(new Date(NOW - 10 * DAY));
      d.sessions.push(sess('a', 3, 'w18-l1', [run('ly_cay_da', true, NOW - 3 * DAY, { bpm })]), sess('b', 1, 'w18-l2', [run('ly_cay_da', true, NOW - DAY, { bpm })]));
      return d;
    };
    expect(songMastered(mk(40), 'ly_cay_da')).toBe(true);
    expect(songMastered(mk(39), 'ly_cay_da')).toBe(false);
    const h = emptyHistory();
    for (const s of mk(40).sessions) foldSession(h, s);
    expect(h.songs.ly_cay_da?.m).toBeDefined();
    // bài viết ở tốc độ ≥ 60: 40 vẫn chưa đủ
    const e = defaultData(new Date(NOW - 10 * DAY));
    e.sessions.push(sess('a', 3, 'w6-l1', [run('ode_to_joy_easy', true, NOW - 3 * DAY, { bpm: 40 })]), sess('b', 1, 'w6-l2', [run('ode_to_joy_easy', true, NOW - DAY, { bpm: 40 })]));
    expect(songMastered(e, 'ode_to_joy_easy')).toBe(false);
  });
});

void findLesson;
