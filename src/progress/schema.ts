/**
 * STORAGE SCHEMA v1 (§7). Các trường có đánh dấu (+) là bổ sung so với ví dụ §7,
 * chỉ THÊM, không đổi nghĩa trường cũ — vẫn schemaVersion = 1.
 */
import { validAutoTuning, type AutoTuning } from '../audio/autoTune';
import { RELEASE_VERSION } from '../pwa/release';

export const SCHEMA_VERSION = 1 as const;
/**
 * (+) Phiên bản GIÁO TRÌNH (khác schemaVersion — chỉ đổi cách đánh số tuần / mã bài học, không đổi cấu trúc).
 * 1 = 24 tuần (trước 2026-10-05) · 2 = 25 tuần: chèn tuần 20 "Đọc nốt cao Đô5–Sol5", tuần 20–24 cũ thành 21–25
 * (OWNER duyệt 2026-10-05). Dữ liệu thiếu trường này = rev 1 → migrations.ts đánh số lại một lần.
 * 3 = 30 tuần (giáo trình v5, OWNER duyệt 2026-10-05): 3 cấp × 10 tuần, thêm tuần củng cố / nhịp 2/4 / móc kép /
 * dòng kẻ phụ, Minuet & Für Elise dời xuống cuối Cấp 3 — bảng đánh số OLD→NEW trong migrations.ts (rev 1 đi qua rev 2 trước).
 * 4 = 31 tuần (giáo trình v5.1, OWNER duyệt 2026-10-06): tách tuần 18 thành 18 (móc kép, Tập-tễnh) và 19 MỚI (nghịch phách,
 * dây nối); tuần 19–30 cũ → 20–31; bài "w18-l3" → "w19-l1", "w18-bkt" → "w19-bkt" (migrations.ts, rev 1/2 đi qua rev 3 trước).
 */
export const CURRICULUM_REV = 4;
/**
 * Giới hạn kiểm tra tuần (giáo trình hiện có 31 tuần; để rộng cho các cấp sau).
 * LỖI ĐÃ SỬA 2026-10-04: trước đây giới hạn là 8 → lên tuần 9 thì dữ liệu bị coi là hỏng và bị đặt lại.
 */
export const MAX_WEEK_LIMIT = 52;
/** (+) Giới hạn hợp lệ của settings.micLatencyMs (ms). */
const MIC_LATENCY_MAX_MS = 1000;

export type ParentResult = 'correct' | 'retry';
export type SelfRating = 'all' | 'some' | 'hard';
export type DailyLimit = 'none' | 15 | 20 | 30;

export interface ParentAssessment {
  note: string; // vd "C4", hoặc "C#4+D#4", "finger-1", "posture-back"
  result: ParentResult;
  ts: number;
}

export interface AppAssessment {
  expected: string;
  actual: string;
  correct: boolean;
  ts: number;
}

/**
 * (+) MIC_ASSESSMENT — loại thứ 3, tách riêng: app nghe đàn cơ qua micro.
 * Mỗi bản ghi = một nốt bé đã hoàn thành khi micro đang bật.
 */
export interface MicAssessment {
  expected: string;
  /** Nốt đầu tiên micro nghe được cho lượt này */
  firstHeard: string;
  /** Đúng ngay từ lần đầu */
  firstTry: boolean;
  /** Số nốt sai nghe được trước khi đúng */
  wrongCount: number;
  /** Bố/mẹ bấm "Sửa" khi micro nghe nhầm */
  parentOverride?: 'correct' | 'retry';
  ts: number;
}

/**
 * (+) Một lượt chơi bài hát/bài tập theo nhịp hoặc chế độ chờ.
 * source 'mic' = micro chấm từng nốt; 'parent' = bố mẹ đánh giá cả lượt.
 */
export interface SongRun {
  songId: string;
  mode: 'wait' | 'tempo';
  /** Mức "Theo nhịp": 2 = nốt đứng yên con trỏ nhảy, 3 = băng chuyền */
  level?: 2 | 3;
  bpm: number;
  /** Gợi ý: full = phím sáng + tên + ngón; names = tên nốt; staff = chỉ khuông nhạc */
  hints: 'full' | 'names' | 'staff';
  /** Chỉ tập một câu: [ô nhịp đầu, ô nhịp cuối) */
  phrase?: [number, number] | null;
  /**
   * (+) Tập TÁCH TAY bài hai tay: chỉ chấm tay này (RH = tay phải, LH = tay trái). Không có = chơi đủ (hai tay).
   * Lượt tách tay KHÔNG tính cho tiêu chí tuần / "đã thuộc" (lessonEngine.passedWhole bỏ qua).
   */
  hand?: 'RH' | 'LH';
  /**
   * (+ v5) Phiếu chấm 3 ý của bố mẹ khi KHÔNG dùng micro (OWNER duyệt 2026-10-05):
   * notes = đúng nốt · beat = đều nhịp · fingers = đúng ngón & dáng tay. Lượt chỉ "đạt" khi cả 3 đều đạt.
   */
  checklist?: { notes: boolean; beat: boolean; fingers: boolean };
  total: number;
  hits: number;
  /**
   * (+ 2026-10-09) Micro chấm hai tay (bài hai tay, cả hai tay): số nhóm đúng / tổng của TỪNG tay. Không có = lượt
   * chấm kiểu cũ (một cao độ / bố mẹ). Chi tiết từng nốt chỉ trong bộ nhớ (src/music/handGrade.ts TwoHandRun).
   */
  hands?: { RH: { hits: number; total: number }; LH: { hits: number; total: number } };
  source: 'mic' | 'parent';
  passed: boolean;
  ts: number;
}

