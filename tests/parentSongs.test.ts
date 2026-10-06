import { describe, expect, it } from 'vitest';
import { autoFinger, guessHand, transitionCost, whitePos } from '../src/music/autoFinger';
import { durationSuffix, noteToSolfege, notesToSolfege, padToBars, parseSolfege, parseToken } from '../src/music/solfege';
import { measureCount, phraseRanges, totalBeats, validateTune } from '../src/music/tune';
import { PARENT_PREFIX, addTapNote, buildParentSong, newParentSongId, parentSongToTune } from '../src/practice/parentSongs';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import { defaultData, validateAppData, type ParentSong } from '../src/progress/schema';

const P = (text: string, bpb = 4) => parseSolfege(text, bpb);
const pitches = (text: string, bpb = 4) => P(text, bpb).notes.map((n) => (n.rest ? '_' : n.pitch));
const beats = (text: string, bpb = 4) => P(text, bpb).notes.map((n) => n.beats);

describe('Gõ chữ Đô Rê Mi — tên nốt, quãng tám, thăng giáng', () => {
  it('7 tên nốt, có dấu hay không dấu, hoa hay thường', () => {
    expect(pitches('Đô Rê Mi Fa Sol La Si')).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4']);
    expect(pitches('do re mi fa sol la si')).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4']);
    expect(pitches('ĐÔ RÊ MI FA SOL LA SI')).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4']);
    expect(pitches('Đo Dô pha son so xi ti')).toEqual(['C4', 'C4', 'F4', 'G4', 'G4', 'B4', 'B4']);
  });
  it("quãng tám: ' cao, , thấp, hoặc số; dấu ’ của iPad cũng được", () => {
    expect(pitches("Đô' Đô'' Sol, Đô,")).toEqual(['C5', 'C6', 'G3', 'C3']);
    expect(pitches('Đô’ Mi‘ La′')).toEqual(['C5', 'E5', 'A5']);
    expect(pitches('Đô4 Sol3 Mi5 Đô6')).toEqual(['C4', 'G3', 'E5', 'C6']);
  });
  it('thăng / giáng: # b ♯ ♭, trước hoặc sau dấu quãng', () => {
    expect(pitches("Fa# Sib Mib' Đô#, Sol♯ La♭ Fa#4 Fa4# Sib'")).toEqual(['F#4', 'Bb4', 'Eb5', 'C#3', 'G#4', 'Ab4', 'F#4', 'F#4', 'Bb5']);
  });
  it('tên chữ cái viết HOA: C4 F#4 Bb3 G', () => {
    expect(pitches('C4 F#4 Bb3 G E5')).toEqual(['C4', 'F#4', 'Bb3', 'G4', 'E5']);
  });
});

describe('Gõ chữ — độ dài, dấu lặng', () => {
  it('mặc định 1 phách; "-" thêm phách; "/" nửa; "//" ¼; "." chấm dôi', () => {
    expect(beats('Mi Mi- Mi-- Mi---')).toEqual([1, 2, 3, 4]);
    expect(beats('Rê/ Mi/ Fa// Sol//')).toEqual([0.5, 0.5, 0.25, 0.25]);
    expect(beats('Mi. Mi-. Mi/. Mi//.')).toEqual([1.5, 3, 0.75, 0.375]);
    expect(beats("Đô'- Sol,/ Fa#--")).toEqual([2, 0.5, 3]);
  });
  it('iPad đổi "--" thành "—", "-" thành "–": vẫn hiểu', () => {
    expect(beats('Mi— Mi– Mi—-')).toEqual([3, 2, 4]);
  });
  it('dấu lặng "_" dùng cùng hậu tố', () => {
    const r = P('Đô _ Mi _- Sol _/ La/');
    expect(r.notes.map((n) => (n.rest ? `_${n.beats}` : n.pitch))).toEqual(['C4', '_1', 'E4', '_2', 'G4', '_0.5', 'A4']);
    expect(r.errors).toEqual([]);
  });
});

