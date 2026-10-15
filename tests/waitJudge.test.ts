/**
 * src/music/waitJudge.ts (bé thật ở chế độ chờ), timing.analyzePulse / pulseNote, lời thầy 'octave' / 'steady' —
 * kiểm tra hàm thuần (mô phỏng âm thanh: tests/childBehavior*.test.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  MISS_SKIP_MS,
  advanceOf,
  judgeWait,
  missHelp,
  pairFromHands,
  phraseStartsFrom,
  waitJudgeInit,
  type PairCheck,
  type WaitJudgeState,
  type WaitVerdict,
} from '../src/music/waitJudge';
import { analyzePulse, pulseNote } from '../src/music/timing';
import { teach, waitOutcome, wordCount, type RunReview } from '../src/music/teacher';

const G = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64].map((m) => [m]);
const PS = [0, 8];

/** Chạy một chuỗi nốt nghe được (midi, giây) qua bộ chấm; `pairs` = kết quả hỏi micro theo thứ tự lần hỏi. */
function play(notes: Array<[number, number]>, pairs: PairCheck[] = [], groups = G, grace?: number) {
  let s: WaitJudgeState = waitJudgeInit();
  let cur = 0;
  const out: WaitVerdict[] = [];
  let pi = 0;
  for (const [heard, t] of notes) {
    let r = judgeWait(s, { groups, cur, phraseStarts: PS, heard, t, ...(grace !== undefined ? { octaveGrace: grace } : {}) });
    if (r.verdict.kind === 'check') {
      if (r.verdict.lateWrong !== undefined) out.push({ kind: 'wrong' });
      r = judgeWait(r.state, { groups, cur, phraseStarts: PS, heard, t, pair: pairs[pi++] ?? 'other', ...(grace !== undefined ? { octaveGrace: grace } : {}) });
    }
    s = r.state;
    out.push(r.verdict);
    cur += advanceOf(r.verdict);
  }
  return { out, cur, kinds: out.map((v) => v.kind) };
}

describe('judgeWait — bé thật ở chế độ chờ', () => {
  it('đàn đúng: đi hết, không gì khác', () => {
    const r = play(G.map((g, i) => [g[0], 1 + i]));
    expect(r.cur).toBe(G.length);
    expect(new Set(r.kinds)).toEqual(new Set(['ok']));
  });
  it('lệch quãng 8: nốt đầu cho qua, nốt sau giữ lại; về đúng chỗ thì đi tiếp; không bao giờ "wrong"', () => {
    const r = play([
      [76, 1],
      [76, 2],
      [76, 3],
      [64, 4],
    ]);
    expect(r.out.map((v) => (v.kind === 'octave' ? `octave-${v.accept}` : v.kind))).toEqual(['octave-true', 'octave-false', 'octave-false', 'ok']);
    expect(r.cur).toBe(2);
  });
  it('bài luyện tìm phím (octaveGrace 0): không cho qua', () => {
    const r = play([[72, 1]], [], [[60]], 0);
    expect(r.out[0]).toMatchObject({ kind: 'octave', accept: false });
  });
  it('đàn vội, micro lỡ một nốt: nốt sau xác nhận → con trỏ bắt kịp, không "sai"', () => {
    // 64 64 [65 lỡ] 67 67 65: con trỏ chờ 65, nghe 67 (nhóm 3) rồi 67 (nhóm 4) → bắt kịp
    const r = play([
      [64, 1.0],
      [64, 1.3],
      [67, 1.9],
      [67, 2.2],
      [65, 2.5],
    ]);
    expect(r.kinds).toEqual(['ok', 'ok', 'pending', 'ahead', 'ok']);
    expect(r.out[3]).toMatchObject({ advance: 3, skipped: 1 });
    expect(r.cur).toBe(6);
  });
  it('nhầm phím bên cạnh trùng nốt sau: vẫn bị tính sai (muộn một nốt) khi bé đàn lại đúng', () => {
    const r = play([
      [64, 1.0],
      [64, 1.5],
      [67, 2.0], // chờ 65, bé nhầm 67 (= nốt sau)
      [65, 2.6], // sửa lại đúng
    ]);
    expect(r.kinds).toEqual(['ok', 'ok', 'pending', 'ok']);
    expect(r.out[3].lateWrong).toBe(67);
  });
  it('tiếng vọng nốt vừa nhận (ngân nga / pedal) → bỏ qua', () => {
    const r = play([
      [64, 1],
      [64, 2],
      [65, 3],
      [65, 3.6],
    ]);
    expect(r.kinds[3]).toBe('echo');
  });
  it('dừng lâu rồi đàn lại từ đầu câu → replay, không sai; tới nốt chờ thì đi tiếp', () => {
    const r = play([
      [64, 1],
      [64, 2],
      [65, 3],
      [67, 4],
      [64, 20], // dừng 16 s, đàn lại từ đầu (con trỏ ở nhóm 4 = 67)
      [64, 21],
      [65, 22],
      [67, 23], // nhóm 3 của đoạn đàn lại (trùng nốt đang chờ — vẫn là đoạn đàn lại)
      [67, 24], // = nốt đang chờ (nhóm 4)
    ]);
    expect(r.kinds).toEqual(['ok', 'ok', 'ok', 'ok', 'replay', 'replay', 'replay', 'replay', 'ok']);
    expect(r.cur).toBe(5);
  });
  it('hai phím một lúc / tiếng lạ / phím cần đàn vừa gõ (micro nghe lệch)', () => {
    expect(play([[65, 1]], ['both']).kinds).toEqual(['smudge']);
    expect(play([[65, 1]], ['none']).kinds).toEqual(['ghost']);
    expect(play([[65, 1]], ['want']).kinds).toEqual(['ok']);
    expect(play([[65, 1]], ['other']).kinds).toEqual(['wrong']);
    // quá xa nốt chờ: không cần hỏi micro
    expect(play([[55, 1]]).kinds).toEqual(['ghost']);
  });
  it('pairFromHands / phraseStartsFrom', () => {
    expect(pairFromHands(null)).toBe('unknown');
    expect(pairFromHands({ conclusive: false })).toBe('unknown');
    expect(pairFromHands({ conclusive: true, RH: { verdict: 'hit' }, LH: { verdict: 'hit' } })).toBe('both');
    expect(pairFromHands({ conclusive: true, RH: { verdict: 'miss' }, LH: { verdict: 'hit' } })).toBe('other');
    expect(pairFromHands({ conclusive: true, RH: { verdict: 'miss' }, LH: { verdict: 'miss' } })).toBe('none');
    expect(phraseStartsFrom([0, 0, 1, 1, 2, 2, 3], [[0, 2], [2, 4]])).toEqual([0, 4]);
  });
});

