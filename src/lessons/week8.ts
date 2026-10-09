import { echo, notes, rhNote, staffNote } from './targets';
import { RH_SOL_LA } from '../piano/fingering';
import type { WeekPlan } from './types';

/**
 * TUẦN 8 (tuần 7 cũ) — Thư viện Nốt: đọc nốt khóa Sol C4–G4 (+ nốt La).
 * v5 (OWNER duyệt 2026-10-05): đọc theo NỐT MỐC (Đô giữa, Sol khóa Sol, Đô cao) và theo QUÃNG (giống/bước/nhảy) —
 * không chỉ thuộc lòng "nốt ↔ phím". "Inh lả ơi" (nhịp 2/4) dời sang tuần 9, sau bài nhịp 2/4.
 * Ngón Sol–La (OWNER duyệt 2026-10-05): Sol–La = ngón 4-5 (tay nhích sang phải một phím, xem fingering.ts RH_SOL_LA);
 * tuần 1–7 Sol vẫn là ngón 5 ở thế Đô.
 * Gợi ý rút dần: khuông + tên + phím sáng → khuông + tên → chỉ khuông.
 * Tiêu chí: chơi bài tuần 6 chỉ nhìn khuông (phiếu 3 ý của bố mẹ, hoặc micro ≥ 80%) — v5: ở 2 NGÀY khác nhau.
 * (2026-10-08, OWNER duyệt) rút dần phím sáng: tuần đầu tiên có 'staff' (week4.ts "GỢI Ý RÚT DẦN");
 * "Kìa con bướm vàng" có dấu luyến; ứng tấu 1 phút Hỏi – Đáp "bước & nhảy" ở bài 1.
 */
