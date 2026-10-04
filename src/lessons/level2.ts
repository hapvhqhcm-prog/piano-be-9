import { notes, posEcho, posNote } from './targets';
import type { Activity, Lesson, WeekPlan } from './types';

/**
 * CẤP 2 — "Hai tay & đọc nhạc" (tuần 9–16). OWNER yêu cầu hoàn thiện giáo trình tới mức thành thạo (2026-10-04).
 * Thế tay mới (số ngón theo bảng POSITIONS trong fingering.ts): Đô giữa tay trái, thế Sol, thế Rê (Fa♯), Đô thứ (Mi♭),
 * gam Đô trưởng luồn ngón; nhịp 3/4, nốt chấm dôi, móc đơn; hai tay luân phiên → hai tay cùng lúc.
 */

const song = (songId: string, mode: 'wait' | 'tempo', level: 2 | 3 = 2, hints: 'full' | 'names' | 'staff' = 'full', intro?: string): Activity => ({
  kind: 'song',
  songId,
  mode,
  level,
  hints,
  intro,
});

const pair = (id: string, week: number, title: string, emoji: string, songId: string, hints: 'full' | 'names' = 'full', intro?: string): Lesson => ({
  id,
  week,
  title,
  emoji,
  activities: [song(songId, 'wait', 2, hints, intro), song(songId, 'tempo', 2, hints)],
});

export const WEEK9: WeekPlan = {
  week: 9,
  island: 'Cầu Hai Tay',
  islandEmoji: '🌉',
  title: 'Đô giữa tay trái · hai tay luân phiên',
  story: 'Qua Cầu Hai Tay, hai bàn tay gặp nhau ở Đô giữa: ngón cái tay phải và ngón cái tay trái là hàng xóm!',
  leftHand: true,
  warmup: { variant: 'read', pool: ['F3', 'G3', 'A3', 'B3', 'C4'], rounds: 8, clef: 'bass' },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ cho bố/mẹ khóa Fa: nốt Fa ở giữa hai dấu chấm, Đô giữa ở trên cùng.' },
  criterion: { text: 'Chơi trọn "Hỏi – Đáp" hai tay luân phiên', who: 'PARENT/MIC' },
  lessons: [
    {
      id: 'w9-l1',
      week: 9,
      title: 'Đô giữa tay trái',
      emoji: '🫲',
      activities: [
        notes({
          id: 'w9-mc',
          step: 'Bài mới',
          title: 'Thế Đô giữa — tay trái',
          intro: 'Ngón cái tay trái đặt ở Đô giữa, các ngón khác xuống Si, La, Sol, Fa. Trên khuông Fa, Đô giữa ở trên cùng.',
          targets: [
            posNote('C4', 'LH', 'MC', 'Ngón 1 — Đô giữa'),
            posNote('B3', 'LH', 'MC'),
            posNote('A3', 'LH', 'MC'),
            posNote('G3', 'LH', 'MC'),
            posNote('F3', 'LH', 'MC', 'Ngón 5 — Fa'),
          ],
        }),
        notes({
          id: 'w9-mc-echo',
          step: 'Nhại lại',
          title: 'Con vẹt tay trái 🦜',
          intro: 'Nghe rồi đàn lại bằng tay trái thế Đô giữa.',
          targets: [posEcho(['C4', 'B3', 'A3'], 'LH', 'MC'), posEcho(['F3', 'G3', 'A3'], 'LH', 'MC'), posEcho(['A3', 'C4', 'G3'], 'LH', 'MC')],
        }),
        song('au_clair_mc_lh', 'wait'),
      ],
    },
    { id: 'w9-l2', week: 9, title: 'Chú cừu — Đô giữa', emoji: '🐑', activities: [song('mary_mc_lh', 'wait'), song('mary_mc_lh', 'tempo')] },
    pair('w9-l3', 9, 'Hỏi – Đáp hai tay', '💬', 'question_answer', 'full', 'Tay phải hỏi, tay trái đáp — lần lượt từng tay!'),
  ],
};

