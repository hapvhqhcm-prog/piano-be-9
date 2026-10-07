import { chordTarget, notes, posEcho, posNote } from './targets';
import type { Activity, Lesson, WeekPlan } from './types';

/**
 * CẤP 3 — "Thành thạo" (tuần 22–31; v5.1: +1 sau khi tách tuần 18): hợp âm tay trái, dòng kẻ phụ & khuông lớn, đổi thế tay,
 * trưởng/thứ, đọc nốt cao Đô5–Sol5, đọc nhạc hai khóa, bài hai tay — rồi MỚI tới tác phẩm cổ điển giản lược (Minuet tuần 29,
 * Für Elise tuần 30), hòa nhạc lớn tuần 31.
 * v5 (OWNER duyệt 2026-10-05, chuyên gia sư phạm): nhịp độ cũ đưa Minuet/Für Elise tới sớm 6–9 tháng → dời xuống cuối
 * Cấp 3 sau 7 tuần chuẩn bị; thêm tuần "Cầu Vạch Phụ" (nay tuần 23: dòng kẻ phụ + đọc khuông lớn hai tay) trước khi đọc nhạc hai khóa.
 * v5.1 (OWNER duyệt 2026-10-06 — buổi ≤ 7 màn, ≤ ~12 phút): bỏ bộ ba lượt "chờ → theo nhịp → băng chuyền" trong MỘT bài —
 * lượt băng chuyền (Mức 3) dời sang bài SAU của tuần (nếu buổi đó vẫn ≤ ~12 phút) hoặc để "Luyện tập mỗi ngày" (bài đã thuộc
 * được ôn ở Mức 3). Bài hai tay cùng lúc chính của tuần: TÁCH TAY sẵn trên MỘT CÂU KHÓ (chờ tay phải → chờ tay trái → hai tay cả bài).
 * Mục tiêu cuối (nói thật với phụ huynh): ≈ hoàn thành Faber cấp 1 / đầu cấp 2.
 * Dữ liệu cũ được đánh số lại trong progress/migrations.ts (bảng OLD→NEW, rev 3 → 4: tuần ≥ 19 +1).
 * Sau tuần 31: "Luyện tập mỗi ngày" (lessonEngine.dailyLesson) — không có điểm dừng.
 */

const song = (songId: string, mode: 'wait' | 'tempo', level: 2 | 3 = 2, hints: 'full' | 'names' | 'staff' = 'names', intro?: string): Activity => ({
  kind: 'song',
  songId,
  mode,
  level,
  hints,
  intro,
});

/** Hai lượt: chế độ chờ → theo nhịp Mức 2 (v5.1: thay "trio" ba lượt — lượt băng chuyền dời đi, xem đầu tệp). */
const pair = (id: string, week: number, title: string, emoji: string, songId: string, intro?: string): Lesson => ({
  id,
  week,
  title,
  emoji,
  activities: [song(songId, 'wait', 2, 'names', intro), song(songId, 'tempo', 2, 'names')],
});

/** Lượt băng chuyền (Mức 3, chỉ nhìn khuông) của bài đã tập ở bài TRƯỚC trong tuần. */
const conveyor = (songId: string): Activity =>
  song(songId, 'tempo', 3, 'staff', 'Băng chuyền: bài hôm trước — nốt chạy về vạch đỏ, chỉ nhìn khuông nhé!');

/**
 * v5.1 — TÁCH TAY có sẵn trong bài (bài hai tay cùng lúc chính của tuần). OWNER duyệt 2026-10-06 sau buổi bé chơi thử:
 * tách tay chỉ trên MỘT CÂU KHÓ (`phrase`, câu thứ `phraseNo` — nhiều nốt / bước nhảy nhất) → chờ TAY PHẢI câu đó →
 * chờ TAY TRÁI câu đó → HAI TAY cả bài (chờ, rồi theo nhịp nếu `tempo`).
 * Lượt một tay / một câu KHÔNG tính cho tiêu chí tuần (lessonEngine.passedWhole bỏ lượt có `hand` hoặc `phrase`).
 */
