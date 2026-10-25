/**
 * PHÂN BIỆT GIỌNG BÉ vs TIẾNG ĐÀN (2026-10-25, src/audio/voiceGuard.ts — phản hồi của bé: "Máy nghe nên phân biệt
 * giọng và đàn thật"). Giọng giả lập: tests/voiceSim.ts (hát nguyên âm có formant + rung giọng + vuốt nốt + hơi thở,
 * ngân nga ngậm miệng, nói, huýt sáo). Mỗi bảng in TRƯỚC (MicAnalyzer.voiceGuard = false — như bản cũ) / SAU.
 */
import { describe, expect, it } from 'vitest';
import { MicAnalyzer } from '../src/audio/micAnalyzer';
import { NO_FEATURES, partialFit, scoreVoice, verdictOf, type VoiceFeatures } from '../src/audio/voiceGuard';
import { findTune } from '../src/music/exercises';
import { handOnsets } from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';
import { renderPiano, SIM_RATE, type SimNote, type SimOptions } from './pianoSim';
import { RAW } from './weekSim';
import { appJudge, melodyChild, rng, runTempo, runWait, type Strike, type WaitResult } from './childSim';
import { mix, renderHumming, renderSpeech, renderSung, renderWhistle, type VoiceNote } from './voiceSim';

const feat = (o: Partial<VoiceFeatures>): VoiceFeatures => ({ ...NO_FEATURES, ...o });

describe('voiceGuard — hàm chấm thuần', () => {
  it('đàn: búa + tắt dần + cao độ đứng yên → đàn', () => {
    const f = feat({ attack: 'abrupt', decayDb: -3, swellDb: -2, spanS: 0.2, pitchN: 6, wobbleC: 4, glideC: 2 });
    const s = scoreVoice(f);
    expect(s.score).toBeGreaterThan(3);
    expect(verdictOf(f, s, false)).toBe('piano');
  });
  it('giọng: lên chậm + ngân đều + rung giọng → giọng', () => {
    const f = feat({ attack: 'soft', decayDb: 0.2, swellDb: 0.8, spanS: 0.26, pitchN: 9, wobbleC: 45, glideC: 5 });
    expect(verdictOf(f, scoreVoice(f), false)).toBe('voice');
  });
  it('huýt sáo: sóng sin thuần, không có tiếng búa → giọng', () => {
    const f = feat({ attack: 'unknown', pure: 0.995 });
    expect(verdictOf(f, scoreVoice(f), false)).toBe('voice');
  });
  it('tiếng búa rõ: không bao giờ bỏ chỉ vì sin thuần / ngân đều (nốt đàn rất cao)', () => {
    const f = feat({ attack: 'abrupt', pure: 0.995, decayDb: 0, swellDb: 0.3, spanS: 0.3, pitchN: 8, wobbleC: 30 });
    expect(verdictOf(f, scoreVoice(f), true)).not.toBe('voice');
  });
  it('lời nói: phụ âm bật nhưng cao độ trượt mạnh, không tắt dần → giọng', () => {
    const f = feat({ attack: 'abrupt', pitchN: 4, wobbleC: 3, glideC: -90 });
    expect(verdictOf(f, scoreVoice(f), false)).toBe('voice');
  });
  it('hết giờ chờ mà còn nghi → NHẬN (thận trọng)', () => {
    const f = feat({ attack: 'none', pitchN: 3, wobbleC: 12, glideC: 5 });
    expect(verdictOf(f, scoreVoice(f), false)).toBe('unsure');
    expect(verdictOf(f, scoreVoice(f), true)).toBe('piano');
  });
  it('phổ họa âm: đo được lệch họa âm của dây (B > 0), giọng B ≈ 0, huýt sáo = sin thuần', () => {
    const n = 2048;
    const sr = 48000;
    const mk = (f0: number, B: number, amps: number[]) => {
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) amps.forEach((a, k) => (x[i] += a * Math.sin(2 * Math.PI * (k + 1) * f0 * Math.sqrt(1 + B * (k + 1) ** 2) * (i / sr) + k)));
      return x;
    };
    const amps = [1, 0.6, 0.4, 0.3, 0.2, 0.15, 0.1];
    const p = partialFit(mk(220, 0.0008, amps), sr, 220 * Math.sqrt(1.0008));
    expect(p.inharm).toBeGreaterThan(0.0004);
    expect(p.inharm).toBeLessThan(0.0012);
    expect(Math.abs(partialFit(mk(220, 0, amps), sr, 220).inharm)).toBeLessThan(0.00004);
    expect(partialFit(mk(1047, 0, [1]), sr, 1047).pure).toBeGreaterThan(0.99);
  });
});

