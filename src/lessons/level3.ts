import { chordTarget, notes, posEcho, posNote } from './targets';
import type { Activity, Lesson, WeekPlan } from './types';
import { accompany, byEar, concertTake, polish, recitalLesson, transpose } from './musician';

/**
 * CẤP 3 — "Thành thạo" (tuần 22–33; v5.1: +1 sau khi tách tuần 18; rev 5 (2026-10-17): + tuần ôn 27 và 32, tuần 27–30 cũ +1, 31 → 33): hợp âm tay trái, dòng kẻ phụ & khuông lớn, đổi thế tay,
 * trưởng/thứ, đọc nốt cao Đô5–Sol5, đọc nhạc hai khóa, bài hai tay — rồi MỚI tới tác phẩm cổ điển giản lược (Minuet tuần 29,
 * Für Elise tuần 31), tổng duyệt tuần 32, hòa nhạc lớn tuần 33 (số tuần theo rev 5).
 * v5 (OWNER duyệt 2026-10-05, chuyên gia sư phạm): nhịp độ cũ đưa Minuet/Für Elise tới sớm 6–9 tháng → dời xuống cuối
 * Cấp 3 sau 7 tuần chuẩn bị; thêm tuần "Cầu Vạch Phụ" (nay tuần 23: dòng kẻ phụ + đọc khuông lớn hai tay) trước khi đọc nhạc hai khóa.
 * v5.1 (OWNER duyệt 2026-10-06 — buổi ≤ 7 màn, ≤ ~12 phút): bỏ bộ ba lượt "chờ → theo nhịp → băng chuyền" trong MỘT bài —
 * lượt băng chuyền (Mức 3) dời sang bài SAU của tuần (nếu buổi đó vẫn ≤ ~12 phút) hoặc để "Luyện tập mỗi ngày" (bài đã thuộc
 * được ôn ở Mức 3). Bài hai tay cùng lúc chính của tuần: TÁCH TAY sẵn trên MỘT CÂU KHÓ (chờ tay phải → chờ tay trái → hai tay cả bài).
 * Mục tiêu cuối (nói thật với phụ huynh): ≈ hoàn thành Faber cấp 1 / đầu cấp 2.
 * Dữ liệu cũ được đánh số lại trong progress/migrations.ts (bảng OLD→NEW, rev 3 → 4: tuần ≥ 19 +1).
 * Sau Cấp 3: Cấp 4 (level4.ts), rồi "Luyện tập mỗi ngày" (lessonEngine.dailyLesson) — không có điểm dừng.
 * (2026-10-08, OWNER duyệt sau rà soát chuyên gia): ứng tấu 1 phút MỖI tuần (Hỏi – Đáp ở thế tay / giọng của tuần;
 * tuần 31 chỉ có buổi hòa nhạc — không thêm); lời cho bé ngắn (≤ ~12 chữ) — chi tiết cho người lớn ở parentTips.ts.
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
const conveyor = (songId: string): Activity => song(songId, 'tempo', 3, 'staff', 'Băng chuyền bài hôm trước — chỉ nhìn khuông nhé!');

/** (2026-10-08) thêm hoạt động (ứng tấu 1 phút) vào cuối bài */
const plus = (lesson: Lesson, ...extra: Activity[]): Lesson => ({ ...lesson, activities: [...lesson.activities, ...extra] });

