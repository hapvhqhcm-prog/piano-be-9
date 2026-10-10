import { describe, expect, it } from 'vitest';
import {
  ALBUM_KEY,
  albumIsNew,
  gameKey,
  gamePlayed,
  hasUnseen,
  isNewSong,
  newGameIds,
  newSongIds,
  seenNew,
  songKey,
  withSeen,
} from '../src/lessons/discovery';
import { bumpDataRev } from '../src/progress/history';
import { SONG_ADDITIONS, songAddedIn } from '../src/music/songAdditions';
import { SONGS } from '../src/music/tune';
import { GAME_IDS, gameLock, unlockedGames } from '../src/practice/games/catalog';
import { compactData } from '../src/progress/compaction';
import { migrate } from '../src/progress/migrations';
import { SEEN_NEW_MAX, cleanSeenNew, defaultData, validateAppData, type AppData, type Session, type SongRun } from '../src/progress/schema';
import { LIBRARY_2026_10_09 } from './fixtures/library20261009';
import { fixtureWeek4Child } from './fixtures/week4Child';

const NOW = new Date(2026, 9, 10, 18);
const ADDED = new Set(SONG_ADDITIONS.flatMap((a) => a.ids));

function withWeek(week: number): AppData {
  const d = defaultData(NOW);
  d.progress.currentWeek = week;
  return d;
}

function playRun(d: AppData, songId: string, date = '2026-10-10', phrase: [number, number] | null = null): void {
  const run: SongRun = { songId, mode: 'wait', bpm: 60, hints: 'full', phrase, total: 10, hits: 3, source: 'mic', passed: false, ts: NOW.getTime() };
  const s: Session = {
    id: `t-${songId}-${date}`,
    date,
    lessonId: `w${d.progress.currentWeek}-song-${songId}`,
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: [run],
    selfRating: null,
    startedAt: NOW.getTime(),
    endedAt: NOW.getTime(),
    minutes: 3,
    completed: true,
    checklist: {},
  } as Session;
  d.sessions.push(s);
  bumpDataRev(d);
}