// ============ VÒNG HỞ: chỉ micro (MicAnalyzer) — bao nhiêu nốt được báo ============

const HOP = Math.round(0.025 * SIM_RATE);
function countNotes(x: Float32Array, guard: boolean, sr = SIM_RATE): { notes: number; voice: number; midis: number[] } {
  const an = new MicAnalyzer();
  an.voiceGuard = guard;
  const hop = Math.round((0.025 * sr));
  let notes = 0;
  let voice = 0;
  const midis: number[] = [];
  for (let i = 2048; i < x.length; i += hop) {
    const fr = an.process(x.subarray(i - 2048, i), sr, i / sr);
    if (fr.note) {
      notes++;
      midis.push(fr.note.midi);
    }
    if (fr.voice) voice++;
  }
  return { notes, voice, midis };
}
void HOP;

const MEL = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62];
const vnotes = (gap = 1, dur = 0.85, from = 0.8): VoiceNote[] => MEL.map((m, i) => ({ midi: m, start: from + i * gap, dur }));
const SECS = 0.8 + MEL.length + 1.5;

describe('voiceGuard — vòng hở (micro nghe, bé KHÔNG đàn / đàn thật)', () => {
  it('bé chỉ hát / ngân nga / nói / huýt sáo (không đàn): nốt được báo trước → sau', { timeout: 300000 }, () => {
    const room = renderPiano([], SECS, RAW);
    const cases: Array<[string, Float32Array, number]> = [
      ['hát đúng giọng (A3–E5)', renderSung(vnotes(), SECS, 0.002, 11), 2],
      ['hát to (gần iPad)', renderSung(vnotes(), SECS, 0.006, 12), 2],
      ['hát thấp một quãng 8', renderSung(vnotes(), SECS, 0.002, 13, { shift: -12 }), 2],
      ['hát cao một quãng 8', renderSung(vnotes(), SECS, 0.002, 14, { shift: 12 }), 2],
      ['hát không rung giọng', renderSung(vnotes(), SECS, 0.002, 15, { vibrato: 6 }), 3],
      ['ngân nga (ngậm miệng)', renderHumming(vnotes(), SECS, 0.002, 16), 1],
      ['ngân nga, nhanh (0,5 s/nốt)', renderHumming(vnotes(0.5, 0.45), SECS, 0.002, 17), 1],
      ['huýt sáo (cao 2 quãng 8)', renderWhistle(vnotes(), SECS, 0.002, 18), 1],
      ['huýt sáo (cao 1 quãng 8)', renderWhistle(vnotes(), SECS, 0.002, 19, { shift: 12 }), 1],
      ['bé nói (giọng trẻ con)', renderSpeech(SECS, 0.002, 20, { child: true }), -0.8],
      ['người lớn nói', renderSpeech(SECS, 0.002, 21), -0.8],
    ];
    const rows: string[] = [];
    const bad: string[] = [];
    for (const [name, v, max] of cases) {
      const x = mix(room, v);
      const off = countNotes(x, false);
      const on = countNotes(x, true);
      rows.push(`${name.padEnd(30)} trước ${String(off.notes).padStart(3)} nốt · sau ${String(on.notes).padStart(3)} nốt (bỏ ${on.voice} nốt giọng)`);
      // max < 0: tối đa |max| × số nốt trước (lời nói: phụ âm bật giống tiếng búa — chỉ bớt được một phần)
      if (on.notes > (max < 0 ? -max * off.notes : max) || on.notes > off.notes) bad.push(`${name}: ${on.notes} (trước ${off.notes}, tối đa ${max})`);
    }
    console.log(`\nKHÔNG ĐÀN, chỉ giọng — số nốt micro báo (mong đợi 0):\n${rows.join('\n')}`);
    expect(bad).toEqual([]);
  });

  it('đàn thật nhiều kiểu: không nốt nào bị bỏ oan, không thiếu nốt so với trước', { timeout: 300000 }, () => {
    const mel = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60];
    const N = (gap: number, vel: number, dur = gap * 0.95, shift = 0): SimNote[] => mel.map((m, i) => ({ midi: m + shift, start: 0.8 + i * gap, dur, vel }));
    const S = (gap: number) => 0.8 + mel.length * gap + 1.5;
    const R = rng(5);
    const cases: Array<[string, SimNote[], SimOptions, number?]> = [
      ['bình thường', N(1, 0.6), {}],
      ['rất khẽ (pp)', N(0.8, 0.2), {}],
      ['khẽ + iOS lọc ồn', N(0.8, 0.3), { ns: 12 }],
      ['khẽ + lọc ồn + AGC', N(0.7, 0.3), { ns: 12, agc: 4 }],
      ['liền tiếng nhanh (legato)', N(0.4, 0.45, 0.4), { legato: 0.3 }],
      ['to–nhỏ xen kẽ, liền tiếng', mel.map((m, i) => ({ midi: m, start: 0.8 + i * 0.6, dur: 0.6, vel: i % 2 ? 0.2 : 0.9 })), { legato: 0.5 }],
      ['nốt lặp', [60, 60, 60, 62, 62, 62, 64, 64, 64, 62, 62, 60].map((m, i) => ({ midi: m, start: 0.8 + i * 0.45, dur: 0.4, vel: 0.35 })), {}],
      ['tay trái trầm (Đô2–Đô3)', N(1, 0.45, 0.9, -24), {}],
      ['nốt cao (Đô5–Đô6)', N(0.6, 0.35, 0.55, 12), {}],
      ['giữ pedal (ngân 3 s)', N(1, 0.4), { legato: 3 }],
      ['vang nhiều + đàn lệch dây', N(0.8, 0.4), { reverb: 1, detuneCents: -30, inharm: 2 }],
      ['44,1 kHz khẽ', N(0.7, 0.3), { sampleRate: 44100 }, 44100],
      ['lực ngẫu nhiên, nhanh', mel.map((m, i) => ({ midi: m, start: 0.8 + i * 0.35, dur: 0.33, vel: 0.2 + R() * 0.7 })), {}],
    ];
    const rows: string[] = [];
    const bad: string[] = [];
    for (const [name, notes, o, sr] of cases) {
      const secs = Math.max(...notes.map((n) => n.start + n.dur)) + 1.5;
      const x = renderPiano(notes, secs, { ...RAW, ...o });
      const off = countNotes(x, false, sr);
      const on = countNotes(x, true, sr);
      const ghosts = (ms: number[]) => ms.filter((m) => !notes.some((n) => n.midi === m)).length;
      rows.push(`${name.padEnd(30)} ${notes.length} nốt đàn · trước nghe ${off.notes} (ma ${ghosts(off.midis)}) · sau ${on.notes} (ma ${ghosts(on.midis)}, bỏ ${on.voice})`);
      // mọi nốt ĐÀN THẬT trước nghe được thì sau cũng nghe được (nốt "ma" — không phải phím nào — bị bỏ thì càng tốt)
      const played = new Map<number, number>();
      for (const n of notes) played.set(n.midi, (played.get(n.midi) ?? 0) + 1);
      const cnt = (ms: number[], m: number) => ms.filter((x) => x === m).length;
      const lost = [...played].filter(([m, k]) => cnt(on.midis, m) < Math.min(k, cnt(off.midis, m)));
      if (lost.length) bad.push(`${name}: sau ${on.midis.join(',')} / trước ${off.midis.join(',')} bỏ ${on.voice}`);
    }
    console.log(`\nĐÀN THẬT (không giọng) — trước / sau:\n${rows.join('\n')}`);
    void S;
    expect(bad).toEqual([]);
  });
});

