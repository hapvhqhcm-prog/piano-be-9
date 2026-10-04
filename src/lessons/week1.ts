import { cardTarget, fingerCard, rhNote } from './targets';
import type { WeekPlan } from './types';

/**
 * TUẦN 1 — Định hướng bàn phím (§11, CURRICULUM LOCK).
 * B1 nhóm 2 phím đen · B2 Đô bên trái nhóm 2 phím đen · B3 Đô giữa (C4)
 * · B4 C3 và C5 · B5 tư thế ngồi, tay tròn, đếm ngón 1–5.
 * Tiêu chí: phụ huynh xác nhận tìm C4 đúng 10/10 (PARENT).
 */
const GROUP3 = ['C#3', 'D#3'];
const GROUP4 = ['C#4', 'D#4'];

export const WEEK1: WeekPlan = {
  week: 1,
  title: 'Định hướng bàn phím',
  earPool: [],
  earRounds: 0,
  criterion: { text: 'Phụ huynh: bé tìm Đô giữa (C4) đúng 10/10', who: 'PARENT' },
  lessons: [
    {
      id: 'w1-l1',
      week: 1,
      title: 'Nhóm 2 phím đen',
      emoji: '⚫⚫',
      segments: [
        {
          id: 'w1-b1',
          step: 'B1',
          title: 'Nhóm 2 phím đen',
          intro: 'Trên đàn có những nhóm 2 phím đen đứng cạnh nhau. Mình cùng tìm nhé!',
          targets: [
            {
              noteId: 'group2-4',
              title: '2 phím đen',
              subtitle: 'Tìm nhóm 2 phím đen ở giữa đàn',
              keys: GROUP4,
              sample: GROUP4,
            },
            {
              noteId: 'group2-3',
              title: '2 phím đen',
              subtitle: 'Tìm một nhóm 2 phím đen bên trái',
              keys: GROUP3,
              sample: GROUP3,
            },
            {
              noteId: 'group2-all',
              title: 'Tất cả nhóm 2 phím đen',
              subtitle: 'Chạm hết các nhóm 2 phím đen trên đàn',
              keys: [...GROUP3, ...GROUP4],
              sample: [...GROUP3, ...GROUP4],
            },
          ],
        },
        {
          id: 'w1-b2',
          step: 'B2',
          title: 'Đô ở bên trái',
          intro: 'Phím trắng ngay BÊN TRÁI nhóm 2 phím đen tên là ĐÔ.',
          targets: [
            rhNote('C4', 'Ngay bên trái nhóm 2 phím đen', GROUP4),
            rhNote('C3', 'Một Đô khác — bên trái nhóm 2 phím đen', GROUP3),
            rhNote('C4', 'Ngay bên trái nhóm 2 phím đen', GROUP4),
          ],
        },
      ],
    },
    {
      id: 'w1-l2',
      week: 1,
      title: 'Đô giữa',
      emoji: '🎯',
      segments: [
        {
          id: 'w1-b3',
          step: 'B3',
          title: 'Đô giữa',
          intro: 'Đô giữa nằm ở chính giữa đàn, thường ngay dưới tên đàn hoặc ổ khóa.',
          targets: [rhNote('C4', 'Đô giữa'), rhNote('C4', 'Đô giữa'), rhNote('C4', 'Đô giữa')],
        },
        {
          id: 'w1-b4',
          step: 'B4',
          title: 'Đô trầm, Đô cao',
          intro: 'Bên trái Đô giữa là Đô trầm. Bên phải là Đô cao.',
          targets: [
            rhNote('C3', 'Đô trầm (C3) — bên trái Đô giữa'),
            rhNote('C5', 'Đô cao (C5) — bên phải Đô giữa'),
            rhNote('C4', 'Đô giữa'),
            rhNote('C3', 'Đô trầm (C3)'),
            rhNote('C5', 'Đô cao (C5)'),
            rhNote('C4', 'Đô giữa'),
          ],
        },
      ],
    },
    {
      id: 'w1-l3',
      week: 1,
      title: 'Tư thế & ngón tay',
      emoji: '✋',
      segments: [
        {
          id: 'w1-b5a',
          step: 'B5',
          title: 'Ngồi đẹp',
          intro: 'Người chơi đàn giỏi luôn ngồi đẹp. Bố/mẹ xem con làm nhé!',
          targets: [
            cardTarget('posture-back', 'Ngồi thẳng lưng', '🪑'),
            cardTarget('posture-hand', 'Tay tròn như ôm quả bóng', '⚽'),
            cardTarget('posture-wrist', 'Cổ tay thẳng, không gập', '✋'),
          ],
        },
        {
          id: 'w1-b5b',
          step: 'B5',
          title: 'Đếm ngón tay',
          intro: 'Mỗi ngón tay có một số: từ ngón cái là 1 đến ngón út là 5.',
          targets: [
            fingerCard(1),
            fingerCard(2),
            fingerCard(3),
            fingerCard(4),
            fingerCard(5),
            rhNote('C4', 'Đặt ngón 1 lên Đô giữa'),
          ],
        },
      ],
    },
    {
      id: 'w1-test',
      week: 1,
      title: 'Thử thách: Đô giữa 10 lần',
      emoji: '⭐',
      isWeekTest: true,
      segments: [
        {
          id: 'w1-test-c4',
          step: 'Kiểm tra',
          title: 'Tìm Đô giữa 10 lần',
          intro: 'Bố/mẹ nói "Đô giữa!" — con tìm thật nhanh. 10 lần nhé!',
          targets: Array.from({ length: 10 }, (_, i) => rhNote('C4', `Lần ${i + 1}/10`)),
        },
      ],
    },
  ],
};