export const WEEK10: WeekPlan = {
  week: 10,
  island: 'Thung lũng Song Ca',
  islandEmoji: '🎎',
  title: 'Hai tay cùng lúc',
  story: 'Trong Thung lũng Song Ca, hai tay hát CÙNG LÚC: tay trái giữ một nốt dài làm nền, tay phải hát giai điệu.',
  leftHand: true,
  warmup: { variant: 'identify', pool: ['C3', 'D3', 'E3', 'F3', 'G3'], rounds: 8, reference: 'C3' },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ: tay trái bấm Đô và GIỮ, tay phải đàn Mi Rê Đô.' },
  criterion: { text: 'Chơi trọn "Bài ca niềm vui — hai tay" theo nhịp', who: 'PARENT/MIC' },
  lessons: [
    pair('w10-l1', 10, 'Bánh nóng — hai tay', '🥐', 'hot_cross_buns_both', 'full', 'Tay trái giữ Đô thật lâu, tay phải đàn bài quen.'),
    pair('w10-l2', 10, 'Chú cừu — hai tay', '🐑', 'mary_lamb_both'),
    pair('w10-l3', 10, 'Bài ca niềm vui — hai tay', '🎶', 'ode_to_joy_both'),
  ],
};

export const WEEK11: WeekPlan = {
  week: 11,
  island: 'Núi Sol',
  islandEmoji: '⛰️',
  title: 'Thế Sol',
  story: 'Leo lên Núi Sol: cả bàn tay dời sang phải, ngón cái đứng ở Sol. Có thêm bạn mới: Si, Đô cao, Rê cao!',
  warmup: { variant: 'identify', pool: ['G4', 'A4', 'B4', 'C5', 'D5'], rounds: 8, reference: 'G4' },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố/mẹ dời tay từ thế Đô sang thế Sol: ngón cái nhảy từ Đô lên Sol.' },
  criterion: { text: 'Chơi trọn "Bài ca niềm vui — thế Sol" theo nhịp', who: 'PARENT/MIC' },
  lessons: [
    {
      id: 'w11-l1',
      week: 11,
      title: 'Bàn tay ở thế Sol',
      emoji: '⛰️',
      activities: [
        notes({
          id: 'w11-g',
          step: 'Bài mới',
          title: 'Thế Sol — tay phải',
          intro: 'Ngón 1 ở Sol, ngón 2 La, ngón 3 Si, ngón 4 Đô cao, ngón 5 Rê cao.',
          targets: [
            posNote('G4', 'RH', 'G', 'Ngón 1 — Sol'),
            posNote('A4', 'RH', 'G'),
            posNote('B4', 'RH', 'G', 'Nốt mới: Si'),
            posNote('C5', 'RH', 'G', 'Đô cao'),
            posNote('D5', 'RH', 'G', 'Rê cao — ngón 5'),
          ],
        }),
        notes({
          id: 'w11-g-echo',
          step: 'Nhại lại',
          title: 'Con vẹt trên núi 🦜',
          intro: 'Nghe rồi đàn lại ở thế Sol.',
          targets: [posEcho(['G4', 'A4', 'B4'], 'RH', 'G'), posEcho(['D5', 'C5', 'B4'], 'RH', 'G'), posEcho(['G4', 'B4', 'D5'], 'RH', 'G')],
        }),
        { kind: 'sight', title: 'Đọc nhạc thế Sol', position: 'G', hand: 'RH', count: 2, hints: 'names' },
      ],
    },
    pair('w11-l2', 11, 'Bài ca niềm vui — thế Sol', '🎶', 'ode_to_joy_g', 'names'),
    {
      id: 'w11-l3',
      week: 11,
      title: 'Chèo thuyền & cô Rhody',
      emoji: '🚣',
      activities: [song('lightly_row_g', 'wait', 2, 'names'), song('lightly_row_g', 'tempo', 2, 'names'), song('aunt_rhody_g', 'wait', 2, 'names'), song('aunt_rhody_g', 'tempo', 2, 'names')],
    },
    {
      id: 'w11-l4',
      week: 11,
      title: 'Tay trái thế Sol',
      emoji: '🫲',
      activities: [
        notes({
          id: 'w11-g-lh',
          step: 'Bài mới',
          title: 'Thế Sol — tay trái',
          intro: 'Tay trái: ngón 5 ở Sol trầm (G2), ngón 1 ở Rê (D3).',
          targets: [posNote('G2', 'LH', 'G', 'Ngón 5'), posNote('A2', 'LH', 'G'), posNote('B2', 'LH', 'G'), posNote('C3', 'LH', 'G'), posNote('D3', 'LH', 'G', 'Ngón 1')],
        }),
        song('hot_cross_buns_g_lh', 'wait'),
        song('hot_cross_buns_g_lh', 'tempo'),
      ],
    },
  ],
};