export type ChecklistKey = 'backStraight' | 'wristStraight' | 'fingersCurved' | 'rightFinger' | 'lessLooking' | 'happy';

export const CHECKLIST_ITEMS: ReadonlyArray<{ key: ChecklistKey; label: string }> = [
  { key: 'backStraight', label: 'Lưng thẳng' },
  { key: 'wristStraight', label: 'Cổ tay thẳng' },
  { key: 'fingersCurved', label: 'Ngón cong' },
  { key: 'rightFinger', label: 'Đúng số ngón' },
  { key: 'lessLooking', label: 'Nhìn phím ít dần' },
  { key: 'happy', label: 'Bé có vui không?' },
];

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD giờ địa phương
  lessonId: string;
  parentAssessments: ParentAssessment[];
  appAssessments: AppAssessment[];
  micAssessments: MicAssessment[]; // (+)
  songRuns: SongRun[]; // (+)
  selfRating: SelfRating | null;
  startedAt: number; // (+)
  endedAt: number | null; // (+)
  minutes: number; // (+)
  completed: boolean; // (+) bé đi hết buổi tới màn tự đánh giá
  checklist: Partial<Record<ChecklistKey, boolean>>; // (+) checklist phụ huynh §8
}

export interface Settings {
  sessionMinutes: 10 | 15 | 20;
  autoAdvance: boolean;
  autoAdvanceDelaySec: number; // 2–10
  leftHandEnabled: boolean; // Phase 3
  dailyLimit: DailyLimit; // Phase 3 — mặc định "none"
  micEnabled: boolean; // (+) mặc định TẮT — phụ huynh bật sau khi "Thử micro"
  micTuningCents: number; // (+) bù độ lệch dây đàn nhà, -100..100
  micAutoNext: boolean; // (+) micro nghe đúng → tự sang nốt sau ~1 giây
  micSensitivity: 'low' | 'normal' | 'high'; // (+) độ nhạy micro (phòng ồn → thấp; đàn nhỏ/micro xa → cao)
  micLatencyMs: number; // (+) độ trễ khứ hồi loa → micro đã đo (ms, 0–1000); 0 = chưa đo (dùng ước lượng của trình duyệt)
  accompaniment: boolean; // (+) nhạc đệm "bố mẹ đàn cùng" khi chơi theo nhịp
  timing: 'easy' | 'normal' | 'strict'; // (+) độ khắt khe khi micro chấm nhịp (mặc định dễ — trẻ 9 tuổi)
  lastBackupAt: number; // (+) lần xuất/sao chép JSON gần nhất (ms) — để nhắc sao lưu
  onboardedAt: number; // (+) lúc bố mẹ xem xong/bỏ qua hướng dẫn lần đầu (ms); 0 = chưa xem
  voice: boolean; // (+) giọng đọc hướng dẫn tiếng Việt (bé đọc chậm) — mặc định BẬT
  /**
   * (+ 2026-10-06) Cờ "đã chuyển autoAdvance sang mặc định BẬT" — migrations.ts bật autoAdvance MỘT lần cho dữ liệu cũ
   * (thiếu cờ này), sau đó tôn trọng lựa chọn của phụ huynh. Không có = dữ liệu cũ.
   */
  autoAdvanceMigrated?: boolean;
  /** (+ 2026-10-06, màn phụ huynh) Giữ bé ở tuần này (không tự sang tuần mới); null/không có = không giữ */
  holdWeek?: number | null;
  /** (+ 2026-10-06) Bố mẹ đã ẩn thẻ "Thiết lập micro" */
  micSetupHidden?: boolean;
  /** (+ 2026-10-06) Lần gần nhất app hỏi "sao lưu nhé?" (ms) */
  backupAskedAt?: number;
  /** (+ 2026-10-08) Lần gần nhất bố mẹ ẩn nhắc "💾 sao lưu" ở màn chính của bé (ms) — ẩn 3 ngày */
  backupNudgeHiddenAt?: number;
  /**
   * (+ 2026-10-08) 🎁 Quà mở khóa theo đảo (lessons/unlocks.ts): món bé ĐANG DÙNG (trang phục Bé Nốt, tiếng đàn tự do,
   * kiểu nhạc đệm) + các món đã xem màn mừng (`seen`). Không có = chưa chọn gì. Đọc MỀM (mục hỏng bị bỏ qua).
   */
  cosmetics?: Cosmetics;
  /**
   * (+ 2026-10-09) "Micro chấm cả 2 tay (thử nghiệm)": bài hai tay — micro kiểm riêng tay phải / tay trái
   * (src/audio/twoHand.ts). Không có = mặc định TWO_HAND_DEFAULT.
   */
  micTwoHand?: boolean;
  /**
   * (+ 2026-10-09) Micro TỰ HỌC độ lệch dây của đàn nhà theo âm khu (src/audio/autoTune.ts): số đo gần nhất (cent) của
   * nốt trầm / giữa / cao + giá trị đang áp dụng. Không có = chưa học (dùng micTuningCents). Phụ huynh xóa ở "Cài micro".
   */
  micAutoTune?: AutoTuning;
  /** (+ 2026-10-08) ⏰ Giờ tập bố mẹ đặt gần nhất (màn Phụ huynh → tạo lịch nhắc .ics): thứ (0 = CN … 6 = T7) + "HH:MM" */
  reminder?: { days: number[]; time: string };
  /**
   * (+ 2026-10-10) "🆕 Có gì mới": phiên bản (package.json, vd "0.21.0") bố mẹ đã xem nhật ký thay đổi (src/pwa/changelog.ts).
   * Cài mới: = bản đang chạy (defaultData). Không có = dữ liệu cũ, từ trước khi có nhật ký → hiện các bản sau 0.15.0.
   */
  lastSeenVersion?: string;
  /** (+ 2026-10-10) Lúc nút "📖 Hướng dẫn" của màn Phụ huynh đã được làm nổi MỘT lần (ms). Không có = chưa. */
  guideHintAt?: number;
  /**
   * (+ 2026-10-10) Nhãn "Mới" (src/lessons/discovery.ts): các mục mới bé ĐÃ THẤY ở màn chứa nó — chấm ở màn chính tắt.
   * Mã: "s:<bài>" (bài mới ở Thư viện) · "g:<trò>" (trò ở màn Trò chơi) · "album". Không có = chưa thấy gì. Đọc MỀM (cleanSeenNew).
   */
  seenNew?: string[];
}

