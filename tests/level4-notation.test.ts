import { describe, expect, it } from 'vitest';
import { beamGroups, beamGroupsIn, flagCount, noteShape, type BeamNote } from '../src/music/engrave';
import {
  DYN_VOLUME,
  SONGS,
  STAC_FRACTION,
  accompaniment,
  beatsPerMeasure,
  dynAtBeat,
  expressionUsed,
  hairpinSpans,
  isCompound,
  lhTimeline,
  noteStyles,
  noteUnit,
  pedalSegments,
  pedalSpans,
  slice,
  timeline,
  validateTune,
  type Tune,
  type TuneNote,
} from '../src/music/tune';

/** Dãy trường độ → nốt có thời điểm bắt đầu ("R" = dấu lặng). */
function seq(s: string): BeamNote[] {
  let t = 0;
  return s.split(/\s+/).map((tok) => {
    const rest = tok.startsWith('R');
    const beats = Number(rest ? tok.slice(1) : tok);
    const n = { start: t, beats, rest };
    t += beats;
    return n;
  });
}

const RH_F: Record<string, number> = { C4: 1, D4: 2, E4: 3, F4: 4, G4: 5 };
const LH_F: Record<string, number> = { C3: 5, D3: 4, E3: 3, F3: 2, G3: 1 };
const rh = (pitch: string, beats: number, extra: Partial<TuneNote> = {}): TuneNote =>
  ({ pitch, beats, finger: RH_F[pitch], ...extra }) as TuneNote;
const lh = (pitch: string, beats: number, extra: Partial<TuneNote> = {}): TuneNote =>
  ({ pitch, beats, finger: LH_F[pitch], ...extra }) as TuneNote;

const base = (over: Partial<Tune>): Tune => ({
  id: 'l4',
  title: 'L4',
  titleVi: 'L4',
  hand: 'RH',
  bpm: 80,
  timeSignature: '4/4',
  notes: [],
  ...over,
});

describe('Cấp 4 — nhịp 6/8', () => {
  const six = base({
    timeSignature: '6/8',
    bpm: 120,
    notes: [rh('C4', 1), rh('D4', 1), rh('E4', 1), rh('F4', 3), rh('G4', 6)],
  });

  it('noteUnit / isCompound', () => {
    expect(noteUnit(six)).toBe(0.5);
    expect(isCompound(six)).toBe(true);
    expect(beatsPerMeasure(six)).toBe(6);
    for (const ts of ['4/4', '3/4', '2/4']) {
      expect(noteUnit(base({ timeSignature: ts }))).toBe(1);
      expect(isCompound(base({ timeSignature: ts }))).toBe(false);
    }
    expect(isCompound(base({ timeSignature: '9/8' }))).toBe(true);
    expect(isCompound(base({ timeSignature: '12/8' }))).toBe(true);
    expect(isCompound(base({ timeSignature: '3/8' }))).toBe(false);
    expect(validateTune(six)).toEqual([]);
  });

  it('hình nốt theo beats × unit: móc đơn, đen chấm, trắng chấm', () => {
    const u = noteUnit(six);
    expect(noteShape(1 * u)).toEqual({ base: 0.5, dots: 0 });
    expect(flagCount(1 * u)).toBe(1);
    expect(noteShape(2 * u)).toEqual({ base: 1, dots: 0 });
    expect(noteShape(3 * u)).toEqual({ base: 1, dots: 1 });
    expect(noteShape(6 * u)).toEqual({ base: 2, dots: 1 });
    expect(flagCount(0.5 * u)).toBe(2);
  });

  it('gạch nối 6/8: nhóm theo đen chấm (3 móc đơn)', () => {
    // theo nốt đen, compoundGroup = 1.5
    expect(beamGroups(seq('0.5 0.5 0.5 0.5 0.5 0.5'), 3, 1.5)).toEqual([[0, 1, 2], [3, 4, 5]]);
    // theo phách móc đơn của bài (unit 0.5)
    const e = (s: string) => beamGroupsIn(seq(s), 6, 0.5, true);
    expect(e('1 1 1 1 1 1')).toEqual([[0, 1, 2], [3, 4, 5]]);
    expect(e('2 1 2 1')).toEqual([]); // đen + móc đơn: móc đơn đứng riêng
    expect(e('1 2 1 1 1')).toEqual([[2, 3, 4]]);
    expect(e('1.5 0.5 1 3')).toEqual([[0, 1, 2]]); // móc đơn chấm – móc kép – móc đơn
    expect(e('1 R1 1 1 1 1')).toEqual([[3, 4, 5]]); // dấu lặng cắt nhóm
    expect(e('3 1 1 1 1 1 1 3')).toEqual([[1, 2, 3], [4, 5, 6]]); // không nối qua nhịp lớn / vạch nhịp
    expect(e('0.5 0.5 0.5 0.5 0.5 0.5 3')).toEqual([[0, 1, 2, 3, 4, 5]]); // 6 móc kép = một nhịp lớn
  });

  it('beamGroupsIn với unit 1 (x/4) y hệt beamGroups cũ', () => {
    for (const [s, bpm] of [
      ['0.5 0.5 0.5 0.5 0.5 0.5 0.5 0.5', 4],
      ['1 0.5 0.5 0.5 0.5', 3],
      ['0.75 0.25 0.5 0.25 0.25', 2],
    ] as const) {
      expect(beamGroupsIn(seq(s), bpm)).toEqual(beamGroups(seq(s), bpm));
    }
  });

  it('nhạc đệm 6/8: gốc ở phách 0 (3 phách), quãng 5 ở phách 3 (3 phách)', () => {
    const acc = accompaniment(six, 'basic');
    expect(acc.map(({ start, beats }) => [start, beats])).toEqual([
      [0, 3],
      [3, 3],
      [6, 3],
      [9, 3],
    ]);
    expect(acc[1].midi - acc[0].midi).toBe(7);
    // kiểu đệm khác ở nhịp ghép: giữ kiểu cơ bản
    expect(accompaniment(six, 'march')).toEqual(acc);
  });
});

