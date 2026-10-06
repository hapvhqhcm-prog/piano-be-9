/**
 * (+ 2026-10-06) Độ bền dữ liệu: GỘP LỊCH SỬ (progress/compaction.ts), HẾT CHỖ localStorage, ghi trễ (debounce),
 * sticker không mất khi lùi tuần, dữ liệu của bản app mới hơn, độ "tươi" sau khi xong giáo trình.
 *
 * Kiểm tra tính chất: với lịch sử ngẫu nhiên ~2 năm, mọi hàm đọc lịch sử cho KẾT QUẢ GIỐNG HỆT trước / sau khi gộp.
 */
import { describe, expect, it } from 'vitest';
import {
  FRESH_DAYS,
  FRESH_DAYS_AFTER_CURRICULUM,
  MAX_WEEK,
  WEEKS,
  buildSessionPlan,
  criterionProgress,
  dailyLesson,
  freshDays,
  lastWholePlay,
  masteredSongs,
  nextLesson,
  reviewSongStep,
  songEverPlayed,
  songFresh,
  songMastered,
  streakDays,
  targetMemory,
  weekComplete,
  weekPassed,
  weekPlan,
} from '../src/lessons/lessonEngine';
import { STREAK_RETIRED_AFTER, allStickers, bestStreak, busyWeeks, earnedStickerIds, islandPassed } from '../src/lessons/stickers';
import { SONGS } from '../src/music/tune';
import { compactData } from '../src/progress/compaction';
import { completedSessionCount, firstDateOfWeek, lastSessionDate, parentStats, sessionCount } from '../src/progress/history';
import {
  MAX_ARCHIVES,
  MemoryStorage,
  ProgressStore,
  STORAGE_KEY,
  storageStatus,
  type KeyValueStorage,
} from '../src/progress/ProgressStore';
import { buildReport } from '../src/progress/report';
import { defaultData, type AppData } from '../src/progress/schema';
import { tonightPlan } from '../src/ui/screens/tonight';

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const PITCHES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'G3', 'A3', 'C4+E4+G4'];
const APP_EXP = ['C4', 'D4', 'E4', 'G4', 'up', 'down', 'step', 'skip', 'major', 'minor', 'same', 'step-up', '4th-down'];
const PARENT_NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'finger-1', 'posture-back', 'tech:hand-shape', 'rhythm:1-1-2', 'teach-back'];
const SONG_IDS = SONGS.map((s) => s.id);

type Op = (st: ProgressStore, clock: { t: number }) => void;

/**
 * Lịch sử ngẫu nhiên ~`days` ngày (đủ kiểu dữ liệu: bố mẹ chấm, app chấm, micro, lượt chơi bài một câu / tách tay /
 * đọc nhạc, sắc thái, huy chương, bài kiểm tra tuần 1, thư viện, lùi tuần…). Trả về DANH SÁCH THAO TÁC để chạy lại
 * y hệt trên nhiều store.
 */
