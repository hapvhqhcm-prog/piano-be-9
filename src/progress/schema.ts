/**
 * STORAGE SCHEMA v1 (§7). Các trường có đánh dấu (+) là bổ sung so với ví dụ §7,
 * chỉ THÊM, không đổi nghĩa trường cũ — vẫn schemaVersion = 1.
 */

export const SCHEMA_VERSION = 1 as const;

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
}

export interface Progress {
  currentWeek: number;
  lessonsCompleted: string[];
  practiceDays: Record<string, { minutes: number; stars: number }>;
}

export interface AppData {
  schemaVersion: 1;
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
  };
}

export function defaultData(now: Date = new Date()): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
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
  }
  const p = x.progress;
  if (!isObj(p)) errs.push('Thiếu progress');
  else {
    if (typeof p.currentWeek !== 'number' || p.currentWeek < 1 || p.currentWeek > 8) errs.push('progress.currentWeek');
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
    });
  }
  return errs;
}