describe('Cấp 4 — pedal', () => {
  const ped = base({
    hand: 'BOTH',
    notes: [rh('C4', 1), rh('D4', 1), rh('E4', 1), rh('F4', 1), rh('G4', 4)],
    lh: [lh('C3', 2, { ped: 'start' }), lh('G3', 2), lh('C3', 2, { ped: 'change' }), lh('G3', 2, { ped: 'end' })],
  });

  it('hợp lệ; expressionUsed.ped', () => {
    expect(validateTune(ped)).toEqual([]);
    expect(expressionUsed(ped)).toEqual({ dyn: false, stac: false, slur: false, ped: true });
  });

  it('pedalSpans / pedalSegments', () => {
    const v = lhTimeline(ped);
    expect(pedalSpans(v)).toEqual([{ start: 5, changes: [7], end: 8 }]);
    expect(pedalSegments(v)).toEqual([
      [0, 4],
      [4, 8],
    ]);
    expect(pedalSpans(timeline(ped))).toEqual([]);
  });

  it('nốt kêu khi đạp pedal ngân tới lúc thay / nhả pedal (không bao giờ ngắn hơn)', () => {
    const st = noteStyles(ped);
    const plain = noteStyles({ ...ped, lh: ped.lh!.map(({ ped: _p, ...n }) => n) });
    expect(plain.get(0)!.len).toBeCloseTo(0.95);
    expect(st.get(0)!.len).toBe(4);
    expect(st.get(1)!.len).toBe(3);
    expect(st.get(3)!.len).toBe(1);
    expect(st.get(4)!.len).toBe(4);
    expect(st.get(5)!.len).toBe(4);
    expect(st.get(6)!.len).toBe(2);
    expect(st.get(7)!.len).toBe(4);
    expect(st.get(8)!.len).toBe(2);
    for (const [i, s] of plain) expect(st.get(i)!.len).toBeGreaterThanOrEqual(s.len);
    // âm lượng không đổi
    for (const [i, s] of plain) expect(st.get(i)!.vol).toBe(s.vol);
  });

  it('nốt ngắt trong pedal vẫn ngân (pedal giữ tiếng)', () => {
    const t = base({ notes: [rh('C4', 1, { stac: true, ped: 'start' }), rh('E4', 1, { ped: 'end' }), rh('G4', 2)] });
    const st = noteStyles(t);
    expect(st.get(0)!.len).toBe(2);
    expect(st.get(1)!.len).toBe(1);
    expect(st.get(2)!.len).toBeCloseTo(1.9);
    const noPed = noteStyles({ ...t, notes: t.notes.map(({ ped: _p, ...n }) => n) });
    expect(noPed.get(0)!.len).toBeCloseTo(STAC_FRACTION);
  });

  it('validateTune: pedal viết sai', () => {
    const errs = (lhNotes: TuneNote[]) => validateTune({ ...ped, lh: lhNotes });
    expect(errs([lh('C3', 2, { ped: 'end' }), lh('G3', 2), lh('C3', 2), lh('G3', 2)]).some((e) => e.includes("'end'"))).toBe(true);
    expect(errs([lh('C3', 2, { ped: 'start' }), lh('G3', 2, { ped: 'start' }), lh('C3', 2), lh('G3', 2, { ped: 'end' })]).length).toBe(1);
    expect(errs([lh('C3', 2, { ped: 'start' }), lh('G3', 2), lh('C3', 2), lh('G3', 2)]).some((e) => e.includes('chưa'))).toBe(true);
    expect(errs([lh('C3', 2, { ped: 'change' }), lh('G3', 2), lh('C3', 2), lh('G3', 2, { ped: 'end' })]).length).toBe(1);
    // pedal ghi ở cả hai bè
    const both = { ...ped, notes: ped.notes.map((n, i) => (i === 0 ? { ...n, ped: 'start' as const } : i === 4 ? { ...n, ped: 'end' as const } : n)) };
    expect(validateTune(both).some((e) => e.includes('MỘT bè'))).toBe(true);
  });
});