// ============ VÒNG KÍN: chế độ chờ (waitJudge thật của app), theo nhịp ============

const tuneG = (id: string, n: number) =>
  handOnsets(findTune(id)!, null)
    .slice(0, n)
    .map((o) => o.pitches.map(pitchToMidi));
const vel = (seed: number) => {
  const R = rng(seed);
  return () => 0.3 + R() * 0.3;
};

async function both(run: () => Promise<WaitResult>): Promise<{ off: WaitResult; on: WaitResult }> {
  MicAnalyzer.voiceGuardDefault = false;
  let off: WaitResult;
  try {
    off = await run();
  } finally {
    MicAnalyzer.voiceGuardDefault = true;
  }
  const on = await run();
  return { off, on };
}

describe('voiceGuard — chế độ chờ (vòng kín, bộ chấm thật của app)', () => {
  const G = tuneG('ode_to_joy_easy', 16);
  const line = (name: string, r: { off: WaitResult; on: WaitResult }) =>
    `${name.padEnd(44)} trước: tới ${String(r.off.cur).padStart(2)}/${G.length} sai ${String(r.off.wrongs).padStart(2)} · sau: tới ${String(r.on.cur).padStart(2)}/${G.length} sai ${String(r.on.wrongs).padStart(2)} (bỏ ${r.on.voiceRejected} nốt giọng)`;
  const rows: string[] = [];
  const voiceAt = (gap: number, lead: number, dur: number, shift = 0): VoiceNote[] => G.map((g, i) => ({ midi: g[0] + shift, start: 1.0 + i * gap + lead, dur }));

  it('bé HÁT giai điệu, KHÔNG đàn → con trỏ (gần như) không đi, không "sai"', { timeout: 300000 }, async () => {
    const bad: string[] = [];
    for (const [name, v] of [
      ['hát (không đàn)', renderSung(voiceAt(1, 0, 0.85), 20, 0.002, 31)],
      ['ngân nga (không đàn)', renderHumming(voiceAt(1, 0, 0.85), 20, 0.002, 32)],
      ['hát thấp quãng 8 (không đàn)', renderSung(voiceAt(1, 0, 0.85, -12), 20, 0.002, 33)],
      ['huýt sáo (không đàn)', renderWhistle(voiceAt(1, 0, 0.85), 20, 0.002, 34)],
    ] as Array<[string, Float32Array]>) {
      const r = await both(() => runWait({ groups: G, judge: appJudge(G, [0, 8]), seconds: 20, extras: [v], child: () => undefined }));
      rows.push(line(name, r));
      // trước: hát đúng nốt = con trỏ đi, hát lệch = "sai"; sau: còn lọt tối đa 2 nốt / 1 lần "sai" mỗi bài
      if (r.on.cur > 2 || r.on.wrongs > 1) bad.push(line(name, r));
    }
    expect(bad).toEqual([]);
  });

  it('bé đàn và HÁT THEO / nói / huýt sáo → nốt đàn được nhận, giọng bỏ qua', { timeout: 300000 }, async () => {
    const cases: Array<[string, Float32Array[], number]> = [
      ['đàn + hát theo cùng lúc', [renderSung(voiceAt(1, 0.03, 0.9), 26, 0.002, 41)], 0],
      // giọng TO hơn tiếng đàn khẽ và cất lên trước phím: tiếng búa bị giọng che — còn lọt ≤ 2 nốt giọng (giới hạn đã biết)
      ['đàn + hát TRƯỚC phím 0,15 s', [renderSung(voiceAt(1, -0.15, 0.9), 26, 0.002, 42)], 2],
      ['đàn + hát to (0,006)', [renderSung(voiceAt(1, 0.05, 0.9), 26, 0.006, 43)], 1],
      ['đàn + hát nốt KẾ trước (đoán trước)', [renderSung(G.slice(1).map((g, i) => ({ midi: g[0], start: 1.5 + i, dur: 0.4 })), 26, 0.002, 44)], 1],
      ['đàn + ngân nga theo', [renderHumming(voiceAt(1, 0.05, 0.8), 26, 0.002, 45)], 0],
      ['đàn + bé nói chuyện', [renderSpeech(26, 0.0015, 46, { child: true })], 2],
      ['đàn + người lớn nói', [renderSpeech(26, 0.0015, 47)], 2],
      ['đàn + huýt sáo theo', [renderWhistle(voiceAt(1, 0.05, 0.8), 26, 0.002, 48)], 0],
    ];
    const bad: string[] = [];
    for (const [name, extras, maxWrong] of cases) {
      const r = await both(() => runWait({ groups: G, judge: appJudge(G, [0, 8]), seconds: 26, extras, child: melodyChild({ groups: G, gap: 1, vel: vel(50) }).child }));
      rows.push(line(name, r));
      if (r.on.cur !== G.length || r.on.wrongs > Math.max(maxWrong, r.off.wrongs)) bad.push(line(name, r));
    }
    // đối chứng: đàn đúng, không giọng
    const ctl = await both(() => runWait({ groups: G, judge: appJudge(G, [0, 8]), seconds: 26, child: melodyChild({ groups: G, gap: 1, vel: vel(1) }).child }));
    rows.push(line('đối chứng: đàn đúng, không giọng', ctl));
    if (ctl.on.cur !== G.length || ctl.on.wrongs > 0 || ctl.on.voiceRejected > 0) bad.push(line('đối chứng', ctl));
    console.log(`\nCHẾ ĐỘ CHỜ (Vui đến trường 16 nốt) — trước / sau:\n${rows.join('\n')}`);
    expect(bad).toEqual([]);
  });
});

