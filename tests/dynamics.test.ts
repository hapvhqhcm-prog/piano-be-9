import { describe, expect, it } from 'vitest';
import {
  DYN_VOLUME,
  STAC_FRACTION,
  dynAtBeat,
  expressionUsed,
  noteStyles,
  slice,
  slurSpans,
  timeline,
  validateTune,
  type Tune,
} from '../src/music/tune';
import { eventsFromTune } from '../src/ui/components/demo';

/** Bài mẫu v4: f → p, có ngắt tiếng và dấu luyến vắt qua vạch nhịp. */
const tune: Tune = {
  id: 'test-v4',
  title: 'Test',
  titleVi: 'Thử sắc thái',
  hand: 'RH',
  bpm: 60,
  timeSignature: '4/4',
  notes: [
    { pitch: 'C4', beats: 1, finger: 1, dyn: 'f', stac: true },
    { pitch: 'C4', beats: 1, finger: 1, stac: true },
    { pitch: 'G4', beats: 1, finger: 5 },
    { pitch: 'G4', beats: 1, finger: 5 },
    { pitch: 'E4', beats: 1, finger: 3, dyn: 'p', slur: 'start' },
    { pitch: 'D4', beats: 1, finger: 2 },
    { pitch: 'C4', beats: 1, finger: 1, slur: 'end' },
    { rest: true, beats: 1 },
  ],
};

describe('v4 — kiểu đàn khi phát mẫu', () => {
  it('bài v4 vẫn hợp lệ', () => {
    expect(validateTune(tune)).toEqual([]);
    expect(expressionUsed(tune)).toEqual({ dyn: true, stac: true, slur: true });
  });

  it('sắc thái giữ tới khi đổi; ngắt ≈ 35%; trong luyến giữ liền', () => {
    const st = noteStyles(tune);
    expect(st.get(0)).toMatchObject({ dyn: 'f', vol: DYN_VOLUME.f, len: STAC_FRACTION });
    expect(st.get(3)).toMatchObject({ dyn: 'f', vol: 1 });
    expect(st.get(4)!.vol).toBe(DYN_VOLUME.p);
    expect(st.get(4)!.len).toBeGreaterThanOrEqual(1); // liền: giữ tới nốt sau
    expect(st.get(5)!.slurred).toBe(true);
    expect(st.get(6)!.len).toBeLessThan(1); // nốt cuối luyến nhấc tay
    expect(st.has(7)).toBe(false); // dấu lặng
  });

  it('bài không ghi sắc thái: âm lượng như cũ (1)', () => {
    const plain: Tune = { ...tune, notes: tune.notes.map(({ dyn: _d, stac: _s, slur: _l, ...n }) => n) };
    expect([...noteStyles(plain).values()].every((s) => s.vol === 1 && s.dyn === null)).toBe(true);
    expect(dynAtBeat(plain, 2)).toBeNull();
  });

  it('dynAtBeat theo bè chính (cho bè đệm)', () => {
    expect(dynAtBeat(tune, 0)).toBe('f');
    expect(dynAtBeat(tune, 3.5)).toBe('f');
    expect(dynAtBeat(tune, 4)).toBe('p');
  });

  it('eventsFromTune mang âm lượng & độ dài kêu', () => {
    const ev = eventsFromTune(tune);
    expect(ev[0].notes[0].vol).toBe(DYN_VOLUME.f);
    expect(ev[0].notes[0].len).toBeCloseTo(STAC_FRACTION);
    expect(ev[4].notes[0].vol).toBe(DYN_VOLUME.p);
  });

  it('dấu luyến: cặp nốt đầu–cuối; dấu chưa đóng kéo tới nốt cuối', () => {
    expect(slurSpans(timeline(tune))).toEqual([[4, 6]]);
    const open: Tune = { ...tune, notes: tune.notes.map((n, i) => (i === 6 ? { ...n, slur: undefined } : n)) };
    expect(slurSpans(timeline(open))).toEqual([[4, 6]]);
  });

  it('tập từng câu: giữ ký hiệu, mang theo sắc thái đang có, cắt dấu luyến ở mép câu', () => {
    const t2: Tune = { ...tune, notes: [...tune.notes.slice(0, 5), { pitch: 'D4', beats: 1, finger: 2 }, { pitch: 'C4', beats: 1, finger: 1 }, { pitch: 'D4', beats: 1, finger: 2 }, { pitch: 'E4', beats: 1, finger: 3, slur: 'end' }, { rest: true, beats: 3 }] };
    const b = slice(t2, 1, 2); // ô nhịp 2: E(p, luyến bắt đầu) D C D — luyến kết thúc ở ô sau
    expect(b.notes[0]).toMatchObject({ dyn: 'p', slur: 'start' });
    expect(b.notes[3].slur).toBe('end');
    const c = slice(t2, 2, 3); // ô 3: E (kết thúc luyến) … — bắt đầu giữa luyến, sắc thái p mang theo
    expect(c.notes[0].dyn).toBe('p');
    expect(c.notes[0].slur).toBeUndefined();
    const a = slice(t2, 0, 1);
    expect(a.notes[0]).toMatchObject({ dyn: 'f', stac: true });
  });
});
