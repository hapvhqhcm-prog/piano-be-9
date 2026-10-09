/**
 * (+ 2026-10-09) Trò chơi luyện tai & nhịp: 🎧 Đoán nốt · 🎢 Lên hay xuống? · 🎯 Bắt nhịp · 🔁 Đàn lại giai điệu.
 * Phần THUẦN: nội dung theo tuần (chỉ điều đã học), độ khó, chấm điểm, kỷ lục (AppData.games + trường tùy chọn).
 */
import { describe, expect, it } from 'vitest';
import { WEEKS } from '../src/lessons/lessonEngine';
import { SONGS } from '../src/music/tune';
import { TIMING_WINDOWS } from '../src/music/timing';
import { pitchToMidi } from '../src/piano/pitchTable';
import { GAME_IDS, GAME_INFO, gameLock } from '../src/practice/games/catalog';
import { octave4Pool, samePitchClass, taughtWhiteKeys } from '../src/practice/games/pools';
import {
  EAR_LEVEL_UP,
  EAR_ROUNDS,
  earAnswer,
  earCorrect,
  earInit,
  earLevelNotes,
  earMaxLevel,
  earPool,
  earStars,
  earStartLevel,
  earUnlockWeek,
  nextEarNote,
} from '../src/practice/games/earGuess';
import { CONTOUR_ROUNDS, SHAPES2, SHAPES3, contourLevel, contourPool, contourStars, makeContourRound, pickVoice, shapeOf } from '../src/practice/games/contour';
import { ECHO_START, echoNoteOk, echoPool, echoStars, extendEcho, startEcho } from '../src/practice/games/echo';
import {
  BEAT_BARS,
  BEAT_WARM_BARS,
  BeatJudge,
  beatBpm,
  beatPercent,
  beatStars,
  beatUnlocked,
  gradeOffset,
  makeBeatSong,
  targetSymbols,
} from '../src/practice/games/beatCatch';
import { BEATS_PER_BAR, rhythmSymbolsUpTo } from '../src/practice/games/rhythmQuiz';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import { migrate } from '../src/progress/migrations';
import { defaultData, sanitizeGames, validateAppData, type AppData } from '../src/progress/schema';
import { eligibleChallenges, gameBests } from '../src/lessons/challenges';

