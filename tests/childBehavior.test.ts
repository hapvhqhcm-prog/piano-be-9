/**
 * BÉ 9 TUỔI THẬT ngồi đàn (2026-10-15) — tuần 4–6, qua đường chấm THẬT của app (tests/childSim.ts → MicAnalyzer →
 * src/music/waitJudge.ts như songWait.ts / practice.ts; theo nhịp: gradeTiming + analyzePulse + teach như songTempo.ts).
 * Mặc định (< 60 s): một bài, mỗi hành vi một lần. Đầy đủ: CHILD_SIM=full (mọi bài chờ tuần 4–6 × mọi hành vi, in bảng
 * cũ / mới — "cũ" = khác nốt đang chờ là "đàn sai", như trước 2026-10-15).
 */
import { describe, expect, it } from 'vitest';
import { matchHeard } from '../src/audio/match';
import { WEEKS } from '../src/lessons/lessonEngine';
import { findTune } from '../src/music/exercises';
import { handOnsets, phraseRanges, type Tune } from '../src/music/tune';
import { MISS_SKIP_MS, missHelp, phraseStartsFrom, type MissHelp } from '../src/music/waitJudge';
import { micHonestyInit, micHonestyStep } from '../src/audio/micHonesty';
import { neighbour } from './weekSim';
import {
  appJudge,
  melodyChild,
  renderHum,
  renderKnocks,
  renderRoom,
  rng,
  runWait,
  type ChildView,
  type Strike,
  type WaitJudgeFn,
  type WaitResult,
} from './childSim';

const FULL = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CHILD_SIM === 'full';

