import { describe, expect, it } from 'vitest';
import { PASS_SCORE, gradeTiming, score, starsFor } from '../src/music/timing';

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
