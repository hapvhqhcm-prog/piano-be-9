import { describe, expect, it } from 'vitest';
import { describeStep, ledgerSteps, staffStep, stemUp } from '../src/music/staff';

describe('khuông nhạc', () => {
  it('Khóa Sol: Mi4 vạch 1, Sol4 vạch 2, Đô giữa dưới khuông có vạch phụ', () => {
    expect(staffStep('E4', 'treble')).toBe(0);
    expect(staffStep('F4', 'treble')).toBe(1);
    expect(staffStep('G4', 'treble')).toBe(2);
    expect(staffStep('A4', 'treble')).toBe(3);
    expect(staffStep('D4', 'treble')).toBe(-1);
    expect(staffStep('C4', 'treble')).toBe(-2);
    expect(ledgerSteps(-2)).toEqual([-2]);
    expect(ledgerSteps(-1)).toEqual([]);
    expect(ledgerSteps(3)).toEqual([]);
  });

  it('Khóa Fa: Đô3 ở khe 2, Sol3 ở khe 4', () => {
    expect(staffStep('C3', 'bass')).toBe(3);
    expect(staffStep('G3', 'bass')).toBe(7);
    expect(describeStep(3)).toBe('ở khe 2');
  });

  it('đuôi nốt & cách đọc', () => {
    expect(stemUp(-2)).toBe(true);
    expect(stemUp(5)).toBe(false);
    expect(describeStep(-2)).toBe('đội mũ vạch phụ');
    expect(describeStep(0)).toBe('trên vạch 1');
    expect(describeStep(2)).toBe('trên vạch 2');
  });
});