export const WEEK12: WeekPlan = {
  week: 12,
  island: 'Vũ hội Valse',
  islandEmoji: '💃',
  title: 'Nhịp 3/4',
  story: 'Ở Vũ hội Valse mọi người nhảy "MỘT-hai-ba, MỘT-hai-ba". Phách 1 mạnh, phách 2–3 nhẹ.',
  leftHand: true,
  warmup: { variant: 'stepskip', pool: ['G4', 'A4', 'B4', 'C5', 'D5'], rounds: 8 },
  teach: { emoji: '👨‍🏫', text: 'Con vỗ tay cho bố/mẹ nhịp 3: MẠNH-nhẹ-nhẹ, MẠNH-nhẹ-nhẹ.' },
  criterion: { text: 'Chơi trọn "Điệu valse con mèo" theo nhịp', who: 'PARENT/MIC' },
  lessons: [
    {
      id: 'w12-l1',
      week: 12,
      title: 'MỘT-hai-ba',
      emoji: '👏',
      activities: [
        {
          kind: 'rhythm',
          title: 'Nhịp 3',
          intro: 'Mỗi ô nhịp có 3 phách. "Đi-i" = 2 phách (nốt trắng), "Đi-i-i" = 3 phách (nốt trắng chấm) — giữ hết ô nhịp!',
          patterns: [
            ['walk', 'walk', 'walk'],
            ['long', 'walk'],
            ['walk', 'long'],
            ['long3'],
            ['run', 'walk', 'walk'],
          ],
        },
        { kind: 'sight', title: 'Đọc nhạc nhịp 3', position: 'C', hand: 'RH', count: 2, hints: 'names', timeSignature: '3/4' },
      ],
    },
    pair('w12-l2', 12, 'Điệu valse con mèo', '🐱', 'waltz_cat'),
    pair('w12-l3', 12, 'Điệu valse mưa rơi', '🌧️', 'waltz_rain'),
    pair('w12-l4', 12, 'Chúc mừng sinh nhật', '🎂', 'birthday_both', 'full', 'Bài bắt đầu ở phách 3 ("Hap-py" lấy đà). Câu 1 tay trái hát trọn; các câu sau tay trái mở đầu, tay phải nối tiếp!'),
  ],
};

