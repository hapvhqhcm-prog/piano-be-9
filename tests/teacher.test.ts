import { describe, expect, it } from 'vitest';
import {
  analyzeTempo,
  focusPlan,
  kindsPresent,
  outcomeOf,
  placeLabel,
  reviewUsable,
  slowerBpm,
  teach,
  waitOutcome,
  wordCount,
  type NoteReview,
  type RunReview,
  type TeacherPoint,
} from '../src/music/teacher';
import * as teacherMod from '../src/music/teacher';
import { gradeTiming, TIMING_WINDOWS } from '../src/music/timing';
import { pitchToMidi } from '../src/piano/pitchTable';

const M = (p: string) => pitchToMidi(p);

/** Bài giả: mỗi ô 4 nốt đen (4/4), `n` ô; nốt `pitch`, ngón `finger` */
function run(
  measures: number,
  kinds: Record<number, Partial<NoteReview>> = {},
  o: Partial<RunReview> & { pitches?: string[]; beats?: number[] } = {},
): RunReview {
  const notes: NoteReview[] = [];
  let beat = 0;
  let i = 0;
  while (beat < measures * 4 - 1e-9) {
    const b = o.beats?.[i] ?? 1;
    const pitch = o.pitches?.[i % (o.pitches?.length ?? 1)] ?? 'E4';
    notes.push({
      notes: [{ index: i, hand: 'RH', midi: [M(pitch)], beats: b, finger: { C4: 1, D4: 2, E4: 3, F4: 4, G4: 5 }[pitch] }],
      start: beat,
      measure: Math.floor(beat / 4),
      kind: 'ok',
      ...kinds[i],
    });
    beat += b;
    i++;
  }
  return {
    mode: o.mode ?? 'wait',
    notes,
    beatsPerMeasure: 4,
    phrases: o.phrases ?? (measures > 4 ? [[0, 4], [4, measures]] : [[0, measures]]),
    measureOffset: o.measureOffset ?? 0,
    hints: o.hints ?? 'names',
  };
}

