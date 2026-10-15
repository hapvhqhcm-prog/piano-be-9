/**
 * BÉ 9 TUỔI THẬT — THEO NHỊP (2026-10-15): vào muộn sau đếm vào, giữ nhịp ĐỀU mà chậm hơn máy, đàn lung tung, cả bài lệch
 * quãng 8 — qua đường chấm thật (tests/childSim.ts runTempo: MicAnalyzer → gradeTiming + analyzeTempo + analyzePulse +
 * teach, như songTempo.ts). Tách khỏi tests/childBehavior.test.ts để chạy song song.
 */
import { describe, expect, it } from 'vitest';
import { findTune } from '../src/music/exercises';
import { handOnsets } from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';
import { rng, runTempo, type Strike } from './childSim';

const pitchMidi = pitchToMidi;

describe('bé thật — theo nhịp: đều mà chậm / vào muộn / lung tung', () => {
  const t = findTune('ode_to_joy_easy')!;
  const R = rng(31);
  const steady = (factor: number, delayBeats: number, jitter = 0.04) => (t0: number, spb: number, groups: Array<{ start: number }>) =>
    groups.map((g, i): Strike => ({ midi: handOnsets(t, null)[i].pitches.map(pitchMidi)[0], start: t0 + (g.start * factor + delayBeats) * spb + (R() - 0.5) * jitter * 2, dur: 0.85 * spb * factor, vel: 0.45 }));
  it('7. đều nhưng chậm hơn máy (50 so với 60) → "đều nhưng chậm hơn máy — được", gợi ý nấc 50', { timeout: 60000 }, async () => {
    const r = await runTempo(t, steady(60 / 50, 0));
    expect(r.pulse.kind).toBe('slow');
    expect(r.point?.rule).toBe('steady');
    expect(r.review.pulse?.suggestBpm).toBe(50);
    expect(r.point?.text).toMatch(/chậm hơn máy/);
  });
  it('7. vào muộn một phách rưỡi sau đếm vào, rồi đều → "vào muộn"', { timeout: 60000 }, async () => {
    const r = await runTempo(t, steady(1, 1.5));
    expect(r.pulse.kind).toBe('late');
    expect(r.point?.rule).toBe('steady');
    expect(r.point?.text).toMatch(/vào muộn/);
  });
  it('7. đàn lung tung (lệch ±0,6 phách) → không khen "đều"', { timeout: 60000 }, async () => {
    const r = await runTempo(t, (t0, spb, groups) => groups.map((g, i): Strike => ({ midi: handOnsets(t, null)[i].pitches.map(pitchMidi)[0], start: t0 + (g.start * 1.15 + (R() - 0.5) * 1.2) * spb, dur: 0.6 * spb, vel: 0.45 })));
    expect(['uneven', 'unknown']).toContain(r.pulse.kind);
    expect(r.point?.rule).not.toBe('steady');
  });
  it('7. đối chứng: đúng nhịp → ontime, khen như cũ', { timeout: 60000 }, async () => {
    const r = await runTempo(t, steady(1, 0));
    expect(r.pulse.kind).toBe('ontime');
    expect(r.score).toBeGreaterThanOrEqual(0.9);
    expect(r.point?.rule).not.toBe('steady');
  });
  it('1. theo nhịp cả bài lệch quãng 8 → thầy nói "đúng tên nốt … quãng tám", không "Mi nhầm thành Mi"', { timeout: 60000 }, async () => {
    const r = await runTempo(t, (t0, spb, groups) => groups.map((g, i): Strike => ({ midi: handOnsets(t, null)[i].pitches.map(pitchMidi)[0] + 12, start: t0 + g.start * spb, dur: 0.85 * spb, vel: 0.45 })));
    expect(r.point?.rule).toBe('octave');
    expect(r.point?.text).toMatch(/quãng tám/);
  });
});

