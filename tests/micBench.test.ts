import { describe, expect, it } from 'vitest';
import { nearestNote, type PitchResult, type HeardNote } from '../src/audio/pitchDetect';
import { MicAnalyzer } from '../src/audio/micAnalyzer';
import { renderPiano, SIM_RATE, type SimNote, type SimOptions } from './pianoSim';

/**
 * ĐO ĐỘ CHÍNH XÁC MICRO trên tín hiệu giả lập đàn cơ thật.
 * Chạy: npx vitest run tests/micBench.test.ts  (in bảng kết quả)
 */

// ---------- Bộ cũ (để so sánh): YIN ngưỡng 0.15 không dự phòng, độ rõ ≥ 0.8, ổn định 3 khung, onset ×1.6 giữa khung rõ ----------
function oldDetect(buf: Float32Array, sr: number): PitchResult | null {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  const level = Math.sqrt(s / buf.length);
  if (level < 0.01) return null;
  const tauMin = Math.floor(sr / 1400);
  const tauMax = Math.min(Math.floor(sr / 60), Math.floor(buf.length / 2));
  const W = buf.length - tauMax;
  const c = new Float32Array(tauMax + 1);
  c[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let d = 0;
    for (let j = 0; j < W; j++) {
      const x = buf[j] - buf[j + tau];
      d += x * x;
    }
    run += d;
    c[tau] = run > 0 ? (d * tau) / run : 1;
  }
  for (let t = tauMin; t <= tauMax; t++) {
    if (c[t] < 0.15) {
      while (t + 1 <= tauMax && c[t + 1] < c[t]) t++;
      return { freq: sr / t, clarity: 1 - c[t], rms: level };
    }
  }
  return null;
}
class OldTracker {
  cand: number | null = null;
  count = 0;
  emitted: number | null = null;
  lastRms = 0;
  blocked = false;
  push(r: PitchResult | null): HeardNote | null {
    if (!r || r.clarity < 0.8) {
      if (!r) {
        this.emitted = null;
        this.lastRms = 0;
        this.blocked = false;
      }
      this.cand = null;
      this.count = 0;
      return null;
    }
    const onset = this.lastRms > 0 && r.rms > this.lastRms * 1.6;
    this.lastRms = r.rms;
    if (onset) {
      this.emitted = null;
      this.cand = null;
      this.count = 0;
      this.blocked = false;
    }
    if (this.blocked) return null;
    const n = nearestNote(r.freq);
    if (n.midi === this.cand) this.count++;
    else {
      this.cand = n.midi;
      this.count = 1;
    }
    if (this.count >= 3 && this.emitted !== n.midi) {
      this.emitted = n.midi;
      return n;
    }
    return null;
  }
}

type Pipeline = (buf: Float32Array, t: number) => HeardNote | null;
const oldPipeline = (): Pipeline => {
  const tr = new OldTracker();
  return (buf) => tr.push(oldDetect(buf, SIM_RATE));
};
const newPipeline = (): Pipeline => {
  const a = new MicAnalyzer();
  return (buf, t) => a.process(buf, SIM_RATE, t).note;
};

interface Score {
  played: number;
  ok: number;
  octave: number;
  wrong: number;
  missed: number;
  extra: number;
  latency: number[];
}

async function run(notes: SimNote[], pipe: Pipeline, hopMs: number, o: SimOptions = {}): Promise<Score> {
  const end = Math.max(...notes.map((n) => n.start + n.dur)) + 1.5;
  const sig = renderPiano(notes, end, o);
  const hop = Math.round((hopMs / 1000) * SIM_RATE);
  const heard: Array<{ t: number; midi: number }> = [];
  for (let i = 2048, k = 0; i < sig.length; i += hop, k++) {
    // Nhường CPU định kỳ — khối tính dài làm vitest báo "Timeout calling onTaskUpdate"
    if (k % 100 === 99) await new Promise((r) => setTimeout(r, 0));
    const n = pipe(sig.subarray(i - 2048, i), i / SIM_RATE);
    if (n) heard.push({ t: i / SIM_RATE, midi: n.midi });
  }
  const used = new Set<number>();
  const s: Score = { played: notes.length, ok: 0, octave: 0, wrong: 0, missed: 0, extra: 0, latency: [] };
  for (const n of notes) {
    // nốt nghe được đầu tiên trong [bắt đầu, bắt đầu + 0,4 s] và trước nốt kế tiếp
    const next = notes.find((m) => m.start > n.start)?.start ?? Infinity;
    const idx = heard.findIndex((h, i) => !used.has(i) && h.t >= n.start && h.t < Math.min(n.start + 0.4, next + 0.05));
    if (idx < 0) {
      s.missed++;
      continue;
    }
    used.add(idx);
    const h = heard[idx];
    if (h.midi === n.midi) {
      s.ok++;
      s.latency.push(h.t - n.start);
    } else if ((h.midi - n.midi) % 12 === 0) s.octave++;
    else s.wrong++;
  }
  s.extra = heard.length - used.size;
  return s;
}

function rnd(seed: number) {
  let x = seed;
  return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
}
function melody(pool: number[], count: number, gap: number, dur: number, seed: number, vel = [0.5, 1]): SimNote[] {
  const r = rnd(seed);
  return Array.from({ length: count }, (_, i) => ({
    midi: pool[Math.floor(r() * pool.length)],
    start: 0.3 + i * gap,
    dur,
    vel: vel[0] + r() * (vel[1] - vel[0]),
  }));
}

