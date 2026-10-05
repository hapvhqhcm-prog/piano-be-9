import { describe, expect, it } from 'vitest';
import { makeSightTune } from '../src/music/sightread';
import { totalBeats, validateTune } from '../src/music/tune';
import { diatonic } from '../src/music/staff';

/** rng xác định (LCG) — cùng hạt giống → cùng đoạn nhạc */
const seeded = (k: number) => {
  let x = k + 1;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
};

/** Nốt chủ của thế: nốt thấp nhất (thế Đô giữa tay trái: Đô giữa — cao nhất) */
const TONIC: Record<string, string> = { 'C/RH': 'C4', 'C/LH': 'C3', 'G/RH': 'G4', 'D/RH': 'D4', 'MC/LH': 'C4', 'Am/RH': 'A3' };

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
        const t = makeSightTune({ ...c, measures: 3, rhythm: 2, timeSignature: ts }, seeded(k));
        expect(validateTune(t)).toEqual([]);
        expect(totalBeats(t)).toBe(ts === '3/4' ? 9 : ts === '2/4' ? 6 : 12);
        expect(t.notes[t.notes.length - 1].pitch).toBe(TONIC[`${c.position}/${c.hand}`]);
      }
    }
  });

  it('v5: nốt đầu là BẤT KỲ nốt nào của thế tay (không luôn là nốt chủ); startAnywhere: false → luôn nốt chủ', () => {
    const firsts = new Set<string>();
    for (let k = 0; k < 60; k++) firsts.add(makeSightTune({ position: 'C', hand: 'RH', measures: 2 }, seeded(k)).notes[0].pitch!);
    expect(firsts.size).toBeGreaterThanOrEqual(4);
    for (let k = 0; k < 20; k++) {
      expect(makeSightTune({ position: 'G', hand: 'RH', startAnywhere: false }, seeded(k)).notes[0].pitch).toBe('G4');
    }
  });

  it('v5: Cấp 2–3 (rhythm 2) có bước nhảy quãng 4/5; rhythm 1 / maxInterval 3 chỉ tới quãng 3', () => {
    const maxLeap = (opts: Parameters<typeof makeSightTune>[0]) => {
      let m = 0;
      for (let k = 0; k < 80; k++) {
        const ps = makeSightTune(opts, seeded(k)).notes.map((n) => n.pitch!);
        // Không tính bước về nốt chủ ở nốt cuối (luôn được phép)
        for (let i = 1; i < ps.length - 1; i++) m = Math.max(m, Math.abs(diatonic(ps[i]) - diatonic(ps[i - 1])) + 1);
      }
      return m;
    };
    expect(maxLeap({ position: 'C', hand: 'RH', measures: 4, rhythm: 2 })).toBeGreaterThanOrEqual(4);
    expect(maxLeap({ position: 'C', hand: 'RH', measures: 4, rhythm: 2 })).toBeLessThanOrEqual(5);
    expect(maxLeap({ position: 'C', hand: 'RH', measures: 4 })).toBeLessThanOrEqual(3);
    expect(maxLeap({ position: 'C', hand: 'RH', measures: 4, rhythm: 2, maxInterval: 3 })).toBeLessThanOrEqual(3);
  });

  it('xác định: cùng rng → cùng đoạn nhạc', () => {
    const a = makeSightTune({ position: 'G', hand: 'RH', measures: 3, rhythm: 2 }, seeded(5));
    const b = makeSightTune({ position: 'G', hand: 'RH', measures: 3, rhythm: 2 }, seeded(5));
    expect(a).toEqual(b);
  });
});