/** (+ 2026-10-08) Món quà đang dùng — mã món trong lessons/unlocks.ts. */
export interface Cosmetics {
  outfit?: string;
  timbre?: string;
  backing?: string;
  /** Mã các món đã hiện màn "🎁 Quà mới!" */
  seen?: string[];
}

export interface Progress {
  currentWeek: number;
  lessonsCompleted: string[];
  practiceDays: Record<string, { minutes: number; stars: number }>;
  /**
   * (+ 2026-10-07) 🏆 Thử thách tuần ĐÃ HOÀN THÀNH: thứ 2 của tuần lịch → thử thách + lúc lưu (ms). Chỉ THÊM, không bao giờ
   * xóa (lessons/challenges.ts) — cúp tuần không mất khi gộp lịch sử. Không có = chưa hoàn thành tuần nào.
   */
  challenges?: Record<string, ChallengeRecord>;
  /** (+ 2026-10-07) Mốc kỷ lục trò chơi đầu tuần lịch (thử thách "Phá kỷ lục") — chụp một lần mỗi tuần. */
  gameBase?: GameBase;
}

/** (+ 2026-10-07) Một tuần đã hoàn thành thử thách (progress.challenges). */
export interface ChallengeRecord {
  /** Mã thử thách (lessons/challenges.ts — ChallengeId) */
  id: string;
  /** Lúc lưu (ms); 0 = không rõ */
  doneAt: number;
}

/** (+ 2026-10-07) Kỷ lục các trò chơi lúc bắt đầu tuần lịch `monday`. */
export interface GameBase {
  monday: string;
  bests: Record<string, number>;
}

export interface AppData {
  schemaVersion: 1;
  /** (+) Phiên bản giáo trình — xem CURRICULUM_REV */
  curriculumRev: number;
  learner: { name: string; createdAt: string };
  settings: Settings;
  progress: Progress;
  sessions: Session[];
  /** (+ v5) Bài bé tự sáng tác (trò "Sáng tác") — hiện trong Thư viện mục "Bài của con". Không có = []. */
  compositions?: Composition[];
  /**
   * (+ 2026-10-06) "📝 Bố mẹ thêm bài": bài bố mẹ TỰ NHẬP (gõ Đô Rê Mi hoặc chạm phím) — chỉ lưu trên iPad này,
   * dùng riêng trong gia đình, không bao giờ đưa lên app công khai. Không có = [].
   */
  parentSongs?: ParentSong[];
  /**
   * (+ 2026-10-06) TỔNG HỢP lịch sử đã gộp (progress/compaction.ts): buổi cũ hơn ~8 tuần được gộp vào đây để
   * localStorage không đầy (Safari ~5 MB). Chỉ THÊM — không có = chưa gộp buổi nào. Mọi hàm đọc lịch sử dùng
   * "tổng hợp + buổi còn giữ" (progress/history.ts). Không đổi schemaVersion.
   */
  history?: History;
  /**
   * (+ 2026-10-07) "🎮 Trò chơi": kỷ lục từng trò (khóa = mã trò, vd 'noteRush'). Chỉ THÊM — không có = chưa chơi.
   * Tách khỏi sessions → không ảnh hưởng gộp lịch sử (compaction) hay tiêu chí tuần.
   */
  games?: Record<string, GameScore>;
  /**
   * (+ 2026-10-08) "🎤 Biểu diễn cho cả nhà": nhật ký các buổi diễn hằng tuần (lessons/concert.ts). Chỉ THÊM — không có = chưa
   * diễn lần nào. Tách khỏi sessions → gộp lịch sử (compaction) không đụng tới, không ảnh hưởng tiêu chí tuần.
   * Bản ghi hỏng bên trong bị bỏ qua khi đọc (concertLog) — không làm hỏng cả dữ liệu.
   */
  concerts?: ConcertEntry[];
}

