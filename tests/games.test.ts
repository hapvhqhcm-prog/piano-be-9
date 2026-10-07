import { describe, expect, it } from 'vitest';
import { LEFT_HAND_WEEK } from '../src/lessons/lessonEngine';
import { SONGS } from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';
import { gameLock } from '../src/practice/games/catalog';
import { nextRushNote, rushCorrect, rushKeyboardRange, rushPool, rushStars } from '../src/practice/games/noteRush';
import {
  RHYTHM_ROUNDS,
  beatsOf,
  makeRhythmRound,
  onsetsOf,
  respectsBarlines,
  rhythmSymbolsUpTo,
  rhythmTones,
  rhythmUnlockWeek,
} from '../src/practice/games/rhythmQuiz';
import { SONG_ROUNDS, baseTitle, eligibleSongs, firstPhrase, guessBpm, makeSongRounds } from '../src/practice/games/songGuess';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import { migrate } from '../src/progress/migrations';
import { defaultData, sanitizeGames, validateAppData, type AppData } from '../src/progress/schema';
import { beatsPerMeasure, measureCount } from '../src/music/tune';
import { songEmoji } from '../src/ui/components/songArt';

/** Bộ sinh số giả ngẫu nhiên cố định (test lặp lại được). */
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

describe('⚡ Đọc nốt nhanh — bể nốt theo giáo trình', () => {
  it('trước tuần đọc khuông: chế độ tên nốt, tìm phím ở mọi quãng tám', () => {
    const p = rushPool(3);
    expect(p.mode).toBe('name');
    expect(p.notes.length).toBeGreaterThanOrEqual(3);
    expect(p.notes.every((n) => /^[A-G]4$/.test(n.pitch))).toBe(true);
    expect(rushCorrect(p, { pitch: 'E4', clef: 'treble' }, 'E3')).toBe(true);
    expect(rushCorrect(p, { pitch: 'E4', clef: 'treble' }, 'F4')).toBe(false);
    expect(rushKeyboardRange(p)).toEqual(['C4', 'C5']);
  });

  it('tuần 8 (đọc khuông): chỉ khóa Sol, không có dòng kẻ phụ / nốt cao (≤ Đô5)', () => {
    const p = rushPool(8);
    expect(p.mode).toBe('staff');
    expect(p.notes.every((n) => n.clef === 'treble')).toBe(true);
    expect(Math.max(...p.notes.map((n) => pitchToMidi(n.pitch)))).toBeLessThanOrEqual(pitchToMidi('C5'));
    expect(Math.min(...p.notes.map((n) => pitchToMidi(n.pitch)))).toBeGreaterThanOrEqual(pitchToMidi('C4'));
    // Chạm phím: phải đúng quãng tám
    expect(rushCorrect(p, { pitch: 'E4', clef: 'treble' }, 'E5')).toBe(false);
    expect(rushCorrect(p, { pitch: 'E4', clef: 'treble' }, 'E5', true)).toBe(true); // micro: dễ tính 1 quãng tám
  });

  it('khóa Fa chỉ từ khi giáo trình dạy (và không trước tuần tay trái)', () => {
    expect(rushPool(10).notes.some((n) => n.clef === 'bass')).toBe(false);
    for (let w = 1; w < LEFT_HAND_WEEK; w++) expect(rushPool(w).notes.some((n) => n.clef === 'bass')).toBe(false);
    expect(rushPool(11).notes.some((n) => n.clef === 'bass')).toBe(true);
  });

  it('dòng kẻ phụ / nốt cao chỉ sau tuần dạy chúng', () => {
    const hi = (w: number) => Math.max(...rushPool(w).notes.filter((n) => n.clef === 'treble').map((n) => pitchToMidi(n.pitch)));
    expect(hi(22)).toBeLessThan(pitchToMidi('G5'));
    expect(rushPool(23).notes.some((n) => n.pitch === 'A5')).toBe(true);
    // bể nốt chỉ lớn dần
    for (let w = 2; w <= 31; w++) {
      const prev = new Set(rushPool(w - 1).notes.map((n) => `${n.pitch}:${n.clef}`));
      const cur = new Set(rushPool(w).notes.map((n) => `${n.pitch}:${n.clef}`));
      if (rushPool(w - 1).mode === 'staff') for (const k of prev) expect(cur.has(k)).toBe(true);
    }
  });

  it('nốt kế không lặp lại, dải phím chứa hết bể nốt, sao theo điểm', () => {
    const p = rushPool(24);
    const rng = seeded(7);
    let prev = nextRushNote(p, rng);
    for (let i = 0; i < 200; i++) {
      const n = nextRushNote(p, rng, prev);
      expect(n.pitch === prev.pitch && n.clef === prev.clef).toBe(false);
      prev = n;
    }
    const [lo, hi] = rushKeyboardRange(p);
    for (const n of p.notes) {
      expect(pitchToMidi(n.pitch)).toBeGreaterThanOrEqual(pitchToMidi(lo));
      expect(pitchToMidi(n.pitch)).toBeLessThanOrEqual(pitchToMidi(hi));
    }
    expect(lo.includes('#')).toBe(false);
    expect([rushStars(0), rushStars(5), rushStars(12), rushStars(20)]).toEqual([0, 1, 2, 3]);
  });
});

