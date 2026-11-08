import { describe, expect, it } from 'vitest';
import { buildChordLh, chordName, chordToneNames, chordViName, guessKey, parseChordName, parseChordText, suggestChords } from '../src/music/chords';
import { parseSolfege } from '../src/music/solfege';
import { validateTune } from '../src/music/tune';
import { buildParentSong, parentSongToTune } from '../src/practice/parentSongs';

const TWINKLE = 'Đô Đô Sol Sol | La La Sol- | Fa Fa Mi Mi | Rê Rê Đô-';

describe('hợp âm tay trái (2026-11-08)', () => {
  it('đọc tên hợp âm chữ cái và tên Việt', () => {
    expect(chordName(parseChordName('Am')!)).toBe('Am');
    expect(chordName(parseChordName('F#')!)).toBe('F#');
    expect(chordName(parseChordName('Bb7')!)).toBe('Bb7');
    expect(chordName(parseChordName('Đô')!)).toBe('C');
    expect(chordName(parseChordName('Sol7')!)).toBe('G7');
    expect(chordName(parseChordName('lathứ')!)).toBe('Am');
    expect(chordName(parseChordName('Si giáng'.replace(' ', ''))!)).toBe('Bb');
    expect(parseChordName('Xyz')).toBeNull();
    expect(chordViName(parseChordName('Am')!)).toBe('La thứ');
    expect(chordToneNames(parseChordName('C')!)).toBe('Đô – Mi – Sol');
    expect(chordToneNames(parseChordName('Bb')!)).toBe('Si giáng – Rê – Fa');
  });

  it('tách ô: có "|" và không có "|", tên Việt rời "La thứ", lỗi', () => {
    const a = parseChordText('C | G | Am | F');
    expect(a.errors).toEqual([]);
    expect(a.bars.map((b) => b.map((c) => (c && c !== 'hold' ? chordName(c) : c)))).toEqual([['C'], ['G'], ['Am'], ['F']]);
    const b = parseChordText('Đô Sol La thứ Fa');
    expect(b.bars.length).toBe(4);
    expect(chordName(b.bars[2][0] as never)).toBe('Am');
    const c = parseChordText('C G | _ | F -');
    expect(c.bars[0].length).toBe(2);
    expect(c.bars[1]).toEqual([null]);
    expect(parseChordText('C | Hmm').errors.length).toBe(1);
  });

  it('dựng bè tay trái: dài đúng số ô, hợp âm 3 nốt ngón 5-?-1, thế gần nhau', () => {
    const { bars } = parseChordText('C | F | G | C');
    const lh = buildChordLh(bars, 4, 4, 'block');
    expect(lh.reduce((s, n) => s + n.beats, 0)).toBe(16);
    for (const n of lh) {
      expect(n.finger).toBe(5);
      expect(n.also?.length).toBe(2);
      expect(n.also![1].finger).toBe(1);
    }
    // F sau C → đảo (Đô Fa La), G → Si Rê Sol: tay gần như không nhảy
    expect([lh[1].pitch, ...lh[1].also!.map((a) => a.pitch)]).toEqual(['C3', 'F3', 'A3']);
    expect([lh[2].pitch, ...lh[2].also!.map((a) => a.pitch)]).toEqual(['B2', 'D3', 'G3']);
    const pulse = buildChordLh(bars, 3, 4, 'pulse');
    expect(pulse.length).toBe(12);
    const root = buildChordLh(parseChordText('C | G').bars, 4, 3, 'root');
    expect(root.map((n) => (n.rest ? '_' : n.pitch))).toEqual(['C3', 'G2', '_']);
    expect(root[0].finger).toBeGreaterThan(0);
  });

  it('viết đúng tên nốt giáng (Bb, Eb)', () => {
    const lh = buildChordLh(parseChordText('Bb | Eb').bars, 4, 2, 'block');
    const names = lh.flatMap((n) => [n.pitch, ...(n.also ?? []).map((a) => a.pitch)]);
    expect(names.some((p) => p?.includes('#'))).toBe(false);
    expect(names).toContain('Bb2');
  });

  it('app tự chọn hợp âm: Ngôi sao nhỏ → C | F C | … kết C', () => {
    const r = parseSolfege(TWINKLE, 4);
    expect(guessKey(r.notes)).toBe(0);
    const s = suggestChords(r.notes, 4);
    expect(s).toBe('C | F C | F C | G C');
    // 3/4 Chúc mừng sinh nhật (Đô trưởng): ô lấy đà nghỉ, ô cuối về C
    const hb = parseSolfege('Sol,/. Sol,// | La, Sol, Đô | Si,- Sol,/. Sol,// | La, Sol, Rê | Đô--', 3);
    const hs = suggestChords([{ rest: true, beats: hb.pickupRest }, ...hb.notes], 3).split(/\||\n/).map((x) => x.trim());
    expect(hs[0]).toBe('_');
    expect(hs[hs.length - 1]).toBe('C');
  });

  it('bài có hợp âm → bài hai tay hợp lệ (validateTune), giai điệu tay phải', () => {
    const r = parseSolfege(TWINKLE, 4);
    for (const style of ['root', 'block', 'pulse'] as const) {
      const song = buildParentSong(r.notes, { id: 'x', title: 'Thử', createdAt: 1, timeSignature: '4/4', bpm: 72, chords: 'C | F C | G C | G C', chordStyle: style });
      const t = parentSongToTune(song);
      expect(t.hand).toBe('BOTH');
      expect(t.lh?.length).toBeGreaterThan(0);
      expect(validateTune(t)).toEqual([]);
    }
    // xóa hợp âm → lại một tay
    const plain = buildParentSong(r.notes, { id: 'x', title: 'Thử', createdAt: 1, timeSignature: '4/4', bpm: 72, chords: '  ' });
    expect(plain.lh).toBeUndefined();
    expect(parentSongToTune(plain).hand).toBe('RH');
  });

  it('hợp âm mọi nốt gốc, mọi kiểu đều dựng được', () => {
    const roots = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    for (const q of ['', 'm', '7', 'm7', 'dim'])
      for (const r of roots) {
        const lh = buildChordLh(parseChordText(r + q).bars, 4, 1, 'block');
        expect(lh[0].pitch, r + q).toBeTruthy();
        expect(lh[0].also?.length, r + q).toBe(2);
      }
  });
});
