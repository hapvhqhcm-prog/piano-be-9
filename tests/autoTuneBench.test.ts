/**
 * (+ 2026-10-09) ĐÀN NHÀ LỆCH DÂY — trước / sau khi TỰ HỌC lệch dây (src/audio/autoTune.ts).
 * Đàn giả lập (tests/pianoSim.ts) lệch cả cây −45 / −25 / +30 cent, có / không "giãn dây" (−8 c ở Đô3, +10 c ở Đô6).
 * - Bài một tay (đúng đường chấm của app — tests/weekSim.ts): chờ + theo nhịp, cả âm khu giữa, trầm (tay trái) và cao
 *   (bài dịch lên quãng 8). "Sau" = MỘT bộ tự học dùng chung, bắt đầu TRỐNG (học ngay trong lúc bé đàn).
 * - Hai tay (twoHandSim, bài "two_friends", 6 kiểu lỗi): "trước" = bù 0; "sau" = kết quả tự học của phần một tay.
 * Mặc định (mọi lần test, ~40 s): đàn −45 c + giãn dây, 2 bài. Đầy đủ: AUTO_TUNE_BENCH=full (5 bài × 4 đàn, ≈ 6 phút;
 * chạy từng đàn: AUTO_TUNE_PIANOS=0,2).
 */
import { describe, expect, it } from 'vitest';
import { TuningEstimator, describeAutoTune } from '../src/audio/autoTune';
import { findTune } from '../src/music/exercises';
import type { Tune, TuneNote } from '../src/music/tune';
import { midiToPitch, pitchToMidi } from '../src/piano/pitchTable';
import { stretch, type SimOptions } from './pianoSim';
import { simulateHands, type ErrKind } from './twoHandSim';
import { simulateTempo, simulateWait, VEL, type Cond, type Stats } from './weekSim';

const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const FULL = ENV.AUTO_TUNE_BENCH === 'full';

const ALL_PIANOS: Array<{ name: string; sim: SimOptions }> = [
  { name: 'lệch −45c + giãn dây', sim: { detuneCents: -45, stretchCents: stretch(-8, 10) } },
  { name: 'lệch −25c', sim: { detuneCents: -25 } },
  { name: 'lệch +30c + giãn dây', sim: { detuneCents: 30, stretchCents: stretch(-8, 10) } },
  { name: 'đúng dây + giãn dây', sim: { stretchCents: stretch(-8, 10) } },
];
const PIANOS = ENV.AUTO_TUNE_PIANOS ? ENV.AUTO_TUNE_PIANOS.split(',').map((i) => ALL_PIANOS[+i]) : FULL ? ALL_PIANOS : [ALL_PIANOS[0]];

/** Dịch cả bài (MIDI) — bài âm khu cao */
function transpose(t: Tune, by: number): Tune {
  const mv = (n: TuneNote): TuneNote =>
    n.pitch ? { ...n, pitch: midiToPitch(pitchToMidi(n.pitch) + by), also: n.also?.map((a) => ({ ...a, pitch: midiToPitch(pitchToMidi(a.pitch) + by) })) } : n;
  return { ...t, notes: t.notes.map(mv), lh: t.lh?.map(mv) };
}

const ALL_SONGS: Array<{ label: string; tune: () => Tune; mode: 'wait' | 'tempo' }> = [
  { label: 'jingle_bells chờ', tune: () => findTune('jingle_bells')!, mode: 'wait' },
  { label: 'mary_lamb_lh chờ (trầm)', tune: () => findTune('mary_lamb_lh')!, mode: 'wait' },
  { label: 'ode_to_joy_easy +8va chờ (cao)', tune: () => transpose(findTune('ode_to_joy_easy')!, 12), mode: 'wait' },
  { label: 'ode_to_joy_easy theo nhịp', tune: () => findTune('ode_to_joy_easy')!, mode: 'tempo' },
  { label: 'hot_cross_buns_lh theo nhịp (trầm)', tune: () => findTune('hot_cross_buns_lh')!, mode: 'tempo' },
];
/** Mặc định: 1 bài chờ (giữa) + 1 bài theo nhịp (trầm) */
const SONGS = FULL || ENV.AUTO_TUNE_PIANOS ? ALL_SONGS : [ALL_SONGS[0], ALL_SONGS[4]];
const COND: Omit<Cond, 'seed'> = { vel: VEL.soft, tempo: 'song', overlap: 0.25, ns: 12 };
const ERRS: ErrKind[] = ['none', 'missLH', 'missRH', 'wrongLH', 'wrongRH', 'lateLH'];

interface Row {
  credit: number;
  notes: number;
  falseWrong: number;
  doubles: number;
}
const row0 = (): Row => ({ credit: 0, notes: 0, falseWrong: 0, doubles: 0 });
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');

