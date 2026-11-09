/**
 * (+ 2026-11-09) SO SÁNH BỘ NGHE MICRO trên TIẾNG ĐÀN PIANO THU THẬT (Salamander Grand Piano, CC-BY — mẫu của Tone.js),
 * không phải tiếng đàn giả lập: (A) MicAnalyzer hiện tại của app (YIN + nhiều luật) với (B) basic-pitch của Spotify
 * (mạng nơ-ron nhỏ, Apache-2.0, nghe được nhiều nốt cùng lúc), chạy kiểu "trực tiếp" (cửa sổ 2 s trượt mỗi 100 ms).
 * Chạy: npm i --no-save @spotify/basic-pitch@1.0.1 (chỉ để đo, app KHÔNG dùng) · npx vite --port 5173 ·
 * BENCH_URL=http://localhost:5173/scripts/micbench/index.html node scripts/micbench/run.mjs (?only=Hai: chỉ bài hai tay).
 * KẾT QUẢ 2026-11-09: một tay — bộ hiện tại 100% mọi điều kiện (khẽ, ồn, lệch dây, nhanh, trầm, cao); basic-pitch 100% nhưng
 * thêm nốt thừa và chậm hơn (100 ms so với 68 ms). Hai tay — twoHand.ts của app 84–88% đúng cả hai tay, basic-pitch 25–59%.
 * → KHÔNG thay bộ nghe; lỗi ở nhà cần dữ liệu thật (nút "🙉 App nghe sai", src/audio/micClaims.ts).
 */
import * as tf from '@tensorflow/tfjs';
import { MicAnalyzer, type Sensitivity } from '../../src/audio/micAnalyzer';
import { analyzeHands } from '../../src/audio/twoHand';

interface Note {
  midi: number;
  start: number;
  dur: number;
  vel: number;
  /** bè tay trái (hợp âm) — không bắt buộc bộ nghe một nốt phải nghe ra */
  lh?: boolean;
}
interface Opts {
  /** RMS mục tiêu của phần có tiếng đàn (0,02 ≈ −34 dBFS: đàn vừa, iPad gần; 0,0015 ≈ −56 dBFS: đàn khẽ, micro "thô") */
  level: number;
  /** Tỉ số tín hiệu / ồn (dB) */
  snr: number;
  reverb: number;
  detune?: number;
  sens?: Sensitivity;
}
interface Heard {
  t: number;
  midi: number;
}

const out = document.getElementById('out')!;
const log = (s: string) => (out.textContent += '\n' + s);

// ---------------------------------------------------------------- mẫu đàn thật
const NAMES: Array<[string, number]> = [
  ['C', 0],
  ['Ds', 3],
  ['Fs', 6],
  ['A', 9],
];
const samples: Array<{ midi: number; buf: AudioBuffer }> = [];
async function loadSamples(ctx: BaseAudioContext) {
  for (let o = 1; o <= 7; o++)
    for (const [n, k] of NAMES) {
      const r = await fetch(`./samples/${n}${o}.mp3`);
      const buf = await ctx.decodeAudioData(await r.arrayBuffer());
      samples.push({ midi: 12 * (o + 1) + k, buf });
    }
}
const nearest = (m: number) => samples.reduce((a, b) => (Math.abs(b.midi - m) < Math.abs(a.midi - m) ? b : a));

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

