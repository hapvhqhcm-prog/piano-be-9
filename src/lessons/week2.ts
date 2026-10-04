import { rhNote, rhNotes } from './targets';
import type { WeekPlan } from './types';

/**
 * TUẦN 2 — Đô Rê Mi tay phải (§11, CURRICULUM LOCK).
 * Ngón 1-2-3 trên C4 D4 E4; khởi động tai nghe 3 nốt.
 * Tiêu chí: 2 buổi liền bé tự chọn "Đánh được hết" (SELF).
 */
export const WEEK2: WeekPlan = {
  week: 2,
  title: 'Đô Rê Mi tay phải',
  earPool: ['C4', 'D4', 'E4'],
  earRounds: 10,
  criterion: { text: '2 buổi liền bé tự chọn "Đánh được hết"', who: 'SELF' },
  lessons: [
    {
      id: 'w2-l1',
      week: 2,
      title: 'Đô – Rê – Mi',
      emoji: '🎵',
      segments: [
        {
          id: 'w2-l1-a',
          step: 'Bài mới',
          title: 'Làm quen Rê và Mi',
          intro: 'Ngón 1 ở Đô, ngón 2 ở Rê, ngón 3 ở Mi.',
          targets: [
            rhNote('C4', 'Ngón 1'),
            rhNote('D4', 'Ngay bên phải Đô'),
            rhNote('E4', 'Ngay bên phải Rê'),
            rhNote('D4'),
            rhNote('C4'),
          ],
        },
        {
          id: 'w2-l1-b',
          step: 'Bài mới',
          title: 'Đi lên, đi xuống',
          intro: 'Đô Rê Mi đi lên, Mi Rê Đô đi xuống.',
          targets: rhNotes(['C4', 'D4', 'E4', 'E4', 'D4', 'C4']),
        },
      ],
    },
    {
      id: 'w2-l2',
      week: 2,
      title: 'Đô Rê Mi nhảy múa',
      emoji: '💃',
      segments: [
        {
          id: 'w2-l2-a',
          step: 'Bài mới',
          title: 'Nhảy cóc',
          intro: 'Bây giờ các nốt sẽ đổi chỗ. Nhớ ngón 1-2-3 nhé!',
          targets: rhNotes(['C4', 'E4', 'D4', 'C4', 'E4', 'C4', 'D4', 'E4']),
        },
      ],
    },
  ],
};