async function songs(sim: SimOptions, est: TuningEstimator | undefined, perSong: string[]): Promise<Row> {
  const tot = row0();
  for (const s of SONGS) {
    const c: Cond = { ...COND, seed: 11, sim, autoTune: est };
    const r: Stats = s.mode === 'wait' ? await simulateWait(s.tune(), c) : await simulateTempo(s.tune(), c);
    tot.credit += r.firstTry;
    tot.notes += r.notes;
    tot.falseWrong += r.falseWrong;
    tot.doubles += r.doubles;
    perSong.push(`${s.label}: ${pct(r.firstTry, r.notes)} sai oan ${r.falseWrong}`);
  }
  return tot;
}

/** Hai tay: [ghi nhận đúng khi bé đàn đúng (RH+LH), phát hiện lỗi (quên/sai tay), sai oan "đàn nhầm" khi đúng] */
async function hands(sim: SimOptions, tuning: TuningEstimator | null): Promise<{ ok: number; okN: number; err: number; errN: number }> {
  const t = findTune('two_friends')!;
  const out = { ok: 0, okN: 0, err: 0, errN: 0 };
  let seed = 3;
  const map = tuning?.map() ?? null;
  for (const err of ERRS) {
    const o = await simulateHands(t, { vel: VEL.soft, legato: 0.15, ns: 12, err, seed: seed++, every: err === 'none' ? 1 : 2, sim, tuning: map ?? 0 });
    const both = o.groups.map((g, i) => ({ g, i })).filter((x) => x.g.together);
    both.forEach(({ g }, k) => {
      const w = o.wait[k];
      const v = (h: 'RH' | 'LH') => (w.r && w.r.conclusive ? w.r[h]?.verdict : undefined);
      const tr = o.tempo.filter((n) => n.beat === g.beat);
      const vt = (h: 'RH' | 'LH') => tr.find((n) => n.hand === h)?.verdict;
      const e = g.err;
      for (const vv of [v, vt]) {
        if (e === 'none' || e === 'lateLH') {
          out.okN += 2;
          out.ok += +(vv('RH') === 'hit') + +(vv('LH') === 'hit');
        } else {
          const hand = e.endsWith('LH') ? 'LH' : 'RH';
          out.errN++;
          out.err += +(vv(hand) !== 'hit');
        }
      }
    });
  }
  return out;
}

describe('đàn nhà lệch dây — trước / sau tự học', () => {
  const lines: string[] = [];
  for (const p of PIANOS) {
    it(p.name, { timeout: 900000 }, async () => {
      const det0: string[] = [];
      const det1: string[] = [];
      const before = await songs(p.sim, undefined, det0);
      const est = new TuningEstimator();
      const after = await songs(p.sim, est, det1);
      const st = est.stats();
      const h0 = await hands(p.sim, null);
      const h1 = await hands(p.sim, est);
      lines.push(
        `${p.name.padEnd(22)} | một tay: đúng lần đầu ${pct(before.credit, before.notes)} → ${pct(after.credit, after.notes)} (${after.notes} nốt) · ` +
          `sai oan ${before.falseWrong} → ${after.falseWrong} · đếm đôi ${before.doubles} → ${after.doubles} | ` +
          `hai tay: ghi nhận ${pct(h0.ok, h0.okN)} → ${pct(h1.ok, h1.okN)} · phát hiện lỗi ${pct(h0.err, h0.errN)} → ${pct(h1.err, h1.errN)} | ` +
          `tự học: ${describeAutoTune(st)}`,
        `   trước: ${det0.join(' · ')}`,
        `   sau:   ${det1.join(' · ')}`,
      );
      console.log(lines.slice(-3).join('\n'));
      // Tự học phải bật và gần đúng độ lệch thật (giữa: lệch cả cây; YIN đọc nốt trầm cao hơn ~13 c — lệch họa âm)
      expect(st.applied).not.toBeNull();
      expect(Math.abs(st.applied![1] - (p.sim.detuneCents ?? 0))).toBeLessThanOrEqual(8);
      // Sau khi tự học: không tệ hơn trước, đạt ngưỡng như bài đàn đúng dây
      expect(after.credit / after.notes).toBeGreaterThanOrEqual(Math.min(0.95, before.credit / before.notes));
      expect(after.falseWrong).toBeLessThanOrEqual(before.falseWrong);
      expect(after.doubles).toBe(0);
      expect(h1.ok / h1.okN).toBeGreaterThanOrEqual(Math.min(0.9, h0.ok / h0.okN));
      expect(h1.err / h1.errN).toBeGreaterThanOrEqual(Math.min(0.85, h0.err / h0.errN) - 0.03);
    });
  }
});
