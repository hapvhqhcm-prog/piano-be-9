import type { WeekPlan } from './types';

/**
 * TUẦN 6 (tuần 5 cũ — v5 dời sau tuần củng cố) — Sân khấu nhỏ: "Ode to Joy" từng nốt → từng câu theo nhịp → cả bài;
 * đàn cùng bố mẹ (app đánh bè đệm). Thêm "Chuông ngân vang", "Các thánh tiến bước".
 * Tiêu chí: chơi trọn Ode to Joy ở tốc độ 60 (phiếu 3 ý của bố mẹ, hoặc micro ≥ 80%) — v5: ở 2 NGÀY khác nhau.
 * SẮC THÁI (OWNER duyệt 2026-10-05): trò "To hay nhỏ?" (f = to, p = nhỏ) mở đầu bài 1 — từ đây bài hát có dấu p / mf / f.
 */
export const WEEK6: WeekPlan = {
  week: 6,
  island: 'Sân khấu nhỏ',
  islandEmoji: '🎪',
  title: 'Bài hát đầu tiên',
  story: 'Ở Sân khấu nhỏ, cả làng chờ nghe con đàn "Bài ca niềm vui". Bố mẹ sẽ đàn cùng con!',
  warmup: { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6, reference: 'C4' },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố/mẹ câu đầu "Bài ca niềm vui": Mi Mi Fa Sol – Sol Fa Mi Rê. Đàn một lần TO (f), một lần NHỎ (p)!' },
  drills: ['five-finger', 'finger-tap'],
  criterion: { text: 'Chơi trọn "Bài ca niềm vui" ở tốc độ 60 — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Bài ca niềm vui ở tốc độ 60 — 2 hôm nhé! 🎶',
  lessons: [
    {
      id: 'w6-l1',
      week: 6,
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
      id: 'w6-l2',
      week: 6,
      title: 'Bài ca niềm vui — theo nhịp',
      emoji: '🎼',
      activities: [{ kind: 'song', songId: 'ode_to_joy_easy', mode: 'tempo', level: 2, hints: 'full', intro: 'Tập từng câu, rồi cả bài. Bật nhạc đệm để bố mẹ "đàn cùng"!' }],
    },
    {
      id: 'w6-l3',
      week: 6,
      title: 'Chuông ngân vang',
      emoji: '🔔',
      activities: [
        { kind: 'song', songId: 'jingle_bells', mode: 'wait', hints: 'full' },
        { kind: 'song', songId: 'jingle_bells', mode: 'tempo', level: 2, hints: 'full' },
      ],
    },
    {
      id: 'w6-l4',
      week: 6,
      title: 'Các thánh tiến bước',
      emoji: '🎺',
      activities: [
        { kind: 'song', songId: 'saints', mode: 'wait', hints: 'full', intro: 'Bài này có chỗ "Suỵt" (nghỉ) ở đầu mỗi câu — nhớ chờ nhé!' },
        { kind: 'song', songId: 'saints', mode: 'tempo', level: 3, hints: 'full' },
      ],
    },
  ],
};
