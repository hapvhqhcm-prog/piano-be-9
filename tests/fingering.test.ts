import { describe, expect, it } from 'vitest';
import { LH_FINGERING, RH_FINGERING, RH_SOL_LA, fingerFor, fingerInPosition } from '../src/piano/fingering';
import { SONGS } from '../src/music/tune';
import { PHASE1_WEEKS } from '../src/lessons/lessonEngine';

describe('fingering (§6 — khóa cứng)', () => {
  it('La (A4=5) chỉ khi cho phép mở rộng', () => {
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

  it('mọi nốt có số ngón trong bài học khớp bảng thế tay (§6 Cấp 1 tuần 1–10; thế mới từ tuần 11)', () => {
    const POS = ['C', 'MC', 'G', 'D', 'Cm', 'Am', 'C5'] as const;
    // Cấp 1 (tuần 1–10, v5): bảng thế Đô; từ tuần 8 thêm "thế Đô nhích lên" Sol–La = 4-5 (OWNER duyệt 2026-10-05)
    const okFinger = (pitch: string, hand: 'RH' | 'LH', f: number | undefined, week: number) =>
      week <= 10
        ? f === fingerFor(pitch, hand, true) || (week >= 8 && hand === 'RH' && RH_SOL_LA[pitch] === f)
        : POS.some((p) => fingerInPosition(pitch, hand, p, true) === f);
    for (const w of PHASE1_WEEKS) {
      for (const l of w.lessons) {
        for (const a of l.activities) {
          if (a.kind !== 'notes') continue;
          for (const t of a.segment.targets) {
            if (t.hand === 'LH') expect(w.week).toBeGreaterThanOrEqual(7);
            if (t.keys.includes('A4')) expect(w.week).toBeGreaterThanOrEqual(8);
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

describe('Sol–La ngón 4-5 (OWNER duyệt 2026-10-05)', () => {
  it('thế Đô nhích lên: Sol=4, La=5; thế Đô thuần vẫn Sol=5', () => {
    expect(RH_SOL_LA.G4).toBe(4);
    expect(RH_SOL_LA.A4).toBe(5);
    expect(fingerFor('G4', 'RH')).toBe(5);
    expect(Object.isFrozen(RH_SOL_LA)).toBe(true);
  });

  it('tuần 1–7 không có La và Sol luôn là ngón 5', () => {
    for (const w of PHASE1_WEEKS.filter((x) => x.week <= 7)) {
      for (const l of w.lessons) {
        for (const a of l.activities) {
          if (a.kind === 'notes') {
            for (const t of a.segment.targets) {
              expect(t.keys).not.toContain('A4');
              t.keys.forEach((k, i) => {
                if (k === 'G4' && t.hand !== 'LH') expect(t.fingers?.[i] ?? t.finger ?? 5, l.id).toBe(5);
              });
            }
          }
          if (a.kind === 'dynamics') for (const r of a.rounds) r.pitches.forEach((p, i) => p === 'G4' && expect(r.fingers?.[i] ?? 5).toBe(5));
        }
      }
    }
    for (const s of SONGS.filter((x) => (x.week ?? 0) <= 7)) {
      expect(s.notes.some((n) => n.pitch === 'A4'), s.id).toBe(false);
      for (const n of s.notes) if (n.pitch === 'G4' && s.hand !== 'LH') expect(n.finger, s.id).toBe(5);
    }
  });

  it('tuần 8 dạy Sol–La–Sol bằng ngón 4-5-4', () => {
    const w7 = PHASE1_WEEKS.find((w) => w.week === 8)!;
    const targets = w7.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'notes' ? a.segment.targets : [])));
    const gag = targets.find((t) => t.sequence && t.keys.join() === 'G4,A4,G4');
    expect(gag?.fingers).toEqual([4, 5, 4]);
  });

  it('bài thế Đô có La: Sol đứng liền La luôn là ngón 4 (không lặp ngón 5)', () => {
    for (const s of SONGS.filter((x) => x.extension === 'A4')) {
      const ns = s.notes.filter((n) => !n.rest);
      for (let i = 0; i + 1 < ns.length; i++) {
        const pair = [ns[i].pitch, ns[i + 1].pitch].join();
        if (pair === 'G4,A4' || pair === 'A4,G4') {
          const g = ns[i].pitch === 'G4' ? ns[i] : ns[i + 1];
          expect(g.finger, `${s.id} nốt ${i}`).toBe(4);
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
    expect(['C5', 'D5', 'E5', 'F5', 'G5'].map((p) => fingerInPosition(p, 'RH', 'C5'))).toEqual([1, 2, 3, 4, 5]);
  });
});
