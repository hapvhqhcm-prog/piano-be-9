/**
 * Tổng hợp lượt chơi theo bài (lịch sử đã gộp + buổi còn giữ): đã thuộc, đã từng chơi, lần chơi cả bài gần nhất.
 */
import { starsFor } from '../music/timing';
import { SONGS, noteUnit, type Tune } from '../music/tune';
import { localDateStr, type AppData, type Session, type SongAgg } from '../progress/schema';
import { hist, memo } from '../progress/history';
import { adaptiveStartBpm, stretchFamiliarBpm } from './adaptive';
import { REWARD_LESSON_PREFIX, countsForMastery, sessionKind } from './sessionKind';

export type Run = Session['songRuns'][number];
/**
 * (+ 2026-10-16) Mã buổi của lượt chơi "🎁 bài thưởng" ở màn kết buổi (lessons/rewardSongs.ts): `reward-song-<bài>`.
 * Không bắt đầu bằng "w<tuần>-" → không vào tiêu chí tuần; lượt trong đó không tính "đã thuộc" (foldSongRun `reward`).
 */
export { REWARD_LESSON_PREFIX };
export const isRewardLessonId = (lessonId: string): boolean => sessionKind(lessonId) === 'reward';
/** Lượt chơi đủ tay (không phải tập tách tay một bè của bài hai tay). */
export const together = (r: Run) => !r.hand;
/** Lượt chơi đạt cả bài (không phải tập một câu, không phải tập tách tay). */
export const passedWhole = (r: Run, songId: string, tempo = false, minBpm = 0): boolean =>
  r.songId === songId && !r.phrase && together(r) && r.passed && (!tempo || r.mode === 'tempo') && r.bpm >= minBpm;

/** Tốc độ "thuộc bài" chuẩn (theo nhịp, ≥ ngần này). */
export const MASTERY_BPM = 60;
let tuneBpm: Map<string, number> | null = null;
/**
 * (+ 2026-10-17, OWNER duyệt) Tốc độ cần để THUỘC một bài = min(MASTERY_BPM, tốc độ viết của bài): 7 bài dân ca viết ở 40
 * (ly_cay_da, bac_kim_thang, co_la, ly_ngua_o, ly_cay_bong, di_cay, ho_ba_li) thuộc được ở đúng tốc độ của bài. Bài không có trong
 * SONGS (đọc nhạc, bài bố mẹ thêm…) → MASTERY_BPM. Dùng chung cho đọc trực tiếp và gộp lịch sử (compaction → foldSongRun).
 */
export function masteryBpm(songId: string): number {
  tuneBpm ??= new Map(SONGS.map((t) => [t.id, t.bpm]));
  const b = tuneBpm.get(songId);
  return typeof b === 'number' && b > 0 ? Math.min(MASTERY_BPM, b) : MASTERY_BPM;
}

/**
 * (+ 2026-10-06) Cộng một lượt chơi vào tổng hợp của bài (dùng chung cho đọc trực tiếp và gộp lịch sử — compaction.ts).
 * Gọi theo THỨ TỰ buổi / lượt: lượt sau cùng ts thắng ở "lượt gần nhất" (như vòng lặp cũ `r.ts >= lastRun.ts`).
 */