function seeded(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const dataAt = (week: number): AppData => {
  const d = defaultData(new Date(2026, 9, 7));
  d.progress.currentWeek = week;
  return d;
};
const LAST = WEEKS[WEEKS.length - 1].week;

describe('Danh mục: 7 trò', () => {
  it('có đủ 7 trò, mỗi trò có tên/emoji/đơn vị; khóa theo tuần', () => {
    expect(GAME_IDS).toHaveLength(7);
    expect(new Set(GAME_IDS).size).toBe(7);
    for (const id of GAME_IDS) expect(GAME_INFO[id].title.length).toBeGreaterThan(2);
    // Tuần 1: Lên hay xuống mở ngay (tuần 1 đã có trò "Lên hay xuống"); Đoán nốt / Đàn lại / Bắt nhịp chưa mở
    const w1 = dataAt(1);
    expect(gameLock('contour', w1, SONGS)).toBeNull();
    expect(gameLock('earGuess', w1, SONGS)).toMatch(/tuần/);
    expect(gameLock('echo', w1, SONGS)).toMatch(/tuần/);
    expect(gameLock('beatCatch', w1, SONGS)).toMatch(/tuần/);
    // Tuần 4 (bé hiện tại): cả 4 trò mới đều chơi được
    for (const id of ['earGuess', 'contour', 'beatCatch', 'echo'] as const) expect(gameLock(id, dataAt(4), SONGS)).toBeNull();
    const uw = earUnlockWeek()!;
    expect(gameLock('earGuess', dataAt(uw), SONGS)).toBeNull();
    expect(gameLock('earGuess', dataAt(uw - 1), SONGS)).not.toBeNull();
  });
});

describe('Bể nốt theo giáo trình (chỉ nốt đã học)', () => {
  it('phím trắng đã học tăng dần theo tuần, không có phím đen', () => {
    let prev = 0;
    for (let w = 1; w <= LAST; w++) {
      const k = taughtWhiteKeys(w);
      expect(k.length).toBeGreaterThanOrEqual(prev);
      prev = k.length;
      expect(k.every((p) => /^[A-G]\d$/.test(p))).toBe(true);
    }
    expect(octave4Pool(4)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4']);
    // La / Si chưa học ở tuần 4
    expect(octave4Pool(4)).not.toContain('A4');
  });
  it('cùng tên nốt khác quãng tám', () => {
    expect(samePitchClass('C4', 'C5')).toBe(true);
    expect(samePitchClass('C4', 'D4')).toBe(false);
  });
});

describe('🎧 Đoán nốt', () => {
  it('mức 1 = 3 nốt cách xa (luôn có Đô); mức cao nhất = cả bể', () => {
    const pool = earPool(4);
    expect(earLevelNotes(pool, 1)).toEqual(['C4', 'E4', 'G4']);
    expect(earLevelNotes(pool, 2)).toHaveLength(4);
    expect(earLevelNotes(pool, earMaxLevel(pool))).toEqual(pool);
    for (let l = 1; l <= earMaxLevel(pool); l++) {
      const n = earLevelNotes(pool, l);
      expect(n[0]).toBe('C4');
      expect(n.every((p) => pool.includes(p))).toBe(true);
    }
  });
  it('chỉ đố nốt đã học ở mọi tuần', () => {
    for (let w = 2; w <= LAST; w += 3) {
      const taught = new Set(taughtWhiteKeys(w).map((k) => k[0]));
      const pool = earPool(w);
      if (octave4Pool(w).length >= 3) expect(pool.every((p) => taught.has(p[0]))).toBe(true);
    }
  });
  it('3 câu đúng liền → lên mức (thêm 1 nốt); sai chỉ mất chuỗi, không xuống mức', () => {
    const pool = earPool(4);
    const max = earMaxLevel(pool);
    let s = earInit(1);
    for (let i = 0; i < EAR_LEVEL_UP - 1; i++) expect(((s = earAnswer(s, true, max).state), s.level)).toBe(1);
    const r = earAnswer(s, true, max);
    expect(r.levelUp).toBe(true);
    expect(r.state.level).toBe(2);
    const miss = earAnswer(r.state, false, max);
    expect(miss.state).toMatchObject({ level: 2, streak: 0, bestStreak: 3, score: 3, round: 4 });
    // không vượt mức cao nhất
    let t = earInit(max);
    for (let i = 0; i < 9; i++) t = earAnswer(t, true, max).state;
    expect(t.level).toBe(max);
  });
  it('mức bắt đầu = mức lần trước − 1 (≥ 1, ≤ tối đa)', () => {
    const pool = earPool(4);
    expect(earStartLevel(undefined, pool)).toBe(1);
    expect(earStartLevel(3, pool)).toBe(2);
    expect(earStartLevel(99, pool)).toBe(earMaxLevel(pool));
    expect(earStartLevel(Number.NaN, pool)).toBe(1);
  });
  it('chấm theo tên nốt; không lặp nốt liền; sao', () => {
    expect(earCorrect('E4', 'E5')).toBe(true);
    expect(earCorrect('E4', 'F4')).toBe(false);
    const rng = seeded(3);
    let prev: string | undefined;
    for (let i = 0; i < 50; i++) {
      const n = nextEarNote(['C4', 'E4', 'G4'], rng, prev);
      expect(n).not.toBe(prev);
      prev = n;
    }
    expect([0, 3, 6, 9, EAR_ROUNDS].map(earStars)).toEqual([0, 1, 2, 3, 3]);
  });
});

describe('🎢 Lên hay xuống?', () => {
  it('hình đúng với nốt app chơi, thẻ đúng nằm trong lựa chọn; đầu trò 2 nốt, sau 3 nốt', () => {
    const rng = seeded(7);
    for (const w of [1, 2, 4, 12, 30]) {
      const pool = contourPool(w);
      for (let r = 0; r < CONTOUR_ROUNDS; r++) {
        const q = makeContourRound(pool, r, w, rng);
        expect(shapeOf(q.notes)).toBe(q.shape);
        expect(q.options[q.correct]).toBe(q.shape);
        expect(q.notes.length).toBe(contourLevel(r, w).notes);
        expect(q.options).toBe(q.notes.length === 2 ? SHAPES2 : SHAPES3);
        expect(q.notes.every((p) => pool.includes(p))).toBe(true);
      }
    }
  });
  it('tuần đầu: nốt cách xa (≥ 5 nửa cung ở câu 2 nốt); về sau có bước nhỏ', () => {
    const rng = seeded(11);
    for (let i = 0; i < 30; i++) {
      const q = makeContourRound(contourPool(1), 0, 1, rng);
      expect(Math.abs(pitchToMidi(q.notes[1]) - pitchToMidi(q.notes[0]))).toBeGreaterThanOrEqual(5);
    }
    expect(contourLevel(7, 10).minGap).toBe(2);
    expect(contourLevel(0, 1)).toEqual({ notes: 2, minGap: 5 });
  });
  it('tiếng đàn bí mật: piano hoặc tiếng đã mở; sao', () => {
    expect(pickVoice([], seeded(1))).toBe('piano');
    const r = seeded(2);
    for (let i = 0; i < 20; i++) expect(['piano', 'musicbox']).toContain(pickVoice(['musicbox'], r));
    expect([2, 3, 6, CONTOUR_ROUNDS].map(contourStars)).toEqual([0, 1, 2, 3]);
  });
});

describe('🔁 Đàn lại giai điệu', () => {
  it('giai điệu chỉ dùng nốt đã học, dài thêm đúng 1 nốt, giữ nguyên phần đầu, không 3 nốt giống nhau liền', () => {
    const pool = echoPool(4);
    const rng = seeded(5);
    let s = startEcho(pool, rng);
    expect(s).toHaveLength(ECHO_START);
    for (let i = 0; i < 10; i++) {
      const n = extendEcho(s, pool, rng);
      expect(n.slice(0, s.length)).toEqual(s);
      expect(n).toHaveLength(s.length + 1);
      s = n;
    }
    expect(s.every((p) => pool.includes(p))).toBe(true);
    for (let i = 2; i < s.length; i++) expect(s[i] === s[i - 1] && s[i] === s[i - 2]).toBe(false);
  });
  it('chấm từng nốt theo tên (đàn thật quãng nào cũng được); sao', () => {
    expect(echoNoteOk(['C4', 'E4'], 1, 'E3')).toBe(true);
    expect(echoNoteOk(['C4', 'E4'], 1, 'D4')).toBe(false);
    expect(echoNoteOk(['C4'], 1, 'C4')).toBe(false);
    expect([2, 3, 5, 7].map(echoStars)).toEqual([0, 1, 2, 3]);
  });
});

describe('🎯 Bắt nhịp', () => {
  it('chỉ nhịp đã học; ô đầu là "Đi"; mỗi ô đủ 4 phách; mở từ khi có bài nhịp', () => {
    expect(beatUnlocked(1)).toBe(rhythmSymbolsUpTo(1).length > 0);
    for (const w of [2, 4, 9, 18, LAST]) {
      if (!beatUnlocked(w)) continue;
      const learned = new Set(rhythmSymbolsUpTo(w));
      const s = makeBeatSong(w, seeded(w));
      expect(s.bars).toHaveLength(BEAT_BARS);
      expect(s.totalBeats).toBe(BEAT_BARS * BEATS_PER_BAR);
      for (const bar of s.bars) for (const x of bar) expect(learned.has(x) || x === 'walk').toBe(true);
      if (learned.has('walk')) for (let b = 0; b < BEAT_WARM_BARS; b++) expect(s.bars[b]).toEqual(['walk', 'walk', 'walk', 'walk']);
      expect(targetSymbols(s)).toHaveLength(s.targets.length);
      expect([...s.targets].sort((a, b) => a - b)).toEqual(s.targets);
      expect([60, 72, 80]).toContain(s.bpm);
    }
    // Tuần 4: "Chạy-chạy" (móc đơn) đã học → có thể chậm hơn; chỉ phách đen → 80
    expect(beatBpm([0, 1, 2, 3])).toBe(80);
    expect(beatBpm([0, 0.5, 1])).toBe(72);
    expect(beatBpm([0, 0.25, 0.5])).toBe(60);
  });
  it('chấm theo cửa sổ thời gian: Tuyệt / Tốt / Được; chạm thừa không trừ điểm; mỗi chấm nhận 1 lần chạm', () => {
    const j = new BeatJudge([0, 1, 2, 3, 3.5], TIMING_WINDOWS.easy);
    expect(j.tap(0.05)).toMatchObject({ index: 0, grade: 'perfect' });
    expect(j.tap(0.1)).toBeNull(); // chạm thừa ngay sau: chấm 0 đã chấm, chấm 1 còn xa
    expect(j.tap(1.2)).toMatchObject({ index: 1, grade: 'good' });
    expect(j.tap(1.6)).toMatchObject({ index: 2, grade: 'ok' }); // sớm 0,4 phách — vẫn trong cửa sổ (nửa khoảng cách)
    // móc đơn 3 / 3,5: cửa sổ không vượt nửa khoảng cách (0,25) — chạm 3,3 thuộc về 3,5
    expect(j.tap(3.3)).toMatchObject({ index: 4 });
    expect(j.sweep(10)).toEqual([3]);
    expect(j.hits).toHaveLength(4);
    expect(j.points).toBe(3 + 2 + 1 + 2);
    expect(j.percent).toBe(beatPercent(8, 5));
  });
  it('lỡ chấm (sweep) → không chạm được nữa', () => {
    const j = new BeatJudge([0, 4], TIMING_WINDOWS.strict);
    expect(j.sweep(1)).toEqual([0]);
    expect(j.tap(0.1)).toBeNull();
    expect(j.tap(4)).toMatchObject({ index: 1, grade: 'perfect' });
    expect(j.percent).toBe(50);
  });
  it('mức điểm, sao', () => {
    expect(gradeOffset(-0.1)).toBe('perfect');
    expect(gradeOffset(0.2)).toBe('good');
    expect(gradeOffset(0.4)).toBe('ok');
    expect(beatPercent(30, 10)).toBe(100);
    expect(beatPercent(0, 0)).toBe(0);
    expect([20, 30, 60, 85, 100].map(beatStars)).toEqual([0, 1, 2, 3, 3]);
  });
  it('bài nhịp với mọi ngẫu nhiên vẫn hợp lệ (100 lần)', () => {
    const rng = seeded(99);
    for (let i = 0; i < 100; i++) {
      const s = makeBeatSong(4, rng);
      expect(s.targets.length).toBeGreaterThan(BEAT_BARS);
      expect(s.targets.every((t) => t >= 0 && t < s.totalBeats)).toBe(true);
    }
  });
});

describe('Kỷ lục (AppData.games) — trường tùy chọn level / streak', () => {
  it('recordGame lưu mức (ghi đè) và chuỗi dài nhất (giữ cao nhất); qua lưu/nạp & sao lưu', () => {
    const kv = new MemoryStorage();
    const store = new ProgressStore(kv, () => new Date(2026, 9, 9, 10), { pageEvents: false });
    store.recordGame('earGuess', 7, { level: 3, streak: 5 });
    store.recordGame('earGuess', 4, { level: 2, streak: 2 });
    expect(store.gameScore('earGuess')).toMatchObject({ best: 7, plays: 2, level: 2, streak: 5 });
    store.recordGame('earGuess', 5);
    expect(store.gameScore('earGuess')).toMatchObject({ level: 2, streak: 5 });
    store.recordGame('echo', 4);
    expect(store.gameScore('echo')).toEqual({ best: 4, plays: 1, lastAt: expect.any(Number) });
    const again = new ProgressStore(kv, () => new Date(2026, 9, 9, 10), { pageEvents: false });
    expect(again.gameScore('earGuess')).toMatchObject({ level: 2, streak: 5 });
    const exported = JSON.parse(store.exportJSON());
    expect(validateAppData(migrate(exported))).toEqual([]);
    expect(migrate(exported).games?.earGuess).toMatchObject({ level: 2, streak: 5 });
  });
  it('trường tùy chọn hỏng → chỉ bỏ trường đó; validate chặn số âm', () => {
    expect(sanitizeGames({ a: { best: 3, plays: 1, lastAt: 5, level: 'x', streak: -2 } })).toEqual({ a: { best: 3, plays: 1, lastAt: 5 } });
    expect(sanitizeGames({ a: { best: 3, plays: 1, lastAt: 5, level: 2.7, streak: 4 } })).toEqual({ a: { best: 3, plays: 1, lastAt: 5, level: 2, streak: 4 } });
    const d = defaultData();
    expect(validateAppData({ ...d, games: { a: { best: 1, plays: 1, lastAt: 0, level: 2 } } })).toEqual([]);
    expect(validateAppData({ ...d, games: { a: { best: 1, plays: 1, lastAt: 0, level: -1 } } })).toContain('games');
  });
  it('🏆 "Phá kỷ lục" tính cả trò mới (kỷ lục có từ trước tuần)', () => {
    let t = new Date(2026, 9, 2, 10); // thứ 6 tuần trước
    const store = new ProgressStore(new MemoryStorage(), () => t, { pageEvents: false });
    store.recordGame('beatCatch', 40);
    t = new Date(2026, 9, 6, 10); // thứ 3 tuần này
    store.recordChallenges();
    expect(store.get().progress.gameBase).toEqual({ monday: '2026-10-05', bests: { beatCatch: 40 } });
    expect(eligibleChallenges(store.get(), '2026-10-05').some((p) => p.id === 'record')).toBe(true);
    store.recordGame('beatCatch', 55);
    expect(gameBests(store.get()).get('beatCatch')?.[0]).toBe(55);
  });
});