export const WEEK13: WeekPlan = {
  week: 13,
  island: 'Hang Phím Đen',
  islandEmoji: '🦇',
  title: 'Phím đen: thăng ♯ & giáng ♭',
  story: 'Trong Hang Phím Đen: dấu THĂNG ♯ đẩy nốt lên phím đen bên PHẢI, dấu GIÁNG ♭ kéo nốt xuống phím đen bên TRÁI.',
  warmup: { variant: 'identify', pool: ['D4', 'E4', 'F#4', 'G4', 'A4'], rounds: 8, reference: 'D4' },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ cho bố/mẹ: Fa thăng ở đâu? Mi giáng ở đâu?' },
  criterion: { text: 'Chơi trọn "Bài ca niềm vui — thế Rê" theo nhịp', who: 'PARENT/MIC' },
  lessons: [
    {
      id: 'w13-l1',
      week: 13,
      title: 'Fa thăng ♯',
      emoji: '♯',
      activities: [
        notes({
          id: 'w13-d',
          step: 'Bài mới',
          title: 'Thế Rê — có Fa thăng',
          intro: 'Ngón 1 ở Rê. Ngón 3 KHÔNG đánh Fa trắng mà đánh phím đen Fa thăng ngay bên phải!',
          targets: [posNote('D4', 'RH', 'D', 'Ngón 1'), posNote('E4', 'RH', 'D'), posNote('F#4', 'RH', 'D', 'Phím ĐEN — Fa thăng'), posNote('G4', 'RH', 'D'), posNote('A4', 'RH', 'D', 'Ngón 5')],
        }),
        notes({
          id: 'w13-d-echo',
          step: 'Nhại lại',
          title: 'Con vẹt phím đen 🦜',
          intro: 'Nghe kỹ tiếng Fa thăng nhé!',
          targets: [posEcho(['D4', 'E4', 'F#4'], 'RH', 'D'), posEcho(['A4', 'G4', 'F#4'], 'RH', 'D'), posEcho(['D4', 'F#4', 'A4'], 'RH', 'D')],
        }),
      ],
    },
    pair('w13-l2', 13, 'Bài ca niềm vui — thế Rê', '🎶', 'ode_to_joy_d', 'names'),
    pair('w13-l3', 13, 'Chú cừu — thế Rê', '🐑', 'mary_lamb_d', 'names'),
    {
      id: 'w13-l4',
      week: 13,
      title: 'Mi giáng ♭ — giọng buồn',
      emoji: '♭',
      activities: [
        notes({
          id: 'w13-cm',
          step: 'Bài mới',
          title: 'Đô thứ — có Mi giáng',
          intro: 'Thế Đô nhưng ngón 3 đánh phím đen Mi giáng (bên TRÁI Mi). Nghe buồn hơn hẳn!',
          targets: [posNote('C4', 'RH', 'Cm'), posNote('D4', 'RH', 'Cm'), posNote('Eb4', 'RH', 'Cm', 'Phím ĐEN — Mi giáng'), posNote('F4', 'RH', 'Cm'), posNote('G4', 'RH', 'Cm')],
        }),
        song('frere_jacques_minor', 'wait', 2, 'names', 'Bài "Kìa con bướm vàng" nhưng ở giọng buồn — nghe lạ không?'),
      ],
    },
  ],
};