describe('🥁 Đố nhịp', () => {
  it('ký hiệu theo tuần học; mở khi có ≥ 2 ký hiệu', () => {
    expect(rhythmSymbolsUpTo(1)).toEqual([]);
    expect(rhythmSymbolsUpTo(4)).toEqual(expect.arrayContaining(['walk', 'run', 'long', 'rest']));
    expect(rhythmSymbolsUpTo(10)).not.toContain('run4');
    expect(rhythmSymbolsUpTo(18)).toContain('run4');
    expect(rhythmSymbolsUpTo(17)).not.toContain('sync');
    const uw = rhythmUnlockWeek()!;
    expect(uw).toBeGreaterThan(1);
    expect(gameLock('rhythmQuiz', dataAt(uw - 1), SONGS)).toMatch(/tuần/);
    expect(gameLock('rhythmQuiz', dataAt(uw), SONGS)).toBeNull();
  });

  for (const week of [4, 9, 15, 18, 19, 31]) {
    it(`tuần ${week}: 3 thẻ khác tiếng nhau, chỉ dùng ký hiệu đã học, khó dần`, () => {
      const learned = rhythmSymbolsUpTo(week);
      const rng = seeded(week);
      let prev: string[] | undefined;
      for (let r = 0; r < RHYTHM_ROUNDS; r++) {
        const q = makeRhythmRound(learned, r, rng, prev as never);
        expect(q.options).toHaveLength(3);
        expect(q.options[q.correct]).toBe(q.answer);
        const sigs = q.options.map((o) => onsetsOf(o).join(','));
        expect(new Set(sigs).size).toBe(3);
        for (const o of q.options) {
          expect(beatsOf(o)).toBe(4 * q.bars);
          expect(respectsBarlines(o)).toBe(true);
          for (const s of o) expect(learned).toContain(s);
        }
        expect(q.bars).toBe(r < 6 ? 1 : 2);
        if (r < 3) for (const s of q.answer) expect(learned.slice(0, 3)).toContain(s);
        expect(onsetsOf(q.answer)[0]).toBe(0); // mở đầu bằng tiếng vỗ
        prev = q.answer;
      }
    });
  }

  it('tiếng phát: nốt trắng ngân dài hơn nốt đen, dấu lặng không kêu', () => {
    const t = rhythmTones(['long', 'walk', 'rest']);
    expect(t).toHaveLength(2);
    expect(t[0][1]).toBeGreaterThan(t[1][1]);
    expect(t[1][0]).toBe(2);
  });
});

