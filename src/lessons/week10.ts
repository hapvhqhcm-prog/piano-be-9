import { noteLabel } from '../piano/pitchTable';
import { echo, notes } from './targets';
import type { Target, WeekPlan } from './types';

/** Nốt Si (B4) ở bàn tay "Gà gáy" (Rê 1, Mi 2, Sol 3, La 4, Si 5) — ngón ghi rõ, không theo thế Đô. */
const si = (subtitle: string, staff = false): Target => ({
  noteId: 'B4', title: noteLabel('B4'), subtitle, keys: ['B4'], finger: 5, hand: 'RH', sample: ['B4'], ...(staff ? { staff: true } : {}),
});

/**
 * TUẦN 10 (tuần 8 cũ — v5: cuối Cấp 1 sau 10 tuần) — Lâu đài Âm nhạc: thêm 3 bài mới, rồi bé TỰ CHỌN chương trình 2–3 bài và biểu diễn.
 * (2026-10-08, OWNER duyệt) bài 2 cũ có 3 bài mới → tách: "Gà gáy" sang bài 3 mới (w10-l3), mở đầu bằng thẻ dạy nốt Si.
 * Tiêu chí: phụ huynh tặng huy chương. "Xòe hoa" đã dời sang tuần 9 (sau bài nhịp 2/4) — vẫn chọn được khi biểu diễn.
 * (2026-10-08, OWNER duyệt sau rà soát chuyên gia) bài mới "w10-g": XEM TRƯỚC THẾ SOL bằng bài quen "Bánh nóng"
 * (Sol La Si = ngón 1 2 3 — ngay sau thẻ nốt Si), 4 tuần trước tuần 14 "Thế Sol"; kèm ứng tấu 1 phút trên phím đen.
 */
export const WEEK10: WeekPlan = {
  week: 10,
  island: 'Lâu đài Âm nhạc',
  islandEmoji: '🏰',
  title: 'Biểu diễn',
  story: 'Con đã tới Lâu đài Âm nhạc! Hôm nay con là nghệ sĩ — cả nhà là khán giả.',
  warmup: { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'], rounds: 6, reference: 'C4' },
  teach: { emoji: '🎤', text: 'Con giới thiệu với khán giả: "Bài tiếp theo tên là…, của nhạc sĩ…".' },
  drills: ['five-finger', 'hand-shape'],
  criterion: { text: 'Biểu diễn trọn vẹn — bố mẹ tặng huy chương', who: 'PARENT' },
  kidGoal: 'Biểu diễn cho cả nhà nghe — nhận huy chương Cấp 1! 🏅',
  lessons: [
    {
      id: 'w10-l1',
      week: 10,
      title: 'Ông lão vui tính',
      emoji: '👴',
      activities: [
        { kind: 'song', songId: 'this_old_man', mode: 'wait', hints: 'names', intro: 'Tay nhích phải: Sol ngón 4! Giữa bài về thế Đô.' },
        { kind: 'song', songId: 'this_old_man', mode: 'tempo', level: 3, hints: 'names' },
        // (2026-10-08, OWNER duyệt) HÁT TRƯỚC KHI ĐÀN — cuối bài: nghe 2–3 nốt, hát lại từng nốt, rồi đàn
        {
          kind: 'sing',
          title: 'Hát rồi đàn 🎤',
          intro: 'Nghe, hát lại, rồi đàn. Hát chưa trúng cũng không sao!',
          // ngón như "Ông lão vui tính" (tay nhích phải: Mi 2, Sol 4)
          rounds: [{ notes: ['G4', 'E4', 'G4'], fingers: [4, 2, 4] }, { notes: ['C4', 'D4', 'E4'], fingers: [1, 2, 3] }],
        },
      ],
    },
    {
      id: 'w10-l2',
      week: 10,
      title: 'Trang trại & Susanna',
      emoji: '🐮',
      activities: [
        { kind: 'song', songId: 'old_macdonald', mode: 'wait', hints: 'names', intro: 'Bài này bắt đầu ở Fa — ngón 4 nhé!' },
        { kind: 'song', songId: 'oh_susanna', mode: 'wait', hints: 'names', intro: 'Như "Ngôi sao nhỏ": Đô 1, Sol 4, La 5!' },
      ],
    },
    {
      id: 'w10-l3',
      week: 10,
      title: 'Nốt Si & Gà gáy',
      emoji: '🐓',
      activities: [
        notes({
          id: 'w10-si',
          step: 'Bài mới',
          title: 'Nốt Si',
          intro: 'Nốt mới Si — ngay bên phải La, ngón 5!',
          targets: [
            si('Si — ngón 5'),
            { ...echo(['A4', 'B4', 'A4']), subtitle: 'Ngón 4 – 5 – 4', fingers: [4, 5, 4] },
            { ...echo(['G4', 'A4', 'B4']), subtitle: 'Ngón 3 – 4 – 5', fingers: [3, 4, 5] },
            si('Trên vạch 3 — vạch giữa khuông', true),
          ],
        }),
        // (2026-10-06) Dân ca Cống — bàn tay ngũ cung như "Xòe hoa", nhích lên: thêm một bài Việt Nam cho buổi biểu diễn
        { kind: 'song', songId: 'ga_gay', mode: 'wait', hints: 'full', intro: 'Tay: Rê 1 … Si 5. Đàn TO như gà gáy sáng!' },
      ],
    },
    {
      // (2026-10-08, OWNER duyệt) xem trước thế Sol (tuần 14) bằng bài quen
      id: 'w10-g',
      week: 10,
      title: 'Bánh nóng — thế Sol',
      emoji: '⛰️',
      activities: [
        { kind: 'song', songId: 'hot_cross_buns_g', mode: 'wait', hints: 'full', intro: 'Ngón cái dời lên Sol: Sol 1, La 2, Si 3!' },
        { kind: 'song', songId: 'hot_cross_buns_g', mode: 'tempo', level: 2, hints: 'names', intro: 'Bài quen ở chỗ mới — theo nhịp nhé!' },
        // ứng tấu 1 phút mỗi tuần (2026-10-08)
        {
          kind: 'improv',
          title: 'Mở màn trên phím đen 🎨',
          intro: 'App đàn nền. Con chào khán giả trên phím đen!',
          mode: 'black-keys',
        },
      ],
    },
    {
      id: 'w10-stage',
      week: 10,
      title: 'Buổi biểu diễn',
      emoji: '🏅',
      isWeekTest: true,
      activities: [{ kind: 'stage' }],
    },
  ],
};
