import { cardTarget, echo, notes } from './targets';
import type { Pitch } from '../piano/pitchTable';
import type { Hand } from '../piano/fingering';
import type { Activity, Lesson, Target, WeekPlan } from './types';
import { accompany, byEar, concertTake, polish, recitalLesson, transpose } from './musician';

/**
 * CẤP 4 — "Nghệ sĩ nhỏ" (tuần 34–46 từ rev 5 — trước đây 32–43; OWNER duyệt 2026-10-08 sau rà soát chuyên gia).
 * rev 5 (2026-10-17, OWNER duyệt): tuần 32–35 cũ → 34–37, + tuần ÔN 38 (Trạm Nghỉ Gió), 36–43 cũ → 39–46. Số tuần bên dưới là số CŨ.
 * Mục tiêu nói thật: ≈ ABRSM Initial → đầu Grade 1 (Faber cấp 2A).
 * 32 gam Sol trưởng (luồn ngón cái / vắt ngón 3) · 33 gam Fa trưởng (Si♭) · 34 gam Rê trưởng + gam HAI TAY cùng lúc ·
 * 35 hợp âm rải I–IV–V (Đô, Sol, Fa) · 36 bass Alberti & sonatina nhỏ · 37 CỦNG CỐ · 38 PEDAL ("nhả trước — nhấn sau") ·
 * 39 nhịp 6/8 ("MỘT-hai-ba BỐN-năm-sáu") · 40 to dần / nhỏ dần (hairpin), Andante – Allegro – rit. · 41 gam La thứ (tự nhiên,
 * hòa âm) · 42 CỦNG CỐ & chuẩn bị hòa nhạc · 43 Đại hòa nhạc Cấp 4.
 * Cùng kiểu Cấp 3: buổi ≤ 7 màn / ≤ ~12 phút; bài hai tay chính của tuần TÁCH TAY sẵn ở câu khó; ứng tấu 1 phút mỗi tuần.
 * Tiêu chí dạng dữ liệu (`criterionSpec`, lessonEngine.criterionDays): bài đạt ở 2 NGÀY + PHIẾU TỰ XEM TAY (vai thả lỏng ·
 * khớp đầu ngón không gãy · cổ tay mềm) — app không thấy được bàn tay; tuần pedal thêm thẻ "pedal sạch" (micro không nghe được pedal).
 * (2026-10-08) thêm ở CUỐI giáo trình — rev 5 (2026-10-17) đánh số lại bằng progress/migrations.ts (rev5Week).
 */

const song = (songId: string, mode: 'wait' | 'tempo', level: 2 | 3 = 2, hints: 'full' | 'names' | 'staff' = 'names', intro?: string): Activity => ({
  kind: 'song',
  songId,
  mode,
  level,
  hints,
  intro,
});

/** Hai lượt: chờ (phím sáng lần đầu gặp bài) → theo nhịp Mức 2. */
const pair = (id: string, week: number, title: string, emoji: string, songId: string, intro?: string, hints: 'full' | 'names' = 'names'): Lesson => ({
  id,
  week,
  title,
  emoji,
  activities: [song(songId, 'wait', 2, hints, intro), song(songId, 'tempo', 2, 'names')],
});

/** Lượt băng chuyền (Mức 3, chỉ nhìn khuông) của bài đã tập trước đó. */
const conveyor = (songId: string, intro = 'Băng chuyền — chỉ nhìn khuông nhé!'): Activity => song(songId, 'tempo', 3, 'staff', intro);

const plus = (lesson: Lesson, ...extra: Activity[]): Lesson => ({ ...lesson, activities: [...lesson.activities, ...extra] });

/** Hỏi – Đáp 2 ô ở thế tay của tuần (ứng tấu 1 phút). */
const qa = (title: string, intro: string, position: 'C' | 'G' | 'D' | 'Am'): Activity => ({ kind: 'improv', title, intro, mode: 'question-answer', position, bars: 2 });

/** Tách tay sẵn ở CÂU KHÓ (như Cấp 3): chờ tay phải câu đó → chờ tay trái câu đó → hai tay cả bài (→ theo nhịp). */
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
    { kind: 'song', songId, mode: 'wait', level: 2, hints: 'names', hand: 'RH', phrase, intro: `Câu ${phraseNo} (khó nhất). ${intro ?? 'Tay phải trước!'}` },
    { kind: 'song', songId, mode: 'wait', level: 2, hints: 'names', hand: 'LH', phrase, intro: `Câu ${phraseNo}. Giờ tay trái — tay phải nghỉ.` },
    song(songId, 'wait', 2, 'names', 'Ghép HAI TAY cả bài — chậm thôi!'),
    ...(tempo ? [song(songId, 'tempo', 2, 'names')] : []),
  ],
});

/** Nhại lại có số ngón cho từng phím (luồn ngón cái / vắt ngón 3 / hợp âm rải / Alberti). */
const fingerEcho = (pitches: Pitch[], fingers: number[], hand: Hand = 'RH', subtitle?: string): Target => ({
  ...echo(pitches, hand),
  fingers,
  ...(subtitle ? { subtitle } : {}),
});

/**
 * PHIẾU TỰ XEM TAY (Cấp 4 — thẻ của tiêu chí tuần; trước 2026-10-25 là bố mẹ xem): bé đàn bài của tuần, tự nhìn tay rồi chạm "👍 Rồi" từng ý.
 * Mã thẻ (PARENT_ASSESSMENT note) cố định — lessonEngine đọc lần chấm GẦN NHẤT trong tuần.
 */
