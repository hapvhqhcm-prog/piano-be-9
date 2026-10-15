/**
 * Tổng hợp lượt chơi theo bài (lịch sử đã gộp + buổi còn giữ): đã thuộc, đã từng chơi, lần chơi cả bài gần nhất.
 */
import { starsFor } from '../music/timing';
import { SONGS, noteUnit, type Tune } from '../music/tune';
import { localDateStr, type AppData, type Session, type SongAgg } from '../progress/schema';
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
export function foldSongRun(stats: Record<string, SongAgg>, r: Run, ruleFrom?: number): void {
  const a = (stats[r.songId] ??= {});
  if (!a.r || r.ts >= a.r[0]) a.r = [r.ts, r.passed ? 1 : 0];
  if (!r.phrase && r.ts > (a.w ?? 0)) a.w = r.ts;
  if (passedWhole(r, r.songId, true, 60)) {
    if (ruleFrom === undefined || r.ts < ruleFrom) {
      // Luật CŨ (lượt trước khi luật 2 ngày có hiệu lực — "giữ nguyên quyền"): MỘT lượt đạt là thuộc
      if (a.m === undefined || r.ts < a.m) a.m = r.ts;
    } else if (a.m === undefined) {
      // (+ 2026-10-15, OWNER duyệt) THUỘC = lượt trọn bài đạt (≥ 80%, theo nhịp ≥ 60) ở 2 NGÀY khác nhau:
      // ngày đầu ghi `md`, lượt đạt ở một ngày KHÁC → thuộc
      const day = localDateStr(new Date(r.ts));
      if (a.md === undefined) a.md = day;
      else if (a.md !== day) a.m = r.ts;
    }
  }
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
    const ruleFrom = masteryRuleFrom(data);
    for (const s of data.sessions) for (const r of s.songRuns) foldSongRun(out, r, ruleFrom);
    return out;
  });
}

/**
 * (+ 2026-10-15, OWNER duyệt — rà soát của giáo viên "thuộc bài sau MỘT lượt là quá dễ") Lúc luật "thuộc = 2 ngày" bắt đầu
 * có hiệu lực trên iPad này (ms, settings.masteryRuleFrom — ProgressStore ghi khi mở bản mới / nhập dữ liệu chưa có mốc).
 * Lượt TRƯỚC mốc này giữ luật cũ (một lượt đạt là thuộc) → bài đã thuộc vẫn thuộc; sticker / "Con chơi được N bài" /
 * thử thách của dữ liệu cũ không đổi. undefined (dữ liệu chưa qua ProgressStore bản mới) = mọi lượt theo luật cũ.
 */
export function masteryRuleFrom(data: Readonly<AppData>): number | undefined {
  const v = (data.settings as { masteryRuleFrom?: unknown } | undefined)?.masteryRuleFrom;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Bé đã THUỘC bài: chơi trọn theo nhịp ≥ tốc độ 60 và đạt (micro ≥ 80% hoặc bố mẹ xác nhận) — (+ 2026-10-15) ở 2 NGÀY
 * khác nhau (lượt trước masteryRuleFrom: một lượt là đủ). "Đã từng thuộc" — giữ cho sticker.
 */
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

/* ---------- (+ 2026-10-15, OWNER duyệt) BẮT ĐẦU CHẬM ---------- */

/** Tốc độ mở đầu khi bài CHƯA có lượt theo nhịp nào đạt: 50 — 40 nếu bài có móc đơn / móc kép hoặc hai tay cùng lúc. */
export const START_SLOW_BPM = 50;
export const START_SLOW_HARD_BPM = 40;

/** Bài có nốt ngắn hơn một nốt đen (móc đơn / móc kép; nhịp x/8 — phách là móc đơn). */
export function hasEighths(t: Tune): boolean {
  const u = noteUnit(t);
  return [...t.notes, ...(t.lh ?? [])].some((n) => !n.rest && n.beats * u < 1 - 1e-9);
}

/**
 * (+ 2026-10-15, OWNER duyệt — khớp lời dặn bố mẹ "tốc độ 40 trước") Tốc độ mở sẵn cho lượt THEO NHỊP: bài chưa từng
 * chơi trọn theo nhịp và đạt (songStats `b`) → min(tốc độ bài, 50), hoặc 40 nếu bài có móc đơn / hai tay cùng lúc;
 * sau đó thang tốc độ 40 → 50 → 60 như cũ (nút "🐇 Nhanh hơn" ở màn kết quả). Đã có lượt đạt → tốc độ của bài.
 */
export function startTempoBpm(t: Tune, data: Readonly<AppData>): number {
  if (t.id.startsWith('sight') || songStats(data)[t.id]?.b !== undefined) return t.bpm;
  const hard = hasEighths(t) || !!t.lh?.some((n) => !n.rest);
  return Math.min(t.bpm, hard ? START_SLOW_HARD_BPM : START_SLOW_BPM);
}

/**
 * (+ 2026-10-15) Ghi mốc luật "thuộc = 2 ngày" (settings.masteryRuleFrom) nếu dữ liệu CHƯA có — ProgressStore gọi khi mở app /
 * nhập dữ liệu / xóa hết. Mọi lượt TRƯỚC mốc giữ luật cũ (giữ nguyên quyền). Trả về true nếu vừa ghi.
 */
export function stampMasteryRule(data: AppData, now: number): boolean {
  if (masteryRuleFrom(data) !== undefined) return false;
  (data.settings as { masteryRuleFrom?: number }).masteryRuleFrom = now;
  return true;
}
