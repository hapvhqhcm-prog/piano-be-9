/**
 * (+ 2026-10-17, tích hợp) BẢN GHI CỦA BUỔI TRONG BỘ NHỚ — cho nút "🎧 Nghe con vừa đàn" ở màn kết buổi.
 * Màn bài hát (songTake.TakeReplay) báo mỗi lượt ghi xong (micro bật) vào đây; màn kết buổi phát bản HAY NHẤT của buổi
 * (lượt có điểm), không có điểm thì bản ghi CUỐI — kể cả khi Album không lưu (bản cũ hay hơn / Album đầy / khách chơi).
 * Chỉ giữ vài lượt có điểm gần nhất + MỘT bản cuối (≤ ~0,7 MB mỗi bản). Không có gì trên đĩa.
 */
import { isBetterTake, type TakeScore } from '../../progress/albumStore';

export interface MemTake {
  blob: Blob;
  seconds: number;
  /** Lúc ghi xong (ms) — màn kết buổi chỉ nhận bản ghi từ lúc buổi bắt đầu */
  at: number;
  songId: string | null;
  title: string;
  score: TakeScore | null;
}

/** Số lượt có điểm giữ lại (gần nhất) */
export const KEEP_SCORED = 4;
let last: MemTake | null = null;
let scored: MemTake[] = [];

/** Một lượt vừa ghi xong (chưa biết điểm). */
export function rememberTake(t: Omit<MemTake, 'score' | 'at'> & { at?: number }): MemTake {
  const m: MemTake = { ...t, at: t.at ?? Date.now(), score: null };
  last = m;
  return m;
}

/** Lượt `m` (đã nhớ) có điểm (lượt cả bài) → có thể thành bản hay nhất. */
export function scoreTake(m: MemTake, score: TakeScore): void {
  m.score = score;
  scored = [...scored.filter((x) => x !== m), m].slice(-KEEP_SCORED);
}

/** Bản để nghe ở màn kết buổi (bắt đầu từ `since`): hay nhất có điểm → bản cuối → null. */
export function sessionMemTake(since: number): MemTake | null {
  let best: MemTake | null = null;
  for (const x of scored) if (x.at >= since && x.score && (!best || isBetterTake(x.score, best.score))) best = x;
  if (best) return best;
  if (last && last.at >= since) return last;
  return null;
}

/** Quên hết (test / rời app). */
export function forgetTakes(): void {
  last = null;
  scored = [];
}
