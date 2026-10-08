import { describe, expect, it } from 'vitest';
import { nearestNote, type PitchResult, type HeardNote } from '../src/audio/pitchDetect';
import { MicAnalyzer, type Sensitivity } from '../src/audio/micAnalyzer';
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

type Pipeline = (buf: Float32Array, t: number, sr: number) => HeardNote | null;
/**
 * Cách app dùng micro (ngoài chạy liên tục):
 * - wait: chế độ CHỜ NỐT (song.ts / practice.ts) — nghe đúng nốt cần đàn là gọi resetTracker() (= reset(true))
 * - resets: các thời điểm app gọi resetTracker() (vd 450 ms sau khi giọng đọc "Đô, ngón 1" dứt — bé đã đàn trong lúc đọc)
 * - pre: nốt bé đàn nhưng KHÔNG chấm (vd đàn trong lúc app đang đọc tên nốt)
 */
interface Usage {
  wait?: boolean;
  resets?: number[];
  pre?: SimNote[];
  sens?: Sensitivity;
}
const oldPipeline = (): Pipeline => {
  const tr = new OldTracker();
  return (buf, _t, sr) => tr.push(oldDetect(buf, sr));
};
const newPipeline = (notes: SimNote[] = [], u: Usage = {}): Pipeline => {
  const a = new MicAnalyzer();
  if (u.sens) a.sensitivity = u.sens;
  const resets = [...(u.resets ?? [])].sort((x, y) => x - y);
  return (buf, t, sr) => {
    while (resets.length && resets[0] <= t) {
      resets.shift();
      a.reset(true);
    }
    const n = a.process(buf, sr, t).note;
    // Chế độ chờ: nốt nghe được ĐÚNG nốt đang chờ → app sang nốt sau và "xóa trí nhớ" micro
    if (n && u.wait) {
      const want = notes.find((m) => m.start <= t + 0.01 && t < m.start + 0.45);
      if (want && want.midi === n.midi) a.reset(true);
    }
    return n;
  };
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

async function run(notes: SimNote[], pipe: Pipeline, hopMs: number, o: SimOptions & Usage = {}): Promise<Score> {
  const end = Math.max(...notes.map((n) => n.start + n.dur)) + 1.5;
  const sig = renderPiano([...notes, ...(o.pre ?? [])], end, o);
  const sr = o.sampleRate ?? SIM_RATE;
  const hop = Math.round((hopMs / 1000) * sr);
  const heard: Array<{ t: number; midi: number }> = [];
  for (let i = 2048, k = 0; i < sig.length; i += hop, k++) {
    // Nhường CPU định kỳ — khối tính dài làm vitest báo "Timeout calling onTaskUpdate"
    if (k % 100 === 99) await new Promise((r) => setTimeout(r, 0));
    const n = pipe(sig.subarray(i - 2048, i), i / sr, sr);
    if (n) heard.push({ t: i / sr, midi: n.midi });
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

/**
 * iPad THẬT (OWNER 2026-10-08: "phải đánh thật to mới nghe được, ví dụ nốt Đô"): Safari tắt xử lý giọng nói
 * → micro "thô", mức thu rất nhỏ: đàn nhẹ/vừa (mp/p) ở giá nhạc ≈ −60…−66 dBFS (RMS 0,0005–0,001),
 * tiếng ồn phòng thấp hơn ~20 dB (SNR 15–25 dB). gain 0,004 + vel 0,25–0,5 ≈ đúng mức đó.
 */
const RAW: SimOptions = { strings: true, reverb: 0.6, legato: 0.25, gain: 0.004, noise: 0.00025, hum: 0.0001 };
const SOFT: [number, number] = [0.25, 0.5];
/** Bài tập tuần 4: bé đàn nốt TRONG LÚC app đọc "Đô, ngón 1" (bị bỏ qua), app xóa trí nhớ micro, bé đàn lại khẽ. */
const speechPractice = (pool: number[], seed: number): { notes: SimNote[]; pre: SimNote[]; resets: number[] } => {
  const r = rnd(seed);
  const notes: SimNote[] = [];
  const pre: SimNote[] = [];
  const resets: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t0 = 0.3 + i * 2.4;
    const midi = pool[Math.floor(r() * pool.length)];
    pre.push({ midi, start: t0, dur: 0.6, vel: 0.3 + r() * 0.2 }); // đàn lúc app đang đọc
    resets.push(t0 + 0.6); // giọng đọc dứt + 450 ms → resetTracker()
    notes.push({ midi, start: t0 + 1.0, dur: 0.9, vel: 0.25 + r() * 0.25 }); // nhả phím rồi đàn lại, khẽ hơn
  }
  return { notes, pre, resets };
};

const SCENARIOS: Array<{ name: string; notes: SimNote[]; min?: number } & SimOptions & Usage> = [
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
  // ---- iPad cũ / tai nghe Bluetooth: 44,1 kHz ----
  { name: '44,1k: giai điệu tay phải', notes: melody(C_POS, 24, 0.6, 0.45, 41), ...REAL, sampleRate: 44100 },
  { name: '44,1k: tay trái trầm', notes: melody([43, 45, 47, 48, 50, 52, 53, 55], 16, 0.7, 0.55, 43), ...REAL, sampleRate: 44100 },
  { name: '44,1k: nốt cao', notes: melody([67, 69, 71, 72, 74, 76], 16, 0.6, 0.45, 45), ...REAL, sampleRate: 44100 },
  // ---- iPad thật (OWNER 2026-10-06 "nghe được nhưng chưa tốt"): micro khởi động trả toàn 0; iOS ép bật AGC ----
  { name: 'iOS: micro khởi động (0,25 s)', notes: melody(C_POS, 24, 0.6, 0.45, 51), ...REAL, warmup: 0.25 },
  { name: 'iOS: tự chỉnh âm lượng (AGC)', notes: melody(C_POS, 24, 0.6, 0.45, 53), ...REAL, agc: 4 },
  { name: 'iOS: AGC + 44,1k + đàn nhẹ', notes: melody(C_POS, 16, 0.7, 0.5, 55, [0.3, 0.5]), ...REAL, gain: 0.05, agc: 4, sampleRate: 44100, warmup: 0.2 },
  // ---- máy đếm nhịp kêu cùng lúc (tiếng tích lọt vào micro, KHÔNG bịt tai) ----
  {
    name: 'THẬT + tiếng tích đếm nhịp',
    notes: melody(C_POS, 16, 0.6, 0.45, 47),
    ...REAL,
    clicks: Array.from({ length: 32 }, (_, i) => ({ t: 0.3 + i * 0.3, accent: i % 4 === 0 })),
    clickLevel: 0.4,
  },
  // ---- iPad thô, ĐÀN NHẸ (OWNER 2026-10-08) — yêu cầu ≥ 90% ----
  { name: 'NHẸ: Đô–Sol tay phải (−62 dBFS)', notes: melody(C_POS, 20, 0.7, 0.55, 61, SOFT), ...RAW, min: 0.9 },
  { name: 'NHẸ: Đô3–Sol3 tay trái', notes: melody([48, 50, 52, 53, 55], 16, 0.8, 0.6, 63, SOFT), ...RAW, min: 0.9 },
  { name: 'NHẸ: Đô4/Đô3 ngân dài', notes: [60, 48, 60, 64, 48, 60, 55, 60, 48, 60].map((m, i) => ({ midi: m, start: 0.3 + i * 1.3, dur: 1.2, vel: 0.25 + (i % 3) * 0.1 })), ...RAW, min: 0.9 },
  { name: 'NHẸ: chờ nốt (reset mỗi nốt), legato', notes: melody(C_POS, 20, 0.6, 0.55, 65, SOFT), ...RAW, legato: 0.35, wait: true, min: 0.9 },
  {
    name: 'NHẸ: nốt lặp khi chờ (Đô Đô Đô Rê Rê)',
    notes: [60, 60, 60, 62, 62, 60, 60, 64, 64, 60].map((m, i) => ({ midi: m, start: 0.3 + i * 0.6, dur: 0.5, vel: 0.3 + (i % 2) * 0.1 })),
    ...RAW,
    wait: true,
    min: 0.9,
  },
  { name: 'NHẸ: đọc tên nốt rồi đàn lại', ...speechPractice(C_POS, 67), ...RAW, min: 0.9 },
  {
    name: 'NHẸ sau TO: chờ nốt, legato',
    notes: melody(C_POS, 20, 0.6, 0.55, 77).map((n, i) => ({ ...n, vel: i % 2 ? 0.25 : 0.9 })),
    ...RAW,
    legato: 0.4,
    wait: true,
    min: 0.9,
  },
  {
    name: 'NHẸ sau TO: giữ phím cũ 1 s (chờ nốt)',
    notes: melody(C_POS, 16, 0.8, 0.7, 79).map((n, i) => ({ ...n, vel: i % 2 ? 0.3 : 0.9 })),
    ...RAW,
    legato: 1.0,
    wait: true,
    min: 0.9,
  },
  {
    name: 'NHẸ: Đô lặp to→nhẹ (chờ nốt)',
    notes: Array.from({ length: 12 }, (_, i) => ({ midi: i % 4 < 2 ? 60 : 48, start: 0.3 + i * 0.7, dur: 0.62, vel: i % 2 ? 0.28 : 0.85 })),
    ...RAW,
    wait: true,
    min: 0.9,
  },
  { name: 'NHẸ: iOS lọc ồn (NS −12 dB)', notes: melody(C_POS, 20, 0.7, 0.55, 69, SOFT), ...RAW, ns: 12, min: 0.9 },
  { name: 'NHẸ: NS + AGC, Đô3/Đô4 ngân', notes: [60, 48, 60, 62, 48, 64, 60, 55, 48, 60, 67, 60].map((m, i) => ({ midi: m, start: 0.3 + i * 1.1, dur: 1.0, vel: 0.25 + (i % 3) * 0.12 })), ...RAW, ns: 12, agc: 3, min: 0.9 },
  { name: 'NHẸ: NS + chờ nốt + legato', notes: melody([48, 52, 55, 60, 62, 64, 65, 67], 20, 0.65, 0.6, 71, SOFT), ...RAW, ns: 10, legato: 0.3, wait: true, min: 0.9 },
  { name: 'NHẸ: 44,1k, SNR 15 dB', notes: melody(C_POS, 16, 0.7, 0.55, 73, SOFT), ...RAW, noise: 0.0005, hum: 0.0002, sampleRate: 44100, min: 0.9 },
  // Buổi tập dài (40 s đàn liên tục, vang nhiều): mức ồn nền không được "leo" lên theo đuôi nốt rồi nuốt nốt nhẹ
  {
    name: 'NHẸ: buổi tập dài 40 s, vang nhiều',
    notes: melody(C_POS, 60, 0.65, 0.6, 75).map((n, i) => (i >= 40 ? { ...n, vel: 0.25 + (n.vel ?? 0.5) * 0.3 } : n)),
    ...RAW,
    reverb: 0.9,
    min: 0.9,
  },
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
  const mins: Record<string, number> = Object.fromEntries(SCENARIOS.map((sc) => [sc.name, sc.min ?? 0.85]));

  // So với bộ cũ chỉ khi cần (MIC_BENCH_OLD=1) — kết quả đã ghi ở TEST_REPORT §14; chạy cả hai thì rất lâu
  const withOld = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MIC_BENCH_OLD;
  it.each(SCENARIOS)('$name', { timeout: 120000 }, async (sc) => {
    const a = withOld ? await run(sc.notes, oldPipeline(), 40, sc) : null;
    const b = await run(sc.notes, newPipeline(sc.notes, sc), 25, sc);
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
      expect(s.ok / s.played, name).toBeGreaterThanOrEqual(mins[name]);
      expect(s.wrong + s.octave, name).toBeLessThanOrEqual(Math.ceil(s.played * 0.08));
    }
  });
});
