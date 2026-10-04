import { echo, lhNote, lhNotes, notes } from './targets';
import type { WeekPlan } from './types';

/**
 * TUẦN 6 — Tấm gương: tay trái = "tấm gương" của tay phải (ngón 5→1 trên C3–G3, §6).
 * Lặp bài tuần 2–3 bằng tay trái. Tiêu chí: như tuần 3 — tai nghe đúng 8/10 (APP), dải tay trái.
 */
export const WEEK6: WeekPlan = {
  week: 6,
  island: 'Hồ Tấm Gương',
  islandEmoji: '🪞',
  title: 'Tay trái',
  story: 'Ở Hồ Tấm Gương, tay trái là cái bóng của tay phải: ngón út (5) đứng ở Đô, ngón cái (1) đứng ở Sol.',
  leftHand: true,
  warmup: { variant: 'identify', pool: ['C3', 'D3', 'E3', 'F3', 'G3'], rounds: 10, reference: 'C3' },
  teach: { emoji: '👨‍🏫', text: 'Con giơ hai tay lên và chỉ cho bố/mẹ: ngón số 1 của tay trái và tay phải ở đâu?' },
  criterion: { text: 'Tai nghe tay trái (có mốc Đô) đúng 8/10', who: 'APP' },
  lessons: [
    {
      id: 'w6-l1',
      week: 6,
      title: 'Tay trái tìm nhà',
      emoji: '🫲',
      activities: [
        notes({
          id: 'w6-l1-a',
          step: 'Bài mới',
          title: 'Ngón 5 tay trái ở Đô',
          intro: 'Tay trái đặt ngón 5 (ngón út) lên Đô trầm, ngón 1 (ngón cái) lên Sol.',
          targets: [lhNote('C3', 'Ngón 5 — ngón út'), lhNote('D3'), lhNote('E3'), lhNote('F3'), lhNote('G3', 'Ngón 1 — ngón cái')],
        }),
        notes({
          id: 'w6-stairs',
          step: 'Bài mới',
          title: 'Leo cầu thang tay trái',
          intro: 'Leo lên Đô → Sol bằng ngón 5-4-3-2-1, rồi leo xuống.',
          targets: lhNotes(['C3', 'D3', 'E3', 'F3', 'G3', 'F3', 'E3', 'D3', 'C3']),
        }),
        notes({
          id: 'w6-echo',
          step: 'Nhại lại',
          title: 'Con vẹt tay trái 🦜',
          intro: 'App đàn — con đàn lại bằng tay trái.',
          targets: [echo(['E3', 'D3', 'C3'], 'LH'), echo(['C3', 'E3', 'G3'], 'LH'), echo(['G3', 'F3', 'E3'], 'LH')],
        }),
      ],
    },
    {
      id: 'w6-l2',
      week: 6,
      title: 'Bánh nóng — tay trái',
      emoji: '🥐',
      activities: [
        { kind: 'song', songId: 'hot_cross_buns_lh', mode: 'wait', hints: 'full' },
        { kind: 'song', songId: 'hot_cross_buns_lh', mode: 'tempo', level: 2, hints: 'full' },
      ],
    },
    {
      id: 'w6-l3',
      week: 6,
      title: 'Cừu & Trăng — tay trái',
      emoji: '🐑',
      activities: [
        { kind: 'song', songId: 'mary_lamb_lh', mode: 'wait', hints: 'full' },
        { kind: 'song', songId: 'au_clair_lh', mode: 'wait', hints: 'full' },
      ],
    },
    {
      id: 'w6-l4',
      week: 6,
      title: 'Khúc Largo (tay phải)',
      emoji: '🏡',
      activities: [
        { kind: 'song', songId: 'largo_new_world', mode: 'wait', hints: 'full', intro: 'Một giai điệu rất hay của nhạc sĩ Dvořák — đàn chậm và êm nhé.' },
        { kind: 'song', songId: 'largo_new_world', mode: 'tempo', level: 3, hints: 'full' },
      ],
    },
  ],
};
