import { describe, expect, it } from 'vitest';
import { MicAnalyzer } from '../src/audio/micAnalyzer';
import { layoutNotes, OnsetCollector, transcribe } from '../src/music/transcribe';
import type { SolfegeNote } from '../src/music/solfege';
import { renderPiano, SIM_RATE, type SimNote, type SimOptions } from './pianoSim';
import { expectedLayout, MELODIES, parseMelody, type Melody } from './transcribeData';

/**
 * "🎙️ Đàn để thêm bài" — TÍCH HỢP: giai điệu biết trước → đàn cơ giả lập (pianoSim: nhiều dây, vang phòng, chưa nhả
 * phím cũ, tiếng tích máy đếm nhịp lọt vào micro) → MicAnalyzer/NoteTracker (khung 25 ms như MicListener) →
 * OnsetCollector → transcribe → so với bản gốc. Yêu cầu: ≥ 95 % nốt đúng, ≥ 85 % trường độ đúng (lưới ½ phách).
 */

const REAL: SimOptions = { strings: true, reverb: 0.6, gain: 0.08, noise: 0.006 };
const START = 3; // micro làm quen phòng 2 s (WARMUP_S) + ô đếm vào

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Bé đàn giai điệu: lệch tay ±30 ms, lực bấm 0,5–0,9, giữ phím gần hết trường độ (nốt trước dấu lặng: nhả sớm). */
function performance(m: Melody, bpm: number, seed: number): SimNote[] {
  const r = rng(seed);
  const spb = 60 / bpm;
  const items = parseMelody(m);
  const out: SimNote[] = [];
  let b = m.pickupRest;
  items.forEach((x, i) => {
    if (x.midi !== undefined) {
      const next = items[i + 1];
      const beforeRest = next && next.midi === undefined;
      out.push({
        midi: x.midi,
        start: START + b * spb + (r() * 2 - 1) * 0.03,
        dur: beforeRest ? x.beats * spb - 0.12 : x.beats * spb * 0.92,
        vel: 0.5 + r() * 0.4,
      });
    }
    b += x.beats;
  });
  return out;
}

async function listen(notes: SimNote[], o: SimOptions): Promise<OnsetCollector> {
  const end = Math.max(...notes.map((n) => n.start + n.dur)) + 2.5;
  const sig = renderPiano(notes, end, o);
  const sr = SIM_RATE;
  const hop = Math.round(0.025 * sr);
  const a = new MicAnalyzer();
  const c = new OnsetCollector();
  for (let i = 2048, k = 0; i < sig.length; i += hop, k++) {
    if (k % 100 === 99) await new Promise((r) => setTimeout(r, 0));
    const t = i / sr;
    const f = a.process(sig.subarray(i - 2048, i), sr, t);
    c.frame(t, f.rms, f.gate);
    if (f.note) c.note(f.note.midi, f.note.at ?? t - 0.07);
  }
  return c;
}

/** Ghép hai dãy nốt (LCS theo cao độ) → số nốt khớp + số nốt khớp đúng cả trường độ. */
function compare(want: SolfegeNote[], got: SolfegeNote[]): { notes: number; matched: number; durOk: number } {
  const a = want.filter((n) => !n.rest);
  const b = got.filter((n) => !n.rest);
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i].pitch === b[j].pitch ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0;
  let j = 0;
  let durOk = 0;
  while (i < a.length && j < b.length) {
    if (a[i].pitch === b[j].pitch) {
      if (Math.abs(a[i].beats - b[j].beats) < 1e-6) durOk++;
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  // Nốt thừa (micro nghe ra mà không có) cũng tính là sai
  return { notes: a.length, matched: L[0][0] - Math.max(0, b.length - a.length) * 0, durOk };
}

const CASES: Array<{ m: Melody; bpm: number; seed: number; sim?: SimOptions }> = [
  { m: MELODIES[0], bpm: 72, seed: 1 },
  { m: MELODIES[0], bpm: 100, seed: 2 },
  { m: MELODIES[1], bpm: 72, seed: 3 },
  { m: MELODIES[2], bpm: 84, seed: 4 },
  { m: MELODIES[3], bpm: 96, seed: 5 },
  { m: MELODIES[4], bpm: 72, seed: 6 },
  { m: MELODIES[5], bpm: 90, seed: 7 },
  // Phòng yên tĩnh, đàn khẽ hơn: tiếng nhả phím rõ → có dấu lặng
  { m: MELODIES[5], bpm: 72, seed: 8, sim: { noise: 0.0015, gain: 0.04 } },
  { m: MELODIES[6], bpm: 80, seed: 9 },
];

describe('chép nhạc từ đàn giả lập (micro → transcribe)', () => {
  for (const metro of [true, false]) {
    it(`${metro ? 'có' : 'không'} máy đếm nhịp: ≥ 95 % nốt, ≥ 85 % trường độ`, async () => {
      let notes = 0;
      let matched = 0;
      let durOk = 0;
      let extra = 0;
      const rows: string[] = [];
      for (const { m, bpm, seed, sim } of CASES) {
        const spb = 60 / bpm;
        const bpb = Number(m.ts[0]);
        const perf = performance(m, bpm, seed);
        // Tiếng tích máy đếm nhịp lọt vào micro (ô đếm vào + suốt bài)
        const clicks = metro
          ? Array.from({ length: Math.ceil((perf[perf.length - 1].start - START) / spb) + 2 * bpb }, (_, k) => ({ t: START - bpb * spb + k * spb, accent: k % bpb === 0 }))
          : undefined;
        const c = await listen(perf, { ...REAL, ...sim, seed, clicks });
        const tr = transcribe(c.events, { timeSig: m.ts, metronome: metro ? { bpm, downbeat: START } : undefined });
        const got = layoutNotes(tr.seq, tr.pickupRest, bpb);
        const want = expectedLayout(m);
        const r = compare(want, got);
        const gotN = got.filter((n) => !n.rest).length;
        notes += r.notes;
        matched += r.matched;
        durOk += r.durOk;
        extra += Math.max(0, gotN - r.matched);
        rows.push(
          `${m.name} @${bpm}: nốt ${r.matched}/${r.notes} (+${Math.max(0, gotN - r.matched)} thừa) · trường độ ${r.durOk}/${r.notes} · ♩≈${tr.bpm.toFixed(0)} · lấy đà ${tr.pickupRest}`,
        );
      }
      const notePct = (matched - extra) / notes;
      const durPct = durOk / notes;
      console.log(
        `${metro ? 'CÓ' : 'KHÔNG'} máy đếm nhịp — nốt đúng ${(notePct * 100).toFixed(1)} % · trường độ đúng ${(durPct * 100).toFixed(1)} %\n  ${rows.join('\n  ')}`,
      );
      expect(notePct).toBeGreaterThanOrEqual(0.95);
      expect(durPct).toBeGreaterThanOrEqual(0.85);
    }, 240_000);
  }
});
