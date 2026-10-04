import type { WeekPlan } from './types';

/**
 * TUẦN 5 — Sân khấu nhỏ: "Ode to Joy" từng nốt → từng câu theo nhịp → cả bài;
 * đàn cùng bố mẹ (app đánh bè đệm). Thêm "Chuông ngân vang", "Các thánh tiến bước".
 * Tiêu chí: chơi trọn Ode to Joy ở 60 BPM (bố mẹ xác nhận, hoặc micro ≥ 80%).
 */
export const WEEK5: WeekPlan = {
  week: 5,
  island: 'Sân khấu nhỏ',
  islandEmoji: '🎪',
  title: 'Bài hát đầu tiên',
  story: 'Ở Sân khấu nhỏ, cả làng chờ nghe con đàn "Bài ca niềm vui". Bố mẹ sẽ đàn cùng con!',
  warmup: { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 8, reference: 'C4' },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố/mẹ câu đầu "Bài ca niềm vui": Mi Mi Fa Sol – Sol Fa Mi Rê.' },
  criterion: { text: 'Chơi trọn "Bài ca niềm vui" ở 60 BPM', who: 'PARENT/MIC' },
  lessons: [
    {
      id: 'w5-l1',
      week: 5,
      title: 'Bài ca niềm vui — từng nốt',
      emoji: '🎶',
      activities: [{ kind: 'song', songId: 'ode_to_joy_easy', mode: 'wait', hints: 'full', intro: 'Bài của nhạc sĩ Beethoven! Mình tập từng nốt trước.' }],
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