describe('🎵 Nghe đoán bài', () => {
  it('khóa khi < 3 bài; tuần 1 chưa có bài', () => {
    expect(eligibleSongs(dataAt(1), SONGS).length).toBeLessThan(3);
    expect(gameLock('songGuess', dataAt(1), SONGS)).toMatch(/bài/);
    expect(gameLock('songGuess', dataAt(6), SONGS)).toBeNull();
  });

  it('biến thể cùng một bài gộp làm một (ưu tiên bản gốc)', () => {
    const pool = eligibleSongs(dataAt(31), SONGS);
    const bases = pool.map(baseTitle);
    expect(new Set(bases).size).toBe(bases.length);
    expect(baseTitle({ titleVi: 'Chú cừu nhỏ — tay trái' })).toBe('Chú cừu nhỏ');
    expect(baseTitle({ titleVi: 'Lý cây đa (dân ca quan họ Bắc Ninh)' })).toBe('Lý cây đa');
    expect(pool.find((t) => baseTitle(t) === 'Chú cừu nhỏ')?.titleVi).toBe('Chú cừu nhỏ');
  });

  it('bài đã từng chơi được tính dù chưa tới tuần', () => {
    const d = dataAt(1);
    const later = SONGS.find((s) => (s.week ?? 1) > 10)!;
    d.sessions.push({
      id: 's1', date: '2026-10-07', lessonId: 'w1-l1', parentAssessments: [], appAssessments: [], micAssessments: [],
      songRuns: [{ songId: later.id, mode: 'wait', bpm: 60, hints: 'full', total: 10, hits: 10, source: 'parent', passed: true, ts: 1 }],
      selfRating: null, startedAt: 0, endedAt: null, minutes: 0, completed: false, checklist: {},
    } as never);
    expect(eligibleSongs(d, SONGS).map((s) => s.id)).toContain(later.id);
  });

  it('6 lượt: đáp án không lặp, 3 thẻ khác tên, có đáp án', () => {
    const pool = eligibleSongs(dataAt(12), SONGS);
    const rounds = makeSongRounds(pool, songEmoji, seeded(3));
    expect(rounds).toHaveLength(SONG_ROUNDS);
    expect(new Set(rounds.map((r) => r.answer.id)).size).toBe(SONG_ROUNDS);
    for (const r of rounds) {
      expect(r.options).toHaveLength(3);
      expect(r.options[r.correct]).toBe(r.answer);
      expect(new Set(r.options.map((o) => baseTitle(o))).size).toBe(3);
      expect(new Set(r.options.map(songEmoji)).size).toBe(3);
    }
    // ít bài (3): vẫn đủ 6 lượt, không lặp LIỀN nhau
    const few = makeSongRounds(pool.slice(0, 3), songEmoji, seeded(5));
    expect(few).toHaveLength(SONG_ROUNDS);
    few.forEach((r, i) => i && expect(r.answer).not.toBe(few[i - 1].answer));
  });

  it('câu đầu ngắn (≤ ~9 giây, ≥ 1 ô) cho mọi bài', () => {
    for (const s of SONGS) {
      const p = firstPhrase(s);
      const bars = measureCount(p);
      expect(bars).toBeGreaterThanOrEqual(1);
      const sec = (bars * beatsPerMeasure(s) * 60) / guessBpm(s);
      if (bars > 2) expect(sec).toBeLessThanOrEqual(9.5);
      expect(p.notes.some((n) => !n.rest)).toBe(true);
    }
  });
});

describe('Kỷ lục trò chơi (AppData.games)', () => {
  it('recordGame: cộng lượt, giữ kỷ lục, báo kỷ lục mới; ghi ngay', () => {
    const kv = new MemoryStorage();
    const store = new ProgressStore(kv, () => new Date(2026, 9, 7, 10), { saveDelayMs: 1000, pageEvents: false });
    expect(store.gameScore('noteRush')).toBeUndefined();
    expect(store.recordGame('noteRush', 0).record).toBe(false);
    expect(store.recordGame('noteRush', 9)).toEqual({ best: 9, prevBest: 0, record: true });
    expect(store.recordGame('noteRush', 5)).toEqual({ best: 9, prevBest: 9, record: false });
    expect(store.gameScore('noteRush')).toMatchObject({ best: 9, plays: 3 });
    // đã ghi xuống bộ nhớ (flush) dù debounce 1 giây
    const again = new ProgressStore(kv, () => new Date(2026, 9, 7, 10), { pageEvents: false });
    expect(again.gameScore('noteRush')).toMatchObject({ best: 9, plays: 3 });
    // sao lưu (xuất toàn bộ dữ liệu) có kỷ lục
    expect(JSON.parse(store.exportJSON()).games.noteRush.best).toBe(9);
  });

  it('dữ liệu cũ không có games vẫn hợp lệ; mục hỏng bị bỏ (dễ tính), không hỏng cả bản nhập', () => {
    const d = defaultData();
    expect(validateAppData(d)).toEqual([]);
    const raw = JSON.parse(JSON.stringify({ ...d, games: { a: { best: 3, plays: 1, lastAt: 5 }, b: { best: 'x' }, c: null } }));
    const m = migrate(raw);
    expect(m.games).toEqual({ a: { best: 3, plays: 1, lastAt: 5 } });
    expect(validateAppData(m)).toEqual([]);
    expect(migrate({ ...JSON.parse(JSON.stringify(d)), games: 'rác' }).games).toBeUndefined();
    expect(sanitizeGames({})).toBeUndefined();
    expect(validateAppData({ ...d, games: { a: { best: -1, plays: 0, lastAt: 0 } } })).toContain('games');
    const store = new ProgressStore(new MemoryStorage(), undefined, { pageEvents: false });
    expect(store.importJSON(JSON.stringify(raw)).ok).toBe(true);
    expect(store.gameScore('a')?.best).toBe(3);
  });
});