function tuneGroups(t: Tune, n = Infinity): { G: number[][]; PS: number[] } {
  const os = handOnsets(t, null).slice(0, n);
  return { G: os.map((o) => o.pitches.map((p) => pitchMidi(p))), PS: phraseStartsFrom(os.map((o) => o.notes[0].measure), phraseRanges(t)) };
}
const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function pitchMidi(p: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(p)!;
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const legacy =
  (G: number[][]): WaitJudgeFn =>
  (h, cur) =>
    matchHeard(h.midi, G[cur]) !== 'none' ? { kind: 'ok', advance: 1, wrong: false } : { kind: 'wrong', advance: 0, wrong: true };

interface Behaviour {
  name: string;
  /** số lần "đàn sai" tối đa cho phép (bộ chấm mới) */
  maxWrong: number;
  /** đi hết bài */
  finish?: boolean;
  /** chỉ chạy khi CHILD_SIM=full (giữ lần chạy mặc định < 60 s) */
  fullOnly?: boolean;
  /** kiểm tra thêm */
  check?: (r: WaitResult) => void;
  run: (G: number[][], PS: number[], judge: WaitJudgeFn) => Promise<WaitResult>;
}

const vel = (seed: number) => {
  const R = rng(seed);
  return () => 0.3 + R() * 0.3;
};
const kinds = (r: WaitResult, k: string) => r.events.filter((e) => e.kind === k).length;

/** Bé phản ứng với lời nhắc: app GIỮ con trỏ vì lệch quãng 8 → bé dời tay về đúng chỗ (sau ~1 s). */
function octaveChild(G: number[][], shift: number) {
  let moved = false;
  const v = vel(7);
  return melodyChild({
    groups: G,
    gap: 1,
    vel: v,
    shape: (_i, m, _a, view) => {
      if (!moved && view.verdicts.some((e) => e.kind === 'octave-hold')) moved = true;
      return [{ midi: moved ? m : m + shift, start: 0, dur: 0.9, vel: v() }];
    },
  }).child;
}

const BEHAVIOURS: Behaviour[] = [
  { name: 'đàn đúng (đối chứng)', maxWrong: 0, finish: true, run: (G, _PS, judge) => runWait({ groups: G, judge, seconds: 26, child: melodyChild({ groups: G, gap: 1, vel: vel(1) }).child }) },
  {
    name: '1. lệch quãng 8 (Đô5 thay Đô4), bé dời tay khi được nhắc',
    maxWrong: 0,
    finish: true,
    check: (r) => {
      expect(r.events.find((e) => e.kind !== 'check')?.kind).toBe('octave-ok');
      expect(kinds(r, 'octave-hold')).toBeGreaterThanOrEqual(1);
    },
    run: (G, _PS, judge) => runWait({ groups: G, judge, seconds: 32, child: octaveChild(G, 12) }),
  },
  {
    name: '1. lệch quãng 8 xuống (Đô3 thay Đô4)',
    maxWrong: 0,
    finish: true,
    check: (r) => expect(kinds(r, 'octave-hold')).toBeGreaterThanOrEqual(1),
    run: (G, _PS, judge) => runWait({ groups: G, judge, seconds: 32, child: octaveChild(G, -12) }),
  },
  ...[0.3, 0.22, 0.16].map(
    (gap): Behaviour => ({
      name: `2. đàn vội ${gap} s/nốt, không chờ con trỏ`,
      fullOnly: gap === 0.22,
      maxWrong: 0,
      finish: true,
      // không đếm đôi: mỗi lần bấm được nhận nhiều nhất một lần
      check: (r) => expect(r.events.filter((e) => e.advance > 0).length).toBeLessThanOrEqual(r.strikes.length),
      run: (G, _PS, judge) => runWait({ groups: G, judge, seconds: 12, child: melodyChild({ groups: G, gap, vel: vel(2), noWait: true, hold: gap }).child }),
    }),
  ),
  {
    name: '3. dừng 15 s giữa câu 1 rồi đàn lại từ đầu câu',
    maxWrong: 0,
    finish: true,
    check: (r) => expect(kinds(r, 'replay')).toBeGreaterThanOrEqual(1),
    run: (G, _PS, judge) => {
      const p1 = melodyChild({ groups: G.slice(0, 6), gap: 1, vel: vel(3) });
      const p2 = melodyChild({ groups: G, gap: 1, vel: vel(4), start: 22 });
      return runWait({ groups: G, judge, seconds: 22 + G.length + 3, child: (v: ChildView) => (v.now < 20 ? p1.child(v) : p2.child(v)) });
    },
  },
  {
    name: '3. dừng 12 s ở câu 2 rồi đàn lại từ đầu câu 2',
    maxWrong: 0,
    finish: true,
    run: (G, _PS, judge) => {
      const s = _PS[1] ?? 8;
      const q1 = melodyChild({ groups: G.slice(0, s + 4), gap: 1, vel: vel(5) });
      const q2 = melodyChild({ groups: G.slice(s), gap: 1, vel: vel(6), start: s + 18 });
      return runWait({ groups: G, judge, seconds: s + 18 + (G.length - s) + 3, child: (v: ChildView) => (v.now < s + 16 ? q1.child(v) : q2.child({ ...v, cur: v.cur - s })) });
    },
  },
  {
    name: '4. chạm hai phím (phím bên cạnh to hơn)',
    maxWrong: 0,
    finish: true,
    check: (r) => expect(kinds(r, 'smudge') + kinds(r, 'ghost')).toBeGreaterThanOrEqual(1),
    run: (G, _PS, judge) =>
      runWait({
        groups: G,
        judge,
        seconds: 34,
        child: melodyChild({
          groups: G,
          gap: 1,
          vel: vel(8),
          shape: (i, m, a) =>
            i % 3 === 1 && a === 0
              ? [
                  { midi: m, start: 0, dur: 0.9, vel: 0.3 },
                  { midi: neighbour(m, true), start: 0.005, dur: 0.9, vel: 0.5, tag: 'smudge' },
                ]
              : [{ midi: m, start: 0, dur: 0.9, vel: 0.45 }],
        }).child,
      }),
  },
  {
    name: '4. (đối chứng) đàn NHẦM phím bên cạnh — vẫn phải bắt được',
    maxWrong: 99,
    finish: true,
    check: (r) => expect(r.wrongs).toBeGreaterThanOrEqual(Math.floor(r.creditAt.length / 4) - 1),
    run: (G, _PS, judge) =>
      runWait({
        groups: G,
        judge,
        seconds: 34,
        child: melodyChild({ groups: G, gap: 1, vel: vel(9), shape: (i, m, a) => [{ midi: i % 4 === 2 && a === 0 ? neighbour(m, i % 8 === 2) : m, start: 0, dur: 0.9, vel: 0.45 }] }).child,
      }),
  },
  {
    name: '5. tay đặt hờ: nốt khẽ vô tình',
    maxWrong: 0,
    run: (G, _PS, judge) => {
      const R = rng(11);
      return runWait({
        groups: G,
        judge,
        seconds: 34,
        child: melodyChild({ groups: G, gap: 1.2, vel: vel(10), shape: (i, m) => [{ midi: m, start: 0, dur: 0.9, vel: 0.45 }, { midi: [60, 62, 64, 65, 67][(i * 3) % 5], start: 0.6, dur: 0.4, vel: 0.12 + R() * 0.06, tag: 'rest' }] }).child,
      });
    },
  },
  ...[0.0005, 0.002].map(
    (lvl): Behaviour => ({
      name: `5. ngân nga theo giai điệu (giọng ${lvl})`,
      fullOnly: lvl === 0.002,
      maxWrong: 0,
      finish: true,
      run: (G, _PS, judge) => runWait({ groups: G, judge, seconds: 26, extras: [renderHum(G.map((g, i) => ({ midi: g[0], start: 1.05 + i, dur: 0.8 })), 26, lvl, 1)], child: melodyChild({ groups: G, gap: 1, vel: vel(12) }).child }),
    }),
  ),
  { name: '5. anh/chị nói chuyện bên cạnh', maxWrong: 1, finish: true, run: (G, _PS, judge) => runWait({ groups: G, judge, seconds: 26, extras: [renderRoom('speech', 26, 4)], child: melodyChild({ groups: G, gap: 1, vel: vel(13) }).child }) },
  { name: '5. em nhỏ nói chuyện', maxWrong: 2, finish: true, run: (G, _PS, judge) => runWait({ groups: G, judge, seconds: 26, extras: [renderRoom('speechChild', 26, 5)], child: melodyChild({ groups: G, gap: 1, vel: vel(14) }).child }) },
  { name: '5. quạt / điều hòa', maxWrong: 0, finish: true, run: (G, _PS, judge) => runWait({ groups: G, judge, seconds: 26, extras: [renderRoom('fan', 26, 6, 0.3)], child: melodyChild({ groups: G, gap: 1, vel: vel(15) }).child }) },
  ...[0.002, 0.006].map(
    (lvl): Behaviour => ({
      name: `5. gõ nắp đàn theo nhịp (${lvl})`,
      fullOnly: lvl === 0.006,
      maxWrong: 1,
      finish: true,
      run: (G, _PS, judge) =>
        runWait({ groups: G, judge, seconds: 26, extras: [renderKnocks(Array.from({ length: 50 }, (_, k) => 0.7 + k * 0.5), 26, lvl, 7)], child: melodyChild({ groups: G, gap: 1, vel: vel(16) }).child }),
    }),
  ),
  {
    name: '6. đàn to rồi nhỏ, giữ pedal (mọi nốt ngân 4 s)',
    maxWrong: 0,
    finish: true,
    run: (G, _PS, judge) => {
      let k = 0;
      return runWait({ groups: G, judge, seconds: 28, child: melodyChild({ groups: G, gap: 1, hold: 4, vel: () => (k++ % 2 ? 0.22 : 0.95) }).child });
    },
  },
];

describe('bé thật — chế độ chờ (tuần 4–6)', () => {
  const t = findTune('ode_to_joy_easy')!;
  const { G: G16 } = tuneGroups(t, 16);
  const { G: GALL, PS: PSALL } = tuneGroups(t);
  for (const b of BEHAVIOURS.filter((x) => FULL || !x.fullOnly)) {
    it(b.name, { timeout: 120000 }, async () => {
      // câu 2 cần cả bài; các hành vi khác: 16 nốt đầu
      const whole = b.name.includes('câu 2');
      const G = whole ? GALL : G16;
      const PS = whole ? PSALL : [0, 8];
      const r = await b.run(G, PS, appJudge(G, PS));
      const msg = `${b.name}: cur ${r.cur}/${G.length} sai ${r.wrongs} — ${r.events.filter((e) => e.kind !== 'ok' && e.kind !== 'check').map((e) => `${e.t.toFixed(1)}:${e.midi}/${G[e.cur]?.[0]}${e.kind}`).join(' ')}`;
      expect(r.wrongs, msg).toBeLessThanOrEqual(b.maxWrong);
      if (b.finish) expect(r.cur, msg).toBe(G.length);
      b.check?.(r);
    });
  }

  it('LH lệch quãng 8 (thế Đô3 → đàn ở Đô4): nhắc, không "sai" mãi', { timeout: 60000 }, async () => {
    const G = [48, 50, 52, 53, 55, 53, 52, 50, 48].map((m) => [m]);
    const r = await runWait({ groups: G, judge: appJudge(G), seconds: 20, child: octaveChild(G, 12) });
    expect(r.wrongs).toBe(0);
    expect(kinds(r, 'octave-hold')).toBeGreaterThanOrEqual(1);
    expect(r.cur).toBe(G.length);
  });

  it('Từng nốt (practice.ts — không cho qua lệch quãng 8): giữ lại, chỉ chỗ', { timeout: 60000 }, async () => {
    const G = [[60]];
    const r = await runWait({ groups: G, judge: appJudge(G, [0], 0), seconds: 8, child: melodyChild({ groups: G, gap: 1, vel: vel(20), retries: 2, shape: (_i, m) => [{ midi: m + 12, start: 0, dur: 0.9, vel: 0.45 }] }).child });
    expect(r.cur).toBe(0);
    expect(r.events.filter((e) => e.kind !== 'check').every((e) => e.kind === 'octave-hold')).toBe(true);
  });

  it('8. sai mãi một nốt: trợ giúp tăng dần đúng thứ tự, không mời bỏ qua quá sớm', { timeout: 60000 }, async () => {
    const G = G16.slice(0, 6);
    const bad = 3;
    const sequence = (gap: number) => {
      // bé đàn đúng tới nốt 3 rồi đàn nhầm phím bên cạnh mãi (cách nhau `gap` giây)
      const plan: Strike[] = [];
      for (let i = 0; i < bad; i++) plan.push({ midi: G[i][0], start: 1 + i, dur: 0.9, vel: 0.45 });
      for (let k = 0; k < 7; k++) plan.push({ midi: neighbour(G[bad][0], true), start: 1 + bad + 0.5 + k * gap, dur: Math.min(0.9, gap * 0.9), vel: 0.45 });
      return (v: ChildView) => {
        for (const s of plan) if (!(s as Strike & { done?: boolean }).done && v.now + 0.2 >= s.start) {
          (s as Strike & { done?: boolean }).done = true;
          v.strike(s);
        }
      };
    };
    const helps = (r: WaitResult) => {
      const w = r.events.filter((e) => e.wrong && e.cur === bad);
      return w.map((e, k) => ({ t: e.t - w[0].t, help: missHelp(k + 1, (e.t - w[0].t) * 1000) }));
    };
    // nhịp bé hay làm: 1,8 s một lần
    const slow = helps(await runWait({ groups: G, judge: appJudge(G), seconds: 20, child: sequence(1.8) }));
    expect(slow.length).toBeGreaterThanOrEqual(6);
    const order: MissHelp[] = ['say', 'listen', 'show', 'show'];
    expect(slow.slice(0, 4).map((x) => x.help)).toEqual(order);
    const firstSkip = slow.find((x) => x.help === 'skip');
    expect(firstSkip).toBeTruthy();
    expect(firstSkip!.t * 1000).toBeGreaterThanOrEqual(MISS_SKIP_MS);
    // bấm loạn 0,45 s một lần: 5 lần sai trong ~2 s → chưa mời bỏ qua
    const mash = helps(await runWait({ groups: G, judge: appJudge(G), seconds: 9, child: sequence(0.45) }));
    expect(mash.length).toBeGreaterThanOrEqual(5);
    expect(mash.filter((x) => x.t * 1000 < MISS_SKIP_MS).some((x) => x.help === 'skip')).toBe(false);
    // micro vẫn nghe ra nốt (sai) → "micro nghe chưa rõ" không bật (đó là lỗi của bài, không phải micro)
    let s = micHonestyInit();
    let shown = false;
    for (let k = 0; k < 7; k++) {
      let r = micHonestyStep(s, { type: 'activity', at: k * 1800 });
      r = micHonestyStep(r.state, { type: 'heard' });
      s = r.state;
      shown ||= r.show;
    }
    expect(shown).toBe(false);
  });
});

// ---------- đầy đủ (CHILD_SIM=full): mọi bài chờ tuần 4–6 × mọi hành vi, so với cách chấm cũ ----------
describe.runIf(FULL)('bé thật — mọi bài chờ tuần 4–6 (CHILD_SIM=full)', () => {
  const ids = new Set<string>();
  for (const w of WEEKS.filter((x) => x.week >= 4 && x.week <= 6))
    for (const l of w.lessons) for (const a of l.activities) if (a.kind === 'song' && a.mode === 'wait') ids.add(a.songId);
  for (const id of ids)
    it(id, { timeout: 1200000 }, async () => {
      const { G, PS } = tuneGroups(findTune(id)!, 16);
      const rows: string[] = [];
      const bad: string[] = [];
      for (const b of BEHAVIOURS.filter((x) => !x.name.includes('câu 2') && !x.name.includes('đối chứng) đàn NHẦM'))) {
        const neu = await b.run(G, PS, appJudge(G, PS));
        const old = await b.run(G, PS, legacy(G));
        rows.push(`${b.name.padEnd(52)} cũ: sai ${String(old.wrongs).padStart(2)}, tới ${old.cur}/${G.length} · mới: sai ${String(neu.wrongs).padStart(2)}, tới ${neu.cur}/${G.length}`);
        if (neu.wrongs > Math.max(b.maxWrong + 1, Math.floor(old.wrongs / 3))) bad.push(`${id} ${b.name}: sai ${neu.wrongs} (cũ ${old.wrongs})`);
      }
      console.log(`\n${id}\n${rows.join('\n')}`);
      expect(bad).toEqual([]);
    });
});

describe('bé thật — Hát rồi đàn (sing.ts, bước đàn: bé hát theo khi đàn)', () => {
  it('giọng hát kéo dài nốt vừa đàn không thành "Con vừa đàn …" oan', { timeout: 60000 }, async () => {
    // một lượt Mi – Fa – Sol (tuần 6): bé đàn từng nốt và hát theo
    const G = [[64], [65], [67]];
    const humNotes = G.map((g, i) => ({ midi: g[0], start: 1.05 + i * 1.2, dur: 1.1 }));
    const legacyRun = await runWait({ groups: G, judge: legacy(G), seconds: 6, extras: [renderHum(humNotes, 6, 0.0015, 3)], child: melodyChild({ groups: G, gap: 1.2, vel: vel(40) }).child });
    const neu = await runWait({ groups: G, judge: appJudge(G, [0], 0), seconds: 6, extras: [renderHum(humNotes, 6, 0.0015, 3)], child: melodyChild({ groups: G, gap: 1.2, vel: vel(40) }).child });
    expect(neu.cur).toBe(3);
    expect(neu.wrongs).toBeLessThanOrEqual(Math.min(1, legacyRun.wrongs));
  });
});
