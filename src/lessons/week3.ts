import { rhNote, rhNotes } from './targets';
import type { WeekPlan } from './types';

/**
 * TUẦN 3 — Fa Sol, thế 5 ngón (§11, CURRICULUM LOCK).
 * Ngón 4-5; "Leo cầu thang" C4→G4→C4. Tai nghe 5 nốt.
 * Tiêu chí: tai nghe đúng 8/10 (APP).
 */
export const WEEK3: WeekPlan = {
  week: 3,
  title: 'Fa Sol — thế 5 ngón',
  earPool: ['C4', 'D4', 'E4', 'F4', 'G4'],
  earRounds: 10,
  criterion: { text: 'Trò chơi tai nghe đúng 8/10', who: 'APP' },
  lessons: [
    {
      id: 'w3-l1',
      week: 3,
      title: 'Fa và Sol',
      emoji: '🖐',
      segments: [
        {
          id: 'w3-l1-a',
          step: 'Bài mới',
          title: 'Làm quen Fa và Sol',
          intro: 'Ngón 4 ở Fa, ngón 5 ở Sol. Cả bàn tay nằm trên 5 phím trắng.',
          targets: [rhNote('E4', 'Ngón 3 — ôn lại'), rhNote('F4', 'Ngay bên phải Mi'), rhNote('G4', 'Ngay bên phải Fa'), rhNote('F4'), rhNote('E4')],
        },
        {
          id: 'w3-l1-b',
          step: 'Bài mới',
          title: 'Mi Fa Sol',
          intro: 'Mi Fa Sol đi lên, Sol Fa Mi đi xuống.',
          targets: rhNotes(['E4', 'F4', 'G4', 'G4', 'F4', 'E4']),
        },
      ],
    },
    {
      id: 'w3-l2',
      week: 3,
      title: 'Leo cầu thang',
      emoji: '🪜',
      segments: [
        {
          id: 'w3-l2-a',
          step: 'Bài mới',
          title: 'Leo cầu thang',
          intro: 'Leo lên từ Đô tới Sol, rồi leo xuống về Đô. Mỗi ngón một bậc!',
          targets: rhNotes(['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4', 'C4']),
        },
      ],
    },
  ],
};