describe('Cấp 4 — to dần / nhỏ dần', () => {
  const notes = [
    rh('C4', 1, { dyn: 'p', hairpin: 'cresc' }),
    rh('D4', 1),
    rh('E4', 1),
    rh('F4', 1, { hairpin: 'end' }),
    rh('G4', 4, { dyn: 'f' }),
  ];
  const cresc = base({ notes });

  it('hairpinSpans + expressionUsed.hairpin', () => {
    expect(validateTune(cresc)).toEqual([]);
    expect(hairpinSpans(timeline(cresc))).toEqual([{ from: 0, to: 3, kind: 'cresc' }]);
    expect(expressionUsed(cresc)).toEqual({ dyn: true, stac: false, slur: false, hairpin: true });
  });

  it('âm lượng đi dần từ p tới f (sắc thái ghi sau nêm)', () => {
    const st = noteStyles(cresc);
    const vols = [0, 1, 2, 3, 4].map((i) => st.get(i)!.vol);
    expect(vols[0]).toBeCloseTo(DYN_VOLUME.p);
    expect(vols[1]).toBeCloseTo(0.45 + 0.55 * 0.25);
    expect(vols[2]).toBeCloseTo(0.45 + 0.55 * 0.5);
    expect(vols[3]).toBeCloseTo(0.45 + 0.55 * 0.75);
    expect(vols[4]).toBe(DYN_VOLUME.f);
    for (let i = 1; i < 5; i++) expect(vols[i]).toBeGreaterThan(vols[i - 1]);
    expect(st.get(2)!.dyn).toBe('p');
  });

  it('không có sắc thái đích → một bậc (p → mf) và giữ mức mới', () => {
    const t = base({ notes: notes.map((n, i) => (i === 4 ? { ...n, dyn: undefined } : n)) });
    const st = noteStyles(t);
    expect(st.get(3)!.vol).toBeCloseTo(0.45 + 0.3 * 0.75);
    expect(st.get(4)!.vol).toBeCloseTo(DYN_VOLUME.mf);
  });

  it('nhỏ dần không ghi sắc thái: mf → p; áp cả cho bè tay trái', () => {
    const t = base({
      hand: 'BOTH',
      notes: [rh('G4', 2, { hairpin: 'dim' }), rh('E4', 2, { hairpin: 'end' }), rh('C4', 4)],
      lh: [lh('C3', 4), lh('G3', 2), lh('C3', 2)],
    });
    expect(validateTune(t)).toEqual([]);
    const st = noteStyles(t);
    expect(st.get(0)!.vol).toBeCloseTo(DYN_VOLUME.mf);
    expect(st.get(1)!.vol).toBeCloseTo(0.75 - 0.3 * 0.5);
    expect(st.get(2)!.vol).toBeCloseTo(DYN_VOLUME.p);
    // tay trái theo cùng đường âm lượng
    expect(st.get(3)!.vol).toBeCloseTo(DYN_VOLUME.mf);
    expect(st.get(4)!.vol).toBeCloseTo(DYN_VOLUME.p);
    expect(st.get(5)!.vol).toBeCloseTo(DYN_VOLUME.p);
  });

  it('validateTune: nêm viết sai', () => {
    const v = (ns: TuneNote[]) => validateTune(base({ notes: ns }));
    expect(v([rh('C4', 2, { hairpin: 'end' }), rh('D4', 2)]).length).toBe(1);
    expect(v([rh('C4', 2, { hairpin: 'cresc' }), rh('D4', 2)]).length).toBe(1);
    expect(v([rh('C4', 1, { hairpin: 'cresc' }), rh('D4', 1, { hairpin: 'dim' }), rh('E4', 2, { hairpin: 'end' })]).length).toBe(1);
    const lhHp = base({
      hand: 'BOTH',
      notes: [rh('C4', 4)],
      lh: [lh('C3', 2, { hairpin: 'cresc' }), lh('G3', 2, { hairpin: 'end' })],
    });
    expect(validateTune(lhHp).some((e) => e.includes('bè chính'))).toBe(true);
  });
});