/** (+ 2026-10-08) Một buổi "Biểu diễn cho cả nhà". */
export interface ConcertEntry {
  id: string;
  /** Ngày diễn (YYYY-MM-DD, giờ máy) */
  date: string;
  /** Lúc lưu (ms) */
  ts: number;
  /** Tuần giáo trình mà buổi diễn này mừng (mỗi tuần tối đa MỘT sticker) */
  week: number;
  songId: string;
  /** Số lần khán giả chạm 👏 / ❤️ / 🌟 */
  reactions: { clap: number; heart: number; star: number };
  /** Ai nghe (chip "Ông", "Bà", "Mẹ"… + tên bố mẹ gõ thêm) */
  audience: string[];
  /** Lượt diễn đạt (micro ≥ ngưỡng / bố mẹ tích đủ) — có thì ghi */
  passed?: boolean;
}

/** (+ 2026-10-07) Kỷ lục một trò chơi. */
export interface GameScore {
  /** Điểm cao nhất */
  best: number;
  /** Số lần chơi xong */
  plays: number;
  /** Lần chơi gần nhất (ms) */
  lastAt: number;
  /**
   * (+ 2026-10-09, tùy chọn) Mức độ khó bé đạt ở lượt gần nhất (vd 🎧 Đoán nốt: số nốt trong bể) — lượt sau bắt đầu gần đó.
   * Thiếu / hỏng → coi như chưa có (bắt đầu từ mức 1).
   */
  level?: number;
  /** (+ 2026-10-09, tùy chọn) Chuỗi đúng liên tiếp dài nhất từng đạt */
  streak?: number;
}

const okNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
/** Trường TÙY CHỌN (level/streak): không có hoặc là số hợp lệ. */
const okOpt = (n: unknown): boolean => n === undefined || okNum(n);

const validGameScore = (g: unknown): g is GameScore =>
  isObj(g) && [g.best, g.plays, g.lastAt].every(okNum) && okOpt(g.level) && okOpt(g.streak);

/**
 * (+ 2026-10-07) Lọc kỷ lục trò chơi một cách DỄ TÍNH: mục hỏng bị bỏ (không làm hỏng cả bản sao lưu).
 * Không phải object / rỗng → undefined.
 */
/** (+ 2026-10-10) Tối đa số mã trong settings.seenNew (mỗi mã ≤ SEEN_KEY_MAX ký tự). */
export const SEEN_NEW_MAX = 300;
const SEEN_KEY_MAX = 64;

/** (+ 2026-10-10) Lọc settings.seenNew DỄ TÍNH: bỏ mã hỏng / trùng, giữ SEEN_NEW_MAX mã cuối. Rỗng / sai kiểu → undefined. */
export function cleanSeenNew(x: unknown): string[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const out = [...new Set(x.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= SEEN_KEY_MAX))].slice(-SEEN_NEW_MAX);
  return out.length ? out : undefined;
}

export function sanitizeGames(x: unknown): Record<string, GameScore> | undefined {
  if (!isObj(x)) return undefined;
  const out: Record<string, GameScore> = {};
  for (const [k, v] of Object.entries(x)) {
    if (!k || !isObj(v) || ![v.best, v.plays, v.lastAt].every(okNum)) continue;
    const g: GameScore = { best: v.best as number, plays: Math.floor(v.plays as number), lastAt: v.lastAt as number };
    // Trường tùy chọn hỏng → chỉ bỏ trường đó (giữ kỷ lục)
    if (okNum(v.level)) g.level = Math.floor(v.level);
    if (okNum(v.streak)) g.streak = Math.floor(v.streak);
    out[k] = g;
  }
  return Object.keys(out).length ? out : undefined;
}

/** [a, b] — vd [số lần đúng, tổng] */
export type CountPair = [number, number];

