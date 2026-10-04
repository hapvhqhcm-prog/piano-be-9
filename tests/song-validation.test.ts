import { describe, expect, it } from 'vitest';
import {
  SONGS,
  accompaniment,
  measureCount,
  phraseRanges,
  playable,
  slice,
  timeline,
  totalBeats,
  validateTune,
  type Tune,
} from '../src/music/tune';
import { fingerFor, handRange } from '../src/piano/fingering';

const ALLOWED = [
  'id', 'title', 'titleVi', 'composer', 'sourceStatus', 'arrangementBy', 'attributionRequired',
  'hand', 'bpm', 'timeSignature', 'week', 'extension', 'phrases', 'notes',
];

it('có 18 bài hát, id không trùng', () => {
  expect(SONGS).toHaveLength(18);
  expect(new Set(SONGS.map((s) => s.id)).size).toBe(18);
});

describe.each(SONGS.map((s) => [s.id, s] as const))('bài hát %s', (_id, song: Tune) => {
  it('chỉ có các trường định dạng v2', () => {
    for (const k of Object.keys(song)) expect(ALLOWED).toContain(k);
    expect(song.sourceStatus).toBe('public-domain');
    expect(song.attributionRequired).toBe(false);
  });

  it('60 BPM, 4/4, tuần 2–8', () => {
    expect(song.bpm).toBe(60);
    expect(song.timeSignature).toBe('4/4');
    expect(song.week).toBeGreaterThanOrEqual(2);
    expect(song.week).toBeLessThanOrEqual(8);
  });

  it('mọi nốt trong thế 5 ngón của tay, số ngón khớp §6 (+ La duỗi ngón 5 nếu có extension)', () => {
    expect(validateTune(song)).toEqual([]);
    const ext = !!song.extension;
    for (const n of song.notes) {
      if (n.rest) continue;
      expect(handRange(song.hand, ext)).toContain(n.pitch);
      expect(n.finger).toBe(fingerFor(n.pitch!, song.hand, ext));
    }
  });

  it('nốt duỗi (La) chỉ có ở bài tuần 7–8 có đánh dấu extension', () => {
    const usesA = song.notes.some((n) => n.pitch === 'A4');
    if (usesA) {
      expect(song.extension).toBe('A4');
      expect(song.week).toBeGreaterThanOrEqual(7);
    }
  });

  it('câu nhạc phủ kín bài, nhạc đệm đủ mỗi ô nhịp', () => {
    const ranges = phraseRanges(song);
    expect(ranges[0][0]).toBe(0);
    expect(ranges[ranges.length - 1][1]).toBe(measureCount(song));
    const sliced = ranges.map(([a, b]) => totalBeats(slice(song, a, b)));
    expect(sliced.reduce((x, y) => x + y, 0)).toBe(totalBeats(song));
    expect(accompaniment(song).filter((a) => a.start % 4 === 0)).toHaveLength(measureCount(song));
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
});
