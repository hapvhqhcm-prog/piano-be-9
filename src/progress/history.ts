/**
 * (+ 2026-10-06) Đọc lịch sử = TỔNG HỢP đã gộp (AppData.history — progress/compaction.ts) + các buổi còn giữ (data.sessions).
 *
 * Module THUẦN, không phụ thuộc lessonEngine (tránh vòng import). Các hàm đọc riêng của giáo trình (bài đã thuộc, trí nhớ
 * nốt, tiêu chí tuần…) nằm ở lessons/lessonEngine.ts và cũng dùng "tổng hợp + buổi còn giữ".
 *
 * Ghi nhớ (memo) theo PHIÊN BẢN dữ liệu: ProgressStore gắn số phiên bản (DATA_REV, không liệt kê — không vào JSON) vào
 * object dữ liệu và tăng mỗi lần đổi. Dữ liệu không có số phiên bản (test, bản sao `{ ...data }`) → luôn tính lại.
 */
import type { AppData, CountPair, History, SelfRating } from './schema';

/**
 * Sao thưởng cho việc HOÀN THÀNH buổi — bằng nhau cho mọi câu trả lời: bé nói thật "khó quá" không bị ít sao hơn.
 * Câu bé tự chọn chỉ là thông tin cho bố mẹ (màn Phụ huynh). (Chuyển từ ProgressStore — vẫn được export lại ở đó.)
 */
export const RATING_STARS: Record<SelfRating, number> = { all: 3, some: 3, hard: 3 };

/* ---------------- Ghi nhớ theo phiên bản dữ liệu ---------------- */

/** Khóa (symbol, không liệt kê) chứa số phiên bản dữ liệu do ProgressStore gắn. */
export const DATA_REV: unique symbol = Symbol('piano-be-9.dataRev');

/** Gắn / tăng số phiên bản dữ liệu (ProgressStore gọi sau mỗi lần đổi). */
export function bumpDataRev(data: AppData): void {
  const cur = (data as unknown as Record<symbol, number | undefined>)[DATA_REV];
  Object.defineProperty(data, DATA_REV, { value: (cur ?? 0) + 1, writable: true, configurable: true, enumerable: false });
}

const memoStore = new WeakMap<object, { rev: number; values: Map<string, unknown> }>();

/**
 * "Dấu vân tay" rẻ (O(số buổi)) cho dữ liệu KHÔNG có số phiên bản (test, dữ liệu dựng tay): đổi khi thêm/bớt buổi,
 * bản ghi, hoàn thành buổi, đổi tuần / bài đã xong, hoặc thay mảng sessions / history.
 */
const fpIds = new WeakMap<object, number>();
let fpNext = 1;
const idOf = (o: object | undefined) => {
  if (!o) return 0;
  let id = fpIds.get(o);
  if (id === undefined) fpIds.set(o, (id = fpNext++));
  return id;
};
function fingerprint(data: Readonly<AppData>): number {
  let h = data.sessions.length * 31 + data.progress.currentWeek * 7 + data.progress.lessonsCompleted.length * 131;
  for (const s of data.sessions) {
    h = (h * 33 + s.parentAssessments.length + s.appAssessments.length * 3 + s.micAssessments.length * 5 + s.songRuns.length * 7 + (s.completed ? 11 : 0)) | 0;
  }
  return (h * 31 + idOf(data.sessions) * 17 + idOf(data.history)) | 0;
}

/**
 * Tính `compute()` một lần cho mỗi phiên bản dữ liệu. Dữ liệu của ProgressStore có số phiên bản (DATA_REV);
 * dữ liệu khác dùng dấu vân tay (fingerprint) — vẫn đúng nếu có thêm bản ghi, nhưng sửa TẠI CHỖ một bản ghi
 * (vd đổi passed của lượt chơi) thì hãy dùng dữ liệu mới (bản sao).
 */
export function memo<T>(data: Readonly<AppData>, key: string, compute: () => T): T {
  const rev = (data as unknown as Record<symbol, number | undefined>)[DATA_REV] ?? -1 - Math.abs(fingerprint(data));
  let e = memoStore.get(data);
  if (!e || e.rev !== rev) {
    e = { rev, values: new Map() };
    memoStore.set(data, e);
  }
  if (e.values.has(key)) return e.values.get(key) as T;
  const v = compute();
  e.values.set(key, v);
  return v;
}

/* ---------------- Tổng hợp ---------------- */

