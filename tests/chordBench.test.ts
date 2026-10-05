import { describe, expect, it } from 'vitest';
import { MicAnalyzer } from '../src/audio/micAnalyzer';
import { analyzeChord, CHORD_FRAME, type ChordResult } from '../src/audio/chordVerify';
import { renderPiano, type SimNote, type SimOptions } from './pianoSim';

/**
 * ĐO KIỂM TRA HỢP ÂM (src/audio/chordVerify.ts) trên giả lập đàn cơ — y hệt đường đi trong MicListener:
 * MicAnalyzer tìm lần gõ phím → lấy khung [gõ + 50 ms, + 150 ms] của tín hiệu THÔ → analyzeChord.
 * Chạy: npx vitest run tests/chordBench.test.ts (in bảng kết quả)
 */

function rnd(seed: number) {
  let x = seed;
  return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
}

/** Hợp âm / quãng hai nốt trong các thế tay của giáo trình (gồm hai tay cách xa: Đô3 + Mi4 + Sol4). */
const CHORDS: Array<{ name: string; midis: number[] }> = [
  { name: 'C: Đô4 Mi4 Sol4', midis: [60, 64, 67] },
  { name: 'C: Đô3 Mi4 Sol4', midis: [48, 64, 67] },
  { name: 'C: Đô4 Mi4', midis: [60, 64] },
  { name: 'C: Đô4 Sol4', midis: [60, 67] },
  { name: 'C: Đô3 Sol3', midis: [48, 55] },
  { name: 'G: Sol3 Si3 Rê4', midis: [55, 59, 62] },
  { name: 'G: Sol2 Si3 Rê4', midis: [43, 59, 62] },
  { name: 'G: Sol4 Si4', midis: [67, 71] },
  { name: 'G: Sol3 Rê4', midis: [55, 62] },
  { name: 'F: Fa3 La3 Đô4', midis: [53, 57, 60] },
  { name: 'F: Fa3 La4 Đô5', midis: [53, 69, 72] },
  { name: 'F: Fa4 La4', midis: [65, 69] },
  { name: 'Am: La3 Đô4 Mi4', midis: [57, 60, 64] },
  { name: 'Am: La2 Đô4 Mi4', midis: [45, 60, 64] },
  { name: 'Am: La3 Mi4', midis: [57, 64] },
  { name: 'Am: La4 Đô5', midis: [69, 72] },
];

const REAL: SimOptions = { strings: true, reverb: 0.6, gain: 0.08, noise: 0.006 };
const CONDS: Array<{ name: string } & SimOptions> = [
  { name: '48k thật', ...REAL },
  { name: '44,1k thật', ...REAL, sampleRate: 44100 },
  { name: '48k ồn', ...REAL, noise: 0.012, hum: 0.004 },
  { name: '44,1k nhẹ', ...REAL, sampleRate: 44100, gain: 0.05 },
  // Đàn nhà lâu chưa lên dây, CHƯA chỉnh "bù lệch dây" trong Cài đặt
  { name: '48k lệch −20c', ...REAL, detuneCents: -20 },
];

/** Một lần đàn: render → tìm lần gõ như MicListener → phân tích khung sau lần gõ. */
function trial(notes: SimNote[], expected: number[], o: SimOptions): ChordResult | null {
  const sr = o.sampleRate ?? 48000;
  const sig = renderPiano(notes, 0.6, o);
  const a = new MicAnalyzer();
  const hop = Math.round(0.025 * sr);
  let onsetAt = -1;
  for (let i = 2048; i < sig.length; i += hop) {
    const f = a.process(sig.subarray(i - 2048, i), sr, i / sr);
    if (f.onset && i / sr > 0.25) {
      onsetAt = f.onsetAt >= 0 ? f.onsetAt : i / sr - 0.035;
      break;
    }
  }
  if (onsetAt < 0) return null;
  const s0 = Math.round((onsetAt + CHORD_FRAME.startAfter) * sr);
  const len = Math.round(CHORD_FRAME.length * sr);
  return analyzeChord(sig.subarray(s0, s0 + len), sr, expected);
}

interface Tally {
  n: number;
  ok: number;
  inconclusive: number;
}
const tally = (): Tally => ({ n: 0, ok: 0, inconclusive: 0 });