/** (+) Tổng hợp một bài hát / mã lượt chơi từ các buổi đã gộp. */
export interface SongAgg {
  /** Lúc THUỘC bài (lượt sớm nhất chơi trọn theo nhịp ≥ 60 và đạt) — có = đã thuộc */
  m?: number;
  /** Lần gần nhất chơi CẢ bài (không tính tập một câu) — ms */
  w?: number;
  /** Lượt gần nhất (mọi kiểu): [ts, đạt 1/0] — có = đã từng chơi */
  r?: CountPair;
  /** Đã từng chơi trọn, đủ tay, đạt (bài hai tay → "hai tay cùng lúc") */
  h?: 1;
  /** Tốc độ nhanh nhất chơi trọn theo nhịp, đủ tay, đạt (không tính đọc nhạc ngẫu nhiên) */
  b?: number;
  /** Số sao tốt nhất (1–3) của một lượt đủ tay — hiện ở Thư viện, giữ được sau khi gộp */
  s?: number;
}

/** (+) Tổng hợp lịch sử đã gộp — xem progress/compaction.ts. */
export interface History {
  v: 1;
  /** Sticker bất ngờ (🎁) của các buổi đã gộp — giữ sổ sticker không đổi sau khi gộp (src/lessons/bonusStickers.ts) */
  bonus?: import('../lessons/bonusStickers').BonusState;
  /**
   * Tóm tắt TỐI THIỂU các buổi bài học đã hoàn thành đã gộp (mã, ngày, bài, giờ bắt đầu) — để sổ sticker bất ngờ được tính lại
   * theo ĐÚNG thứ tự thời gian cùng các buổi còn giữ (gộp không theo thứ tự ngày khi bé ở lâu một tuần).
   */
  bonusStubs?: Array<{ id: string; date: string; lessonId: string; t: number }>;
  /** Ngày (YYYY-MM-DD): các buổi TRƯỚC ngày này đã được xét gộp ở lần gộp gần nhất */
  compactedThrough: string;
  /** Số buổi đã gộp / trong đó đã hoàn thành / có phút hoặc hoàn thành (báo cáo) */
  sessions: number;
  completed: number;
  counted: number;
  /** Ngày sớm nhất của các buổi đã gộp */
  firstDate: string | null;
  /** Ngày muộn nhất của các buổi đã gộp CÓ nội dung (không phải buổi mở rồi thoát) */
  lastDate?: string | null;
  /** Tuần giáo trình → ngày SỚM NHẤT có buổi (có nội dung) của tuần đó trong các buổi đã gộp (đèn "đã ở tuần này bao lâu") */
  weekFirst?: Record<string, string>;
  /** Phần ngày tập của các buổi đã gộp: ngày → [phút, sao] (cùng quy tắc recomputePracticeDays) */
  practiceDays: Record<string, CountPair>;
  /** Tuần lịch (thứ 2) → [bitmask ngày có buổi HOÀN THÀNH (bit 0 = thứ 2), số buổi hoàn thành trước EFFORT_BY_DAYS_FROM] */
  weeks: Record<string, CountPair>;
  songs: Record<string, SongAgg>;
  /** Mã nốt / việc → tối đa 5 lần gần nhất [ts, đúng 1/0], cũ → mới (trí nhớ Leitner) */
  targets: Record<string, CountPair[]>;
  micPerfect: boolean;
  /** Trò sắc thái đã chơi xong ('loud-soft' / 'stac-leg') */
  dynamicsDone: string[];
  /** Số lượt sắc thái được chấm đúng */
  dynamicsRounds: number;
  /** Tuần ĐÃ ĐẠT tiêu chí chỉ với các buổi đã gộp (weekPassed giữ nguyên sau khi gộp) */
  passedWeeks: number[];
  /** Sticker đảo / huy chương đã nhận — không mất khi bố mẹ lùi tuần */
  stickers: string[];
  /** Báo cáo: số câu đúng / tổng theo kỹ năng (từ đầu) */
  skills: { reading: CountPair; ear: CountPair; rhythm: CountPair };
  /** Màn phụ huynh: bảng tổng hợp theo nốt (xem history.parentStats) */
  parent: {
    /** PARENT: nốt → [đúng, thử lại] */
    p: Record<string, CountPair>;
    /** APP: nốt → [đúng, tổng] */
    a: Record<string, CountPair>;
    /** MIC: nốt → [hoàn thành, đúng ngay, bố mẹ sửa] */
    m: Record<string, [number, number, number]>;
    /** Kỹ năng của con: tìm nốt / nghe & đọc / giữ nhịp / đọc nhạc → [đạt, tổng] */
    find: CountPair;
    ear: CountPair;
    tempo: CountPair;
    sight: CountPair;
  };
}

/** (+) Một nốt bài bố mẹ nhập — cùng định dạng nốt bài hát (Tune). */
export interface ParentSongNote {
  pitch?: string;
  beats: number;
  finger?: number;
  rest?: boolean;
}