export function foldSongRun(stats: Record<string, SongAgg>, r: Run, ruleFrom?: number, reward = false): void {
  const a = (stats[r.songId] ??= {});
  if (!a.r || r.ts >= a.r[0]) a.r = [r.ts, r.passed ? 1 : 0];
  if (!r.phrase && r.ts > (a.w ?? 0)) a.w = r.ts;
  // (+ 2026-10-16) Lượt của buổi TÙY CHỌN (🎁 bài thưởng `reward-song-…`; + 2026-10-17: ⭐ thử thách nhỏ `stretch-song-…` —
  // lessons/sessionKind.countsForMastery): không tính "đã thuộc"
  if (!reward && passedWhole(r, r.songId, true, masteryBpm(r.songId))) {
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
    for (const s of data.sessions) for (const r of s.songRuns) foldSongRun(out, r, ruleFrom, !countsForMastery(s.lessonId));
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
 * Bé đã THUỘC bài: chơi trọn theo nhịp ≥ tốc độ 60 (+ 2026-10-17: bài viết chậm hơn → tốc độ của bài — masteryBpm) và đạt (micro ≥ 80% hoặc bé tự kiểm tra đạt — trước 2026-10-25: bố mẹ xác nhận) — (+ 2026-10-15) ở 2 NGÀY
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
  if (t.id.startsWith('sight')) return t.bpm;
  // (+ 2026-10-16, OWNER duyệt "Tự cân độ khó") bé đang vấp nhiều (lessons/adaptive.ts 'gentle') → mở sẵn tốc độ 40 — (+ 2026-10-17,
  // hiệu chỉnh) CHỈ cho bài bé CHƯA đạt lần nào; bài đã đạt (songStats `h` / `b`) mở như thường (không kéo về 40)
  const st = songStats(data)[t.id];
  if (st?.b !== undefined) return t.bpm;
  const hard = hasEighths(t) || !!t.lh?.some((n) => !n.rest);
  const slow = Math.min(t.bpm, hard ? START_SLOW_HARD_BPM : START_SLOW_BPM);
  // (+ 2026-10-17, OWNER duyệt "bài vui hơn") bài QUEN (đã đạt cả bài) không bao giờ mở dưới FAMILIAR_MIN_BPM — chậm 40–50 chỉ cho bài MỚI
  // (+ 2026-10-25) bé đang làm rất tốt (adaptive 'stretch') → bài quen mở đúng tốc độ của bài
  return st?.h === 1 ? stretchFamiliarBpm(t.bpm, Math.max(slow, familiarMinBpm(t)), data) : adaptiveStartBpm(slow, data);
}

/**
 * (+ 2026-10-17, OWNER duyệt "Nhạc đệm + bài vui hơn") Bài QUEN (đã từng chơi trọn và đạt — songStats `h` / `b`) mở theo nhịp
 * KHÔNG chậm hơn 56 (bé thấy "bò" ở 40–50 với bài đã biết). Bài vốn viết chậm hơn (vd dân ca 40 có móc kép) giữ tốc độ bài.
 */
export const FAMILIAR_MIN_BPM = 56;
export const familiarMinBpm = (t: Pick<Tune, 'bpm'>): number => Math.min(t.bpm, FAMILIAR_MIN_BPM);
/** Bài bé đã chơi trọn và đạt (mọi kiểu) — "bài quen" cho luật tốc độ ở trên. */
export function songPassedBefore(data: Readonly<AppData>, songId: string): boolean {
  const st = songStats(data)[songId];
  return !!st && (st.h === 1 || st.b !== undefined);
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

/* ---------- (+ 2026-10-16, cách dạy của thầy) LÙI TỐC ĐỘ KHI VỪA LÊN NẤC MÀ CHƯA CHẮC TAY ---------- */

/** Thang tốc độ (giống TEMPOS ở màn bài hát) và tốc độ thấp nhất khi lùi. */
export const TEMPO_LADDER: readonly number[] = [40, 50, 60, 72];
export const TEMPO_FLOOR = 40;
/** Số lượt ĐẠT liền ở tốc độ đã lùi trước khi lại được gợi ý "🐇 Nhanh hơn" (không nhảy lên xuống). */
export const PULLBACK_GOOD = 2;

export interface TempoOutcome {
  bpm: number;
  passed: boolean;
}

export interface TempoAdvice {
  /** Lượt CUỐI vừa làm bé lùi tốc độ: tốc độ mới (null = không) — "Mình về tốc độ X cho chắc tay nhé" */
  pullTo: number | null;
  /** Đang củng cố ở tốc độ đã lùi (chưa đủ PULLBACK_GOOD lượt đạt liền): mở sẵn tốc độ này, chưa gợi ý nhanh hơn */
  hold: number | null;
}

/** Nấc chậm hơn `bpm` một bậc trên thang, không dưới TEMPO_FLOOR. */
export function notchBelow(bpm: number, ladder: readonly number[] = TEMPO_LADDER): number {
  const lower = ladder.filter((t) => t < bpm);
  return Math.max(TEMPO_FLOOR, lower.length ? lower[lower.length - 1] : TEMPO_FLOOR);
}

/**
 * Lượt THEO NHỊP của bài trong HÔM NAY (theo thứ tự): cùng câu đang mở (`phrase`, null = cả bài), đủ tay. Chỉ đọc dữ liệu buổi còn giữ (lượt mới ghi ngay khi chơi — ProgressStore.addSongRun).
 */
export function todayTempoOutcomes(
  data: Readonly<AppData>,
  songId: string,
  phrase: [number, number] | null = null,
  now = Date.now(),
): TempoOutcome[] {
  const day = localDateStr(new Date(now));
  const key = phrase ? `${phrase[0]}-${phrase[1]}` : '';
  const runs: Run[] = [];
  for (const s of data.sessions)
    for (const r of s.songRuns)
      if (r.songId === songId && r.mode === 'tempo' && together(r) && (r.phrase ? `${r.phrase[0]}-${r.phrase[1]}` : '') === key && localDateStr(new Date(r.ts)) === day)
        runs.push(r);
  return runs.sort((a, b) => a.ts - b.ts).map((r) => ({ bpm: r.bpm, passed: r.passed }));
}

/**
 * (+ 2026-10-16) LÙI TỐC ĐỘ như thầy dạy: vừa LÊN tốc độ (đã có lượt đạt ở tốc độ chậm hơn) mà 2 lượt LIỀN ở tốc độ mới
 * chưa đạt → lùi một nấc (≥ 40) "cho chắc tay"; ở tốc độ đã lùi phải ĐẠT 2 lượt liền mới gợi ý nhanh hơn lại (không
 * nhảy lên xuống). Lượt đạt ở tốc độ cao hơn tốc độ đã lùi (bé tự chọn) cũng thôi giữ.
 */
export function tempoAdvice(outs: readonly TempoOutcome[], ladder: readonly number[] = TEMPO_LADDER): TempoAdvice {
  let hold: number | null = null;
  let good = 0;
  let pullTo: number | null = null;
  outs.forEach((o, i) => {
    pullTo = null;
    if (hold !== null) {
      if (o.passed && o.bpm >= hold) {
        good = o.bpm > hold ? PULLBACK_GOOD : good + 1;
        if (good >= PULLBACK_GOOD) hold = null;
      } else if (o.bpm === hold) good = 0;
    }
    const prev = outs[i - 1];
    if (!o.passed && prev && !prev.passed && prev.bpm === o.bpm && o.bpm > TEMPO_FLOOR) {
      const movedUp = outs.slice(0, i - 1).some((x) => x.passed && x.bpm < o.bpm);
      const to = notchBelow(o.bpm, ladder);
      if (movedUp && to < o.bpm) {
        pullTo = to;
        hold = to;
        good = 0;
      }
    }
  });
  return { pullTo, hold };
}
