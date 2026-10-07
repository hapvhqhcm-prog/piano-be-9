/**
 * 🎮 Danh mục trò chơi + trạng thái khóa (thuần — màn "Trò chơi" và test cùng dùng).
 */
import type { Tune } from '../../music/tune';
import type { AppData } from '../../progress/schema';
import { rhythmSymbolsUpTo, rhythmUnlockWeek } from './rhythmQuiz';
import { SONG_MIN, eligibleSongs } from './songGuess';

export type GameId = 'noteRush' | 'rhythmQuiz' | 'songGuess';
export const GAME_IDS: readonly GameId[] = ['noteRush', 'rhythmQuiz', 'songGuess'];

export const GAME_INFO: Record<GameId, { emoji: string; title: string; hint: string; unit: string }> = {
  noteRush: { emoji: '⚡', title: 'Đọc nốt nhanh', hint: '60 giây — chạm đúng phím!', unit: 'nốt' },
  rhythmQuiz: { emoji: '🥁', title: 'Đố nhịp', hint: 'Nghe nhịp — chọn thẻ đúng', unit: '/ 8' },
  songGuess: { emoji: '🎵', title: 'Nghe đoán bài', hint: 'Nghe câu đầu — đoán tên bài', unit: '/ 6' },
};

/** Lý do khóa (lời cho bé, ngắn) — null = chơi được. */
export function gameLock(id: GameId, data: Readonly<AppData>, songs: readonly Tune[]): string | null {
  const week = data.progress.currentWeek;
  if (id === 'rhythmQuiz' && rhythmSymbolsUpTo(week).length < 2) {
    const w = rhythmUnlockWeek();
    return w ? `Mở khi con tới đảo tuần ${w} 🏝️` : 'Sắp có!';
  }
  if (id === 'songGuess') {
    const n = eligibleSongs(data, songs).length;
    if (n < SONG_MIN) return `Con biết thêm ${SONG_MIN - n} bài hát nữa là mở 🎶`;
  }
  return null;
}