describe('Gõ chữ — vạch nhịp, câu, lấy đà', () => {
  it('vạch nhịp không bắt buộc; có thì kiểm tra đủ phách (nhắc nhở, không chặn)', () => {
    expect(P('Đô Rê Mi Fa | Sol- Sol-').warnings).toEqual([]);
    const r = P('Đô Rê Mi | Sol- Sol- | Mi Mi Mi Mi');
    expect(r.errors).toEqual([]);
    // ô đầu 3 phách = lấy đà (thêm lặng 1 phách ở đầu) — không cảnh báo
    expect(r.pickupRest).toBe(1);
    expect(P('Đô Rê Mi Fa | Sol- Sol | Mi Mi Mi Mi').warnings.map((w) => w.message)).toEqual([
      'Ô nhịp 2 có 3 phách — nhịp 4/4 cần 4 phách',
    ]);
    expect(P('Đô Rê Mi Fa Sol | La- Sol-', 4).warnings[0].message).toContain('Ô nhịp 1 có 5 phách');
  });
  it('vạch nhịp dính liền nốt, vạch kép, nhịp 3/4 và 2/4', () => {
    expect(pitches('Đô Rê|Mi Fa||Sol-', 2)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4']);
    expect(P('Đô Rê Mi | Fa Sol La | Si--', 3).warnings).toEqual([]);
    expect(P('Đô/ Rê/ Mi | Fa- | Sol', 2).warnings).toEqual([]);
  });
  it('xuống dòng mà quên "|" cuối dòng: không cảnh báo nếu đủ số ô tròn', () => {
    expect(P('Đô Đô Sol Sol | La La Sol- | Fa Fa Mi Mi | Rê Rê Đô-\nSol Sol Fa Fa | Mi Mi Rê-').warnings).toEqual([]);
    expect(P('Đô Đô Sol Sol | La La Sol- | Fa Fa Mi\nSol Sol Fa Fa | Mi Mi Rê-').warnings).toHaveLength(1);
  });
  it('mỗi dòng là một câu (ô nhịp bắt đầu câu)', () => {
    const r = P('Đô Rê Mi Đô | Đô Rê Mi Đô\nMi Fa Sol- | Mi Fa Sol-\nSol/ La/ Sol/ Fa/ Mi Đô');
    expect(r.phrases).toEqual([0, 2, 4]);
    expect(P('Đô Rê Mi Fa').phrases).toEqual([]); // một dòng → không chia câu
  });
  it('câu tính cả nhịp lấy đà', () => {
    const r = P('Sol, | Đô Đô Đô Rê | Mi--\nMi | Rê Rê Rê Mi | Đô--');
    expect(r.pickupRest).toBe(3);
    expect(r.phrases).toEqual([0, 2]);
  });
  it('không có vạch nhịp: nốt vắt qua vạch → nhắc tách nốt', () => {
    const r = P('Đô Rê Mi Fa- Sol--');
    expect(r.warnings.map((w) => w.token)).toEqual(['Fa-']);
    expect(r.warnings[0].message).toContain('vắt qua vạch nhịp');
  });
  it('gõ dấu phẩy để ngăn cách → nhắc "," là quãng thấp; dấu phẩy đứng riêng bỏ qua', () => {
    expect(P('Đô, Rê, Mi, Fa, Sol').warnings.some((w) => w.message.includes('THẤP'))).toBe(true);
    // bài thật nhiều nốt thấp (có dấu phẩy giữa chữ: "Sol,/.") → không nhắc
    expect(P('Sol,/. Sol,// | La, Sol, Đô | Si,- Sol,/. Sol,// | La, Sol, Rê | Đô-', 3).warnings).toEqual([]);
    expect(pitches('Đô , Rê ; Mi')).toEqual(['C4', 'D4', 'E4']);
  });
});

describe('Gõ chữ — báo lỗi rõ ràng (có dòng & từ)', () => {
  const err = (text: string) => P(text).errors;
  it('chữ lạ', () => {
    const e = err('Đô Rê\nMi Hô Fa');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ line: 2, word: 2, token: 'Hô' });
    expect(e[0].message).toContain('Không hiểu');
    // vẫn đọc được các nốt còn lại để xem trước
    expect(P('Đô Rê\nMi Hô Fa').notes).toHaveLength(4);
  });
  it('thăng/giáng không có phím riêng: Mi# Si# Đôb Fab', () => {
    expect(err('Mi#')[0].message).toContain('trùng phím Fa');
    expect(err('Si#')[0].message).toContain('trùng phím Đô');
    expect(err('Đôb')[0].message).toContain('trùng phím Si');
    expect(err('Fab')[0].message).toContain('trùng phím Mi');
  });
  it('ngoài dải Đô3–Đô6', () => {
    expect(err("Rê''")[0].message).toContain('ngoài dải');
    expect(err('Si,,')[0].message).toContain('ngoài dải');
    expect(err('Sol2')[0].message).toContain('ngoài dải');
    expect(err("Đô''").length).toBe(0); // Đô6 vẫn được
  });
  it('độ dài sai / không ghi được', () => {
    expect(err('Mi-/')[0].message).toContain('không dùng cả');
    expect(err('Mi///')[0].message).toContain('ngắn nhất');
    expect(err('Mi..')[0].message).toContain('một dấu chấm');
    expect(err('Mi----')[0].message).toContain('5 phách không ghi được');
    expect(err('Mi--.')[0].message).toContain('4,5 phách');
  });
  it('thứ tự ký hiệu sai', () => {
    expect(err("Đô-'")[0].message).toContain("dấu ' hoặc ,");
    expect(err('Sol-3')[0].message).toContain('số quãng tám');
    expect(err('Mi##')[0].message).toContain('Hai dấu');
    expect(err('Mi!')[0].message).toContain('không hiểu ký tự');
    expect(typeof parseToken('b4')).toBe('string'); // "b" thường không phải tên nốt
  });
  it('văn bản trống → không nốt, không lỗi', () => {
    expect(P('  \n \n')).toMatchObject({ notes: [], errors: [], warnings: [] });
  });
});

