import { describe, expect, it } from 'vitest';
import { LH_FINGERING, RH_FINGERING, fingerFor } from '../src/piano/fingering';
import { PHASE1_WEEKS } from '../src/lessons/lessonEngine';

describe('fingering (§6 — khóa cứng)', () => {
  it('tay phải thế Đô: C4=1 D4=2 E4=3 F4=4 G4=5', () => {
    expect({ ...RH_FINGERING }).toEqual({ C4: 1, D4: 2, E4: 3, F4: 4, G4: 5 });
  });

  it('tay trái thế Đô: C3=5 D3=4 E3=3 F3=2 G3=1', () => {
    expect({ ...LH_FINGERING }).toEqual({ C3: 5, D3: 4, E3: 3, F3: 2, G3: 1 });
  });

  it('bảng ngón không sửa được lúc chạy', () => {
    expect(Object.isFrozen(RH_FINGERING)).toBe(true);
    expect(Object.isFrozen(LH_FINGERING)).toBe(true);
  });

  it('mọi nốt có số ngón trong bài học tuần 1–3 khớp §6 và chỉ là tay phải', () => {
    for (const w of PHASE1_WEEKS) {
      for (const l of w.lessons) {
        for (const s of l.segments) {
          for (const t of s.targets) {
            if (t.finger === undefined) continue;
            expect(t.hand ?? 'RH').toBe('RH');
            expect(t.finger).toBeGreaterThanOrEqual(1);
            expect(t.finger).toBeLessThanOrEqual(5);
            if (t.keys.length === 0) {
              // Thẻ "đếm ngón" (B5): không gắn phím
              expect(t.noteId).toBe(`finger-${t.finger}`);
              continue;
            }
            expect(t.keys).toHaveLength(1);
            expect(t.finger, `${l.id} ${t.keys[0]}`).toBe(fingerFor(t.keys[0], 'RH'));
          }
        }
      }
    }
  });
});
