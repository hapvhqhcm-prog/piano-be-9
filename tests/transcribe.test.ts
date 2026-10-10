import { describe, expect, it } from 'vitest';
import {
  cleanEvents,
  estimateBeat,
  layoutNotes,
  OnsetCollector,
  suggestHandPosition,
  toEditorText,
  transcribe,
} from '../src/music/transcribe';
import { parseSolfege, type SolfegeNote } from '../src/music/solfege';
import { buildParentSong } from '../src/practice/parentSongs';
import { expectedLayout, MELODIES, synthEvents } from './transcribeData';

/**
 * "🎙️ Đàn để thêm bài" — chép nhạc từ danh sách lần gõ TỔNG HỢP (tốc độ 60–120, lệch tay ±40 ms, nhịp lấy đà,
 * dấu lặng, nốt chấm dôi). Test tích hợp với đàn giả lập: tests/transcribeSim.test.ts.
 */

const same = (a: SolfegeNote[], b: SolfegeNote[]) => JSON.stringify(a) === JSON.stringify(b);
const fmt = (ns: SolfegeNote[]) => ns.map((n) => `${n.rest ? '_' : n.pitch}:${n.beats}`).join(' ');

describe('transcribe — có máy đếm nhịp', () => {
  for (const m of MELODIES) {
    for (const bpm of [60, 72, 96, 120]) {
      it(`${m.name} @${bpm}`, () => {
        for (const seed of [1, 2, 3]) {
          const spb = 60 / bpm;
          const ev = synthEvents(m, bpm, { seed, start: 2 });
          const tr = transcribe(ev, { timeSig: m.ts, metronome: { bpm, downbeat: 2 } });
          expect(tr.tempo).toBe('metronome');
          expect(tr.pickupRest).toBe(m.pickupRest);
          const got = layoutNotes(tr.seq, tr.pickupRest, Number(m.ts[0]));
          expect(fmt(got)).toBe(fmt(expectedLayout(m)));
          expect(spb).toBeGreaterThan(0);
        }
      });
    }
  }

  it('bé đàn đều trễ 150 ms so với tiếng tích → vẫn đúng lưới', () => {
    const m = MELODIES[2];
    const ev = synthEvents(m, 100, { start: 2.15, seed: 7 });
    const tr = transcribe(ev, { timeSig: m.ts, metronome: { bpm: 100, downbeat: 2 } });
    expect(fmt(layoutNotes(tr.seq, tr.pickupRest, 4))).toBe(fmt(expectedLayout(m)));
  });

  it('bắt đầu trong lúc đếm vào (nhịp lấy đà trước phách 1)', () => {
    const m = MELODIES[3]; // lấy đà 1 phách (3/4)
    // phách 1 của ô ĐẦU TIÊN đủ = downbeat → nốt lấy đà rơi vào phách 3 của ô đếm vào
    const ev = synthEvents(m, 72, { start: 2 - 3 * (60 / 72), seed: 3 });
    const tr = transcribe(ev, { timeSig: '3/4', metronome: { bpm: 72, downbeat: 2 } });
    expect(tr.pickupRest).toBe(2);
    expect(fmt(layoutNotes(tr.seq, tr.pickupRest, 3))).toBe(fmt(expectedLayout(m)));
  });
});

describe('transcribe — không có máy đếm nhịp (ước lượng tốc độ)', () => {
  const rows: string[] = [];
  let exact = 0;
  let total = 0;
  let tempoOk = 0;
  for (const m of MELODIES) {
    for (const bpm of [60, 72, 84, 96, 108, 120]) {
      it(`${m.name} @${bpm}`, () => {
        for (const seed of [11, 12]) {
          const ev = synthEvents(m, bpm, { seed });
          const tr = transcribe(ev, { timeSig: m.ts });
          const got = layoutNotes(tr.seq, tr.pickupRest, Number(m.ts[0]));
          const ok = same(got, expectedLayout(m));
          total++;
          if (ok) exact++;
          else rows.push(`${m.name} @${bpm} seed ${seed}: bpm≈${tr.bpm.toFixed(0)} lấy đà ${tr.pickupRest}\n  got ${fmt(got)}\n  exp ${fmt(expectedLayout(m))}`);
          // Tốc độ đúng (không gấp đôi / nửa) — bài ít nốt có thể nhập nhằng (bố mẹ có nút ×2 / ÷2)
          if (Math.abs(tr.bpm / bpm - 1) < 0.08) tempoOk++;
          expect(Math.abs(Math.log2(tr.bpm / bpm))).toBeLessThan(1.05);
        }
      });
    }
  }
  it('tổng kết: ≥ 85 % bài chép đúng hoàn toàn (cả nhịp lấy đà)', () => {
    if (rows.length) console.log(`Không máy đếm nhịp: ${exact}/${total} đúng hoàn toàn, tốc độ đúng ${tempoOk}/${total}\n${rows.join('\n')}`);
    else console.log(`Không máy đếm nhịp: ${exact}/${total} đúng hoàn toàn, tốc độ đúng ${tempoOk}/${total}`);
    expect(exact / total).toBeGreaterThanOrEqual(0.85);
    expect(tempoOk / total).toBeGreaterThanOrEqual(0.9);
  });

  it('chậm dần 12 % trong bài vẫn chép đúng', () => {
    for (const m of [MELODIES[0], MELODIES[2]]) {
      const ev = synthEvents(m, 96, { seed: 5, drift: 0.12 });
      const tr = transcribe(ev, { timeSig: m.ts });
      expect(fmt(layoutNotes(tr.seq, tr.pickupRest, 4))).toBe(fmt(expectedLayout(m)));
    }
  });

  it('estimateBeat: nốt đen đều 80 bpm', () => {
    const times = Array.from({ length: 12 }, (_, i) => 1 + i * 0.75);
    expect(60 / estimateBeat(times)).toBeCloseTo(80, 0);
  });
});