/** (2026-10-08) Hỏi – Đáp 2 ô nhịp ở thế tay của tuần — ứng tấu 1 phút */
const qa = (title: string, intro: string, position: 'C' | 'G' | 'Am' | 'C5'): Activity => ({ kind: 'improv', title, intro, mode: 'question-answer', position, bars: 2 });

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
    { kind: 'song', songId, mode: 'wait', level: 2, hints: 'names', hand: 'RH', phrase, intro: `Câu ${phraseNo} (khó nhất). ${intro ?? 'Tay phải trước: chỉ giai điệu!'}` },
    { kind: 'song', songId, mode: 'wait', level: 2, hints: 'names', hand: 'LH', phrase, intro: `Câu ${phraseNo}. Giờ tay trái đệm — tay phải nghỉ.` },
    song(songId, 'wait', 2, 'names', 'Ghép HAI TAY cả bài — chậm thôi, đúng trước!'),
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
  // (2026-10-17, OWNER duyệt "Bớt Bài ca niềm vui") bài tiêu chí: "Ngôi sao nhỏ — hai tay hợp âm" (I – IV – V như bài niềm vui)
  criterion: { text: 'Chơi trọn "Ngôi sao nhỏ — hai tay hợp âm" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Ngôi sao nhỏ hai tay hợp âm — 2 hôm nhé! 🌲',
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
          intro: '3 hợp âm đệm được rất nhiều bài: I, IV, V!',
          targets: [
            chordTarget(['C3', 'E3', 'G3'], 'LH', 'Hợp âm Đô (I)', [5, 3, 1]),
            chordTarget(['C3', 'F3'], 'LH', 'Hợp âm Fa (IV)', [5, 2]),
            chordTarget(['D3', 'G3'], 'LH', 'Hợp âm Sol (V)', [4, 1]),
            chordTarget(['C3', 'E3', 'G3'], 'LH', 'Về nhà: Đô (I)', [5, 3, 1]),
          ],
        }),
        qa('Hỏi – Đáp về nhà 💬', 'App hỏi. Con đáp, kết ở Đô — như hợp âm I!', 'C'),
        // (2026-10-12, OWNER duyệt) 📘 Biết thêm — nhạc lý nhẹ nhàng; THÊM VÀO CUỐI bài
        { kind: 'theory', ids: ['chords'] },
      ],
    },
    // Câu 2 (ô 5–8): tay trái đổi hợp âm nhiều hơn câu 1
    handsApart('w22-l2', 22, 'Bài ca niềm vui — hợp âm', '🎶', 'ode_to_joy_chords', [4, 8], 2, 'Tay phải trước: giai điệu quen!'),
    {
      id: 'w22-l3',
      week: 22,
      title: 'Ngôi sao nhỏ — hợp âm',
      emoji: '⭐',
      activities: [conveyor('ode_to_joy_chords'), song('twinkle_both', 'wait'), song('twinkle_both', 'tempo')],
    },
    pair('w22-l4', 22, 'Chuông ngân vang — hai tay', '🔔', 'jingle_bells_both'),
    // (+ 2026-10-17, OWNER duyệt — rà soát giáo viên dài hạn) nhạc công nhỏ: đàn theo tai
    {
      id: 'w22-ear',
      week: 22,
      title: 'Đàn theo tai',
      emoji: '👂',
      activities: [
        byEar('jingle_bells', 11),
      ],
      teach: { emoji: '👂', text: 'Con đàn cho bố mẹ câu con tìm được bằng tai — bố mẹ đoán tên bài nhé!' },
    },
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
  kidGoal: 'Vạch phụ: đúng 5 nốt trong 6 — 2 hôm + bài đọc nhạc! 🌁',
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
          intro: 'Đếm từ Đô giữa xuống: Si, rồi La trên 2 vạch phụ.',
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
          intro: 'Sáng tác 4 ô: bắt đầu nốt KHÁC Đô, kết ở Đô!',
          mode: 'compose',
          position: 'C',
          bars: 4,
        },
        // (2026-10-12, OWNER duyệt) 📘 Biết thêm — nhạc lý nhẹ nhàng; THÊM VÀO CUỐI bài
        { kind: 'theory', ids: ['ledger'] },
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
          intro: 'Khóa Fa đi LÊN qua vạch phụ: Si, Đô giữa, Rê!',
          quiz: { variant: 'read', pool: ['A3', 'B3', 'C4', 'D4'], rounds: 6, clef: 'bass' },
        },
        song('grand_duet', 'wait', 2, 'names', 'Khuông lớn: khóa Sol tay phải, khóa Fa tay trái!'),
        song('grand_duet', 'tempo', 2, 'names'),
      ],
    },
    {
      id: 'w23-l3',
      week: 23,
      title: 'Bước qua vạch phụ',
      emoji: '🪨',
      activities: [
        song('stepping_stones', 'wait', 2, 'names', 'Ngón 1 ở La dưới Đô giữa. Đếm vạch phụ xuống!'),
        song('stepping_stones', 'tempo', 2, 'names'),
        // v5.1 — tiêu chí tuần cần một lượt đọc nhạc QUA VẠCH PHỤ đạt: thế La thứ tay phải (La3–Mi4, dưới khóa Sol)
        { kind: 'sight', title: 'Đọc nhạc qua vạch phụ — thế La thứ', position: 'Am', hand: 'RH', count: 2, hints: 'names' },
      ],
    },
    // v5.1: bài hai tay cùng lúc của tuần → tách tay sẵn (sáng tác dời sang bài 1)
    // Câu 1 (ô 1–4): tay phải nhiều bước nhảy nhất cả bài
    handsApart('w23-l4', 23, 'Rước đèn', '🏮', 'lantern_parade', [0, 4], 1, 'Đèn đi TO rồi xa dần NHỎ.'),
  ],
};

