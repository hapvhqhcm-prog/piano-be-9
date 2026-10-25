import { describe, expect, it } from 'vitest';
import { DRILL_PRINCIPLE } from '../src/lessons/handTechnique';
import type { TechniqueDrill } from '../src/lessons/types';
import {
  DRILL_ANIM_IDS,
  EASE,
  SPEED_MS,
  TECH_ANIMS,
  frameInner,
  frameSvg,
  sampleKeys,
  stepAt,
  stillBeat,
  totalBeats,
  wrapBeat,
  type AnimId,
  type Keyframe,
} from '../src/ui/components/techniqueAnim';

/**
 * (+ 2026-10-15) Hoạt hình kỹ thuật từng bước: mỗi bài khởi động có định nghĩa; nội suy khung khoá không NaN, liên tục,
 * khép vòng; nhịp/bước khớp số đếm; mọi khung là SVG hợp lệ.
 */

function balanced(markup: string): boolean {
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup))) {
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== tag) return false;
    } else stack.push(tag);
  }
  return stack.length === 0;
}
const words = (s: string) => s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const ALL = Object.keys(TECH_ANIMS) as AnimId[];

describe('định nghĩa hoạt hình', () => {
  it('mọi loại bài khởi động (TechniqueDrill) đều có hoạt hình', () => {
    const drills = Object.keys(DRILL_PRINCIPLE) as TechniqueDrill[];
    expect(drills.length).toBe(6);
    for (const d of drills) {
      expect(TECH_ANIMS[d], d).toBeDefined();
      expect(TECH_ANIMS[d].id).toBe(d);
    }
    expect([...DRILL_ANIM_IDS].sort()).toEqual([...drills].sort());
    expect(TECH_ANIMS.staccato).toBeDefined();
    expect(TECH_ANIMS.legato).toBeDefined();
  });

  it('bước: nhãn ≤ 6 chữ, có câu đọc; tổng phách các bước = độ dài số đếm', () => {
    for (const id of ALL) {
      const def = TECH_ANIMS[id];
      expect(def.steps.length, id).toBeGreaterThan(0);
      let sum = 0;
      for (const s of def.steps) {
        expect(words(s.label), `${id}: ${s.label}`).toBeLessThanOrEqual(6);
        expect(s.label.length).toBeGreaterThan(3);
        expect(s.say.trim().length).toBeGreaterThan(3);
        expect(s.beats).toBeGreaterThan(0);
        sum += s.beats;
      }
      expect(sum, id).toBe(def.count.length);
      expect(totalBeats(def)).toBeGreaterThanOrEqual(4);
    }
  });

  it('khung khoá: tăng dần trong [0, tổng phách), số hữu hạn, cùng bộ tên', () => {
    for (const id of ALL) {
      const def = TECH_ANIMS[id];
      const T = totalBeats(def);
      const names = Object.keys(def.keys[0].v).sort().join(',');
      def.keys.forEach((k, i) => {
        expect(k.at).toBeGreaterThanOrEqual(0);
        expect(k.at).toBeLessThan(T);
        if (i) expect(k.at, `${id} #${i}`).toBeGreaterThan(def.keys[i - 1].at);
        expect(Object.keys(k.v).sort().join(','), `${id} #${i}`).toBe(names);
        for (const v of Object.values(k.v)) expect(Number.isFinite(v)).toBe(true);
      });
    }
  });
});

