import { describe, expect, it } from 'vitest';
import {
  COUNT_BRIDGE,
  PASS_SCORE,
  countBridgeFor,
  countInBeats,
  countInLabel,
  countLine,
  countWords,
  gradePulseDrop,
  gradeTiming,
  pulseDropWindow,
  pulseMessage,
  score,
  starsFor,
} from '../src/music/timing';
import { findSong, onsets } from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';

const notes = [
  { index: 0, start: 0, midi: 64 },
  { index: 1, start: 1, midi: 64 },
  { index: 2, start: 2, midi: 64 },
  { index: 3, start: 3, midi: 62 },
];

describe('gradeTiming', () => {
  it('đúng lúc & đúng nốt → trúng; mỗi lần nghe chỉ dùng cho một nốt', () => {
    const v = gradeTiming(notes, [
      { beat: 0.1, midi: 64 },
      { beat: 1.2, midi: 64 },
      { beat: 1.9, midi: 64 },
      { beat: 3.0, midi: 62 },
    ]);
    expect(v.map((x) => x.hit)).toEqual([true, true, true, true]);
    expect(score(v)).toBe(1);
  });

  it('quá sớm / quá muộn / sai nốt → trượt', () => {
    const v = gradeTiming(notes, [
      { beat: -0.6, midi: 64 }, // quá sớm
      { beat: 1.7, midi: 64 }, // muộn quá cửa sổ của nốt 1, nhưng sớm hợp lệ cho nốt 2
      { beat: 3.0, midi: 60 }, // sai nốt
    ]);
    expect(v.map((x) => x.hit)).toEqual([false, false, true, false]);
    expect(score(v)).toBe(0.25);
  });

  it('một nốt ngân dài không được tính cho 3 nốt Mi liên tiếp', () => {
    const v = gradeTiming(notes, [{ beat: 0, midi: 64 }]);
    expect(v.filter((x) => x.hit)).toHaveLength(1);
  });

  it('sao: ≥90% = 3, ≥60% = 2; qua tiêu chí ≥80%', () => {
    expect(starsFor(0.95)).toBe(3);
    expect(starsFor(0.7)).toBe(2);
    expect(starsFor(0.3)).toBe(1);
    expect(PASS_SCORE).toBe(0.8);
  });
});

describe('gradeTiming — nhóm nốt cùng lúc (hai tay / hợp âm)', () => {
  it('nghe được một nốt bất kỳ trong nhóm là trúng', () => {
    const v = gradeTiming(
      [
        { index: 0, start: 0, midi: [64, 48] },
        { index: 1, start: 1, midi: [62] },
      ],
      [
        { beat: 0.05, midi: 48 },
        { beat: 1.0, midi: 64 },
      ],
    );
    expect(v.map((x) => x.hit)).toEqual([true, false]);
  });
});

describe('nhịp 2/4 & móc kép', () => {
  it('đếm vào: 4/4 bốn phách "1 2 3 4", 3/4 "1 2 3", 2/4 HAI ô "1 2 1 2"', () => {
    expect([4, 3, 2].map(countInBeats)).toEqual([4, 3, 4]);
    const labels = (bpm: number) => {
      const lead = countInBeats(bpm);
      return Array.from({ length: lead }, (_, k) => countInLabel(-lead + k + 0.1, bpm));
    };
    expect(labels(4)).toEqual([1, 2, 3, 4]);
    expect(labels(3)).toEqual([1, 2, 3]);
    expect(labels(2)).toEqual([1, 2, 1, 2]);
  });

  it('móc kép sát nhau: lần nghe thuộc về nốt gần nhất (nốt trước không "giành" mất)', () => {
    // Rê (đen) ở phách 0, Rê móc kép ở 0.5 & 0.75 … bé lỡ nốt đầu, đàn đúng hai móc kép
    const notes = [
      { index: 0, start: 0, midi: 62 },
      { index: 1, start: 0.5, midi: 62 },
      { index: 2, start: 0.75, midi: 62 },
    ];
    const v = gradeTiming(notes, [
      { beat: 0.52, midi: 62 },
      { beat: 0.78, midi: 62 },
    ]);
    expect(v.map((x) => x.hit)).toEqual([false, true, true]);
    expect(v[1].offset).toBeCloseTo(0.02);
  });

  it('đàn đúng trọn "Bắc kim thang" (2/4, móc kép) ở 60 → trúng 100%; lệch đều 0,1 phách vẫn trúng hết', () => {
    const t = findSong('bac_kim_thang')!;
    const input = onsets(t).map((o) => ({ index: o.notes[0].index, start: o.start, midi: o.pitches.map(pitchToMidi) }));
    for (const lag of [0, 0.1, -0.08]) {
      const heard = input.map((n) => ({ beat: n.start + lag, midi: n.midi[0] }));
      expect(score(gradeTiming(input, heard))).toBe(1);
    }
  });
});

