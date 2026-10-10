/**
 * (+ 2026-10-10) Nhãn "Mới" — giúp bé NHẬN RA nội dung mới (trò chơi, bài Thư viện, Album) mà không có màn mừng nào
 * (luật "mỗi lần mở app tối đa MỘT màn mừng" — celebrationQueue.ts). Hàm THUẦN, không đụng DOM.
 *
 * Hai lớp nhãn:
 * 1. Viên "Mới" trên THẺ (bài hát, trò chơi) — suy ra từ dữ liệu sẵn có, không cần lưu thêm:
 *    - bài: thuộc một đợt thêm bài (songAdditions.ts), ĐÃ MỞ (tuần bài ≤ tuần hiện tại) và CHƯA chơi lần nào (songStats);
 *    - trò: đã mở (không khóa) và CHƯA chơi xong lượt nào (data.games).
 *    Viên tắt khi bé chơi lần đầu.
 * 2. Chấm nhỏ trên NÚT ở màn chính (🎵 Bài hát / 🎮 Trò chơi): có mục mới mà bé CHƯA THẤY ở màn đó. Mở màn đó một lần
 *    → ghi các mã đang mới vào settings.seenNew → chấm tắt (không làm phiền mãi nếu bé chưa muốn chơi bài/trò đó).
 * Mục đang khóa không bao giờ có nhãn.
 */
import { SONGS, type Tune } from '../music/tune';
import { songAddedIn } from '../music/songAdditions';
import { cleanSeenNew, SEEN_NEW_MAX, type AppData } from '../progress/schema';
import { songEverPlayed } from './songStats';

export const songKey = (id: string) => `s:${id}`;
export const gameKey = (id: string) => `g:${id}`;
export const ALBUM_KEY = 'album';

/** Bài Thư viện đang "Mới": thuộc một đợt thêm bài, đã mở ở tuần hiện tại, chưa chơi lần nào. */
export function isNewSong(data: Readonly<AppData>, t: Pick<Tune, 'id' | 'week'>): boolean {
  return !!songAddedIn(t.id) && (t.week ?? 1) <= data.progress.currentWeek && !songEverPlayed(data, t.id);
}

/** Mã các bài đang "Mới" (theo thứ tự Thư viện). */
export function newSongIds(data: Readonly<AppData>, songs: readonly Tune[] = SONGS): string[] {
  return songs.filter((t) => isNewSong(data, t)).map((t) => t.id);
}

/** Trò đã chơi xong ít nhất một lượt (có kỷ lục). Đọc MỀM data.games. */
export function gamePlayed(data: Readonly<AppData>, id: string): boolean {
  const g = data.games?.[id];
  return !!g && typeof g === 'object' && (g.plays > 0 || g.lastAt > 0);
}

/** Trò đang "Mới": nằm trong `unlocked` (danh sách trò không khóa — catalog.unlockedGames) và chưa chơi xong lượt nào. */
export function newGameIds(data: Readonly<AppData>, unlocked: readonly string[]): string[] {
  return unlocked.filter((id) => !gamePlayed(data, id));
}

/** Album: có ít nhất một bản thu và bé chưa mở Album lần nào kể từ đó. */
export function albumIsNew(data: Readonly<AppData>, takes: number): boolean {
  return takes > 0 && !seenNew(data).has(ALBUM_KEY);
}

/** Các mã "đã thấy" (đọc mềm). */
export function seenNew(data: Readonly<AppData>): Set<string> {
  return new Set(cleanSeenNew(data.settings.seenNew) ?? []);
}

/** Chấm ở màn chính: còn mã mới nào bé chưa thấy? */
export function hasUnseen(data: Readonly<AppData>, keys: readonly string[]): boolean {
  if (!keys.length) return false;
  const seen = seenNew(data);
  return keys.some((k) => !seen.has(k));
}

/**
 * Danh sách seenNew sau khi bé thấy `keys` — null = không đổi gì (không ghi). Mã mới thêm ở CUỐI; quá SEEN_NEW_MAX thì
 * bỏ mã cũ nhất (mã cũ là bài/trò đã chơi từ lâu — viên trên thẻ đã tắt nên mất mã cũng không hiện lại chấm sai nhiều).
 */
export function withSeen(data: Readonly<AppData>, keys: readonly string[]): string[] | null {
  const cur = cleanSeenNew(data.settings.seenNew) ?? [];
  const have = new Set(cur);
  const add = [...new Set(keys)].filter((k) => k && !have.has(k));
  if (!add.length) return null;
  return [...cur, ...add].slice(-SEEN_NEW_MAX);
}
