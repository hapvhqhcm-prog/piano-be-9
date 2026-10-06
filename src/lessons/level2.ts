import { notes, posEcho, posNote } from './targets';
import type { Activity, Lesson, WeekPlan } from './types';

/**
 * CẤP 2 — "Hai tay & đọc nhạc" (tuần 11–21; v5 — OWNER duyệt 2026-10-05: thêm tuần 13 củng cố hai tay
 * và tuần 18 "móc kép" trước các bài dân ca có móc kép; v5.1 — OWNER duyệt 2026-10-06: tách tuần 18 → thêm tuần 19
 * "nghịch phách & dây nối", Cấp 2 thành 11 tuần). OWNER yêu cầu hoàn thiện giáo trình tới mức thành thạo (2026-10-04).
 * Thế tay mới (số ngón theo bảng POSITIONS trong fingering.ts): Đô giữa tay trái, thế Sol, thế Rê (Fa♯), Đô thứ (Mi♭),
 * gam Đô trưởng luồn ngón; nhịp 3/4, nốt chấm dôi, móc đơn; hai tay luân phiên → hai tay cùng lúc.
 * KIỂU ĐÀN (OWNER duyệt 2026-10-05): tuần 12 trò "Ngắt hay liền?" — NGẮT (staccato, dấu chấm trên nốt) và
 * LIỀN (legato, dấu luyến cong); từ đây các bài có dấu chấm ngắt / dấu luyến.
 * v5: khởi động kỹ thuật (v5.1: luồn ngón cái từ tuần 17 — 3 tuần trước gam tuần 20); đọc khóa Fa theo nốt mốc (tuần 11),
 * đọc theo quãng tới quãng 5; sáng tác 4 ô nhịp (tuần 13, 17). Tiêu chí bài hát: đạt ở 2 NGÀY khác nhau (lessonEngine.weekPassed).
 * v5.1: khởi động kỹ thuật ~30 giây MỖI buổi (WeekPlan.drills, ngay sau tư thế) thay cho hoạt động 1 phút ở bài đầu tuần;
 * bài hai tay cùng lúc đầu tuần 12, 13 TÁCH TAY sẵn (chờ tay phải → chờ tay trái → hai tay).
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

/**
 * v5.1 — TÁCH TAY có sẵn (bài hai tay cùng lúc đầu tuần): chờ TAY PHẢI → chờ TAY TRÁI → HAI TAY chờ → HAI TAY theo nhịp.
 * Lượt một tay KHÔNG tính cho tiêu chí tuần (lessonEngine.passedWhole bỏ lượt có `hand`).
 */
const handsApart = (songId: string, rhIntro: string, lhIntro: string): Activity[] => [
  { kind: 'song', songId, mode: 'wait', level: 2, hints: 'full', hand: 'RH', intro: rhIntro },
  { kind: 'song', songId, mode: 'wait', level: 2, hints: 'full', hand: 'LH', intro: lhIntro },
  song(songId, 'wait', 2, 'full', 'Ghép HAI TAY — chậm thôi, đúng trước nhanh sau!'),
  song(songId, 'tempo'),
];