const C_POS = [60, 62, 64, 65, 67];
// Điều kiện "đàn cơ thật trong phòng": nhiều dây lệch, vang phòng, chưa nhả phím, tiếng nhỏ
const REAL: SimOptions = { strings: true, reverb: 0.6, legato: 0.25, gain: 0.08, noise: 0.006 };

const SCENARIOS: Array<{ name: string; notes: SimNote[] } & SimOptions> = [
  { name: 'Giai điệu tay phải (Đô–Sol)', notes: melody(C_POS, 24, 0.6, 0.45, 3) },
  {
    name: 'Nốt lặp (Mi Mi Mi Rê Rê Rê)',
    notes: [64, 64, 64, 62, 62, 62, 60, 60, 64, 64].map((m, i) => ({ midi: m, start: 0.3 + i * 0.5, dur: 0.42, vel: 0.8 })),
  },
  { name: 'Tay trái trầm (Sol2–Sol3)', notes: melody([43, 45, 47, 48, 50, 52, 53, 55], 16, 0.7, 0.55, 5) },
  { name: 'Nốt cao (Sol4–Mi5)', notes: melody([67, 69, 71, 72, 74, 76], 16, 0.6, 0.45, 9) },
  { name: 'Đàn nhẹ, phòng ồn', notes: melody(C_POS, 16, 0.7, 0.5, 11, [0.3, 0.5]), noise: 0.01 },
  { name: 'Đàn nhanh (0,35 s/nốt)', notes: melody(C_POS, 24, 0.35, 0.3, 13) },
  // ---- điều kiện thật ----
  { name: 'THẬT: giai điệu tay phải', notes: melody(C_POS, 24, 0.6, 0.45, 21), ...REAL },
  {
    name: 'THẬT: nốt lặp',
    notes: [64, 64, 64, 62, 62, 62, 60, 60, 64, 64].map((m, i) => ({ midi: m, start: 0.3 + i * 0.5, dur: 0.42, vel: 0.8 })),
    ...REAL,
  },
  { name: 'THẬT: tay trái trầm', notes: melody([43, 45, 47, 48, 50, 52, 53, 55], 16, 0.7, 0.55, 23), ...REAL },
  { name: 'THẬT: nốt cao', notes: melody([67, 69, 71, 72, 74, 76], 16, 0.6, 0.45, 25), ...REAL },
  { name: 'THẬT: đàn nhẹ', notes: melody(C_POS, 16, 0.7, 0.5, 27, [0.3, 0.5]), ...REAL, gain: 0.05 },
  { name: 'THẬT: đàn lệch dây −35 cents', notes: melody(C_POS, 16, 0.6, 0.45, 29), ...REAL, detuneCents: -35 },
  { name: 'THẬT: phòng rất ồn (TV, quạt)', notes: melody(C_POS, 16, 0.7, 0.5, 31), ...REAL, noise: 0.015, hum: 0.006 },
  { name: 'THẬT: đàn nhanh', notes: melody(C_POS, 24, 0.35, 0.3, 33), ...REAL },
];

function pct(a: number, b: number) {
  return `${Math.round((a / b) * 100)}%`;
}
function median(xs: number[]) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

describe('đo micro trên giả lập đàn cơ', () => {
  const rows: string[] = [];
  const totals = { old: { ok: 0, n: 0 }, neu: { ok: 0, n: 0 } };
  const newScores: Record<string, Score> = {};

  // So với bộ cũ chỉ khi cần (MIC_BENCH_OLD=1) — kết quả đã ghi ở TEST_REPORT §14; chạy cả hai thì rất lâu
  const withOld = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MIC_BENCH_OLD;
  it.each(SCENARIOS)('$name', { timeout: 120000 }, async (sc) => {
    const a = withOld ? await run(sc.notes, oldPipeline(), 40, sc) : null;
    const b = await run(sc.notes, newPipeline(), 25, sc);
    newScores[sc.name] = b;
    totals.old.ok += a?.ok ?? 0;
    totals.old.n += a?.played ?? 0;
    totals.neu.ok += b.ok;
    totals.neu.n += b.played;
    rows.push(
      `${sc.name.padEnd(30)} | ` +
        (a ? `CŨ đúng ${pct(a.ok, a.played).padStart(4)} quãng8 ${a.octave} sai ${a.wrong} sót ${a.missed} thừa ${a.extra} trễ ${Math.round(median(a.latency) * 1000)}ms` : '') +
        ` || MỚI đúng ${pct(b.ok, b.played).padStart(4)} quãng8 ${b.octave} sai ${b.wrong} sót ${b.missed} thừa ${b.extra} trễ ${Math.round(median(b.latency) * 1000)}ms`,
    );
    expect(b.played).toBeGreaterThan(0);
  });

  it('in bảng kết quả & yêu cầu tối thiểu cho bộ mới', () => {
    console.log('\n' + rows.join('\n') + `\nTỔNG: ${withOld ? `CŨ ${pct(totals.old.ok, totals.old.n)} — ` : ''}MỚI ${pct(totals.neu.ok, totals.neu.n)}\n`);
    for (const [name, s] of Object.entries(newScores)) {
      expect(s.ok / s.played, name).toBeGreaterThanOrEqual(0.85);
      expect(s.wrong + s.octave, name).toBeLessThanOrEqual(Math.ceil(s.played * 0.08));
    }
  });
});
