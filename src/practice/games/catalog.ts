/**
 * 🎮 Danh mục trò chơi + trạng thái khóa (thuần — màn "Trò chơi" và test cùng dùng).
 */
import type { Tune } from '../../music/tune';
import type { AppData } from '../../progress/schema';
import { rhythmSymbolsUpTo, rhythmUnlockWeek } from './rhythmQuiz';
import { SONG_MIN, eligibleSongs } from './songGuess';
import { earUnlockWeek, earUnlocked } from './earGuess';
import { echoUnlockWeek, echoUnlocked } from './echo';
import { beatUnlocked } from './beatCatch';

/** (+ 2026-10-09, OWNER duyệt "Thêm trò chơi luyện tai & nhịp") earGuess · contour · beatCatch · echo */
export type GameId = 'noteRush' | 'rhythmQuiz' | 'songGuess' | 'earGuess' | 'contour' | 'beatCatch' | 'echo';
/** Thứ tự trên màn chọn trò: hàng 1 = nốt & tai, hàng 2 = nhịp & bài hát. */
export const GAME_IDS: readonly GameId[] = ['noteRush', 'earGuess', 'contour', 'echo', 'rhythmQuiz', 'beatCatch', 'songGuess'];

export const GAME_INFO: Record<GameId, { emoji: string; title: string; hint: string; unit: string }> = {
  noteRush: { emoji: '⚡', title: 'Đọc nốt nhanh', hint: '60 giây — chạm đúng phím!', unit: 'nốt' },
  rhythmQuiz: { emoji: '🥁', title: 'Đố nhịp', hint: 'Nghe nhịp — chọn thẻ đúng', unit: '/ 8' },
  songGuess: { emoji: '🎵', title: 'Nghe đoán bài', hint: 'Nghe câu đầu — đoán tên bài', unit: '/ 6' },
  earGuess: { emoji: '🎧', title: 'Đoán nốt', hint: 'Nghe Đô rồi nốt bí mật — tìm phím!', unit: '/ 10' },
  contour: { emoji: '🎢', title: 'Lên hay xuống?', hint: 'Nghe giai điệu — chọn hình đúng', unit: '/ 8' },
  beatCatch: { emoji: '🎯', title: 'Bắt nhịp', hint: 'Chạm đúng lúc chấm tới vạch', unit: 'điểm' },
  echo: { emoji: '🔁', title: 'Đàn lại giai điệu', hint: 'Nghe rồi đàn lại — dài dần!', unit: 'nốt' },
};

/** Lý do khóa (lời cho bé, ngắn) — null = chơi được. */
export function gameLock(id: GameId, data: Readonly<AppData>, songs: readonly Tune[]): string | null {
  const week = data.progress.currentWeek;
  if (id === 'rhythmQuiz' && rhythmSymbolsUpTo(week).length < 2) {
    const w = rhythmUnlockWeek();
    return w ? `Mở khi con tới đảo tuần ${w} 🏝️` : 'Sắp có!';
  }
  if ((id === 'earGuess' && !earUnlocked(week)) || (id === 'echo' && !echoUnlocked(week))) {
    const w = id === 'echo' ? echoUnlockWeek() : earUnlockWeek();
    return w ? `Mở khi con tới đảo tuần ${w} 🏝️` : 'Sắp có!';
  }
  if (id === 'beatCatch' && !beatUnlocked(week)) {
    const w = rhythmUnlockWeek(1);
    return w ? `Mở khi con tới đảo tuần ${w} 🏝️` : 'Sắp có!';
  }
  if (id === 'songGuess') {
    const n = eligibleSongs(data, songs).length;
    if (n < SONG_MIN) return `Con biết thêm ${SONG_MIN - n} bài hát nữa là mở 🎶`;
  }
  return null;
}

/** (+ 2026-10-10) Các trò đang mở (không khóa) — theo thứ tự màn chọn trò. Dùng cho nhãn "Mới" (lessons/discovery.ts). */
export function unlockedGames(data: Readonly<AppData>, songs: readonly Tune[]): GameId[] {
  return GAME_IDS.filter((id) => gameLock(id, data, songs) === null);
}
