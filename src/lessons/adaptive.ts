/**
 * (+ 2026-10-16, OWNER duyệt — "Tự cân độ khó theo bé") Giữ bé trong vùng ~75–85% thành công như một người thầy:
 * CHỈ SỐ THÀNH CÔNG cuộn trên 3–5 buổi gần nhất → chế độ của các buổi TỚI:
 * - 'gentle' (nhẹ tay): bé vấp nhiều → buổi học tách bài làm hai (≤ 1 hoạt động MỚI mỗi buổi — mã bài / chỉ số hoạt động
 *   KHÔNG đổi, học tiếp nhờ dấu "<bài>#<i>" sẵn có), ưu tiên ôn / bài tập về nhà; (+ 2026-10-17) mở tốc độ 40 CHỈ cho bài
 *   bé chưa đạt lần nào (bài đã đạt mở như thường; tên nốt & màu theo độ quen của bài như mọi buổi).
 * - 'stretch' (thêm thử thách nhỏ): bé làm rất tốt → MỘT thử thách TÙY CHỌN ở màn kết (thử nhanh hơn / đọc nhạc / bài
 *   Thư viện cao hơn một bậc). Không bao giờ bỏ bước giáo trình, không đổi tiêu chí tuần.
 * - 'normal': như cũ.
 * AN TOÀN TIẾN ĐỘ: chỉ đổi CÁCH chia buổi / tốc độ mở / gợi ý — tiêu chí tuần, "đã thuộc", mã bài không đổi.
 * (+ 2026-10-17, hiệu chỉnh theo rà soát giáo viên — "nhẹ tay" bật ~51% buổi ở bé trung bình trong mô phỏng) Chỉ số lấy LƯỢT
 * TỐT NHẤT của mỗi bài trong buổi; "dừng nhẹ nhàng" một định nghĩa (Session.kindStops); bài tập về nhà có hạn cố định.
 * Ngưỡng giữ nguyên (GENTLE_BELOW 0,65 · GENTLE_KIND_STOPS 2 · GENTLE_HOMEWORK_BELOW 0,75 · STRETCH_ABOVE 0,92). Mô phỏng
 * tests/review-2026-10-17.test.ts: bé trung bình ~6% buổi nhẹ tay, bé chậm ~65%, bé giỏi ~2%.
 * Module THUẦN, chỉ phụ thuộc progress/schema + progress/history + lessons/sessionKind (songStats.ts nhập module này —
 * KHÔNG nhập ngược để tránh vòng import). Test: tests/adaptive-2026-10-16.test.ts.
 */
import { localDateStr, type AppData, type Session } from '../progress/schema';
import { memo } from '../progress/history';
import { STRETCH_LESSON_PREFIX, countsForDifficulty } from './sessionKind';

export type DifficultyMode = 'gentle' | 'normal' | 'stretch';

/** Số buổi gần nhất (có dữ liệu chấm) dùng tính chỉ số. */
export const DIFFICULTY_WINDOW = 5;
/** Cần ít nhất ngần này buổi có dữ liệu mới đổi chế độ (ít hơn → 'normal'). */
export const DIFFICULTY_MIN_SESSIONS = 3;
/** Dưới ngưỡng này (trên DIFFICULTY_WINDOW buổi) → nhẹ tay. */
export const GENTLE_BELOW = 0.65;
/** Số buổi có "dừng nhẹ nhàng" trong cửa sổ → nhẹ tay. */
export const GENTLE_KIND_STOPS = 2;
/** Còn bài tập về nhà chưa xong + chỉ số dưới ngưỡng này (hoặc có 1 lần dừng nhẹ nhàng) → nhẹ tay. */
export const GENTLE_HOMEWORK_BELOW = 0.75;
/** Trên ngưỡng này ở STRETCH_SESSIONS buổi gần nhất, không lượt nào chưa đạt → thêm thử thách nhỏ. */
export const STRETCH_ABOVE = 0.92;
export const STRETCH_SESSIONS = 3;
/** Nhẹ tay: tốc độ mở sẵn tối đa cho lượt theo nhịp. */
export const GENTLE_START_BPM = 40;

/* ---------- "Dừng nhẹ nhàng" (chuyển từ rewardSongs.ts — rewardSongs export lại) ---------- */

/** Một bài thử chưa được ngần này lần trong buổi = buổi có "dừng nhẹ nhàng" (songResult MAX_TRIES). */
export const KIND_STOP_TRIES = 3;