const handsApart = (
  id: string,
  week: number,
  title: string,
  emoji: string,
  songId: string,
  phrase: [number, number],
  phraseNo: number,
  intro?: string,
  tempo = true,
): Lesson => ({
  id,
  week,
  title,
  emoji,
  activities: [
    { kind: 'song', songId, mode: 'wait', level: 2, hints: 'names', hand: 'RH', phrase, intro: `Câu ${phraseNo} — câu khó nhất. ${intro ?? 'Tay phải trước: chỉ giai điệu thôi!'}` },
    { kind: 'song', songId, mode: 'wait', level: 2, hints: 'names', hand: 'LH', phrase, intro: `Câu ${phraseNo}. Giờ tay trái: chỉ phần đệm — tay phải nghỉ.` },
    song(songId, 'wait', 2, 'names', 'Ghép HAI TAY cả bài — chậm thôi, đúng trước nhanh sau!'),
    ...(tempo ? [song(songId, 'tempo', 2, 'names')] : []),
  ],
});

export const WEEK22: WeekPlan = {
  week: 22,
  island: 'Rừng Hợp Âm',
  islandEmoji: '🌲',
  title: 'Hợp âm tay trái',
  story: 'Trong Rừng Hợp Âm, ba nốt cùng vang lên một lúc như ba cây cổ thụ. Hợp âm làm bài hát đầy đặn!',
  leftHand: true,
  // Đọc các nốt hợp âm tay trái (khóa Fa) — "vui/buồn" (trưởng/thứ) để dành tới tuần 25 mới dạy
  warmup: { variant: 'read', clef: 'bass', pool: ['C3', 'E3', 'G3', 'F3', 'A3', 'B2', 'D3'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố mẹ hợp âm Đô: ngón 5 – 3 – 1 tay trái trên Đô – Mi – Sol.' },
  drills: ['arm-drop', 'hand-shape'],
  criterion: { text: 'Chơi trọn "Bài ca niềm vui — hai tay hợp âm" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Ba cây hợp âm: Bài ca niềm vui hai tay theo nhịp — 2 hôm nhé! 🌲',
  lessons: [
    {
      id: 'w22-l1',
      week: 22,
      title: 'Ba hợp âm thần kỳ',
      emoji: '🎹',
      activities: [
        notes({
          id: 'w22-chords',
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
    // Câu 2 (ô 5–8): tay trái đổi hợp âm nhiều hơn câu 1
    handsApart('w22-l2', 22, 'Bài ca niềm vui — hợp âm', '🎶', 'ode_to_joy_chords', [4, 8], 2, 'Tay phải trước: giai điệu "Bài ca niềm vui" quen thuộc.'),
    {
      id: 'w22-l3',
      week: 22,
      title: 'Ngôi sao nhỏ — hợp âm',
      emoji: '⭐',
      activities: [conveyor('ode_to_joy_chords'), song('twinkle_both', 'wait'), song('twinkle_both', 'tempo')],
    },
    pair('w22-l4', 22, 'Chuông ngân vang — hai tay', '🔔', 'jingle_bells_both'),
  ],
};

/**
 * TUẦN 23 (v5.1; tuần 22 ở v5) — Cầu Vạch Phụ (v5, tuần mới — OWNER duyệt 2026-10-05): DÒNG KẺ PHỤ (La3, Si3 dưới khóa Sol;
 * Đô4, Rê4 trên khóa Fa; La5 trên khóa Sol) và đọc KHUÔNG LỚN (hai khóa cùng lúc) — trước "Ninja" thế La thứ (tuần 25),
 * nốt cao (tuần 26) và đọc nhạc hai khóa (tuần 27). Ba bài tự sáng tác mới: hai tay luân phiên trên khuông lớn, thế La thứ
 * trên vạch phụ, hai tay hợp âm (củng cố tuần 22). Sáng tác 4 ô nhịp.
 * Tiêu chí (APP): đọc nốt có dòng kẻ phụ đúng ≥ 5/6 (một buổi) ở 2 ngày + một lượt ĐỌC NHẠC thế La thứ (qua vạch phụ) đạt (v5.1).
 */
export const WEEK23: WeekPlan = {
  week: 23,
  island: 'Cầu Vạch Phụ',
  islandEmoji: '🌁',
  title: 'Dòng kẻ phụ & khuông lớn',
  story: 'Năm sợi dây của khuông nhạc không đủ chỗ cho mọi nốt! Muốn đi xa hơn, nốt bắc thêm CẦU NHỎ — dòng kẻ phụ — ở trên hoặc dưới khuông.',
  leftHand: true,
  // Tiêu chí là đọc nốt (APP) → khởi động là bài chấm: 6 lượt, mọi nốt đều có dòng kẻ phụ (v5.1: ≥ 5/6)
  warmup: { variant: 'read', pool: ['A3', 'B3', 'C4', 'G5', 'A5'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ trên khuông cho bố mẹ: Đô giữa có 1 vạch phụ, La dưới có 2 vạch phụ, La cao "đội" 1 vạch phụ ở trên.' },
  drills: ['five-finger', 'thumb-under'],
  criterion: { text: 'Đọc nốt có dòng kẻ phụ đúng ít nhất 5/6 trong một buổi, ở 2 ngày khác nhau + một lượt đọc nhạc qua vạch phụ đạt', who: 'APP' },
  kidGoal: 'Qua Cầu Vạch Phụ: đọc đúng 5 nốt trong 6 — 2 hôm, thêm một bài đọc nhạc nhé! 🌁',
  lessons: [
    {
      id: 'w23-l1',
      week: 23,
      title: 'Cầu nhỏ dưới khuông · sáng tác',
      emoji: '🌁',
      activities: [
        notes({
          id: 'w23-ledger',
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
        // "đọc nốt vạch phụ ≥ 5/6" (lessonEngine.weekPassed). Quy tắc chung: tuần có tiêu chí APP theo tên nốt không có trò nốt mốc.
        // v5.1: trò sáng tác dời từ bài "Rước đèn" sang đây (bài đó nay tập tách tay — buổi ≤ 7 màn)
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
    {
      id: 'w23-l2',
      week: 23,
      title: 'Khuông lớn — hai khóa',
      emoji: '🎼',
      activities: [
        {
          kind: 'quiz',
          title: 'Vạch phụ trên khóa Fa 📖',
          intro: 'Khóa Fa đi LÊN qua vạch phụ: Si ở khe trên cùng, Đô giữa trên 1 vạch phụ, Rê treo trên vạch phụ đó. Đô giữa của khóa Fa và khóa Sol là CÙNG một phím!',
          quiz: { variant: 'read', pool: ['A3', 'B3', 'C4', 'D4'], rounds: 6, clef: 'bass' },
        },
        song('grand_duet', 'wait', 2, 'names', 'KHUÔNG LỚN: khóa Sol ở trên cho tay phải, khóa Fa ở dưới cho tay trái — nối với nhau bằng Đô giữa. Hai tay thay nhau hát.'),
        song('grand_duet', 'tempo', 2, 'names'),
      ],
    },
    {
      id: 'w23-l3',
      week: 23,
      title: 'Bước qua vạch phụ',
      emoji: '🪨',
      activities: [
        song('stepping_stones', 'wait', 2, 'names', 'Thế La thứ tay phải: ngón 1 ở La dưới Đô giữa. Nốt nào có vạch phụ — đếm từ Đô giữa xuống nhé!'),
        song('stepping_stones', 'tempo', 2, 'names'),
        // v5.1 — tiêu chí tuần cần một lượt đọc nhạc QUA VẠCH PHỤ đạt: thế La thứ tay phải (La3–Mi4, dưới khóa Sol)
        { kind: 'sight', title: 'Đọc nhạc qua vạch phụ — thế La thứ', position: 'Am', hand: 'RH', count: 2, hints: 'names' },
      ],
    },
    // v5.1: bài hai tay cùng lúc của tuần → tách tay sẵn (sáng tác dời sang bài 1)
    // Câu 1 (ô 1–4): tay phải nhiều bước nhảy nhất cả bài
    handsApart('w23-l4', 23, 'Rước đèn', '🏮', 'lantern_parade', [0, 4], 1, 'Tay phải hát trước. Đèn ông sao đi TO (f) rồi xa dần NHỎ (p).'),
  ],
};

export const WEEK24: WeekPlan = {
  week: 24,
  island: 'Biển Đổi Thế',
  islandEmoji: '⛵',
  title: 'Đổi thế tay',
  story: 'Trên Biển Đổi Thế, bàn tay như con thuyền: dời sang chỗ mới mà vẫn chèo êm.',
  // Ôn dòng kẻ phụ (tuần 23) La3, Si3 — dùng ở La thứ tuần 25 — và đọc trước Mi5–Sol5 (tuần 26 nốt cao, Minuet tuần 29)
  warmup: { variant: 'read', pool: ['A3', 'B3', 'C4', 'E4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố mẹ chỗ trong bài phải dời tay, và dời bằng ngón nào.' },
  drills: ['thumb-under', 'wrist-circle'],
  criterion: { text: 'Chơi trọn "Đêm thánh vô cùng" THEO NHỊP (tốc độ từ 50 trở lên) — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Đêm thánh vô cùng theo nhịp — 2 hôm nhé! 🌟',
  lessons: [
    { id: 'w24-l1', week: 24, title: 'Đọc nhạc nhiều thế', emoji: '📖', activities: [
      { kind: 'sight', title: 'Đọc nhạc thế Đô', position: 'C', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
      { kind: 'sight', title: 'Đọc nhạc thế Sol', position: 'G', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
    ] },
    pair('w24-l2', 24, 'Đêm thánh vô cùng', '🌟', 'silent_night', 'Nhịp 3, có chấm dôi và dời tay ở câu 3.'),
    // Dân ca Việt Nam (OWNER yêu cầu 2026-10-05; 2026-10-06: BẢN ĐẦY ĐỦ SGK Âm nhạc 9 — dài gấp 3 bản cũ nên tách khỏi w24-l1
    // để buổi học vẫn ≤ 12 phút): hai tay luân phiên theo âm vực
    { id: 'w24-ngua', week: 24, title: 'Lý ngựa ô', emoji: '🐎', activities: [
      song('ly_ngua_o', 'wait', 2, 'names', 'Dân ca Nam Bộ, nhịp 2/4 — bản đầy đủ! Hai tay thay nhau: tay phải thế Sol (Sol 1, La 2, Si 3, Rê cao 5), tay trái Mi 1, Rê 2, Đô 3, La trầm 5. Bài bắt đầu bằng hai nốt lấy đà; đoạn cuối nhắc lại một lần.'),
    ] },
  ],
};

export const WEEK25: WeekPlan = {
  week: 25,
  island: 'Thung lũng Vui Buồn',
  islandEmoji: '🌗',
  title: 'Trưởng & thứ',
  story: 'Ở Thung lũng Vui Buồn, cùng một bài hát có thể nghe VUI (giọng trưởng) hoặc BUỒN (giọng thứ).',
  warmup: { variant: 'majorminor', pool: ['C4', 'D4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con đàn cho bố mẹ nghe Đô – Mi – Sol (vui) rồi Đô – Mi giáng – Sol (buồn).' },
  drills: ['five-finger', 'finger-tap'],
  criterion: { text: 'Trò "Vui hay buồn?" đúng ít nhất 5/6 trong một buổi — ở 2 ngày khác nhau', who: 'APP' },
  kidGoal: 'Nghe vui hay buồn đúng 5 lần trong 6 — 2 hôm nhé! 🌗',
  lessons: [
    {
      id: 'w25-l1',
      week: 25,
      title: 'Vui hay buồn?',
      emoji: '🌗',
      activities: [
        { kind: 'quiz', title: 'Vui hay buồn? 😊😢', intro: 'App rải một hợp âm — nghe VUI hay BUỒN?', quiz: { variant: 'majorminor', pool: ['C4', 'D4', 'F4', 'G4'], rounds: 6 } },
        {
          kind: 'quiz',
          title: 'Đọc nốt thấp & cao 📖',
          intro: 'La, Si nằm DƯỚI Đô giữa, trên dòng kẻ phụ. Mi, Fa, Sol cao nằm trên khuông — tuần sau mình leo Tháp Nốt Cao!',
          quiz: { variant: 'read', pool: ['A3', 'B3', 'C4', 'D5', 'E5', 'F5', 'G5'], rounds: 6 },
        },
        song('frere_jacques_minor', 'tempo', 2, 'names'),
      ],
    },
    // OWNER duyệt 2026-10-05: thay "Bài ca niềm vui — La thứ" (bài lặp) bằng bài tự sáng tác giọng La thứ
    pair('w25-ninja', 25, 'Ninja rón rén', '🥷', 'ninja_tiptoe', 'Thế La thứ: ngón 1 ở La dưới Đô giữa. Ninja đi NHỎ (p) và NGẮT — chỉ ô cuối mới hét TO (f)!'),
  ],
};

export const WEEK26: WeekPlan = {
  week: 26,
  island: 'Tháp Nốt Cao',
  islandEmoji: '🗼',
  title: 'Đọc nốt cao: Đô cao đến Sol cao',
  story: 'Leo lên Tháp Nốt Cao! Ở trên đỉnh khuông nhạc có năm bạn nốt cao: Đô, Rê, Mi, Fa, Sol. Mai kia các bạn ấy sẽ nhảy Minuet cùng con ở Cung điện!',
  // Tiêu chí là đọc nốt (APP) → khởi động là bài chấm: 6 lượt, chỉ các nốt cao (v5.1: ≥ 5/6)
  warmup: { variant: 'read', pool: ['C5', 'D5', 'E5', 'F5', 'G5'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ trên khuông cho bố mẹ: Đô cao ở khe 3, Mi cao ở khe trên cùng, Fa cao trên vạch trên cùng, Sol cao ngồi trên đỉnh khuông.' },
  drills: ['hand-shape', 'five-finger'],
  criterion: { text: 'Đọc nốt cao (Đô cao đến Sol cao) đúng ít nhất 5/6 trong một buổi, ở 2 ngày khác nhau + một lượt đọc nhạc thế Đô cao đạt', who: 'APP' },
  kidGoal: 'Leo Tháp Nốt Cao: đọc đúng 5 nốt trong 6 — 2 hôm, thêm một bài đọc nhạc nhé! 🗼',
  lessons: [
    {
      id: 'w26-l1',
      week: 26,
      title: 'Năm nốt cao',
      emoji: '🗼',
      activities: [
        notes({
          id: 'w26-c5',
          step: 'Bài mới',
          title: 'Thế Đô cao — tay phải',
          intro: 'Dời cả bàn tay phải lên: ngón cái ở Đô cao, ngón 5 ở Sol cao. Trên khuông: Đô cao ở khe 3, Sol cao ngồi trên đỉnh.',
          targets: [
            posNote('C5', 'RH', 'C5', 'Ngón 1 — Đô cao, khe 3'),
            posNote('D5', 'RH', 'C5', 'Trên vạch 4'),
            posNote('E5', 'RH', 'C5', 'Khe trên cùng'),
            posNote('F5', 'RH', 'C5', 'Vạch trên cùng'),
            posNote('G5', 'RH', 'C5', 'Ngón 5 — ngồi trên đỉnh khuông'),
          ],
        }),
        notes({
          id: 'w26-c5-echo',
          step: 'Nhại lại',
          title: 'Con vẹt trên tháp 🦜',
          intro: 'Nghe rồi đàn lại ở thế Đô cao.',
          targets: [posEcho(['C5', 'D5', 'E5'], 'RH', 'C5'), posEcho(['G5', 'F5', 'E5'], 'RH', 'C5'), posEcho(['C5', 'E5', 'G5'], 'RH', 'C5')],
        }),
      ],
    },
    pair('w26-l2', 26, 'Thuyền trôi', '⛵', 'drifting_boat', 'Thế Đô cao, nhịp 3. Dấu luyến dài: đàn LIỀN và NHỎ (p) như thuyền trôi êm.'),
    {
      id: 'w26-l3',
      week: 26,
      title: 'Đọc nhạc nốt cao',
      emoji: '📖',
      activities: [
        { kind: 'quiz', title: 'Đọc nốt cao 📖', intro: 'Cả nốt cao lẫn nốt quen: nhìn kỹ nốt ngồi ở vạch hay ở khe.', quiz: { variant: 'read', pool: ['G4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'], rounds: 6 } },
        // v5.1 — tiêu chí tuần cần một lượt đọc nhạc thế Đô cao đạt
        { kind: 'sight', title: 'Đọc nhạc thế Đô cao', position: 'C5', hand: 'RH', count: 2, rhythm: 2, hints: 'names' },
        conveyor('drifting_boat'),
      ],
    },
  ],
};

export const WEEK27: WeekPlan = {
  week: 27,
  island: 'Thư viện Lớn',
  islandEmoji: '🏛️',
  title: 'Đọc nhạc hai khóa',
  story: 'Thư viện Lớn có hàng nghìn bản nhạc. Ai đọc được cả khóa Sol và khóa Fa thì mở được mọi cuốn sách!',
  leftHand: true,
  warmup: { variant: 'read', pool: ['C3', 'E3', 'G3', 'A3', 'C4'], rounds: 6, clef: 'bass' },
  teach: { emoji: '👨‍🏫', text: 'Con đọc to tên 5 nốt bất kỳ trên khuông cho bố mẹ kiểm tra.' },
  drills: ['thumb-under', 'five-finger'],
  criterion: { text: 'Đọc nhạc ngẫu nhiên: 5 đoạn đạt, trong ít nhất 2 ngày', who: 'PARENT/MIC' },
  kidGoal: 'Đọc 5 đoạn nhạc mới toanh — trong 2 hôm nhé! 🏛️',
  lessons: [
    { id: 'w27-l1', week: 27, title: 'Đọc nhạc chỉ nhìn khuông', emoji: '👀', activities: [
      // v5.1: 2 + 1 đoạn (trước 3 + 2) — buổi ≤ ~12 phút; tiêu chí 5 đoạn trải trên ≥ 2 ngày vẫn đạt sau 2 buổi
      { kind: 'sight', title: 'Tay phải — khóa Sol', position: 'C', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
      { kind: 'sight', title: 'Tay trái — khóa Fa', position: 'C', hand: 'LH', count: 1, rhythm: 2, hints: 'staff' },
      // Dân ca Việt Nam (OWNER yêu cầu 2026-10-05): giai điệu đi qua cả hai khóa, hai tay luân phiên
      song('ly_cay_bong', 'wait', 2, 'names', 'Dân ca Nam Bộ! Giai điệu đi từ khóa Sol xuống khóa Fa: nốt cao tay phải, nốt thấp tay trái — hai tay thay nhau hát, không đàn cùng lúc.'),
    ] },
    // Câu 2 (ô 5–8): tay trái nhảy xa nhiều nhất
    handsApart('w27-l2', 27, 'Khúc Canon', '🎻', 'canon', [4, 8], 2, 'Tay phải trước — mỗi nốt 2 phách, đàn thật êm.'),
    {
      id: 'w27-l3',
      week: 27,
      title: 'Đọc quãng · sáng tác thế Sol',
      emoji: '✍️',
      activities: [
        {
          kind: 'quiz',
          title: 'Quãng nào đây? 🐸',
          intro: 'Khuông hiện HAI nốt: đếm vạch và khe để biết quãng 2, 3, 4 hay 5 — và đi lên hay đi xuống.',
          quiz: { variant: 'interval', pool: ['G4', 'A4', 'B4', 'C5', 'D5'], rounds: 6, maxInterval: 5 },
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

export const WEEK28: WeekPlan = {
  week: 28,
  island: 'Đỉnh Hai Tay',
  islandEmoji: '🏔️',
  title: 'Bài hai tay hoàn chỉnh',
  story: 'Sắp tới đỉnh rồi! Hai tay giờ đã thành đôi bạn thân: một tay hát, một tay đệm.',
  leftHand: true,
  warmup: { variant: 'majorminor', pool: ['C4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố mẹ đệm hợp âm Đô – Fa – Sol bằng tay trái.' },
  criterion: { text: 'Chơi trọn "Các thánh tiến bước — hai tay" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Các thánh tiến bước — hai tay theo nhịp, 2 hôm nhé! 🎺',
  lessons: [
    // v5.1: tách tay sẵn; lượt hai tay THEO NHỊP dời sang bài 2 (buổi ≤ ~12 phút)
    // Câu 2 (ô 5–8): tay phải nhiều bước nhảy nhất
    handsApart('w28-l1', 28, 'Các thánh tiến bước — hai tay', '🎺', 'saints_both', [4, 8], 2, 'Tay phải hát giai điệu trước nhé!', false),
    {
      id: 'w28-l2',
      week: 28,
      title: 'Ô Susanna — hai tay',
      emoji: '🪕',
      activities: [
        song('saints_both', 'tempo', 2, 'names', 'Các thánh tiến bước — hai tay theo nhịp!'),
        song('oh_susanna_both', 'wait', 2, 'names', 'Tay phải hát, tay trái đệm hợp âm Đô – Sol.'),
        song('oh_susanna_both', 'tempo', 2, 'names'),
      ],
    },
  ],
};

export const WEEK29: WeekPlan = {
  week: 29,
  island: 'Cung điện Minuet',
  islandEmoji: '👑',
  title: 'Minuet Sol trưởng',
  story: 'Trong Cung điện, các quý tộc nhảy điệu Minuet nhẹ nhàng. Bản nhạc này đã gần 300 tuổi!',
  // v5: Minuet có nhiều bước nhảy quãng 4–5 → khởi động đọc QUÃNG tới quãng 5 ở thế Sol
  warmup: { variant: 'interval', pool: ['G4', 'A4', 'B4', 'C5', 'D5'], rounds: 6, maxInterval: 5 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố mẹ chỗ có Fa thăng trong Minuet.' },
  drills: ['finger-tap', 'thumb-under'],
  criterion: { text: 'Chơi trọn Minuet Sol trưởng (8 ô nhịp) THEO NHỊP (tốc độ từ 50 trở lên) — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Nhảy Minuet theo nhịp cùng các quý tộc — 2 hôm nhé! 👑',
  lessons: [
    { id: 'w29-l1', week: 29, title: 'Minuet — từng câu', emoji: '👑', activities: [
        // 2026-10-06: bài tự sáng tác chuẩn bị — cùng "dáng" Minuet (đen + 4 móc đơn liền, 2 nốt ngắt) nhưng gọn trong thế Sol
        song('sparrow_minuet', 'wait', 2, 'full', 'Khởi động: chim sẻ cũng nhảy Minuet! Bốn nốt móc đơn dưới dấu luyến đàn LIỀN, hai nốt có chấm đàn NGẮT.'),
        song('minuet_g', 'wait', 2, 'full', 'Tập từng câu một — chọn "Câu 1" rồi "Câu 2". Bốn nốt móc đơn dưới dấu luyến: đàn LIỀN; hai nốt Sol có chấm: đàn NGẮT.')] },
    pair('w29-l2', 29, 'Minuet — cả bài', '💃', 'minuet_g'),
  ],
};

export const WEEK30: WeekPlan = {
  week: 30,
  island: 'Vườn Beethoven',
  islandEmoji: '🌹',
  title: 'Für Elise',
  story: 'Beethoven viết "Für Elise" tặng một người bạn. Giai điệu "Mi – Rê thăng – Mi" nổi tiếng khắp thế giới.',
  warmup: { variant: 'read', pool: ['A4', 'B4', 'C5', 'D5', 'E5'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con đàn cho bố mẹ 5 nốt đầu "Mi – Rê thăng – Mi – Rê thăng – Mi" và chỉ phím Rê thăng.' },
  drills: ['wrist-circle', 'five-finger'],
  criterion: { text: 'Chơi trọn đoạn mở đầu Für Elise THEO NHỊP (tốc độ từ 50 trở lên) — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Für Elise "Mi – Rê♯ – Mi" theo nhịp — 2 hôm nhé! 🌹',
  lessons: [
    { id: 'w30-l1', week: 30, title: 'Für Elise — từng câu', emoji: '🌹', activities: [
        // 2026-10-06: bài tự sáng tác chuẩn bị — La thứ 3/4, hợp âm rải liền và "Mi – Rê♯ – Mi" trong một thế tay
        song('summer_shower', 'wait', 2, 'full', 'Khởi động: mưa rào La thứ — rải "La – Đô – Mi" thật liền, rồi chớp lóe "Mi – Rê thăng – Mi" (Rê thăng là ngón 4).'),
        song('fur_elise', 'wait', 2, 'full')] },
    pair('w30-l2', 30, 'Für Elise — cả đoạn', '🎼', 'fur_elise'),
  ],
};

export const WEEK31: WeekPlan = {
  week: 31,
  island: 'Đại hòa nhạc',
  islandEmoji: '🎆',
  title: 'Đại hòa nhạc',
  story: 'Pháo hoa đã sẵn sàng! Đây là buổi hòa nhạc lớn nhất — con là nghệ sĩ piano thật sự.',
  leftHand: true,
  warmup: null,
  teach: { emoji: '🎤', text: 'Con kể cho khán giả nghe hành trình 31 tuần học đàn của con.' },
  criterion: { text: 'Đại hòa nhạc — bố mẹ trao huy chương vàng', who: 'PARENT' },
  kidGoal: 'Đại hòa nhạc — nhận huy chương vàng! 🎆',
  lessons: [{ id: 'w31-stage', week: 31, title: 'Đại hòa nhạc', emoji: '🏆', isWeekTest: true, activities: [{ kind: 'stage', level: 3 }] }],
};

export const LEVEL3_WEEKS: readonly WeekPlan[] = [WEEK22, WEEK23, WEEK24, WEEK25, WEEK26, WEEK27, WEEK28, WEEK29, WEEK30, WEEK31];