describe('Cấp 4 — cắt câu (slice) giữ & sửa pedal / nêm / rit.', () => {
  const t = base({
    tempoTerm: 'Andante',
    notes: [
      rh('C4', 1, { ped: 'start' }),
      rh('D4', 1),
      rh('E4', 1, { hairpin: 'cresc' }),
      rh('F4', 1),
      rh('G4', 1, { ped: 'change' }),
      rh('F4', 1, { hairpin: 'end' }),
      rh('E4', 1),
      rh('D4', 1, { ped: 'end', rit: true }),
    ],
  });

  it('nửa đầu: pedal & nêm đóng ở nốt cuối câu', () => {
    const a = slice(t, 0, 1);
    expect(a.tempoTerm).toBe('Andante');
    expect(a.notes.map((n) => n.ped ?? '-')).toEqual(['start', '-', '-', 'end']);
    expect(a.notes.map((n) => n.hairpin ?? '-')).toEqual(['-', '-', 'cresc', 'end']);
    expect(validateTune(a)).toEqual([]);
  });

  it('nửa sau: pedal & nêm mở lại ở nốt đầu câu; rit. giữ nguyên', () => {
    const b = slice(t, 1, 2);
    expect(b.notes.map((n) => n.ped ?? '-')).toEqual(['start', '-', '-', 'end']);
    expect(b.notes.map((n) => n.hairpin ?? '-')).toEqual(['cresc', 'end', '-', '-']);
    expect(b.notes[3].rit).toBe(true);
    expect(validateTune(b)).toEqual([]);
  });

  it('bài nguyên vẹn: hợp lệ; câu không cắt ngang thì không đổi', () => {
    expect(validateTune(t)).toEqual([]);
    expect(slice(t, 0, 2).notes).toEqual(t.notes.map((n) => ({ ...n, also: undefined })));
  });
});

/** noteStyles trước Cấp 4 (bản sao để so: bài cũ phải ra y hệt). */
function legacyStyles(t: Tune) {
  const out = new Map<number, { dyn: string | null; vol: number; len: number; slurred: boolean }>();
  const all = [...t.notes, ...(t.lh ?? [])];
  const anyDyn = all.some((n) => !!n.dyn);
  for (const voice of [timeline(t), lhTimeline(t)]) {
    let cur: TuneNote['dyn'] | null = anyDyn ? 'mf' : null;
    const ownDyn = voice.some((n) => !!n.dyn);
    let open = false;
    for (const n of voice) {
      if (n.dyn) cur = n.dyn;
      else if (!ownDyn && anyDyn) cur = dynAtBeat(t, n.start);
      if (n.rest) continue;
      if (n.slur === 'start') open = true;
      const ending = n.slur === 'end';
      const frac = n.stac ? STAC_FRACTION : open && !ending ? 1.02 : ending ? 0.85 : 0.95;
      out.set(n.index, { dyn: cur ?? null, vol: cur ? DYN_VOLUME[cur] : 1, len: n.beats * frac, slurred: open || ending });
      if (ending) open = false;
    }
  }
  return out;
}

describe('bài cũ (không pedal / nêm / 6/8) không đổi', () => {
  const old = SONGS.filter(
    (s) => !isCompound(s) && ![...s.notes, ...(s.lh ?? [])].some((n) => n.ped || n.hairpin),
  );
  it('có bài để so', () => expect(old.length).toBeGreaterThan(10));
  it.each(old.map((s) => [s.id, s] as const))('%s', (_id, s) => {
    const u = expressionUsed(s);
    expect('ped' in u || 'hairpin' in u).toBe(false);
    expect(noteStyles(s)).toEqual(legacyStyles(s));
    const bpm = beatsPerMeasure(s);
    expect(beamGroupsIn(timeline(s), bpm, noteUnit(s), isCompound(s))).toEqual(beamGroups(timeline(s), bpm));
    // nhạc đệm cơ bản: gốc ở phách 1, quãng 5 ở phách 3 (như trước)
    for (const a of accompaniment(s, 'basic')) expect([0, 2]).toContain(a.start % bpm);
  });
});