export function emptyHistory(): History {
  return {
    v: 1,
    compactedThrough: '0000-00-00',
    sessions: 0,
    completed: 0,
    counted: 0,
    firstDate: null,
    lastDate: null,
    practiceDays: {},
    weeks: {},
    songs: {},
    targets: {},
    micPerfect: false,
    dynamicsDone: [],
    dynamicsRounds: 0,
    passedWeeks: [],
    stickers: [],
    skills: { reading: [0, 0], ear: [0, 0], rhythm: [0, 0] },
    parent: { p: {}, a: {}, m: {}, find: [0, 0], ear: [0, 0], tempo: [0, 0], sight: [0, 0] },
  };
}

const EMPTY: History = emptyHistory();

/** Tổng hợp của dữ liệu (chỉ ĐỌC — không có thì là tổng hợp rỗng dùng chung, không được sửa). */
export function hist(data: Readonly<AppData>): Readonly<History> {
  return data.history ?? EMPTY;
}

/** Tổng số buổi từng có (đã gộp + còn giữ) — thay cho `data.sessions.length`. */
export function sessionCount(data: Readonly<AppData>): number {
  return hist(data).sessions + data.sessions.length;
}

/** Tổng số buổi đã HOÀN THÀNH từng có. */
export function completedSessionCount(data: Readonly<AppData>): number {
  let n = hist(data).completed;
  for (const s of data.sessions) if (s.completed) n++;
  return n;
}

/** Ngày của buổi đầu tiên từng có (null = chưa có buổi nào). */
export function firstSessionDate(data: Readonly<AppData>): string | null {
  let m = hist(data).firstDate;
  for (const s of data.sessions) if (m === null || s.date < m) m = s.date;
  return m;
}

/** Buổi có nội dung (không phải mở rồi thoát ngay) — cùng quy tắc ProgressStore.isEmptySession. */
const nonEmpty = (s: AppData['sessions'][number]) =>
  s.completed ||
  s.selfRating !== null ||
  s.parentAssessments.length > 0 ||
  s.appAssessments.length > 0 ||
  s.micAssessments.length > 0 ||
  s.songRuns.length > 0;

/**
 * Ngày của buổi CÓ NỘI DUNG gần nhất (đã gộp + còn giữ); null = chưa học buổi nào.
 * Dùng cho "mừng con quay lại" (tonight.daysSinceLastPractice) thay cho vòng lặp data.sessions.
 */
export function lastSessionDate(data: Readonly<AppData>): string | null {
  let m = hist(data).lastDate ?? null;
  for (const s of data.sessions) if (nonEmpty(s) && (m === null || s.date > m)) m = s.date;
  return m;
}

/** Tuần giáo trình của mã bài ("w12-l3" → 12); null = không theo tuần. */
export function weekOfLessonId(lessonId: string): number | null {
  const m = /^w(\d+)-/.exec(lessonId);
  return m ? Number(m[1]) : null;
}

/**
 * Ngày SỚM NHẤT có buổi (có nội dung) của tuần giáo trình `week` — gồm cả buổi đã gộp (history.weekFirst).
 * null = chưa có buổi nào của tuần đó. Dùng cho đèn "bé đã ở tuần này N ngày" (tonight.readiness).
 */
export function firstDateOfWeek(data: Readonly<AppData>, week: number): string | null {
  let m: string | null = hist(data).weekFirst?.[String(week)] ?? null;
  const prefix = `w${week}-`;
  for (const s of data.sessions) if (s.lessonId.startsWith(prefix) && nonEmpty(s) && (m === null || s.date < m)) m = s.date;
  return m;
}

/* ---------------- Ngày / tuần lịch ---------------- */

export const dayKey = (x: Date): string =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

/** Thứ 2 của tuần chứa ngày "YYYY-MM-DD". */
export function mondayKey(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const x = new Date(y, m - 1, d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return dayKey(x);
}

/** Thứ trong tuần của "YYYY-MM-DD": 0 = thứ 2 … 6 = chủ nhật. */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** Ngày thứ `i` (0 = thứ 2) của tuần bắt đầu `monday`. */
function dayOfWeek(monday: string, i: number): string {
  const [y, m, d] = monday.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + i));
}

/** Mọi ngày có ít nhất một buổi HOÀN THÀNH (đã gộp + còn giữ). Chuỗi ngày, sticker chuỗi ngày cũ… */
export function completedDates(data: Readonly<AppData>): ReadonlySet<string> {
  return memo(data, 'completedDates', () => {
    const out = new Set<string>();
    for (const [monday, [mask]] of Object.entries(hist(data).weeks)) {
      for (let i = 0; i < 7; i++) if (mask & (1 << i)) out.add(dayOfWeek(monday, i));
    }
    for (const s of data.sessions) if (s.completed) out.add(s.date);
    return out;
  });
}

/* ---------------- Màn phụ huynh: bảng tổng hợp ---------------- */

