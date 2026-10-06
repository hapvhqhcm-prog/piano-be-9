import { echo, notes } from './targets';
import type { WeekPlan } from './types';

/**
 * TUẦN 5 — Đồi Năm Ngón (v5, tuần CỦNG CỐ mới — OWNER duyệt 2026-10-05):
 * chuyên gia sư phạm: tốc độ cũ quá nhanh → thêm một tuần ở CÙNG kỹ năng (thế Đô, nốt đen/trắng/móc đơn, lặng)
 * với 3 bài tự sáng tác mới + một bài quen, trò Nhại lại 3 nốt và ứng tấu phím đen. Chưa có sắc thái p/f (tuần 6 mới dạy).
 * Tiêu chí: chơi trọn "Ếch con nhảy" theo nhịp — đạt ở 2 ngày khác nhau (micro hoặc phiếu 3 ý của bố mẹ).
 */
export const WEEK5: WeekPlan = {
  week: 5,
  island: 'Đồi Năm Ngón',
  islandEmoji: '🌻',
  title: 'Củng cố thế Đô',
  story: 'Trên Đồi Năm Ngón có ếch con, giọt mưa và chiếc thuyền giấy. Năm ngón tay của con sẽ kể chuyện về các bạn ấy!',
  warmup: { variant: 'stepskip', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố/mẹ "Ếch con nhảy": Đô – Mi – Sol là ngón 1 – 3 – 5, nhảy qua một phím!' },
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
        { kind: 'song', songId: 'frog_hop', mode: 'wait', hints: 'full', intro: 'Ếch con nhảy cóc: Đô – Mi – Sol, mỗi lần nhảy qua một phím. Ngón 1 – 3 – 5!' },
        { kind: 'song', songId: 'frog_hop', mode: 'tempo', level: 2, hints: 'full' },
      ],
    },
    {
      id: 'w5-l2',
      week: 5,
      title: 'Mưa rơi tí tách',
      emoji: '🌧️',
      activities: [
        { kind: 'song', songId: 'raindrops', mode: 'wait', hints: 'full', intro: 'Giọt mưa rơi "Chạy-chạy" — hai nốt nhanh trong một phách. Đọc to "Chạy-chạy" trước khi đàn nhé!' },
        { kind: 'song', songId: 'raindrops', mode: 'tempo', level: 2, hints: 'full' },
      ],
    },
    {
      id: 'w5-l3',
      week: 5,
      title: 'Thuyền giấy & phím đen',
      emoji: '⛵',
      activities: [
        { kind: 'song', songId: 'paper_boat', mode: 'wait', hints: 'full', intro: 'Thuyền giấy trôi chậm: có nốt dài "Đi-i" và chỗ "Suỵt" — nhớ chờ đủ phách!' },
        {
          kind: 'improv',
          title: 'Mưa trên phím đen 🎨',
          intro: 'App đàn nền. Con làm mưa trên phím đen: lúc thì mưa nhỏ lất phất, lúc thì mưa rào. Không có nốt nào sai cả!',
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
          intro: 'Nghe kỹ rồi đàn lại đúng thứ tự — có cả bước lẫn nhảy.',
          targets: [echo(['C4', 'E4', 'G4']), echo(['G4', 'F4', 'E4']), echo(['D4', 'F4', 'E4']), echo(['E4', 'C4', 'D4'])],
        }),
        { kind: 'song', songId: 'lightly_row', mode: 'tempo', level: 3, hints: 'full', intro: 'Bài quen tuần trước — giờ thử băng chuyền nhé!' },
      ],
    },
  ],
};
