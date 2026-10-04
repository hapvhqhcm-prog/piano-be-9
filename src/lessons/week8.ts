import type { WeekPlan } from './types';

/**
 * TUẦN 8 — Lâu đài Âm nhạc: thêm 3 bài mới, rồi bé TỰ CHỌN chương trình 2–3 bài và biểu diễn.
 * Tiêu chí: phụ huynh tặng huy chương.
 */
export const WEEK8: WeekPlan = {
  week: 8,
  island: 'Lâu đài Âm nhạc',
  islandEmoji: '🏰',
  title: 'Biểu diễn',
  story: 'Con đã tới Lâu đài Âm nhạc! Hôm nay con là nghệ sĩ — cả nhà là khán giả.',
  warmup: { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'], rounds: 8, reference: 'C4' },
  teach: { emoji: '🎤', text: 'Con giới thiệu với khán giả: "Bài tiếp theo tên là…, của nhạc sĩ…".' },
  criterion: { text: 'Biểu diễn trọn vẹn — phụ huynh tặng huy chương', who: 'PARENT' },
  lessons: [
    {
      id: 'w8-l1',
      week: 8,
      title: 'Ông lão vui tính',
      emoji: '👴',
      activities: [
        { kind: 'song', songId: 'this_old_man', mode: 'wait', hints: 'names' },
        { kind: 'song', songId: 'this_old_man', mode: 'tempo', level: 3, hints: 'names' },
      ],
    },
    {
      id: 'w8-l2',
      week: 8,
      title: 'Trang trại & Susanna',
      emoji: '🐮',
      activities: [
        { kind: 'song', songId: 'old_macdonald', mode: 'wait', hints: 'names', intro: 'Bài này bắt đầu ở Fa — ngón 4 nhé!' },
        { kind: 'song', songId: 'oh_susanna', mode: 'wait', hints: 'names' },
      ],
    },
    {
      id: 'w8-stage',
      week: 8,
      title: 'Buổi biểu diễn',
      emoji: '🏅',
      isWeekTest: true,
      activities: [{ kind: 'stage' }],
    },
  ],
};
