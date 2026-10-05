import { chordTarget, notes, posEcho, posNote } from './targets';
import type { Activity, Lesson, WeekPlan } from './types';

/**
 * CẤP 3 — "Thành thạo" (tuần 21–30): hợp âm tay trái, dòng kẻ phụ & khuông lớn, đổi thế tay, trưởng/thứ,
 * đọc nốt cao Đô5–Sol5, đọc nhạc hai khóa, bài hai tay — rồi MỚI tới tác phẩm cổ điển giản lược (Minuet tuần 28,
 * Für Elise tuần 29), hòa nhạc lớn tuần 30.
 * v5 (OWNER duyệt 2026-10-05, chuyên gia sư phạm): nhịp độ cũ đưa Minuet/Für Elise tới sớm 6–9 tháng → dời xuống cuối
 * Cấp 3 sau 7 tuần chuẩn bị; thêm tuần 22 "Cầu Vạch Phụ" (dòng kẻ phụ + đọc khuông lớn hai tay) trước khi đọc nhạc hai khóa.
 * Mục tiêu cuối (nói thật với phụ huynh): ≈ hoàn thành Faber cấp 1 / đầu cấp 2.
 * Dữ liệu cũ (25 tuần) được đánh số lại trong progress/migrations.ts (bảng OLD→NEW).
 * Sau tuần 30: "Luyện tập mỗi ngày" (lessonEngine.dailyLesson) — không có điểm dừng.
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

export const WEEK21: WeekPlan = {
  week: 21,
  island: 'Rừng Hợp Âm',
  islandEmoji: '🌲',
  title: 'Hợp âm tay trái',
  story: 'Trong Rừng Hợp Âm, ba nốt cùng vang lên một lúc như ba cây cổ thụ. Hợp âm làm bài hát đầy đặn!',
  leftHand: true,
  // Đọc các nốt hợp âm tay trái (khóa Fa) — "vui/buồn" (trưởng/thứ) để dành tới tuần 24 mới dạy
  warmup: { variant: 'read', clef: 'bass', pool: ['C3', 'E3', 'G3', 'F3', 'A3', 'B2', 'D3'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ hợp âm Đô: ngón 5-3-1 tay trái trên Đô-Mi-Sol.' },
  criterion: { text: 'Chơi trọn "Bài ca niềm vui — hai tay hợp âm" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  lessons: [
    {
      id: 'w21-l1',
      week: 21,
      title: 'Ba hợp âm thần kỳ',
      emoji: '🎹',
      activities: [
        { kind: 'technique', title: 'Cánh tay rơi — ba ngón cùng xuống 🌈', drills: ['arm-drop', 'hand-shape'] },
        notes({
          id: 'w21-chords',
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
    trio('w21-l2', 21, 'Bài ca niềm vui — hợp âm', '🎶', 'ode_to_joy_chords'),
    trio('w21-l3', 21, 'Ngôi sao nhỏ — hợp âm', '⭐', 'twinkle_both'),
    trio('w21-l4', 21, 'Chuông ngân vang — hai tay', '🔔', 'jingle_bells_both'),
  ],
};

/**
 * TUẦN 22 — Cầu Vạch Phụ (v5, tuần mới — OWNER duyệt 2026-10-05): DÒNG KẺ PHỤ (La3, Si3 dưới khóa Sol; Đô4, Rê4 trên
 * khóa Fa; La5 trên khóa Sol) và đọc KHUÔNG LỚN (hai khóa cùng lúc) — trước "Ninja" thế La thứ (tuần 24), nốt cao (tuần 25)
 * và đọc nhạc hai khóa (tuần 26). Ba bài tự sáng tác mới: hai tay luân phiên trên khuông lớn, thế La thứ trên vạch phụ,
 * hai tay hợp âm (củng cố tuần 21). Sáng tác 4 ô nhịp.
 * Tiêu chí (APP): đọc nốt có dòng kẻ phụ đúng 8/10.
 */