/** (+ 2026-10-06) Bài bố mẹ thêm (src/ui/screens/songEditor.ts). */
export interface ParentSong {
  id: string;
  title: string;
  createdAt: number;
  /** Lần sửa gần nhất (ms) */
  updatedAt?: number;
  timeSignature: '4/4' | '3/4' | '2/4';
  /** Tốc độ (nốt đen / phút) */
  bpm: number;
  /** Bè chính (đã tự ghi số ngón khi lưu) */
  notes: ParentSongNote[];
  /** Bè tay trái (tùy chọn — trình soạn chưa nhập, để dành) */
  lh?: ParentSongNote[];
  /** Số ngón ghi riêng từng nốt */
  position?: 'free';
  /** Ô nhịp bắt đầu mỗi câu */
  phrases?: number[];
  /** Chữ Đô Rê Mi bố mẹ đã gõ (giữ nguyên xuống dòng khi sửa lại) */
  text?: string;
}

/** (+ v5) Một bài bé sáng tác: dãy nốt (cùng định dạng nốt bài hát) trong một thế tay. */
export interface Composition {
  id: string;
  title: string;
  createdAt: number;
  timeSignature: '4/4' | '3/4';
  notes: Array<{ pitch?: string; beats: number; finger?: number; rest?: boolean }>;
}

export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function defaultSettings(): Settings {
  return {
    sessionMinutes: 15,
    // (2026-10-06) mặc định BẬT: đúng nốt → tự sang nốt sau (dữ liệu cũ: migrations.ts bật một lần)
    autoAdvance: true,
    autoAdvanceDelaySec: 4,
    leftHandEnabled: false,
    dailyLimit: 'none',
    micEnabled: false,
    micTuningCents: 0,
    micAutoNext: true,
    micSensitivity: 'normal',
    micLatencyMs: 0,
    accompaniment: true,
    timing: 'easy',
    lastBackupAt: 0,
    onboardedAt: 0,
    voice: true,
    autoAdvanceMigrated: true,
  };
}

