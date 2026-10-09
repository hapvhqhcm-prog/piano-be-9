/**
 * ĐO CHẤM HAI TAY BẰNG MICRO (src/audio/twoHand.ts) trên bài hai tay THẬT của giáo trình (tuần 12–23).
 * So với cách cũ (một cao độ + matchHeard / analyzeChord "đủ nốt") — cách cũ không chấm riêng từng tay.
 *
 * Mặc định (mọi lần test): một tập nhỏ (1 bài × đàn nhẹ + lọc ồn × 6 kiểu lỗi). Đầy đủ: TWO_HAND_BENCH=full (~10 phút,
 * 8 bài × 5 điều kiện — chạy từng phần: TWO_HAND_SONGS=id1,id2).
 * In bảng: npx vitest run tests/twoHandBench.test.ts
 */
import { describe, expect, it } from 'vitest';
import { findTune } from '../src/music/exercises';
import { MicAnalyzer } from '../src/audio/micAnalyzer';
import { analyzeHands } from '../src/audio/twoHand';
import { renderNoise, simulateHands, type ErrKind, type HandCond } from './twoHandSim';
import { VEL } from './weekSim';

const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const FULL = ENV.TWO_HAND_BENCH === 'full';

/** Bài hai tay (có nhóm hai tay đàn cùng lúc) tuần 12–23 */
const ALL_SONGS = ['hot_cross_buns_both', 'ode_to_joy_both', 'bell_tower', 'two_friends', 'echo_valley', 'ode_to_joy_chords', 'twinkle_both', 'lantern_parade'];
const SONGS = ENV.TWO_HAND_SONGS ? ENV.TWO_HAND_SONGS.split(',') : FULL ? ALL_SONGS : ['two_friends'];

const ALL_CONDS: Record<string, Omit<HandCond, 'err' | 'seed'>> = {
  'bình thường 48k': { vel: VEL.normal, legato: 0.15 },
  'nhẹ + lọc ồn 48k': { vel: VEL.soft, legato: 0.15, ns: 12 },
  'bình thường 44,1k legato': { vel: VEL.normal, legato: 0.4, sampleRate: 44100 },
  'nhẹ 44,1k': { vel: VEL.soft, legato: 0.15, sampleRate: 44100 },
  'bình thường + lọc ồn, legato': { vel: VEL.normal, legato: 0.4, ns: 12 },
};
const CONDS = FULL ? ALL_CONDS : { 'nhẹ + lọc ồn 48k': ALL_CONDS['nhẹ + lọc ồn 48k'] };
const ERRS: ErrKind[] = ['none', 'missLH', 'missRH', 'wrongLH', 'wrongRH', 'lateLH'];

interface T {
  n: number;
  ok: number;
}
const T0 = (): T => ({ n: 0, ok: 0 });
const pct = (t: T) => (t.n ? `${Math.round((100 * t.ok) / t.n)}%` : '—');