export const WEEK11: WeekPlan = {
  week: 11,
  island: 'Cầu Hai Tay',
  islandEmoji: '🌉',
  title: 'Đô giữa tay trái · hai tay luân phiên',
  story: 'Qua Cầu Hai Tay, hai bàn tay gặp nhau ở Đô giữa: ngón cái tay phải và ngón cái tay trái là hàng xóm!',
  leftHand: true,
  warmup: { variant: 'read', pool: ['F3', 'G3', 'A3', 'B3', 'C4'], rounds: 8, clef: 'bass' },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ cho bố/mẹ khóa Fa: nốt Fa ở giữa hai dấu chấm, Đô giữa ở trên cùng.' },
  drills: ['hand-shape', 'five-finger'],
  criterion: { text: 'Chơi trọn "Hỏi – Đáp" hai tay luân phiên — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Tay phải hỏi, tay trái đáp — trọn bài 2 hôm nhé! 💬',
  lessons: [
    {
      id: 'w11-l1',
      week: 11,
      title: 'Đô giữa tay trái',
      emoji: '🫲',
      activities: [
        notes({
          id: 'w11-mc',
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
          id: 'w11-mc-echo',
          step: 'Nhại lại',
          title: 'Con vẹt tay trái 🦜',
          intro: 'Nghe rồi đàn lại bằng tay trái thế Đô giữa.',
          targets: [posEcho(['C4', 'B3', 'A3'], 'LH', 'MC'), posEcho(['F3', 'G3', 'A3'], 'LH', 'MC'), posEcho(['A3', 'C4', 'G3'], 'LH', 'MC')],
        }),
        {
          kind: 'quiz',
          title: 'Nốt mốc khóa Fa 🧭',
          intro: 'Khóa Fa có hai dấu chấm ôm lấy vạch 4: đó là nốt FA. Đô giữa "đội mũ" vạch phụ ở TRÊN khuông; Đô trầm ở khe 2.',
          quiz: { variant: 'landmark', pool: ['C4', 'F3', 'C3'], rounds: 8, clef: 'bass' },
        },
      ],
    },
    {
      id: 'w11-l2',
      week: 11,
      title: 'Trăng & Cừu — Đô giữa',
      emoji: '🐑',
      activities: [song('au_clair_mc_lh', 'wait'), song('mary_mc_lh', 'wait'), song('mary_mc_lh', 'tempo')],
    },
    {
      id: 'w11-l3',
      week: 11,
      title: 'Hỏi – Đáp hai tay',
      emoji: '💬',
      activities: [
        song('question_answer', 'wait', 2, 'full', 'Tay phải hỏi, tay trái đáp — lần lượt từng tay!'),
        song('question_answer', 'tempo'),
        {
          kind: 'improv',
          title: 'Con trả lời 💬',
          intro: 'App đàn câu HỎI 2 ô nhịp. Con đàn câu TRẢ LỜI 2 ô bằng thế Đô — kết thúc ở Đô cho câu trả lời "chắc chắn".',
          mode: 'question-answer',
          position: 'C',
          bars: 2,
        },
      ],
    },
  ],
};

export const WEEK12: WeekPlan = {
  week: 12,
  island: 'Thung lũng Song Ca',
  islandEmoji: '🎎',
  title: 'Hai tay cùng lúc',
  story: 'Trong Thung lũng Song Ca, hai tay hát CÙNG LÚC: tay trái giữ một nốt dài làm nền, tay phải hát giai điệu.',
  leftHand: true,
  warmup: { variant: 'identify', pool: ['C3', 'D3', 'E3', 'F3', 'G3'], rounds: 8, reference: 'C3' },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ: tay trái bấm Đô và GIỮ, tay phải đàn Mi Rê Đô. Rồi đàn Đô Rê Mi NGẮT (nảy như bóng) và LIỀN (nối như dòng nước).' },
  drills: ['finger-tap', 'five-finger'],
  criterion: { text: 'Chơi trọn "Bài ca niềm vui — hai tay" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Hai tay cùng hát Bài ca niềm vui theo nhịp — 2 hôm nhé! 🎎',
  lessons: [
    {
      id: 'w12-l1',
      week: 12,
      title: 'Bánh nóng — hai tay',
      emoji: '🥐',
      activities: [
        ...handsApart('hot_cross_buns_both', 'Tay phải trước: bài "Bánh nóng" quen thuộc.', 'Giờ tay trái: bấm Đô và GIỮ thật lâu — tay phải nghỉ.'),
      ],
    },
    {
      // OWNER duyệt 2026-10-05: thay "Chú cừu — hai tay" (bài lặp) bằng bài kiểu đàn ngắt / liền
      id: 'w12-stac', // nội dung mới (v4) → mã mới, để bài 'l2' cũ (Chú cừu — hai tay) đã học không bị tính là đã học bài này
      week: 12,
      title: 'Ngắt & liền',
      emoji: '🤖',
      activities: [
        {
          kind: 'dynamics',
          title: 'Ngắt hay liền? 🏀🌊',
          intro: 'NGẮT (dấu chấm trên nốt): chạm rồi nhấc ngón lên ngay, như quả bóng nảy. LIỀN (dấu luyến cong): giữ nốt này tới khi nốt sau vang lên, như dòng nước chảy. Thầy đàn mẫu, con đàn lại!',
          mode: 'stac-leg',
          rounds: [
            { pitches: ['C4', 'D4', 'E4'], want: 'leg', fingers: [1, 2, 3], hand: 'RH' },
            { pitches: ['C4', 'D4', 'E4'], want: 'stac', fingers: [1, 2, 3], hand: 'RH' },
            { pitches: ['G4', 'F4', 'E4', 'D4', 'C4'], want: 'leg', fingers: [5, 4, 3, 2, 1], hand: 'RH' },
            { pitches: ['C4', 'E4', 'G4'], want: 'stac', fingers: [1, 3, 5], hand: 'RH' },
            { pitches: ['E4', 'F4', 'G4'], want: 'leg', fingers: [3, 4, 5], hand: 'RH' },
            { pitches: ['G4', 'G4', 'G4'], want: 'stac', fingers: [5, 5, 5], hand: 'RH' },
          ],
        },
        song('robot_march', 'wait', 2, 'full', 'Rô-bốt đi đều: mọi nốt có dấu chấm — đàn NGẮT và TO (f). Ô 5 rô-bốt đi xa: NHỎ (p)!'),
        song('robot_march', 'tempo', 2, 'full'),
      ],
    },
    pair('w12-l3', 12, 'Bài ca niềm vui — hai tay', '🎶', 'ode_to_joy_both'),
  ],
};

/**
 * TUẦN 13 — Vườn Tháp Chuông (v5, tuần CỦNG CỐ mới — OWNER duyệt 2026-10-05): cùng kỹ năng tuần 12
 * (hai tay cùng lúc: tay trái giữ nốt dài, ngắt/liền, p/f) với 3 bài tự sáng tác mới, đọc quãng tới quãng 4,
 * và lần SÁNG TÁC đầu tiên (4 ô nhịp, thế Đô).
 */
export const WEEK13: WeekPlan = {
  week: 13,
  island: 'Vườn Tháp Chuông',
  islandEmoji: '🔔',
  title: 'Củng cố hai tay',
  story: 'Trong Vườn Tháp Chuông, chuông lớn (tay trái) ngân dài, chuông nhỏ (tay phải) hát giai điệu. Hai tay cùng làm nên bản nhạc!',
  leftHand: true,
  warmup: { variant: 'identify', pool: ['C3', 'D3', 'E3', 'F3', 'G3'], rounds: 8, reference: 'C3' },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ: tay trái giữ nốt nào, giữ bao lâu? Rồi đàn "Tháp chuông" một lần TO, một lần NHỎ.' },
  drills: ['wrist-circle', 'five-finger'],
  criterion: { text: 'Chơi trọn "Tháp chuông" hai tay theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Tháp chuông "boong boong" hai tay theo nhịp — 2 hôm nhé! 🔔',
  lessons: [
    {
      id: 'w13-l1',
      week: 13,
      title: 'Tháp chuông',
      emoji: '🔔',
      activities: [
        ...handsApart(
          'bell_tower',
          'Chuông nhỏ (tay phải) hát trước. Nửa sau đàn NHỎ (p) như chuông ở xa.',
          'Tay trái là chuông lớn: bấm một nốt rồi GIỮ cả ô nhịp.',
        ),
      ],
    },
    {
      id: 'w13-l2',
      week: 13,
      title: 'Đôi bạn & Lý cây xanh',
      emoji: '👫',
      activities: [
        ...pair('w13-l2', 13, 'Đôi bạn', '👫', 'two_friends', 'full', 'Tay trái đi nốt trắng (2 phách), tay phải đi nốt đen — hai bạn đi cùng nhau mà không vội!').activities,
        // (2026-10-06) Dân ca Nam Bộ, 2/4 — hai tay LUÂN PHIÊN như tuần 11 (không đánh cùng lúc)
        song('ly_cay_xanh', 'wait', 2, 'names', 'Dân ca Nam Bộ, nhịp 2/4! Tay phải "thế Mi": Mi 1, Sol 2, La 3, Đô cao 5. Tay trái chỉ có Rê (ngón cái) và Đô (ngón 2) ở câu giữa — hai tay thay nhau, không đàn cùng lúc.'),
      ],
    },
    pair('w13-l3', 13, 'Thung lũng tiếng vọng', '⛰️', 'echo_valley', 'full', 'Câu LIỀN (dấu luyến) rồi câu NGẮT (dấu chấm); TO (f) rồi NHỎ (p) như tiếng vọng.'),
    {
      id: 'w13-l4',
      week: 13,
      title: 'Đọc quãng & sáng tác',
      emoji: '✍️',
      activities: [
        {
          kind: 'quiz',
          title: 'Bước, nhảy hay nhảy xa? 🐸',
          intro: 'Khuông hiện HAI nốt. Đếm số vạch + khe từ nốt này tới nốt kia: bước (quãng 2), nhảy (quãng 3), nhảy xa (quãng 4). Lên hay xuống?',
          quiz: { variant: 'interval', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 8, maxInterval: 4 },
        },
        {
          kind: 'improv',
          title: 'Con là nhạc sĩ ✍️',
          intro: 'Con sáng tác một bài 4 ô nhịp ở thế Đô tay phải. Gợi ý: ô 1–2 "hỏi", ô 3–4 "đáp" và kết thúc ở Đô. App ghi lại thành bài của con trong Thư viện!',
          mode: 'compose',
          position: 'C',
          bars: 4,
        },
      ],
    },
  ],
};

export const WEEK14: WeekPlan = {
  week: 14,
  island: 'Núi Sol',
  islandEmoji: '⛰️',
  title: 'Thế Sol',
  story: 'Leo lên Núi Sol: cả bàn tay dời sang phải, ngón cái đứng ở Sol. Có thêm bạn mới: Si, Đô cao, Rê cao!',
  warmup: { variant: 'identify', pool: ['G4', 'A4', 'B4', 'C5', 'D5'], rounds: 8, reference: 'G4' },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố/mẹ dời tay từ thế Đô sang thế Sol: ngón cái nhảy từ Đô lên Sol.' },
  drills: ['five-finger', 'hand-shape'],
  criterion: { text: 'Chơi trọn "Bài ca niềm vui — thế Sol" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Leo Núi Sol: Bài ca niềm vui tốc độ 60 — 2 hôm nhé! ⛰️',
  lessons: [
    {
      id: 'w14-l1',
      week: 14,
      title: 'Bàn tay ở thế Sol',
      emoji: '⛰️',
      activities: [
        notes({
          id: 'w14-g',
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
          id: 'w14-g-echo',
          step: 'Nhại lại',
          title: 'Con vẹt trên núi 🦜',
          intro: 'Nghe rồi đàn lại ở thế Sol.',
          targets: [posEcho(['G4', 'A4', 'B4'], 'RH', 'G'), posEcho(['D5', 'C5', 'B4'], 'RH', 'G'), posEcho(['G4', 'B4', 'D5'], 'RH', 'G')],
        }),
        { kind: 'sight', title: 'Đọc nhạc thế Sol', position: 'G', hand: 'RH', count: 2, hints: 'names' },
      ],
    },
    pair('w14-l2', 14, 'Bài ca niềm vui — thế Sol', '🎶', 'ode_to_joy_g', 'names'),
    {
      id: 'w14-l3',
      week: 14,
      title: 'Chèo thuyền & cô Rhody',
      emoji: '🚣',
      activities: [song('lightly_row_g', 'wait', 2, 'names'), song('lightly_row_g', 'tempo', 2, 'names'), song('aunt_rhody_g', 'wait', 2, 'names'), song('aunt_rhody_g', 'tempo', 2, 'names')],
    },
    {
      id: 'w14-l4',
      week: 14,
      title: 'Tay trái thế Sol',
      emoji: '🫲',
      activities: [
        notes({
          id: 'w14-g-lh',
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

export const WEEK15: WeekPlan = {
  week: 15,
  island: 'Vũ hội Valse',
  islandEmoji: '💃',
  title: 'Nhịp 3/4',
  story: 'Ở Vũ hội Valse mọi người nhảy "MỘT-hai-ba, MỘT-hai-ba". Phách 1 mạnh, phách 2–3 nhẹ.',
  leftHand: true,
  // v5: đọc theo QUÃNG trên khuông (tới quãng 4) ở thế Sol
  warmup: { variant: 'interval', pool: ['G4', 'A4', 'B4', 'C5', 'D5'], rounds: 8, maxInterval: 4 },
  teach: { emoji: '👨‍🏫', text: 'Con vỗ tay cho bố/mẹ nhịp 3: MẠNH-nhẹ-nhẹ, MẠNH-nhẹ-nhẹ.' },
  drills: ['arm-drop', 'wrist-circle'],
  criterion: { text: 'Chơi trọn "Điệu valse con mèo" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Mèo con nhảy valse "MỘT-hai-ba" — 2 hôm nhé! 🐱',
  lessons: [
    {
      id: 'w15-l1',
      week: 15,
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
    pair('w15-l2', 15, 'Điệu valse con mèo', '🐱', 'waltz_cat'),
    pair('w15-l3', 15, 'Điệu valse mưa rơi', '🌧️', 'waltz_rain', 'full', 'Dấu luyến cong: đàn LIỀN, nốt nọ nối nốt kia. Dấu p: NHỎ như mưa phùn.'),
    pair('w15-l4', 15, 'Chúc mừng sinh nhật', '🎂', 'birthday_both', 'full', 'Bài bắt đầu ở phách 3 ("Hap-py" lấy đà). Câu 1 tay trái hát trọn; các câu sau tay trái mở đầu, tay phải nối tiếp!'),
  ],
};

export const WEEK16: WeekPlan = {
  week: 16,
  island: 'Hang Phím Đen',
  islandEmoji: '🦇',
  title: 'Phím đen: thăng ♯ & giáng ♭',
  story: 'Trong Hang Phím Đen: dấu THĂNG ♯ đẩy nốt lên phím đen bên PHẢI, dấu GIÁNG ♭ kéo nốt xuống phím đen bên TRÁI.',
  warmup: { variant: 'identify', pool: ['D4', 'E4', 'F#4', 'G4', 'A4'], rounds: 8, reference: 'D4' },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ cho bố/mẹ: Fa thăng ở đâu? Mi giáng ở đâu?' },
  drills: ['five-finger', 'hand-shape'],
  criterion: { text: 'Chơi trọn "Bài ca niềm vui — thế Rê" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Nhớ phím đen Fa thăng: Bài ca niềm vui thế Rê, tốc độ 60 — 2 hôm nhé! 🦇',
  lessons: [
    {
      id: 'w16-l1',
      week: 16,
      title: 'Fa thăng ♯',
      emoji: '♯',
      activities: [
        notes({
          id: 'w16-d',
          step: 'Bài mới',
          title: 'Thế Rê — có Fa thăng',
          intro: 'Ngón 1 ở Rê. Ngón 3 KHÔNG đánh Fa trắng mà đánh phím đen Fa thăng ngay bên phải!',
          targets: [posNote('D4', 'RH', 'D', 'Ngón 1'), posNote('E4', 'RH', 'D'), posNote('F#4', 'RH', 'D', 'Phím ĐEN — Fa thăng'), posNote('G4', 'RH', 'D'), posNote('A4', 'RH', 'D', 'Ngón 5')],
        }),
        notes({
          id: 'w16-d-echo',
          step: 'Nhại lại',
          title: 'Con vẹt phím đen 🦜',
          intro: 'Nghe kỹ tiếng Fa thăng nhé!',
          targets: [posEcho(['D4', 'E4', 'F#4'], 'RH', 'D'), posEcho(['A4', 'G4', 'F#4'], 'RH', 'D'), posEcho(['D4', 'F#4', 'A4'], 'RH', 'D')],
        }),
      ],
    },
    pair('w16-l2', 16, 'Bài ca niềm vui — thế Rê', '🎶', 'ode_to_joy_d', 'names'),
    // OWNER duyệt 2026-10-05: thay "Chú cừu — thế Rê" (bài lặp) bằng bài tự sáng tác ở thế Rê
    pair('w16-l3', 16, 'Siêu nhân bay', '🦸', 'superhero_fly', 'names', 'Thế Rê có Fa thăng. Nhảy Rê – Fa♯ – La thật TO (f) như siêu nhân cất cánh!'),
    {
      id: 'w16-l4',
      week: 16,
      title: 'Mi giáng ♭ — giọng buồn',
      emoji: '♭',
      activities: [
        notes({
          id: 'w16-cm',
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

export const WEEK17: WeekPlan = {
  week: 17,
  island: 'Sa mạc Nhịp Chấm',
  islandEmoji: '🐪',
  // v5.1 (chuyên gia): móc đơn "Chạy-chạy" đã học từ tuần 4 — tuần này chỉ MỚI nốt đen chấm dôi
  title: 'Nốt đen chấm dôi',
  story: 'Con lạc đà đi "Đi-chấm chạy": nốt có CHẤM dài thêm một nửa, nốt sau đó ngắn lại cho vừa.',
  warmup: { variant: 'read', pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'], rounds: 8 },
  teach: { emoji: '👨‍🏫', text: 'Con đọc to cho bố/mẹ nhịp "Đi-chấm chạy Đi Đi" (nốt chấm dôi).' },
  drills: ['thumb-under', 'finger-tap'],
  criterion: { text: 'Chơi "Bài ca niềm vui" đúng nhịp chấm dôi, 60 nhịp/phút — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Lạc đà đi "Đi-chấm chạy": Bài ca niềm vui tốc độ 60 — 2 hôm nhé! 🐪',
  lessons: [
    {
      id: 'w17-l1',
      week: 17,
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
    pair('w17-l2', 17, 'Bài ca niềm vui — bản gốc', '🎶', 'ode_to_joy_original', 'names'),
    // v5: "Bắc kim thang" (có móc kép) dời sang tuần 18 — sau bài "móc kép"
    {
      id: 'w17-l4',
      week: 17,
      title: 'Ngôi sao — Chạy-chạy · Sáng tác',
      emoji: '⭐',
      activities: [
        song('twinkle_run', 'wait', 2, 'names'),
        song('twinkle_run', 'tempo', 2, 'names'),
        {
          kind: 'improv',
          title: 'Con là nhạc sĩ ✍️',
          intro: 'Con sáng tác một bài 4 ô nhịp ở thế Đô: thử dùng nhịp "Đi-chấm chạy" vừa học! Kết thúc ở Đô. App ghi lại thành bài của con trong Thư viện.',
          mode: 'compose',
          position: 'C',
          bars: 4,
        },
      ],
    },
  ],
};

/**
 * TUẦN 18 — Suối Móc Kép (v5, tuần mới — OWNER duyệt 2026-10-05): dạy MÓC KÉP (4 nốt trong một phách
 * "Chạy-chạy-chạy-chạy"), "Chạy chạy-chạy" (móc đơn + 2 móc kép) và "Tập-tễnh" (móc đơn chấm + móc kép) — TRƯỚC mọi bài
 * có các nhịp này. Chuyên gia sư phạm: "Lý cây đa" từng ở tuần 2 (móc kép khi bé chưa học cả móc đơn) → nay ở đây,
 * nốt dễ (Đô Rê Mi) để bé dồn sức cho nhịp.
 * v5.1 (OWNER duyệt 2026-10-06, rà soát chuyên gia): một tuần dạy 4 nhịp mới là QUÁ TẢI → tách: nghịch phách & dây nối
 * (Xích lô, Bắc kim thang) sang tuần 19 MỚI "Phố Xích Lô". Bài "w18-l3"/"w18-bkt" cũ → "w19-l1"/"w19-bkt" (migrations.ts).
 * Tiêu chí: chơi trọn "Lý cây đa" theo nhịp — đạt ở 2 ngày khác nhau.
 */
export const WEEK18: WeekPlan = {
  week: 18,
  island: 'Suối Móc Kép',
  islandEmoji: '🏞️',
  title: 'Móc kép & Tập-tễnh',
  story: 'Ở Suối Móc Kép, nước chảy róc rách: bốn giọt nước rơi trong MỘT phách — "Chạy-chạy-chạy-chạy"! Thỏ con chạy thật nhanh, còn bạn cà nhắc đi "Tập-tễnh".',
  warmup: { variant: 'interval', pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'], rounds: 8, maxInterval: 5 },
  teach: { emoji: '👨‍🏫', text: 'Con đọc to cho bố/mẹ: "Chạy-chạy-chạy-chạy, Đi" rồi "Tập-tễnh, Đi" — vỗ tay theo.' },
  drills: ['thumb-under', 'five-finger'],
  criterion: { text: 'Chơi trọn "Lý cây đa" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Lý cây đa vang đúng nhịp "Chạy chạy-chạy" — 2 hôm nhé! 🌳',
  lessons: [
    {
      id: 'w18-l1',
      week: 18,
      title: 'Bốn giọt nước — móc kép',
      emoji: '💧',
      activities: [
        {
          kind: 'rhythm',
          title: 'Móc kép: Chạy-chạy-chạy-chạy',
          intro: 'Móc đơn "Chạy-chạy" = 2 nốt trong 1 phách. MÓC KÉP (hai gạch nối) = 4 nốt trong 1 phách: "Chạy-chạy-chạy-chạy". "Chạy chạy-chạy" = 1 móc đơn + 2 móc kép.',
          patterns: [
            ['run', 'run', 'walk', 'walk'],
            ['run4', 'walk', 'run4', 'walk'],
            ['run', 'run4', 'long'],
            ['run3', 'walk'],
            ['run3', 'run3'],
            ['run4', 'run3', 'long'],
          ],
        },
        { kind: 'song', songId: 'rabbit_run', mode: 'wait', hints: 'names', intro: 'Thỏ con chạy 4 nốt trong một phách! Chế độ chờ: đúng nốt trước, nhanh sau.' },
      ],
    },
    {
      id: 'w18-l2',
      week: 18,
      title: 'Thỏ con & Lý cây đa',
      emoji: '🌳',
      activities: [
        { kind: 'song', songId: 'rabbit_run', mode: 'tempo', level: 2, hints: 'names', intro: 'Bắt đầu chậm (40) — đọc to "Chạy-chạy-chạy-chạy" trong đầu.' },
        // Dân ca Việt Nam (OWNER yêu cầu 2026-10-05): chỉ Đô Rê Mi — v5: dời từ tuần 2 (sau khi học móc đơn & móc kép)
        { kind: 'song', songId: 'ly_cay_da', mode: 'wait', hints: 'names', intro: 'Dân ca quan họ Bắc Ninh, nhịp 2/4 — chỉ có Đô, Rê, Mi! Nhiều chỗ "Chạy chạy-chạy". Ô đầu có chỗ nghỉ: chờ một chút rồi mới đàn Đô.' },
        { kind: 'song', songId: 'ly_cay_da', mode: 'tempo', level: 2, hints: 'names' },
      ],
    },
    {
      // v5.1 — mã MỚI (mã "w18-l3" cũ là bài nghịch phách, nay "w19-l1"): dạy "Tập-tễnh" trước "Bắc kim thang" (tuần 19)
      id: 'w18-tt',
      week: 18,
      title: 'Tập-tễnh',
      emoji: '🦩',
      activities: [
        {
          kind: 'rhythm',
          title: 'Tập-tễnh',
          intro: '"Tập-tễnh" = móc đơn CHẤM (dài) + móc kép (ngắn) trong 1 phách — như bạn đi cà nhắc. Nhịp 2: mỗi mẫu 2 phách.',
          patterns: [
            ['dotted8', 'walk'],
            ['dotted8', 'run'],
            ['walk', 'dotted8'],
            ['dotted8', 'run3'],
          ],
        },
        { kind: 'song', songId: 'ly_cay_da', mode: 'tempo', level: 2, hints: 'names', intro: 'Lý cây đa theo nhịp — nhớ "Chạy chạy-chạy" nhé!' },
      ],
    },
  ],
};

/**
 * TUẦN 19 — Phố Xích Lô (v5.1, tuần MỚI tách từ tuần 18 — OWNER duyệt 2026-10-06): NGHỊCH PHÁCH "Chạy-Đi-chạy"
 * (nốt "Đi" vang giữa hai phách) và DÂY NỐI (vỗ một lần, giữ cho đủ hai nốt). Bài: "Xích lô dạo phố" (tự sáng tác)
 * và dân ca "Bắc kim thang" (ôn Tập-tễnh + móc kép của tuần 18). Mã bài giữ từ tuần 18 cũ: "w19-l1", "w19-bkt".
 * Tiêu chí: chơi trọn "Bắc kim thang" theo nhịp — đạt ở 2 ngày khác nhau (bài tổng hợp mọi nhịp nhanh của tuần 18–19).
 */
export const WEEK19: WeekPlan = {
  week: 19,
  island: 'Phố Xích Lô',
  islandEmoji: '🛺',
  title: 'Nghịch phách & dây nối',
  story: 'Xích lô đi dạo phố "Chạy-Đi-chạy": tiếng chuông kêu LỆCH phách, vui tai ghê! Còn dây nối thì giống sợi dây buộc hai nốt thành một.',
  warmup: { variant: 'interval', pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'], rounds: 8, maxInterval: 5 },
  teach: { emoji: '👨‍🏫', text: 'Con vỗ cho bố/mẹ "Chạy-Đi-chạy, Đi-i" rồi chỉ một dây nối: vỗ MẤY lần?' },
  drills: ['finger-tap', 'thumb-under'],
  criterion: { text: 'Chơi trọn "Bắc kim thang" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Bắc kim thang "Tập-tễnh" thật đều — đàn ngon 2 hôm nhé! 🎋',
  lessons: [
    {
      // Mã cũ "w18-l3" (rev 3) → "w19-l1" (progress/migrations.ts REV4_LESSON_MAP)
      id: 'w19-l1',
      week: 19,
      title: 'Nghịch phách & dây nối',
      emoji: '🛺',
      activities: [
        {
          kind: 'rhythm',
          title: 'Chạy-Đi-chạy & dây nối',
          intro: 'NGHỊCH PHÁCH "Chạy-Đi-chạy": nốt "Đi" vang giữa hai phách — vỗ ở "và". DÂY NỐI (đường cong nối hai nốt CÙNG cao độ): vỗ MỘT lần, giữ cho đủ cả hai nốt.',
          patterns: [
            ['sync', 'walk', 'walk'],
            ['walk', 'walk', 'sync'],
            ['sync', 'sync'],
            ['tie', 'walk', 'walk'],
            ['walk', 'tie', 'walk'],
            ['run', 'tie', 'run'],
          ],
        },
        { kind: 'song', songId: 'cyclo_ride', mode: 'wait', hints: 'names', intro: 'Xích lô đi "Chạy-Đi-chạy": nốt giữa dài hơn, vang lệch phách — nghe mẫu trước nhé!' },
        { kind: 'song', songId: 'cyclo_ride', mode: 'tempo', level: 2, hints: 'names' },
      ],
    },
    {
      // Mã cũ "w18-bkt" (rev 3) → "w19-bkt"; trò "Tập-tễnh" nay ở tuần 18 (w18-tt)
      id: 'w19-bkt',
      week: 19,
      title: 'Bắc kim thang',
      emoji: '🎋',
      activities: [
        // OWNER yêu cầu 2026-10-05: dân ca Việt Nam có "Tập-tễnh" & móc kép
        song('bac_kim_thang', 'wait', 2, 'names', 'Dân ca Nam Bộ! Có "Tập-tễnh" và "Chạy chạy-chạy". Bàn tay ngũ cung: Đô 1, Rê 2, Fa 3, Sol 4, La 5. Hai nốt dưới dấu luyến: đàn LIỀN.'),
        song('bac_kim_thang', 'tempo', 2, 'names'),
      ],
    },
    {
      id: 'w19-l3',
      week: 19,
      title: 'Xích lô băng chuyền · đọc nhạc',
      emoji: '🚦',
      activities: [
        { kind: 'song', songId: 'cyclo_ride', mode: 'tempo', level: 3, hints: 'names', intro: 'Băng chuyền: xích lô chạy về vạch đỏ — "Chạy-Đi-chạy"!' },
        { kind: 'sight', title: 'Đọc nhạc có móc đơn & chấm dôi', position: 'C', hand: 'RH', count: 2, rhythm: 2, hints: 'names' },
      ],
    },
  ],
};

export const WEEK20: WeekPlan = {
  week: 20,
  island: 'Thác Gam',
  islandEmoji: '🌊',
  title: 'Gam Đô trưởng — luồn ngón',
  story: 'Ở Thác Gam, nước chảy 8 bậc từ Đô đến Đô. Ngón cái LUỒN dưới bàn tay để đi tiếp — như con cá lặn qua!',
  leftHand: true,
  warmup: { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'], rounds: 8, reference: 'C4' },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ cách luồn ngón cái dưới ngón 3 khi đi lên gam.' },
  drills: ['thumb-under', 'wrist-circle'],
  criterion: { text: 'Chơi gam Đô trưởng hai tay (lần lượt) theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Cá lặn qua thác: gam tay phải và tay trái — 2 hôm nhé! 🐟',
  lessons: [
    {
      id: 'w20-l1',
      week: 20,
      title: 'Gam tay phải',
      emoji: '🌊',
      activities: [
        song('scale_c_rh', 'wait', 2, 'full', 'Đô Rê Mi (1-2-3) rồi LUỒN ngón cái xuống Fa!'),
        song('scale_c_rh', 'tempo'),
        // (2026-10-06) Dân ca Bắc Bộ đầy "Tập-tễnh" (tuần 18) — dịch xuống Đô trưởng: tay phải thế Đô, tay trái chỉ Sol (ngón cái)
        song('co_la', 'wait', 2, 'names', 'Cò lả — dân ca đồng bằng Bắc Bộ! Rất nhiều nhịp "Tập-tễnh" đã học ở tuần 18. Tay phải thế Đô (Đô 1, Rê 2, Mi 3, Sol 5); hai nốt Sol trầm là của tay trái (ngón cái). Bài bắt đầu bằng một nốt lấy đà.'),
      ],
    },
    pair('w20-l2', 20, 'Gam tay trái', '🌊', 'scale_c_lh', 'full', 'Tay trái đi lên: 5-4-3-2-1 rồi ngón 3 VẮT qua La.'),
    pair('w20-l3', 20, 'Niềm vui cho thế giới', '🎄', 'joy_to_the_world', 'full', 'Bài này chính là gam đi xuống!'),
  ],
};

export const WEEK21: WeekPlan = {
  week: 21,
  island: 'Nhà hát Cấp 2',
  islandEmoji: '🎭',
  title: 'Hòa nhạc Cấp 2',
  story: 'Nhà hát lớn đã mở cửa! Con chọn những bài hai tay hay nhất để biểu diễn.',
  leftHand: true,
  warmup: null,
  teach: { emoji: '🎤', text: 'Con giới thiệu bài và kể cho khán giả: bài này dùng thế tay nào?' },
  criterion: { text: 'Biểu diễn trọn vẹn — phụ huynh tặng huy chương Cấp 2', who: 'PARENT' },
  kidGoal: 'Lên sân khấu Nhà hát — nhận huy chương Cấp 2! 🏅',
  lessons: [
    {
      id: 'w21-l1',
      week: 21,
      title: 'Tổng ôn đọc nhạc',
      emoji: '📖',
      activities: [
        { kind: 'quiz', title: 'Đọc nốt khóa Sol 📖', intro: 'Thế Đô và thế Sol.', quiz: { variant: 'read', pool: ['C4', 'E4', 'G4', 'B4', 'D5'], rounds: 8 } },
        { kind: 'quiz', title: 'Đọc nốt khóa Fa 📖', intro: 'Tay trái.', quiz: { variant: 'read', pool: ['C3', 'E3', 'G3', 'A3', 'C4'], rounds: 8, clef: 'bass' } },
        { kind: 'sight', title: 'Đọc nhạc tổng hợp', position: 'G', hand: 'RH', count: 2, rhythm: 2, hints: 'names' },
      ],
    },
    { id: 'w21-stage', week: 21, title: 'Hòa nhạc Cấp 2', emoji: '🏅', isWeekTest: true, activities: [{ kind: 'stage', level: 2 }] },
  ],
};

export const LEVEL2_WEEKS: readonly WeekPlan[] = [WEEK11, WEEK12, WEEK13, WEEK14, WEEK15, WEEK16, WEEK17, WEEK18, WEEK19, WEEK20, WEEK21];