/**
 * Buổi có lần "dừng nhẹ nhàng". (+ 2026-10-17, rà soát kỹ sư trưởng) MỘT định nghĩa duy nhất = màn bài hát của một HOẠT ĐỘNG
 * BÀI HỌC đã hiện thẻ "Hôm nay con cố gắng lắm rồi…" (songResult.stopCard 'tired' — MAX_TRIES lần thử chưa được trong MỘT lần
 * mở bài). session.ts ghi TƯỜNG MINH vào `Session.kindStops` (mã bài) đúng lúc thẻ hiện; không ghi cho đọc nhạc, bài tập về nhà,
 * "Ôn bài cũ", lượt tách tay, Thư viện / bài thưởng / thử thách. Dùng chung cho chỉ số độ khó (adaptive) và bài thưởng
 * (rewardSongs.rewardEligible).
 * Buổi CŨ (trước khi có trường này — `kindStops` không có): đoán như trước (một bài ≥ KIND_STOP_TRIES lượt chưa đạt liền,
 * không có lượt đạt sau đó) nhưng BỎ lượt đọc nhạc (mọi đoạn đọc nhạc chung một mã `sight:<thế>:<tay>` → dừng giả) và lượt
 * tách tay.
 */
export function hadKindStop(s: Pick<Session, 'songRuns'> & { kindStops?: readonly string[] }): boolean {
  if (Array.isArray(s.kindStops)) return s.kindStops.length > 0;
  const fails = new Map<string, number>();
  for (const r of [...s.songRuns].sort((a, b) => a.ts - b.ts)) {
    if (r.songId.startsWith('sight') || r.hand) continue;
    if (r.passed) fails.set(r.songId, 0);
    else fails.set(r.songId, (fails.get(r.songId) ?? 0) + 1);
  }
  return [...fails.values()].some((n) => n >= KIND_STOP_TRIES);
}

/* ---------- Chỉ số thành công ---------- */

/** Buổi TÙY CHỌN (bài thưởng, thử thách nhỏ) — không tính vào chỉ số (thử thách chưa được không làm buổi sau nhẹ đi). */
export { STRETCH_LESSON_PREFIX };
const optionalSession = (s: Pick<Session, 'lessonId'>) => !countsForDifficulty(s.lessonId);

