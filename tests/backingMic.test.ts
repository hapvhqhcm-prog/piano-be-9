/**
 * (+ 2026-10-17, OWNER duyệt "Nhạc đệm + bài vui hơn") NHẠC ĐỆM KHI CHƠI THEO NHỊP và MICRO:
 * - trống nhịp vui (music/groove.ts) chỉ dùng tiếng ≥ 6,5 kHz → micro (lọc thông thấp bậc 4) nghe đàn như khi chỉ có tiếng tích;
 * - bè đệm piano (accompaniment) lọt vào micro thì CHE tiếng đàn của bé → app không phát bè piano khi micro bật (backingPlan).
 * Mô phỏng: tests/weekSim.ts simulateTempo (bài theo nhịp tuần 4–6, đàn nhẹ + lọc ồn iOS — như weekSongsMic mặc định).
 */
import { describe, expect, it } from 'vitest';
import { WEEKS } from '../src/lessons/lessonEngine';
import { findTune } from '../src/music/exercises';
import { GROOVE_MIN_HZ, backingPlan, groove } from '../src/music/groove';
import { BACKING_STYLES, SONGS, totalBeats, type BackingStyle } from '../src/music/tune';
import { CLICK } from '../src/audio/AudioEngine';
import { simulateTempo, VEL, type Cond } from './weekSim';
import { simulateHands, type ErrKind } from './twoHandSim';

describe('trống nhịp vui (groove)', () => {
  it('mọi tiếng ≥ GROOVE_MIN_HZ (≥ tiếng tích), trong bài, không to hơn phách mạnh', () => {
    expect(GROOVE_MIN_HZ).toBeGreaterThanOrEqual(CLICK.hz);
    for (const t of SONGS)
      for (const st of BACKING_STYLES) {
        const total = totalBeats(t);
        for (const g of groove(t, st)) {
          expect(g.hz).toBeGreaterThanOrEqual(GROOVE_MIN_HZ);
          expect(g.beat).toBeGreaterThanOrEqual(0);
          expect(g.beat).toBeLessThan(total);
          expect(g.gain).toBeLessThanOrEqual(CLICK.accentGain);
        }
      }
  });
  it('mỗi kiểu một nhịp điệu riêng (4/4); nhịp ghép 6/8 không thêm', () => {
    const t = findTune('ex_c_quarter')!;
    const sig = (st: BackingStyle) => groove(t, st).slice(0, 8).map((g) => `${g.beat}@${g.hz}`).join(' ');
    const all = BACKING_STYLES.map(sig);
    expect(new Set(all).size).toBe(BACKING_STYLES.length);
    for (const s of all) expect(s.length).toBeGreaterThan(0);
    const c68 = SONGS.find((s) => s.timeSignature === '6/8');
    if (c68) expect(groove(c68, 'bounce')).toEqual([]);
  });
  it('backingPlan: micro bật → chỉ trống nhịp; bố mẹ tắt / bé chọn chỉ tiếng tích → không gì', () => {
    expect(backingPlan({ parentOn: true, mic: false, clickOnly: false })).toEqual({ pitched: true, groove: true });
    expect(backingPlan({ parentOn: true, mic: true, clickOnly: false })).toEqual({ pitched: false, groove: true });
    expect(backingPlan({ parentOn: false, mic: false, clickOnly: false })).toEqual({ pitched: false, groove: false });
    expect(backingPlan({ parentOn: true, mic: true, clickOnly: true })).toEqual({ pitched: false, groove: false });
  });
});

/** BACKING_MIC=full: mọi bài theo nhịp tuần 4–6 × 4 kiểu + bè piano (≈ 5 phút). Mặc định: 2 bài (nốt đen / móc đơn) × 4 kiểu (≈ 40 s). */
const FULL = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BACKING_MIC === 'full';
const all = new Set<string>();
for (const w of WEEKS.filter((w) => w.week >= 4 && w.week <= 6))
  for (const l of w.lessons) for (const a of l.activities) if (a.kind === 'song' && a.mode === 'tempo') all.add(a.songId);
const ids = FULL ? all : new Set(['ex_c_quarter', 'raindrops'].filter((id) => all.has(id)));

async function run(backing: Cond['backing']) {
  let notes = 0;
  let first = 0;
  const bad: string[] = [];
  for (const id of ids) {
    const r = await simulateTempo(findTune(id)!, { vel: VEL.soft, tempo: 'song', overlap: 0.25, ns: 12, seed: 11, backing });
    notes += r.notes;
    first += r.firstTry;
    if (r.falseWrong > 1 || r.doubles || r.falseHits) bad.push(`${id}: sai oan ${r.falseWrong}, đếm đôi ${r.doubles}, đúng oan ${r.falseHits}`);
  }
  return { rate: first / notes, bad };
}

describe('micro + nhạc đệm — bài theo nhịp tuần 4–6 (đàn nhẹ + lọc ồn)', () => {
  it('có bài để kiểm', () => expect(ids.size).toBeGreaterThan(FULL ? 5 : 1));
  for (const st of BACKING_STYLES) {
    // mức ×3 so với tiếng tích ở micro (loa iPad sát micro, bé để to) — vẫn không ảnh hưởng
    it(`trống nhịp '${st}' (to gấp 3) không làm micro nghe sót / nghe nhầm`, { timeout: 600000 }, async () => {
      const r = await run({ kind: 'groove', style: st, level: 3 });
      expect(r.bad).toEqual([]);
      expect(r.rate).toBeGreaterThanOrEqual(0.95);
    });
  }
  // Đo 2026-10-17 (BACKING_MIC=full, 324 nốt): không đệm 100 % · trống nhịp ×3 mọi kiểu 100 % (0 sai oan) · bè piano nhỏ
  // (lực 0,3) 64 % · bè piano vừa (0,8) 57 % · bè piano 'bounce' 24 %.
  it.runIf(FULL)('VÌ SAO micro bật thì không phát bè đệm piano: dù đệm nhỏ, micro nghe sót nhiều nốt', { timeout: 600000 }, async () => {
    const r = await run({ kind: 'pitched', vel: 0.3 });
    expect(r.rate).toBeLessThan(0.9);
  });
});

describe('micro chấm hai tay + trống nhịp vui (bài hai tay tuần 12+)', () => {
  // Cùng mô phỏng như twoHandBench (mặc định: two_friends, đàn nhẹ + lọc ồn): kết quả từng tay KHÔNG đổi khi có trống nhịp ×3
  const t = findTune('two_friends')!;
  const spb = 60 / t.bpm;
  const t0 = 1.0 + (Number(t.timeSignature.split('/')[0]) || 4) * spb; // như simulateHands
  for (const err of (FULL ? ['none', 'missLH', 'wrongRH'] : ['wrongRH']) as ErrKind[]) {
    it(`lỗi '${err}'`, { timeout: 300000 }, async () => {
      const verdicts = async (st: BackingStyle | null) => {
        const clicks = st ? groove(t, st).map((g) => ({ t: t0 + g.beat * spb, hz: g.hz, gain: g.gain * 3, tau: g.tau })) : [];
        const r = await simulateHands(t, { vel: VEL.soft, legato: 0.15, ns: 12, err, seed: 3, sim: { clicks, clickLevel: 0.02 } });
        return r.tempo.map((x) => `${x.hand}${x.beat}:${x.verdict}`);
      };
      const base = await verdicts(null);
      for (const st of ['arpeggio', 'bounce'] as BackingStyle[]) expect(await verdicts(st)).toEqual(base);
    });
  }
});
