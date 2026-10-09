/**
 * Tổng hợp lượt chơi theo bài (lịch sử đã gộp + buổi còn giữ): đã thuộc, đã từng chơi, lần chơi cả bài gần nhất.
 */
import { starsFor } from '../music/timing';
import { SONGS } from '../music/tune';
import type { AppData, Session, SongAgg } from '../progress/schema';
import { hist, memo } from '../progress/history';

export type Run = Session['songRuns'][number];
/** Lượt chơi đủ tay (không phải tập tách tay một bè của bài hai tay). */
export const together = (r: Run) => !r.hand;
/** Lượt chơi đạt cả bài (không phải tập một câu, không phải tập tách tay). */
export const passedWhole = (r: Run, songId: string, tempo = false, minBpm = 0): boolean =>
  r.songId === songId && !r.phrase && together(r) && r.passed && (!tempo || r.mode === 'tempo') && r.bpm >= minBpm;

/**
 * (+ 2026-10-06) Cộng một lượt chơi vào tổng hợp của bài (dùng chung cho đọc trực tiếp và gộp lịch sử — compaction.ts).
 * Gọi theo THỨ TỰ buổi / lượt: lượt sau cùng ts thắng ở "lượt gần nhất" (như vòng lặp cũ `r.ts >= lastRun.ts`).
 */
export function foldSongRun(stats: Record<string, SongAgg>, r: Run): void {
  const a = (stats[r.songId] ??= {});
  if (!a.r || r.ts >= a.r[0]) a.r = [r.ts, r.passed ? 1 : 0];
  if (!r.phrase && r.ts > (a.w ?? 0)) a.w = r.ts;
  if (passedWhole(r, r.songId, true, 60) && (a.m === undefined || r.ts < a.m)) a.m = r.ts;
  if (!r.hand && r.total > 0) {
    const st = starsFor(r.hits / r.total);
    if (st > (a.s ?? 0)) a.s = st;
  }
  if (r.passed && !r.phrase && !r.hand) {
    a.h = 1;
    if (r.mode === 'tempo' && !r.songId.startsWith('sight') && r.bpm > (a.b ?? 0)) a.b = r.bpm;
  }
}

/** Tổng hợp mọi bài từng chơi = lịch sử đã gộp + buổi còn giữ (ghi nhớ theo phiên bản dữ liệu). */
export function songStats(data: Readonly<AppData>): Readonly<Record<string, Readonly<SongAgg>>> {
  return memo(data, 'songStats', () => {
    const out: Record<string, SongAgg> = {};
    for (const [id, a] of Object.entries(hist(data).songs)) out[id] = { ...a, ...(a.r ? { r: [a.r[0], a.r[1]] } : {}) };
    for (const s of data.sessions) for (const r of s.songRuns) foldSongRun(out, r);
    return out;
  });
}

/** Bé đã THUỘC bài: chơi trọn theo nhịp ≥ tốc độ 60 và đạt (micro ≥ 80% hoặc bố mẹ xác nhận). "Đã từng thuộc" — giữ cho sticker. */
export function songMastered(data: Readonly<AppData>, songId: string): boolean {
  return songStats(data)[songId]?.m !== undefined;
}

/** (+ 2026-10-06) Bé đã từng chơi bài này (bất kỳ lượt nào, kể cả một câu / tách tay) — vd nhắc "bài mới" ở màn bài hát. */
export function songEverPlayed(data: Readonly<AppData>, songId: string): boolean {
  return !!songStats(data)[songId]?.r;
}

export function masteredSongs(data: Readonly<AppData>): string[] {
  return [...memo(data, 'masteredSongs', () => SONGS.filter((t) => songMastered(data, t.id)).map((t) => t.id))];
}

/** Lần gần nhất chơi CẢ bài (mọi chế độ, cả tách tay; không tính tập một câu) — ms, 0 = chưa chơi. */
export function lastWholePlay(data: Readonly<AppData>, songId: string): number {
  return songStats(data)[songId]?.w ?? 0;
}
