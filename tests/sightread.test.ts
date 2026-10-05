import { describe, expect, it } from 'vitest';
import { makeSightTune } from '../src/music/sightread';
import { totalBeats, validateTune } from '../src/music/tune';

describe('đọc nhạc ngẫu nhiên', () => {
  const cases = [
    { position: 'C' as const, hand: 'RH' as const },
    { position: 'C' as const, hand: 'LH' as const },
    { position: 'G' as const, hand: 'RH' as const },
    { position: 'D' as const, hand: 'RH' as const },
    { position: 'MC' as const, hand: 'LH' as const },
    { position: 'Am' as const, hand: 'RH' as const },
  ];
  it.each(cases)('$position/$hand: hợp lệ theo thế tay, đủ ô nhịp, kết thúc ở nốt chủ', (c) => {
    for (let k = 0; k < 25; k++) {
      for (const ts of ['4/4', '3/4', '2/4'] as const) {
        const t = makeSightTune({ ...c, measures: 3, rhythm: 2, timeSignature: ts });
        expect(validateTune(t)).toEqual([]);
        expect(totalBeats(t)).toBe(ts === '3/4' ? 9 : ts === '2/4' ? 6 : 12);
        expect(t.notes[t.notes.length - 1].pitch).toBe(t.notes[0].pitch);
      }
    }
  });
});