async function render(notes: Note[], o: Opts, seed: number): Promise<Float32Array> {
  const SR = 48000;
  const end = Math.max(...notes.map((n) => n.start + n.dur)) + 1.5;
  const ctx = new OfflineAudioContext(1, Math.ceil(end * SR), SR);
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = o.reverb;
  const conv = ctx.createConvolver();
  // tiếng vang phòng: nhiễu tắt dần (RT60 ≈ 0,7 s)
  const ir = ctx.createBuffer(1, SR * 1.2, SR);
  const d = ir.getChannelData(0);
  const r = rng(seed + 7);
  for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1) * Math.exp(-i / (SR * 0.1));
  conv.buffer = ir;
  dry.connect(ctx.destination);
  dry.connect(conv).connect(wet).connect(ctx.destination);
  for (const n of notes) {
    const s = nearest(n.midi);
    const src = ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = Math.pow(2, (n.midi - s.midi + (o.detune ?? 0) / 100) / 12);
    const g = ctx.createGain();
    g.gain.value = Math.pow(n.vel, 1.6);
    g.gain.setValueAtTime(Math.pow(n.vel, 1.6), n.start + n.dur);
    g.gain.setTargetAtTime(0, n.start + n.dur, 0.07); // tiêu âm khi nhả phím
    src.connect(g).connect(dry);
    src.start(n.start);
    src.stop(n.start + n.dur + 0.8);
  }
  const buf = await ctx.startRendering();
  const x = buf.getChannelData(0);
  // chuẩn hóa: RMS phần có tiếng = level
  let s = 0;
  let c = 0;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]) > 1e-4) {
      s += x[i] * x[i];
      c++;
    }
  }
  const k = o.level / Math.sqrt(s / Math.max(1, c));
  const noise = o.level / Math.pow(10, o.snr / 20);
  const rn = rng(seed);
  let b0 = 0;
  let b1 = 0;
  for (let i = 0; i < x.length; i++) {
    // ồn phòng hơi "hồng" + ù 50 Hz
    const w = rn() * 2 - 1;
    b0 = 0.99 * b0 + 0.1 * w;
    b1 = 0.6 * b1 + 0.4 * w;
    x[i] = x[i] * k + noise * (0.7 * b0 + 0.5 * b1 + 0.3 * Math.sin((2 * Math.PI * 50 * i) / SR));
  }
  return x;
}

async function resample(x: Float32Array, from: number, to: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil((x.length * to) / from), to);
  const b = ctx.createBuffer(1, x.length, from);
  b.copyToChannel(x, 0);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start();
  return (await ctx.startRendering()).getChannelData(0);
}

// ---------------------------------------------------------------- (A) bộ nghe hiện tại
function runCurrent(x: Float32Array, sens: Sensitivity = 'normal'): Heard[] {
  const a = new MicAnalyzer();
  a.sensitivity = sens;
  const SR = 48000;
  const hop = Math.round(0.025 * SR);
  const heard: Heard[] = [];
  for (let i = 2048; i < x.length; i += hop) {
    const n = a.process(x.subarray(i - 2048, i), SR, i / SR).note;
    if (n) heard.push({ t: i / SR, midi: n.midi });
  }
  return heard;
}

// ---------------------------------------------------------------- (B) basic-pitch kiểu trực tiếp
const BP_SR = 22050;
const BP_N = BP_SR * 2 - 256; // 43844 mẫu
const FPS = BP_SR / 256;
let model: tf.GraphModel;
const timing: number[] = [];
async function runModel(x22: Float32Array, hopS = 0.1, edgeFrames = 3, onTh = 0.5, frTh = 0.3): Promise<Heard[]> {
  const heard: Heard[] = [];
  const last = new Map<number, number>();
  const hop = Math.round(hopS * BP_SR);
  for (let end = hop; end < x22.length + hop; end += hop) {
    const win = new Float32Array(BP_N);
    const from = end - BP_N;
    win.set(x22.subarray(Math.max(0, from), end), Math.max(0, -from));
    const t0 = performance.now();
    const res = tf.tidy(() => model.execute(tf.tensor(win, [1, BP_N, 1]), ['Identity_1', 'Identity_2']) as tf.Tensor[]);
    const [fr, on] = await Promise.all(res.map((r) => r.array() as Promise<number[][][]>));
    res.forEach((r) => r.dispose());
    timing.push(performance.now() - t0);
    const frames = fr[0];
    const onsets = on[0];
    const nF = onsets.length;
    // vùng mới của cửa sổ này: hop gần nhất, trừ vài khung ở mép (mép cửa sổ kém tin cậy)
    const hi = nF - 1 - edgeFrames;
    const lo = Math.max(1, hi - Math.round(hopS * FPS) + 1);
    const tEnd = end / BP_SR;
    for (let f = lo; f <= hi; f++) {
      for (let p = 0; p < 88; p++) {
        const v = onsets[f][p];
        if (v < onTh || v < onsets[f - 1][p] || (f + 1 < nF && v < onsets[f + 1][p])) continue;
        // nốt phải kêu thật vài khung sau (không chỉ tiếng búa)
        const ff = Math.min(nF - 1, f + 2);
        if (Math.max(frames[f][p], frames[ff][p]) < frTh) continue;
        const midi = p + 21;
        const tNote = tEnd - (nF - 1 - f) / FPS;
        if ((last.get(midi) ?? -9) > tNote - 0.15) continue;
        last.set(midi, tNote);
        heard.push({ t: tEnd, midi }); // t = lúc BÁO (đã có kết quả)
      }
    }
  }
  return heard;
}