describe('nội suy khung khoá', () => {
  const keys: Keyframe[] = [
    { at: 0, v: { x: 0 } },
    { at: 1, v: { x: 10 }, ease: 'lin' },
    { at: 3, v: { x: 30 }, ease: 'io' },
  ];

  it('đúng giá trị tại khung khoá, tuyến tính / mượt ở giữa, khép vòng về khung đầu', () => {
    expect(sampleKeys(keys, 4, 0).x).toBeCloseTo(0);
    expect(sampleKeys(keys, 4, 0.5).x).toBeCloseTo(5);
    expect(sampleKeys(keys, 4, 1).x).toBeCloseTo(10);
    expect(sampleKeys(keys, 4, 2).x).toBeCloseTo(20); // io: giữa đoạn = giữa giá trị
    expect(sampleKeys(keys, 4, 3).x).toBeCloseTo(30);
    expect(sampleKeys(keys, 4, 3.5).x).toBeCloseTo(15); // khung 3 → khung 0 (vòng sau)
    expect(sampleKeys(keys, 4, 4).x).toBeCloseTo(0);
    expect(sampleKeys(keys, 4, -1).x).toBeCloseTo(30);
    expect(sampleKeys(keys, 4, 9).x).toBeCloseTo(10);
  });

  it('không NaN: phách NaN / ∞, thiếu tên ở một khung, danh sách rỗng', () => {
    expect(sampleKeys(keys, 4, NaN).x).toBeCloseTo(0);
    expect(sampleKeys(keys, 4, Infinity).x).toBeCloseTo(0);
    const partial: Keyframe[] = [
      { at: 0, v: { x: 1 } },
      { at: 1, v: { x: 2, y: 5 } },
    ];
    const s = sampleKeys(partial, 2, 0.5);
    expect(Number.isFinite(s.y)).toBe(true);
    expect(sampleKeys([], 4, 1)).toEqual({});
    expect(wrapBeat(NaN, 4)).toBe(0);
    expect(wrapBeat(5, 0)).toBe(0);
  });

  it('các đường ease đi từ 0 tới 1, đơn điệu', () => {
    for (const f of Object.values(EASE)) {
      expect(f(0)).toBeCloseTo(0);
      expect(f(1)).toBeCloseTo(1);
      let prev = -1;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const y = f(Math.min(1, t));
        expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = y;
      }
    }
  });

  it('mọi bài: chuyển động liên tục (không giật), kể cả chỗ khép vòng', () => {
    for (const id of ALL) {
      const def = TECH_ANIMS[id];
      const T = totalBeats(def);
      const step = 0.005;
      for (let b = 0; b < T; b += step) {
        const a = sampleKeys(def.keys, T, b);
        const c = sampleKeys(def.keys, T, b + step);
        for (const k of Object.keys(a)) {
          expect(Number.isFinite(a[k])).toBe(true);
          // không biến số nào nhảy quá 6 đơn vị (độ / px) trong 1/200 phách
          expect(Math.abs(c[k] - a[k]), `${id} ${k} @${b.toFixed(3)}`).toBeLessThan(6);
        }
      }
    }
  });
});

describe('nhịp & bước', () => {
  it('stepAt: bước đổi đúng ở ranh giới phách; số đếm theo phách', () => {
    const ad = TECH_ANIMS['arm-drop'];
    expect(stepAt(ad, 0).index).toBe(0);
    expect(stepAt(ad, 0.99).index).toBe(0);
    expect(stepAt(ad, 1).index).toBe(1);
    expect(stepAt(ad, 3.5).index).toBe(3);
    expect(stepAt(ad, 4).index).toBe(0); // vòng mới
    expect(stepAt(ad, 2.4).beatIndex).toBe(2);
    const ff = TECH_ANIMS['five-finger'];
    expect(stepAt(ff, 4.9).index).toBe(0);
    expect(stepAt(ff, 5).index).toBe(1);
    expect(stepAt(ff, 7.99).beatIndex).toBe(7);
    for (const id of ALL) {
      const def = TECH_ANIMS[id];
      let start = 0;
      def.steps.forEach((s, i) => {
        expect(stepAt(def, start).index).toBe(i);
        expect(stepAt(def, start).start).toBe(start);
        start += s.beats;
      });
    }
  });

  it('tốc độ: chậm → nhanh, mặc định chậm (≥ 1 giây mỗi phách)', () => {
    for (let i = 1; i < SPEED_MS.length; i++) expect(SPEED_MS[i]).toBeLessThan(SPEED_MS[i - 1]);
    expect(SPEED_MS[1]).toBeGreaterThanOrEqual(1000);
  });
});

