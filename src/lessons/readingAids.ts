/**
 * (2026-10-15, OWNER duyệt — rà soát của thầy giáo nhiều kinh nghiệm) Trợ giúp đọc nhạc theo LỊCH SỬ của bé:
 * · "ĐỌC NHỊP TO TRƯỚC KHI ĐÀN" — khi nào màn bài hát hiện bước "Đọc nhịp trước" (ui/screens/songChant.ts).
 *   Dữ liệu: cờ `chant` ở hoạt động bài hát THEO NHỊP trong giáo trình (week4/5.ts, level2.ts…). Mẫu nhịp: music/chant.ts.
 * · "BỚT MÀU & TÊN NỐT SỚM HƠN" — bài QUEN (songFamiliar) cho quy tắc màu / gợi ý ở ui/components/noteColors.ts.
 * · (+ 2026-10-16, OWNER duyệt) "ĐỌC TRƯỚC, NGHE MẪU SAU" — từ tuần 8, bài GẶP LẦN ĐẦU trong buổi học: bé tự đọc & đàn
 *   trước, nút "🎧 Nghe mẫu" mờ tới khi bé thử (readFirstDue / readFirstUnlock — màn bài hát: ui/screens/song.ts).
 */
import type { AppData } from '../progress/schema';
import { WEEKS } from './curriculum';
import { expressionUsed, type Tune } from '../music/tune';
import { songEverPlayed, songStats } from './songStats';

let ids: ReadonlySet<string> | null = null;

/** Các bài có cờ `chant` ở một lượt theo nhịp nào đó trong giáo trình. */
export function chantSongIds(): ReadonlySet<string> {
  ids ??= new Set(
    WEEKS.flatMap((w) => w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' && a.mode === 'tempo' && a.chant ? [a.songId] : [])))),
  );
  return ids;
}

/**
 * Bài QUEN: bé đã ĐẠT trọn bài ít nhất một lần (cả bài, đủ tay — chế độ chờ hoặc theo nhịp; kể cả lịch sử đã gộp).
 * Lần đầu gặp bài (chưa đạt lượt chờ nào) → chưa quen → giữ màu / tên nốt.
 */
export function songFamiliar(data: Readonly<AppData>, songId: string): boolean {
  // (+ 2026-10-17, hiệu chỉnh) chế độ nhẹ tay KHÔNG giữ tên nốt & màu cho bài bé ĐÃ đạt (chỉ bài mới — vốn đã giữ ở đây):
  // trước đây 'gentle' coi mọi bài là chưa quen → bé lùi lại dựa vào màu ở cả bài đã đọc được
  return !songId.startsWith('sight') && songStats(data)[songId]?.h === 1;
}

/** Bé đã có lượt THEO NHỊP nào của bài chưa (cả một câu / tách tay; kể cả lịch sử đã gộp — có tốc độ đạt). */
export function songTempoEverPlayed(data: Readonly<AppData>, songId: string): boolean {
  return data.sessions.some((s) => s.songRuns.some((r) => r.songId === songId && r.mode === 'tempo')) || !!songStats(data)[songId]?.b;
}

/**
 * Có hiện "Đọc nhịp trước" khi mở bài này không: bài có cờ `chant`, mở THEO NHỊP trong buổi học (không phải Thư viện,
 * sân khấu, "Ôn bài cũ", "Lặp 3 lần"), và bé CHƯA có lượt theo nhịp nào của bài (chỉ trước lượt theo nhịp đầu tiên).
 */
export function chantDue(
  data: Readonly<AppData>,
  songId: string,
  opts: { mode: 'wait' | 'tempo'; free?: boolean; stage?: boolean; review?: boolean; loop?: boolean },
): boolean {
  if (opts.mode !== 'tempo' || opts.free || opts.stage || opts.review || opts.loop) return false;
  return chantSongIds().has(songId) && !songTempoEverPlayed(data, songId);
}

/* ---------- (+ 2026-10-16, OWNER duyệt) ĐỌC TRƯỚC, NGHE MẪU SAU ---------- */

/** Từ tuần này (đọc khuông nhạc) bài gặp lần đầu được "đọc trước, nghe mẫu sau". */
export const READ_FIRST_WEEK = 8;
/** Bé chưa thử sau chừng này (ms) → mở nút "🎧 Nghe mẫu" (không để bé kẹt). */
export const READ_FIRST_IDLE_MS = 20_000;
/** Đàn sai chừng này lần ở CÙNG một chỗ (chế độ chờ) → mời "🎧 Nghe mẫu câu này". */
export const READ_FIRST_WRONG_SPOT = 2;
/** Lời dẫn trên màn bài hát khi nút nghe mẫu còn mờ. */
export const READ_FIRST_TEXT = 'Con thử tự đọc trước nhé — đọc xong mới nghe mẫu!';

/**
 * Có "đọc trước, nghe mẫu sau" khi mở bài này không: từ tuần 8, bài của BUỔI HỌC (không Thư viện / sân khấu / bước ôn /
 * "Lặp 3 lần" / đọc nhạc ngẫu nhiên) mà bé CHƯA có lượt nào (gặp lần đầu). Không áp dụng: bài có cờ `chant` (nhịp mới —
 * bước "Đọc nhịp trước" đã làm mẫu nhịp) và bài có pedal (Cấp 4 — cần xem mẫu pedal).
 */
export function readFirstDue(
  data: Readonly<AppData>,
  tune: Tune,
  opts: { free?: boolean; stage?: boolean; review?: boolean; loop?: boolean },
): boolean {
  if (opts.free || opts.stage || opts.review || opts.loop) return false;
  if (data.progress.currentWeek < READ_FIRST_WEEK || tune.id.startsWith('sight')) return false;
  if (chantSongIds().has(tune.id) || expressionUsed(tune).ped) return false;
  return !songEverPlayed(data, tune.id);
}

/**
 * Nút "🎧 Nghe mẫu" mở chưa (bài đang "đọc trước"): bé đã THỬ (chạm Bắt đầu), hoặc đã chờ ≥ 20 giây mà chưa thử,
 * hoặc đàn sai ≥ 2 lần ở cùng một chỗ.
 */
export function readFirstUnlocked(s: { attempted: boolean; idleMs: number; wrongHere?: number }): boolean {
  return s.attempted || s.idleMs >= READ_FIRST_IDLE_MS || (s.wrongHere ?? 0) >= READ_FIRST_WRONG_SPOT;
}