// ---------------------------------------------------------------- chấm điểm
interface Score {
  played: number;
  ok: number;
  octave: number;
  wrong: number;
  missed: number;
  extra: number;
  lat: number[];
  lhPlayed: number;
  lhOk: number;
}
function score(notes: Note[], heard: Heard[], win = 0.5): Score {
  const used = new Set<number>();
  const mel = notes.filter((n) => !n.lh);
  const s: Score = { played: mel.length, ok: 0, octave: 0, wrong: 0, missed: 0, extra: 0, lat: [], lhPlayed: 0, lhOk: 0 };
  // hợp âm tay trái: đếm riêng (bộ nghe một nốt không bắt buộc)
  for (const n of notes.filter((m) => m.lh)) {
    s.lhPlayed++;
    const i = heard.findIndex((h, k) => !used.has(k) && h.midi === n.midi && h.t >= n.start && h.t < n.start + win);
    if (i >= 0) {
      used.add(i);
      s.lhOk++;
    }
  }
  for (const n of mel) {
    const next = mel.find((m) => m.start > n.start)?.start ?? Infinity;
    const lim = Math.min(n.start + win, next + 0.08);
    let i = heard.findIndex((h, k) => !used.has(k) && h.midi === n.midi && h.t >= n.start && h.t < lim);
    if (i < 0) i = heard.findIndex((h, k) => !used.has(k) && h.t >= n.start && h.t < lim);
    if (i < 0) {
      s.missed++;
      continue;
    }
    used.add(i);
    const h = heard[i];
    if (h.midi === n.midi) {
      s.ok++;
      s.lat.push(h.t - n.start);
    } else if ((h.midi - n.midi) % 12 === 0) s.octave++;
    else s.wrong++;
  }
  // nốt "thừa": nghe ra mà không khớp nốt nào; nốt trùng hợp âm đang vang không tính
  s.extra = heard.filter((h, k) => !used.has(k) && !notes.some((n) => n.midi === h.midi && h.t >= n.start && h.t < n.start + n.dur + 0.3)).length;
  return s;
}

// ---------------------------------------------------------------- chấm HAI TAY theo nhóm (app biết nốt cần đàn)
interface Group {
  t: number;
  RH: number[];
  LH: number[];
}
function groups(notes: Note[]): Group[] {
  const by = new Map<number, Group>();
  for (const n of notes) {
    const k = Math.round(n.start * 1000);
    const g = by.get(k) ?? { t: n.start, RH: [], LH: [] };
    (n.lh ? g.LH : g.RH).push(n.midi);
    by.set(k, g);
  }
  return [...by.values()].sort((a, b) => a.t - b.t);
}
interface HandsScore {
  groups: number;
  rh: number;
  rhOk: number;
  lh: number;
  lhOk: number;
  both: number;
  bothOk: number;
  inconclusive: number;
}
const emptyHS = (): HandsScore => ({ groups: 0, rh: 0, rhOk: 0, lh: 0, lhOk: 0, both: 0, bothOk: 0, inconclusive: 0 });
/** (A) twoHand.ts của app — gọi đúng lần gõ thật (+10 ms như bộ bắt gõ) */
function handsCurrent(notes: Note[], x: Float32Array): HandsScore {
  const s = emptyHS();
  for (const g of groups(notes)) {
    s.groups++;
    const r = analyzeHands(x, 48000, Math.round((g.t + 0.01) * 48000), { RH: g.RH.length ? g.RH : undefined, LH: g.LH.length ? g.LH : undefined });
    if (!r.conclusive) s.inconclusive++;
    const rhOk = !!g.RH.length && r.conclusive && r.RH?.verdict === 'hit';
    const lhOk = !!g.LH.length && r.conclusive && r.LH?.verdict === 'hit';
    if (g.RH.length) (s.rh++, rhOk && s.rhOk++);
    if (g.LH.length) (s.lh++, lhOk && s.lhOk++);
    if (g.RH.length && g.LH.length) (s.both++, rhOk && lhOk && s.bothOk++);
  }
  return s;
}
/** (B) basic-pitch: tay đúng khi MỌI nốt của tay được nghe ra trong [gõ, gõ + 0,5 s] */
function handsModel(notes: Note[], heard: Heard[]): HandsScore {
  const s = emptyHS();
  const has = (m: number, t: number) => heard.some((h) => h.midi === m && h.t >= t && h.t < t + 0.5);
  for (const g of groups(notes)) {
    s.groups++;
    const rhOk = !!g.RH.length && g.RH.every((m) => has(m, g.t));
    const lhOk = !!g.LH.length && g.LH.every((m) => has(m, g.t));
    if (g.RH.length) (s.rh++, rhOk && s.rhOk++);
    if (g.LH.length) (s.lh++, lhOk && s.lhOk++);
    if (g.RH.length && g.LH.length) (s.both++, rhOk && lhOk && s.bothOk++);
  }
  return s;
}