describe('voiceGuard — theo nhịp (songTempo: gradeTiming)', () => {
  it('hát không đàn → không "trúng" nốt nào; đàn + hát theo → điểm như đàn không hát', { timeout: 300000 }, async () => {
    const t = findTune('ode_to_joy_easy')!;
    const play = (t0: number, spb: number, gs: Array<{ start: number; midi: number[] }>): Strike[] => gs.map((g) => ({ midi: g.midi[0], start: t0 + g.start * spb + 0.01, dur: spb * 0.9, vel: 0.45 }));
    const sing = (lead: number) => (t0: number, spb: number, secs: number, gs: Array<{ start: number; midi: number[] }>) => [
      renderSung(gs.map((g) => ({ midi: g.midi[0], start: t0 + g.start * spb + lead, dur: spb * 0.85 })), secs, 0.002, 61),
    ];
    const run = async (guard: boolean, p: typeof play | (() => Strike[]), extras?: ReturnType<typeof sing>) => {
      MicAnalyzer.voiceGuardDefault = guard;
      try {
        return await runTempo(t, p, extras ? { extras } : {});
      } finally {
        MicAnalyzer.voiceGuardDefault = true;
      }
    };
    const hits = (r: Awaited<ReturnType<typeof runTempo>>) => r.verdicts.filter((v) => v.hit).length;
    const onlyOff = await run(false, () => [], sing(0));
    const onlyOn = await run(true, () => [], sing(0));
    const ctl = await run(true, play);
    const alongOff = await run(false, play, sing(0.02));
    const alongOn = await run(true, play, sing(0.02));
    console.log(
      `\nTHEO NHỊP (Vui đến trường, ${ctl.verdicts.length} nốt):\n` +
        `chỉ hát, không đàn     trước: nghe ${onlyOff.heard.length} nốt, trúng ${hits(onlyOff)} · sau: nghe ${onlyOn.heard.length}, trúng ${hits(onlyOn)}\n` +
        `đàn + hát theo         trước: điểm ${Math.round(alongOff.score * 100)}% (nghe ${alongOff.heard.length}) · sau: điểm ${Math.round(alongOn.score * 100)}% (nghe ${alongOn.heard.length}, bỏ ${alongOn.voiceRejected} nốt giọng)\n` +
        `đối chứng: chỉ đàn     điểm ${Math.round(ctl.score * 100)}% (nghe ${ctl.heard.length})`,
    );
    expect(hits(onlyOn)).toBeLessThanOrEqual(1);
    expect(alongOn.score).toBeGreaterThanOrEqual(Math.min(ctl.score, alongOff.score) - 0.07);
  });
});
