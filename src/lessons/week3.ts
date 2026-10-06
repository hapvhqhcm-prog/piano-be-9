import { echo, notes, rhNote, rhNotes } from './targets';
import type { WeekPlan } from './types';

/**
 * TUẦN 3 — Cầu thang Sol: ngón 4-5, Leo cầu thang, "Bước hay nhảy?", Nhại lại 3 nốt,
 * bài "Chú cừu nhỏ" & "Dưới ánh trăng". Tai nghe: đoán nốt có mốc Đô.
 * Tiêu chí: tai nghe đúng 8/10 (APP).
 * v5: khởi động kỹ thuật (xoay cổ tay, tay tròn) đầu tuần; trò SÁNG TẠO đầu tiên — ứng tấu trên phím đen (ngũ cung).
 */
export const WEEK3: WeekPlan = {
  week: 3,
  island: 'Cầu thang Sol',
  islandEmoji: '🪜',
  title: 'Fa Sol — thế 5 ngón',
  story: 'Qua khỏi làng là Cầu thang Sol có 5 bậc: Đô Rê Mi Fa Sol. Mỗi ngón tay đứng trên một bậc!',
  warmup: { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 10, reference: 'C4' },
  teach: { emoji: '👨‍🏫', text: 'Con đặt 5 ngón lên Đô Rê Mi Fa Sol, rồi dạy bố/mẹ "Leo cầu thang".' },
  drills: ['wrist-circle', 'hand-shape'],
  criterion: { text: 'Tai nghe (có mốc Đô) đúng 8/10 — ở 2 ngày khác nhau', who: 'APP' },
  kidGoal: 'Đôi tai thám tử: đoán đúng 8 nốt trong 10 — 2 hôm nhé! 👂',
  lessons: [
    {
      id: 'w3-l1',
      week: 3,
      title: 'Fa và Sol',
      emoji: '🖐',
      activities: [
        notes({
          id: 'w3-l1-a',
          step: 'Bài mới',
          title: 'Làm quen Fa và Sol',
          intro: 'Ngón 4 ở Fa, ngón 5 ở Sol. Cả bàn tay nằm trên 5 phím trắng.',
          targets: [rhNote('E4', 'Ngón 3 — ôn lại'), rhNote('F4', 'Ngay bên phải Mi'), rhNote('G4', 'Ngay bên phải Fa'), rhNote('F4'), rhNote('E4')],
        }),
        notes({
          id: 'w3-stairs',
          step: 'Bài mới',
          title: 'Leo cầu thang',
          intro: 'Leo lên từ Đô tới Sol, rồi leo xuống về Đô. Mỗi ngón một bậc!',
          targets: rhNotes(['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4', 'C4']),
        }),
      ],
    },
    {
      id: 'w3-l2',
      week: 3,
      title: 'Bước hay nhảy?',
      emoji: '🐸',
      activities: [
        { kind: 'quiz', title: 'Bước hay nhảy? 🐸', intro: 'Hai nốt cạnh nhau là BƯỚC. Cách một phím là NHẢY. Con nghe rồi chọn nhé!', quiz: { variant: 'stepskip', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 8 } },
        notes({
          id: 'w3-skips',
          step: 'Bài mới',
          title: 'Nhảy cóc',
          intro: 'Nhảy qua một phím: Đô → Mi, Rê → Fa, Mi → Sol.',
          targets: [echo(['C4', 'E4']), echo(['D4', 'F4']), echo(['E4', 'G4']), echo(['G4', 'E4']), echo(['E4', 'C4'])],
        }),
        notes({
          id: 'w3-echo3',
          step: 'Nhại lại',
          title: 'Con vẹt nhại 3 nốt 🦜',
          intro: 'Lần này app đàn 3 nốt. Nghe kỹ rồi đàn lại nhé!',
          targets: [echo(['C4', 'D4', 'E4']), echo(['G4', 'F4', 'E4']), echo(['C4', 'E4', 'G4']), echo(['E4', 'D4', 'C4'])],
        }),
      ],
    },
    {
      id: 'w3-l3',
      week: 3,
      title: 'Bài hát: Chú cừu nhỏ',
      emoji: '🐑',
      activities: [{ kind: 'song', songId: 'mary_lamb', mode: 'wait', hints: 'full', intro: 'Bài này có Sol nữa đấy — ngón 5 chuẩn bị!' }],
    },
    {
      id: 'w3-l4',
      week: 3,
      title: 'Bài hát: Dưới ánh trăng',
      emoji: '🌙',
      activities: [
        { kind: 'song', songId: 'au_clair', mode: 'wait', hints: 'full' },
        {
          kind: 'improv',
          title: 'Nhạc sĩ phím đen 🎨',
          intro: 'App đàn nền nhè nhẹ. Con đàn BẤT KỲ phím đen nào con thích — chậm hay nhanh, to hay nhỏ. Trên phím đen, nốt nào cũng hay!',
          mode: 'black-keys',
        },
      ],
    },
  ],
};