export function defaultData(now: Date = new Date()): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    curriculumRev: CURRICULUM_REV,
    learner: { name: '', createdAt: localDateStr(now) },
    // lastSeenVersion chỉ đặt cho dữ liệu MỚI (không ở defaultSettings: migrations.ts trộn defaultSettings vào dữ liệu cũ
    // → người dùng cũ sẽ không bao giờ thấy "Có gì mới")
    settings: { ...defaultSettings(), lastSeenVersion: RELEASE_VERSION },
    progress: { currentWeek: 1, lessonsCompleted: [], practiceDays: {} },
    sessions: [],
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Kiểm tra cấu trúc; trả về danh sách lỗi (rỗng = hợp lệ). */
export function validateAppData(x: unknown): string[] {
  const errs: string[] = [];
  if (!isObj(x)) return ['Dữ liệu không phải object'];
  if (x.schemaVersion !== SCHEMA_VERSION) errs.push('schemaVersion phải là 1');
  // Không có = dữ liệu cũ (rev 1) — migrate() sẽ điền; có thì phải là số nguyên ≥ 1
  if (
    x.curriculumRev !== undefined &&
    (!Number.isInteger(x.curriculumRev) || (x.curriculumRev as number) < 1 || (x.curriculumRev as number) > CURRICULUM_REV)
  ) {
    errs.push('curriculumRev');
  }
  if (!isObj(x.learner)) errs.push('Thiếu learner');
  const st = x.settings;
  if (!isObj(st)) errs.push('Thiếu settings');
  else {
    if (![10, 15, 20].includes(st.sessionMinutes as number)) errs.push('settings.sessionMinutes');
    if (typeof st.autoAdvance !== 'boolean') errs.push('settings.autoAdvance');
    const d = st.autoAdvanceDelaySec as number;
    if (typeof d !== 'number' || d < 2 || d > 10) errs.push('settings.autoAdvanceDelaySec');
    if (typeof st.leftHandEnabled !== 'boolean') errs.push('settings.leftHandEnabled');
    if (!['none', 15, 20, 30].includes(st.dailyLimit as never)) errs.push('settings.dailyLimit');
    if (typeof st.micEnabled !== 'boolean') errs.push('settings.micEnabled');
    const tc = st.micTuningCents as number;
    if (typeof tc !== 'number' || tc < -100 || tc > 100) errs.push('settings.micTuningCents');
    if (typeof st.micAutoNext !== 'boolean') errs.push('settings.micAutoNext');
    if (!['low', 'normal', 'high'].includes(st.micSensitivity as string)) errs.push('settings.micSensitivity');
    const ml = st.micLatencyMs as number;
    if (typeof ml !== 'number' || !(ml >= 0 && ml <= MIC_LATENCY_MAX_MS)) errs.push('settings.micLatencyMs');
    if (typeof st.accompaniment !== 'boolean') errs.push('settings.accompaniment');
    if (!['easy', 'normal', 'strict'].includes(st.timing as string)) errs.push('settings.timing');
    if (typeof st.lastBackupAt !== 'number') errs.push('settings.lastBackupAt');
    if (typeof st.onboardedAt !== 'number') errs.push('settings.onboardedAt');
    if (typeof st.voice !== 'boolean') errs.push('settings.voice');
    if (st.autoAdvanceMigrated !== undefined && typeof st.autoAdvanceMigrated !== 'boolean') errs.push('settings.autoAdvanceMigrated');
    // (+ 2026-10-06) trường tùy chọn của màn phụ huynh — không có thì thôi, có thì đúng kiểu
    if (st.holdWeek !== undefined && st.holdWeek !== null && !(Number.isInteger(st.holdWeek) && (st.holdWeek as number) >= 1 && (st.holdWeek as number) <= MAX_WEEK_LIMIT)) errs.push('settings.holdWeek');
    if (st.micSetupHidden !== undefined && typeof st.micSetupHidden !== 'boolean') errs.push('settings.micSetupHidden');
    if (st.backupAskedAt !== undefined && !(typeof st.backupAskedAt === 'number' && Number.isFinite(st.backupAskedAt))) errs.push('settings.backupAskedAt');
    if (st.backupNudgeHiddenAt !== undefined && !(typeof st.backupNudgeHiddenAt === 'number' && Number.isFinite(st.backupNudgeHiddenAt))) errs.push('settings.backupNudgeHiddenAt');
    // (+ 2026-10-08) quà mở khóa / giờ nhắc tập — chỉ chặn kiểu sai hẳn; giá trị bên trong đọc mềm (lessons/unlocks.ts, reminder.ts)
    if (st.cosmetics !== undefined && !isObj(st.cosmetics)) errs.push('settings.cosmetics');
    if (st.micAutoTune !== undefined && !validAutoTuning(st.micAutoTune)) errs.push('settings.micAutoTune');
    if (st.reminder !== undefined && !(isObj(st.reminder) && Array.isArray(st.reminder.days) && typeof st.reminder.time === 'string')) errs.push('settings.reminder');
    // (+ 2026-10-10) "Có gì mới" / gợi ý Hướng dẫn
    if (st.lastSeenVersion !== undefined && !(typeof st.lastSeenVersion === 'string' && /^\d+\.\d+\.\d+$/.test(st.lastSeenVersion))) errs.push('settings.lastSeenVersion');
    if (st.guideHintAt !== undefined && !(typeof st.guideHintAt === 'number' && Number.isFinite(st.guideHintAt))) errs.push('settings.guideHintAt');
    // (+ 2026-10-10) Nhãn "Mới" — migrate() đã lọc (cleanSeenNew); ở đây chỉ chặn kiểu sai hẳn
    if (st.seenNew !== undefined && !(Array.isArray(st.seenNew) && st.seenNew.every((k) => typeof k === 'string'))) errs.push('settings.seenNew');
  }
  const p = x.progress;
  if (!isObj(p)) errs.push('Thiếu progress');
  else {
    if (!Number.isInteger(p.currentWeek) || (p.currentWeek as number) < 1 || (p.currentWeek as number) > MAX_WEEK_LIMIT) errs.push('progress.currentWeek');
    if (!Array.isArray(p.lessonsCompleted)) errs.push('progress.lessonsCompleted');
    if (!isObj(p.practiceDays)) errs.push('progress.practiceDays');
    // (+ 2026-10-07) Thử thách tuần — chỉ cần đúng kiểu object; bản ghi hỏng bên trong bị bỏ qua khi đọc (challenges.ts)
    if (p.challenges !== undefined && !isObj(p.challenges)) errs.push('progress.challenges');
    if (p.gameBase !== undefined && !isObj(p.gameBase)) errs.push('progress.gameBase');
  }
  if (!Array.isArray(x.sessions)) errs.push('Thiếu sessions');
  else {
    x.sessions.forEach((s, i) => {
      if (!isObj(s)) return errs.push(`sessions[${i}]`);
      if (typeof s.id !== 'string' || typeof s.date !== 'string' || typeof s.lessonId !== 'string') {
        errs.push(`sessions[${i}] thiếu id/date/lessonId`);
      }
      if (!Array.isArray(s.parentAssessments)) errs.push(`sessions[${i}].parentAssessments`);
      else
        s.parentAssessments.forEach((a, j) => {
          if (!isObj(a) || !['correct', 'retry'].includes(a.result as string)) {
            errs.push(`sessions[${i}].parentAssessments[${j}]`);
          }
        });
      if (!Array.isArray(s.appAssessments)) errs.push(`sessions[${i}].appAssessments`);
      else
        s.appAssessments.forEach((a, j) => {
          if (!isObj(a) || typeof a.correct !== 'boolean') errs.push(`sessions[${i}].appAssessments[${j}]`);
        });
      if (s.selfRating !== null && !['all', 'some', 'hard'].includes(s.selfRating as string)) {
        errs.push(`sessions[${i}].selfRating`);
      }
      if (!Array.isArray(s.songRuns)) errs.push(`sessions[${i}].songRuns`);
      else
        s.songRuns.forEach((r, j) => {
          if (
            !isObj(r) ||
            typeof r.songId !== 'string' ||
            !['wait', 'tempo'].includes(r.mode as string) ||
            typeof r.passed !== 'boolean' ||
            typeof r.bpm !== 'number' ||
            !Number.isFinite(r.bpm) ||
            (r.hand !== undefined && r.hand !== 'RH' && r.hand !== 'LH')
          ) {
            errs.push(`sessions[${i}].songRuns[${j}]`);
          }
        });
      if (!Array.isArray(s.micAssessments)) errs.push(`sessions[${i}].micAssessments`);
      else
        s.micAssessments.forEach((a, j) => {
          if (!isObj(a) || typeof a.firstTry !== 'boolean') errs.push(`sessions[${i}].micAssessments[${j}]`);
        });
    });
  }
  // (+ v5) Bài bé sáng tác — không có = []
  if (x.compositions !== undefined) {
    if (!Array.isArray(x.compositions)) errs.push('compositions');
    else
      x.compositions.forEach((c, i) => {
        if (
          !isObj(c) ||
          typeof c.id !== 'string' ||
          typeof c.title !== 'string' ||
          typeof c.createdAt !== 'number' ||
          !['4/4', '3/4'].includes(c.timeSignature as string) ||
          !Array.isArray(c.notes) ||
          !c.notes.every(
            (n) =>
              isObj(n) &&
              typeof n.beats === 'number' &&
              Number.isFinite(n.beats) &&
              n.beats > 0 &&
              (n.pitch === undefined || (typeof n.pitch === 'string' && /^[A-G](#|b)?-?\d$/.test(n.pitch))) &&
              (n.pitch !== undefined || n.rest === true),
          )
        ) {
          errs.push(`compositions[${i}]`);
        }
      });
  }
  // (+ 2026-10-06) Bài bố mẹ thêm — không có = []
  if (x.parentSongs !== undefined) {
    if (!Array.isArray(x.parentSongs)) errs.push('parentSongs');
    else
      x.parentSongs.forEach((c, i) => {
        if (
          !isObj(c) ||
          typeof c.id !== 'string' ||
          !c.id ||
          typeof c.title !== 'string' ||
          typeof c.createdAt !== 'number' ||
          (c.updatedAt !== undefined && typeof c.updatedAt !== 'number') ||
          !['4/4', '3/4', '2/4'].includes(c.timeSignature as string) ||
          typeof c.bpm !== 'number' ||
          !(c.bpm >= 30 && c.bpm <= 200) ||
          !Array.isArray(c.notes) ||
          !c.notes.length ||
          !c.notes.every(validSongNote) ||
          (c.lh !== undefined && (!Array.isArray(c.lh) || !c.lh.every(validSongNote))) ||
          (c.position !== undefined && c.position !== 'free') ||
          (c.phrases !== undefined && (!Array.isArray(c.phrases) || !c.phrases.every((p) => Number.isInteger(p) && (p as number) >= 0))) ||
          (c.text !== undefined && typeof c.text !== 'string')
        ) {
          errs.push(`parentSongs[${i}]`);
        }
      });
  }
  // (+ 2026-10-07) Kỷ lục trò chơi — migrate() đã lọc mục hỏng (sanitizeGames); ở đây chỉ chặn kiểu sai hẳn
  if (x.games !== undefined && (!isObj(x.games) || !Object.values(x.games).every(validGameScore))) errs.push('games');
  // (+ 2026-10-08) Nhật ký buổi diễn — chỉ chặn kiểu sai hẳn; bản ghi hỏng bị lọc khi đọc (lessons/concert.ts)
  if (x.concerts !== undefined && !Array.isArray(x.concerts)) errs.push('concerts');
  // (+ 2026-10-06) Tổng hợp lịch sử đã gộp — không có = chưa gộp
  if (x.history !== undefined) {
    const hs = x.history;
    if (
      !isObj(hs) ||
      typeof hs.compactedThrough !== 'string' ||
      ![hs.sessions, hs.completed, hs.counted, hs.dynamicsRounds].every((n) => Number.isInteger(n) && (n as number) >= 0) ||
      !(hs.firstDate === null || typeof hs.firstDate === 'string') ||
      ![hs.practiceDays, hs.weeks, hs.songs, hs.targets, hs.skills, hs.parent].every(isObj) ||
      typeof hs.micPerfect !== 'boolean' ||
      ![hs.dynamicsDone, hs.passedWeeks, hs.stickers].every(Array.isArray)
    ) {
      errs.push('history');
    }
  }
  return errs;
}

/** Một nốt bài bố mẹ nhập: độ dài > 0, cao độ đúng dạng (hoặc dấu lặng), số ngón 1–5 nếu có. */
function validSongNote(n: unknown): boolean {
  return (
    isObj(n) &&
    typeof n.beats === 'number' &&
    Number.isFinite(n.beats) &&
    n.beats > 0 &&
    (n.pitch === undefined || (typeof n.pitch === 'string' && /^[A-G](#|b)?-?\d$/.test(n.pitch))) &&
    (n.pitch !== undefined || n.rest === true) &&
    (n.finger === undefined || (Number.isInteger(n.finger) && (n.finger as number) >= 1 && (n.finger as number) <= 5))
  );
}