// ---------------------------------------------------------------- bài thử
function melody(pool: number[], count: number, gap: number, seed: number, vel: [number, number] = [0.5, 1], dur = gap * 0.9): Note[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => ({ midi: pool[Math.floor(r() * pool.length)], start: 0.4 + i * gap, dur, vel: vel[0] + r() * (vel[1] - vel[0]) }));
}
const C_POS = [60, 62, 64, 65, 67];
const LOW = [48, 50, 52, 53, 55];
const HIGH = [72, 74, 76, 77, 79, 81, 83, 84];
function withChords(mel: Note[], bar: number): Note[] {
  const chords = [
    [48, 52, 55],
    [48, 53, 57],
    [47, 50, 55],
    [48, 52, 55],
  ];
  const out = [...mel];
  const end = Math.max(...mel.map((n) => n.start + n.dur));
  for (let t = 0.4, k = 0; t < end; t += bar, k++) for (const m of chords[k % 4]) out.push({ midi: m, start: t, dur: bar * 0.95, vel: 0.45, lh: true });
  return out;
}
function repeats(seed: number): Note[] {
  const r = rng(seed);
  const out: Note[] = [];
  let t = 0.4;
  for (let i = 0; i < 12; i++) {
    const m = C_POS[Math.floor(r() * 5)];
    for (let k = 0; k < 2; k++, t += 0.35) out.push({ midi: m, start: t, dur: 0.3, vel: 0.5 + r() * 0.4 });
  }
  return out;
}

const NORMAL: Opts = { level: 0.02, snr: 35, reverb: 0.25 };
const SOFT: Opts = { level: 0.0015, snr: 20, reverb: 0.35 };
const SCENES: Array<{ name: string; notes: (seed: number) => Note[]; o: Opts }> = [
  { name: 'Thế Đô, đàn vừa', notes: (s) => melody(C_POS, 16, 0.6, s), o: NORMAL },
  { name: 'Thế Đô, đàn KHẼ (micro thô)', notes: (s) => melody(C_POS, 16, 0.6, s, [0.25, 0.5]), o: SOFT },
  { name: 'Đàn nhanh + nốt lặp', notes: repeats, o: NORMAL },
  { name: 'Tay trái nốt trầm (Đô3)', notes: (s) => melody(LOW, 16, 0.6, s), o: NORMAL },
  { name: 'Nốt cao (Đô5–Đô6)', notes: (s) => melody(HIGH, 16, 0.5, s), o: NORMAL },
  { name: 'Hai tay: giai điệu + hợp âm', notes: (s) => withChords(melody(C_POS.map((m) => m + 7), 16, 0.6, s), 2.4), o: NORMAL },
  { name: 'Hai tay KHẼ (micro thô)', notes: (s) => withChords(melody(C_POS.map((m) => m + 7), 16, 0.6, s, [0.3, 0.55]), 2.4), o: SOFT },
  { name: 'Hai tay: hợp âm mỗi phách', notes: (s) => withChords(melody(C_POS.map((m) => m + 7), 16, 0.6, s), 0.6), o: NORMAL },
  { name: 'Đàn lâu chưa lên dây (−35 cents)', notes: (s) => melody(C_POS, 16, 0.6, s), o: { ...NORMAL, detune: -35 } },
  { name: 'Phòng ồn (SNR 12 dB)', notes: (s) => melody(C_POS, 16, 0.6, s), o: { ...NORMAL, snr: 12 } },
];