describe('transcribe — dọn dữ liệu & trường hợp biên', () => {
  it('rỗng → không nốt', () => {
    const tr = transcribe([], { timeSig: '4/4' });
    expect(tr.seq).toEqual([]);
    expect(toEditorText([], 0, 4)).toBe('');
  });
  it('một nốt → một nốt ngân hết ô', () => {
    const tr = transcribe([{ t: 1, midi: 60 }], { timeSig: '4/4' });
    expect(layoutNotes(tr.seq, tr.pickupRest, 4)).toEqual([{ pitch: 'C4', beats: 4 }]);
  });
  it('bỏ nốt ngoài dải và lần gõ trùng', () => {
    const r = cleanEvents([
      { t: 1, midi: 60 },
      { t: 1.03, midi: 60 },
      { t: 2, midi: 30 },
      { t: 3, midi: 64 },
    ]);
    expect(r.events.map((e) => e.midi)).toEqual([60, 64]);
    expect(r.dropped).toBe(2);
  });
  it('nốt vắt qua vạch nhịp bị cắt ở vạch, phần sau thành dấu lặng', () => {
    // 4/4: nốt ở phách 3 dài 3 phách
    const ns = layoutNotes([{ midi: 60, beats: 2 }, { midi: 64, beats: 3 }, { midi: 67, beats: 3 }], 0, 4);
    expect(fmt(ns)).toBe('C4:2 E4:2 _:1 G4:3');
  });
});

describe('đưa vào trình soạn', () => {
  it('chữ có vạch nhịp, trình soạn đọc lại đúng (cả nhịp lấy đà)', () => {
    for (const m of MELODIES) {
      const bpb = Number(m.ts[0]);
      const notes = expectedLayout(m);
      const text = toEditorText(notes, m.pickupRest, bpb);
      const r = parseSolfege(text, bpb);
      expect(r.errors, `${m.name}: ${text}`).toEqual([]);
      expect(r.warnings, `${m.name}: ${text}`).toEqual([]);
      expect(r.pickupRest, m.name).toBe(m.pickupRest);
      expect(fmt(r.notes)).toBe(fmt(notes));
      // Lưu được thành bài (tròn ô nhịp)
      const song = buildParentSong(r.notes, { id: 'x', title: 't', createdAt: 0, timeSignature: m.ts, bpm: 72, pickupRest: r.pickupRest });
      const total = song.notes.reduce((s, n) => s + n.beats, 0);
      expect(total % bpb).toBe(0);
    }
  });
});

describe('thế tay 5 ngón', () => {
  it('Ngôi sao nhỏ: thế Đô (Đô4–Sol4) + La4 ngoài thế tay', () => {
    const notes = expectedLayout(MELODIES[0]);
    const h = suggestHandPosition(notes)!;
    expect(h.hand).toBe('RH');
    expect(h.low).toBe('C4');
    expect(h.high).toBe('G4');
    expect(h.thumb).toBe('C4');
    expect(h.outside.map((i) => notes[i].pitch)).toEqual(['A4', 'A4']);
    expect(h.inside).toBe(h.total - 2);
    expect(h.fingers[0]).toBe(1);
  });
  it('tay trái (dưới Đô giữa): ngón cái ở nốt cao', () => {
    const notes: SolfegeNote[] = ['C3', 'D3', 'E3', 'F3', 'G3', 'F3', 'E3', 'D3', 'C3'].map((p) => ({ pitch: p, beats: 1 }));
    const h = suggestHandPosition(notes)!;
    expect(h.hand).toBe('LH');
    expect(h.thumb).toBe('G3');
    expect(h.outside).toEqual([]);
    expect(h.fingers[0]).toBe(5);
  });
  it('không có nốt → null', () => {
    expect(suggestHandPosition([{ rest: true, beats: 4 }])).toBeNull();
  });
});

describe('OnsetCollector', () => {
  it('nhả phím nhanh → có off; tắt dần chậm → không', () => {
    const c = new OnsetCollector();
    const gate = 0.001;
    c.note(60, 1);
    // ngân chậm (giảm 3,5 dB/s) 1 giây: không nhả
    for (let t = 1.02; t < 2; t += 0.025) c.frame(t, 0.01 * Math.exp(-(t - 1) / 2.5), gate);
    expect(c.events[0].off).toBeUndefined();
    // nhả phím: tắt nhanh (τ 80 ms)
    for (let t = 2; t < 2.6; t += 0.025) c.frame(t, 0.0067 * Math.exp(-(t - 2) / 0.08), gate);
    expect(c.events[0].off).toBeGreaterThan(1.9);
    expect(c.events[0].off).toBeLessThan(2.4);
    expect(c.silentFor(4.6)).toBeGreaterThan(2);
  });
});
