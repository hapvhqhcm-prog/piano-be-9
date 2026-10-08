import type { WeekPlan } from './types';

/**
 * TUẦN 6 (tuần 5 cũ — v5 dời sau tuần củng cố) — Sân khấu nhỏ: "Ode to Joy" từng nốt → từng câu theo nhịp → cả bài;
 * đàn cùng bố mẹ (app đánh bè đệm). Thêm "Chuông ngân vang", "Các thánh tiến bước".
 * Tiêu chí: chơi trọn Ode to Joy ở tốc độ 60 (phiếu 3 ý của bố mẹ, hoặc micro ≥ 80%) — v5: ở 2 NGÀY khác nhau.
 * SẮC THÁI (OWNER duyệt 2026-10-05): trò "To hay nhỏ?" (f = to, p = nhỏ) mở đầu bài 1 — từ đây bài hát có dấu p / mf / f.
 * (2026-10-08, OWNER duyệt) lượt theo nhịp chỉ tên nốt (week4.ts "GỢI Ý RÚT DẦN"); ứng tấu 1 phút "Hỏi to, đáp nhỏ" ở bài 2.
 */
export const WEEK6: WeekPlan = {
  week: 6,
  island: 'Sân khấu nhỏ',
  islandEmoji: '🎪',
  title: 'Bài ca niềm vui',
  story: 'Ở Sân khấu nhỏ, cả làng chờ nghe con đàn "Bài ca niềm vui". Bố mẹ sẽ đàn cùng con!',
  warmup: { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6, reference: 'C4' },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố mẹ câu đầu "Bài ca niềm vui": Mi Mi Fa Sol – Sol Fa Mi Rê. Đàn một lần TO (f), một lần NHỎ (p)!' },
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
          intro: 'Đàn TO như sư tử, NHỎ như chuột nhắt — theo thầy!',
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
        { kind: 'song', songId: 'ode_to_joy_easy', mode: 'wait', hints: 'full', intro: 'Dấu mf = đàn VỪA. Tập từng nốt trước nhé!' },
      ],
    },
    {
      id: 'w6-l2',
      week: 6,
      title: 'Bài ca niềm vui — theo nhịp',
      emoji: '🎼',
      activities: [
        { kind: 'song', songId: 'ode_to_joy_easy', mode: 'tempo', level: 2, hints: 'names', intro: 'Tập từng câu, rồi cả bài. Bật nhạc đệm nhé!' },
        // (2026-10-08, OWNER duyệt) ứng tấu 1 phút mỗi tuần — sắc thái của tuần: TO / NHỎ
        {
          kind: 'improv',
          title: 'Hỏi to, đáp nhỏ 💬',
          intro: 'App hỏi TO. Con đáp NHỎ, kết ở Đô nhé!',
          mode: 'question-answer',
          position: 'C',
          bars: 2,
        },
        // (2026-10-08, OWNER duyệt) HÁT TRƯỚC KHI ĐÀN — cuối bài: nghe 2–3 nốt, hát lại từng nốt, rồi đàn
        {
          kind: 'sing',
          title: 'Hát rồi đàn 🎤',
          intro: 'Nghe thầy đàn, hát lại từng nốt, rồi đàn trên đàn. Hát chưa trúng cũng không sao — hát giúp tai nhớ nốt!',
          rounds: [{ notes: ['E4', 'F4', 'G4'], fingers: [3, 4, 5] }, { notes: ['G4', 'F4', 'E4'], fingers: [5, 4, 3] }],
        },
      ],
    },
    {
      id: 'w6-l3',
      week: 6,
      title: 'Chuông ngân vang',
      emoji: '🔔',
      activities: [
        { kind: 'song', songId: 'jingle_bells', mode: 'wait', hints: 'full' },
        { kind: 'song', songId: 'jingle_bells', mode: 'tempo', level: 2, hints: 'names', pulseDrop: true },
      ],
    },
    {
      id: 'w6-l4',
      week: 6,
      title: 'Các thánh tiến bước',
      emoji: '🎺',
      activities: [
        { kind: 'song', songId: 'saints', mode: 'wait', hints: 'full', intro: 'Đầu mỗi câu có "Suỵt" — chờ một phách rồi đàn!' },
        { kind: 'song', songId: 'saints', mode: 'tempo', level: 3, hints: 'names' },
      ],
    },
  ],
};
