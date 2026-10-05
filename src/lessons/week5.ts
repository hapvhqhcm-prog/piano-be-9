import type { WeekPlan } from './types';

/**
 * TUẦN 5 — Sân khấu nhỏ: "Ode to Joy" từng nốt → từng câu theo nhịp → cả bài;
 * đàn cùng bố mẹ (app đánh bè đệm). Thêm "Chuông ngân vang", "Các thánh tiến bước".
 * Tiêu chí: chơi trọn Ode to Joy ở tốc độ 60 (bố mẹ xác nhận, hoặc micro ≥ 80%).
 * SẮC THÁI (OWNER duyệt 2026-10-05): trò "To hay nhỏ?" (f = to, p = nhỏ) mở đầu bài 1 — từ đây bài hát có dấu p / mf / f.
 */
export const WEEK5: WeekPlan = {
  week: 5,
  island: 'Sân khấu nhỏ',
  islandEmoji: '🎪',
  title: 'Bài hát đầu tiên',
  story: 'Ở Sân khấu nhỏ, cả làng chờ nghe con đàn "Bài ca niềm vui". Bố mẹ sẽ đàn cùng con!',
  warmup: { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 8, reference: 'C4' },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố/mẹ câu đầu "Bài ca niềm vui": Mi Mi Fa Sol – Sol Fa Mi Rê. Đàn một lần TO (f), một lần NHỎ (p)!' },
  criterion: { text: 'Chơi trọn "Bài ca niềm vui" ở tốc độ 60', who: 'PARENT/MIC' },
  lessons: [
    {
      id: 'w5-l1',
      week: 5,
      title: 'Bài ca niềm vui — từng nốt',
      emoji: '🎶',
      activities: [
        {
          kind: 'dynamics',
          title: 'To hay nhỏ? 🦁🐭',
          intro: 'Đàn TO như sư tử (f — "forte"): ngón chắc, ấn sâu hơn. Đàn NHỎ như chú chuột (p — "piano"): chạm phím thật nhẹ. Thầy đàn mẫu, con đàn lại!',
          mode: 'loud-soft',
          rounds: [
            { pitches: ['C4'], want: 'f', fingers: [1], hand: 'RH' },
            { pitches: ['C4'], want: 'p', fingers: [1], hand: 'RH' },
            { pitches: ['E4', 'D4', 'C4'], want: 'f', fingers: [3, 2, 1], hand: 'RH' },
            { pitches: ['E4', 'D4', 'C4'], want: 'p', fingers: [3, 2, 1], hand: 'RH' },
            { pitches: ['C4', 'D4', 'E4', 'F4', 'G4'], want: 'p', fingers: [1, 2, 3, 4, 5], hand: 'RH' },
            { pitches: ['G4', 'F4', 'E4', 'D4', 'C4'], want: 'f', fingers: [5, 4, 3, 2, 1], hand: 'RH' },
          ],
        },
        { kind: 'song', songId: 'ode_to_joy_easy', mode: 'wait', hints: 'full', intro: 'Bài của nhạc sĩ Beethoven! Dấu "mf" ở đầu bài = đàn VỪA, không to không nhỏ. Mình tập từng nốt trước.' },
      ],
    },
    {
      id: 'w5-l2',
      week: 5,
      title: 'Bài ca niềm vui — theo nhịp',
      emoji: '🎼',
      activities: [{ kind: 'song', songId: 'ode_to_joy_easy', mode: 'tempo', level: 2, hints: 'full', intro: 'Tập từng câu, rồi cả bài. Bật nhạc đệm để bố mẹ "đàn cùng"!' }],
    },
    {
      id: 'w5-l3',
      week: 5,
      title: 'Chuông ngân vang',
      emoji: '🔔',
      activities: [
        { kind: 'song', songId: 'jingle_bells', mode: 'wait', hints: 'full' },
        { kind: 'song', songId: 'jingle_bells', mode: 'tempo', level: 2, hints: 'full' },
      ],
    },
    {
      id: 'w5-l4',
      week: 5,
      title: 'Các thánh tiến bước',
      emoji: '🎺',
      activities: [
        { kind: 'song', songId: 'saints', mode: 'wait', hints: 'full', intro: 'Bài này có chỗ "Suỵt" (nghỉ) ở đầu mỗi câu — nhớ chờ nhé!' },
        { kind: 'song', songId: 'saints', mode: 'tempo', level: 3, hints: 'full' },
      ],
    },
  ],
};