describe('teacher — chọn MỘT lời nhắn chính', () => {
  it('Đúng hết → khen cụ thể (số nốt / đều nhịp), không có chỗ luyện', () => {
    const p = teach(run(8))!;
    expect(p.rule).toBe('perfect');
    expect(p.praise).toBe(true);
    expect(p.focus).toBeNull();
    expect(p.text).toContain('32 nốt');
    expect(teach(run(8, {}, { mode: 'tempo' }))!.text).toContain('đều nhịp');
  });

  it('Gần hoàn hảo (một lỗi lẻ) → khen + chỉ đúng ô', () => {
    const p = teach(run(8, { 21: { kind: 'wrong', played: M('D4') } }))!;
    expect(p.rule).toBe('near');
    expect(p.praise).toBe(true);
    expect(p.text).toContain('ô 6');
    expect(p.focus).toEqual([4, 8]);
  });

  it('Nhầm cùng một cặp nốt ≥ 2 lần → "Nốt Fa hay bị nhầm thành Mi — ngón 4"', () => {
    const r = run(
      8,
      { 2: { kind: 'wrong', played: M('E4') }, 6: { kind: 'wrong', played: M('E4') }, 20: { kind: 'wrong', played: M('E4') } },
      { pitches: ['C4', 'D4', 'F4', 'G4'] },
    );
    const p = teach(r)!;
    expect(p.rule).toBe('confusion');
    expect(p.text).toBe('Nốt Fa hay bị nhầm thành Mi — ngón 4 nhé!');
    expect(p.focus).toEqual([0, 4]); // câu 1 có 2 lần, câu 2 có 1 lần
    expect(p.praise).toBe(false);
  });

  it('Nhầm nốt lung tung (không lặp cặp) → "Câu N còn nhầm vài nốt" theo mức gợi ý', () => {
    const k = { 17: { kind: 'wrong' as const, played: M('C4') }, 18: { kind: 'wrong' as const, played: M('G4') }, 22: { kind: 'wrong' as const } };
    const p = teach(run(8, k, { pitches: ['C4', 'D4', 'E4', 'F4'] }))!;
    expect(p.rule).toBe('wrongs');
    expect(p.text).toBe('Câu 2 còn nhầm vài nốt — đọc tên nốt rồi đàn nhé!');
    expect(teach(run(8, k, { pitches: ['C4', 'D4', 'E4', 'F4'], hints: 'staff' }))!.text).toContain('nốt trên khuông');
  });

  it('Theo nhịp: vội ở câu 2 → "Câu 2 con hơi vội — đếm 1-2-3-4"', () => {
    const k: Record<number, Partial<NoteReview>> = {
      17: { kind: 'early', offset: -0.7 },
      18: { kind: 'early', offset: -0.6 },
      21: { kind: 'ok', offset: -0.4 },
      2: { kind: 'missed' },
    };
    const p = teach(run(8, k, { mode: 'tempo' }))!;
    expect(p.rule).toBe('rush');
    expect(p.text).toBe('Câu 2 con hơi vội — đếm 1-2-3-4 rồi đàn lại nhé!');
    expect(p.focus).toEqual([4, 8]);
  });

  it('Theo nhịp: chậm → "hơi chậm — nghe tiếng tích"', () => {
    const p = teach(run(8, { 1: { kind: 'late', offset: 0.8 }, 2: { kind: 'late', offset: 0.9 }, 3: { kind: 'ok', offset: 0.5 } }, { mode: 'tempo' }))!;
    expect(p.rule).toBe('drag');
    expect(p.text).toContain('Câu 1 con hơi chậm');
  });

  it('Sớm ngay SAU nốt trắng → "Giữ đủ nốt trắng 2 phách"', () => {
    // ô: trắng(2) đen đen | … ; nốt sau nốt trắng vào sớm
    const beats = Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? 2 : 1));
    const p = teach(run(8, { 1: { kind: 'early', offset: -0.7 }, 4: { kind: 'early', offset: -0.8 }, 10: { kind: 'ok', offset: -0.5 } }, { mode: 'tempo', beats }))!;
    expect(p.rule).toBe('hold');
    expect(p.text).toBe('Giữ đủ nốt trắng 2 phách — đếm thầm 1-2 nhé!');
  });

  it('Sót nốt → "Câu N còn sót k nốt"', () => {
    const p = teach(run(8, { 5: { kind: 'missed' }, 6: { kind: 'missed' }, 7: { kind: 'missed' }, 30: { kind: 'wrong' } }, { mode: 'tempo' }))!;
    expect(p.rule).toBe('missed');
    expect(p.text).toBe('Câu 1 còn sót 3 nốt — mình đàn chậm chỗ này nhé!');
  });

  it('Hai tay: một tay sót, tay kia đúng → "Tay trái chưa vào cùng tay phải ở ô 3"', () => {
    const r = run(8);
    const lhAt = (i: number): NoteReview => ({
      ...r.notes[i],
      notes: [...r.notes[i].notes, { index: 100 + i, hand: 'LH', midi: [M('C3')], beats: 4 }],
      hands: { RH: { kind: 'ok' }, LH: { kind: 'missed' } },
    });
    r.notes[8] = lhAt(8);
    r.notes[12] = lhAt(12);
    r.notes[9] = { ...r.notes[9], kind: 'wrong' };
    const p = teach(r)!;
    expect(p.rule).toBe('hands');
    expect(p.text).toBe('Tay trái chưa vào cùng tay phải ở ô 3 — đàn cùng lúc nhé!');
    // Màu theo tay
    expect(outcomeOf(r.notes[8], 'LH').kind).toBe('missed');
    expect(outcomeOf(r.notes[8], 'RH').kind).toBe('ok');
    expect(kindsPresent(r)).toEqual(['ok', 'wrong', 'missed']);
  });

  it('Bằng số lần → theo thứ tự ưu tiên (hai tay trước nhầm nốt)', () => {
    const r = run(8, { 1: { kind: 'wrong' }, 20: { kind: 'wrong' } });
    r.notes[4] = { ...r.notes[4], hands: { RH: { kind: 'ok' }, LH: { kind: 'missed' } } };
    r.notes[6] = { ...r.notes[6], hands: { RH: { kind: 'missed' }, LH: { kind: 'ok' } } };
    expect(teach(r)!.rule).toBe('hands');
  });

  it('Lượt trước nhắc câu 2, lượt này câu 2 sạch → khen tiến bộ', () => {
    const prev: TeacherPoint = { rule: 'rush', text: '', praise: false, focus: [4, 8] };
    const p = teach(run(8), prev)!;
    expect(p.rule).toBe('improved');
    expect(p.text).toBe('Câu 2 lần này sạch rồi — con tiến bộ thật!');
    expect(teach(run(8), { ...prev, praise: true })!.rule).toBe('perfect');
  });

  it('Lượt một câu: chỗ luyện thu lại 2 ô, gọi số ô theo CẢ BÀI', () => {
    const r = run(4, { 9: { kind: 'missed' }, 10: { kind: 'missed' }, 11: { kind: 'wrong' } }, { measureOffset: 4, mode: 'tempo' });
    const p = teach(r)!;
    expect(p.focus).toEqual([2, 4]);
    expect(p.text).toBe('Ô 7–8 còn sót 2 nốt — mình đàn chậm chỗ này nhé!');
    expect(placeLabel(r, [1, 2])).toBe('Ô 6');
  });

  it('Toàn bố mẹ bấm "tiếp" → không nhận xét', () => {
    const r = run(4, Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i, { kind: 'helped' as const }])));
    expect(reviewUsable(r)).toBe(false);
    expect(teach(r)).toBeNull();
  });

  it('Mọi lời nhắn ≤ 15 chữ và không chê', () => {
    const cases: RunReview[] = [
      run(8),
      run(8, {}, { mode: 'tempo' }),
      run(8, { 3: { kind: 'wrong' } }),
      run(8, { 2: { kind: 'wrong', played: M('D4') }, 6: { kind: 'wrong', played: M('D4') } }, { pitches: ['C4', 'D4', 'F4', 'G4'] }),
      run(8, { 1: { kind: 'wrong' }, 2: { kind: 'wrong' }, 3: { kind: 'wrong' } }, { hints: 'staff' }),
      run(8, { 1: { kind: 'early' }, 2: { kind: 'early' }, 3: { kind: 'early' } }, { mode: 'tempo' }),
      run(8, { 1: { kind: 'late' }, 2: { kind: 'late' }, 3: { kind: 'late' } }, { mode: 'tempo' }),
      run(8, { 1: { kind: 'missed' }, 2: { kind: 'missed' }, 3: { kind: 'missed' } }, { mode: 'tempo' }),
      run(2, { 1: { kind: 'missed' }, 2: { kind: 'missed' } }, { mode: 'tempo', measureOffset: 10 }),
      run(8, { 1: { kind: 'early' }, 4: { kind: 'early' } }, { mode: 'tempo', beats: Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? 2 : 1)) }),
    ];
    for (const r of cases) {
      const p = teach(r)!;
      expect(p, JSON.stringify(r.notes.filter((n) => n.kind !== 'ok'))).not.toBeNull();
      expect(wordCount(p.text), p.text).toBeLessThanOrEqual(15);
      expect(p.text).not.toMatch(/sai|kém|tệ|dở/i);
    }
  });
});

