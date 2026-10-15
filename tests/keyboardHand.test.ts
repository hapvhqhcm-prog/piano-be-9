import { describe, expect, it } from 'vitest';
import {
  GHOST_FAINT_AFTER,
  GHOST_SOFT_AFTER,
  allowedPcs,
  crossingOf,
  frameFromTargets,
  framePositionId,
  ghostAuto,
  ghostLevel,
  ghostMode,
  ghostVisible,
  handPose,
  planFromTune,
  planKey,
  setGhostMode,
  type HandFrame,
  type Part,
} from '../src/ui/components/keyboardHand';
import { findSong } from '../src/music/tune';
import { midiToPitch, pitchToMidi } from '../src/piano/pitchTable';
import type { Hand } from '../src/piano/fingering';

const names = (f: HandFrame | null) => (f ?? []).map((m) => (m === null ? null : midiToPitch(m)));
const midis = (ps: string[]) => ps.map(pitchToMidi);
const note = (pitch: string, finger: number) => ({ midi: pitchToMidi(pitch), finger, pitch });

describe('bàn tay mờ — thế tay từ phím đích', () => {
  it('thế Đô hai tay', () => {
    expect(frameFromTargets([note('E4', 3)], 'RH')).toEqual(midis(['C4', 'D4', 'E4', 'F4', 'G4']));
    // tay trái: ngón 1 ở Sol3 … ngón 5 ở Đô3
    expect(frameFromTargets([note('E3', 3)], 'LH')).toEqual(midis(['G3', 'F3', 'E3', 'D3', 'C3']));
  });

  it('thế Sol / Rê / Đô thứ / La thứ / Đô giữa theo bảng thế tay', () => {
    expect(frameFromTargets([note('B4', 3)], 'RH')).toEqual(midis(['G4', 'A4', 'B4', 'C5', 'D5']));
    expect(frameFromTargets([note('D3', 1)], 'LH')).toEqual(midis(['D3', 'C3', 'B2', 'A2', 'G2']));
    expect(frameFromTargets([note('F#4', 3)], 'RH')).toEqual(midis(['D4', 'E4', 'F#4', 'G4', 'A4']));
    expect(frameFromTargets([note('F#3', 3)], 'LH')).toEqual(midis(['A3', 'G3', 'F#3', 'E3', 'D3']));
    expect(frameFromTargets([note('Eb4', 3)], 'RH')).toEqual(midis(['C4', 'D4', 'Eb4', 'F4', 'G4']));
    expect(frameFromTargets([note('C4', 3)], 'RH')).toEqual(midis(['A3', 'B3', 'C4', 'D4', 'E4']));
    expect(frameFromTargets([note('A2', 5)], 'LH')).toEqual(midis(['E3', 'D3', 'C3', 'B2', 'A2']));
    expect(frameFromTargets([note('C4', 1)], 'LH')).toEqual(midis(['C4', 'B3', 'A3', 'G3', 'F3']));
    expect(framePositionId(frameFromTargets([note('B4', 3)], 'RH')!, 'RH')).toBe('G');
    expect(framePositionId(frameFromTargets([note('E4', 3)], 'RH')!, 'RH')).toBe('C');
  });

  it('thế Fa (không có bảng): điền theo dấu hóa của các nốt — Si♭ chứ không phải Si', () => {
    expect(frameFromTargets([note('F4', 1), note('Bb4', 4)], 'RH')).toEqual(midis(['F4', 'G4', 'A4', 'Bb4', 'C5']));
    expect(allowedPcs(['F#4']).has(5)).toBe(false);
    expect(allowedPcs(['F#4']).has(6)).toBe(true);
    expect(allowedPcs(['Bb3']).has(11)).toBe(false);
  });

  it('giữ thế cũ khi phím mới vẫn nằm trong thế (bàn tay không nhảy)', () => {
    const g = frameFromTargets([note('B4', 3)], 'RH')!;
    expect(frameFromTargets([note('D5', 5)], 'RH', g)).toBe(g);
    // "Đô nhích lên" (Sol–La = 4-5) tính là thế Đô
    const up = frameFromTargets([note('G4', 4), note('A4', 5)], 'RH')!;
    expect(names(up)).toEqual(['D4', 'E4', 'F4', 'G4', 'A4']);
    expect(framePositionId(up, 'RH')).toBe('C');
  });
});