describe('Nốt → chữ (đổi chế độ, sửa bài cũ) và đọc lại khớp', () => {
  it('hậu tố độ dài', () => {
    expect([1, 2, 3, 4, 0.5, 0.25, 1.5, 3, 0.75, 6].map(durationSuffix)).toEqual(['', '-', '--', '---', '/', '//', '.', '--', '/.', '---.']);
    expect(() => durationSuffix(5)).toThrow();
  });
  it('một nốt', () => {
    expect(noteToSolfege({ pitch: 'F#5', beats: 2 })).toBe("Fa#'-");
    expect(noteToSolfege({ pitch: 'Bb3', beats: 0.5 })).toBe('Sib,/');
    expect(noteToSolfege({ rest: true, beats: 1.5 })).toBe('_.');
    expect(noteToSolfege({ pitch: 'C6', beats: 1 })).toBe("Đô''");
  });
  it('cả bài: vạch nhịp, xuống dòng theo câu, đọc lại ra đúng nốt', () => {
    const src = 'Đô Đô Sol Sol | La La Sol- | Fa Fa Mi Mi | Rê Rê Đô-\nSol Sol Fa Fa | Mi Mi Rê-';
    const r = P(src);
    const text = notesToSolfege(r.notes, 4, r.phrases);
    expect(text).toBe(src);
    const again = P(text);
    expect(again.notes).toEqual(r.notes);
    expect(again.phrases).toEqual(r.phrases);
  });
  it('không có câu → xuống dòng mỗi 4 ô', () => {
    const notes = Array.from({ length: 24 }, () => ({ pitch: 'C4', beats: 1 }));
    expect(notesToSolfege(notes, 3).split('\n')).toHaveLength(2);
  });
});

describe('Thêm dấu lặng cho tròn ô nhịp', () => {
  it('lấy đà ở đầu + ô cuối thiếu', () => {
    const out = padToBars([{ pitch: 'G4', beats: 1 }, { pitch: 'C5', beats: 2.5 }], 4, 3);
    expect(out.map((n) => (n.rest ? `_${n.beats}` : n.beats))).toEqual(['_3', 1, 2.5, '_1.5']);
    expect(out.reduce((s, n) => s + n.beats, 0) % 4).toBe(0);
  });
});