describe('teacher — dữ liệu từng nốt', () => {
  it('Chế độ chờ: đúng ngay / nhầm (ghi nốt đàn nhầm) / bố mẹ cho qua / thiếu tay', () => {
    expect(waitOutcome({ wrong: 0, via: 'mic' }, ['RH'])).toEqual({ kind: 'ok', wrongTries: 0 });
    expect(waitOutcome({ wrong: 2, played: 64, via: 'tap' }, ['RH'])).toEqual({ kind: 'wrong', wrongTries: 2, played: 64 });
    expect(waitOutcome({ wrong: 1, via: 'parent' }, ['RH']).kind).toBe('helped');
    expect(waitOutcome(undefined, ['RH']).kind).toBe('helped');
    const two = waitOutcome({ wrong: 0, via: 'mic', missingHands: ['LH'] }, ['RH', 'LH']);
    expect(two.kind).toBe('ok');
    expect(two.hands).toEqual({ RH: { kind: 'ok' }, LH: { kind: 'missed' } });
    // Thiếu cả hai tay → không phải lỗi "một tay"
    expect(waitOutcome({ wrong: 0, via: 'mic', missingHands: ['LH', 'RH'] }, ['RH', 'LH']).hands).toBeUndefined();
  });

  it('Theo nhịp: trúng / sớm / muộn ngoài cửa sổ / nhầm nốt (ghi nốt nghe được) / sót', () => {
    const win = TIMING_WINDOWS.easy;
    const notes = [0, 1, 2, 3, 4].map((b) => ({ index: b, start: b, midi: [64] }));
    notes[4] = { index: 4, start: 4, midi: [67] };
    const heard = [
      { beat: 0.1, midi: 64 }, // nốt 0 trúng
      { beat: 0.3, midi: 64 }, // (thừa — đã có nốt 0 dùng lần nghe gần hơn; nốt 1 cách 0.7 sớm → sớm)
      { beat: 2.9, midi: 64 }, // nốt 2: muộn 0.9 — nhưng nốt 3 gần hơn (−0.1) → nốt 3 trúng
      { beat: 4.05, midi: 65 }, // nốt 4: nhầm Fa thay Sol
    ];
    const v = gradeTiming(notes, heard, win.early, win.late);
    const a = analyzeTempo(notes, heard, v, win);
    expect(a[0]).toEqual({ kind: 'ok', offset: expect.closeTo(0.1, 6) });
    expect(a[1].kind).toBe('early');
    expect(a[1].offset).toBeCloseTo(-0.7, 6);
    expect(a[2].kind).toBe('missed');
    expect(a[3].kind).toBe('ok');
    expect(a[4]).toEqual({ kind: 'wrong', played: 65 });
  });

  it('Theo nhịp: đúng nốt nhưng muộn quá cửa sổ → muộn', () => {
    const win = TIMING_WINDOWS.normal;
    const notes = [{ index: 0, start: 0, midi: [60] }, { index: 1, start: 2, midi: [62] }];
    const heard = [{ beat: 0.9, midi: 60 }, { beat: 2, midi: 62 }];
    const a = analyzeTempo(notes, heard, gradeTiming(notes, heard, win.early, win.late), win);
    expect(a.map((x) => x.kind)).toEqual(['late', 'ok']);
  });
});

