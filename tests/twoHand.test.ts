/**
 * (+ 2026-10-09) Chấm hai tay bằng micro — các khối cơ bản (src/audio/twoHand.ts, src/music/handGrade.ts) và
 * MicListener.verifyHands. Đo trên bài thật: tests/twoHandBench.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../src/audio/AudioEngine';
import { HISTORY_SIZE, MicListener } from '../src/audio/MicListener';
import { analyzeHands, HANDS_LATE_READY, HANDS_SPAN_BEFORE } from '../src/audio/twoHand';
import { gradeHandsTempo, tallyHands, type HandNoteResult } from '../src/music/handGrade';
import { renderPiano, type SimNote, type SimOptions } from './pianoSim';
import { RAW } from './weekSim';

const sr = 48000;
const REAL: SimOptions = { ...RAW, seed: 3 };
const at = (t: number) => Math.round(t * sr);
/** Nốt cũ (tay trái giữ Đô3, tay phải Rê4) rồi lần gõ lúc 1,0 s */
const play = (notes: SimNote[], o: SimOptions = REAL) => renderPiano(notes, 1.6, o);

describe('analyzeHands: từng tay, nốt mới, nốt cũ còn ngân', () => {
  it('đủ hai tay → cả hai đúng', () => {
    const sig = play([{ midi: 48, start: 1, dur: 0.5 }, { midi: 64, start: 1, dur: 0.5 }]);
    const r = analyzeHands(sig, sr, at(1), { RH: [64], LH: [48] });
    expect(r.conclusive).toBe(true);
    expect(r.RH?.verdict).toBe('hit');
    expect(r.LH?.verdict).toBe('hit');
  });

  it('quên tay trái (Đô3 của nhóm trước còn ngân) → tay trái chưa đúng, tay phải đúng', () => {
    const sig = play([
      { midi: 48, start: 0.2, dur: 1.3 }, // tay trái giữ từ trước — không phải "vừa đàn"
      { midi: 62, start: 0.2, dur: 0.8 },
      { midi: 64, start: 1, dur: 0.5 },
    ]);
    const r = analyzeHands(sig, sr, at(1), { RH: [64], LH: [48] });
    expect(r.RH?.verdict).toBe('hit');
    expect(r.LH?.verdict).not.toBe('hit');
  });

  it('nhầm phím tay trái (Rê3 thay Đô3) → "wrong", nghe được Rê3', () => {
    const sig = play([{ midi: 50, start: 1, dur: 0.5 }, { midi: 64, start: 1, dur: 0.5 }]);
    const r = analyzeHands(sig, sr, at(1), { RH: [64], LH: [48] });
    expect(r.RH?.verdict).toBe('hit');
    expect(r.LH?.verdict).toBe('wrong');
    expect(r.LH?.heard).toBe(50);
  });

  it('tay trái trễ 120 ms → vẫn đúng nhờ khung muộn', () => {
    const sig = play([{ midi: 64, start: 1, dur: 0.5 }, { midi: 48, start: 1.12, dur: 0.5 }]);
    const early = analyzeHands(sig, sr, at(1), { RH: [64], LH: [48] }, 0, false);
    const r = analyzeHands(sig, sr, at(1), { RH: [64], LH: [48] });
    expect(r.RH?.verdict).toBe('hit');
    expect(r.LH?.verdict).toBe('hit');
    expect(r.usedLate || early.LH?.verdict === 'hit').toBe(true);
  });

  it('chỉ có tiếng ồn → không kết luận / không ghi nhận', () => {
    const sig = renderPiano([], 1.6, REAL);
    const r = analyzeHands(sig, sr, at(1), { RH: [64], LH: [48] });
    expect(r.conclusive && (r.RH?.verdict === 'hit' || r.LH?.verdict === 'hit')).toBe(false);
  });

  it('thiếu dữ liệu trước lần gõ → không kết luận', () => {
    const sig = play([{ midi: 48, start: 0.05, dur: 0.5 }]);
    expect(analyzeHands(sig, sr, at(0.05), { LH: [48] }).conclusive).toBe(false);
  });
});