describe('missHelp — sai mãi một nốt', () => {
  it('nói → nghe mẫu → chỉ phím → mời bỏ qua (≥ 5 lần VÀ ≥ 8 s)', () => {
    expect([1, 2, 3, 4].map((n) => missHelp(n, n * 1500))).toEqual(['say', 'listen', 'show', 'show']);
    expect(missHelp(5, 2000)).toBe('show');
    expect(missHelp(5, MISS_SKIP_MS)).toBe('skip');
    expect(missHelp(4, 60000)).toBe('show');
  });
});

describe('analyzePulse — đều mà chậm / vào muộn / lung tung', () => {
  const notes = Array.from({ length: 16 }, (_, i) => ({ start: i, midi: [[60, 62, 64, 65][i % 4]] }));
  const heard = (f: (b: number, i: number) => number) => notes.map((n, i) => ({ beat: f(n.start, i), midi: n.midi[0] }));
  it('chậm hơn máy 20 %, đều → slow, gợi ý nấc 50 khi máy 60', () => {
    const p = analyzePulse(notes, heard((b, i) => b * 1.2 + (i % 2 ? 0.05 : -0.05)));
    expect(p.kind).toBe('slow');
    expect(pulseNote(p, 60)).toEqual({ kind: 'slow', suggestBpm: 50 });
  });
  it('vào muộn 1,5 phách, đều → late; đúng → ontime; lung tung → uneven', () => {
    expect(analyzePulse(notes, heard((b) => b + 1.5)).kind).toBe('late');
    expect(analyzePulse(notes, heard((b) => b + 0.1)).kind).toBe('ontime');
    expect(analyzePulse(notes, heard((b, i) => b + [0.6, -0.5, 0.2, -0.7, 0.4][i % 5])).kind).toBe('uneven');
    expect(analyzePulse(notes, heard((b) => b).slice(0, 4)).kind).toBe('unknown');
  });
});

describe('lời thầy — lệch quãng 8, đều nhịp', () => {
  const rv = (kinds: Array<Partial<RunReview['notes'][number]>>, o: Partial<RunReview> = {}): RunReview => ({
    mode: 'tempo',
    beatsPerMeasure: 4,
    phrases: [[0, 2]],
    measureOffset: 0,
    hints: 'names',
    notes: kinds.map((k, i) => ({ notes: [{ index: i, hand: 'RH', midi: [64], beats: 1 }], start: i, measure: Math.floor(i / 4), kind: 'ok', ...k })),
    ...o,
  });
  it('nhầm sang cùng tên khác quãng 8 → "đúng tên nốt … quãng tám" (không "Mi nhầm thành Mi")', () => {
    const p = teach(rv(Array.from({ length: 8 }, () => ({ kind: 'wrong' as const, played: 76 }))))!;
    expect(p.rule).toBe('octave');
    expect(p.text).toMatch(/Đúng tên nốt Mi/);
    expect(wordCount(p.text)).toBeLessThanOrEqual(15);
  });
  it('đều mà chậm / vào muộn → khen đều (≤ 15 chữ)', () => {
    const missed = Array.from({ length: 8 }, () => ({ kind: 'missed' as const }));
    const slow = teach(rv(missed, { pulse: { kind: 'slow', suggestBpm: 50 } }))!;
    expect(slow.rule).toBe('steady');
    expect(slow.praise).toBe(true);
    expect(slow.text).toMatch(/chậm hơn máy/);
    const late = teach(rv(missed, { pulse: { kind: 'late' } }))!;
    expect(late.text).toMatch(/vào muộn/);
    for (const p of [slow, late]) expect(wordCount(p.text)).toBeLessThanOrEqual(15);
    expect(teach(rv(missed, { pulse: { kind: 'uneven' } }))!.rule).not.toBe('steady');
  });
  it('chế độ chờ: nốt đàn vội bị lỡ → "sót"; nốt lệch quãng 8 được cho qua → nhầm (cùng tên)', () => {
    expect(waitOutcome({ wrong: 0, via: 'skip' }, ['RH']).kind).toBe('missed');
    expect(waitOutcome({ wrong: 0, via: 'mic', octave: 76 }, ['RH'])).toMatchObject({ kind: 'wrong', played: 76 });
  });
});