describe('bàn tay mờ — kế hoạch theo bài (đổi thế, luồn ngón, hai tay)', () => {
  it('gam Sol tay phải: luồn ngón cái ở Đô, vắt ngón 3 khi đi xuống', () => {
    const t = findSong('scale_g_rh')!;
    const p = planFromTune(t).RH!;
    expect(p).toHaveLength(16);
    expect(names(p[0].frame)).toEqual(['G4', 'A4', 'B4', 'C5', 'D5']);
    expect(p[3].cross).toBe('under');
    expect(p[3].frame).toEqual(midis(['C5', 'D5', 'E5', 'F#5', 'G5']));
    // đi xuống tới Đô vẫn cùng thế; Si (ngón 3) vắt qua ngón cái
    expect(p[12].frame).toBe(p[3].frame);
    expect(p[13].cross).toBe('over');
    expect(names(p[13].frame).slice(0, 3)).toEqual(['G4', 'A4', 'B4']);
    // mọi nốt nằm đúng ngón trong thế của nó
    t.notes.forEach((n, i) => expect(p[i].frame[n.finger! - 1]).toBe(pitchToMidi(n.pitch!)));
  });

  it('gam Sol tay trái (soi gương): vắt ngón 3 khi đi lên, luồn ngón cái khi đi xuống', () => {
    const t = findSong('scale_g_lh')!;
    const p = planFromTune(t).LH!;
    expect(p[5].cross).toBe('over'); // Mi3 ngón 3 vắt qua ngón cái ở Rê3
    expect(p[11].cross).toBe('under'); // đi xuống: ngón cái luồn tới Rê3
    t.notes.forEach((n, i) => expect(p[i].frame[n.finger! - 1]).toBe(pitchToMidi(n.pitch!)));
  });

  it('gam Fa tay phải: Si♭ ngón 4, luồn ngón cái ở Đô5', () => {
    const p = planFromTune(findSong('scale_f_rh')!).RH!;
    expect(p[0].frame).toEqual(midis(['F4', 'G4', 'A4', 'Bb4', 'C5']));
    expect(p[4].cross).toBe('under');
    expect(p[12].cross).toBe('over');
  });

  it('thế Sol (tuần 14): một thế cho cả bài', () => {
    const t = findSong('lightly_row_g')!;
    const p = planFromTune(t).RH!;
    expect(new Set(p.map((e) => e.frame)).size).toBe(1);
    expect(names(p[0].frame)).toEqual(['G4', 'A4', 'B4', 'C5', 'D5']);
  });

  it('hai tay cùng lúc: mỗi tay một thế riêng (tay trái thế Đô: ngón 5 = Đô3)', () => {
    const plan = planFromTune(findSong('hot_cross_buns_both')!);
    expect(names(plan.RH![0].frame)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4']);
    expect(names(plan.LH![0].frame)).toEqual(['G3', 'F3', 'E3', 'D3', 'C3']);
    expect(plan.LH![0].key).toBe(planKey([{ midi: pitchToMidi('C3'), finger: 5 }]));
  });

  it('mọi bài có số ngón: nốt luôn nằm đúng ngón trong thế được vẽ', () => {
    for (const id of ['ode_to_joy_both', 'march_d', 'korobeiniki', 'arpeggio_g', 'fur_elise', 'minuet_f']) {
      const t = findSong(id);
      if (!t) continue;
      const plan = planFromTune(t);
      for (const hand of ['RH', 'LH'] as const) {
        for (const e of plan[hand] ?? []) {
          for (const part of e.key.split(',').filter(Boolean)) {
            const [m, f] = part.split(':').map(Number);
            expect(e.frame[f - 1], `${id} ${hand} ${part}`).toBe(m);
          }
        }
      }
    }
  });

  it('crossingOf: luồn / vắt ngón chỉ khi nốt liền kề; đổi thế xa là trượt cả tay', () => {
    expect(crossingOf(note('E4', 3), note('F4', 1), 'RH')).toBe('under');
    expect(crossingOf(note('F4', 1), note('E4', 3), 'RH')).toBe('over');
    expect(crossingOf(note('C4', 1), note('G4', 1), 'RH')).toBeNull();
    expect(crossingOf(note('G4', 5), note('B4', 3), 'RH')).toBeNull();
    expect(crossingOf(note('E3', 3), note('D3', 1), 'LH')).toBe('under');
    expect(crossingOf(note('D3', 1), note('E3', 3), 'LH')).toBe('over');
    expect(crossingOf(null, note('E3', 3), 'LH')).toBeNull();
  });
});

/** Áp biến hình của một phần (translate · scale(dir,1) · rotate · scale) lên điểm cục bộ */
function apply(p: Part, dir: number, x: number, y: number): [number, number] {
  const a = (p.rot * Math.PI) / 180;
  const sx = x * p.sx;
  const sy = y * p.sy;
  const rx = sx * Math.cos(a) - sy * Math.sin(a);
  const ry = sx * Math.sin(a) + sy * Math.cos(a);
  return [p.x + dir * rx, p.y + ry];
}

describe('bàn tay mờ — hình học', () => {
  const u = 70;
  const H = 240;
  const keys = (hand: Hand, xs: number[], black: boolean[] = []) =>
    handPose(xs.map((x, i) => ({ x, black: !!black[i] })), hand, u, H);

  for (const hand of ['RH', 'LH'] as const) {
    it(`${hand}: đầu từng ngón nằm đúng tâm phím (kể cả phím đen), ngón chỉ vào trong đàn`, () => {
      const dir = hand === 'RH' ? 1 : -1;
      const xs = [0, 1, 2, 3, 4].map((i) => 400 + dir * i * u);
      const pose = keys(hand, xs, [false, false, true, false, false]);
      pose.fingers.forEach((p, i) => {
        const [x, y] = apply(p, dir, 0, -100);
        expect(x).toBeCloseTo(xs[i], 0);
        expect(y).toBeCloseTo(pose.tips[i].y, 0);
        expect(pose.roots[i].y).toBeGreaterThan(pose.tips[i].y); // gốc ngón ở phía bé ngồi
      });
      // phím đen: đầu ngón vào sâu hơn
      expect(pose.tips[2].y).toBeLessThan(pose.tips[1].y);
      // ngón cái ở phía ngón trỏ, gốc thấp hơn hàng khớp
      expect((pose.roots[0].x - pose.roots[1].x) * dir).toBeLessThan(0);
      expect(pose.roots[0].y).toBeGreaterThan(pose.roots[1].y);
      // không che phần dưới phím (nhãn + số ngón của phím đích ở ~70% trở xuống)
      for (const r of pose.roots.slice(1)) expect(r.y).toBeLessThan(0.66 * H);
      // số ngón nằm gần đầu ngón
      pose.nums.forEach((n, i) => expect(Math.abs(n.x - xs[i])).toBeLessThan(u));
    });
  }

  it('ngón lơ lửng (null) được nội suy giữa hai ngón kề', () => {
    const pose = handPose([{ x: 100, black: false }, null, { x: 240, black: false }, null, null], 'RH', u, H);
    expect(pose.tips[1].x).toBeCloseTo(170);
    expect(pose.tips[3].x).toBeCloseTo(240 + u);
  });
});

describe('bàn tay mờ — quy tắc hiện / mờ dần', () => {
  it('Tự động: tuần 1–8 luôn hiện; sau đó chỉ thế tay mới ở bài chưa thuộc', () => {
    expect(ghostAuto({ week: 1 })).toBe(true);
    expect(ghostAuto({ week: 8, positions: ['C'], mastered: true })).toBe(true);
    expect(ghostAuto({ week: 9, positions: ['C'] })).toBe(false);
    expect(ghostAuto({ week: 14, positions: ['G'] })).toBe(true);
    expect(ghostAuto({ week: 14, positions: ['G'], mastered: true })).toBe(false);
    expect(ghostAuto({ week: 32, positions: ['free'] })).toBe(true);
    expect(ghostAuto({ week: 12, positions: ['C', 'C'] })).toBe(false);
    expect(ghostAuto({ week: 12, positions: ['C', undefined] })).toBe(false);
    expect(ghostAuto({ week: 12, positions: ['C', 'C'], bothHands: true })).toBe(true);
    expect(ghostAuto({ week: 12, positions: ['C', 'C'], bothHands: true, mastered: true })).toBe(false);
  });

  it('công tắc: Luôn hiện / Ẩn thắng quy tắc tự động', () => {
    expect(ghostVisible('auto', true)).toBe(true);
    expect(ghostVisible('auto', false)).toBe(false);
    expect(ghostVisible('on', false)).toBe(true);
    expect(ghostVisible('off', true)).toBe(false);
  });

  it('mờ dần theo số nốt đúng liền; đổi thế → rõ lại', () => {
    expect(ghostLevel(0, false)).toBe(0);
    expect(ghostLevel(GHOST_SOFT_AFTER - 1, false)).toBe(0);
    expect(ghostLevel(GHOST_SOFT_AFTER, false)).toBe(1);
    expect(ghostLevel(GHOST_FAINT_AFTER, false)).toBe(2);
    expect(ghostLevel(GHOST_FAINT_AFTER + 5, true)).toBe(0);
  });

  it('lưu công tắc trên máy (mặc định Tự động; lỗi bộ nhớ → Tự động)', () => {
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    expect(ghostMode(st)).toBe('auto');
    setGhostMode('off', st);
    expect(ghostMode(st)).toBe('off');
    setGhostMode('auto', st);
    expect(mem.size).toBe(0);
    expect(ghostMode({ getItem: () => { throw new Error('x'); } })).toBe('auto');
    expect(ghostMode(null)).toBe('auto');
  });
});
