import { describe, expect, it } from 'vitest';
import ode from '../src/data/songs/ode_to_joy_easy.json';
import frere from '../src/data/songs/frere_jacques_easy.json';
import twinkle from '../src/data/songs/twinkle_easy.json';
import { fingerFor, handRange, type Hand } from '../src/piano/fingering';

const SONGS = [ode, frere, twinkle];
const REQUIRED = [
  'id', 'title', 'titleVi', 'composer', 'sourceStatus', 'arrangementBy',
  'attributionRequired', 'hand', 'bpm', 'timeSignature', 'notes',
];
const NOTE_KEYS = ['beats', 'finger', 'pitch'];

describe.each(SONGS.map((s) => [s.id, s] as const))('bài hát %s (§12)', (_id, song) => {
  it('đủ trường định dạng v1, không có trường lạ', () => {
    expect(Object.keys(song).sort()).toEqual([...REQUIRED].sort());
    for (const n of song.notes) expect(Object.keys(n).sort()).toEqual(NOTE_KEYS);
  });

  it('public domain, 60 BPM, 4/4', () => {
    expect(song.sourceStatus).toBe('public-domain');
    expect(song.bpm).toBe(60);
    expect(song.timeSignature).toBe('4/4');
  });

  it('mọi nốt nằm trong thế 5 ngón của tay và số ngón khớp §6', () => {
    const hand = song.hand as Hand;
    const range = handRange(hand);
    for (const n of song.notes) {
      expect(range, `${n.pitch} ngoài tầm`).toContain(n.pitch);
      expect(n.finger, `${n.pitch}`).toBe(fingerFor(n.pitch, hand));
    }
  });

  it('tổng số phách chia hết cho 4 (đủ ô nhịp 4/4)', () => {
    const total = song.notes.reduce((s, n) => s + n.beats, 0);
    expect(total % 4).toBe(0);
    for (const n of song.notes) expect(n.beats).toBeGreaterThan(0);
  });
});

it('3 bài đúng id theo §12', () => {
  expect(SONGS.map((s) => s.id)).toEqual(['ode_to_joy_easy', 'frere_jacques_easy', 'twinkle_easy']);
});
