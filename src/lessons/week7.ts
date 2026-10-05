import { echo, notes, rhNote, staffNote } from './targets';
import { RH_SOL_LA } from '../piano/fingering';
import type { WeekPlan } from './types';

/**
 * TUẦN 7 — Thư viện Nốt: đọc nốt khóa Sol C4–G4 (+ nốt La).
 * Ngón Sol–La (OWNER duyệt 2026-10-05): Sol–La = ngón 4-5 (tay nhích sang phải một phím, xem fingering.ts RH_SOL_LA);
 * tuần 1–6 Sol vẫn là ngón 5 ở thế Đô.
 * Gợi ý rút dần: khuông + tên + phím sáng → khuông + tên → chỉ khuông.
 * Tiêu chí: chơi bài tuần 5 chỉ nhìn khuông (bố mẹ xác nhận, hoặc micro ≥ 80%).
 */
export const WEEK7: WeekPlan = {
  week: 7,
  island: 'Thư viện Nốt',
  islandEmoji: '📚',
  title: 'Đọc nốt trên khuông',
  story: 'Trong Thư viện Nốt, mỗi nốt nhạc có một chỗ ngồi trên 5 sợi dây. Bạn Đô giữa ngồi dưới cùng và "đội mũ" vạch phụ!',
  warmup: { variant: 'read', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 8 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ trên khuông cho bố/mẹ: Đô "đội mũ", Mi "trên vạch 1", Sol "trên vạch 2".' },
  criterion: { text: 'Chơi "Bài ca niềm vui" chỉ nhìn khuông nhạc', who: 'PARENT/MIC' },
  lessons: [
    {
      id: 'w7-l1',
      week: 7,
      title: 'Chỗ ngồi của nốt',
      emoji: '🎼',
      activities: [
        notes({
          id: 'w7-staff',
          step: 'Bài mới',
          title: 'Nốt ngồi ở đâu?',
          intro: 'Nốt đi lên trên khuông = đi sang phải trên đàn. Nốt đi xuống = sang trái.',
          targets: [
            staffNote('C4', 'Đội mũ vạch phụ'),
            staffNote('D4', 'Ngồi dưới vạch 1'),
            staffNote('E4', 'Trên vạch 1'),
            staffNote('F4', 'Ở khe 1'),
            staffNote('G4', 'Trên vạch 2'),
          ],
        }),
        { kind: 'quiz', title: 'Đọc nốt 📖', intro: 'Nốt hiện trên khuông — con chạm đúng phím trên iPad.', quiz: { variant: 'read', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 10 } },
      ],
    },
    {
      id: 'w7-l2',
      week: 7,
      title: 'Đàn nhìn khuông',
      emoji: '👀',
      activities: [
        { kind: 'song', songId: 'ode_to_joy_easy', mode: 'wait', hints: 'names', intro: 'Lần này phím không sáng nữa — nhìn tên nốt trên khuông nhé.' },
        { kind: 'song', songId: 'ode_to_joy_easy', mode: 'tempo', level: 2, hints: 'staff', intro: 'Thử thách: chỉ nhìn khuông nhạc! (Bấm "Gợi ý" nếu cần.)' },
      ],
    },
    {
      id: 'w7-l3',
      week: 7,
      title: 'Nốt La: Sol–La ngón 4-5',
      emoji: '🤸',
      activities: [
        notes({
          id: 'w7-a4',
          step: 'Bài mới',
          title: 'Nốt La',
          intro: 'Nốt mới La ở ngay bên phải Sol. Khi Sol và La đi cùng nhau, bàn tay NHÍCH sang phải một phím: ngón 4 đánh Sol, ngón 5 đánh La (Sol–La–Sol = 4-5-4). Nhìn số ngón trên nốt nhé!',
          targets: [
            rhNote('G4', 'Thế Đô: Sol vẫn là ngón 5'),
            rhNote('A4', 'La — ngón 5'),
            { ...echo(['G4', 'A4', 'G4']), subtitle: 'Tay nhích sang phải: ngón 4-5-4', fingers: ['G4', 'A4', 'G4'].map((p) => RH_SOL_LA[p]) },
            { ...echo(['G4', 'A4', 'G4', 'F4']), subtitle: 'Ngón 4-5-4-3', fingers: ['G4', 'A4', 'G4', 'F4'].map((p) => RH_SOL_LA[p]) },
            staffNote('A4', 'Ở khe 2'),
          ],
        }),
        { kind: 'song', songId: 'frere_jacques_easy', mode: 'wait', hints: 'full', intro: 'Mỗi câu hát hai lần: lần đầu TO (f), lần sau NHỎ (p) như tiếng vọng.' },
        // Dân ca Việt Nam (OWNER yêu cầu 2026-10-05): chỉ Rê Mi Sol La — tay ở "thế nhích lên", Sol–La = 4-5
        { kind: 'song', songId: 'inh_la_oi', mode: 'wait', hints: 'full', intro: 'Dân ca Thái Tây Bắc! Bàn tay nhích sang phải: ngón 1 ở Rê, Sol–La là ngón 4-5. Câu cuối đàn NHỎ (p) như tiếng vọng núi rừng.' },
      ],
    },
    {
      id: 'w7-l4',
      week: 7,
      title: 'Cầu London & Ngôi sao',
      emoji: '⭐',
      activities: [
        { kind: 'song', songId: 'london_bridge', mode: 'wait', hints: 'names' },
        { kind: 'song', songId: 'twinkle_easy', mode: 'wait', hints: 'names' },
        { kind: 'song', songId: 'twinkle_easy', mode: 'tempo', level: 3, hints: 'names' },
      ],
    },
  ],
};