function randomOps(seed: number, days: number, perWeek = 5): Op[] {
  const rng = mulberry(seed);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rng() * a.length)];
  const ops: Op[] = [];
  let week = 1;
  for (let day = 0; day < days; day++) {
    const dayStart = new Date(2026, 5, 1 + day, 18, 0, 0).getTime(); // từ 01/06/2026 (trước các mốc quy tắc cũ)
    ops.push((_st, c) => void (c.t = dayStart));
    if (rng() < 1 / 14 && week < MAX_WEEK) {
      week++;
      const w = week;
      ops.push((st) => st.setCurrentWeek(w));
    }
    if (rng() < 0.01 && week > 3) {
      // Bố mẹ lùi tuần rồi tiến lại
      const w = week;
      const back = Math.max(1, w - 1 - Math.floor(rng() * 3));
      ops.push((st) => st.setCurrentWeek(back));
      ops.push((st) => st.setCurrentWeek(w));
    }
    if (rng() > perWeek / 7) continue;
    const nSessions = rng() < 0.15 ? 2 : 1;
    for (let k = 0; k < nSessions; k++) {
      const w = rng() < 0.85 ? week : 1 + Math.floor(rng() * week);
      const plan = weekPlan(w);
      const kind = rng();
      const lessonId =
        w === 1 && rng() < 0.3
          ? 'w1-test'
          : kind < 0.65
            ? pick(plan.lessons).id
            : kind < 0.8
              ? `w${w}-daily`
              : `w${w}-song-${pick(SONG_IDS)}`;
      const stage = [10, 21, 31].includes(w) && rng() < 0.4;
      const steps: Op[] = [];
      const n = 3 + Math.floor(rng() * 12);
      const tick = 20_000 + Math.floor(rng() * 40_000);
      for (let i = 0; i < n; i++) {
        const r = rng();
        if (r < 0.25) {
          const note = lessonId === 'w1-test' ? 'C4' : pick(PARENT_NOTES);
          const ok = rng() < 0.85 ? 'correct' : 'retry';
          steps.push((st, c) => {
            c.t += tick;
            st.addParentAssessment(cur(st), note, ok);
          });
        } else if (r < 0.4) {
          const e = pick(APP_EXP);
          const ok = rng() < 0.8;
          steps.push((st, c) => {
            c.t += tick;
            st.addAppAssessment(cur(st), e, ok ? e : 'xx');
          });
        } else if (r < 0.6) {
          const e = lessonId === 'w1-test' ? 'C4' : pick(PITCHES);
          const wrong = rng() < 0.8 ? 0 : 1 + Math.floor(rng() * 3);
          const over = rng() < 0.05 ? (rng() < 0.5 ? 'correct' : 'retry') : null;
          steps.push((st, c) => {
            c.t += tick;
            const id = cur(st);
            st.addMicAssessment(id, { expected: e, firstHeard: wrong ? 'D4' : e, wrongCount: wrong });
            if (over) st.overrideLastMic(id, over);
          });
        } else if (r < 0.9) {
          const song = rng() < 0.15 ? `sight:${pick(['C', 'G', 'Am', 'MC', 'C5'])}:RH` : pick(SONG_IDS);
          const tempo = rng() < 0.6;
          const passed = rng() < 0.7;
          const mic = rng() < 0.6;
          const total = 10 + Math.floor(rng() * 20);
          const run = {
            songId: song,
            mode: tempo ? ('tempo' as const) : ('wait' as const),
            ...(tempo ? { level: 2 as const } : {}),
            bpm: pick([40, 50, 60, 72, 80]),
            hints: pick(['full', 'names', 'staff'] as const),
            phrase: rng() < 0.15 ? ([0, 4] as [number, number]) : null,
            ...(rng() < 0.1 ? { hand: pick(['RH', 'LH'] as const) } : {}),
            ...(!mic ? { checklist: { notes: passed, beat: passed, fingers: rng() < 0.9 } } : {}),
            total,
            hits: passed ? (rng() < 0.3 ? total : total - 1) : Math.floor(total / 2),
            source: mic ? ('mic' as const) : ('parent' as const),
            passed,
          };
          steps.push((st, c) => {
            c.t += tick * 2;
            st.addSongRun(cur(st), run);
          });
        } else {
          const mode = pick(['loud-soft', 'stac-leg'] as const);
          const rounds = 1 + Math.floor(rng() * 4);
          steps.push((st, c) => {
            for (let j = 0; j < rounds; j++) {
              c.t += tick;
              st.addParentAssessment(cur(st), `dyn:${mode}:${j}`, 'correct');
            }
          });
        }
      }
      const medal = rng() < 0.9 ? 'correct' : 'retry'; // rút TRƯỚC (thao tác phải chạy lại y hệt)
      if (stage) steps.push((st, c) => ((c.t += tick), st.addParentAssessment(cur(st), 'medal', medal)));
      const rating = pick(['all', 'some', 'hard'] as const);
      const finish = rng() < 0.9;
      const markDone = rng() < 0.7;
      const empty = rng() < 0.03;
      ops.push((st, c) => {
        c.t += 3_600_000 * k;
        const s = st.startSession(lessonId);
        if (empty) {
          st.discardSessionIfEmpty(s.id);
          return;
        }
        for (const f of steps) f(st, c);
        if (finish) {
          st.setSelfRating(s.id, rating);
          st.finishSession(s.id);
          if (markDone) st.markLessonCompleted(lessonId);
        }
      });
    }
  }
  return ops;
}