describe('🎯 Luyện ngay chỗ này — chậm trước, rồi đúng tốc độ', () => {
  it('Tốc độ chậm hơn một nấc', () => {
    expect(slowerBpm(60)).toBe(50);
    expect(slowerBpm(72)).toBe(60);
    expect(slowerBpm(64)).toBe(60);
    expect(slowerBpm(40)).toBe(30);
  });
  it('Theo nhịp: chậm → đúng tốc độ; Từng nốt: thầy đàn mẫu chậm → bé đàn', () => {
    expect(focusPlan('tempo', 60)).toEqual([
      { kind: 'play', mode: 'tempo', bpm: 50 },
      { kind: 'play', mode: 'tempo', bpm: 60 },
    ]);
    expect(focusPlan('wait', 60)).toEqual([
      { kind: 'demo', mode: 'wait', bpm: 50 },
      { kind: 'play', mode: 'wait', bpm: 60 },
    ]);
  });
});

describe('teacher — kết quả riêng từng tay (bộ chấm hai tay)', () => {
  it('handsOutcome: hit/miss/wrong → đúng/sót/nhầm; không kết luận → undefined', () => {
    const { handsOutcome } = teacherMod;
    expect(handsOutcome({ conclusive: true, RH: { verdict: 'hit' }, LH: { verdict: 'miss' } })).toEqual({ RH: { kind: 'ok' }, LH: { kind: 'missed' } });
    expect(handsOutcome({ conclusive: true, LH: { verdict: 'wrong', heard: 50 } })).toEqual({ LH: { kind: 'wrong', played: 50 } });
    expect(handsOutcome({ conclusive: false, RH: { verdict: 'hit' } })).toBeUndefined();
    expect(handsOutcome(null)).toBeUndefined();
    // Sổ ghi chế độ chờ có kết quả từng tay → dùng luôn (thay cho "thiếu nốt")
    const w = waitOutcome({ wrong: 0, via: 'mic', missingHands: ['RH'], hands: { RH: { kind: 'ok' }, LH: { kind: 'wrong', played: 50 } } }, ['RH', 'LH']);
    expect(w.hands).toEqual({ RH: { kind: 'ok' }, LH: { kind: 'wrong', played: 50 } });
  });
});