export const WEEK14: WeekPlan = {
  week: 14,
  island: 'Sa mạc Nhịp Chấm',
  islandEmoji: '🐪',
  title: 'Nốt chấm dôi & móc đơn',
  story: 'Con lạc đà đi "Đi-chấm chạy": nốt có CHẤM dài thêm một nửa, nốt sau đó ngắn lại cho vừa.',
  warmup: { variant: 'read', pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'], rounds: 8 },
  teach: { emoji: '👨‍🏫', text: 'Con đọc to cho bố/mẹ nhịp "Đi-chấm chạy Đi Đi" (nốt chấm dôi).' },
  criterion: { text: 'Chơi "Bài ca niềm vui" đúng nhịp chấm dôi, 60 nhịp/phút', who: 'PARENT/MIC' },
  lessons: [
    {
      id: 'w14-l1',
      week: 14,
      title: 'Nhịp chấm dôi',
      emoji: '🐪',
      activities: [
        {
          kind: 'rhythm',
          title: 'Đi-chấm chạy',
          intro: 'Nốt đen CHẤM = 1 phách rưỡi ("Đi-chấm"), nốt móc đơn theo sau = nửa phách ("chạy"). Khác "Đi-i" (nốt trắng, 2 phách đều)!',
          patterns: [
            ['long', 'walk', 'walk'],
            ['dotted', 'walk', 'walk'],
            ['walk', 'walk', 'dotted'],
            ['dotted', 'long'],
            ['run', 'run', 'dotted'],
          ],
        },
        { kind: 'sight', title: 'Đọc nhạc có móc đơn', position: 'C', hand: 'RH', count: 2, rhythm: 2, hints: 'names' },
      ],
    },
    pair('w14-l2', 14, 'Bài ca niềm vui — bản gốc', '🎶', 'ode_to_joy_original', 'names'),
    pair('w14-l3', 14, 'Cầu London — chấm dôi', '🌉', 'london_bridge_dotted', 'names'),
    pair('w14-l4', 14, 'Ngôi sao — Chạy-chạy', '⭐', 'twinkle_run', 'names'),
  ],
};

export const WEEK15: WeekPlan = {
  week: 15,
  island: 'Thác Gam',
  islandEmoji: '🌊',
  title: 'Gam Đô trưởng — luồn ngón',
  story: 'Ở Thác Gam, nước chảy 8 bậc từ Đô đến Đô. Ngón cái LUỒN dưới bàn tay để đi tiếp — như con cá lặn qua!',
  leftHand: true,
  warmup: { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'], rounds: 8, reference: 'C4' },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ cách luồn ngón cái dưới ngón 3 khi đi lên gam.' },
  criterion: { text: 'Chơi gam Đô trưởng hai tay (lần lượt) theo nhịp', who: 'PARENT/MIC' },
  lessons: [
    pair('w15-l1', 15, 'Gam tay phải', '🌊', 'scale_c_rh', 'full', 'Đô Rê Mi (1-2-3) rồi LUỒN ngón cái xuống Fa!'),
    pair('w15-l2', 15, 'Gam tay trái', '🌊', 'scale_c_lh', 'full', 'Tay trái đi lên: 5-4-3-2-1 rồi ngón 3 VẮT qua La.'),
    pair('w15-l3', 15, 'Niềm vui cho thế giới', '🎄', 'joy_to_the_world', 'full', 'Bài này chính là gam đi xuống!'),
  ],
};

export const WEEK16: WeekPlan = {
  week: 16,
  island: 'Nhà hát Cấp 2',
  islandEmoji: '🎭',
  title: 'Hòa nhạc Cấp 2',
  story: 'Nhà hát lớn đã mở cửa! Con chọn những bài hai tay hay nhất để biểu diễn.',
  leftHand: true,
  warmup: null,
  teach: { emoji: '🎤', text: 'Con giới thiệu bài và kể cho khán giả: bài này dùng thế tay nào?' },
  criterion: { text: 'Biểu diễn trọn vẹn — phụ huynh tặng huy chương Cấp 2', who: 'PARENT' },
  lessons: [
    {
      id: 'w16-l1',
      week: 16,
      title: 'Tổng ôn đọc nhạc',
      emoji: '📖',
      activities: [
        { kind: 'quiz', title: 'Đọc nốt khóa Sol 📖', intro: 'Thế Đô và thế Sol.', quiz: { variant: 'read', pool: ['C4', 'E4', 'G4', 'B4', 'D5'], rounds: 8 } },
        { kind: 'quiz', title: 'Đọc nốt khóa Fa 📖', intro: 'Tay trái.', quiz: { variant: 'read', pool: ['C3', 'E3', 'G3', 'A3', 'C4'], rounds: 8, clef: 'bass' } },
        { kind: 'sight', title: 'Đọc nhạc tổng hợp', position: 'G', hand: 'RH', count: 2, rhythm: 2, hints: 'names' },
      ],
    },
    { id: 'w16-stage', week: 16, title: 'Hòa nhạc Cấp 2', emoji: '🏅', isWeekTest: true, activities: [{ kind: 'stage', level: 2 }] },
  ],
};

export const LEVEL2_WEEKS: readonly WeekPlan[] = [WEEK9, WEEK10, WEEK11, WEEK12, WEEK13, WEEK14, WEEK15, WEEK16];
