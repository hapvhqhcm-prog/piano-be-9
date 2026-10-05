import { describe, expect, it } from 'vitest';
import { PASS_SCORE, countInBeats, countInLabel, gradeTiming, score, starsFor } from '../src/music/timing';
import { findSong, onsets } from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';

const notes = [
  { index: 0, start: 0, midi: 64 },
  { index: 1, start: 1, midi: 64 },
  { index: 2, start: 2, midi: 64 },
  { index: 3, start: 3, midi: 62 },
];

describe('gradeTiming', () => {
  it('đúng lúc & đúng nốt → trúng; mỗi lần nghe chỉ dùng cho một nốt', () => {
    const v = gradeTiming(notes, [
      { beat: 0.1, midi: 64 },
      { beat: 1.2, midi: 64 },
      { beat: 1.9, midi: 64 },
      { beat: 3.0, midi: 62 },
    ]);
    expect(v.map((x) => x.hit)).toEqual([true, true, true, true]);
    expect(score(v)).toBe(1);
  });

  it('quá sớm / quá muộn / sai nốt → trượt', () => {
    const v = gradeTiming(notes, [
      { beat: -0.6, midi: 64 }, // quá sớm
      { beat: 1.7, midi: 64 }, // muộn quá cửa sổ của nốt 1, nhưng sớm hợp lệ cho nốt 2
      { beat: 3.0, midi: 60 }, // sai nốt
    ]);
    expect(v.map((x) => x.hit)).toEqual([false, false, true, false]);
    expect(score(v)).toBe(0.25);
  });

  it('một nốt ngân dài không được tính cho 3 nốt Mi liên tiếp', () => {
    const v = gradeTiming(notes, [{ beat: 0, midi: 64 }]);
    expect(v.filter((x) => x.hit)).toHaveLength(1);
  });

  it('sao: ≥90% = 3, ≥60% = 2; qua tiêu chí ≥80%', () => {
    expect(starsFor(0.95)).toBe(3);
    expect(starsFor(0.7)).toBe(2);
    expect(starsFor(0.3)).toBe(1);
    expect(PASS_SCORE).toBe(0.8);
  });
});

describe('gradeTiming — nhóm nốt cùng lúc (hai tay / hợp âm)', () => {
  it('nghe được một nốt bất kỳ trong nhóm là trúng', () => {
    const v = gradeTiming(
      [
        { index: 0, start: 0, midi: [64, 48] },
        { index: 1, start: 1, midi: [62] },
      ],
      [
        { beat: 0.05, midi: 48 },
        { beat: 1.0, midi: 64 },
      ],
    );
    expect(v.map((x) => x.hit)).toEqual([true, false]);
  });
});

describe('nhịp 2/4 & móc kép', () => {
  it('đếm vào: 4/4 bốn phách "1 2 3 4", 3/4 "1 2 3", 2/4 HAI ô "1 2 1 2"', () => {
    expect([4, 3, 2].map(countInBeats)).toEqual([4, 3, 4]);
    const labels = (bpm: number) => {
      const lead = countInBeats(bpm);
      return Array.from({ length: lead }, (_, k) => countInLabel(-lead + k + 0.1, bpm));
    };
    expect(labels(4)).toEqual([1, 2, 3, 4]);
    expect(labels(3)).toEqual([1, 2, 3]);
    expect(labels(2)).toEqual([1, 2, 1, 2]);
  });

  it('móc kép sát nhau: lần nghe thuộc về nốt gần nhất (nốt trước không "giành" mất)', () => {
    // Rê (đen) ở phách 0, Rê móc kép ở 0.5 & 0.75 … bé lỡ nốt đầu, đàn đúng hai móc kép
    const notes = [
      { index: 0, start: 0, midi: 62 },
      { index: 1, start: 0.5, midi: 62 },
      { index: 2, start: 0.75, midi: 62 },
    ];
    const v = gradeTiming(notes, [
      { beat: 0.52, midi: 62 },
      { beat: 0.78, midi: 62 },
    ]);
    expect(v.map((x) => x.hit)).toEqual([false, true, true]);
    expect(v[1].offset).toBeCloseTo(0.02);
  });

  it('đàn đúng trọn "Bắc kim thang" (2/4, móc kép) ở 60 → trúng 100%; lệch đều 0,1 phách vẫn trúng hết', () => {
    const t = findSong('bac_kim_thang')!;
    const input = onsets(t).map((o) => ({ index: o.notes[0].index, start: o.start, midi: o.pitches.map(pitchToMidi) }));
    for (const lag of [0, 0.1, -0.08]) {
      const heard = input.map((n) => ({ beat: n.start + lag, midi: n.midi[0] }));
      expect(score(gradeTiming(input, heard))).toBe(1);
    }
  });
});
