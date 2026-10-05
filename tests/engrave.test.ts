import { describe, expect, it } from 'vitest';
import {
  beamGroups,
  beamSegments,
  flagCount,
  groupStemUp,
  makeSpacing,
  noteShape,
  spaceAt,
  type BeamNote,
} from '../src/music/engrave';
import { SONGS, lhTimeline, timeline, beatsPerMeasure } from '../src/music/tune';

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

describe('hình nốt', () => {
  it('trường độ → hình nốt & chấm dôi', () => {
    expect(noteShape(4)).toEqual({ base: 4, dots: 0 });
    expect(noteShape(3)).toEqual({ base: 2, dots: 1 });
    expect(noteShape(1.5)).toEqual({ base: 1, dots: 1 });
    expect(noteShape(0.75)).toEqual({ base: 0.5, dots: 1 });
    expect(noteShape(0.375)).toEqual({ base: 0.25, dots: 1 });
    expect(noteShape(0.25)).toEqual({ base: 0.25, dots: 0 });
  });
  it('số móc: đen 0, móc đơn 1 (kể cả đơn chấm), móc kép 2', () => {
    expect([1, 2, 0.5, 0.75, 0.25, 0.375].map(flagCount)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('beamGroups — gạch nối theo phách', () => {
  it('2/4: mỗi phách một nhóm (Bắc kim thang ô 1: đơn chấm–kép | đơn–kép–kép)', () => {
    expect(beamGroups(seq('0.75 0.25 0.5 0.25 0.25'), 2)).toEqual([[0, 1], [2, 3, 4]]);
  });
  it('2/4: bốn móc đơn → hai cặp (như bản ký âm dân ca)', () => {
    expect(beamGroups(seq('0.5 0.5 0.5 0.5'), 2)).toEqual([[0, 1], [2, 3]]);
  });
  it('nốt đen đứng riêng; móc đơn lẻ giữ móc (không có trong nhóm)', () => {
    expect(beamGroups(seq('1 0.5 0.5'), 2)).toEqual([[1, 2]]);
    expect(beamGroups(seq('1.5 0.5'), 2)).toEqual([]);
  });
  it('dấu lặng cắt gạch nối', () => {
    expect(beamGroups(seq('0.5 R0.5 0.5 0.5'), 2)).toEqual([[2, 3]]);
    expect(beamGroups(seq('0.25 0.25 R0.25 0.25'), 2)).toEqual([[0, 1]]);
  });
  it('4/4: bốn móc đơn trong nửa ô nối chung, không nối qua giữa ô', () => {
    expect(beamGroups(seq('0.5 0.5 0.5 0.5 0.5 0.5 0.5 0.5'), 4)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]]);
    expect(beamGroups(seq('1 0.5 0.5 0.5 0.5 1'), 4)).toEqual([[1, 2], [3, 4]]);
  });
  it('4/4: có móc kép thì nối theo từng phách', () => {
    expect(beamGroups(seq('0.5 0.25 0.25 0.5 0.5 2'), 4)).toEqual([[0, 1, 2], [3, 4]]);
  });
  it('3/4: các cặp móc đơn trong ô nối chung (Minuet: đen + 4 móc đơn)', () => {
    expect(beamGroups(seq('1 0.5 0.5 0.5 0.5'), 3)).toEqual([[1, 2, 3, 4]]);
    expect(beamGroups(seq('0.5 0.5 0.5 0.5 0.5 0.5 3'), 3)).toEqual([[0, 1, 2, 3, 4, 5]]);
  });
  it('không nối qua vạch nhịp', () => {
    expect(beamGroups(seq('1.5 0.5 0.5 0.5 1'), 2)).toEqual([[2, 3]]);
    expect(beamGroups(seq('2 0.5 0.5 0.5 0.5 2'), 3)).toEqual([[1, 2], [3, 4]]);
  });
});

describe('beamSegments — gạch chính, gạch phụ, gạch cụt', () => {
  const segs = (s: string) => beamSegments(seq(s));
  it('móc đơn: một gạch suốt nhóm', () => {
    expect(segs('0.5 0.5')).toEqual([{ level: 1, from: 0, to: 1 }]);
  });
  it('bốn móc kép: hai gạch suốt nhóm', () => {
    expect(segs('0.25 0.25 0.25 0.25')).toEqual([
      { level: 1, from: 0, to: 3 },
      { level: 2, from: 0, to: 3 },
    ]);
  });
  it('móc đơn + hai móc kép: gạch phụ chỉ nối hai móc kép', () => {
    expect(segs('0.5 0.25 0.25')).toEqual([
      { level: 1, from: 0, to: 2 },
      { level: 2, from: 1, to: 2 },
    ]);
  });
  it('đơn chấm + kép: gạch cụt chĩa trái; kép + đơn chấm: chĩa phải', () => {
    expect(segs('0.75 0.25')[1]).toEqual({ level: 2, from: 1, to: 1, stub: -1 });
    expect(segs('0.25 0.75')[1]).toEqual({ level: 2, from: 0, to: 0, stub: 1 });
  });
  it('kép – đơn – kép: hai gạch cụt chĩa vào trong phách', () => {
    const s = segs('0.25 0.5 0.25');
    expect(s.slice(1)).toEqual([
      { level: 2, from: 0, to: 0, stub: 1 },
      { level: 2, from: 2, to: 2, stub: -1 },
    ]);
  });
});

describe('hướng đuôi chung của nhóm', () => {
  it('nốt xa vạch giữa nhất quyết định', () => {
    expect(groupStemUp([-2, 0])).toBe(true); // Đô–Mi (khóa Sol): đuôi lên
    expect(groupStemUp([5, 7])).toBe(false); // Đô5–Mi5: đuôi xuống
    expect(groupStemUp([1, 8])).toBe(false); // Fa4 & Fa5: Fa5 xa hơn
    expect(groupStemUp([-1, 6])).toBe(true); // Rê4 xa hơn Rê5
  });
});

describe('giãn cách theo trường độ, có khoảng tối thiểu', () => {
  it('móc kép không dính nhau; nốt dài giãn theo trường độ; thời điểm → x đơn điệu', () => {
    const s = makeSpacing([0, 0.25, 0.5, 1, 2], 62, 30);
    expect(s.x).toEqual([0, 30, 60, 91, 153]);
    expect(spaceAt(s, 0.125)).toBeCloseTo(15);
    expect(spaceAt(s, 1.5)).toBeCloseTo(122);
    expect(spaceAt(s, 3)).toBeCloseTo(215); // sau mốc cuối: theo pxPerBeat
  });
  it('chừa thêm trước vạch nhịp', () => {
    const s = makeSpacing([0, 1.75, 2], 62, 30, (t) => (t === 2 ? 8 : 0));
    expect(s.x[2] - s.x[1]).toBe(38);
  });
});

describe('mọi bài hát: gạch nối hợp lệ', () => {
  it.each(SONGS.map((s) => [s.id, s] as const))('%s', (_id, song) => {
    const bpm = beatsPerMeasure(song);
    for (const v of [timeline(song), lhTimeline(song)]) {
      for (const g of beamGroups(v, bpm)) {
        expect(g.length).toBeGreaterThanOrEqual(2);
        // cùng một ô nhịp, liền nhau, không có dấu lặng/nốt đen
        expect(new Set(g.map((i) => v[i].measure)).size).toBe(1);
        for (let k = 1; k < g.length; k++) expect(g[k]).toBe(g[k - 1] + 1);
        for (const i of g) expect(v[i].rest || flagCount(v[i].beats) === 0).toBe(false);
      }
    }
  });
});
