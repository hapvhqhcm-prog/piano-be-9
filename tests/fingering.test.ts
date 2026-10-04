import { describe, expect, it } from 'vitest';
import { LH_FINGERING, RH_FINGERING, fingerFor, fingerInPosition } from '../src/piano/fingering';
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

  it('mọi nốt có số ngón trong bài học khớp bảng thế tay (§6 tuần 1–8; thế mới từ tuần 9)', () => {
    const POS = ['C', 'MC', 'G', 'D', 'Cm', 'Am'] as const;
    const okFinger = (pitch: string, hand: 'RH' | 'LH', f: number | undefined, week: number) =>
      week <= 8 ? f === fingerFor(pitch, hand, true) : POS.some((p) => fingerInPosition(pitch, hand, p, true) === f);
    for (const w of PHASE1_WEEKS) {
      for (const l of w.lessons) {
        for (const a of l.activities) {
          if (a.kind !== 'notes') continue;
          for (const t of a.segment.targets) {
            if (t.hand === 'LH') expect(w.week).toBeGreaterThanOrEqual(6);
            if (t.keys.includes('A4')) expect(w.week).toBeGreaterThanOrEqual(7);
            if (t.sequence || t.fingers) {
              t.keys.forEach((k, i) => {
                const f = t.fingers?.[i] ?? fingerFor(k, t.hand ?? 'RH', true);
                if (!t.noteId.startsWith('chord:')) expect(okFinger(k, t.hand ?? 'RH', f, w.week), `${l.id} ${k}`).toBe(true);
              });
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
            expect(okFinger(t.keys[0], t.hand ?? 'RH', t.finger, w.week), `${l.id} ${t.keys[0]}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('thế tay Cấp 2–3', () => {
  it('thế Sol, Đô giữa, thế Rê, Đô thứ, La thứ đúng cách bấm chuẩn', () => {
    expect(['G4', 'A4', 'B4', 'C5', 'D5'].map((p) => fingerInPosition(p, 'RH', 'G'))).toEqual([1, 2, 3, 4, 5]);
    expect(['F3', 'G3', 'A3', 'B3', 'C4'].map((p) => fingerInPosition(p, 'LH', 'MC'))).toEqual([5, 4, 3, 2, 1]);
    expect(fingerInPosition('F#4', 'RH', 'D')).toBe(3);
    expect(fingerInPosition('Eb4', 'RH', 'Cm')).toBe(3);
    expect(['A3', 'B3', 'C4', 'D4', 'E4'].map((p) => fingerInPosition(p, 'RH', 'Am'))).toEqual([1, 2, 3, 4, 5]);
    expect(fingerInPosition('F4', 'RH', 'D')).toBeUndefined();
  });
});
