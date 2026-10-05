import { chordTarget, notes, posEcho, posNote } from './targets';
import type { Activity, Lesson, WeekPlan } from './types';

/**
 * CẤP 3 — "Thành thạo" (tuần 17–25): hợp âm tay trái, đổi thế tay, trưởng/thứ, đọc nốt cao Đô5–Sol5,
 * tác phẩm cổ điển giản lược (Minuet, Für Elise, Canon), đọc nhạc chỉ nhìn khuông, hòa nhạc lớn.
 * OWNER duyệt 2026-10-05: chèn tuần 20 "Đọc nốt cao" trước Minuet → tuần 20–24 cũ thành 21–25
 * (dữ liệu cũ được đánh số lại trong progress/migrations.ts).
 * Sau tuần 25: "Luyện tập mỗi ngày" (lessonEngine.dailyLesson) — không có điểm dừng.
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
  // Đọc trước nốt của tuần sau: La3, Si3 (dòng kẻ phụ dưới — La thứ tuần 19) và Mi5–Sol5 (tuần 20 nốt cao, Minuet tuần 21)
  warmup: { variant: 'read', pool: ['A3', 'B3', 'C4', 'E4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'], rounds: 8 },
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
        {
          kind: 'quiz',
          title: 'Đọc nốt thấp & cao 📖',
          intro: 'La, Si nằm DƯỚI Đô giữa (có dòng kẻ phụ) — dùng trong bài La thứ. Mi, Fa, Sol cao ở trên khuông — tuần sau mình leo Tháp Nốt Cao!',
          quiz: { variant: 'read', pool: ['A3', 'B3', 'C4', 'D5', 'E5', 'F5', 'G5'], rounds: 8 },
        },
        song('frere_jacques_minor', 'tempo', 2, 'names'),
      ],
    },
    // OWNER duyệt 2026-10-05: thay "Bài ca niềm vui — La thứ" (bài lặp) bằng bài tự sáng tác giọng La thứ
    trio('w19-l2', 19, 'Ninja rón rén', '🥷', 'ninja_tiptoe', 'Thế La thứ: ngón 1 ở La dưới Đô giữa. Ninja đi NHỎ (p) và NGẮT — chỉ ô cuối mới hét TO (f)!'),
  ],
};

export const WEEK20: WeekPlan = {
  week: 20,
  island: 'Tháp Nốt Cao',
  islandEmoji: '🗼',
  title: 'Đọc nốt cao Đô5–Sol5',
  story: 'Leo lên Tháp Nốt Cao! Ở trên đỉnh khuông nhạc có năm bạn nốt cao: Đô, Rê, Mi, Fa, Sol. Tuần sau các bạn ấy sẽ nhảy Minuet cùng con.',
  // Tiêu chí là đọc nốt (APP) → khởi động giữ đủ 10 lượt, chỉ các nốt cao
  warmup: { variant: 'read', pool: ['C5', 'D5', 'E5', 'F5', 'G5'], rounds: 10 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ trên khuông cho bố/mẹ: Đô cao ở khe 3, Mi cao ở khe trên cùng, Fa cao trên vạch trên cùng, Sol cao ngồi trên đỉnh khuông.' },
  criterion: { text: 'Đọc nốt cao Đô5–Sol5 đúng 8/10', who: 'APP' },
  lessons: [
    {
      id: 'w20-l1',
      week: 20,
      title: 'Năm nốt cao',
      emoji: '🗼',
      activities: [
        notes({
          id: 'w20-c5',
          step: 'Bài mới',
          title: 'Thế Đô cao — tay phải',
          intro: 'Dời cả bàn tay phải lên: ngón cái ở Đô cao (Đô5), ngón 5 ở Sol cao. Trên khuông: Đô cao ở khe 3, Sol cao ngồi trên đỉnh.',
          targets: [
            posNote('C5', 'RH', 'C5', 'Ngón 1 — Đô cao, khe 3'),
            posNote('D5', 'RH', 'C5', 'Trên vạch 4'),
            posNote('E5', 'RH', 'C5', 'Khe trên cùng'),
            posNote('F5', 'RH', 'C5', 'Vạch trên cùng'),
            posNote('G5', 'RH', 'C5', 'Ngón 5 — ngồi trên đỉnh khuông'),
          ],
        }),
        notes({
          id: 'w20-c5-echo',
          step: 'Nhại lại',
          title: 'Con vẹt trên tháp 🦜',
          intro: 'Nghe rồi đàn lại ở thế Đô cao.',
          targets: [posEcho(['C5', 'D5', 'E5'], 'RH', 'C5'), posEcho(['G5', 'F5', 'E5'], 'RH', 'C5'), posEcho(['C5', 'E5', 'G5'], 'RH', 'C5')],
        }),
      ],
    },
    trio('w20-l2', 20, 'Thuyền trôi', '⛵', 'drifting_boat', 'Thế Đô cao, nhịp 3. Dấu luyến dài: đàn LIỀN và NHỎ (p) như thuyền trôi êm.'),
    {
      id: 'w20-l3',
      week: 20,
      title: 'Đọc nhạc nốt cao',
      emoji: '📖',
      activities: [
        { kind: 'quiz', title: 'Đọc nốt cao 📖', intro: 'Cả nốt cao lẫn nốt quen: nhìn kỹ nốt ngồi ở vạch hay ở khe.', quiz: { variant: 'read', pool: ['G4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'], rounds: 8 } },
        { kind: 'sight', title: 'Đọc nhạc thế Đô cao', position: 'C5', hand: 'RH', count: 2, hints: 'names' },
        { kind: 'sight', title: 'Đọc nhạc — chỉ nhìn khuông', position: 'C5', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
      ],
    },
  ],
};

export const WEEK21: WeekPlan = {
  week: 21,
  island: 'Cung điện Minuet',
  islandEmoji: '👑',
  title: 'Minuet Sol trưởng',
  story: 'Trong Cung điện, các quý tộc nhảy điệu Minuet nhẹ nhàng. Bản nhạc này đã gần 300 tuổi!',
  warmup: { variant: 'identify', pool: ['G4', 'A4', 'B4', 'C5', 'D5'], rounds: 8, reference: 'G4' },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ chỗ có Fa thăng trong Minuet.' },
  criterion: { text: 'Chơi trọn Minuet Sol trưởng (8 ô nhịp)', who: 'PARENT/MIC' },
  lessons: [
    { id: 'w21-l1', week: 21, title: 'Minuet — từng câu', emoji: '👑', activities: [song('minuet_g', 'wait', 2, 'full', 'Tập từng câu một — chọn "Câu 1" rồi "Câu 2". Bốn nốt móc đơn dưới dấu luyến: đàn LIỀN; hai nốt Sol có chấm: đàn NGẮT.')] },
    trio('w21-l2', 21, 'Minuet — cả bài', '💃', 'minuet_g'),
  ],
};

export const WEEK22: WeekPlan = {
  week: 22,
  island: 'Vườn Beethoven',
  islandEmoji: '🌹',
  title: 'Für Elise',
  story: 'Beethoven viết "Für Elise" tặng một người bạn. Giai điệu "Mi – Rê thăng – Mi" nổi tiếng khắp thế giới.',
  warmup: { variant: 'read', pool: ['A4', 'B4', 'C5', 'D5', 'E5'], rounds: 8 },
  teach: { emoji: '👨‍🏫', text: 'Con đàn cho bố/mẹ 5 nốt đầu "Mi – Rê♯ – Mi – Rê♯ – Mi" và chỉ phím Rê thăng.' },
  criterion: { text: 'Chơi trọn đoạn mở đầu Für Elise', who: 'PARENT/MIC' },
  lessons: [
    { id: 'w22-l1', week: 22, title: 'Für Elise — từng câu', emoji: '🌹', activities: [song('fur_elise', 'wait', 2, 'full')] },
    trio('w22-l2', 22, 'Für Elise — cả đoạn', '🎼', 'fur_elise'),
  ],
};

export const WEEK23: WeekPlan = {
  week: 23,
  island: 'Thư viện Lớn',
  islandEmoji: '🏛️',
  title: 'Đọc nhạc hai khóa',
  story: 'Thư viện Lớn có hàng nghìn bản nhạc. Ai đọc được cả khóa Sol và khóa Fa thì mở được mọi cuốn sách!',
  leftHand: true,
  warmup: { variant: 'read', pool: ['C3', 'E3', 'G3', 'A3', 'C4'], rounds: 8, clef: 'bass' },
  teach: { emoji: '👨‍🏫', text: 'Con đọc to tên 5 nốt bất kỳ trên khuông cho bố/mẹ kiểm tra.' },
  criterion: { text: 'Đọc nhạc ngẫu nhiên: 5 đoạn đạt', who: 'PARENT/MIC' },
  lessons: [
    { id: 'w23-l1', week: 23, title: 'Đọc nhạc chỉ nhìn khuông', emoji: '👀', activities: [
      { kind: 'sight', title: 'Tay phải — khóa Sol', position: 'C', hand: 'RH', count: 3, rhythm: 2, hints: 'staff' },
      { kind: 'sight', title: 'Tay trái — khóa Fa', position: 'C', hand: 'LH', count: 2, rhythm: 2, hints: 'staff' },
    ] },
    trio('w23-l2', 23, 'Khúc Canon', '🎻', 'canon', 'Hai tay, mỗi nốt 2 phách — đàn thật êm.'),
  ],
};

export const WEEK24: WeekPlan = {
  week: 24,
  island: 'Đỉnh Hai Tay',
  islandEmoji: '🏔️',
  title: 'Bài hai tay hoàn chỉnh',
  story: 'Sắp tới đỉnh rồi! Hai tay giờ đã thành đôi bạn thân: một tay hát, một tay đệm.',
  leftHand: true,
  warmup: { variant: 'majorminor', pool: ['C4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố/mẹ đệm hợp âm Đô – Fa – Sol bằng tay trái.' },
  criterion: { text: 'Chơi trọn "Các thánh tiến bước — hai tay" theo nhịp', who: 'PARENT/MIC' },
  lessons: [trio('w24-l1', 24, 'Các thánh tiến bước — hai tay', '🎺', 'saints_both'), trio('w24-l2', 24, 'Ô Susanna — hai tay', '🪕', 'oh_susanna_both', 'Tay phải hát, tay trái đệm hợp âm Đô – Sol.')],
};

export const WEEK25: WeekPlan = {
  week: 25,
  island: 'Đại hòa nhạc',
  islandEmoji: '🎆',
  title: 'Đại hòa nhạc',
  story: 'Pháo hoa đã sẵn sàng! Đây là buổi hòa nhạc lớn nhất — con là nghệ sĩ piano thật sự.',
  leftHand: true,
  warmup: null,
  teach: { emoji: '🎤', text: 'Con kể cho khán giả nghe hành trình 25 tuần học đàn của con.' },
  criterion: { text: 'Đại hòa nhạc — phụ huynh trao huy chương vàng', who: 'PARENT' },
  lessons: [{ id: 'w25-stage', week: 25, title: 'Đại hòa nhạc', emoji: '🏆', isWeekTest: true, activities: [{ kind: 'stage', level: 3 }] }],
};

export const LEVEL3_WEEKS: readonly WeekPlan[] = [WEEK17, WEEK18, WEEK19, WEEK20, WEEK21, WEEK22, WEEK23, WEEK24, WEEK25];
