import { describe, expect, it } from 'vitest';
import { makeQuestion, referenceOf } from '../src/practice/quiz';
import { pitchToMidi } from '../src/piano/pitchTable';

function seq(...xs: number[]) {
  let i = 0;
  return () => xs[i++ % xs.length];
}

describe('quiz v2', () => {
  it('updown: 2 nốt khác nhau, đáp án đúng hướng', () => {
    for (let k = 0; k < 30; k++) {
      const q = makeQuestion({ variant: 'updown', pool: ['C3', 'C4', 'G4', 'C5'], rounds: 10 });
      const [a, b] = q.play;
      expect(a).not.toBe(b);
      expect(q.expected).toBe(pitchToMidi(b) > pitchToMidi(a) ? 'up' : 'down');
      expect(q.choices?.map((c) => c.value)).toEqual(['up', 'down']);
    }
  });

  it('stepskip: bước = cạnh nhau, nhảy = cách một phím trắng', () => {
    for (let k = 0; k < 30; k++) {
      const q = makeQuestion({ variant: 'stepskip', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 10 });
      const gap = Math.abs(pitchToMidi(q.play[0]) - pitchToMidi(q.play[1]));
      if (q.expected === 'step') expect([1, 2]).toContain(gap);
      else expect([3, 4]).toContain(gap);
    }
  });

  it('identify: luôn phát nốt mốc Đô trước nốt cần đoán', () => {
    const spec = { variant: 'identify' as const, pool: ['C4', 'D4', 'E4'], rounds: 10 };
    expect(referenceOf(spec)).toBe('C4');
    const q = makeQuestion(spec, seq(0.7));
    expect(q.play).toEqual(['C4', 'E4']);
    expect(q.expected).toBe('E4');
    expect(referenceOf({ variant: 'identify', pool: ['C3', 'D3', 'E3'], rounds: 1 })).toBe('C3');
  });

  it('read: hiện nốt trên khuông, không phát trước', () => {
    const q = makeQuestion({ variant: 'read', pool: ['C4', 'G4'], rounds: 10 }, seq(0.9));
    expect(q.show).toBe('G4');
    expect(q.play).toEqual([]);
  });

  it('không lặp y hệt câu trước', () => {
    const spec = { variant: 'read' as const, pool: ['C4', 'D4'], rounds: 10 };
    const q1 = makeQuestion(spec, seq(0));
    const q2 = makeQuestion(spec, seq(0, 0, 0.9), q1);
    expect(q2.show).not.toBe(q1.show);
  });
});