export interface ParentStats {
  /** PARENT_ASSESSMENT theo nốt / việc: c = "Đúng rồi", r = "Thử lại" */
  pAgg: Map<string, { c: number; r: number }>;
  /** APP_ASSESSMENT theo nốt app phát: c = đúng, t = tổng */
  aAgg: Map<string, { c: number; t: number }>;
  /** MIC_ASSESSMENT theo nốt: t = hoàn thành, first = đúng ngay (không bị sửa thành sai), over = bố mẹ sửa */
  micAgg: Map<string, { t: number; first: number; over: number }>;
  /** "Kỹ năng của con" — ok / all */
  skills: {
    /** Tìm đúng nốt trên đàn (bố mẹ chấm nốt A–G + micro đúng ngay) */
    find: { ok: number; all: number };
    /** Nghe & đọc nốt (trò chơi: tên nốt, lên/xuống, bước/nhảy, vui/buồn) */
    ear: { ok: number; all: number };
    /** Giữ nhịp cả bài (lượt theo nhịp, không tập một câu) */
    tempo: { ok: number; all: number };
    /** Đọc nhạc ngẫu nhiên */
    sight: { ok: number; all: number };
  };
}

const EAR_APP = new Set(['up', 'down', 'step', 'skip', 'major', 'minor']);

/**
 * Bảng tổng hợp TỪ ĐẦU cho màn Phụ huynh (pAgg / aAgg / micAgg + "Kỹ năng của con") = tổng hợp đã gộp + buổi còn giữ.
 * Cùng quy tắc với mã cũ trong ui/screens/parent.ts. Các danh sách "gần đây" (10 lượt chơi gần nhất…) vẫn đọc data.sessions.
 */
export function parentStats(data: Readonly<AppData>): ParentStats {
  return memo(data, 'parentStats', () => {
    const h = hist(data).parent;
    const pAgg = new Map<string, { c: number; r: number }>();
    const aAgg = new Map<string, { c: number; t: number }>();
    const micAgg = new Map<string, { t: number; first: number; over: number }>();
    for (const [k, [c, r]] of Object.entries(h.p)) pAgg.set(k, { c, r });
    for (const [k, [c, t]] of Object.entries(h.a)) aAgg.set(k, { c, t });
    for (const [k, [t, first, over]] of Object.entries(h.m)) micAgg.set(k, { t, first, over });
    const pair = (p: CountPair) => ({ ok: p[0], all: p[1] });
    const skills = { find: pair(h.find), ear: pair(h.ear), tempo: pair(h.tempo), sight: pair(h.sight) };
    for (const s of data.sessions) foldParentStats(s, pAgg, aAgg, micAgg, skills);
    return { pAgg, aAgg, micAgg, skills };
  });
}

/** Cộng một buổi vào bảng phụ huynh (dùng chung cho đọc trực tiếp và gộp). */
export function foldParentStats(
  s: AppData['sessions'][number],
  pAgg: Map<string, { c: number; r: number }>,
  aAgg: Map<string, { c: number; t: number }>,
  micAgg: Map<string, { t: number; first: number; over: number }>,
  skills: ParentStats['skills'],
): void {
  for (const a of s.parentAssessments) {
    const e = pAgg.get(a.note) ?? { c: 0, r: 0 };
    if (a.result === 'correct') e.c++;
    else e.r++;
    pAgg.set(a.note, e);
    if (/^[A-G]/.test(a.note)) {
      skills.find.all++;
      if (a.result === 'correct') skills.find.ok++;
    }
  }
  for (const a of s.appAssessments) {
    const e = aAgg.get(a.expected) ?? { c: 0, t: 0 };
    e.t++;
    if (a.correct) e.c++;
    aAgg.set(a.expected, e);
    if (/^[A-G]/.test(a.expected) || EAR_APP.has(a.expected)) {
      skills.ear.all++;
      if (a.correct) skills.ear.ok++;
    }
  }
  for (const a of s.micAssessments) {
    const e = micAgg.get(a.expected) ?? { t: 0, first: 0, over: 0 };
    e.t++;
    if (a.firstTry && a.parentOverride !== 'retry') e.first++;
    if (a.parentOverride) e.over++;
    micAgg.set(a.expected, e);
    skills.find.all++;
    if (a.firstTry) skills.find.ok++;
  }
  for (const r of s.songRuns) {
    if (r.mode === 'tempo' && !r.phrase) {
      skills.tempo.all++;
      if (r.passed) skills.tempo.ok++;
    }
    if (r.songId.startsWith('sight')) {
      skills.sight.all++;
      if (r.passed) skills.sight.ok++;
    }
  }
}