describe('Tự ghi số ngón (autoFinger)', () => {
  const fing = (ps: string[], hand: 'RH' | 'LH' = 'RH') => autoFinger(ps.map((pitch) => ({ pitch, beats: 1 })), hand);
  it('thế 5 ngón Đô: 1-2-3-4-5 và đi xuống 5-4-3-2-1', () => {
    expect(fing(['C4', 'D4', 'E4', 'F4', 'G4'])).toEqual([1, 2, 3, 4, 5]);
    expect(fing(['G4', 'F4', 'E4', 'D4', 'C4'])).toEqual([5, 4, 3, 2, 1]);
  });
  it('Bài ca niềm vui đứng yên trong thế tay (Mi = 3)', () => {
    expect(fing(['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4'])).toEqual([3, 3, 4, 5, 5, 4, 3, 2, 1, 1, 2, 3]);
  });
  it('Ngôi sao nhỏ: Sol–La = 4-5 (như quy tắc tuần 7), không lặp ngón 5', () => {
    const f = fing(['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4']);
    expect(f.slice(2)).toEqual([4, 4, 5, 5, 4]);
    expect(f[0]).toBe(1);
  });
  it('gam Đô trưởng: luồn ngón cái 1-2-3-1-2-3-4-5, đi xuống 5-4-3-2-1-3-2-1', () => {
    expect(fing(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'])).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    expect(fing(['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'])).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
  });
  it('tay trái (gương): Đô3→Sol3 = 5-4-3-2-1', () => {
    expect(fing(['C3', 'D3', 'E3', 'F3', 'G3'], 'LH')).toEqual([5, 4, 3, 2, 1]);
  });
  it('dấu lặng không có ngón; mọi nốt có ngón 1–5; hai phím gần nhau liền nhau không cùng ngón', () => {
    const notes = [
      { pitch: 'E4', beats: 1 },
      { rest: true, beats: 1 },
      { pitch: 'G4', beats: 0.5 },
      { pitch: 'A4', beats: 0.5 },
      { pitch: 'Bb4', beats: 1 },
      { pitch: 'C5', beats: 1 },
      { pitch: 'D5', beats: 1 },
      { pitch: 'F#4', beats: 1 },
      { pitch: 'G4', beats: 1 },
      { pitch: 'C6', beats: 2 },
      { pitch: 'C3', beats: 2 },
    ];
    const f = autoFinger(notes);
    expect(f[1]).toBeUndefined();
    const played = notes.map((n, i) => [n, f[i], i > 0 && !!notes[i - 1].rest] as const).filter(([n]) => !n.rest);
    for (const [, x] of played) expect(x).toBeGreaterThanOrEqual(1), expect(x).toBeLessThanOrEqual(5);
    for (let i = 1; i < played.length; i++) {
      const [a, fa] = played[i - 1];
      const [b, fb, afterRest] = played[i];
      if (a.pitch !== b.pitch && a.beats < 2 && !afterRest && Math.abs(whitePos(a.pitch!) - whitePos(b.pitch!)) < 7) expect(fa, `${a.pitch}→${b.pitch}`).not.toBe(fb);
    }
  });
  it('bài trống / chỉ dấu lặng', () => {
    expect(autoFinger([])).toEqual([]);
    expect(autoFinger([{ rest: true, beats: 4 }])).toEqual([undefined]);
  });
  it('vị trí phím trắng và độ khó', () => {
    expect(whitePos('C4') + 1).toBe(whitePos('D4'));
    expect(whitePos('C#4')).toBe(whitePos('C4') + 0.5);
    expect(transitionCost('C4', 1, 'D4', 2, 'RH')).toBe(0);
    expect(transitionCost('C4', 1, 'D4', 1, 'RH')).toBeGreaterThan(5);
    expect(transitionCost('C4', 3, 'D4', 2, 'RH')).toBeGreaterThan(20); // bắt chéo vô lý
  });
  it('đoán tay', () => {
    expect(guessHand([{ pitch: 'C3', beats: 1 }, { pitch: 'G3', beats: 1 }])).toBe('LH');
    expect(guessHand([{ pitch: 'G3', beats: 1 }, { pitch: 'E4', beats: 1 }])).toBe('RH');
  });
});

const TWINKLE = 'Đô Đô Sol Sol | La La Sol- | Fa Fa Mi Mi | Rê Rê Đô-\nSol Sol Fa Fa | Mi Mi Rê- | Sol Sol Fa Fa | Mi Mi Rê-';

describe('Bài bố mẹ thêm → bài hát (Tune)', () => {
  it('lưu: tự ghi ngón, tròn ô nhịp, hợp lệ như mọi bài hát (thế tay "free")', () => {
    const r = P(TWINKLE);
    const s = buildParentSong(r.notes, { id: 'a', title: '  Sao nhỏ  ', createdAt: 1, timeSignature: '4/4', bpm: 72, phrases: r.phrases, text: TWINKLE });
    expect(s.title).toBe('Sao nhỏ');
    expect(s.notes.every((n) => n.rest || (n.finger! >= 1 && n.finger! <= 5))).toBe(true);
    const t = parentSongToTune(s);
    expect(t.id).toBe(`${PARENT_PREFIX}a`);
    expect(t.position).toBe('free');
    expect(t.hand).toBe('RH');
    expect(validateTune(t)).toEqual([]);
    expect(measureCount(t)).toBe(8);
    expect(phraseRanges(t)).toEqual([
      [0, 4],
      [4, 8],
    ]);
  });
  it('bài lấy đà + ô cuối thiếu, nhịp 3/4 và 2/4 vẫn hợp lệ', () => {
    for (const [text, ts] of [
      ['Sol, | Đô Đô Rê | Mi--', '3/4'],
      ['Đô/ Rê/ Mi | Fa- | Sol// La// Si/ Đô\'', '2/4'],
      ['Mi Rê Đô', '4/4'],
    ] as const) {
      const r = P(text, Number(ts[0]));
      expect(r.errors).toEqual([]);
      const t = parentSongToTune(buildParentSong(r.notes, { id: 'x', title: 't', createdAt: 1, timeSignature: ts, bpm: 60, pickupRest: r.pickupRest }));
      expect(validateTune(t), text).toEqual([]);
      expect(totalBeats(t) % Number(ts[0])).toBe(0);
    }
  });
  it('bài thấp → tay trái', () => {
    const r = P('Đô, Rê, Mi, Fa, | Sol,---');
    const t = parentSongToTune(buildParentSong(r.notes, { id: 'l', title: 'L', createdAt: 1, timeSignature: '4/4', bpm: 60 }));
    expect(t.hand).toBe('LH');
    expect(t.notes.filter((n) => n.pitch).map((n) => n.finger)).toEqual([5, 4, 3, 2, 1]);
    expect(validateTune(t)).toEqual([]);
  });
  it('id mới không trùng', () => {
    const id = newParentSongId([], 100);
    expect(newParentSongId([{ id }], 100)).not.toBe(id);
  });
});

describe('store — bài bố mẹ thêm (thêm / sửa / xóa / danh sách) + sao lưu', () => {
  const mk = (id: string, title = 'Bài'): ParentSong =>
    buildParentSong(P('Đô Rê Mi Fa | Sol---').notes, { id, title, createdAt: 5, timeSignature: '4/4', bpm: 60 });
  it('CRUD', () => {
    const store = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 6, 20));
    expect(store.parentSongs()).toEqual([]);
    store.addParentSong(mk('a', 'Bài A'));
    store.addParentSong(mk('b', 'Bài B'));
    expect(store.parentSongs().map((x) => x.title)).toEqual(['Bài A', 'Bài B']);
    expect(store.updateParentSong('a', { title: 'Bài A (sửa)', bpm: 72 })).toBe(true);
    const a = store.findParentSong('a')!;
    expect(a).toMatchObject({ title: 'Bài A (sửa)', bpm: 72, createdAt: 5 });
    expect(a.updatedAt).toBe(new Date(2026, 9, 6, 20).getTime());
    expect(store.updateParentSong('zz', { title: 'x' })).toBe(false);
    // thêm lại cùng id = thay
    store.addParentSong(mk('b', 'Bài B2'));
    expect(store.parentSongs()).toHaveLength(2);
    expect(store.deleteParentSong('a')).toBe(true);
    expect(store.deleteParentSong('a')).toBe(false);
    expect(store.parentSongs().map((x) => x.id)).toEqual(['b']);
  });
  it('bản sao trong store không bị sửa từ bên ngoài', () => {
    const store = new ProgressStore(new MemoryStorage());
    const s = mk('a');
    store.addParentSong(s);
    s.notes[0].beats = 99;
    expect(store.findParentSong('a')!.notes[0].beats).toBe(1);
  });
  it('lưu bền (mở lại app) và đi theo bản sao lưu JSON', () => {
    const kv = new MemoryStorage();
    const store = new ProgressStore(kv);
    store.addParentSong({ ...mk('a'), text: 'Đô Rê Mi Fa | Sol---', phrases: [0, 1] });
    expect(new ProgressStore(kv).findParentSong('a')?.text).toBe('Đô Rê Mi Fa | Sol---');
    const json = store.exportJSON();
    expect(JSON.parse(json).parentSongs).toHaveLength(1);
    const other = new ProgressStore(new MemoryStorage());
    expect(other.importJSON(json)).toEqual({ ok: true });
    expect(other.parentSongs()).toHaveLength(1);
    expect(other.findParentSong('a')?.phrases).toEqual([0, 1]);
  });
  it('kiểm tra cấu trúc parentSongs', () => {
    const d = defaultData();
    const good = mk('a');
    expect(validateAppData({ ...d, parentSongs: [good] })).toEqual([]);
    expect(validateAppData({ ...d, parentSongs: 'x' })).toContain('parentSongs');
    const bad: Array<Record<string, unknown>> = [
      { ...good, id: '' },
      { ...good, timeSignature: '6/8' },
      { ...good, bpm: 0 },
      { ...good, notes: [] },
      { ...good, notes: [{ pitch: 'H4', beats: 1 }] },
      { ...good, notes: [{ beats: 1 }] },
      { ...good, notes: [{ pitch: 'C4', beats: 0 }] },
      { ...good, notes: [{ pitch: 'C4', beats: 1, finger: 6 }] },
      { ...good, lh: 'x' },
      { ...good, position: 'C' },
      { ...good, phrases: [0, -1] },
      { ...good, text: 5 },
      { ...good, title: undefined },
    ];
    for (const b of bad) expect(validateAppData({ ...d, parentSongs: [b] }), JSON.stringify(b).slice(0, 80)).toContain('parentSongs[0]');
    expect(validateAppData({ ...d, parentSongs: [{ ...good, lh: [{ pitch: 'C3', beats: 4, finger: 5 }] }] })).toEqual([]);
  });
});

