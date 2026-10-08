import { echo, notes } from './targets';
import type { WeekPlan } from './types';

/**
 * TUẦN 5 — Đồi Năm Ngón (v5, tuần CỦNG CỐ mới — OWNER duyệt 2026-10-05):
 * chuyên gia sư phạm: tốc độ cũ quá nhanh → thêm một tuần ở CÙNG kỹ năng (thế Đô, nốt đen/trắng/móc đơn, lặng)
 * với 3 bài tự sáng tác mới + một bài quen, trò Nhại lại 3 nốt và ứng tấu phím đen. Chưa có sắc thái p/f (tuần 6 mới dạy).
 * Tiêu chí: chơi trọn "Ếch con nhảy" theo nhịp — đạt ở 2 ngày khác nhau (micro hoặc phiếu 3 ý của bố mẹ).
 * (2026-10-08, OWNER duyệt) LIỀN dạy sớm: trò "Đàn liền" (chỉ LIỀN — NGẮT vẫn để tuần 12) mở đầu bài 3;
 * từ tuần 6 bài hát có dấu luyến. Lượt theo nhịp của bài đã gặp: chỉ tên nốt (xem "GỢI Ý RÚT DẦN" ở week4.ts).
 */
export const WEEK5: WeekPlan = {
  week: 5,
  island: 'Đồi Năm Ngón',
  islandEmoji: '🌻',
  title: 'Củng cố thế Đô',
  story: 'Trên Đồi Năm Ngón có ếch con, giọt mưa và chiếc thuyền giấy. Năm ngón tay của con sẽ kể chuyện về các bạn ấy!',
  warmup: { variant: 'stepskip', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố mẹ "Ếch con nhảy": Đô – Mi – Sol là ngón 1 – 3 – 5, nhảy qua một phím!' },
  drills: ['five-finger', 'wrist-circle'],
  criterion: { text: 'Chơi trọn "Ếch con nhảy" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Đàn Ếch con nhảy thật đều — 2 hôm nhé! 🐸',
  lessons: [
    {
      id: 'w5-l1',
      week: 5,
      title: 'Ếch con nhảy',
      emoji: '🐸',
      activities: [
        { kind: 'song', songId: 'frog_hop', mode: 'wait', hints: 'full', intro: 'Ếch nhảy Đô – Mi – Sol: ngón 1 – 3 – 5!' },
        { kind: 'song', songId: 'frog_hop', mode: 'tempo', level: 2, hints: 'names' },
      ],
    },
    {
      id: 'w5-l2',
      week: 5,
      title: 'Mưa rơi tí tách',
      emoji: '🌧️',
      activities: [
        { kind: 'song', songId: 'raindrops', mode: 'wait', hints: 'full', intro: 'Mưa rơi "Chạy-chạy" — đọc to trước khi đàn nhé!' },
        { kind: 'song', songId: 'raindrops', mode: 'tempo', level: 2, hints: 'names' },
      ],
    },
    {
      id: 'w5-l3',
      week: 5,
      title: 'Đàn liền & thuyền giấy',
      emoji: '⛵',
      activities: [
        // (2026-10-08, OWNER duyệt) LIỀN sớm (legato): chỉ các lượt LIỀN — thẻ "Ngắt" chỉ hiện từ tuần 12
        {
          kind: 'dynamics',
          title: 'Đàn liền 🐢🌊',
          intro: 'Giữ phím tới khi nốt sau vang — liền như dòng nước!',
          mode: 'stac-leg',
          rounds: [
            { pitches: ['C4', 'D4'], want: 'leg', fingers: [1, 2], hand: 'RH' },
            { pitches: ['C4', 'D4', 'E4'], want: 'leg', fingers: [1, 2, 3], hand: 'RH' },
            { pitches: ['E4', 'D4', 'C4'], want: 'leg', fingers: [3, 2, 1], hand: 'RH' },
            { pitches: ['C4', 'D4', 'E4', 'F4', 'G4'], want: 'leg', fingers: [1, 2, 3, 4, 5], hand: 'RH' },
            { pitches: ['G4', 'F4', 'E4', 'D4', 'C4'], want: 'leg', fingers: [5, 4, 3, 2, 1], hand: 'RH' },
          ],
        },
        { kind: 'song', songId: 'paper_boat', mode: 'wait', hints: 'full', intro: 'Thuyền trôi êm: đàn LIỀN, giữ đủ "Đi-i" và "Suỵt".' },
        {
          kind: 'improv',
          title: 'Mưa trên phím đen 🎨',
          intro: 'App đàn nền. Con làm mưa trên phím đen!',
          mode: 'black-keys',
        },
      ],
    },
    {
      id: 'w5-l4',
      week: 5,
      title: 'Ôn tập: nhại lại & chèo thuyền',
      emoji: '🦜',
      activities: [
        notes({
          id: 'w5-echo',
          step: 'Nhại lại',
          title: 'Con vẹt nhại 3 nốt 🦜',
          intro: 'Nghe kỹ rồi đàn lại đúng thứ tự!',
          targets: [echo(['C4', 'E4', 'G4']), echo(['G4', 'F4', 'E4']), echo(['D4', 'F4', 'E4']), echo(['E4', 'C4', 'D4'])],
        }),
        // (2026-10-08, OWNER duyệt) một lượt Mức 2 trước Mức 3 — tuần 5 chưa có tiến độ nên chèn giữa an toàn
        { kind: 'song', songId: 'lightly_row', mode: 'tempo', level: 2, hints: 'names', intro: 'Bài quen tuần trước — đàn theo nhịp trước nhé!' },
        { kind: 'song', songId: 'lightly_row', mode: 'tempo', level: 3, hints: 'names', intro: 'Giờ thử băng chuyền nhé!' },
      ],
    },
  ],
};
