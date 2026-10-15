/**
 * (2026-10-15, OWNER duyệt — rà soát của thầy giáo nhiều kinh nghiệm) Trợ giúp đọc nhạc theo LỊCH SỬ của bé:
 * · "ĐỌC NHỊP TO TRƯỚC KHI ĐÀN" — khi nào màn bài hát hiện bước "Đọc nhịp trước" (ui/screens/songChant.ts).
 *   Dữ liệu: cờ `chant` ở hoạt động bài hát THEO NHỊP trong giáo trình (week4/5.ts, level2.ts…). Mẫu nhịp: music/chant.ts.
 * · "BỚT MÀU & TÊN NỐT SỚM HƠN" — bài QUEN (songFamiliar) cho quy tắc màu / gợi ý ở ui/components/noteColors.ts.
 */
import type { AppData } from '../progress/schema';
import { WEEKS } from './curriculum';
import { songStats } from './songStats';

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
