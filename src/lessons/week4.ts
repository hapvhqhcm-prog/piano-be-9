import type { WeekPlan } from './types';

/**
 * TUẦN 4 — Rừng Nhịp (§11 giữ 3 mức + ngôn ngữ nhịp v2):
 * Mức 1 vỗ tay theo metronome 60 · Mức 2 đánh theo nhịp, nốt đứng yên con trỏ nhảy ·
 * Mức 3 băng chuyền nốt chạy (sau khi Mức 2 ổn).
 * Tiêu chí: giữ nhịp đều 8 ô nhịp ở Mức 2 (bố mẹ xác nhận bằng phiếu 3 ý, hoặc micro ≥ 80%) — v5: ở 2 NGÀY khác nhau.
 * v5: đây là tuần dạy móc đơn "Chạy-chạy" (nửa phách) — mọi bài có móc đơn chơi THEO NHỊP chỉ từ tuần này.
 */
export const WEEK4: WeekPlan = {
  week: 4,
  island: 'Rừng Nhịp',
  islandEmoji: '🌳',
  title: 'Nhịp — 3 mức',
  story: 'Trong Rừng Nhịp, mọi con vật đều đi theo tiếng "tích – tích" của bác Gõ Kiến. Đi đều thì không ai lạc!',
  warmup: { variant: 'stepskip', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con vỗ một mẫu nhịp "Đi – Chạy-chạy – Đi-i" rồi bắt bố/mẹ vỗ lại.' },
  drills: ['finger-tap', 'arm-drop'],
  criterion: { text: 'Giữ nhịp đều 8 ô nhịp ở Mức 2 — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Đàn đều như đồng hồ tích-tắc 8 ô nhịp — 2 hôm nhé! ⏰',
  lessons: [
    {
      id: 'w4-l1',
      week: 4,
      title: 'Mức 1: Vỗ tay theo nhịp',
      emoji: '👏',
      activities: [
        {
          kind: 'rhythm',
          title: 'Ngôn ngữ nhịp',
          intro: '"Đi" = 1 phách · "Chạy-chạy" = 2 nốt nhanh trong 1 phách · "Đi-i" = 2 phách · "Suỵt" = nghỉ 1 phách.',
          patterns: [
            ['walk', 'walk', 'walk', 'walk'],
            ['walk', 'walk', 'long'],
            ['run', 'run', 'walk', 'walk'],
            ['walk', 'rest', 'walk', 'rest'],
            ['run', 'walk', 'run', 'walk'],
            ['long', 'run', 'walk'],
          ],
        },
      ],
    },
    {
      id: 'w4-l2',
      week: 4,
      title: 'Mức 2: Mỗi phách một nốt',
      emoji: '🥁',
      activities: [
        { kind: 'song', songId: 'ex_c_quarter', mode: 'tempo', level: 2, hints: 'full', intro: 'Đánh một nốt đúng mỗi tiếng "tích" — mỗi ô nhịp 4 lần cùng một nốt: Đô, Rê, Mi… Con trỏ nhảy tới đâu, con đánh tới đó!' },
        { kind: 'song', songId: 'ex_cde_walk', mode: 'tempo', level: 2, hints: 'full' },
      ],
    },
    {
      id: 'w4-l3',
      week: 4,
      title: 'Bánh nóng theo nhịp',
      emoji: '🥐',
      activities: [{ kind: 'song', songId: 'hot_cross_buns', mode: 'tempo', level: 2, hints: 'full', intro: 'Bài con đã thuộc — giờ đàn theo nhịp nhé!' }],
    },
    {
      id: 'w4-l4',
      week: 4,
      title: 'Mức 3: Băng chuyền',
      emoji: '🎢',
      activities: [
        { kind: 'song', songId: 'go_tell_aunt_rhody', mode: 'wait', hints: 'full' },
        { kind: 'song', songId: 'go_tell_aunt_rhody', mode: 'tempo', level: 3, hints: 'full', intro: 'Nốt chạy về vạch đỏ — tới vạch thì đánh!' },
        { kind: 'song', songId: 'lightly_row', mode: 'wait', hints: 'full' },
      ],
    },
  ],
};