describe('Đợt thêm bài (songAdditions.ts)', () => {
  it('đợt 2026-10-09 = đúng 24 bài của fixture, mọi mã có trong SONGS, không trùng giữa các đợt', () => {
    const batch = SONG_ADDITIONS.find((a) => a.added === '2026-10-09')!;
    expect([...batch.ids]).toEqual([...LIBRARY_2026_10_09]);
    const all = SONG_ADDITIONS.flatMap((a) => a.ids);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(SONGS.some((t) => t.id === id), id).toBe(true);
    for (const a of SONG_ADDITIONS) expect(a.added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(songAddedIn('sakura')).toBe('2026-10-09');
    expect(songAddedIn('mary_lamb')).toBeUndefined();
  });

  it('126 bài cũ KHÔNG BAO GIỜ là "Mới" — kể cả bé tuần cuối chưa chơi bài nào', () => {
    const old = SONGS.filter((t) => !ADDED.has(t.id));
    expect(old).toHaveLength(126);
    const d = withWeek(31);
    for (const t of old) expect(isNewSong(d, t), t.id).toBe(false);
    expect(newSongIds(d).sort()).toEqual([...ADDED].sort());
  });
});

describe('Bài "Mới" trong Thư viện', () => {
  it('bé tuần 4 thật: đúng 4 bài mới đã mở (tuần 3–4), bài tuần 5+ đang khóa không có nhãn', () => {
    const d = fixtureWeek4Child(NOW);
    expect(newSongIds(d)).toEqual(
      SONGS.filter((t) => ADDED.has(t.id) && (t.week ?? 1) <= 4).map((t) => t.id),
    );
    expect(newSongIds(d).sort()).toEqual(['ants_march', 'goldfish_swim', 'morning_sun', 'tick_tock_clock']);
    expect(isNewSong(d, SONGS.find((t) => t.id === 'busy_bee')!)).toBe(false); // tuần 5 — khóa
  });

  it('chơi một lần (kể cả một câu, chưa đạt) → hết "Mới"; vẫn đúng sau khi gộp lịch sử', () => {
    const d = withWeek(4);
    expect(newSongIds(d)).toContain('goldfish_swim');
    playRun(d, 'goldfish_swim', '2026-10-10', [0, 2]);
    expect(newSongIds(d)).not.toContain('goldfish_swim');
    // buổi cũ được gộp vào history → songStats vẫn biết đã chơi
    const old = withWeek(4);
    playRun(old, 'ants_march', '2026-06-01');
    playRun(old, 'mary_lamb', '2026-06-02');
    const r = compactData(old, NOW, 14);
    bumpDataRev(old);
    expect(r.folded + r.keptOld).toBeGreaterThan(0);
    expect(newSongIds(old)).not.toContain('ants_march');
  });
});

describe('Trò "Mới"', () => {
  it('chỉ trò đã mở và chưa chơi xong lượt nào; trò khóa không bao giờ có nhãn', () => {
    const d = fixtureWeek4Child(NOW);
    const open = unlockedGames(d, SONGS);
    for (const id of open) expect(gameLock(id, d, SONGS)).toBeNull();
    for (const id of GAME_IDS.filter((g) => !open.includes(g))) expect(gameLock(id, d, SONGS)).not.toBeNull();
    expect(newGameIds(d, open)).toEqual(open.filter((id) => !d.games?.[id]));
    d.games = { ...d.games, [open[0]]: { best: 3, plays: 1, lastAt: NOW.getTime() } };
    expect(gamePlayed(d, open[0])).toBe(true);
    expect(newGameIds(d, open)).not.toContain(open[0]);
  });

  it('bé tuần 1: noteRush mở → mới; 4 trò mới (2026-10-09) đều khóa → không nhãn', () => {
    const d = withWeek(1);
    const open = unlockedGames(d, SONGS);
    expect(newGameIds(d, open)).toContain('noteRush');
    expect(open).not.toContain('echo');
  });
});

describe('Chấm ở màn chính (settings.seenNew)', () => {
  it('có mục mới chưa thấy → chấm; thấy rồi → tắt; mục mới khác xuất hiện → chấm lại', () => {
    const d = withWeek(4);
    const keys = newSongIds(d).map(songKey);
    expect(hasUnseen(d, keys)).toBe(true);
    expect(hasUnseen(d, [])).toBe(false);
    const seen = withSeen(d, keys)!;
    d.settings.seenNew = seen;
    expect(hasUnseen(d, keys)).toBe(false);
    expect(withSeen(d, keys)).toBeNull(); // không đổi → không ghi
    d.progress.currentWeek = 5; // mở thêm bài mới tuần 5
    expect(hasUnseen(d, newSongIds(d).map(songKey))).toBe(true);
    // trò dùng mã riêng
    expect(hasUnseen(d, [gameKey('echo')])).toBe(true);
  });

  it('withSeen bỏ trùng, giữ tối đa SEEN_NEW_MAX mã (bỏ mã cũ nhất)', () => {
    const d = withWeek(1);
    d.settings.seenNew = Array.from({ length: SEEN_NEW_MAX }, (_, i) => `s:x${i}`);
    const out = withSeen(d, ['g:echo', 'g:echo'])!;
    expect(out).toHaveLength(SEEN_NEW_MAX);
    expect(out[out.length - 1]).toBe('g:echo');
    expect(out[0]).toBe('s:x1');
  });

  it('Album: có bản thu và chưa mở → mới; mở rồi → hết', () => {
    const d = withWeek(4);
    expect(albumIsNew(d, 0)).toBe(false);
    expect(albumIsNew(d, 1)).toBe(true);
    d.settings.seenNew = withSeen(d, [ALBUM_KEY])!;
    expect(albumIsNew(d, 3)).toBe(false);
  });

  it('dữ liệu hỏng: đọc mềm, migrate lọc mục hỏng, dữ liệu vẫn hợp lệ; thiếu trường = dữ liệu cũ hợp lệ', () => {
    expect(cleanSeenNew('x')).toBeUndefined();
    expect(cleanSeenNew([])).toBeUndefined();
    expect(cleanSeenNew(['s:a', 's:a', 3, '', null, 'x'.repeat(65), 'g:echo'])).toEqual(['s:a', 'g:echo']);
    const raw = JSON.parse(JSON.stringify(withWeek(4))) as Record<string, any>;
    raw.settings.seenNew = ['s:goldfish_swim', 42, { a: 1 }];
    const m = migrate(raw);
    expect(m.settings.seenNew).toEqual(['s:goldfish_swim']);
    expect(validateAppData(m)).toEqual([]);
    raw.settings.seenNew = 'hỏng';
    const m2 = migrate(raw);
    expect(m2.settings.seenNew).toBeUndefined();
    expect(validateAppData(m2)).toEqual([]);
    expect(seenNew({ ...m2, settings: { ...m2.settings, seenNew: 'x' as unknown as string[] } }).size).toBe(0);
    // validate (không qua migrate) chặn kiểu sai hẳn
    expect(validateAppData({ ...m2, settings: { ...m2.settings, seenNew: [1] } })).toContain('settings.seenNew');
    const fresh = defaultData(NOW);
    expect(fresh.settings.seenNew).toBeUndefined();
    expect(validateAppData(migrate(JSON.parse(JSON.stringify(fresh))))).toEqual([]);
  });
});