/** Mã buổi đang chạy = buổi cuối cùng còn giữ. */
const cur = (st: ProgressStore) => st.get().sessions[st.get().sessions.length - 1].id;

/** Chạy lại thao tác trên một store mới. */
async function play(ops: Op[], opts: { autoCompact: boolean; kv?: KeyValueStorage }) {
  const clock = { t: new Date(2026, 5, 1).getTime() };
  const kv = opts.kv ?? new MemoryStorage();
  // Store "đầy đủ" không cần ghi thật mỗi lần (chỉ để so sánh) → trễ ghi rất dài
  const st = new ProgressStore(kv, () => new Date(clock.t), { autoCompact: opts.autoCompact, saveDelayMs: opts.autoCompact ? 0 : 2_000_000_000, pageEvents: false });
  st.setLearnerName('Bống');
  for (let i = 0; i < ops.length; i++) {
    ops[i](st, clock);
    if (i % 200 === 199) await new Promise((r) => setTimeout(r, 0)); // nhường vòng lặp sự kiện (vitest RPC)
  }
  return { st, kv, clock };
}

/** Bản sao sâu giữ nguyên dữ liệu (không mang số phiên bản ghi nhớ). */
const clone = (d: Readonly<AppData>): AppData => JSON.parse(JSON.stringify(d));