describe('chấm hai tay bằng micro — bài thật tuần 12–23', () => {
  // [mới theo nhịp, mới chờ, cũ theo nhịp, cũ chờ]
  const keys = [
    'okRH', // nhóm đúng: tay phải được ghi nhận
    'okLH', // nhóm đúng: tay trái được ghi nhận
    'missLH', // quên tay trái: tay trái KHÔNG được ghi nhận
    'missLHrh', // quên tay trái: tay phải vẫn được ghi nhận
    'missRH',
    'wrongLH', // sai nốt tay trái: tay trái không được ghi nhận
    'wrongLHtag', // … và được gọi đúng là "đàn nhầm phím"
    'wrongRH',
    'lateLH', // tay trái trễ 120 ms: vẫn được ghi nhận (cùng lúc)
  ] as const;
  type K = (typeof keys)[number];
  const tally = { tempo: {} as Record<K, T>, wait: {} as Record<K, T>, oldT: {} as Record<K, T>, oldW: {} as Record<K, T> };
  for (const m of Object.values(tally)) for (const k of keys) m[k] = T0();
  const lat: number[] = [];
  const offs: number[] = [];
  let inconclusive = 0;
  let evals = 0;
  const rows: string[] = [];

  for (const [cname, cond] of Object.entries(CONDS)) {
    it(cname, { timeout: 600000 }, async () => {
      const local = { tempo: {} as Record<K, T>, wait: {} as Record<K, T> };
      for (const m of Object.values(local)) for (const k of keys) m[k] = T0();
      const add = (mode: 'tempo' | 'wait' | 'oldT' | 'oldW', k: K, ok: boolean) => {
        tally[mode][k].n++;
        if (ok) tally[mode][k].ok++;
        if (mode === 'tempo' || mode === 'wait') {
          local[mode][k].n++;
          if (ok) local[mode][k].ok++;
        }
      };
      let seed = 3;
      for (const id of SONGS) {
        const t = findTune(id)!;
        expect(t, id).toBeTruthy();
        for (const err of ERRS) {
          const out = await simulateHands(t, { ...cond, err, seed: seed++, every: err === 'none' ? 1 : 2 });
          const both = out.groups.map((g, i) => ({ g, i })).filter((x) => x.g.together);
          both.forEach(({ g }, k) => {
            const e = g.err;
            const tr = out.tempo.filter((n) => n.beat === g.beat);
            const vt = (h: 'RH' | 'LH') => tr.find((n) => n.hand === h)?.verdict;
            const w = out.wait[k];
            const vw = (h: 'RH' | 'LH') => (w.r && w.r.conclusive ? w.r[h]?.verdict : undefined);
            evals++;
            if (!w.r || !w.r.conclusive) inconclusive++;
            const oldT = out.oldTempo[k];
            const oldW = out.oldWait[k] === true;
            const both3 = (k1: K, hand: 'RH' | 'LH', want: boolean) => {
              add('tempo', k1, (vt(hand) === 'hit') === want);
              add('wait', k1, (vw(hand) === 'hit') === want);
              add('oldT', k1, oldT === want);
              add('oldW', k1, oldW === want);
            };
            if (e === 'none' || e === 'lateLH') {
              if (e === 'none') {
                both3('okRH', 'RH', true);
                both3('okLH', 'LH', true);
                if (w.r && vw('RH') === 'hit' && vw('LH') === 'hit') lat.push(w.latency);
                const o = tr.find((n) => n.hand === 'LH')?.offset;
                if (o !== undefined) offs.push(o);
              } else both3('lateLH', 'LH', true);
            } else if (e === 'missLH') {
              both3('missLH', 'LH', false);
              both3('missLHrh', 'RH', true);
            } else if (e === 'missRH') both3('missRH', 'RH', false);
            else if (e === 'wrongLH') {
              both3('wrongLH', 'LH', false);
              add('tempo', 'wrongLHtag', vt('LH') === 'wrong');
              add('wait', 'wrongLHtag', vw('LH') === 'wrong');
            } else if (e === 'wrongRH') both3('wrongRH', 'RH', false);
          });
        }
      }
      rows.push(`${cname.padEnd(30)} | ${keys.map((k) => `${k} ${pct(local.tempo[k])}/${pct(local.wait[k])}`).join(' · ')}`);
    });
  }

  it('không ghi nhận "ma": im lặng / quạt / giọng nói', { timeout: 120000 }, async () => {
    const sr = 48000;
    /** ở các lần gõ thật (đúng như app hỏi): số lần một tay được ghi nhận */
    let onsetCredits = 0;
    /** hỏi ở thời điểm bất kỳ (thử thách thêm): một tay / cả hai tay (chế độ chờ chỉ đi tiếp khi CẢ HAI tay) */
    let anyHand = 0;
    let bothHands = 0;
    let bothAtOnset = 0;
    let onsetTotal = 0;
    let probes = 0;
    const specs = [
      { RH: [64], LH: [48] },
      { RH: [67], LH: [48] },
      { RH: [62], LH: [55] },
      { RH: [60], LH: [48, 52, 55] },
      { RH: [57], LH: [45] },
    ];
    for (const kind of ['silence', 'fan', 'speech', 'speechLow', 'speechChild'] as const)
      for (const seed of FULL ? [5, 6, 7, 8] : [6]) {
        await new Promise((r) => setTimeout(r, 0));
        const sig = renderNoise(kind, 8, sr, seed);
        const an = new MicAnalyzer();
        const hop = Math.round(0.025 * sr);
        let lastClap = -1;
        const onsets: number[] = [];
        for (let i = 2048; i < sig.length; i += hop) {
          const tt = i / sr;
          const f = an.process(sig.subarray(i - 2048, i), sr, tt);
          if (f.onset && tt - lastClap > 0.15) {
            lastClap = tt;
            onsets.push(f.onsetAt >= 0 ? f.onsetAt : tt - 0.035);
          }
        }
        const fixed = Array.from({ length: 24 }, (_, k) => 1.5 + k * 0.25);
        for (const [list, isOnset] of [[onsets, true], [fixed, false]] as const)
          for (const on of list)
            for (const spec of specs) {
              const r = analyzeHands(sig, sr, Math.round(on * sr), spec);
              probes++;
              const one = r.conclusive && (r.RH?.verdict === 'hit' || r.LH?.verdict === 'hit');
              const two = r.conclusive && r.RH?.verdict === 'hit' && r.LH?.verdict === 'hit';
              if (isOnset && one) onsetCredits++;
              if (!isOnset && one) anyHand++;
              if (two) bothHands++;
              if (two && isOnset) bothAtOnset++;
              if (one && ENV.TWO_HAND_DEBUG) console.log('GHOST', kind, seed, on.toFixed(3), isOnset, JSON.stringify(spec), JSON.stringify(r.rise), JSON.stringify(r.drift));
            }
        onsetTotal += onsets.length;
      }
    rows.push(`"ma": ${probes} lần hỏi · ${onsetTotal} lần gõ (×${specs.length} nhóm nốt): ${onsetCredits} tay, ${bothAtOnset} lần cả hai tay · lúc bất kỳ (đầu âm tiết): ${anyHand} tay, ${bothHands - bothAtOnset} lần cả hai tay`);
    // Ở lần gõ thật: hiếm (giọng nói trùng đúng cao độ một nốt, đứng yên ~0,1 s) — chỉ MỘT tay, chế độ chờ không đi tiếp
    if (ENV.TWO_HAND_DEBUG) console.log(rows[rows.length - 1]);
    expect(onsetCredits).toBeLessThanOrEqual(FULL ? 4 : 2);
    expect(bothAtOnset).toBe(0);
  });

  it('in bảng & yêu cầu', () => {
    const line = (name: string, m: Record<K, T>) => `${name.padEnd(14)} ${keys.map((k) => `${k}=${pct(m[k])}(${m[k].n})`).join('  ')}`;
    lat.sort((a, b) => a - b);
    offs.sort((a, b) => a - b);
    const med = (a: number[]) => (a.length ? a[Math.floor(a.length / 2)] : NaN);
    const p90 = (a: number[]) => (a.length ? a[Math.floor(a.length * 0.9)] : NaN);
    console.log(
      [
        '',
        ...rows,
        'MỚI theo nhịp | MỚI chờ | CŨ theo nhịp | CŨ chờ (đúng = đúng mong đợi):',
        line('mới theo nhịp', tally.tempo),
        line('mới chờ', tally.wait),
        line('cũ theo nhịp', tally.oldT),
        line('cũ chờ', tally.oldW),
        `chờ: không kết luận ${inconclusive}/${evals}; độ trễ (từ lúc gõ tới khi có kết quả) trung vị ${Math.round(med(lat) * 1000)} ms, p90 ${Math.round(p90(lat) * 1000)} ms`,
      ].join('\n'),
    );
    const t = tally.tempo;
    const w = tally.wait;
    // Ngưỡng tối thiểu (để test không vỡ vì dao động) — kết quả đo thật in ở bảng
    for (const m of [t, w]) {
      expect(m.okRH.ok / m.okRH.n).toBeGreaterThanOrEqual(0.9);
      expect(m.okLH.ok / m.okLH.n).toBeGreaterThanOrEqual(0.9);
      expect(m.missLH.ok / m.missLH.n).toBeGreaterThanOrEqual(0.85);
      expect(m.missRH.ok / m.missRH.n).toBeGreaterThanOrEqual(0.85);
    }
  });
});