export const WEEK22: WeekPlan = {
  week: 22,
  island: 'Cầu Vạch Phụ',
  islandEmoji: '🌁',
  title: 'Dòng kẻ phụ & khuông lớn',
  story: 'Năm sợi dây của khuông nhạc không đủ chỗ cho mọi nốt! Muốn đi xa hơn, nốt bắc thêm CẦU NHỎ — dòng kẻ phụ — ở trên hoặc dưới khuông.',
  leftHand: true,
  // Tiêu chí là đọc nốt (APP) → khởi động giữ đủ 10 lượt
  warmup: { variant: 'read', pool: ['A3', 'B3', 'C4', 'G5', 'A5'], rounds: 10 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ trên khuông cho bố/mẹ: Đô giữa có 1 vạch phụ, La dưới có 2 vạch phụ, La cao "đội" 1 vạch phụ ở trên.' },
  criterion: { text: 'Đọc nốt có dòng kẻ phụ đúng 8/10', who: 'APP' },
  lessons: [
    {
      id: 'w22-l1',
      week: 22,
      title: 'Cầu nhỏ dưới khuông',
      emoji: '🌁',
      activities: [
        { kind: 'technique', title: 'Năm ngón qua cầu 🖐', drills: ['five-finger', 'thumb-under'] },
        notes({
          id: 'w22-ledger',
          step: 'Bài mới',
          title: 'Dòng kẻ phụ dưới khóa Sol',
          intro: 'Đếm từ Đô giữa đi xuống: Đô giữa nằm TRÊN 1 vạch phụ, Si treo DƯỚI vạch phụ đó, La nằm trên vạch phụ THỨ HAI. Tay phải thế La thứ: La 1, Si 2, Đô 3.',
          targets: [
            posNote('C4', 'RH', 'Am', 'Đô giữa — 1 vạch phụ'),
            posNote('B3', 'RH', 'Am', 'Si — treo dưới vạch phụ'),
            posNote('A3', 'RH', 'Am', 'La — trên vạch phụ thứ 2'),
            posNote('B3', 'RH', 'Am'),
            posNote('C4', 'RH', 'Am'),
          ],
        }),
        // KHÔNG đặt trò "Nốt mốc" ở tuần này: câu trả lời của trò nốt mốc cũng là tên nốt → sẽ lẫn vào tiêu chí APP
        // "đọc nốt vạch phụ 8/10" (lessonEngine.weekPassed). Quy tắc chung: tuần có tiêu chí APP theo tên nốt không có trò nốt mốc.
      ],
    },
    {
      id: 'w22-l2',
      week: 22,
      title: 'Khuông lớn — hai khóa',
      emoji: '🎼',
      activities: [
        {
          kind: 'quiz',
          title: 'Vạch phụ trên khóa Fa 📖',
          intro: 'Khóa Fa đi LÊN qua vạch phụ: Si ở khe trên cùng, Đô giữa trên 1 vạch phụ, Rê treo trên vạch phụ đó. Đô giữa của khóa Fa và khóa Sol là CÙNG một phím!',
          quiz: { variant: 'read', pool: ['A3', 'B3', 'C4', 'D4'], rounds: 8, clef: 'bass' },
        },
        song('grand_duet', 'wait', 2, 'names', 'KHUÔNG LỚN: khóa Sol ở trên cho tay phải, khóa Fa ở dưới cho tay trái — nối với nhau bằng Đô giữa. Hai tay thay nhau hát.'),
        song('grand_duet', 'tempo', 2, 'names'),
      ],
    },
    {
      id: 'w22-l3',
      week: 22,
      title: 'Bước qua vạch phụ',
      emoji: '🪨',
      activities: [
        song('stepping_stones', 'wait', 2, 'names', 'Thế La thứ tay phải: ngón 1 ở La dưới Đô giữa. Nốt nào có vạch phụ — đếm từ Đô giữa xuống nhé!'),
        song('stepping_stones', 'tempo', 2, 'names'),
        { kind: 'sight', title: 'Đọc nhạc thế Đô giữa — tay trái', position: 'MC', hand: 'LH', count: 2, hints: 'names' },
      ],
    },
    {
      id: 'w22-l4',
      week: 22,
      title: 'Rước đèn · sáng tác',
      emoji: '🏮',
      activities: [
        song('lantern_parade', 'wait', 2, 'names', 'Tay phải hát, tay trái đệm hợp âm Đô (I) và Sol (V) như tuần trước. Đèn ông sao đi TO (f) rồi xa dần NHỎ (p).'),
        song('lantern_parade', 'tempo', 2, 'names'),
        {
          kind: 'improv',
          title: 'Con là nhạc sĩ ✍️',
          intro: 'Sáng tác 4 ô nhịp ở thế Đô tay phải — lần này thử bắt đầu bằng một nốt KHÁC Đô và kết thúc ở Đô. App ghi lại thành bài của con.',
          mode: 'compose',
          position: 'C',
          bars: 4,
        },
      ],
    },
  ],
};

export const WEEK23: WeekPlan = {
  week: 23,
  island: 'Biển Đổi Thế',
  islandEmoji: '⛵',
  title: 'Đổi thế tay',
  story: 'Trên Biển Đổi Thế, bàn tay như con thuyền: dời sang chỗ mới mà vẫn chèo êm.',
  // Ôn dòng kẻ phụ (tuần 22) La3, Si3 — dùng ở La thứ tuần 24 — và đọc trước Mi5–Sol5 (tuần 25 nốt cao, Minuet tuần 28)
  warmup: { variant: 'read', pool: ['A3', 'B3', 'C4', 'E4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'], rounds: 8 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ chỗ trong bài phải dời tay, và dời bằng ngón nào.' },
  criterion: { text: 'Chơi trọn "Đêm thánh vô cùng" — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  lessons: [
    { id: 'w23-l1', week: 23, title: 'Đọc nhạc nhiều thế · Lý ngựa ô', emoji: '📖', activities: [
      { kind: 'technique', title: 'Cá lặn — luồn ngón cái 🐟', drills: ['thumb-under', 'wrist-circle'] },
      { kind: 'sight', title: 'Đọc nhạc thế Đô', position: 'C', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
      { kind: 'sight', title: 'Đọc nhạc thế Sol', position: 'G', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
      // Dân ca Việt Nam (OWNER yêu cầu 2026-10-05): hai tay luân phiên (bàn tay mở rộng Rê–Đô cao quá rộng cho bé)
      song('ly_ngua_o', 'wait', 2, 'names', 'Dân ca Nam Bộ, nhịp 2/4! Hai tay thay nhau: tay trái "Rê Fa Rê Fa" (ngón 3 và ngón cái), tay phải thế Sol: Sol 1, La 2, Đô cao 4. Bài bắt đầu bằng hai nốt lấy đà.'),
    ] },
    trio('w23-l2', 23, 'Đêm thánh vô cùng', '🌟', 'silent_night', 'Nhịp 3, có chấm dôi và dời tay ở câu 3.'),
  ],
};

export const WEEK24: WeekPlan = {
  week: 24,
  island: 'Thung lũng Vui Buồn',
  islandEmoji: '🌗',
  title: 'Trưởng & thứ',
  story: 'Ở Thung lũng Vui Buồn, cùng một bài hát có thể nghe VUI (giọng trưởng) hoặc BUỒN (giọng thứ).',
  warmup: { variant: 'majorminor', pool: ['C4', 'D4', 'F4', 'G4'], rounds: 10 },
  teach: { emoji: '👨‍🏫', text: 'Con đàn cho bố/mẹ nghe Đô-Mi-Sol (vui) rồi Đô-Mi♭-Sol (buồn).' },
  criterion: { text: 'Trò "Vui hay buồn?" đúng 8/10', who: 'APP' },
  lessons: [
    {
      id: 'w24-l1',
      week: 24,
      title: 'Vui hay buồn?',
      emoji: '🌗',
      activities: [
        { kind: 'technique', title: 'Năm ngón vui – buồn 🖐', drills: ['five-finger', 'finger-tap'] },
        { kind: 'quiz', title: 'Vui hay buồn? 😊😢', intro: 'App rải một hợp âm — nghe VUI hay BUỒN?', quiz: { variant: 'majorminor', pool: ['C4', 'D4', 'F4', 'G4'], rounds: 10 } },
        {
          kind: 'quiz',
          title: 'Đọc nốt thấp & cao 📖',
          intro: 'La, Si nằm DƯỚI Đô giữa (dòng kẻ phụ — con đã học ở Cầu Vạch Phụ) — dùng trong bài La thứ. Mi, Fa, Sol cao ở trên khuông — tuần sau mình leo Tháp Nốt Cao!',
          quiz: { variant: 'read', pool: ['A3', 'B3', 'C4', 'D5', 'E5', 'F5', 'G5'], rounds: 8 },
        },
        song('frere_jacques_minor', 'tempo', 2, 'names'),
      ],
    },
    // OWNER duyệt 2026-10-05: thay "Bài ca niềm vui — La thứ" (bài lặp) bằng bài tự sáng tác giọng La thứ
    trio('w24-ninja', 24, 'Ninja rón rén', '🥷', 'ninja_tiptoe', 'Thế La thứ: ngón 1 ở La dưới Đô giữa. Ninja đi NHỎ (p) và NGẮT — chỉ ô cuối mới hét TO (f)!'),
  ],
};

export const WEEK25: WeekPlan = {
  week: 25,
  island: 'Tháp Nốt Cao',
  islandEmoji: '🗼',
  title: 'Đọc nốt cao Đô5–Sol5',
  story: 'Leo lên Tháp Nốt Cao! Ở trên đỉnh khuông nhạc có năm bạn nốt cao: Đô, Rê, Mi, Fa, Sol. Mai kia các bạn ấy sẽ nhảy Minuet cùng con ở Cung điện!',
  // Tiêu chí là đọc nốt (APP) → khởi động giữ đủ 10 lượt, chỉ các nốt cao
  warmup: { variant: 'read', pool: ['C5', 'D5', 'E5', 'F5', 'G5'], rounds: 10 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ trên khuông cho bố/mẹ: Đô cao ở khe 3, Mi cao ở khe trên cùng, Fa cao trên vạch trên cùng, Sol cao ngồi trên đỉnh khuông.' },
  criterion: { text: 'Đọc nốt cao Đô5–Sol5 đúng 8/10', who: 'APP' },
  lessons: [
    {
      id: 'w25-l1',
      week: 25,
      title: 'Năm nốt cao',
      emoji: '🗼',
      activities: [
        { kind: 'technique', title: 'Tay tròn trên cao 🗼', drills: ['hand-shape', 'five-finger'] },
        notes({
          id: 'w25-c5',
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
          id: 'w25-c5-echo',
          step: 'Nhại lại',
          title: 'Con vẹt trên tháp 🦜',
          intro: 'Nghe rồi đàn lại ở thế Đô cao.',
          targets: [posEcho(['C5', 'D5', 'E5'], 'RH', 'C5'), posEcho(['G5', 'F5', 'E5'], 'RH', 'C5'), posEcho(['C5', 'E5', 'G5'], 'RH', 'C5')],
        }),
      ],
    },
    trio('w25-l2', 25, 'Thuyền trôi', '⛵', 'drifting_boat', 'Thế Đô cao, nhịp 3. Dấu luyến dài: đàn LIỀN và NHỎ (p) như thuyền trôi êm.'),
    {
      id: 'w25-l3',
      week: 25,
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

export const WEEK26: WeekPlan = {
  week: 26,
  island: 'Thư viện Lớn',
  islandEmoji: '🏛️',
  title: 'Đọc nhạc hai khóa',
  story: 'Thư viện Lớn có hàng nghìn bản nhạc. Ai đọc được cả khóa Sol và khóa Fa thì mở được mọi cuốn sách!',
  leftHand: true,
  warmup: { variant: 'read', pool: ['C3', 'E3', 'G3', 'A3', 'C4'], rounds: 8, clef: 'bass' },
  teach: { emoji: '👨‍🏫', text: 'Con đọc to tên 5 nốt bất kỳ trên khuông cho bố/mẹ kiểm tra.' },
  criterion: { text: 'Đọc nhạc ngẫu nhiên: 5 đoạn đạt, trong ít nhất 2 ngày', who: 'PARENT/MIC' },
  lessons: [
    { id: 'w26-l1', week: 26, title: 'Đọc nhạc chỉ nhìn khuông', emoji: '👀', activities: [
        { kind: 'technique', title: 'Cá lặn — luồn ngón cái 🐟', drills: ['thumb-under', 'five-finger'] },
      { kind: 'sight', title: 'Tay phải — khóa Sol', position: 'C', hand: 'RH', count: 3, rhythm: 2, hints: 'staff' },
      { kind: 'sight', title: 'Tay trái — khóa Fa', position: 'C', hand: 'LH', count: 2, rhythm: 2, hints: 'staff' },
      // Dân ca Việt Nam (OWNER yêu cầu 2026-10-05): giai điệu đi qua cả hai khóa, hai tay luân phiên
      song('ly_cay_bong', 'wait', 2, 'names', 'Dân ca Nam Bộ! Giai điệu đi từ khóa Sol xuống khóa Fa: nốt cao tay phải, nốt thấp tay trái — hai tay thay nhau hát, không đàn cùng lúc.'),
    ] },
    trio('w26-l2', 26, 'Khúc Canon', '🎻', 'canon', 'Hai tay, mỗi nốt 2 phách — đàn thật êm.'),
    {
      id: 'w26-l3',
      week: 26,
      title: 'Đọc quãng · sáng tác thế Sol',
      emoji: '✍️',
      activities: [
        {
          kind: 'quiz',
          title: 'Quãng nào đây? 🐸',
          intro: 'Khuông hiện HAI nốt: đếm vạch + khe để biết quãng 2, 3, 4 hay 5 — và đi lên hay đi xuống.',
          quiz: { variant: 'interval', pool: ['G4', 'A4', 'B4', 'C5', 'D5'], rounds: 8, maxInterval: 5 },
        },
        {
          kind: 'improv',
          title: 'Con là nhạc sĩ ✍️',
          intro: 'Sáng tác 4 ô nhịp ở thế Sol (ngón cái ở Sol). Thử một bước nhảy xa (quãng 4 hoặc 5) rồi đi bậc về Sol!',
          mode: 'compose',
          position: 'G',
          bars: 4,
        },
      ],
    },
  ],
};

export const WEEK27: WeekPlan = {
  week: 27,
  island: 'Đỉnh Hai Tay',
  islandEmoji: '🏔️',
  title: 'Bài hai tay hoàn chỉnh',
  story: 'Sắp tới đỉnh rồi! Hai tay giờ đã thành đôi bạn thân: một tay hát, một tay đệm.',
  leftHand: true,
  warmup: { variant: 'majorminor', pool: ['C4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố/mẹ đệm hợp âm Đô – Fa – Sol bằng tay trái.' },
  criterion: { text: 'Chơi trọn "Các thánh tiến bước — hai tay" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  lessons: [trio('w27-l1', 27, 'Các thánh tiến bước — hai tay', '🎺', 'saints_both'), trio('w27-l2', 27, 'Ô Susanna — hai tay', '🪕', 'oh_susanna_both', 'Tay phải hát, tay trái đệm hợp âm Đô – Sol.')],
};

export const WEEK28: WeekPlan = {
  week: 28,
  island: 'Cung điện Minuet',
  islandEmoji: '👑',
  title: 'Minuet Sol trưởng',
  story: 'Trong Cung điện, các quý tộc nhảy điệu Minuet nhẹ nhàng. Bản nhạc này đã gần 300 tuổi!',
  // v5: Minuet có nhiều bước nhảy quãng 4–5 → khởi động đọc QUÃNG tới quãng 5 ở thế Sol
  warmup: { variant: 'interval', pool: ['G4', 'A4', 'B4', 'C5', 'D5'], rounds: 8, maxInterval: 5 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố/mẹ chỗ có Fa thăng trong Minuet.' },
  criterion: { text: 'Chơi trọn Minuet Sol trưởng (8 ô nhịp) — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  lessons: [
    { id: 'w28-l1', week: 28, title: 'Minuet — từng câu', emoji: '👑', activities: [
        { kind: 'technique', title: 'Ngón nhẹ như múa 💃', drills: ['finger-tap', 'thumb-under'] },
        song('minuet_g', 'wait', 2, 'full', 'Tập từng câu một — chọn "Câu 1" rồi "Câu 2". Bốn nốt móc đơn dưới dấu luyến: đàn LIỀN; hai nốt Sol có chấm: đàn NGẮT.')] },
    trio('w28-l2', 28, 'Minuet — cả bài', '💃', 'minuet_g'),
  ],
};

export const WEEK29: WeekPlan = {
  week: 29,
  island: 'Vườn Beethoven',
  islandEmoji: '🌹',
  title: 'Für Elise',
  story: 'Beethoven viết "Für Elise" tặng một người bạn. Giai điệu "Mi – Rê thăng – Mi" nổi tiếng khắp thế giới.',
  warmup: { variant: 'read', pool: ['A4', 'B4', 'C5', 'D5', 'E5'], rounds: 8 },
  teach: { emoji: '👨‍🏫', text: 'Con đàn cho bố/mẹ 5 nốt đầu "Mi – Rê♯ – Mi – Rê♯ – Mi" và chỉ phím Rê thăng.' },
  criterion: { text: 'Chơi trọn đoạn mở đầu Für Elise — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  lessons: [
    { id: 'w29-l1', week: 29, title: 'Für Elise — từng câu', emoji: '🌹', activities: [
        { kind: 'technique', title: 'Cổ tay mềm 🌀', drills: ['wrist-circle', 'five-finger'] },
        song('fur_elise', 'wait', 2, 'full')] },
    trio('w29-l2', 29, 'Für Elise — cả đoạn', '🎼', 'fur_elise'),
  ],
};

export const WEEK30: WeekPlan = {
  week: 30,
  island: 'Đại hòa nhạc',
  islandEmoji: '🎆',
  title: 'Đại hòa nhạc',
  story: 'Pháo hoa đã sẵn sàng! Đây là buổi hòa nhạc lớn nhất — con là nghệ sĩ piano thật sự.',
  leftHand: true,
  warmup: null,
  teach: { emoji: '🎤', text: 'Con kể cho khán giả nghe hành trình 30 tuần học đàn của con.' },
  criterion: { text: 'Đại hòa nhạc — phụ huynh trao huy chương vàng', who: 'PARENT' },
  lessons: [{ id: 'w30-stage', week: 30, title: 'Đại hòa nhạc', emoji: '🏆', isWeekTest: true, activities: [{ kind: 'stage', level: 3 }] }],
};

export const LEVEL3_WEEKS: readonly WeekPlan[] = [WEEK21, WEEK22, WEEK23, WEEK24, WEEK25, WEEK26, WEEK27, WEEK28, WEEK29, WEEK30];
