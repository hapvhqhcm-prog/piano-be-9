import type { WeekPlan } from './types';

/**
 * TUẦN 4 — Rừng Nhịp (§11 giữ 3 mức + ngôn ngữ nhịp v2):
 * Mức 1 vỗ tay theo metronome 60 · Mức 2 đánh theo nhịp, nốt đứng yên con trỏ nhảy ·
 * Mức 3 băng chuyền nốt chạy (sau khi Mức 2 ổn).
 * Tiêu chí: giữ nhịp đều 8 ô nhịp ở Mức 2 (bố mẹ xác nhận bằng phiếu 3 ý, hoặc micro ≥ 80%) — v5: ở 2 NGÀY khác nhau.
 * v5: đây là tuần dạy móc đơn "Chạy-chạy" (nửa phách) — mọi bài có móc đơn chơi THEO NHỊP chỉ từ tuần này.
 *
 * GỢI Ý RÚT DẦN — phím sáng (OWNER duyệt 2026-10-08, rà soát chuyên gia; tests/curriculum-2026-10-08.test.ts):
 *  · tuần 1–3: 'full' (phím sáng + tên + khuông) ở mọi lượt.
 *  · tuần 4–7: lần ĐẦU gặp bài (chế độ chờ) vẫn 'full'; mọi lượt THEO NHỊP của bài đã gặp → 'names' (tên nốt, phím KHÔNG sáng).
 *    (Bài tập ex_* tuần 4 chỉ có lượt theo nhịp, lần đầu gặp → giữ 'full'.)
 *  · tuần 8–10: bắt đầu 'staff' (chỉ khuông) — lượt theo nhịp của bài QUEN (đã tập ở bài/tuần trước, cùng thế tay):
 *    tuần 8 Bài ca niềm vui (tiêu chí), tuần 9 Trống trường; tuần 10 (biểu diễn, bài mới có dời tay) giữ 'names'.
 *  · tuần 11–15: chờ 'full' chỉ khi có cái MỚI (thế tay mới, khóa Fa, hai tay cùng lúc); theo nhịp 'names';
 *    tuần 15 bài thế Đô quen tay: chờ 'names', theo nhịp 'staff'. Từ tuần 16: mặc định 'names', băng chuyền 'staff' (level2/3.ts).
 *  · tuần 4 có tiến độ đã lưu: chỉ ĐỔI hints của hoạt động cũ (mã "<bài>#<i>" giữ nguyên) và THÊM bước vào CUỐI bài.
 */
export const WEEK4: WeekPlan = {
  week: 4,
  island: 'Rừng Nhịp',
  islandEmoji: '🌳',
  title: 'Nhịp — 3 mức',
  story: 'Trong Rừng Nhịp, mọi con vật đều đi theo tiếng "tích – tích" của bác Gõ Kiến. Đi đều thì không ai lạc!',
  warmup: { variant: 'stepskip', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con vỗ một mẫu nhịp "Đi – Chạy-chạy – Đi-i" rồi bắt bố mẹ vỗ lại.' },
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
          intro: 'Đọc to rồi vỗ: Đi · Chạy-chạy · Đi-i · Đi-i-i-i · Suỵt!',
          patterns: [
            ['walk', 'walk', 'walk', 'walk'],
            ['walk', 'walk', 'long'],
            ['long4'],
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
        { kind: 'song', songId: 'ex_c_quarter', mode: 'tempo', level: 2, hints: 'full', intro: 'Mỗi tiếng "tích" đánh một nốt — theo con trỏ nhé!' },
        { kind: 'song', songId: 'ex_cde_walk', mode: 'tempo', level: 2, hints: 'full', intro: 'Nốt tròn "Đi-i-i-i": giữ phím đủ 4 tiếng "tích"!' },
      ],
    },
    {
      id: 'w4-l3',
      week: 4,
      title: 'Bánh nóng theo nhịp',
      emoji: '🥐',
      activities: [
        { kind: 'song', songId: 'hot_cross_buns', mode: 'tempo', level: 2, hints: 'names', intro: 'Bài quen! Đàn theo nhịp — nhìn tên nốt, phím không sáng.' },
        // (2026-10-08, OWNER duyệt) luyện "Chạy-chạy" theo nhịp bằng bài 8 ô. THÊM VÀO CUỐI bài (không chèn giữa):
        // mã đã lưu "w4-l3#0" vẫn trỏ đúng Bánh nóng; bài đã xong vẫn xong (lessonsCompleted giữ "w4-l3").
        { kind: 'song', songId: 'choo_choo_train', mode: 'wait', hints: 'full', intro: 'Tàu chạy "Chạy-chạy-chạy-chạy" — đọc to trước khi đàn nhé!' },
        { kind: 'song', songId: 'choo_choo_train', mode: 'tempo', level: 2, hints: 'names', intro: 'Tàu chạy theo nhịp — nhìn tên nốt nhé!' },
      ],
    },
    {
      id: 'w4-l4',
      week: 4,
      title: 'Mức 3: Băng chuyền',
      emoji: '🎢',
      activities: [
        { kind: 'song', songId: 'go_tell_aunt_rhody', mode: 'wait', hints: 'full' },
        { kind: 'song', songId: 'go_tell_aunt_rhody', mode: 'tempo', level: 3, hints: 'names', intro: 'Nốt chạy về vạch đỏ — tới vạch thì đánh!' },
        { kind: 'song', songId: 'lightly_row', mode: 'wait', hints: 'full' },
        // (2026-10-08, OWNER duyệt) ứng tấu 1 phút mỗi tuần — THÊM VÀO CUỐI bài (mã "w4-l4#0..2" giữ nguyên nghĩa)
        {
          kind: 'improv',
          title: 'Nhịp trên phím đen 🎨',
          intro: 'App đàn nền. Con đàn phím đen: Đi, Đi, Chạy-chạy!',
          mode: 'black-keys',
        },
      ],
    },
  ],
};