export const WEEK24: WeekPlan = {
  week: 24,
  island: 'Biển Đổi Thế',
  islandEmoji: '⛵',
  title: 'Đổi thế tay',
  story: 'Trên Biển Đổi Thế, bàn tay như con thuyền: dời sang chỗ mới mà vẫn chèo êm.',
  // Ôn dòng kẻ phụ (tuần 23) La3, Si3 — dùng ở La thứ tuần 25 — và đọc trước Mi5–Sol5 (tuần 26 nốt cao, Minuet tuần 29)
  // (2026-10-12, OWNER duyệt) khởi động THỈNH THOẢNG bằng "📘 Đố vui nhạc lý" — chỉ hỏi khái niệm đã có thẻ ở tuần trước
  warmup: { variant: 'theory', pool: [], rounds: 6, theoryUpTo: 23 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ bố mẹ chỗ trong bài phải dời tay, và dời bằng ngón nào.' },
  drills: ['thumb-under', 'wrist-circle'],
  criterion: { text: 'Chơi trọn "Đêm thánh vô cùng" THEO NHỊP (tốc độ từ 50 trở lên) — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Đêm thánh vô cùng theo nhịp — 2 hôm nhé! 🌟',
  lessons: [
    { id: 'w24-l1', week: 24, title: 'Đọc nhạc nhiều thế', emoji: '📖', activities: [
      { kind: 'sight', title: 'Đọc nhạc thế Đô', position: 'C', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
      { kind: 'sight', title: 'Đọc nhạc thế Sol', position: 'G', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
      qa('Hỏi – Đáp thế Sol 💬', 'App hỏi ở thế Sol. Con đáp, kết ở Sol!', 'G'),
    ] },
    pair('w24-l2', 24, 'Đêm thánh vô cùng', '🌟', 'silent_night', 'Nhịp 3, có chấm dôi. Dời tay ở nốt dài!'),
    // Dân ca Việt Nam (OWNER yêu cầu 2026-10-05; 2026-10-06: BẢN ĐẦY ĐỦ SGK Âm nhạc 9 — dài gấp 3 bản cũ nên tách khỏi w24-l1
    // để buổi học vẫn ≤ 12 phút): hai tay luân phiên theo âm vực
    { id: 'w24-ngua', week: 24, title: 'Lý ngựa ô', emoji: '🐎', activities: [
      song('ly_ngua_o', 'wait', 2, 'names', 'Hai tay thay nhau! Bắt đầu bằng hai nốt lấy đà.'),
    ] },
    // (+ 2026-10-17, OWNER duyệt — rà soát giáo viên dài hạn) nhạc công nhỏ: HỢP ÂM SOL BẢY (V7) + đệm I – V7 dưới giai điệu quen
    {
      id: 'w24-v7',
      week: 24,
      title: 'Hợp âm Sol bảy · đệm hợp âm',
      emoji: '🏠',
      activities: [
        notes({
          id: 'w24-v7',
          step: 'Bài mới',
          title: 'Hợp âm Sol bảy (V7)',
          intro: 'Từ Đô: ngón 5 xuống Si, ngón 3 sang Fa — Sol bảy!',
          targets: [
            chordTarget(['C3', 'E3', 'G3'], 'LH', 'Hợp âm Đô (I)', [5, 3, 1]),
            chordTarget(['B2', 'F3', 'G3'], 'LH', 'Sol bảy (V7)', [5, 2, 1]),
            chordTarget(['C3', 'E3', 'G3'], 'LH', 'Về nhà: Đô (I)', [5, 3, 1]),
          ],
        }),
        accompany('mary_lamb', 'Chú cừu nhỏ', ['I', 'I', 'V7', 'I', 'I', 'I', 'V7', 'I']),
        { kind: 'theory', ids: ['dominant-7'] },
      ],
      teach: { emoji: '🏠', text: 'Con chỉ bố mẹ hợp âm Sol bảy: Si – Fa – Sol, ngón 5 – 2 – 1. Rồi đàn I – V7 – I!' },
    },
    {
      id: 'w24-transpose',
      week: 24,
      title: 'Dịch giọng: Chèo thuyền ở thế Sol',
      emoji: '🔀',
      activities: [
        transpose('lightly_row', 'Chèo thuyền nhẹ', 7, 'thế Sol'),
      ],
      teach: { emoji: '🔀', text: 'Con đàn "Chèo thuyền nhẹ" cho bố mẹ ở thế Đô rồi ở thế Sol — nghe có giống không?' },
    },
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
          intro: 'Nốt thấp dưới Đô giữa và nốt cao trên khuông!',
          quiz: { variant: 'read', pool: ['A3', 'B3', 'C4', 'D5', 'E5', 'F5', 'G5'], rounds: 6 },
        },
        song('frere_jacques_minor', 'tempo', 2, 'names'),
        // (2026-10-12, OWNER duyệt) 📘 Biết thêm — nhạc lý nhẹ nhàng; THÊM VÀO CUỐI bài
        { kind: 'theory', ids: ['major-minor'] },
      ],
    },
    // OWNER duyệt 2026-10-05: thay "Bài ca niềm vui — La thứ" (bài lặp) bằng bài tự sáng tác giọng La thứ
    plus(
      pair('w25-ninja', 25, 'Ninja rón rén', '🥷', 'ninja_tiptoe', 'Ngón 1 ở La. Đi NHỎ và NGẮT — ô cuối hét TO!'),
      qa('Hỏi – Đáp giọng buồn 🥷', 'App hỏi giọng La thứ. Con đáp, kết ở La!', 'Am'),
    ),
    // (+ 2026-10-17, OWNER duyệt) 🎤 Buổi diễn nhỏ
    recitalLesson(25),
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
  kidGoal: 'Nốt cao: đúng 5 nốt trong 6 — 2 hôm + bài đọc nhạc! 🗼',
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
          intro: 'Dời tay phải lên: ngón cái ở Đô cao (khe 3).',
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
        qa('Hỏi – Đáp trên tháp 💬', 'App hỏi ở thế Đô cao. Con đáp, kết ở Đô!', 'C5'),
      ],
    },
    pair('w26-l2', 26, 'Thuyền trôi', '⛵', 'drifting_boat', 'Đàn LIỀN và NHỎ như thuyền trôi êm!'),
    {
      id: 'w26-l3',
      week: 26,
      title: 'Đọc nhạc nốt cao',
      emoji: '📖',
      activities: [
        { kind: 'quiz', title: 'Đọc nốt cao 📖', intro: 'Nốt ngồi ở vạch hay ở khe? Nhìn kỹ nhé!', quiz: { variant: 'read', pool: ['G4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'], rounds: 6 } },
        // v5.1 — tiêu chí tuần cần một lượt đọc nhạc thế Đô cao đạt
        { kind: 'sight', title: 'Đọc nhạc thế Đô cao', position: 'C5', hand: 'RH', count: 2, rhythm: 2, hints: 'names' },
        conveyor('drifting_boat'),
      ],
    },
    // (+ 2026-10-17, OWNER duyệt — rà soát giáo viên dài hạn) nhạc công nhỏ: đàn theo tai
    {
      id: 'w26-ear',
      week: 26,
      title: 'Đàn theo tai',
      emoji: '👂',
      activities: [
        byEar('frere_jacques_easy', 8),
      ],
      teach: { emoji: '👂', text: 'Con đàn cho bố mẹ câu con tìm được bằng tai — bố mẹ đoán tên bài nhé!' },
    },
  ],
};