async function main() {
  await tf.ready();
  log(`tfjs backend: ${tf.getBackend()}`);
  model = await tf.loadGraphModel('/node_modules/@spotify/basic-pitch/model/model.json');
  const ac = new OfflineAudioContext(1, 1, 48000);
  await loadSamples(ac);
  log(`${samples.length} mẫu đàn thật`);
  const results: Array<Record<string, unknown>> = [];
  const only = new URLSearchParams(location.search).get('only');
  for (const sc of SCENES.filter((x) => !only || x.name.includes(only))) {
    const agg: Record<string, Score> = {};
    const handsAgg: Record<string, HandsScore> = {};
    for (const seed of [1, 2]) {
      const notes = sc.notes(seed);
      const x = await render(notes, sc.o, seed);
      const x22 = await resample(x, 48000, BP_SR);
      const runs: Record<string, Heard[]> = {
        'A hiện tại': runCurrent(x, sc.o.sens),
        'A nhạy cao': runCurrent(x, 'high'),
        'B basic-pitch': await runModel(x22),
      };
      if (notes.some((n) => n.lh)) {
        const hs: Record<string, HandsScore> = { 'A twoHand': handsCurrent(notes, x), 'B basic-pitch': handsModel(notes, runs['B basic-pitch']) };
        for (const [k, v] of Object.entries(hs)) {
          const a = (handsAgg[k] ??= emptyHS());
          for (const f of Object.keys(v) as Array<keyof HandsScore>) a[f] += v[f];
        }
      }
      for (const [k, h] of Object.entries(runs)) {
        const s = score(notes, h);
        const a = (agg[k] ??= { played: 0, ok: 0, octave: 0, wrong: 0, missed: 0, extra: 0, lat: [], lhPlayed: 0, lhOk: 0 });
        for (const f of ['played', 'ok', 'octave', 'wrong', 'missed', 'extra', 'lhPlayed', 'lhOk'] as const) a[f] += s[f];
        a.lat.push(...s.lat);
      }
    }
    for (const [k, a] of Object.entries(agg)) {
      const lat = [...a.lat].sort((p, q) => p - q);
      const row = {
        scene: sc.name,
        algo: k,
        ok: `${a.ok}/${a.played}`,
        pct: Math.round((100 * a.ok) / a.played),
        octave: a.octave,
        wrong: a.wrong,
        missed: a.missed,
        extra: a.extra,
        lh: a.lhPlayed ? `${a.lhOk}/${a.lhPlayed}` : '',
        latMs: lat.length ? Math.round(lat[Math.floor(lat.length / 2)] * 1000) : null,
      };
      results.push(row);
      log(JSON.stringify(row));
    }
    for (const [k, a] of Object.entries(handsAgg)) {
      const row = { scene: sc.name + ' [nhóm hai tay]', algo: k, ok: `tay phải ${a.rhOk}/${a.rh}`, pct: Math.round((100 * a.bothOk) / Math.max(1, a.both)), octave: 0, wrong: 0, missed: 0, extra: a.inconclusive, lh: `${a.lhOk}/${a.lh}`, latMs: null };
      results.push(row);
      log(JSON.stringify(row));
    }
  }
  const tm = [...timing].sort((p, q) => p - q);
  const perf = { inferMsMedian: Math.round(tm[Math.floor(tm.length / 2)]), inferMsP90: Math.round(tm[Math.floor(tm.length * 0.9)]), n: tm.length };
  log(JSON.stringify(perf));
  (window as unknown as { __bench: unknown }).__bench = { results, perf, backend: tf.getBackend() };
}
main().catch((e) => {
  log('LỖI ' + (e?.stack ?? e));
  (window as unknown as { __bench: unknown }).__bench = { error: String(e?.stack ?? e) };
});