describe('gradeHandsTempo: gán lần kiểm tra cho nhóm hai tay', () => {
  const g = { beat: 4, measure: 1, parts: [{ hand: 'RH' as const, midis: [64], indices: [3] }, { hand: 'LH' as const, midis: [48], indices: [20] }] };
  it('lấy lần gõ gần phách nhất; tay thiếu → miss; nhầm → wrong + phím nghe được', () => {
    const out = gradeHandsTempo(
      [g],
      [
        { beat: 4.3, conclusive: true, RH: 'hit', LH: 'miss' },
        { beat: 4.05, conclusive: true, RH: 'hit', LH: 'wrong', heardLH: 50 },
        { beat: 6, conclusive: true, RH: 'hit', LH: 'hit' }, // ngoài cửa sổ
      ],
      0.45,
      0.55,
    );
    expect(out.map((x) => x.verdict)).toEqual(['hit', 'wrong']);
    expect(out[0].offset).toBeCloseTo(0.05);
    expect(out[1].heard).toBe(50);
    expect(out[1].indices).toEqual([20]);
  });
  it('im lặng → miss; chỉ có lần gõ không kết luận → unknown (không tính)', () => {
    expect(gradeHandsTempo([g], [], 0.45, 0.55).map((x) => x.verdict)).toEqual(['miss', 'miss']);
    const u = gradeHandsTempo([g], [{ beat: 4, conclusive: false }], 0.45, 0.55);
    expect(u.map((x) => x.verdict)).toEqual(['unknown', 'unknown']);
    expect(tallyHands(u)).toEqual({ RH: { hits: 0, total: 0 }, LH: { hits: 0, total: 0 } });
  });
  it('tallyHands: đếm theo tay', () => {
    const n = (hand: 'RH' | 'LH', verdict: HandNoteResult['verdict']): HandNoteResult => ({ indices: [0], hand, midis: [60], beat: 0, measure: 0, verdict, together: true });
    expect(tallyHands([n('RH', 'hit'), n('LH', 'miss'), n('LH', 'hit'), n('RH', 'parent')])).toEqual({ RH: { hits: 1, total: 2 }, LH: { hits: 1, total: 2 } });
  });
});

describe('MicListener.verifyHands', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('bộ đệm đủ dài cho hai tay; trả lời sau lần gõ; micro tắt → null', async () => {
    expect(HISTORY_SIZE / sr).toBeGreaterThan(HANDS_SPAN_BEFORE + HANDS_LATE_READY + 0.05);
    vi.useFakeTimers();
    const sig = renderPiano(
      [
        { midi: 48, start: 1, dur: 0.6 },
        { midi: 64, start: 1, dur: 0.6 },
        { midi: 64, start: 2.5, dur: 0.6 }, // lần 2: quên tay trái
      ],
      3.5,
      REAL,
    );
    let t = 0;
    const ctx = {
      state: 'running',
      sampleRate: sr,
      get currentTime() {
        return t;
      },
      resume: async () => undefined,
      createMediaStreamSource: () => ({ connect: () => undefined, disconnect: () => undefined }),
      createAnalyser: () => ({
        fftSize: 0,
        getFloatTimeDomainData: (b: Float32Array) => {
          const end = Math.round(t * sr);
          for (let i = 0; i < b.length; i++) {
            const k = end - b.length + i;
            b[i] = k >= 0 && k < sig.length ? sig[k] : 0.0001 * Math.sin(k);
          }
        },
      }),
    };
    const audio = { context: ctx, isSounding: false, outputLatency: 0.02, msSinceSound: () => 10_000, clickNear: () => false, setMicActive: vi.fn(), onStateChange: () => () => undefined };
    const tr = { readyState: 'live', muted: false, stop: () => undefined };
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getAudioTracks: () => [tr], getTracks: () => [tr] }) } });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('window', { setInterval, clearInterval });
    const mic = new MicListener(audio as unknown as AudioEngine);
    mic.clock = () => t * 1000;
    const advance = (until: number) => {
      while (t < until) {
        t += 0.025;
        vi.advanceTimersByTime(25);
      }
    };
    expect(await mic.start()).toBe('on');
    const onsets: number[] = [];
    mic.onOnset((a) => onsets.push(a));
    advance(1.1);
    expect(onsets.length).toBe(1);
    const p1 = mic.verifyHands({ RH: [64], LH: [48] }, onsets[0], false);
    let done = false;
    void p1.then(() => (done = true));
    advance(1.12);
    await Promise.resolve();
    expect(done).toBe(false); // chưa đủ dữ liệu
    advance(1.3);
    const r1 = await p1;
    expect(r1?.RH?.verdict).toBe('hit');
    expect(r1?.LH?.verdict).toBe('hit');
    advance(2.6);
    expect(onsets.length).toBe(2);
    const p2 = mic.verifyHands({ RH: [64], LH: [48] }, onsets[1], true);
    advance(3);
    const r2 = await p2;
    expect(r2?.RH?.verdict).toBe('hit');
    expect(r2?.LH?.verdict).not.toBe('hit');
    mic.stop();
    expect(await mic.verifyHands({ RH: [64], LH: [48] })).toBeNull();
  });
});
