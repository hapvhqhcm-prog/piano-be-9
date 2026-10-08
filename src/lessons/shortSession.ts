import { SONGS, findSong, type Tune } from '../music/tune';
import type { AppData } from '../progress/schema';
import { lastSessionDate } from '../progress/history';
import { lastWholePlay, masteredSongs, songFresh, songStats } from './lessonEngine';

/**
 * 👋 MỪNG CON QUAY LẠI + BUỔI NGẮN 5 PHÚT (OWNER duyệt 2026-10-08) — hàm THUẦN (test: tests/homeLongTerm.test.ts).
 *
 * Nghỉ ≥ WELCOME_BACK_HOME_DAYS ngày → màn chính: Bé Nốt chào "nhớ con" + nút "Buổi ngắn 5 phút" = chơi 1 bài con THÍCH
 * (bài chơi trọn nhiều lần nhất) + 1 bài ÔN (bài đã thuộc lâu chưa chơi). Kế hoạch riêng — KHÔNG đụng buildSessionPlan:
 * mở bằng đúng màn bài hát của Thư viện (playSong), lượt chơi lưu vào một buổi "-song-" như chơi ở Thư viện.
 */

/** Nghỉ từ bấy nhiêu ngày trở lên (tính theo lịch, từ buổi có nội dung gần nhất) → lời chào "Bé Nốt nhớ con!". */
export const WELCOME_BACK_HOME_DAYS = 3;

/** Bài thật trong kho (không phải bài tập gam / đọc nhạc ngẫu nhiên). */
const realSong = (t: Tune | undefined): t is Tune => !!t && !t.id.startsWith('scale') && !t.id.startsWith('sight');

/**
 * 🎵 "Con chơi được N bài": số bài trong kho bài hát (không tính bài tập gam / đọc nhạc ngẫu nhiên) mà bé đã ít nhất
 * MỘT lần chơi TRỌN bài, đủ tay (không phải tập một câu / tách tay) và ĐẠT — songStats(...).h (gồm cả lịch sử đã gộp,
 * chỉ tăng). Không dùng "≥ 2 sao" riêng vì sao tính cả lượt tập một câu.
 */
export function playableSongIds(data: Readonly<AppData>): string[] {
  const stats = songStats(data);
  return SONGS.filter((t) => realSong(t) && stats[t.id]?.h === 1).map((t) => t.id);
}

export const playableSongCount = (data: Readonly<AppData>): number => playableSongIds(data).length;

/** Số ngày (theo lịch) từ buổi có nội dung gần nhất tới `now`; null = chưa học buổi nào. */
export function daysAway(data: Readonly<AppData>, now: Date): number | null {
  const last = lastSessionDate(data);
  if (!last) return null;
  const [y, m, d] = last.split('-').map(Number);
  const a = new Date(y, m - 1, d).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Màn chính có nên chào "Bé Nốt nhớ con!" không. */
export function welcomeBack(data: Readonly<AppData>, now: Date): boolean {
  const n = daysAway(data, now);
  return n !== null && n >= WELCOME_BACK_HOME_DAYS;
}

/**
 * Bài con THÍCH: bài chơi trọn (đạt) nhiều lần nhất trong các buổi còn giữ; hòa → bài chơi gần đây hơn.
 * Không có → bài đã chơi được (playable) mới nhất → bài đầu tiên của tuần hiện tại.
 */
export function favouriteSong(data: Readonly<AppData>): Tune | null {
  const count = new Map<string, number>();
  for (const s of data.sessions)
    for (const r of s.songRuns) if (r.passed && !r.phrase && !r.hand && realSong(findSong(r.songId))) count.set(r.songId, (count.get(r.songId) ?? 0) + 1);
  const best = [...count].sort((a, b) => b[1] - a[1] || lastWholePlay(data, b[0]) - lastWholePlay(data, a[0]))[0];
  if (best) return findSong(best[0]) ?? null;
  const playable = playableSongIds(data);
  if (playable.length) return findSong(playable[playable.length - 1]) ?? null;
  const week = data.progress.currentWeek;
  return SONGS.find((t) => realSong(t) && (t.week ?? 1) === week) ?? SONGS.find((t) => realSong(t) && (t.week ?? 1) <= week) ?? null;
}

/** Bài ÔN: bài đã thuộc (khác `exclude`) — ưu tiên bài đã "mờ" (lâu chưa chơi), rồi bài lâu chưa chơi nhất. */
export function reviewSongFor(data: Readonly<AppData>, exclude: string | null, now: number): Tune | null {
  const cands = masteredSongs(data).filter((id) => id !== exclude && realSong(findSong(id)));
  if (!cands.length) {
    const other = playableSongIds(data).filter((id) => id !== exclude);
    cands.push(...other);
  }
  if (!cands.length) return null;
  const stale = cands.filter((id) => !songFresh(id, data, now));
  const pool = stale.length ? stale : cands;
  const pick = [...pool].sort((a, b) => lastWholePlay(data, a) - lastWholePlay(data, b))[0];
  return findSong(pick) ?? null;
}

/** Kế hoạch buổi ngắn: [bài con thích, bài ôn] (bài ôn có thể không có). Rỗng = không có bài nào. */
export function shortSessionSongs(data: Readonly<AppData>, now: number = Date.now()): Tune[] {
  const fav = favouriteSong(data);
  if (!fav) return [];
  const rev = reviewSongFor(data, fav.id, now);
  return rev ? [fav, rev] : [fav];
}