describe('kiểm tra hợp âm trên giả lập đàn cơ', () => {
  const all = tally();
  const single = tally();
  const bass = tally();
  const drop = tally();
  const rows: string[] = [];
  const fails: string[] = [];

  it.each(CONDS)('$name', { timeout: 120000 }, async (cond) => {
    const r = rnd(cond.name.length * 97 + 13);
    const c = { all: tally(), single: tally(), bass: tally(), drop: tally() };
    let seed = 1;
    for (const ch of CHORDS) {
      // Nhường CPU — khối tính dài làm vitest báo "Timeout calling onTaskUpdate"
      await new Promise((res) => setTimeout(res, 0));
      for (let rep = 0; rep < 2; rep++) {
        const o = { ...cond, seed: seed++ };
        // Bé bấm các nốt KHÔNG hoàn toàn cùng lúc (lệch tới 25 ms), lực bấm khác nhau
        const play = (ms: number[]): SimNote[] =>
          ms.map((m) => ({ midi: m, start: 0.3 + r() * 0.025, dur: 0.5, vel: 0.5 + r() * 0.5 }));
        // 1) Đủ nốt
        const ra = trial(play(ch.midis), ch.midis, o);
        c.all.n++;
        if (!ra || !ra.conclusive) c.all.inconclusive++;
        else if (ra.missing.length === 0) c.all.ok++;
        else fails.push(`${cond.name} | ${ch.name} đủ nốt → báo thiếu ${ra.missing} ${JSON.stringify(ra.strengths)}`);
        // 2) Chỉ một nốt (mỗi nốt của hợp âm)
        for (const m of ch.midis) {
          const rs = trial(play([m]), ch.midis, o);
          c.single.n++;
          if (!rs || !rs.conclusive) c.single.inconclusive++;
          else if (rs.missing.length > 0) c.single.ok++;
          else fails.push(`${cond.name} | ${ch.name} chỉ ${m} → nhận đủ ${JSON.stringify(rs.strengths)}`);
        }
        // 3) Sai nốt trầm (lệch 1–2 phím, hoặc phím của thế tay khác)
        const low = Math.min(...ch.midis);
        for (const d of rep === 0 ? [-1, 2] : [1, -2]) {
          const ms = ch.midis.map((m) => (m === low ? m + d : m));
          const rb = trial(play(ms), ch.midis, o);
          c.bass.n++;
          if (!rb || !rb.conclusive) c.bass.inconclusive++;
          else if (rb.missing.includes(low)) c.bass.ok++;
          else fails.push(`${cond.name} | ${ch.name} trầm ${low}→${low + d} → nhận đủ ${JSON.stringify(rb.strengths)}`);
        }
        // 4) (tham khảo) Quên nốt CAO NHẤT của hợp âm — khó hơn: họa âm của nó thường trùng họa âm nốt trầm
        if (rep === 0) {
          const top = Math.max(...ch.midis);
          const rd = trial(play(ch.midis.filter((m) => m !== top)), ch.midis, o);
          c.drop.n++;
          if (!rd || !rd.conclusive) c.drop.inconclusive++;
          else if (rd.missing.includes(top)) c.drop.ok++;
        }
      }
    }
    for (const k of ['all', 'single', 'bass', 'drop'] as const) {
      const t = { all, single, bass, drop }[k];
      t.n += c[k].n;
      t.ok += c[k].ok;
      t.inconclusive += c[k].inconclusive;
    }
    const p = (t: Tally) => `${Math.round((t.ok / t.n) * 100)}% (không rõ ${t.inconclusive}/${t.n})`;
    rows.push(`${cond.name.padEnd(12)} | đủ nốt nhận ${p(c.all)} | 1 nốt bị từ chối ${p(c.single)} | sai nốt trầm bị từ chối ${p(c.bass)} | (tham khảo) quên nốt cao nhất → phát hiện ${p(c.drop)}`);
    expect(c.all.n).toBeGreaterThan(0);
  });

  it('in bảng & yêu cầu tối thiểu', () => {
    console.log('\n' + rows.join('\n') + `\nTỔNG: đủ ${all.ok}/${all.n} · 1 nốt ${single.ok}/${single.n} · sai trầm ${bass.ok}/${bass.n}, quên nốt cao ${drop.ok}/${drop.n}\n` + fails.slice(0, 40).join('\n'));
    expect(all.ok / all.n).toBeGreaterThanOrEqual(0.9);
    expect(single.ok / single.n).toBeGreaterThanOrEqual(0.9);
    expect(bass.ok / bass.n).toBeGreaterThanOrEqual(0.85);
  });
});