/** Mọi kết quả đọc lịch sử cần giống nhau trước / sau khi gộp. */
function readers(d: Readonly<AppData>, now: number) {
  const nowD = new Date(now);
  const songs = SONGS.map((t) => ({
    id: t.id,
    mastered: songMastered(d, t.id),
    fresh: songFresh(t.id, d, now),
    last: lastWholePlay(d, t.id),
    ever: songEverPlayed(d, t.id),
  }));
  // Tiêu chí tuần: tuần hiện tại trở đi + tuần 1 / huy chương (tiêu chí một buổi) phải khớp TUYỆT ĐỐI. Tuần đã đi qua
  // mà chưa đạt (bố mẹ cho qua tay) được gộp có chủ ý (compaction.ts) — không còn quyết định gì: đảo vẫn sáng.
  const cur = d.progress.currentWeek;
  const weeks = WEEKS.map((w) =>
    w.week >= cur || [1, 10, 21, 31].includes(w.week)
      ? { w: w.week, passed: weekPassed(w.week, d), complete: weekComplete(w.week, d), progress: criterionProgress(w.week, d), island: islandPassed(w.week, d) }
      : { w: w.week, island: islandPassed(w.week, d) },
  );
  const next = nextLesson(d, mulberry(7), now);
  const ps = parentStats(d);
  return {
    stickers: earnedStickerIds(d),
    all: allStickers(d),
    report: buildReport(d, nowD),
    mastered: masteredSongs(d),
    songs,
    memory: [...targetMemory(d).entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
    busy: busyWeeks(d),
    best: bestStreak(d),
    bestLegacy: bestStreak(d, STREAK_RETIRED_AFTER),
    streak: streakDays(d, nowD),
    weeks,
    next: next.id,
    plan: buildSessionPlan(next, d, { songReview: true, now, rng: mulberry(3) }),
    daily: dailyLesson(d, mulberry(11), now),
    review: WEEKS.slice(4).map((w) => reviewSongStep(w.lessons[0], d, now, mulberry(5))),
    practiceDays: d.progress.practiceDays,
    tonight: tonightView(d, nowD),
    lastDate: lastSessionDate(d),
    weekFirst: WEEKS.map((w) => firstDateOfWeek(d, w.week)),
    counts: [sessionCount(d), completedSessionCount(d)],
    parent: {
      p: [...ps.pAgg].sort(([a], [b]) => (a < b ? -1 : 1)),
      a: [...ps.aAgg].sort(([a], [b]) => (a < b ? -1 : 1)),
      m: [...ps.micAgg].sort(([a], [b]) => (a < b ? -1 : 1)),
      skills: ps.skills,
    },
    freshDays: freshDays(d),
  };
}

/**
 * "Việc cần làm tối nay" — trừ phần "mừng con quay lại" (daysAway / action): tonight.ts (màn phụ huynh, agent khác) còn
 * đọc ngày buổi gần nhất thẳng từ data.sessions; sau khi chuyển sang history.lastSessionDate thì so sánh được cả hai.
 */
function tonightView(d: Readonly<AppData>, now: Date) {
  const { daysAway: _a, action: _b, welcomeBack: _c, ...rest } = tonightPlan(d, now) as ReturnType<typeof tonightPlan> & { daysAway?: unknown; welcomeBack?: unknown };
  return rest;
}

/** Bảng phụ huynh theo mã CŨ của ui/screens/parent.ts (đọc thẳng sessions) — để đối chiếu parentStats. */
function legacyParentTables(d: Readonly<AppData>) {
  const pAgg = new Map<string, { c: number; r: number }>();
  const aAgg = new Map<string, { c: number; t: number }>();
  const micAgg = new Map<string, { t: number; first: number; over: number }>();
  d.sessions.forEach((s) => {
    s.parentAssessments.forEach((a) => {
      const e = pAgg.get(a.note) ?? { c: 0, r: 0 };
      if (a.result === 'correct') e.c++;
      else e.r++;
      pAgg.set(a.note, e);
    });
    s.appAssessments.forEach((a) => {
      const e = aAgg.get(a.expected) ?? { c: 0, t: 0 };
      e.t++;
      if (a.correct) e.c++;
      aAgg.set(a.expected, e);
    });
    s.micAssessments.forEach((a) => {
      const e = micAgg.get(a.expected) ?? { t: 0, first: 0, over: 0 };
      e.t++;
      if (a.firstTry && a.parentOverride !== 'retry') e.first++;
      if (a.parentOverride) e.over++;
      micAgg.set(a.expected, e);
    });
  });
  const pa = d.sessions.flatMap((x) => x.parentAssessments).filter((a) => /^[A-G]/.test(a.note));
  const mic = d.sessions.flatMap((x) => x.micAssessments);
  const app2 = d.sessions.flatMap((x) => x.appAssessments);
  const ear = app2.filter((a) => /^[A-G]/.test(a.expected) || ['up', 'down', 'step', 'skip', 'major', 'minor'].includes(a.expected));
  const tempo = d.sessions.flatMap((x) => x.songRuns).filter((r) => r.mode === 'tempo' && !r.phrase);
  const sight = d.sessions.flatMap((x) => x.songRuns).filter((r) => r.songId.startsWith('sight'));
  return {
    pAgg,
    aAgg,
    micAgg,
    skills: {
      find: { ok: pa.filter((a) => a.result === 'correct').length + mic.filter((a) => a.firstTry).length, all: pa.length + mic.length },
      ear: { ok: ear.filter((a) => a.correct).length, all: ear.length },
      tempo: { ok: tempo.filter((r) => r.passed).length, all: tempo.length },
      sight: { ok: sight.filter((r) => r.passed).length, all: sight.length },
    },
  };
}

describe('gộp lịch sử — kết quả đọc GIỐNG HỆT trước / sau khi gộp (lịch sử ngẫu nhiên ~2 năm)', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}: gộp dần sau mỗi buổi = dữ liệu đầy đủ; gộp một lần cũng vậy; idempotent; qua xuất/nhập`, async () => {
      const ops = randomOps(seed, 730);
      const full = await play(ops, { autoCompact: false });
      const comp = await play(ops, { autoCompact: true });
      const now = full.clock.t;
      const fd = full.st.get();
      const cd = comp.st.get();
      // Thật sự đã gộp (không phải phép thử rỗng)
      expect(cd.history?.sessions ?? 0).toBeGreaterThan(200);
      expect(cd.sessions.length).toBeLessThan(fd.sessions.length / 3);
      expect(sessionCount(cd)).toBe(fd.sessions.length);

      const want = readers(fd, now);
      // parentStats trên dữ liệu đầy đủ = mã cũ của màn Phụ huynh
      const legacy = legacyParentTables(fd);
      expect(parentStats(fd).pAgg).toEqual(legacy.pAgg);
      expect(parentStats(fd).aAgg).toEqual(legacy.aAgg);
      expect(parentStats(fd).micAgg).toEqual(legacy.micAgg);
      expect(parentStats(fd).skills).toEqual(legacy.skills);

      // (1) gộp dần (store tự gộp khi mở / sau mỗi buổi)
      expect(readers(cd, now)).toEqual(want);
      // (2) gộp một lần trên bản sao dữ liệu đầy đủ
      const once = clone(fd);
      const r1 = compactData(once, new Date(now));
      expect(r1.folded).toBeGreaterThan(0);
      expect(readers(once, now)).toEqual(want);
      // (3) idempotent
      const snap = JSON.stringify(once);
      expect(compactData(once, new Date(now)).folded).toBe(0);
      expect(JSON.stringify(once)).toBe(snap);
      // (4) xuất → nhập lại (store khác) giữ nguyên
      const other = new ProgressStore(new MemoryStorage(), () => new Date(now), { pageEvents: false });
      expect(other.importJSON(comp.st.exportJSON())).toEqual({ ok: true });
      expect(readers(other.get(), now)).toEqual(want);
      // (5) mở lại từ localStorage
      const reopened = new ProgressStore(comp.kv, () => new Date(now), { pageEvents: false });
      expect(readers(reopened.get(), now)).toEqual(want);
      // (6) gộp ở nhiều thời điểm sau đó (bé nghỉ lâu) vẫn khớp với dữ liệu đầy đủ
      for (const later of [30, 120, 400]) {
        const t = now + later * DAY;
        const a = clone(fd);
        compactData(a, new Date(t));
        expect(readers(a, t)).toEqual(readers(fd, t));
      }
    }, 120_000);
  }
});

/** Lịch sử "điển hình" theo rà soát độ bền: 5 ngày/tuần, ~7 lượt ghi mỗi loại mỗi buổi, 20 bài bố mẹ thêm, micro từ ngày 60. */
function typicalOps(days: number): Op[] {
  const rng = mulberry(42);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rng() * a.length)];
  const ops: Op[] = [];
  const P = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const VI = ['Đô', 'Rê', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Đố'];
  ops.push((st, c) => {
    for (let i = 0; i < 20; i++) {
      const notes = Array.from({ length: 40 }, (_, k) => ({ pitch: P[(i + k * 3) % 8], beats: 1, finger: 1 + ((i + k) % 5) }));
      st.addParentSong({ id: `p${i}`, title: `Bài của mẹ số ${i}`, createdAt: c.t, timeSignature: '4/4', bpm: 80, notes, phrases: [0, 4, 8], text: notes.map((n) => VI[P.indexOf(n.pitch)]).join(' ') });
    }
  });
  let week = 1;
  for (let day = 1; day <= days; day++) {
    const t0 = new Date(2026, 9, 7 + day, 19, 0, 0);
    const dow = t0.getDay();
    if (day % 6 === 0 && week < MAX_WEEK) {
      week++;
      const w = week;
      ops.push((st) => st.setCurrentWeek(w));
    }
    if (dow === 0 || dow === 3) continue;
    const w = week;
    const mic = day >= 60;
    ops.push((st, c) => {
      c.t = t0.getTime();
      const lesson = pick(weekPlan(w).lessons);
      const s = st.startSession(lesson.id);
      const tick = () => (c.t += 15_000);
      st.addParentAssessment(s.id, 'tech:hand-shape', 'correct');
      for (let i = 0; i < 6; i++) {
        tick();
        const p = pick(P);
        if (mic) st.addMicAssessment(s.id, { expected: p, firstHeard: p, wrongCount: rng() < 0.85 ? 0 : 1 });
        else st.addParentAssessment(s.id, p, rng() < 0.85 ? 'correct' : 'retry');
      }
      for (let i = 0; i < 4; i++) {
        tick();
        const p = pick(P);
        st.addAppAssessment(s.id, p, rng() < 0.85 ? p : 'xx');
      }
      for (let i = 0; i < 5; i++) {
        c.t += 60_000;
        const ok = rng() < 0.85;
        st.addSongRun(s.id, { songId: pick(SONG_IDS), mode: i % 2 ? 'tempo' : 'wait', ...(i % 2 ? { level: 2 as const } : {}), bpm: 72, hints: 'names', phrase: null, total: 24, hits: ok ? 24 : 15, source: mic ? 'mic' : 'parent', passed: ok, ...(!mic ? { checklist: { notes: ok, beat: ok, fingers: true } } : {}) });
      }
      // Lên sân khấu cuối Cấp (tuần huy chương) — tuần 31 đạt thì bé chuyển sang "Luyện tập mỗi ngày"
      if ([10, 21, 31].includes(w)) st.addParentAssessment(s.id, 'medal', 'correct');
      st.setSelfRating(s.id, 'all');
      st.finishSession(s.id);
      st.markLessonCompleted(lesson.id);
    });
  }
  return ops;
}

describe('dung lượng: dùng điển hình 2 năm', () => {
  it('sau khi gộp < 300 K ký tự (trước khi gộp ~1 M)', async () => {
    const ops = typicalOps(730);
    const comp = await play(ops, { autoCompact: true });
    const size = comp.kv.getItem(STORAGE_KEY)!.length;
    const fullSize = JSON.stringify((await play(ops, { autoCompact: false })).st.get()).length;
    // eslint-disable-next-line no-console
    console.log(`[durability] typical 2y: full=${fullSize} chars, compacted=${size} chars, live sessions=${comp.st.get().sessions.length}`);
    expect(size).toBeLessThan(300_000);
    expect(fullSize).toBeGreaterThan(3 * size);
  }, 120_000);
});

/** localStorage có giới hạn (ký tự) — ném QuotaExceededError như Safari. */
class QuotaStorage extends MemoryStorage {
  constructor(public limit: number) {
    super();
  }
  used(except?: string) {
    let n = 0;
    for (let i = 0; i < this.length; i++) {
      const k = this.key(i)!;
      if (k !== except) n += k.length + this.getItem(k)!.length;
    }
    return n;
  }
  setItem(k: string, v: string) {
    if (this.used(k) + k.length + v.length > this.limit) {
      const e = new Error('The quota has been exceeded.');
      e.name = 'QuotaExceededError';
      throw e;
    }
    super.setItem(k, v);
  }
}

describe('hết chỗ localStorage', () => {
  const now = () => new Date(2026, 9, 6, 18);
  it('gặp QuotaExceeded: bỏ bản cất cũ rồi ghi lại được; vẫn hết chỗ → storageStatus báo full (không im lặng)', () => {
    const kv = new QuotaStorage(6_000);
    kv.setItem(`${STORAGE_KEY}:archived-1`, 'x'.repeat(4_800));
    const st = new ProgressStore(kv, now, { pageEvents: false });
    const s = st.startSession('w1-l1');
    for (let i = 0; i < 15; i++) st.addParentAssessment(s.id, 'C4', 'correct');
    expect(st.storageStatus().ok).toBe(true);
    expect(kv.getItem(`${STORAGE_KEY}:archived-1`)).toBeNull(); // bản cất bị bỏ để còn chỗ cho dữ liệu chính
    for (let i = 0; i < 200; i++) st.addParentAssessment(s.id, 'D4', 'retry');
    const status = storageStatus();
    expect(status.ok).toBe(false);
    expect(status.full).toBe(true);
    expect(status.lastError).toMatch(/quota/i);
    expect(st.lastSaveError).not.toBeNull();
    expect(status.quotaEstimate).toBeGreaterThan(1_000_000);
    expect(status.usedChars).toBeGreaterThan(0);
  });

  it('resetAll / importJSON TỪ CHỐI khi không cất được bản hiện tại (trừ khi force)', () => {
    const kv = new QuotaStorage(4_000);
    const st = new ProgressStore(kv, now, { pageEvents: false });
    st.setLearnerName('Bống');
    const s = st.startSession('w1-l1');
    for (let i = 0; i < 25; i++) st.addParentAssessment(s.id, 'C4', 'correct');
    expect(st.storageStatus().ok).toBe(true);
    const r = st.resetAll();
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.archiveFailed).toBe(true);
    expect(st.get().sessions).toHaveLength(1); // chưa xóa gì
    const imp = st.importJSON(JSON.stringify(defaultData(now())));
    expect(imp.ok).toBe(false);
    expect(st.get().learner.name).toBe('Bống');
    expect(st.resetAll({ force: true })).toEqual({ ok: true });
    expect(st.get().sessions).toHaveLength(0);
  });

  it('resetAll khi còn chỗ: luôn có đúng MAX_ARCHIVES (=1) bản cất, là dữ liệu trước khi xóa', () => {
    const kv = new MemoryStorage();
    let t = new Date(2026, 9, 6).getTime();
    const st = new ProgressStore(kv, () => new Date(t), { pageEvents: false });
    for (let i = 0; i < 3; i++) {
      t += 1000;
      st.setLearnerName(`Bé ${i}`);
      expect(st.resetAll()).toEqual({ ok: true });
      expect(st.lastArchiveKey).not.toBeNull();
    }
    expect(MAX_ARCHIVES).toBe(1);
    expect(st.archivedKeys()).toEqual([st.lastArchiveKey]);
    expect(JSON.parse(kv.getItem(st.lastArchiveKey!)!).learner.name).toBe('Bé 2');
  });
});

describe('ghi trễ (debounce)', () => {
  it('nhiều lần bấm → một lần ghi; xong buổi / cuối hoạt động / flush() ghi ngay', async () => {
    let writes = 0;
    const mem = new MemoryStorage();
    const kv: KeyValueStorage = {
      get length() {
        return mem.length;
      },
      key: (i) => mem.key(i),
      getItem: (k) => mem.getItem(k),
      removeItem: (k) => mem.removeItem(k),
      setItem: (k, v) => {
        if (k === STORAGE_KEY) writes++;
        mem.setItem(k, v);
      },
    };
    const st = new ProgressStore(kv, () => new Date(2026, 9, 6, 18), { saveDelayMs: 30, pageEvents: false });
    const s = st.startSession('w2-l1');
    for (let i = 0; i < 20; i++) st.addParentAssessment(s.id, 'C4', 'correct');
    expect(writes).toBe(0);
    expect(st.storageStatus().pending).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(writes).toBe(1);
    st.addParentAssessment(s.id, 'D4', 'correct');
    st.markLessonCompleted('w2-l1#0'); // cuối một hoạt động → ghi ngay
    expect(writes).toBe(2);
    st.addParentAssessment(s.id, 'E4', 'correct');
    st.finishSession(s.id);
    expect(writes).toBe(3);
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).sessions[0].completed).toBe(true);
    st.addParentAssessment(s.id, 'F4', 'retry');
    expect(st.flush().pending).toBe(false);
    expect(writes).toBe(4);
    st.dispose();
  });
});

describe('sticker đảo / huy chương không mất khi bố mẹ lùi tuần', () => {
  it('lùi từ tuần 12 về 5: đảo 5–11 vẫn sáng (sticker + bản đồ)', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 6, 18), { pageEvents: false });
    st.setCurrentWeek(12);
    const before = earnedStickerIds(st.get());
    expect(before).toContain('island-11');
    st.setCurrentWeek(5);
    const after = earnedStickerIds(st.get());
    expect(after).toEqual(before);
    expect(islandPassed(11, st.get())).toBe(true);
    // qua xuất / nhập vẫn giữ
    const other = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 6, 18), { pageEvents: false });
    other.importJSON(st.exportJSON());
    expect(earnedStickerIds(other.get())).toEqual(before);
  });
});

describe('dữ liệu của bản app MỚI HƠN', () => {
  for (const [name, patch] of [
    ['schemaVersion 2', { schemaVersion: 2 }],
    ['curriculumRev 99', { curriculumRev: 99 }],
  ] as const) {
    it(`${name}: giữ nguyên, không đặt lại / không ghi đè, báo futureVersion`, () => {
      const kv = new MemoryStorage();
      const raw = JSON.stringify({ ...defaultData(), ...patch, sessions: [{ id: 'x', date: '2027-01-01', lessonId: 'w40-l1' }] });
      kv.setItem(STORAGE_KEY, raw);
      const st = new ProgressStore(kv, () => new Date(2026, 9, 6), { pageEvents: false });
      expect(st.futureVersion).toBe(true);
      expect(st.recoveredFromCorrupt).toBe(false);
      expect(storageStatus().futureVersion).toBe(true);
      expect(storageStatus().ok).toBe(false);
      st.startSession('w1-l1'); // giao diện lỡ ghi → bị bỏ qua
      expect(kv.getItem(STORAGE_KEY)).toBe(raw);
      expect(kv.length).toBe(1); // không có bản "corrupt-*"
      // Nhập JSON của bản mới hơn → từ chối với lời báo rõ
      const imp = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 6), { pageEvents: false }).importJSON(raw);
      expect(imp.ok === false && imp.error).toMatch(/phiên bản mới hơn/);
      // Đặt lại có chủ ý: dữ liệu mới hơn được CẤT nguyên văn
      expect(st.resetAll()).toEqual({ ok: true });
      expect(kv.getItem(st.lastArchiveKey!)).toBe(raw);
      expect(st.futureVersion).toBe(false);
    });
  }
});

describe('độ "tươi" sau khi xong giáo trình', () => {
  it(`chưa xong: ${FRESH_DAYS} ngày; xong tuần ${MAX_WEEK}: ${FRESH_DAYS_AFTER_CURRICULUM} ngày + luyện mỗi ngày xoay vòng bài lâu chưa chơi nhất`, () => {
    let t = new Date(2026, 9, 6, 18).getTime();
    const st = new ProgressStore(new MemoryStorage(), () => new Date(t), { pageEvents: false, autoCompact: false });
    st.setCurrentWeek(MAX_WEEK);
    const run = (songId: string) => ({ songId, mode: 'tempo' as const, level: 2 as const, bpm: 72, hints: 'names' as const, phrase: null, total: 10, hits: 10, source: 'mic' as const, passed: true });
    const ids = SONGS.filter((s) => !s.id.startsWith('sight')).slice(0, 4).map((s) => s.id);
    ids.forEach((id, i) => {
      t += DAY;
      const s = st.startSession(`w${MAX_WEEK}-song-${i}`);
      st.addSongRun(s.id, run(id));
      st.finishSession(s.id);
    });
    const at = t + 30 * DAY;
    expect(freshDays(st.get())).toBe(FRESH_DAYS);
    expect(songFresh(ids[3], st.get(), at)).toBe(false);
    const s = st.startSession(`w${MAX_WEEK}-stage`);
    st.addParentAssessment(s.id, 'medal', 'correct');
    st.finishSession(s.id);
    expect(weekPassed(MAX_WEEK, st.get())).toBe(true);
    expect(freshDays(st.get())).toBe(FRESH_DAYS_AFTER_CURRICULUM);
    expect(songFresh(ids[3], st.get(), at)).toBe(true);
    // Xoay vòng: bài đã thuộc chơi lâu nhất được chọn, bất kể rng
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const l = dailyLesson(st.get(), () => r, at);
      const keep = l.activities.find((a) => a.kind === 'song' && a.mode === 'tempo' && a.level === 3);
      if (keep && keep.kind === 'song') expect(ids.indexOf(keep.songId)).toBeLessThanOrEqual(1);
    }
  });
});