export const WEEK8: WeekPlan = {
  week: 8,
  island: 'Thư viện Nốt',
  islandEmoji: '📚',
  title: 'Đọc nốt trên khuông',
  story: 'Trong Thư viện Nốt, mỗi nốt nhạc có một chỗ ngồi trên 5 sợi dây. Bạn Đô giữa ngồi dưới cùng và "đội mũ" vạch phụ!',
  warmup: { variant: 'read', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ trên khuông cho bố mẹ: Đô "đội mũ", Mi "trên vạch 1", Sol "trên vạch 2".' },
  drills: ['finger-tap', 'wrist-circle'],
  criterion: { text: 'Chơi "Bài ca niềm vui" chỉ nhìn khuông nhạc — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Chỉ nhìn khuông: Bài ca niềm vui — 2 hôm nhé! 📖',
  lessons: [
    {
      id: 'w8-l1',
      week: 8,
      title: 'Chỗ ngồi của nốt',
      emoji: '🎼',
      activities: [
        notes({
          id: 'w8-staff',
          step: 'Bài mới',
          title: 'Nốt ngồi ở đâu?',
          intro: 'Nốt lên trên khuông = sang phải trên đàn.',
          targets: [
            staffNote('C4', 'Đội mũ vạch phụ'),
            staffNote('D4', 'Ngồi dưới vạch 1'),
            staffNote('E4', 'Trên vạch 1'),
            staffNote('F4', 'Ở khe 1'),
            staffNote('G4', 'Trên vạch 2'),
          ],
        }),
        {
          kind: 'quiz',
          title: 'Nốt mốc 🧭',
          intro: 'Ba nốt MỐC: Đô giữa, Sol (vạch 2), Đô cao (khe 3).',
          quiz: { variant: 'landmark', pool: ['C4', 'G4', 'C5'], rounds: 6 },
        },
        // (2026-10-08, OWNER duyệt) ứng tấu 1 phút mỗi tuần — quãng của tuần: bước & nhảy
        {
          kind: 'improv',
          title: 'Hỏi – Đáp: bước & nhảy 💬',
          intro: 'App hỏi. Con đáp bằng bước và nhảy, kết ở Đô!',
          mode: 'question-answer',
          position: 'C',
          bars: 2,
        },
        // (2026-10-08, OWNER duyệt) HÁT TRƯỚC KHI ĐÀN — cuối bài: nghe 2–3 nốt, hát lại từng nốt, rồi đàn
        {
          kind: 'sing',
          title: 'Hát rồi đàn 🎤',
          intro: 'Nghe, hát lại, rồi đàn. Hát chưa trúng cũng không sao!',
          // (2026-10-09 rà soát) không dùng La trước thẻ dạy nốt La (bài 3) — lượt 1 là bước & nhảy Mi–Sol–Mi
          rounds: [{ notes: ['E4', 'G4', 'E4'], fingers: [3, 5, 3] }, { notes: ['C4', 'E4', 'G4'], fingers: [1, 3, 5] }],
        },
      ],
    },
    {
      id: 'w8-l2',
      week: 8,
      title: 'Đàn nhìn khuông',
      emoji: '👀',
      activities: [
        { kind: 'quiz', title: 'Đọc nốt 📖', intro: 'Chạm đúng phím. Khó thì tìm nốt mốc rồi đếm!', quiz: { variant: 'read', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6 } },
        { kind: 'song', songId: 'ode_to_joy_easy', mode: 'wait', hints: 'names', intro: 'Lần này phím không sáng nữa — nhìn tên nốt trên khuông nhé.' },
        { kind: 'song', songId: 'ode_to_joy_easy', mode: 'tempo', level: 2, hints: 'staff', intro: 'Thử thách: chỉ nhìn khuông nhạc mà đàn!', pulseDrop: true },
      ],
    },
    {
      id: 'w8-l3',
      week: 8,
      title: 'Nốt La: Sol–La ngón 4-5',
      emoji: '🤸',
      activities: [
        notes({
          id: 'w8-a4',
          step: 'Bài mới',
          title: 'Nốt La',
          intro: 'Nốt mới La. Sol–La đi cùng nhau: ngón 4 – 5!',
          targets: [
            rhNote('G4', 'Thế Đô: Sol vẫn là ngón 5'),
            rhNote('A4', 'La — ngón 5'),
            { ...echo(['G4', 'A4', 'G4']), subtitle: 'Tay nhích sang phải: ngón 4 – 5 – 4', fingers: ['G4', 'A4', 'G4'].map((p) => RH_SOL_LA[p]) },
            { ...echo(['G4', 'A4', 'G4', 'F4']), subtitle: 'Ngón 4 – 5 – 4 – 3', fingers: ['G4', 'A4', 'G4', 'F4'].map((p) => RH_SOL_LA[p]) },
            staffNote('A4', 'Ở khe 2'),
            // (2026-10-09 rà soát) câu cuối "Kìa con bướm vàng" có Sol TRẦM (dưới Đô giữa) — tập trước khi gặp trong bài
            { ...echo(['C4', 'G3', 'C4']), subtitle: 'Sol trầm: ngón 1 với xuống, ngón 2 ở Đô', fingers: [2, 1, 2] },
          ],
        }),
        { kind: 'song', songId: 'frere_jacques_easy', mode: 'wait', hints: 'full', intro: 'Lần đầu TO, nhắc lại NHỎ. Câu có La: tay nhích phải!' },
      ],
    },
    {
      id: 'w8-l4',
      week: 8,
      title: 'Cầu London & Ngôi sao',
      emoji: '⭐',
      activities: [
        {
          kind: 'quiz',
          title: 'Giống, bước hay nhảy? 🐸',
          intro: 'Hai nốt: GIỐNG, BƯỚC hay NHẢY? Lên hay xuống?',
          quiz: { variant: 'interval', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6, maxInterval: 3 },
        },
        { kind: 'song', songId: 'london_bridge', mode: 'wait', hints: 'names', intro: 'Tay nhích sang phải: Sol ngón 4, La ngón 5!' },
        { kind: 'song', songId: 'twinkle_easy', mode: 'wait', hints: 'names', intro: 'Đô 1, Sol 4, La 5 — xòe tay rộng một chút!' },
        { kind: 'song', songId: 'twinkle_easy', mode: 'tempo', level: 3, hints: 'names' },
      ],
    },
  ],
};