describe('Chế độ chạm phím (dùng lại trình soạn của trò Sáng tác)', () => {
  it('thêm nốt / dấu lặng, không giới hạn số ô nhịp, cắt cho vừa ô và làm tròn xuống độ dài ghi được', () => {
    let ns = addTapNote([], { pitch: 'C4', beats: 2 }, 4);
    ns = addTapNote(ns, { pitch: 'D4', beats: 0.75 }, 4);
    ns = addTapNote(ns, { pitch: 'E4', beats: 2 }, 4); // còn 1¼ phách → nốt đen (1)
    expect(ns.map((n) => n.beats)).toEqual([2, 0.75, 1]);
    ns = addTapNote(ns, { rest: true, beats: 1 }, 4); // còn ¼ → lặng ¼
    expect(ns[3]).toEqual({ rest: true, beats: 0.25 });
    for (let i = 0; i < 40; i++) ns = addTapNote(ns, { pitch: 'G4', beats: 1 }, 3);
    expect(ns.length).toBe(44);
  });
});

describe('Tên bài cho lượt chơi (màn Phụ huynh / Việc tối nay)', () => {
  it('bài bố mẹ thêm, bài đã xóa, bài bé sáng tác, bài thường', async () => {
    const { customTuneTitle } = await import('../src/practice/parentSongs');
    const s = buildParentSong([{ pitch: 'C4', beats: 4 }], { id: 'p1', title: 'Bài A', createdAt: 1, timeSignature: '4/4', bpm: 60 });
    const data = { parentSongs: [s], compositions: [{ id: 'c1', title: 'Của con', createdAt: 1, timeSignature: '4/4' as const, notes: [] }] };
    expect(customTuneTitle('parent-p1', data)).toBe('📝 Bài A');
    expect(customTuneTitle('parent-zz', data)).toContain('đã xóa');
    expect(customTuneTitle('comp-c1', data)).toBe('Của con');
    expect(customTuneTitle('twinkle_easy', data)).toBeUndefined();
  });
});
