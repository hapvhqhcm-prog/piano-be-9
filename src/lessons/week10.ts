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
        { kind: 'song', songId: 'this_old_man', mode: 'wait', hints: 'names', intro: 'Tay nhích sang phải: Sol ngón 4, Mi ngón 2! Giữa bài tay về thế Đô.' },
        { kind: 'song', songId: 'this_old_man', mode: 'tempo', level: 3, hints: 'names' },
      ],
    },
    {
      id: 'w10-l2',
      week: 10,
      title: 'Trang trại & Susanna',
      emoji: '🐮',
      activities: [
        { kind: 'song', songId: 'old_macdonald', mode: 'wait', hints: 'names', intro: 'Bài này bắt đầu ở Fa — ngón 4 nhé!' },
        { kind: 'song', songId: 'oh_susanna', mode: 'wait', hints: 'names', intro: 'Đô ngón 1, Sol ngón 4, La ngón 5 — như "Ngôi sao nhỏ"!' },
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
          intro: 'Nốt mới Si ở ngay bên phải La. Đặt tay: Rê 1, Mi 2, Sol 3, La 4, Si 5 — mỗi ngón một phím.',
          targets: [
            si('Si — ngón 5'),
            { ...echo(['A4', 'B4', 'A4']), subtitle: 'Ngón 4 – 5 – 4', fingers: [4, 5, 4] },
            { ...echo(['G4', 'A4', 'B4']), subtitle: 'Ngón 3 – 4 – 5', fingers: [3, 4, 5] },
            si('Trên vạch 3 — vạch giữa khuông', true),
          ],
        }),
        // (2026-10-06) Dân ca Cống — bàn tay ngũ cung như "Xòe hoa", nhích lên: thêm một bài Việt Nam cho buổi biểu diễn
        { kind: 'song', songId: 'ga_gay', mode: 'wait', hints: 'full', intro: 'Tay: Rê 1, Mi 2, Sol 3, La 4, Si 5! Gà gáy — dân ca Cống (Lai Châu), nhịp 2/4: đàn TO như tiếng gà gáy sáng!' },
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