/**
 * (+ 2026-10-17, OWNER duyệt "Thêm tuần ôn & biểu diễn" — rà soát giáo viên dài hạn: tuần 22–26 mỗi tuần một điều mới)
 * TUẦN 27 — Xưởng Đánh Bóng: KHÔNG học gì mới. Đánh bóng 3 bài đã học tới mức "biểu diễn": leo thang tốc độ 50 → 60 → 72,
 * to – nhỏ rõ ràng, rồi "🎙️ Bản thu biểu diễn" (lượt theo nhịp chỉ nhìn khuông); cuối tuần "🎤 Buổi diễn nhỏ".
 * Tiêu chí: 3 bài theo nhịp từ 60 trở lên — mỗi bài đạt ít nhất một lần, trải trên ≥ 2 ngày (criterionSpec.spread).
 */
const ON1 = [
  { songId: 'twinkle_both', titleVi: 'Ngôi sao nhỏ — hai tay' },
  { songId: 'lantern_parade', titleVi: 'Rước đèn' },
  { songId: 'ninja_tiptoe', titleVi: 'Ninja rón rén' },
] as const;

/** Bài "đánh bóng" của tuần ôn: thang tốc độ → bản thu biểu diễn. */
const polishLesson = (id: string, week: number, emoji: string, songId: string, titleVi: string, ladder?: number[]): Lesson => ({
  id,
  week,
  title: `Đánh bóng: ${titleVi}`,
  emoji,
  activities: [polish(songId, titleVi, ladder), concertTake(songId)],
  teach: { emoji: '✨', text: `Con kể cho bố mẹ: bài "${titleVi}" chỗ nào con đàn TO, chỗ nào NHỎ?` },
});

