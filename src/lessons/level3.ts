import { chordTarget, notes } from './targets';
import type { Activity, Lesson, WeekPlan } from './types';

/**
 * CẤP 3 — "Thành thạo" (tuần 17–24): hợp âm tay trái, đổi thế tay, trưởng/thứ,
 * tác phẩm cổ điển giản lược (Minuet, Für Elise, Canon), đọc nhạc chỉ nhìn khuông, hòa nhạc lớn.
 * Sau tuần 24: "Luyện tập mỗi ngày" (lessonEngine.dailyLesson) — không có điểm dừng.
 */

const song = (songId: string, mode: 'wait' | 'tempo', level: 2 | 3 = 2, hints: 'full' | 'names' | 'staff' = 'names', intro?: string): Activity => ({
  kind: 'song',
  songId,
  mode,
  level,
  hints,
  intro,
});

const trio = (id: string, week: number, title: string, emoji: string, songId: string, intro?: string): Lesson => ({
  id,
  week,
  title,
  emoji,
  activities: [song(songId, 'wait', 2, 'names', intro), song(songId, 'tempo', 2, 'names'), song(songId, 'tempo', 3, 'staff')],
});

export const WEEK17: WeekPlan = {
  week: 17,
  island: 'Rừng Hợp Âm',
  islandEmoji: '🌲',
  title: 'Hợp âm tay trái',
  story: 'Trong Rừng Hợp Âm, ba nốt cùng vang lên một lúc như ba cây cổ thụ. Hợp âm làm bài hát đầy đặn!',
  leftHand: true,
  warmup: { variant: 'majorminor', pool: ['C4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ hợp âm Đô: ngón 5-3-1 tay trái trên Đô-Mi-Sol.' },
  criterion: { text: 'Chơi trọn "Bài ca niềm vui — hai tay hợp âm" theo nhịp', who: 'PARENT/MIC' },
  lessons: [
    {
      id: 'w17-l1',
      week: 17,
      title: 'Ba hợp âm thần kỳ',
      emoji: '🎹',
      activities: [
        notes({
          id: 'w17-chords',
          step: 'Bài mới',
          title: 'Hợp âm I · IV · V',
          intro: 'Chỉ cần 3 hợp âm là đệm được rất nhiều bài: Đô (I), Fa (IV), Sol (V).',
          targets: [
            chordTarget(['C3', 'E3', 'G3'], 'LH', 'Hợp âm Đô (I)', [5, 3, 1]),
            chordTarget(['C3', 'F3'], 'LH', 'Hợp âm Fa (IV)', [5, 2]),
            chordTarget(['D3', 'G3'], 'LH', 'Hợp âm Sol (V)', [4, 1]),
            chordTarget(['C3', 'E3', 'G3'], 'LH', 'Về nhà: Đô (I)', [5, 3, 1]),
          ],
        }),
      ],
    },
    trio('w17-l2', 17, 'Bài ca niềm vui — hợp âm', '🎶', 'ode_to_joy_chords'),
    trio('w17-l3', 17, 'Ngôi sao nhỏ — hợp âm', '⭐', 'twinkle_both'),
    trio('w17-l4', 17, 'Chuông ngân vang — hai tay', '🔔', 'jingle_bells_both'),
  ],
};

export const WEEK18: WeekPlan = {
  week: 18,
  island: 'Biển Đổi Thế',
  islandEmoji: '⛵',
  title: 'Đổi thế tay',
  story: 'Trên Biển Đổi Thế, bàn tay như con thuyền: dời sang chỗ mới mà vẫn chèo êm.',
  warmup: { variant: 'read', pool: ['E4', 'G4', 'A4', 'B4', 'C5', 'D5'], rounds: 8 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ chỗ trong bài phải dời tay, và dời bằng ngón nào.' },
  criterion: { text: 'Chơi trọn "Đêm thánh vô cùng"', who: 'PARENT/MIC' },
  lessons: [
    { id: 'w18-l1', week: 18, title: 'Đọc nhạc nhiều thế', emoji: '📖', activities: [
      { kind: 'sight', title: 'Đọc nhạc thế Đô', position: 'C', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
      { kind: 'sight', title: 'Đọc nhạc thế Sol', position: 'G', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
    ] },
    trio('w18-l2', 18, 'Đêm thánh vô cùng', '🌟', 'silent_night', 'Nhịp 3, có chấm dôi và dời tay ở câu 3.'),
  ],
};

export const WEEK19: WeekPlan = {
  week: 19,
  island: 'Thung lũng Vui Buồn',
  islandEmoji: '🌗',
  title: 'Trưởng & thứ',
  story: 'Ở Thung lũng Vui Buồn, cùng một bài hát có thể nghe VUI (giọng trưởng) hoặc BUỒN (giọng thứ).',
  warmup: { variant: 'majorminor', pool: ['C4', 'D4', 'F4', 'G4'], rounds: 10 },
  teach: { emoji: '👨‍🏫', text: 'Con đàn cho bố/mẹ nghe Đô-Mi-Sol (vui) rồi Đô-Mi♭-Sol (buồn).' },
  criterion: { text: 'Trò "Vui hay buồn?" đúng 8/10', who: 'APP' },
  lessons: [
    {
      id: 'w19-l1',
      week: 19,
      title: 'Vui hay buồn?',
      emoji: '🌗',
      activities: [
        { kind: 'quiz', title: 'Vui hay buồn? 😊😢', intro: 'App rải một hợp âm — nghe VUI hay BUỒN?', quiz: { variant: 'majorminor', pool: ['C4', 'D4', 'F4', 'G4'], rounds: 10 } },
        song('frere_jacques_minor', 'tempo', 2, 'names'),
      ],
    },
    trio('w19-l2', 19, 'Bài ca niềm vui — La thứ', '🌙', 'ode_to_joy_minor', 'Thế La thứ: ngón 1 ở La dưới Đô giữa.'),
  ],
};

export const WEEK20: WeekPlan = {
  week: 20,
  island: 'Cung điện Minuet',
  islandEmoji: '👑',
  title: 'Minuet Sol trưởng',
  story: 'Trong Cung điện, các quý tộc nhảy điệu Minuet nhẹ nhàng. Bản nhạc này đã gần 300 tuổi!',
  warmup: { variant: 'identify', pool: ['G4', 'A4', 'B4', 'C5', 'D5'], rounds: 8, reference: 'G4' },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ chỗ có Fa thăng trong Minuet.' },
  criterion: { text: 'Chơi trọn Minuet Sol trưởng (8 ô nhịp)', who: 'PARENT/MIC' },
  lessons: [
    { id: 'w20-l1', week: 20, title: 'Minuet — từng câu', emoji: '👑', activities: [song('minuet_g', 'wait', 2, 'full', 'Tập từng câu một — chọn "Câu 1" rồi "Câu 2".')] },
    trio('w20-l2', 20, 'Minuet — cả bài', '💃', 'minuet_g'),
  ],
};

export const WEEK21: WeekPlan = {
  week: 21,
  island: 'Vườn Beethoven',
  islandEmoji: '🌹',
  title: 'Für Elise',
  story: 'Beethoven viết "Für Elise" tặng một người bạn. Giai điệu "Mi – Rê thăng – Mi" nổi tiếng khắp thế giới.',
  warmup: { variant: 'read', pool: ['A4', 'B4', 'C5', 'D5', 'E5'], rounds: 8 },
  teach: { emoji: '👨‍🏫', text: 'Con đàn cho bố/mẹ 5 nốt đầu "Mi – Rê♯ – Mi – Rê♯ – Mi" và chỉ phím Rê thăng.' },
  criterion: { text: 'Chơi trọn đoạn mở đầu Für Elise', who: 'PARENT/MIC' },
  lessons: [
    { id: 'w21-l1', week: 21, title: 'Für Elise — từng câu', emoji: '🌹', activities: [song('fur_elise', 'wait', 2, 'full')] },
    trio('w21-l2', 21, 'Für Elise — cả đoạn', '🎼', 'fur_elise'),
  ],
};

export const WEEK22: WeekPlan = {
  week: 22,
  island: 'Thư viện Lớn',
  islandEmoji: '🏛️',
  title: 'Đọc nhạc hai khóa',
  story: 'Thư viện Lớn có hàng nghìn bản nhạc. Ai đọc được cả khóa Sol và khóa Fa thì mở được mọi cuốn sách!',
  leftHand: true,
  warmup: { variant: 'read', pool: ['C3', 'E3', 'G3', 'A3', 'C4'], rounds: 8, clef: 'bass' },
  teach: { emoji: '👨‍🏫', text: 'Con đọc to tên 5 nốt bất kỳ trên khuông cho bố/mẹ kiểm tra.' },
  criterion: { text: 'Đọc nhạc ngẫu nhiên: 5 đoạn đạt', who: 'PARENT/MIC' },
  lessons: [
    { id: 'w22-l1', week: 22, title: 'Đọc nhạc chỉ nhìn khuông', emoji: '👀', activities: [
      { kind: 'sight', title: 'Tay phải — khóa Sol', position: 'C', hand: 'RH', count: 3, rhythm: 2, hints: 'staff' },
      { kind: 'sight', title: 'Tay trái — khóa Fa', position: 'C', hand: 'LH', count: 2, rhythm: 2, hints: 'staff' },
    ] },
    trio('w22-l2', 22, 'Khúc Canon', '🎻', 'canon', 'Hai tay, mỗi nốt 2 phách — đàn thật êm.'),
  ],
};

export const WEEK23: WeekPlan = {
  week: 23,
  island: 'Đỉnh Hai Tay',
  islandEmoji: '🏔️',
  title: 'Bài hai tay hoàn chỉnh',
  story: 'Sắp tới đỉnh rồi! Hai tay giờ đã thành đôi bạn thân: một tay hát, một tay đệm.',
  leftHand: true,
  warmup: { variant: 'majorminor', pool: ['C4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố/mẹ đệm hợp âm Đô – Fa – Sol bằng tay trái.' },
  criterion: { text: 'Chơi trọn "Các thánh tiến bước — hai tay" theo nhịp', who: 'PARENT/MIC' },
  lessons: [trio('w23-l1', 23, 'Các thánh tiến bước — hai tay', '🎺', 'saints_both'), trio('w23-l2', 23, 'Chuông ngân vang — hai tay', '🔔', 'jingle_bells_both')],
};

export const WEEK24: WeekPlan = {
  week: 24,
  island: 'Đại hòa nhạc',
  islandEmoji: '🎆',
  title: 'Đại hòa nhạc',
  story: 'Pháo hoa đã sẵn sàng! Đây là buổi hòa nhạc lớn nhất — con là nghệ sĩ piano thật sự.',
  leftHand: true,
  warmup: null,
  teach: { emoji: '🎤', text: 'Con kể cho khán giả nghe hành trình 24 tuần học đàn của con.' },
  criterion: { text: 'Đại hòa nhạc — phụ huynh trao huy chương vàng', who: 'PARENT' },
  lessons: [{ id: 'w24-stage', week: 24, title: 'Đại hòa nhạc', emoji: '🏆', isWeekTest: true, activities: [{ kind: 'stage', level: 3 }] }],
};

export const LEVEL3_WEEKS: readonly WeekPlan[] = [WEEK17, WEEK18, WEEK19, WEEK20, WEEK21, WEEK22, WEEK23, WEEK24];