describe('khung hình SVG', () => {
  it('mọi bài, 40 khung/vòng + khung tĩnh: SVG hợp lệ, không NaN/undefined', () => {
    for (const id of ALL) {
      const T = totalBeats(TECH_ANIMS[id]);
      for (let k = 0; k < 40; k++) {
        const svg = frameSvg(id, (T * k) / 40);
        expect(svg, `${id} ${k}`).not.toMatch(/NaN|undefined|Infinity/);
        expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 240 170"/);
        expect(balanced(svg), `${id} ${k}`).toBe(true);
      }
      for (let k = 0; k < T; k++) {
        const still = frameSvg(id, stillBeat(id, k), { still: true });
        expect(still).not.toMatch(/NaN|undefined|Infinity/);
        expect(balanced(still)).toBe(true);
      }
    }
  });

  it('khung tĩnh có mũi tên chỉ hướng ở bước có chuyển động lớn', () => {
    expect(frameInner('arm-drop', stillBeat('arm-drop', 1), { still: true })).toContain('ta-arrow');
    expect(frameInner('finger-tap', stillBeat('finger-tap', 0), { still: true })).toContain('ta-arrow');
    expect(frameInner('arm-drop', 1.3)).not.toContain('ta-arrow');
  });

  it('cảnh đổi thật theo thời gian (bàn tay chuyển động)', () => {
    for (const id of ALL) {
      const T = totalBeats(TECH_ANIMS[id]);
      const frames = new Set([0, 0.25, 0.5, 0.75].map((f) => frameInner(id, T * f + 0.3)));
      expect(frames.size, id).toBeGreaterThan(2);
    }
  });
});

describe('sơ đồ trừu tượng (không vẽ bàn tay người)', () => {
  const at = (id: AnimId, b: number) => TECH_ANIMS[id].draw(sampleKeys(TECH_ANIMS[id].keys, totalBeats(TECH_ANIMS[id]), b), b).at;

  it('xoay cổ tay: cổ tay đi đúng vòng tròn, chấm đầu ngón đứng yên', () => {
    const pts = [0, 1, 2, 3].map((b) => at('wrist-circle', b).wrist!);
    const cx = (pts[1][0] + pts[3][0]) / 2;
    const cy = (pts[0][1] + pts[2][1]) / 2;
    for (const p of pts) expect(Math.hypot(p[0] - cx, p[1] - cy)).toBeCloseTo(14, 0);
    expect(pts[0][1]).toBeLessThan(pts[2][1]); // phách 1: cổ tay ở trên
    expect(pts[1][0]).toBeGreaterThan(pts[3][0]); // phách 2: tới trước (về phía đàn)
    const tips = new Set([0, 0.7, 1.9, 3.3].map((b) => at('wrist-circle', b).tip!.join(',')));
    expect(tips.size).toBe(1);
  });

  it('cầu vồng rơi: quả nặng ở trên cao khi nhấc, đáp xuống phím rồi nảy nhẹ lên', () => {
    const up = at('arm-drop', 1).tip![1];
    const land = at('arm-drop', 2.5).tip![1];
    const float = at('arm-drop', 3.6).tip![1];
    expect(up).toBeLessThan(land - 20);
    expect(float).toBeLessThan(land);
    expect(float).toBeGreaterThan(up);
  });

  it('ngón cái chui hầm: ngón cái tới phím Fa (sang phải 3 phím) rồi cả cầu dời theo, cuối vòng về chỗ cũ', () => {
    const t0 = at('thumb-under', 0.2).thumb!;
    const t2 = at('thumb-under', 2.3).thumb!;
    expect(t2[0] - t0[0]).toBeCloseTo(81, 0);
    expect(at('thumb-under', 3).finger![0] - at('thumb-under', 0.2).finger![0]).toBeCloseTo(81, 0);
    expect(at('thumb-under', 3.99).thumb![0]).toBeCloseTo(t0[0], 0);
  });

  it('không còn hình bàn tay người: không dùng bộ vẽ bàn tay cũ (không có màu da)', () => {
    for (const id of ALL) for (const b of [0.3, 1.3, 2.3, 3.3]) expect(frameInner(id, b)).not.toMatch(/#ffd5b5|#f3ad88/i);
  });
});
