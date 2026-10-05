import { describe, expect, it } from 'vitest';
import {
  intervalChoices,
  intervalCode,
  intervalText,
  isCorrect,
  landmarkClef,
  landmarkName,
  makeQuestion,
  parseInterval,
} from '../src/practice/quiz';
import {
  BACKING_TOP,
  addNote,
  compositionToTune,
  endsHome,
  isBlackMidi,
  makeComposition,
  nextCompositionTitle,
  pentatonicBacking,
  positionNotes,
  questionNotes,
  tonicOf,
  undoNote,
  used,
} from '../src/practice/compose';
import { diatonic } from '../src/music/staff';
import { pitchToMidi } from '../src/piano/pitchTable';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import { validateAppData } from '../src/progress/schema';
import { validateTune, totalBeats } from '../src/music/tune';

/** RNG tất định (LCG) — test lặp lại y hệt mỗi lần chạy. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const C5 = ['C4', 'D4', 'E4', 'F4', 'G4'];

describe('quiz v5 — interval (đọc theo quãng)', () => {
  it('mã đáp án đúng theo bậc trên khuông', () => {
    expect(intervalCode('C4', 'C4')).toBe('same');
    expect(intervalCode('C4', 'D4')).toBe('step-up');
    expect(intervalCode('E4', 'D4')).toBe('step-down');
    expect(intervalCode('C4', 'E4')).toBe('skip-up');
    expect(intervalCode('G4', 'E4')).toBe('skip-down');
    expect(intervalCode('C4', 'F4')).toBe('4th-up');
    expect(intervalCode('G4', 'C4')).toBe('5th-down');
    expect(() => intervalCode('C4', 'A4')).toThrow();
    expect(parseInterval('skip-down')).toEqual({ kind: 'skip', dir: 'down' });
    expect(intervalText('step-up')).toContain('Bước');
  });

  it('lựa chọn: max 2 → 3 nút, max 3 → 5 nút, max 5 → 9 (màn hỏi 2 bước)', () => {
    expect(intervalChoices(2).map((c) => c.value)).toEqual(['same', 'step-up', 'step-down']);
    expect(intervalChoices(3)).toHaveLength(5);
    expect(intervalChoices(5)).toHaveLength(9);
  });

  it('sinh câu hỏi tất định, đúng quãng, không vượt maxInterval, có đủ các loại', () => {
    for (const max of [2, 3, 5] as const) {
      const rng = lcg(42 + max);
      const kinds = new Set<string>();
      for (let k = 0; k < 200; k++) {
        const q = makeQuestion({ variant: 'interval', pool: [...C5, 'A4', 'B4', 'C5'], rounds: 10, maxInterval: max }, rng);
        const [a, b] = q.pair!;
        expect(q.play).toEqual([a, b]);
        expect(Math.abs(diatonic(b) - diatonic(a))).toBeLessThan(max);
        expect(q.expected).toBe(intervalCode(a, b));
        expect(q.choices!.some((c) => c.value === q.expected)).toBe(true);
        expect(q.clef).toBe('treble');
        kinds.add(parseInterval(q.expected).kind);
      }
      expect(kinds.size).toBe(max);
    }
    // Cùng hạt giống → cùng chuỗi câu hỏi
    const a = makeQuestion({ variant: 'interval', pool: C5, rounds: 5 }, lcg(7));
    const b = makeQuestion({ variant: 'interval', pool: C5, rounds: 5 }, lcg(7));
    expect(a).toEqual(b);
  });

  it('khóa Fa khi spec.clef = bass', () => {
    const q = makeQuestion({ variant: 'interval', pool: ['C3', 'D3', 'E3', 'F3', 'G3'], rounds: 5, clef: 'bass' }, lcg(1));
    expect(q.clef).toBe('bass');
  });
});

describe('quiz v5 — landmark (nốt mốc)', () => {
  it('tên nốt mốc + nốt dòng kẻ phụ', () => {
    expect(landmarkName('C4').name).toBe('Đô giữa');
    expect(landmarkName('G4').name).toBe('Sol khóa Sol');
    expect(landmarkName('F3').name).toBe('Fa khóa Fa');
    expect(landmarkName('C5').name).toBe('Đô cao');
    expect(landmarkName('C3').name).toBe('Đô thấp');
    expect(landmarkName('A5').name).toContain('dòng kẻ phụ');
    expect(landmarkName('E4').name).toBe('Mi');
    expect(landmarkClef('C4')).toBe('treble');
    expect(landmarkClef('F3')).toBe('bass');
    expect(landmarkClef('C4', 'bass')).toBe('bass');
    expect(landmarkClef('G4', 'bass')).toBe('treble');
  });

  it('câu hỏi: đáp án là tên nốt, ≤ 4 lựa chọn xếp thấp → cao, chạm phím cũng đúng', () => {
    const rng = lcg(99);
    const pool = ['C3', 'F3', 'C4', 'G4', 'C5', 'A5'];
    const seen = new Set<string>();
    for (let k = 0; k < 100; k++) {
      const q = makeQuestion({ variant: 'landmark', pool, rounds: 5 }, rng);
      seen.add(q.expected);
      expect(pool).toContain(q.expected);
      expect(q.show).toBe(q.expected);
      expect(q.choices!.length).toBe(4);
      const ms = q.choices!.map((c) => pitchToMidi(c.value));
      expect([...ms].sort((x, y) => x - y)).toEqual(ms);
      expect(q.choices!.map((c) => c.value)).toContain(q.expected);
      expect(q.clef).toBe(pitchToMidi(q.expected) >= 60 ? 'treble' : 'bass');
      expect(isCorrect(q, q.expected)).toBe(true);
    }
    expect(seen.size).toBe(pool.length);
    const q = makeQuestion({ variant: 'landmark', pool: ['C4', 'G4'], rounds: 1 }, () => 0);
    expect(q.expected).toBe('C4');
    expect(isCorrect(q, 'C4')).toBe(true);
    expect(isCorrect(q, 'G4')).toBe(false);
  });
});

describe('sáng tạo — compose / đối đáp / phím đen', () => {
  it('thế tay → 5 nốt + nốt nhà', () => {
    expect(positionNotes('C').notes.map((n) => n.pitch)).toEqual(C5);
    expect(positionNotes('MC').hand).toBe('LH');
    expect(tonicOf('C')).toBe('C4');
    expect(tonicOf('G')).toBe('G4');
    expect(tonicOf('MC')).toBe('C4');
    expect(tonicOf('Am')).toBe('A3');
    expect(tonicOf('C5')).toBe('C5');
  });

  it('thêm nốt tự cắt vừa ô nhịp, đầy bài thì không thêm', () => {
    const o = { bars: 2, beatsPerBar: 4 };
    let n = addNote([], { pitch: 'C4', beats: 2 }, o)!;
    n = addNote(n, { pitch: 'D4', beats: 1 }, o)!;
    n = addNote(n, { pitch: 'E4', beats: 2 }, o)!; // chỉ còn 1 phách trong ô 1 → cắt còn 1
    expect(n.map((x) => x.beats)).toEqual([2, 1, 1]);
    for (let k = 0; k < 8; k++) n = addNote(n, { pitch: 'G4', beats: 0.5 }, o) ?? n;
    expect(used(n)).toBe(8);
    expect(addNote(n, { pitch: 'C4', beats: 1 }, o)).toBeNull();
    expect(undoNote(n)).toHaveLength(n.length - 1);
  });

  it('lưu bài: điền lặng cho đủ ô cuối, đổi được thành Tune hợp lệ', () => {
    const c = makeComposition(
      [
        { pitch: 'C4', beats: 1, finger: 1 },
        { pitch: 'E4', beats: 2, finger: 3 },
      ],
      { id: 'x', title: '  ', createdAt: 1 },
    );
    expect(c.title).toBe('Bài của con');
    expect(c.notes[c.notes.length - 1]).toEqual({ rest: true, beats: 1 });
    const t = compositionToTune(c);
    expect(t.id).toBe('comp-x');
    expect(t.week).toBeUndefined();
    expect(t.hand).toBe('RH');
    expect(totalBeats(t)).toBe(4);
    expect(validateTune(t)).toEqual([]);
    const lh = compositionToTune(makeComposition([{ pitch: 'F3', beats: 4 }], { id: 'y', title: 'L', createdAt: 1 }));
    expect(lh.hand).toBe('LH');
  });

  it('tên mặc định không trùng', () => {
    expect(nextCompositionTitle([])).toBe('Bài của con số 1');
    expect(nextCompositionTitle([{ title: 'Bài của con số 2' }])).toBe('Bài của con số 3');
  });

  it('câu hỏi đối đáp: 2 ô 4/4, KHÔNG kết ở nốt nhà; câu trả lời về nhà', () => {
    for (let k = 0; k < 4; k++) {
      for (const pos of ['C', 'G'] as const) {
        const q = questionNotes(pos, k);
        expect(used(q)).toBe(8);
        expect(endsHome(q.map((n) => pitchToMidi(n.pitch)), pos)).toBe(false);
      }
    }
    expect(endsHome([64, 62, 60])).toBe(true);
    expect(endsHome([64, 62, 72])).toBe(true); // Đô quãng tám khác vẫn là "về nhà"
    expect(endsHome([60, 62])).toBe(false);
    expect(endsHome([])).toBe(false);
    expect(endsHome([69, 71, 67], 'G')).toBe(true);
  });

  it('nền phím đen: chỉ nốt ngũ cung phím đen, thấp hơn dải bé đàn', () => {
    const b = pentatonicBacking(12);
    expect(b.length).toBeGreaterThan(40);
    for (const n of b) {
      expect(isBlackMidi(n.midi)).toBe(true);
      expect(n.midi).toBeLessThanOrEqual(BACKING_TOP);
      expect(n.vol).toBeLessThan(0.5);
    }
    expect(isBlackMidi(61)).toBe(true);
    expect(isBlackMidi(60)).toBe(false);
  });
});

describe('store — compositions', () => {
  it('addComposition lưu, thay theo id, qua được kiểm tra + xuất/nhập JSON', () => {
    const store = new ProgressStore(new MemoryStorage());
    expect(store.compositions()).toEqual([]);
    const c = makeComposition([{ pitch: 'C4', beats: 4, finger: 1 }], { id: 'a', title: 'Bài 1', createdAt: 5 });
    store.addComposition(c);
    store.addComposition({ ...c, title: 'Bài 1 (sửa)' });
    store.addComposition({ ...c, id: 'b' });
    expect(store.compositions().map((x) => x.title)).toEqual(['Bài 1 (sửa)', 'Bài 1']);
    expect(store.findComposition('b')?.id).toBe('b');
    expect(validateAppData(store.get())).toEqual([]);
    const other = new ProgressStore(new MemoryStorage());
    expect(other.importJSON(store.exportJSON())).toEqual({ ok: true });
    expect(other.compositions()).toHaveLength(2);
  });

  it('kiểm tra cấu trúc compositions', () => {
    const store = new ProgressStore(new MemoryStorage());
    const d = JSON.parse(store.exportJSON());
    expect(validateAppData({ ...d, compositions: 'x' })).toContain('compositions');
    expect(validateAppData({ ...d, compositions: [{ id: 'a', title: 't', createdAt: 1, timeSignature: '5/4', notes: [] }] })).toContain(
      'compositions[0]',
    );
    expect(
      validateAppData({ ...d, compositions: [{ id: 'a', title: 't', createdAt: 1, timeSignature: '4/4', notes: [{ pitch: 'H4', beats: 1 }] }] }),
    ).toContain('compositions[0]');
    expect(validateAppData({ ...d, compositions: [{ id: 'a', title: 't', createdAt: 1, timeSignature: '4/4', notes: [{ beats: 1 }] }] })).toContain(
      'compositions[0]',
    );
    expect(
      validateAppData({ ...d, compositions: [{ id: 'a', title: 't', createdAt: 1, timeSignature: '4/4', notes: [{ rest: true, beats: 1 }] }] }),
    ).toEqual([]);
  });
});
