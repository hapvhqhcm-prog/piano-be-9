import type { WeekPlan } from './types';

/**
 * TUẦN 10 (tuần 8 cũ — v5: cuối Cấp 1 sau 10 tuần) — Lâu đài Âm nhạc: thêm 3 bài mới, rồi bé TỰ CHỌN chương trình 2–3 bài và biểu diễn.
 * Tiêu chí: phụ huynh tặng huy chương. "Xòe hoa" đã dời sang tuần 9 (sau bài nhịp 2/4) — vẫn chọn được khi biểu diễn.
 */
export const WEEK10: WeekPlan = {
  week: 10,
  island: 'Lâu đài Âm nhạc',
  islandEmoji: '🏰',
  title: 'Biểu diễn',
  story: 'Con đã tới Lâu đài Âm nhạc! Hôm nay con là nghệ sĩ — cả nhà là khán giả.',
  warmup: { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'], rounds: 8, reference: 'C4' },
  teach: { emoji: '🎤', text: 'Con giới thiệu với khán giả: "Bài tiếp theo tên là…, của nhạc sĩ…".' },
  criterion: { text: 'Biểu diễn trọn vẹn — phụ huynh tặng huy chương', who: 'PARENT' },
  lessons: [
    {
      id: 'w10-l1',
      week: 10,
      title: 'Ông lão vui tính',
      emoji: '👴',
      activities: [
        { kind: 'technique', title: 'Ngón chắc, tay tròn ✋', drills: ['five-finger', 'hand-shape'] },
        { kind: 'song', songId: 'this_old_man', mode: 'wait', hints: 'names' },
        { kind: 'song', songId: 'this_old_man', mode: 'tempo', level: 3, hints: 'names' },
      ],
    },
    {
      id: 'w10-l2',
      week: 10,
      title: 'Trang trại & Susanna',
      emoji: '🐮',
      activities: [
        { kind: 'song', songId: 'old_macdonald', mode: 'wait', hints: 'names', intro: 'Bài này bắt đầu ở Fa — ngón 4 nhé!' },
        { kind: 'song', songId: 'oh_susanna', mode: 'wait', hints: 'names' },
      ],
    },
    {
      id: 'w10-stage',
      week: 10,
      title: 'Buổi biểu diễn',
      emoji: '🏅',
      isWeekTest: true,
      activities: [{ kind: 'stage' }],
    },
  ],
};
