/**
 * MICRO TRÊN BÀI THẬT TUẦN 4–10 (2026-10-08, bé đang ở tuần 4): bài hát qua đúng đường chấm của app
 * (chờ / theo nhịp — tests/weekSim.ts), đàn nhẹ có lọc ồn iOS, đàn bình thường, và đàn có lỗi.
 * Yêu cầu: chế độ chờ không "đàn sai" oan; theo nhịp tối đa 1 lần oan/bài; không đếm đôi; ≥ 95% nốt nhận ngay lần đầu.
 *
 * Mặc định (chạy trong mọi lần test/deploy): tuần 4–6, đàn nhẹ + lọc ồn. Đầy đủ (≈ 13 phút): MIC_WEEKS=full.
 */
import { describe, expect, it } from 'vitest';
import { WEEKS } from '../src/lessons/lessonEngine';
import { findTune } from '../src/music/exercises';
import { simulateTempo, simulateWait, VEL, type Cond, type Stats } from './weekSim';

const FULL = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MIC_WEEKS === 'full';

const ALL_CONDS: Record<string, Omit<Cond, 'seed'>> = {
  'nhẹ + lọc ồn': { vel: VEL.soft, tempo: 'song', overlap: 0.25, ns: 12 },
  'bình thường, chậm': { vel: VEL.normal, tempo: 'slow', overlap: 0.3 },
  'nhẹ, có lỗi': { vel: VEL.soft, tempo: 'song', overlap: 0.25, mistakes: true },
};
const CONDS = FULL ? ALL_CONDS : { 'nhẹ + lọc ồn': ALL_CONDS['nhẹ + lọc ồn'] };
const LAST_WEEK = FULL ? 10 : 6;

const songs: Array<{ id: string; mode: 'wait' | 'tempo'; week: number }> = [];
const seen = new Set<string>();
for (const w of WEEKS.filter((w) => w.week >= 4 && w.week <= LAST_WEEK))
  for (const l of w.lessons)
    for (const a of l.activities) {
      if (a.kind !== 'song' || (a.mode !== 'wait' && a.mode !== 'tempo')) continue;
      const key = a.songId + a.mode;
      if (seen.has(key)) continue;
      seen.add(key);
      songs.push({ id: a.songId, mode: a.mode, week: w.week });
    }

describe(`micro — bài hát tuần 4–${LAST_WEEK}`, () => {
  it('có bài để kiểm', () => expect(songs.length).toBeGreaterThan(5));

  for (const [name, cond] of Object.entries(CONDS)) {
    it(name, { timeout: 1200000 }, async () => {
      let notes = 0;
      let first = 0;
      const bad: string[] = [];
      for (const s of songs) {
        const t = findTune(s.id);
        expect(t, s.id).toBeTruthy();
        const c: Cond = { ...cond, seed: 11 };
        const r: Stats = s.mode === 'wait' ? await simulateWait(t!, c) : await simulateTempo(t!, c);
        notes += r.notes;
        first += r.firstTry;
        if (r.falseWrong > (s.mode === 'tempo' ? 1 : 0) || r.doubles)
          bad.push(`w${s.week} ${s.id} ${s.mode}: sai oan ${r.falseWrong}, đếm đôi ${r.doubles}`);
      }
      expect(bad).toEqual([]);
      expect(first / notes).toBeGreaterThanOrEqual(0.95);
    });
  }
});