export const WEEK27: WeekPlan = {
  week: 27,
  island: 'Xưởng Đánh Bóng',
  islandEmoji: '✨',
  title: 'Ôn & biểu diễn: đánh bóng 3 bài',
  story: 'Ở Xưởng Đánh Bóng không có gì mới! Con lấy 3 bài đã học ra lau thật sáng: nhanh hơn một nấc, to – nhỏ thật rõ — rồi biểu diễn cho cả nhà.',
  leftHand: true,
  warmup: { variant: 'theory', pool: [], rounds: 6, theoryUpTo: 26 },
  teach: { emoji: '👨‍🏫', text: 'Con chọn bài thích nhất trong 3 bài và kể cho bố mẹ: chỗ nào con đàn TO, chỗ nào NHỎ?' },
  drills: ['arm-drop', 'wrist-circle'],
  criterion: {
    text: 'Chơi trọn 3 bài cũ ("Ngôi sao nhỏ — hai tay", "Rước đèn", "Ninja rón rén") THEO NHỊP từ tốc độ 60 — mỗi bài đạt ít nhất một lần, trong ít nhất 2 ngày',
    who: 'PARENT/MIC',
  },
  criterionSpec: { songs: ON1.map((x) => ({ songId: x.songId, tempo: true, minBpm: 60 })), spread: true },
  kidGoal: '3 bài cũ thật bóng — tốc độ 60, 2 hôm! ✨',
  lessons: [
    // bài 12 ô → 2 nấc (buổi ≤ ~12 phút); bài 8 ô → 3 nấc
    polishLesson('w27-l1', 27, '⭐', ON1[0].songId, ON1[0].titleVi, [50, 60]),
    polishLesson('w27-l2', 27, '🏮', ON1[1].songId, ON1[1].titleVi),
    polishLesson('w27-l3', 27, '🥷', ON1[2].songId, ON1[2].titleVi),
    recitalLesson(27, '🎤 Buổi diễn nhỏ', ON1.map((x) => x.songId)),
  ],
};

