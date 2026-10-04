import { echo, notes, rhNote, rhNotes } from './targets';
import type { WeekPlan } from './types';

/**
 * TUẦN 2 — Làng Đô Rê Mi: ngón 1-2-3, Nhại lại 2 nốt, bài "Bánh nóng", tai nghe "Lên hay xuống?",
 * vỗ tay "Đi – Đi" (chuẩn bị nhịp tuần 4). Tiêu chí: 2 buổi liền bé chọn "Đánh được hết" (SELF).
 */
export const WEEK2: WeekPlan = {
  week: 2,
  island: 'Làng Đô Rê Mi',
  islandEmoji: '🏘️',
  title: 'Đô Rê Mi tay phải',
  story: 'Ở Làng Đô Rê Mi, ba bạn Đô, Rê, Mi sống cạnh nhau. Ngón 1, 2, 3 của con sẽ đến thăm từng nhà!',
  warmup: { variant: 'updown', pool: ['C4', 'D4', 'E4'], rounds: 8 },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố/mẹ: ngón nào đánh Đô, ngón nào đánh Rê, ngón nào đánh Mi?' },
  criterion: { text: '2 buổi liền bé tự chọn "Đánh được hết"', who: 'SELF' },
  lessons: [
    {
      id: 'w2-l1',
      week: 2,
      title: 'Đô – Rê – Mi',
      emoji: '🎵',
      activities: [
        notes({
          id: 'w2-l1-a',
          step: 'Bài mới',
          title: 'Làm quen Rê và Mi',
          intro: 'Ngón 1 ở Đô, ngón 2 ở Rê, ngón 3 ở Mi.',
          targets: [rhNote('C4', 'Ngón 1'), rhNote('D4', 'Ngay bên phải Đô'), rhNote('E4', 'Ngay bên phải Rê'), rhNote('D4'), rhNote('C4')],
        }),
        notes({
          id: 'w2-l1-b',
          step: 'Bài mới',
          title: 'Đi lên, đi xuống',
          intro: 'Đô Rê Mi đi lên, Mi Rê Đô đi xuống.',
          targets: rhNotes(['C4', 'D4', 'E4', 'E4', 'D4', 'C4']),
        }),
      ],
    },
    {
      id: 'w2-l2',
      week: 2,
      title: 'Nhại lại & vỗ tay',
      emoji: '🦜',
      activities: [
        notes({
          id: 'w2-echo',
          step: 'Nhại lại',
          title: 'Con vẹt nhại lại 🦜',
          intro: 'App đàn 2 nốt — con nghe rồi đàn lại y hệt, đúng thứ tự.',
          targets: [echo(['C4', 'D4']), echo(['E4', 'D4']), echo(['D4', 'C4']), echo(['C4', 'E4']), echo(['E4', 'C4'])],
        }),
        { kind: 'rhythm', title: 'Vỗ tay "Đi – Đi"', intro: 'Mỗi tiếng "tích" là một bước đi. Con vỗ tay và nói "Đi" theo nhịp nhé.', patterns: [['walk', 'walk', 'walk', 'walk']] },
      ],
    },
    {
      id: 'w2-l3',
      week: 2,
      title: 'Bài hát: Bánh nóng',
      emoji: '🥐',
      activities: [{ kind: 'song', songId: 'hot_cross_buns', mode: 'wait', hints: 'full', intro: 'Bài hát đầu tiên của con — chỉ cần Mi, Rê, Đô!' }],
    },
  ],
};
