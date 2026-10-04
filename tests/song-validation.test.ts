import { describe, expect, it } from 'vitest';
import {
  SONGS,
  accompaniment,
  allTimed,
  measureCount,
  onsets,
  phraseRanges,
  playable,
  slice,
  timeline,
  totalBeats,
  tuneRange,
  validateTune,
  type Tune,
} from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';

const ALLOWED = [
  'id', 'title', 'titleVi', 'composer', 'sourceStatus', 'arrangementBy', 'attributionRequired',
  'hand', 'bpm', 'timeSignature', 'week', 'extension', 'position', 'lh', 'lhPosition', 'phrases', 'notes',
];

it('có 50 bài hát, id không trùng, đủ tuần 2–23', () => {
  expect(SONGS).toHaveLength(50);
  expect(new Set(SONGS.map((s) => s.id)).size).toBe(50);
  const weeks = new Set(SONGS.map((s) => s.week));
  for (const w of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23]) expect(weeks.has(w)).toBe(true);
});

describe.each(SONGS.map((s) => [s.id, s] as const))('bài hát %s', (_id, song: Tune) => {
  it('chỉ có các trường định dạng v3, public domain', () => {
    for (const k of Object.keys(song)) expect(ALLOWED).toContain(k);
    expect(song.sourceStatus).toBe('public-domain');
    expect(song.attributionRequired).toBe(false);
    expect(['4/4', '3/4']).toContain(song.timeSignature);
    expect(song.bpm).toBe(60);
  });

  it('mọi nốt đúng thế tay & số ngón (§6 + thế mới); hai bè dài bằng nhau', () => {
    expect(validateTune(song)).toEqual([]);
  });

  it('nốt La duỗi chỉ ở thế Đô từ tuần 7; tay trái / hai tay đúng tuần', () => {
    if ((song.position ?? 'C') === 'C' && song.notes.some((n) => n.pitch === 'A4')) {
      expect(song.extension).toBe('A4');
      expect(song.week).toBeGreaterThanOrEqual(7);
    }
    if (song.hand === 'LH') expect(song.week).toBeGreaterThanOrEqual(6);
    if (song.hand === 'BOTH') expect(song.week).toBeGreaterThanOrEqual(9);
  });

  it('câu nhạc phủ kín bài; bàn phím ảo chứa mọi nốt', () => {
    const ranges = phraseRanges(song);
    expect(ranges[0][0]).toBe(0);
    expect(ranges[ranges.length - 1][1]).toBe(measureCount(song));
    const sliced = ranges.map(([a, b]) => totalBeats(slice(song, a, b)));
    expect(sliced.reduce((x, y) => x + y, 0)).toBe(totalBeats(song));
    const [lo, hi] = tuneRange(song).map(pitchToMidi);
    for (const n of allTimed(song)) if (n.pitch) expect(pitchToMidi(n.pitch)).toBeGreaterThanOrEqual(lo), expect(pitchToMidi(n.pitch)).toBeLessThanOrEqual(hi);
    if (!song.lh) expect(accompaniment(song).filter((a) => a.start % 1 === 0).length).toBeGreaterThan(0);
  });
});

describe('tune helpers', () => {
  const t: Tune = {
    id: 't', title: 't', titleVi: 't', hand: 'RH', bpm: 60, timeSignature: '4/4',
    notes: [
      { pitch: 'C4', beats: 1, finger: 1 },
      { rest: true, beats: 1 },
      { pitch: 'E4', beats: 2, finger: 3 },
      { pitch: 'G4', beats: 4, finger: 5 },
    ],
  };
  it('timeline tính phách bắt đầu & ô nhịp; playable bỏ dấu lặng', () => {
    expect(timeline(t).map((n) => [n.start, n.measure])).toEqual([[0, 0], [1, 0], [2, 0], [4, 1]]);
    expect(playable(t).map((n) => n.pitch)).toEqual(['C4', 'E4', 'G4']);
  });
  it('validateTune bắt lỗi ngón sai & nốt ngoài tầm', () => {
    const bad: Tune = { ...t, notes: [{ pitch: 'A4', beats: 2, finger: 5 }, { pitch: 'D4', beats: 2, finger: 3 }] };
    const errs = validateTune(bad);
    expect(errs.some((e) => e.includes('A4'))).toBe(true);
    expect(errs.some((e) => e.includes('D4'))).toBe(true);
  });
  it('bài hai tay: nhóm nốt cùng lúc gộp cả hai tay + hợp âm', () => {
    const both: Tune = {
      ...t, hand: 'BOTH',
      notes: [{ pitch: 'E4', beats: 2, finger: 3 }, { pitch: 'D4', beats: 2, finger: 2 }],
      lh: [{ pitch: 'C3', beats: 4, finger: 5, also: [{ pitch: 'G3', finger: 1 }] }],
    };
    expect(validateTune(both)).toEqual([]);
    const os = onsets(both);
    expect(os.map((o) => [o.start, o.pitches])).toEqual([[0, ['E4', 'C3', 'G3']], [2, ['D4']]]);
  });
});