export const WEEK28: WeekPlan = {
  week: 28,
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
    { id: 'w28-l1', week: 28, title: 'Đọc nhạc chỉ nhìn khuông', emoji: '👀', activities: [
      // v5.1: 2 + 1 đoạn (trước 3 + 2) — buổi ≤ ~12 phút; tiêu chí 5 đoạn trải trên ≥ 2 ngày vẫn đạt sau 2 buổi
      { kind: 'sight', title: 'Tay phải — khóa Sol', position: 'C', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
      { kind: 'sight', title: 'Tay trái — khóa Fa', position: 'C', hand: 'LH', count: 1, rhythm: 2, hints: 'staff' },
      // Dân ca Việt Nam (OWNER yêu cầu 2026-10-05): giai điệu đi qua cả hai khóa, hai tay luân phiên
      song('ly_cay_bong', 'wait', 2, 'names', 'Hai tay thay nhau: nốt cao tay phải, nốt thấp tay trái!'),
    ] },
    // Câu 2 (ô 5–8): tay trái nhảy xa nhiều nhất
    handsApart('w28-l2', 28, 'Khúc Canon', '🎻', 'canon', [4, 8], 2, 'Tay phải trước, đàn thật êm.'),
    {
      id: 'w28-l3',
      week: 28,
      title: 'Đọc quãng · sáng tác thế Sol',
      emoji: '✍️',
      activities: [
        {
          kind: 'quiz',
          title: 'Quãng nào đây? 🐸',
          intro: 'Quãng mấy? Đếm vạch và khe — lên hay xuống?',
          quiz: { variant: 'interval', pool: ['G4', 'A4', 'B4', 'C5', 'D5'], rounds: 6, maxInterval: 5 },
        },
        {
          kind: 'improv',
          title: 'Con là nhạc sĩ ✍️',
          intro: 'Sáng tác 4 ô ở thế Sol — thử một bước nhảy xa!',
          mode: 'compose',
          position: 'G',
          bars: 4,
        },
      ],
    },
  ],
};

