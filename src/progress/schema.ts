/**
 * STORAGE SCHEMA v1 (§7). Các trường có đánh dấu (+) là bổ sung so với ví dụ §7,
 * chỉ THÊM, không đổi nghĩa trường cũ — vẫn schemaVersion = 1.
 */

export const SCHEMA_VERSION = 1 as const;
/**
 * (+) Phiên bản GIÁO TRÌNH (khác schemaVersion — chỉ đổi cách đánh số tuần / mã bài học, không đổi cấu trúc).
 * 1 = 24 tuần (trước 2026-10-05) · 2 = 25 tuần: chèn tuần 20 "Đọc nốt cao Đô5–Sol5", tuần 20–24 cũ thành 21–25
 * (OWNER duyệt 2026-10-05). Dữ liệu thiếu trường này = rev 1 → migrations.ts đánh số lại một lần.
 */
export const CURRICULUM_REV = 2;
/**
 * Giới hạn kiểm tra tuần (giáo trình hiện có 25 tuần; để rộng cho các cấp sau).
 * LỖI ĐÃ SỬA 2026-10-04: trước đây giới hạn là 8 → lên tuần 9 thì dữ liệu bị coi là hỏng và bị đặt lại.
 */
export const MAX_WEEK_LIMIT = 52;

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
  total: number;
  hits: number;
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
  accompaniment: boolean; // (+) nhạc đệm "bố mẹ đàn cùng" khi chơi theo nhịp
  timing: 'easy' | 'normal' | 'strict'; // (+) độ khắt khe khi micro chấm nhịp (mặc định dễ — trẻ 9 tuổi)
  lastBackupAt: number; // (+) lần xuất/sao chép JSON gần nhất (ms) — để nhắc sao lưu
  onboardedAt: number; // (+) lúc bố mẹ xem xong/bỏ qua hướng dẫn lần đầu (ms); 0 = chưa xem
}

export interface Progress {
  currentWeek: number;
  lessonsCompleted: string[];
  practiceDays: Record<string, { minutes: number; stars: number }>;
}

export interface AppData {
  schemaVersion: 1;
  /** (+) Phiên bản giáo trình — xem CURRICULUM_REV */
  curriculumRev: number;
  learner: { name: string; createdAt: string };
  settings: Settings;
  progress: Progress;
  sessions: Session[];
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
    autoAdvance: false,
    autoAdvanceDelaySec: 4,
    leftHandEnabled: false,
    dailyLimit: 'none',
    micEnabled: false,
    micTuningCents: 0,
    micAutoNext: true,
    micSensitivity: 'normal',
    accompaniment: true,
    timing: 'easy',
    lastBackupAt: 0,
    onboardedAt: 0,
  };
}

export function defaultData(now: Date = new Date()): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    curriculumRev: CURRICULUM_REV,
    learner: { name: '', createdAt: localDateStr(now) },
    settings: defaultSettings(),
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
    if (typeof st.accompaniment !== 'boolean') errs.push('settings.accompaniment');
    if (!['easy', 'normal', 'strict'].includes(st.timing as string)) errs.push('settings.timing');
    if (typeof st.lastBackupAt !== 'number') errs.push('settings.lastBackupAt');
    if (typeof st.onboardedAt !== 'number') errs.push('settings.onboardedAt');
  }
  const p = x.progress;
  if (!isObj(p)) errs.push('Thiếu progress');
  else {
    if (!Number.isInteger(p.currentWeek) || (p.currentWeek as number) < 1 || (p.currentWeek as number) > MAX_WEEK_LIMIT) errs.push('progress.currentWeek');
    if (!Array.isArray(p.lessonsCompleted)) errs.push('progress.lessonsCompleted');
    if (!isObj(p.practiceDays)) errs.push('progress.practiceDays');
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
            !Number.isFinite(r.bpm)
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
  return errs;
}