describe('Cầu nối vần → đếm số (OWNER duyệt 2026-10-08)', () => {
  it('rút vần dần theo tuần: 4–5 vần + số · 6–8 số đậm, vần mờ · 9+ chỉ số', () => {
    expect(countBridgeFor(4)).toMatchObject({ syllables: 'full', counts: 'normal', say: 'syllables' });
    expect(countBridgeFor(5)).toMatchObject({ syllables: 'full', say: 'syllables' });
    for (const w of [6, 7, 8]) expect(countBridgeFor(w)).toMatchObject({ syllables: 'faint', counts: 'strong', say: 'counts' });
    for (const w of [9, 12, 31]) expect(countBridgeFor(w)).toMatchObject({ syllables: 'none', counts: 'strong', say: 'counts' });
    // Bảng là dữ liệu: đổi bảng là đổi luật
    expect(countBridgeFor(3, [{ fromWeek: 1, syllables: 'none', counts: 'strong', say: 'counts' }]).syllables).toBe('none');
    expect(COUNT_BRIDGE.map((s) => s.fromWeek)).toEqual([...COUNT_BRIDGE.map((s) => s.fromWeek)].sort((a, b) => a - b));
  });

  it('dòng đếm gọn kiểu "1 2 3-và 4"', () => {
    const words = countWords([
      { start: 0, beats: 1, hits: [0] },
      { start: 1, beats: 1, hits: [0] },
      { start: 2, beats: 1, hits: [0, 0.5] },
      { start: 3, beats: 1, hits: [0] },
    ]);
    expect(words.map(countLine).join(' ')).toBe('1 2 3-và 4');
    expect(countLine('4 – 1')).toBe('4 1');
    expect(countLine('(2)')).toBe('(2)');
  });
});

describe('Giữ nhịp trong đầu — máy im 2 ô giữa bài (OWNER duyệt 2026-10-08)', () => {
  it('2 ô ở giữa, trước và sau còn tiếng tích; bài ngắn quá thì không thử', () => {
    expect(pulseDropWindow(32, 4)).toEqual([12, 20]); // 8 ô → ô 4–5 (đếm từ 1)
    expect(pulseDropWindow(16, 4)).toEqual([4, 12]); // 4 ô → ô 2–3
    expect(pulseDropWindow(24, 3)).toEqual([9, 15]); // 3/4, 8 ô
    expect(pulseDropWindow(12, 4)).toBeNull(); // 3 ô: quá ngắn
    const w = pulseDropWindow(40, 4)!;
    expect(w[0]).toBeGreaterThanOrEqual(4);
    expect(40 - w[1]).toBeGreaterThanOrEqual(4);
    expect(w[1] - w[0]).toBe(8);
  });

  it('chấm riêng các nốt trong ô im: giữ đúng nhịp → khen; trôi nhịp → động viên (không chê)', () => {
    const ns = Array.from({ length: 16 }, (_, k) => ({ index: k, start: k, midi: 60 + (k % 5) * 2 }));
    const win = pulseDropWindow(16, 4)!; // [4, 12)
    // Bé đàn đều, kể cả lúc máy im
    const steady = ns.map((n) => ({ beat: n.start + 0.05, midi: n.midi }));
    const v1 = gradeTiming(ns, steady);
    const p1 = gradePulseDrop(ns, v1, win);
    expect(p1).toMatchObject({ total: 8, hits: 8, held: true, outsideScore: 1 });
    expect(pulseMessage(p1)).toBe('Con giữ nhịp trong đầu giỏi lắm! 🧠🥁');
    // Lúc máy im bé chạy nhanh dần (mỗi phách sớm thêm 0,15) rồi bắt lại khi tiếng tích trở lại
    const drift = ns.map((n) => ({ beat: n.start >= 4 && n.start < 12 ? n.start - 0.15 * (n.start - 3) : n.start, midi: n.midi }));
    const v2 = gradeTiming(ns, drift);
    const p2 = gradePulseDrop(ns, v2, win);
    expect(p2.held).toBe(false);
    expect(p2.outsideScore).toBe(1);
    expect(pulseMessage(p2, 3)).toMatch(/1 2 3/);
    expect(pulseMessage(p2)).not.toMatch(/sai|kém|tệ/i);
    // Không có nốt trong ô im → không chấm
    expect(gradePulseDrop([{ index: 0, start: 0 }], [{ index: 0, hit: true }], [4, 12]).held).toBeNull();
    expect(pulseMessage({ held: null, hits: 0, total: 0 })).toBe('');
  });
});