export const WEEK29: WeekPlan = {
  week: 29,
  island: 'Đỉnh Hai Tay',
  islandEmoji: '🏔️',
  title: 'Bài hai tay hoàn chỉnh',
  story: 'Sắp tới đỉnh rồi! Hai tay giờ đã thành đôi bạn thân: một tay hát, một tay đệm.',
  leftHand: true,
  warmup: { variant: 'majorminor', pool: ['C4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con dạy bố mẹ đệm hợp âm Đô – Fa – Sol bằng tay trái.' },
  drills: ['arm-drop', 'hand-shape'],
  criterion: { text: 'Chơi trọn "Các thánh tiến bước — hai tay" theo nhịp — đạt ở 2 ngày khác nhau', who: 'PARENT/MIC' },
  kidGoal: 'Các thánh tiến bước — hai tay theo nhịp, 2 hôm nhé! 🎺',
  lessons: [
    // v5.1: tách tay sẵn; lượt hai tay THEO NHỊP dời sang bài 2 (buổi ≤ ~12 phút)
    // Câu 2 (ô 5–8): tay phải nhiều bước nhảy nhất
    plus(
      handsApart('w29-l1', 29, 'Các thánh tiến bước — hai tay', '🎺', 'saints_both', [4, 8], 2, 'Tay phải hát giai điệu trước nhé!', false),
      qa('Hỏi – Đáp diễu hành 🎺', 'App hỏi. Con đáp TO và vui, kết ở Đô!', 'C'),
    ),
    {
      id: 'w29-l2',
      week: 29,
      title: 'Ô Susanna — hai tay',
      emoji: '🪕',
      activities: [
        song('saints_both', 'tempo', 2, 'names', 'Các thánh tiến bước — hai tay theo nhịp!'),
        song('oh_susanna_both', 'wait', 2, 'names', 'Tay phải hát, tay trái đệm hợp âm Đô – Sol.'),
        song('oh_susanna_both', 'tempo', 2, 'names'),
      ],
    },
    // (+ 2026-10-17, OWNER duyệt — rà soát giáo viên dài hạn) nhạc công nhỏ: ĐỆM HỢP ÂM I – IV – V7
    {
      id: 'w29-chords',
      week: 29,
      title: 'Đệm hợp âm I – IV – V7',
      emoji: '🎹',
      activities: [
        accompany('jingle_bells', 'Chuông ngân vang', ['I', 'I', 'I', 'I', 'IV', 'I', 'V7', 'V7']),
      ],
      teach: { emoji: '🎹', text: 'Con đệm "Chuông ngân vang" cho bố mẹ hát: I – IV – V7!' },
    },
  ],
};

export const WEEK30: WeekPlan = {
  week: 30,
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
    { id: 'w30-l1', week: 30, title: 'Minuet — từng câu', emoji: '👑', activities: [
        // 2026-10-06: bài tự sáng tác chuẩn bị — cùng "dáng" Minuet (đen + 4 móc đơn liền, 2 nốt ngắt) nhưng gọn trong thế Sol
        song('sparrow_minuet', 'wait', 2, 'full', 'Chim sẻ nhảy Minuet: móc đơn LIỀN, nốt chấm NGẮT!'),
        song('minuet_g', 'wait', 2, 'full', 'Từng câu một! Dấu luyến: LIỀN; nốt có chấm: NGẮT.')] },
    plus(pair('w30-l2', 30, 'Minuet — cả bài', '💃', 'minuet_g'), qa('Hỏi – Đáp Minuet 💬', 'App hỏi ở thế Sol. Con đáp nhẹ nhàng, kết ở Sol!', 'G')),
    // (+ 2026-10-17, OWNER duyệt) SONG TẤU VỚI THẦY — Minuet (bè thầy tự soạn, thay bè trầm của bản gốc)
    {
      id: 'w30-duet',
      week: 30,
      title: 'Minuet — song tấu với thầy',
      emoji: '🎎',
      activities: [
        { kind: 'song', songId: 'duet_minuet', mode: 'tempo', level: 2, hints: 'names', intro: 'Song tấu: thầy đàn bè thấp, con đàn Minuet!' },
      ],
      teach: { emoji: '🎎', text: 'Con mời bố mẹ nghe Minuet song tấu và kể: thầy đàn bè cao hay bè thấp?' },
    },
  ],
};

export const WEEK31: WeekPlan = {
  week: 31,
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
    { id: 'w31-l1', week: 31, title: 'Für Elise — từng câu', emoji: '🌹', activities: [
        // 2026-10-06: bài tự sáng tác chuẩn bị — La thứ 3/4, hợp âm rải liền và "Mi – Rê♯ – Mi" trong một thế tay
        song('summer_shower', 'wait', 2, 'full', 'Rải "La – Đô – Mi" thật LIỀN, rồi "Mi – Rê thăng – Mi"!'),
        // (2026-10-09 rà soát) Sol THĂNG (ô 3) chưa từng có trong thẻ dạy nốt — nêu tên cùng Rê thăng
        song('fur_elise', 'wait', 2, 'full', 'Hai phím đen: Rê thăng và Sol thăng!')] },
    plus(pair('w31-l2', 31, 'Für Elise — cả đoạn', '🎼', 'fur_elise'), qa('Hỏi – Đáp La thứ 💬', 'App hỏi giọng La thứ. Con đáp, kết ở La!', 'Am')),
    // (+ 2026-10-17, OWNER duyệt — rà soát giáo viên dài hạn) nhạc công nhỏ: đàn theo tai
    {
      id: 'w31-ear',
      week: 31,
      title: 'Đàn theo tai',
      emoji: '👂',
      activities: [
        byEar('ode_to_joy_easy', 8),
      ],
      teach: { emoji: '👂', text: 'Con đàn cho bố mẹ câu con tìm được bằng tai — bố mẹ đoán tên bài nhé!' },
    },
  ],
};