export const RELAX_CHECKS = ['relax:shoulder', 'relax:joint', 'relax:wrist'] as const;
const RELAX_TARGETS: Target[] = [
  cardTarget('relax:shoulder', 'Vai thả lỏng', '🧘', 'Vai không nhô lên, khuỷu tay thả tự do'),
  cardTarget('relax:joint', 'Khớp ngón không gãy', '🖐️', 'Đầu ngón đứng, khớp đầu ngón không bẹp vào trong'),
  cardTarget('relax:wrist', 'Cổ tay mềm', '🌊', 'Cổ tay ngang phím, không cứng, không gồng'),
];
/** Thẻ "pedal sạch" (tuần 41): micro không nghe được pedal → bé tự kiểm tra. */
export const PEDAL_CHECK = 'ped:clean';
/** Thẻ "to dần – nhỏ dần nghe rõ" (tuần 43): micro chưa chấm sắc thái trong bài → bé tự kiểm tra. */
export const HAIRPIN_CHECK = 'dyn:hairpin';

const handCheck = (week: number, extra: Target[] = []): Activity =>
  notes({
    id: `w${week}-handcheck`,
    step: 'Con tự xem tay',
    title: 'Tự xem tay 👀',
    intro: 'Con đàn lại câu đầu rồi tự xem tay mình nhé!',
    targets: [...extra, ...RELAX_TARGETS],
  });

