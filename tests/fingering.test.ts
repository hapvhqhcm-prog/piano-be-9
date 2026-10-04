import { describe, expect, it } from 'vitest';
import { LH_FINGERING, RH_FINGERING, fingerFor } from '../src/piano/fingering';
import { PHASE1_WEEKS } from '../src/lessons/lessonEngine';

describe('fingering (§6 — khóa cứng)', () => {
  it('La duỗi ngón 5 (A4=5) chỉ khi cho phép mở rộng', () => {
    expect(fingerFor('A4', 'RH')).toBeUndefined();
    expect(fingerFor('A4', 'RH', true)).toBe(5);
    expect(fingerFor('A4', 'LH', true)).toBeUndefined();
  });

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

  it('mọi nốt có số ngón trong bài học tuần 1–8 khớp §6 (tay trái chỉ từ tuần 6, La duỗi từ tuần 7)', () => {
    for (const w of PHASE1_WEEKS) {
      for (const l of w.lessons) {
        for (const a of l.activities) {
          if (a.kind !== 'notes') continue;
          for (const t of a.segment.targets) {
            if (t.hand === 'LH') expect(w.week).toBeGreaterThanOrEqual(6);
            if (t.keys.includes('A4')) expect(w.week).toBeGreaterThanOrEqual(7);
            if (t.sequence) {
              for (const k of t.keys) expect(fingerFor(k, t.hand ?? 'RH', true)).toBeDefined();
              continue;
            }
            if (t.finger === undefined) continue;
            expect(t.finger).toBeGreaterThanOrEqual(1);
            expect(t.finger).toBeLessThanOrEqual(5);
            if (t.keys.length === 0) {
              // Thẻ "đếm ngón" (B5): không gắn phím
              expect(t.noteId).toBe(`finger-${t.finger}`);
              continue;
            }
            expect(t.keys).toHaveLength(1);
            expect(t.finger, `${l.id} ${t.keys[0]}`).toBe(fingerFor(t.keys[0], t.hand ?? 'RH', true));
          }
        }
      }
    }
  });
});