/**
 * (+ 2026-10-17, OWNER duyệt) TUẦN 32 — Phòng Tổng Duyệt: KHÔNG học gì mới — đánh bóng 3 bài cổ điển / hai tay của Cấp 3 trước
 * Đại hòa nhạc (tuần 33); cuối tuần "🎤 Tổng duyệt" (buổi diễn nhỏ). Tiêu chí: như tuần 27 (criterionSpec.spread).
 */
const ON2 = [
  { songId: 'minuet_g', titleVi: 'Minuet Sol trưởng' },
  { songId: 'fur_elise', titleVi: 'Für Elise' },
  { songId: 'oh_susanna_both', titleVi: 'Ô Susanna — hai tay' },
] as const;

export const WEEK32: WeekPlan = {
  week: 32,
  island: 'Phòng Tổng Duyệt',
  islandEmoji: '🎭',
  title: 'Ôn & biểu diễn: tổng duyệt',
  story: 'Sắp tới Đại hòa nhạc! Trong Phòng Tổng Duyệt, nghệ sĩ không học bài mới — chỉ đánh bóng bài cũ cho thật đẹp và tập cúi chào.',
  leftHand: true,
  warmup: { variant: 'theory', pool: [], rounds: 6, theoryUpTo: 31 },
  teach: { emoji: '🎤', text: 'Con tập giới thiệu với bố mẹ: "Bài con sắp đàn là… của nhạc sĩ…".' },
  drills: ['arm-drop', 'hand-shape'],
  criterion: {
    text: 'Chơi trọn "Minuet Sol trưởng", "Für Elise" và "Ô Susanna — hai tay" THEO NHỊP từ tốc độ 60 — mỗi bài đạt ít nhất một lần, trong ít nhất 2 ngày',
    who: 'PARENT/MIC',
  },
  criterionSpec: { songs: ON2.map((x) => ({ songId: x.songId, tempo: true, minBpm: 60 })), spread: true },
  kidGoal: 'Tổng duyệt 3 bài — tốc độ 60, 2 hôm! 🎭',
  lessons: [
    polishLesson('w32-l1', 32, '👑', ON2[0].songId, ON2[0].titleVi, [50, 60]),
    polishLesson('w32-l2', 32, '🌹', ON2[1].songId, ON2[1].titleVi, [50, 60]),
    polishLesson('w32-l3', 32, '🪕', ON2[2].songId, ON2[2].titleVi, [50, 60]),
    recitalLesson(32, '🎤 Tổng duyệt', ON2.map((x) => x.songId)),
  ],
};

export const WEEK33: WeekPlan = {
  week: 33,
  island: 'Đại hòa nhạc',
  islandEmoji: '🎆',
  title: 'Đại hòa nhạc',
  story: 'Pháo hoa đã sẵn sàng! Đây là buổi hòa nhạc lớn nhất — con là nghệ sĩ piano thật sự.',
  leftHand: true,
  warmup: null,
  teach: { emoji: '🎤', text: 'Con kể cho khán giả nghe hành trình 33 tuần học đàn của con.' },
  criterion: { text: 'Đại hòa nhạc — bố mẹ trao huy chương vàng', who: 'PARENT' },
  kidGoal: 'Đại hòa nhạc — nhận huy chương vàng! 🎆',
  lessons: [{ id: 'w33-stage', week: 33, title: 'Đại hòa nhạc', emoji: '🏆', isWeekTest: true, activities: [{ kind: 'stage', level: 3 }] }],
};

export const LEVEL3_WEEKS: readonly WeekPlan[] = [WEEK22, WEEK23, WEEK24, WEEK25, WEEK26, WEEK27, WEEK28, WEEK29, WEEK30, WEEK31, WEEK32, WEEK33];
