import type { WeekPlan } from './types';

/**
 * TUẦN 9 — Bến Đò Nhịp Hai (v5, tuần mới — OWNER duyệt 2026-10-05): NHỊP 2/4 trước bài 2/4 đầu tiên.
 * Chuyên gia sư phạm: bài dân ca 2/4 ("Inh lả ơi", "Xòe hoa") trước đây vào học khi bé chưa biết nhịp 2.
 * Mẫu nhịp 2 phách: "MỘT-hai" (phách 1 mạnh). Hai bài tự sáng tác 2/4 + hai bài dân ca (cùng kỹ năng: thế Đô, La duỗi).
 * Đọc nhạc: nốt mốc & quãng (giống/bước/nhảy) làm khởi động. Cuối Cấp 1: trò sáng tạo "Hỏi – Đáp".
 * Tiêu chí: chơi trọn "Inh lả ơi" theo nhịp — đạt ở 2 ngày khác nhau.
 */
export const WEEK9: WeekPlan = {
  week: 9,
  island: 'Bến Đò Nhịp Hai',
  islandEmoji: '⛴️',
  title: 'Nhịp 2/4',
  story: 'Ở Bến Đò, bác lái đò khua mái chèo "MỘT-hai, MỘT-hai". Mỗi ô nhịp chỉ có HAI phách — phách MỘT mạnh, phách hai nhẹ.',
  warmup: { variant: 'interval', pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'], rounds: 6, maxInterval: 3 },
  teach: { emoji: '👨‍🏫', text: 'Con vỗ tay cho bố mẹ nhịp 2: MẠNH-nhẹ, MẠNH-nhẹ — rồi bắt bố mẹ vỗ lại.' },
  drills: ['arm-drop', 'five-finger'],
  criterion: { text: 'Chơi trọn "Inh lả ơi" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Inh lả ơi "MỘT-hai" thật đều — 2 hôm nhé! 💃',
  lessons: [
    {
      id: 'w9-l1',
      week: 9,
      title: 'MỘT-hai, MỘT-hai',
      emoji: '🛶',
      activities: [
        {
          kind: 'rhythm',
          title: 'Nhịp 2',
          intro: 'Mỗi ô nhịp chỉ có 2 phách: "MỘT-hai". Số 2/4 ở đầu bài nghĩa là: 2 phách mỗi ô, mỗi phách là một nốt đen. Vỗ MẠNH ở phách MỘT!',
          patterns: [
            ['walk', 'walk'],
            ['long'],
            ['run', 'walk'],
            ['walk', 'run'],
            ['run', 'run'],
            ['walk', 'rest'],
          ],
        },
        { kind: 'song', songId: 'school_drum', mode: 'wait', hints: 'full', intro: 'Trống trường "TÙNG-tùng": mỗi ô nhịp 2 phách. Ô có nốt trắng = giữ cả ô!' },
      ],
    },
    {
      id: 'w9-l2',
      week: 9,
      title: 'Trống trường & Inh lả ơi',
      emoji: '🥁',
      activities: [
        { kind: 'song', songId: 'school_drum', mode: 'tempo', level: 2, hints: 'names' },
        // Dân ca Việt Nam (OWNER yêu cầu 2026-10-05): chỉ Rê Mi Sol La — tay ở "thế nhích lên", Sol–La = 4-5. v5: dời từ tuần 7 cũ (sau bài nhịp 2/4)
        { kind: 'song', songId: 'inh_la_oi', mode: 'wait', hints: 'full', intro: 'Tay nhích sang phải: ngón 1 ở Rê! Sol – La là ngón 4 – 5. Dân ca Thái Tây Bắc, nhịp 2/4 — câu cuối đàn NHỎ (p) như tiếng vọng núi rừng.' },
      ],
    },
    {
      id: 'w9-l3',
      week: 9,
      title: 'Đò qua sông',
      emoji: '⛴️',
      activities: [
        { kind: 'song', songId: 'inh_la_oi', mode: 'tempo', level: 2, hints: 'names' },
        { kind: 'song', songId: 'ferry_song', mode: 'wait', hints: 'full', intro: 'Sol – La đi cùng nhau: ngón 4 – 5! Con đò lắc lư "MỘT-hai" — nhìn số ngón để biết lúc tay nhích sang phải.' },
      ],
    },
    {
      id: 'w9-l4',
      week: 9,
      title: 'Xòe hoa & Hỏi – Đáp',
      emoji: '💃',
      activities: [
        // Dân ca Việt Nam (OWNER yêu cầu 2026-10-05) — v5: dời từ tuần 8 cũ (sau bài nhịp 2/4)
        { kind: 'song', songId: 'xoe_hoa', mode: 'wait', hints: 'full', intro: 'Tay ngũ cung: Đô 1, Rê 2, Fa 3, Sol 4, La 5! Mỗi ngón một phím. Điệu múa xòe của người Thái, nhịp 2/4 — bài bắt đầu bằng một nốt Đô lấy đà.' },
        {
          kind: 'improv',
          title: 'Hỏi – Đáp 💬',
          intro: 'App đàn một câu HỎI (2 ô nhịp). Con đàn câu TRẢ LỜI cũng 2 ô, bằng các nốt thế Đô — và kết thúc ở nhà Đô cho câu trả lời "chắc chắn"!',
          mode: 'question-answer',
          position: 'C',
          bars: 2,
        },
      ],
    },
  ],
};
