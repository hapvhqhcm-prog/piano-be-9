import { cardTarget, fingerCard, notes, rhNote } from './targets';
import type { WeekPlan } from './types';

/**
 * TUẦN 1 — Đảo Phím Đen: định hướng bàn phím (v2, OWNER duyệt 2026-10-04).
 * B1 anh em sinh đôi & sinh ba · B2 nhà Đô · B3 Đô giữa · B4 Đô trầm/cao + Thám tử Đô · B5 tư thế, ngón 1–5.
 * Tiêu chí: tìm C4 đúng 10 lần, được phép trượt tối đa 1 lần (chuyên gia UX, v5) — bố mẹ xác nhận hoặc micro.
 * v5 (OWNER duyệt 2026-10-05): giữ nguyên nội dung tuần 1; thêm 1' khởi động kỹ thuật (thả rơi cánh tay, tay tròn) ở bài tư thế.
 */
const TWINS3 = ['C#3', 'D#3'];
const TWINS4 = ['C#4', 'D#4'];
const TRIPLETS3 = ['F#3', 'G#3', 'A#3'];
const TRIPLETS4 = ['F#4', 'G#4', 'A#4'];

export const WEEK1: WeekPlan = {
  week: 1,
  island: 'Đảo Phím Đen',
  islandEmoji: '🏝️',
  title: 'Định hướng bàn phím',
  story:
    'Trên Đảo Phím Đen có hai gia đình: anh em SINH ĐÔI (2 phím đen) và anh em SINH BA (3 phím đen). Nhà của bạn Đô ở ngay cạnh anh em sinh đôi!',
  warmup: { variant: 'updown', pool: ['C3', 'G3', 'C4', 'G4', 'C5'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ cho bố/mẹ: anh em sinh đôi ở đâu? Nhà Đô ở đâu?' },
  criterion: { text: 'Tìm Đô giữa (C4) đúng 10 lần (trượt tối đa 1 lần)', who: 'PARENT/MIC' },
  lessons: [
    {
      id: 'w1-l1',
      week: 1,
      title: 'Sinh đôi & sinh ba',
      emoji: '⚫⚫',
      activities: [
        notes({
          id: 'w1-b1',
          step: 'B1',
          title: 'Anh em sinh đôi',
          intro: 'Hai phím đen đứng sát nhau là anh em SINH ĐÔI. Mình cùng tìm nhé!',
          targets: [
            { noteId: 'twins-4', title: 'Sinh đôi', subtitle: 'Tìm 2 phím đen sinh đôi ở giữa đàn', keys: TWINS4, sample: TWINS4 },
            { noteId: 'twins-3', title: 'Sinh đôi', subtitle: 'Tìm một cặp sinh đôi khác bên trái', keys: TWINS3, sample: TWINS3 },
            {
              noteId: 'twins-all',
              title: 'Tất cả sinh đôi',
              subtitle: 'Chạm hết các cặp sinh đôi trên đàn',
              keys: [...TWINS3, ...TWINS4],
              sample: [...TWINS3, ...TWINS4],
            },
          ],
        }),
        notes({
          id: 'w1-b1b',
          step: 'B1',
          title: 'Anh em sinh ba',
          intro: 'Ba phím đen đứng cạnh nhau là anh em SINH BA.',
          targets: [
            { noteId: 'triplets-4', title: 'Sinh ba', subtitle: 'Tìm 3 phím đen sinh ba ở giữa đàn', keys: TRIPLETS4, sample: TRIPLETS4 },
            { noteId: 'triplets-3', title: 'Sinh ba', subtitle: 'Tìm nhóm sinh ba bên trái', keys: TRIPLETS3, sample: TRIPLETS3 },
            {
              noteId: 'twins-or-triplets',
              title: 'Sinh đôi hay sinh ba?',
              subtitle: 'Bố/mẹ chỉ một nhóm — con nói "sinh đôi" hay "sinh ba"',
              keys: [...TWINS4, ...TRIPLETS4],
            },
          ],
        }),
      ],
    },
    {
      id: 'w1-l2',
      week: 1,
      title: 'Nhà của Đô',
      emoji: '🏠',
      activities: [
        notes({
          id: 'w1-b2',
          step: 'B2',
          title: 'Nhà của Đô',
          intro: 'Phím trắng ngay BÊN TRÁI anh em sinh đôi là nhà của bạn ĐÔ.',
          targets: [
            rhNote('C4', 'Ngay bên trái anh em sinh đôi', TWINS4),
            rhNote('C3', 'Một nhà Đô khác — bên trái sinh đôi', TWINS3),
            rhNote('C4', 'Ngay bên trái anh em sinh đôi', TWINS4),
          ],
        }),
        notes({
          id: 'w1-b3',
          step: 'B3',
          title: 'Đô giữa',
          intro: 'Đô giữa nằm ở chính giữa đàn, thường ngay dưới tên đàn hoặc ổ khóa.',
          targets: [rhNote('C4', 'Đô giữa'), rhNote('C4', 'Đô giữa'), rhNote('C4', 'Đô giữa')],
        }),
      ],
    },
    {
      id: 'w1-l3',
      week: 1,
      title: 'Thám tử Đô',
      emoji: '🕵️',
      activities: [
        notes({
          id: 'w1-b4',
          step: 'B4',
          title: 'Đô trầm, Đô cao',
          intro: 'Bên trái Đô giữa là Đô trầm (tiếng to, ồm). Bên phải là Đô cao (tiếng trong, nhỏ).',
          targets: [rhNote('C3', 'Đô trầm (C3) — bên trái Đô giữa'), rhNote('C5', 'Đô cao (C5) — bên phải Đô giữa'), rhNote('C4', 'Đô giữa')],
        }),
        notes({
          id: 'w1-detective',
          step: 'B4',
          title: 'Thám tử Đô 🕵️',
          intro: 'Con là thám tử! Tìm nhà Đô thật nhanh theo đúng phím đang sáng.',
          targets: [
            rhNote('C5', 'Đô cao'),
            rhNote('C3', 'Đô trầm'),
            rhNote('C4', 'Đô giữa'),
            rhNote('C3', 'Đô trầm'),
            rhNote('C5', 'Đô cao'),
            rhNote('C4', 'Đô giữa'),
          ],
        }),
      ],
    },
    {
      id: 'w1-l4',
      week: 1,
      title: 'Ngón tay bí ẩn',
      emoji: '✋',
      activities: [
        { kind: 'technique', title: 'Cánh tay cầu vồng 🌈', drills: ['arm-drop', 'hand-shape'] },
        notes({
          id: 'w1-b5a',
          step: 'B5',
          title: 'Ngồi đẹp',
          intro: 'Người chơi đàn giỏi luôn ngồi đẹp. Bố/mẹ xem con làm nhé!',
          targets: [
            cardTarget('posture-back', 'Ngồi thẳng lưng', '🪑'),
            cardTarget('posture-hand', 'Tay tròn như ôm quả bóng', '⚽'),
            cardTarget('posture-wrist', 'Cổ tay thẳng, không gập', '✋'),
          ],
        }),
        notes({
          id: 'w1-b5b',
          step: 'B5',
          title: 'Ngón tay bí ẩn',
          intro: 'Mỗi ngón tay có một số: ngón cái là 1, ngón út là 5. App chỉ ngón nào, con nhúc nhích ngón đó!',
          targets: [fingerCard(1), fingerCard(3), fingerCard(2), fingerCard(5), fingerCard(4), rhNote('C4', 'Đặt ngón 1 lên Đô giữa')],
        }),
      ],
    },
    {
      id: 'w1-test',
      week: 1,
      title: 'Thử thách: Đô giữa 10 lần',
      emoji: '⭐',
      isWeekTest: true,
      activities: [
        notes({
          id: 'w1-test-c4',
          step: 'Thử thách',
          title: 'Tìm Đô giữa 10 lần',
          intro: 'Bố/mẹ nói "Đô giữa!" — con tìm thật nhanh. 10 lần nhé!',
          targets: Array.from({ length: 10 }, (_, i) => rhNote('C4', `Lần ${i + 1}/10`)),
        }),
      ],
    },
  ],
};