export const WEEK34: WeekPlan = {
  week: 34,
  island: 'Đồi Gam Sol',
  islandEmoji: '🌄',
  title: 'Gam Sol trưởng — luồn ngón',
  story: 'Chào mừng con tới CẤP 4! Trên Đồi Gam Sol, gam leo 8 bậc từ Sol tới Sol — có một bậc là phím đen Fa thăng.',
  leftHand: true,
  warmup: { variant: 'read', pool: ['G4', 'B4', 'C5', 'D5', 'E5', 'G5'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ Bé Nốt: lên gam Sol, ngón cái luồn dưới ở nốt nào? Xuống gam, ngón 3 vắt qua ở đâu?' },
  drills: ['thumb-under', 'wrist-circle'],
  criterion: {
    text: 'Chơi gam Sol trưởng tay phải và tay trái (lần lượt) theo nhịp — đạt ở 2 ngày khác nhau + tự xem tay đạt (vai, khớp ngón, cổ tay)',
    who: 'PARENT/MIC',
  },
  criterionSpec: {
    songs: [{ songId: 'scale_g_rh', tempo: true }, { songId: 'scale_g_lh', tempo: true }],
    parentChecks: [...RELAX_CHECKS],
  },
  kidGoal: 'Gam Sol hai tay — 2 hôm, tay thật mềm! 🌄',
  lessons: [
    {
      id: 'w34-l1',
      week: 34,
      title: 'Cá lặn: luồn ngón cái',
      emoji: '🐟',
      activities: [
        notes({
          id: 'w34-thumb',
          step: 'Kỹ thuật',
          title: 'Luồn ngón cái 🐟',
          intro: 'Ngón cái lặn dưới ngón 3. Cổ tay đứng yên!',
          targets: [
            fingerEcho(['G4', 'A4', 'B4', 'C5'], [1, 2, 3, 1], 'RH', 'Ngón cái lặn xuống Đô'),
            fingerEcho(['C5', 'B4', 'A4'], [1, 3, 2], 'RH', 'Ngón 3 vắt qua ngón cái'),
            fingerEcho(['G4', 'A4', 'B4', 'C5', 'D5'], [1, 2, 3, 1, 2], 'RH'),
          ],
        }),
        song('scale_g_rh', 'wait', 2, 'full', 'Gam Sol: nhớ Fa THĂNG — phím đen!'),
        song('scale_g_rh', 'tempo', 2, 'names'),
        // (2026-10-12, OWNER duyệt) 📘 Biết thêm — nhạc lý nhẹ nhàng; THÊM VÀO CUỐI bài
        { kind: 'theory', ids: ['key-sig-g'] },
      ],
    },
    plus(
      pair('w34-l2', 34, 'Gam Sol tay trái', '🐟', 'scale_g_lh', 'Tay trái lên: 5-4-3-2-1, rồi 3 vắt qua!', 'full'),
      handCheck(34),
      qa('Hỏi – Đáp thế Sol 💬', 'App hỏi. Con đáp, kết ở Sol!', 'G'),
    ),
    handsApart('w34-l3', 34, 'Bài luyện ngón Sol', '🏃', 'etude_g', [0, 4], 1, 'Tay phải chạy gam — nhẹ tay!'),
  ],
};

export const WEEK35: WeekPlan = {
  week: 35,
  island: 'Hang Si Giáng',
  islandEmoji: '🍂',
  title: 'Gam Fa trưởng — Si giáng',
  story: 'Trong Hang Si Giáng, gam Fa trưởng có một phím đen bí mật: Si GIÁNG. Ngón 4 tay phải canh giữ nó!',
  leftHand: true,
  warmup: { variant: 'read', pool: ['F4', 'A4', 'C5', 'D5', 'E5', 'F5'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ Bé Nốt phím Si giáng, và ngón nào đàn nó trong gam Fa tay phải.' },
  drills: ['thumb-under', 'finger-tap'],
  criterion: {
    text: 'Chơi gam Fa trưởng tay phải và tay trái (lần lượt) theo nhịp — đạt ở 2 ngày khác nhau + tự xem tay đạt',
    who: 'PARENT/MIC',
  },
  criterionSpec: {
    songs: [{ songId: 'scale_f_rh', tempo: true }, { songId: 'scale_f_lh', tempo: true }],
    parentChecks: [...RELAX_CHECKS],
  },
  kidGoal: 'Gam Fa có Si giáng — 2 hôm nhé! 🍂',
  lessons: [
    {
      id: 'w35-l1',
      week: 35,
      title: 'Gam Fa tay phải',
      emoji: '🍂',
      activities: [
        notes({
          id: 'w35-bb',
          step: 'Bài mới',
          title: 'Ngón 4 ở Si giáng',
          intro: 'Fa Sol La Si giáng: ngón 1-2-3-4, rồi ngón cái luồn!',
          targets: [
            fingerEcho(['F4', 'G4', 'A4', 'Bb4'], [1, 2, 3, 4], 'RH', 'Si giáng là phím ĐEN'),
            fingerEcho(['A4', 'Bb4', 'C5', 'D5'], [3, 4, 1, 2], 'RH', 'Ngón cái lặn xuống Đô'),
            fingerEcho(['D5', 'C5', 'Bb4', 'A4'], [2, 1, 4, 3], 'RH', 'Ngón 4 vắt qua về Si giáng'),
          ],
        }),
        song('scale_f_rh', 'wait', 2, 'full', 'Ngón 4 đàn Si giáng nhé!'),
        song('scale_f_rh', 'tempo', 2, 'names'),
        // (2026-10-12, OWNER duyệt) 📘 Biết thêm — nhạc lý nhẹ nhàng; THÊM VÀO CUỐI bài
        { kind: 'theory', ids: ['key-sig-f'] },
      ],
    },
    plus(
      pair('w35-l2', 35, 'Gam Fa tay trái', '🍂', 'scale_f_lh', 'Tay trái: Si giáng là ngón 2.', 'full'),
      handCheck(35),
      // (+ 2026-10-17, OWNER duyệt) 🔀 DỊCH GIỌNG: "Bài ca niềm vui" sang Fa trưởng — ngón 4 ở Si giáng như gam Fa
      transpose('ode_to_joy_easy', 'Bài ca niềm vui', 5, 'thế Fa'),
    ),
    plus(
      handsApart('w35-l3', 35, 'Lá vàng rơi', '🍁', 'falling_leaves', [0, 4], 1, 'Ngón 4 ở Si giáng!'),
      qa('Hỏi – Đáp 💬', 'App hỏi. Con đáp, kết ở Đô!', 'C'),
    ),
  ],
};

export const WEEK36: WeekPlan = {
  week: 36,
  island: 'Thung lũng Rê',
  islandEmoji: '🏞️',
  title: 'Gam Rê trưởng · gam hai tay',
  story: 'Ở Thung lũng Rê, hai bàn tay cùng leo gam một lúc — mỗi tay luồn ngón ở một chỗ khác nhau. Khó mà vui!',
  leftHand: true,
  warmup: { variant: 'read', pool: ['D4', 'F4', 'A4', 'B4', 'C5', 'D5'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ Bé Nốt hai phím đen của gam Rê trưởng: Fa thăng và Đô thăng.' },
  drills: ['thumb-under', 'hand-shape'],
  criterion: {
    text: 'Chơi gam Sol trưởng HAI TAY CÙNG LÚC theo nhịp — đạt ở 2 ngày khác nhau + tự xem tay đạt',
    who: 'PARENT/MIC',
  },
  criterionSpec: { songs: [{ songId: 'scale_g_both', tempo: true }], parentChecks: [...RELAX_CHECKS] },
  kidGoal: 'Gam Sol hai tay cùng lúc — 2 hôm! 🏞️',
  lessons: [
    {
      id: 'w36-l1',
      week: 36,
      title: 'Gam Rê trưởng',
      emoji: '🏞️',
      activities: [
        song('scale_d_rh', 'wait', 2, 'full', 'Hai phím đen: Fa thăng, Đô thăng!'),
        song('scale_d_lh', 'wait', 2, 'full', 'Tay trái: 5-4-3-2-1, rồi 3 vắt qua!'),
        song('scale_d_rh', 'tempo', 2, 'names'),
        // (+ 2026-10-17, OWNER duyệt) 👂 đàn theo tai — mỗi tháng một lần
        byEar('inh_la_oi', 6),
      ],
    },
    plus(handsApart('w36-l2', 36, 'Gam Sol hai tay', '🤝', 'scale_g_both', [0, 2], 1, 'Tay phải lên gam trước.'), handCheck(36)),
    plus(pair('w36-l3', 36, 'Hành khúc Rê trưởng', '🥁', 'march_d', 'Tay trái: hợp âm Rê, Sol và La.'), qa('Hỏi – Đáp thế Rê 💬', 'App hỏi ở thế Rê. Con đáp, kết ở Rê!', 'D')),
  ],
};

export const WEEK37: WeekPlan = {
  week: 37,
  island: 'Cầu Vồng Hợp Âm',
  islandEmoji: '🌈',
  title: 'Hợp âm rải I – IV – V',
  story: 'Hợp âm không chỉ bấm cùng lúc — rải từng nốt một như cầu vồng: lên, rồi xuống!',
  leftHand: true,
  warmup: { variant: 'majorminor', pool: ['C4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con rải hợp âm Đô trưởng cho Bé Nốt nghe: Đô – Mi – Sol – Mi – Đô, ngón 1 – 3 – 5 – 3 – 1.' },
  drills: ['hand-shape', 'wrist-circle'],
  criterion: {
    text: 'Chơi "Hợp âm rải Sol trưởng" và "Hợp âm rải Fa trưởng" theo nhịp — mỗi bài đạt ở 2 ngày khác nhau + tự xem tay đạt',
    who: 'PARENT/MIC',
  },
  criterionSpec: {
    songs: [{ songId: 'arpeggio_g', tempo: true }, { songId: 'arpeggio_f', tempo: true }],
    parentChecks: [...RELAX_CHECKS],
  },
  kidGoal: 'Rải hợp âm Sol và Fa — 2 hôm nhé! 🌈',
  lessons: [
    {
      id: 'w37-l1',
      week: 37,
      title: 'Rải hợp âm Đô',
      emoji: '🌈',
      activities: [
        notes({
          id: 'w37-broken',
          step: 'Bài mới',
          title: 'Hợp âm rải 🌈',
          intro: 'Từng nốt một: lên rồi xuống, thật đều!',
          targets: [
            fingerEcho(['C4', 'E4', 'G4', 'E4', 'C4'], [1, 3, 5, 3, 1], 'RH', 'Hợp âm Đô (I)'),
            fingerEcho(['C4', 'F4', 'A4', 'F4', 'C4'], [1, 3, 5, 3, 1], 'RH', 'Hợp âm Fa (IV)'),
            fingerEcho(['B3', 'D4', 'G4', 'D4', 'B3'], [1, 2, 5, 2, 1], 'RH', 'Hợp âm Sol (V)'),
          ],
        }),
        song('arpeggio_c', 'wait', 2, 'full', 'Tay trái giữ nốt gốc, tay phải rải!'),
        song('arpeggio_c', 'tempo', 2, 'names'),
      ],
    },
    plus(pair('w37-l2', 37, 'Rải Sol trưởng', '🌈', 'arpeggio_g', 'Ô thứ ba có Fa thăng!'), qa('Hỏi – Đáp thế Sol 💬', 'App hỏi. Con đáp bằng hợp âm rải!', 'G')),
    plus(pair('w37-l3', 37, 'Rải Fa trưởng', '🌈', 'arpeggio_f', 'Ô thứ hai có Si giáng!'), handCheck(37)),
    // (+ 2026-10-17, OWNER duyệt — rà soát giáo viên dài hạn) nhạc công nhỏ: ĐỆM HỢP ÂM RẢI dưới giai điệu quen
    {
      id: 'w37-chords',
      week: 37,
      title: 'Đệm hợp âm rải',
      emoji: '🌈',
      activities: [
        accompany('ode_to_joy_easy', 'Bài ca niềm vui', ['I', 'V7', 'I', 'V7', 'I', 'V7', 'I', 'I'], 'broken'),
      ],
      teach: { emoji: '🌈', text: 'Con đệm "Bài ca niềm vui" bằng hợp âm rải cho Bé Nốt hát!' },
    },
  ],
};

/**
 * (+ 2026-10-17, OWNER duyệt "Thêm tuần ôn & biểu diễn") TUẦN 38 — Trạm Nghỉ Gió: KHÔNG học gì mới — sau 4 tuần gam / hợp âm rải
 * (34–37), TRƯỚC bass Alberti & Sonatina (39): đánh bóng 3 bài hai tay Cấp 4 + phiếu tự xem tay; cuối tuần "🎤 Buổi diễn nhỏ".
 */
const ON3 = [
  { songId: 'etude_g', titleVi: 'Bài luyện ngón Sol' },
  { songId: 'falling_leaves', titleVi: 'Lá vàng rơi' },
  { songId: 'march_d', titleVi: 'Hành khúc Rê trưởng' },
] as const;

const polishLesson = (id: string, week: number, emoji: string, songId: string, titleVi: string, extra: Activity[] = []): Lesson => ({
  id,
  week,
  title: `Đánh bóng: ${titleVi}`,
  emoji,
  activities: [polish(songId, titleVi, [50, 60]), concertTake(songId), ...extra],
  teach: { emoji: '✨', text: `Con kể cho Bé Nốt: bài "${titleVi}" tay trái đệm kiểu gì?` },
});

export const WEEK38: WeekPlan = {
  week: 38,
  island: 'Trạm Nghỉ Gió',
  islandEmoji: '🎐',
  title: 'Ôn & biểu diễn: đánh bóng bài hai tay',
  story: 'Gió mát ở Trạm Nghỉ Gió! Không có gì mới — con đánh bóng 3 bài hai tay cho thật đều, rồi biểu diễn cho cả nhà.',
  leftHand: true,
  warmup: { variant: 'theory', pool: [], rounds: 6, theoryUpTo: 37 },
  teach: { emoji: '👨‍🏫', text: 'Con chọn bài thích nhất trong 3 bài, đàn cho Bé Nốt và kể: tay trái đệm kiểu gì?' },
  drills: ['arm-drop', 'wrist-circle'],
  criterion: {
    text: 'Chơi trọn "Bài luyện ngón Sol", "Lá vàng rơi" và "Hành khúc Rê trưởng" hai tay THEO NHỊP từ tốc độ 60 — mỗi bài đạt ít nhất một lần, trong ít nhất 2 ngày + tự xem tay đạt',
    who: 'PARENT/MIC',
  },
  criterionSpec: { songs: ON3.map((x) => ({ songId: x.songId, tempo: true, minBpm: 60 })), parentChecks: [...RELAX_CHECKS], spread: true },
  kidGoal: '3 bài hai tay thật đều — tốc độ 60, 2 hôm! 🎐',
  lessons: [
    polishLesson('w38-l1', 38, '🏃', ON3[0].songId, ON3[0].titleVi),
    polishLesson('w38-l2', 38, '🍁', ON3[1].songId, ON3[1].titleVi, [handCheck(38)]),
    polishLesson('w38-l3', 38, '🥁', ON3[2].songId, ON3[2].titleVi),
    recitalLesson(38, '🎤 Buổi diễn nhỏ', ON3.map((x) => x.songId)),
  ],
};

export const WEEK39: WeekPlan = {
  week: 39,
  island: 'Lâu đài Alberti',
  islandEmoji: '🏰',
  title: 'Bass Alberti · Sonatina',
  story: 'Trong Lâu đài Alberti, tay trái rải hợp âm "thấp – cao – giữa – cao" như tiếng vó ngựa nhỏ. Các nhạc sĩ cổ điển rất thích kiểu đệm này!',
  leftHand: true,
  warmup: { variant: 'read', pool: ['C3', 'D3', 'E3', 'F3', 'G3', 'A3'], rounds: 6, clef: 'bass' },
  teach: { emoji: '👨‍🏫', text: 'Con đàn cho Bé Nốt nghe bass Alberti: Đô – Sol – Mi – Sol bằng ngón 5 – 1 – 3 – 1.' },
  drills: ['wrist-circle', 'finger-tap'],
  criterion: {
    text: 'Chơi trọn "Sonatina nhỏ" hai tay THEO NHỊP (tốc độ từ 50 trở lên) — đạt ở 2 ngày khác nhau + tự xem tay đạt',
    who: 'PARENT/MIC',
  },
  criterionSpec: { songs: [{ songId: 'sonatina_c', tempo: true, minBpm: 50 }], parentChecks: [...RELAX_CHECKS] },
  kidGoal: 'Sonatina nhỏ hai tay theo nhịp — 2 hôm! 🏰',
  lessons: [
    {
      id: 'w39-l1',
      week: 39,
      title: 'Bass Alberti',
      emoji: '🐴',
      activities: [
        notes({
          id: 'w39-alberti',
          step: 'Bài mới',
          title: 'Thấp – cao – giữa – cao 🐴',
          intro: 'Ngón 5 – 1 – 3 – 1, cổ tay lắc nhẹ!',
          targets: [
            fingerEcho(['C3', 'G3', 'E3', 'G3'], [5, 1, 3, 1], 'LH', 'Alberti hợp âm Đô (I)'),
            fingerEcho(['C3', 'A3', 'F3', 'A3'], [5, 1, 2, 1], 'LH', 'Alberti hợp âm Fa (IV)'),
            fingerEcho(['B2', 'G3', 'D3', 'G3'], [5, 1, 3, 1], 'LH', 'Alberti hợp âm Sol (V)'),
          ],
        }),
        song('alberti_lh', 'wait', 2, 'full', 'Tay trái một mình: đều như vó ngựa!'),
        song('alberti_lh', 'tempo', 2, 'names'),
      ],
    },
    // Câu 1 (ô 1–4): nhiều nốt nhất (tay trái Alberti suốt câu)
    handsApart('w39-l2', 39, 'Sonatina nhỏ', '🎼', 'sonatina_c', [0, 4], 1, 'Tay phải hát — nhẹ nhàng.', false),
    {
      id: 'w39-l3',
      week: 39,
      title: 'Sonatina theo nhịp',
      emoji: '🎼',
      activities: [
        song('sonatina_c', 'tempo', 2, 'names', 'Sonatina hai tay theo nhịp!'),
        handCheck(39),
        qa('Hỏi – Đáp cổ điển 💬', 'App hỏi. Con đáp nhẹ nhàng, kết ở Đô!', 'C'),
      ],
    },
  ],
};

export const WEEK40: WeekPlan = {
  week: 40,
  island: 'Làng Nghỉ Chân',
  islandEmoji: '⛺',
  title: 'Củng cố: gam & hợp âm',
  story: 'Nghỉ chân ở làng nhỏ! Không có gì mới — con đàn bài mới bằng những gì đã giỏi: gam, hợp âm, Alberti.',
  leftHand: true,
  // (2026-10-12, OWNER duyệt) khởi động THỈNH THOẢNG bằng "📘 Đố vui nhạc lý" — chỉ hỏi khái niệm đã có thẻ ở tuần trước
  warmup: { variant: 'theory', pool: [], rounds: 6, theoryUpTo: 39 },
  teach: { emoji: '👨‍🏫', text: 'Con chọn một bài tuần trước, đàn cho Bé Nốt và kể: tay trái đệm kiểu gì?' },
  drills: ['five-finger', 'thumb-under'],
  criterion: {
    text: 'Chơi gam Fa trưởng hai tay cùng lúc và "Minuet nhỏ Fa trưởng" theo nhịp — mỗi bài đạt ở 2 ngày khác nhau + tự xem tay đạt',
    who: 'PARENT/MIC',
  },
  criterionSpec: {
    songs: [{ songId: 'scale_f_both', tempo: true }, { songId: 'minuet_f', tempo: true }],
    parentChecks: [...RELAX_CHECKS],
  },
  kidGoal: 'Gam Fa hai tay và Minuet nhỏ — 2 hôm! ⛺',
  lessons: [
    // (+ 2026-10-17, OWNER duyệt) 👂 đàn theo tai — mỗi tháng một lần
    plus(handsApart('w40-l1', 40, 'Gam Fa hai tay', '🤝', 'scale_f_both', [0, 2], 1, 'Tay phải: ngón 4 ở Si giáng.'), byEar('bac_kim_thang', 6)),
    plus(
      pair('w40-l2', 40, 'Minuet nhỏ Fa trưởng', '💃', 'minuet_f', 'Nhịp 3: MỘT-hai-ba, thật nhẹ!'),
      handCheck(40),
      qa('Hỏi – Đáp 💬', 'App hỏi. Con đáp nhẹ nhàng, kết ở Đô!', 'C'),
    ),
    // Dân ca Thanh Hóa (2 bản SGK): tay phải giai điệu, tay trái đệm quãng 5 — đổi thế tay trong dấu lặng / nốt dài
    // (bài dài, móc kép → tốc độ 40: chỉ lượt chờ trong bài học — lượt theo nhịp ở "Luyện tập mỗi ngày" / Thư viện; buổi ≤ 12 phút)
    {
      id: 'w40-l3',
      week: 40,
      title: 'Đi cấy',
      emoji: '🌾',
      activities: [
        song('di_cay', 'wait', 2, 'names', 'Dân ca Thanh Hóa: tay trái đệm quãng 5.'),
      ],
    },
  ],
};

export const WEEK41: WeekPlan = {
  week: 41,
  island: 'Hồ Ngân Vang',
  islandEmoji: '🦶',
  title: 'Pedal ngân',
  story: 'Bên Hồ Ngân Vang, tiếng đàn ngân dài như tiếng vọng. Bí mật nằm dưới chân: bàn đạp PEDAL bên phải!',
  leftHand: true,
  warmup: { variant: 'majorminor', pool: ['C4', 'F4', 'G4', 'A4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con chỉ Bé Nốt: đổi pedal là "nhả trước — nhấn sau" — nhả khi hợp âm mới vang, nhấn lại ngay sau đó.' },
  drills: ['arm-drop', 'hand-shape'],
  criterion: {
    text: 'Chơi trọn "Đêm thánh vô cùng — hai tay, pedal" THEO NHỊP (tốc độ từ 50 trở lên) — đạt ở 2 ngày khác nhau + tự kiểm tra pedal sạch và tay thả lỏng',
    who: 'PARENT/MIC',
  },
  criterionSpec: {
    songs: [{ songId: 'silent_night_ped', tempo: true, minBpm: 50 }],
    parentChecks: [PEDAL_CHECK, ...RELAX_CHECKS],
  },
  kidGoal: 'Đêm thánh vô cùng có pedal — 2 hôm! 🦶',
  lessons: [
    {
      id: 'w41-l1',
      week: 41,
      title: 'Bàn đạp ngân',
      emoji: '🦶',
      activities: [
        notes({
          id: 'w41-pedal',
          step: 'Bài mới',
          title: 'Bàn đạp pedal 🦶',
          intro: 'Pedal phải: gót trên sàn, mũi chân đạp.',
          targets: [
            cardTarget('ped:foot', 'Chân lên bàn đạp', '🦶', 'Gót trên sàn, mũi chân phải trên bàn đạp PHẢI'),
            cardTarget('ped:ring', 'Nhấn giữ — nghe ngân', '🔔', 'Đàn Đô, nhấn pedal, nhấc tay: đàn vẫn kêu!'),
            cardTarget('ped:legato', 'Nhả trước — nhấn sau', '🔁', 'Hợp âm MỚI vang thì nhả, rồi nhấn lại ngay'),
          ],
        }),
        song('largo_ped', 'wait', 2, 'names', 'Mỗi ô: đàn, rồi đổi pedal.'),
        song('largo_ped', 'tempo', 2, 'names'),
      ],
    },
    // Câu 3 (ô 9–12): hợp âm Fa (IV) mới, tay phải nhiều nốt nhất (bài 23 ô → lượt theo nhịp ở bài 3 — buổi ≤ 12 phút)
    plus(
      handsApart('w41-l2', 41, 'Đêm thánh — pedal', '🌟', 'silent_night_ped', [8, 12], 3, 'Chưa dùng pedal — tay trước!', false),
      handCheck(41, [cardTarget(PEDAL_CHECK, 'Pedal sạch', '🦶', 'Đổi pedal mỗi ô, tiếng không nhòe vào nhau')]),
    ),
    {
      id: 'w41-l3',
      week: 41,
      title: 'Đêm thánh theo nhịp',
      emoji: '🌟',
      activities: [
        song('silent_night_ped', 'tempo', 2, 'names', 'Hai tay, pedal đổi mỗi ô!'),
        conveyor('largo_ped', 'Largo — chỉ nhìn khuông, nhớ pedal!'),
        qa('Hỏi – Đáp ngân vang 💬', 'App hỏi. Con đáp chậm, kết ở Đô!', 'C'),
      ],
    },
  ],
};

export const WEEK42: WeekPlan = {
  week: 42,
  island: 'Vịnh Thuyền Đưa',
  islandEmoji: '⛵',
  title: 'Nhịp 6/8',
  story: 'Ở Vịnh Thuyền Đưa, sóng đưa thuyền "MỘT-hai-ba BỐN-năm-sáu" — mỗi ô 6 móc đơn, chia làm hai nhóm ba.',
  leftHand: true,
  warmup: { variant: 'interval', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6, maxInterval: 5 },
  teach: { emoji: '👨‍🏫', text: 'Con vừa đung đưa người vừa đếm cho Bé Nốt: MỘT-hai-ba BỐN-năm-sáu.' },
  drills: ['arm-drop', 'wrist-circle'],
  criterion: {
    text: 'Chơi trọn "Thuyền đưa — nhịp 6/8" hai tay theo nhịp — đạt ở 2 ngày khác nhau + tự xem tay đạt',
    who: 'PARENT/MIC',
  },
  criterionSpec: { songs: [{ songId: 'boat_song_68', tempo: true }], parentChecks: [...RELAX_CHECKS] },
  kidGoal: 'Thuyền đưa nhịp 6/8 — 2 hôm nhé! ⛵',
  lessons: [
    {
      id: 'w42-l1',
      week: 42,
      title: 'Đếm sáu: chèo thuyền',
      emoji: '🚣',
      activities: [
        song('row_boat', 'wait', 2, 'full', 'Đếm: MỘT-hai-ba BỐN-năm-sáu!'),
        song('row_boat', 'tempo', 2, 'names', 'Mỗi tiếng tích là một móc đơn.'),
        qa('Hỏi – Đáp 💬', 'App hỏi. Con đáp, kết ở Đô!', 'C'),
      ],
    },
    // Câu 1 (ô 1–4): nhiều nốt nhất
    plus(handsApart('w42-l2', 42, 'Thuyền đưa 6/8', '⛵', 'boat_song_68', [0, 4], 1, 'Đung đưa: dài – ngắn!'), handCheck(42)),
    {
      id: 'w42-l3',
      week: 42,
      title: 'Ôn · đọc nhạc',
      emoji: '📖',
      activities: [
        conveyor('boat_song_68', 'Thuyền đưa — chỉ nhìn khuông!'),
        { kind: 'sight', title: 'Đọc nhạc thế Sol', position: 'G', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
        // (2026-10-12, OWNER duyệt) 📘 Biết thêm — nhạc lý nhẹ nhàng; THÊM VÀO CUỐI bài
        { kind: 'theory', ids: ['tempo', 'cresc-dim'] },
      ],
    },
    // (+ 2026-10-17, OWNER duyệt) 🎤 Buổi diễn nhỏ
    recitalLesson(42),
  ],
};

export const WEEK43: WeekPlan = {
  week: 43,
  island: 'Đồi Bình Minh',
  islandEmoji: '🌅',
  title: 'To dần – nhỏ dần · Andante, Allegro',
  story: 'Mặt trời lên TO DẦN, rồi lặn NHỎ DẦN. Trên khuông, hai cái "mỏ" < và > dạy con đàn như thế!',
  leftHand: true,
  warmup: { variant: 'majorminor', pool: ['C4', 'D4', 'F4', 'G4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con giải thích cho Bé Nốt: Andante là đi thong thả, Allegro là nhanh vui, rit. là chậm dần.' },
  drills: ['five-finger', 'arm-drop'],
  criterion: {
    text: 'Chơi trọn "Sóng biển" (Andante) hai tay theo nhịp — đạt ở 2 ngày khác nhau + to dần / nhỏ dần nghe rõ + tự xem tay đạt',
    who: 'PARENT/MIC',
  },
  criterionSpec: {
    songs: [{ songId: 'waves_andante', tempo: true }],
    parentChecks: [HAIRPIN_CHECK, ...RELAX_CHECKS],
  },
  kidGoal: 'Sóng biển to dần, nhỏ dần — 2 hôm! 🌅',
  lessons: [
    {
      id: 'w43-l1',
      week: 43,
      title: 'To dần, nhỏ dần',
      emoji: '🌅',
      activities: [
        {
          kind: 'dynamics',
          title: 'To dần – nhỏ dần 🌅',
          intro: 'Nhỏ rồi TO, TO rồi nhỏ. Theo thầy!',
          mode: 'loud-soft',
          rounds: [
            { pitches: ['C4', 'D4', 'E4'], want: 'p', fingers: [1, 2, 3], hand: 'RH' },
            { pitches: ['F4', 'G4'], want: 'f', fingers: [4, 5], hand: 'RH' },
            { pitches: ['G4', 'F4', 'E4'], want: 'f', fingers: [5, 4, 3], hand: 'RH' },
            { pitches: ['D4', 'C4'], want: 'p', fingers: [2, 1], hand: 'RH' },
          ],
        },
        song('waves_andante', 'wait', 2, 'names', 'Mỏ mở < : to dần. Mỏ khép > : nhỏ dần.'),
        song('waves_andante', 'tempo', 2, 'names', 'Andante: thong thả như đi dạo.'),
      ],
    },
    {
      id: 'w43-l2',
      week: 43,
      title: 'Sóng biển — Andante',
      emoji: '🌊',
      activities: [
        song('waves_andante', 'tempo', 2, 'names', 'Sóng lên TO, sóng xuống nhỏ!'),
        handCheck(43, [cardTarget(HAIRPIN_CHECK, 'To dần – nhỏ dần', '🌅', 'Nghe rõ tiếng đàn to lên rồi nhỏ lại')]),
        qa('Hỏi – Đáp to nhỏ 💬', 'App hỏi nhỏ. Con đáp to dần!', 'C'),
      ],
    },
    pair('w43-l3', 43, 'Ngựa con — Allegro', '🐎', 'gallop_allegro', 'Allegro: nhanh, NGẮT, vui! rit.: chậm dần.'),
  ],
};

export const WEEK44: WeekPlan = {
  week: 44,
  island: 'Vũ hội La Thứ',
  islandEmoji: '🌙',
  title: 'Gam La thứ',
  story: 'Dưới trăng, vũ hội La Thứ bắt đầu. Gam La thứ không có phím đen — nhưng bản "hòa âm" mượn một phím đen: Sol THĂNG.',
  leftHand: true,
  warmup: { variant: 'majorminor', pool: ['C4', 'D4', 'F4', 'G4', 'A4'], rounds: 6 },
  teach: { emoji: '👨‍🏫', text: 'Con đàn cho Bé Nốt nghe gam La thứ hai lần: lần đầu toàn phím trắng, lần sau có Sol thăng.' },
  drills: ['thumb-under', 'five-finger'],
  criterion: {
    text: 'Chơi gam La thứ tay phải và "Korobeiniki" hai tay theo nhịp — mỗi bài đạt ở 2 ngày khác nhau + tự xem tay đạt',
    who: 'PARENT/MIC',
  },
  criterionSpec: {
    songs: [{ songId: 'scale_am_rh', tempo: true }, { songId: 'korobeiniki', tempo: true }],
    parentChecks: [...RELAX_CHECKS],
  },
  kidGoal: 'Gam La thứ và Korobeiniki — 2 hôm! 🌙',
  lessons: [
    {
      id: 'w44-l1',
      week: 44,
      title: 'Gam La thứ',
      emoji: '🌙',
      activities: [
        song('scale_am_rh', 'wait', 2, 'full', 'Lần lên thứ hai có Sol THĂNG!'),
        song('scale_am_rh', 'tempo', 2, 'names'),
        song('scale_am_lh', 'wait', 2, 'full', 'Tay trái: ngón như gam Đô — 5-4-3-2-1, rồi 3 vắt qua!'),
      ],
    },
    // Câu 2 (ô 5–8): tay phải dời thế ba lần
    plus(handsApart('w44-l2', 44, 'Korobeiniki', '🪆', 'korobeiniki', [4, 8], 2, 'Dời tay trong dấu lặng!'), handCheck(44)),
    {
      id: 'w44-l3',
      week: 44,
      title: 'Korobeiniki theo nhịp',
      emoji: '🪆',
      activities: [
        song('korobeiniki', 'tempo', 2, 'names', 'Korobeiniki hai tay theo nhịp!'),
        song('scale_am_lh', 'tempo', 2, 'names'),
        qa('Hỏi – Đáp La thứ 💬', 'App hỏi giọng La thứ. Con đáp, kết ở La!', 'Am'),
      ],
    },
    // (+ 2026-10-17, OWNER duyệt — rà soát giáo viên dài hạn) nhạc công nhỏ: đàn theo tai
    {
      id: 'w44-ear',
      week: 44,
      title: 'Đàn theo tai',
      emoji: '👂',
      activities: [
        byEar('london_bridge', 7),
      ],
      teach: { emoji: '👂', text: 'Con đàn cho Bé Nốt câu con tìm được bằng tai — Bé Nốt đoán tên bài nhé!' },
    },
  ],
};

export const WEEK45: WeekPlan = {
  week: 45,
  island: 'Đỉnh Tập Dượt',
  islandEmoji: '🎻',
  title: 'Củng cố: chuẩn bị hòa nhạc',
  story: 'Sắp tới Nhà hát Lớn! Tuần này con ghép mọi thứ đã học: 6/8, La thứ, to dần – nhỏ dần, và chọn bài để biểu diễn.',
  leftHand: true,
  // (2026-10-12, OWNER duyệt) khởi động THỈNH THOẢNG bằng "📘 Đố vui nhạc lý" — chỉ hỏi khái niệm đã có thẻ ở tuần trước
  warmup: { variant: 'theory', pool: [], rounds: 6, theoryUpTo: 44 },
  teach: { emoji: '👨‍🏫', text: 'Con chọn bài sẽ biểu diễn ở Nhà hát và tập giới thiệu bài cho Bé Nốt nghe.' },
  drills: ['arm-drop', 'wrist-circle'],
  criterion: {
    text: 'Chơi trọn "Greensleeves" hai tay theo nhịp — đạt ở 2 ngày khác nhau + tự xem tay đạt',
    who: 'PARENT/MIC',
  },
  criterionSpec: { songs: [{ songId: 'greensleeves', tempo: true }], parentChecks: [...RELAX_CHECKS] },
  kidGoal: 'Greensleeves hai tay theo nhịp — 2 hôm! 🎻',
  lessons: [
    // Câu 1 (ô 0–4, có nhịp lấy đà): nhiều nốt nhất; lượt theo nhịp ở bài 2 (buổi ≤ 12 phút)
    // (2026-10-09) ngón mới: tay "bò" theo giai điệu, chỉ nhảy ngón cái Mi→La ở nốt lấy đà câu 2 (gen-songs.py)
    plus(handsApart('w45-l1', 45, 'Greensleeves', '🎻', 'greensleeves', [0, 5], 1, 'Nhịp 6/8, bắt đầu bằng một nốt La!', false), handCheck(45)),
    {
      id: 'w45-l2',
      week: 45,
      title: 'Greensleeves · tổng ôn',
      emoji: '🔁',
      activities: [
        song('greensleeves', 'tempo', 2, 'names', 'Greensleeves theo nhịp — chậm dần ở cuối!'),
        conveyor('korobeiniki', 'Korobeiniki — chỉ nhìn khuông!'),
        { kind: 'sight', title: 'Đọc nhạc thế La thứ', position: 'Am', hand: 'RH', count: 2, rhythm: 2, hints: 'staff' },
        qa('Hỏi – Đáp La thứ 💬', 'App hỏi giọng La thứ. Con đáp, kết ở La!', 'Am'),
      ],
    },
    // Dân ca Quảng Nam (2 bản SGK): hai bàn tay ngũ cung, tay trái đệm quãng 5
    // (31 ô, tốc độ 40 → chỉ lượt chờ trong bài học, như "Lý ngựa ô" tuần 24)
    {
      id: 'w45-l3',
      week: 45,
      title: 'Hò ba lí',
      emoji: '🛶',
      activities: [song('ho_ba_li', 'wait', 2, 'names', 'Dân ca Quảng Nam: đổi tay ở nốt dài.')],
    },
  ],
};

export const WEEK46: WeekPlan = {
  week: 46,
  island: 'Nhà hát Lớn',
  islandEmoji: '🎇',
  title: 'Đại hòa nhạc Cấp 4',
  story: 'Nhà hát Lớn rực đèn! Con là nghệ sĩ nhỏ thật sự: gam, hợp âm rải, pedal, 6/8 — con đã làm được hết.',
  leftHand: true,
  warmup: null,
  teach: { emoji: '🎤', text: 'Con giới thiệu từng bài với khán giả: tên bài, giọng gì, nhịp mấy, có pedal không.' },
  criterion: { text: 'Đại hòa nhạc Cấp 4 — nhận huy chương', who: 'PARENT' },
  kidGoal: 'Nhà hát Lớn — nhận huy chương Cấp 4! 🎇',
  lessons: [{ id: 'w46-stage', week: 46, title: 'Đại hòa nhạc Cấp 4', emoji: '🏆', isWeekTest: true, activities: [{ kind: 'stage', level: 4 }] }],
};

export const LEVEL4_WEEKS: readonly WeekPlan[] = [WEEK34, WEEK35, WEEK36, WEEK37, WEEK38, WEEK39, WEEK40, WEEK41, WEEK42, WEEK43, WEEK44, WEEK45, WEEK46];