/** Ghi chép của bố mẹ là kết quả của BÉ (nốt, hát…) — không tính thẻ "Con làm thầy", huy chương, khởi động tay. */
const isPitchNote = (note: string) => /^(sing:|singplay:)?[A-G](#|b)?\d/.test(note);

export interface SessionScore {
  /** Số mục đúng / tổng theo từng loại */
  mic: [number, number];
  runs: [number, number];
  quiz: [number, number];
  parent: [number, number];
  kindStop: boolean;
  /** Có bài (lượt tốt nhất) chưa đạt */
  failedRun: boolean;
}

export function scoreSession(s: Session): SessionScore {
  const mic: [number, number] = [0, 0];
  for (const a of s.micAssessments) {
    mic[1]++;
    if (a.parentOverride ? a.parentOverride === 'correct' : a.firstTry) mic[0]++;
  }
  // (+ 2026-10-17, hiệu chỉnh theo rà soát giáo viên: "nhẹ tay" bật 51% buổi ở bé trung bình) MỖI BÀI MỘT PHIẾU: lượt TỐT NHẤT
  // của từng bài trong buổi (đạt nếu có lượt đạt) — trước đây mỗi lượt thử lại chưa đạt đều kéo chỉ số xuống, trong khi thử
  // lại vài lần rồi đạt chính là "vừa sức". Đoạn đọc nhạc (mọi đoạn chung một mã) — mỗi lượt một phiếu như cũ.
  const runs: [number, number] = [0, 0];
  const best = new Map<string, boolean>();
  for (const r of s.songRuns) {
    if (r.songId.startsWith('sight')) {
      runs[1]++;
      if (r.passed) runs[0]++;
    } else best.set(r.songId, (best.get(r.songId) ?? false) || r.passed);
  }
  for (const ok of best.values()) {
    runs[1]++;
    if (ok) runs[0]++;
  }
  const quiz: [number, number] = [s.appAssessments.filter((a) => a.correct).length, s.appAssessments.length];
  const pa = s.parentAssessments.filter((a) => isPitchNote(a.note));
  const parent: [number, number] = [pa.filter((a) => a.result === 'correct').length, pa.length];
  return { mic, runs, quiz, parent, kindStop: hadKindStop(s), failedRun: runs[0] < runs[1] };
}

const graded = (sc: SessionScore) => sc.mic[1] + sc.runs[1] + sc.quiz[1] + sc.parent[1] > 0;

/**
 * Chỉ số thành công của các buổi: TRUNG BÌNH các tỉ lệ theo loại (nốt micro đúng ngay lần đầu · lượt bài hát đạt · câu đố
 * đúng · nốt bố mẹ chấm đúng) — mỗi loại một phiếu, để hàng trăm nốt micro không lấn lượt bài hát. null = không có dữ liệu.
 */
export function successIndex(scores: readonly SessionScore[]): number | null {
  const sum = (k: 'mic' | 'runs' | 'quiz' | 'parent') => scores.reduce<[number, number]>((a, s) => [a[0] + s[k][0], a[1] + s[k][1]], [0, 0]);
  const ratios = (['mic', 'runs', 'quiz', 'parent'] as const).map(sum).filter(([, n]) => n > 0).map(([ok, n]) => ok / n);
  return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
}

/**
 * Bài tập về nhà còn chờ — CÙNG luật với homework.pendingHomework (homework.ts nhập songStats → nhập module này, nên ở đây
 * đọc mềm, không nhập ngược). (+ 2026-10-17) Hạn tính từ lúc giao LẦN ĐẦU (since / sinceDate): ≤ 3 ngày lịch và < 5 lượt chưa
 * đạt (homework.HOMEWORK_TRY_DAYS / HOMEWORK_MAX_FAILS) — trước đây mỗi lượt chưa đạt giao lại với ngày mới → bài tập không bao
 * giờ hết hạn → "nhẹ tay" tự nuôi mình.
 */
function homeworkBacklog(data: Readonly<AppData>, today: string, now: number): boolean {
  const h = (data.settings as { homework?: { date?: unknown; at?: unknown; since?: unknown; sinceDate?: unknown; fails?: unknown } | null }).homework;
  if (!h || typeof h.date !== 'string' || typeof h.at !== 'number' || !(h.date < today)) return false;
  const at = typeof h.since === 'number' ? h.since : h.at;
  const date = typeof h.sinceDate === 'string' ? h.sinceDate : h.date;
  const fails = typeof h.fails === 'number' ? h.fails : 0;
  const days = Math.round((Date.UTC(...ymd(today)) - Date.UTC(...ymd(date))) / 86_400_000);
  return fails < 5 && days <= 3 && now - at <= 14 * 86_400_000;
}
const ymd = (s: string): [number, number, number] => {
  const [y, m, d] = s.split('-').map(Number);
  return [y, (m || 1) - 1, d || 1];
};

export interface Difficulty {
  mode: DifficultyMode;
  /** Chỉ số trên cửa sổ (0…1); null = chưa đủ dữ liệu */
  index: number | null;
  /** Số buổi có dữ liệu đã xét (≤ DIFFICULTY_WINDOW) */
  sessions: number;
  kindStops: number;
  homework: boolean;
  /** Lý do (cho test / màn Phụ huynh) */
  why: 'little-data' | 'low' | 'kind-stops' | 'homework' | 'cruising' | 'ok';
}

/**
 * Chế độ độ khó cho buổi TỚI (hàm thuần; ghi nhớ theo phiên bản dữ liệu + ngày). Bỏ qua buổi tùy chọn và buổi đang mở hôm
 * nay (chưa kết thúc) — chế độ không đổi giữa chừng buổi học.
 */
export function difficulty(data: Readonly<AppData>, now: number | Date = Date.now()): Difficulty {
  const ms = typeof now === 'number' ? now : now.getTime();
  const today = localDateStr(new Date(ms));
  const hw = homeworkBacklog(data, today, ms);
  return memo(data, `difficulty:${today}:${hw ? 1 : 0}`, () => compute(data, today, hw));
}

function compute(data: Readonly<AppData>, today: string, homework: boolean): Difficulty {
  const done = data.sessions
    .filter((s) => !optionalSession(s) && !(s.endedAt === null && s.date === today))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map(scoreSession)
    .filter(graded);
  const win = done.slice(-DIFFICULTY_WINDOW);
  const base = { sessions: win.length, homework, kindStops: win.filter((s) => s.kindStop).length };
  if (win.length < DIFFICULTY_MIN_SESSIONS) return { ...base, mode: 'normal', index: successIndex(win), why: 'little-data' };
  const index = successIndex(win)!;
  if (base.kindStops >= GENTLE_KIND_STOPS) return { ...base, mode: 'gentle', index, why: 'kind-stops' };
  if (index < GENTLE_BELOW) return { ...base, mode: 'gentle', index, why: 'low' };
  if (homework && (index < GENTLE_HOMEWORK_BELOW || base.kindStops >= 1)) return { ...base, mode: 'gentle', index, why: 'homework' };
  const last = win.slice(-STRETCH_SESSIONS);
  const lastIndex = successIndex(last) ?? 0;
  if (!homework && base.kindStops === 0 && lastIndex > STRETCH_ABOVE && !last.some((s) => s.failedRun)) {
    return { ...base, mode: 'stretch', index, why: 'cruising' };
  }
  return { ...base, mode: 'normal', index, why: 'ok' };
}

/** Dòng cho bố mẹ (màn Phụ huynh, báo cáo tuần). */
export function difficultyText(d: Pick<Difficulty, 'mode'>): string {
  switch (d.mode) {
    case 'gentle':
      return 'Đang nhẹ tay vì con vấp nhiều — 2 buổi tới ôn kỹ';
    case 'stretch':
      return 'Con đang làm tốt — thêm thử thách nhỏ';
    default:
      return 'Độ khó đang vừa sức con';
  }
}

/** Nhẹ tay: tốc độ mở sẵn của lượt theo nhịp (≤ 40; bài vốn chậm hơn giữ tốc độ bài). */
export function adaptiveStartBpm(bpm: number, data: Readonly<AppData>, now: number | Date = Date.now()): number {
  return difficulty(data, now).mode === 'gentle' ? Math.min(bpm, GENTLE_START_BPM) : bpm;
}
