import { CURRICULUM_REV, SCHEMA_VERSION, defaultData, defaultSettings, sanitizeGames, type AppData, type Session } from './schema';

/**
 * Migration theo schemaVersion. Hiện chỉ có v1 → chưa có bước nào.
 * Khi thêm v2: MIGRATIONS[1] = (d) => ({ ...d, schemaVersion: 2, ... }).
 */
type Migration = (data: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {};

export class MigrationError extends Error {}

/**
 * GIÁO TRÌNH rev 1 → rev 2 (OWNER duyệt 2026-10-05): chèn tuần 20 mới "Đọc nốt cao Đô5–Sol5".
 * Tuần 20–24 cũ → 21–25. Mọi mã có dạng "w<tuần>-…" (mã bài học "w20-l1", bài tự chọn ở thư viện
 * "w21-song-<bài>", buổi luyện mỗi ngày "w24-daily", sân khấu "w24-stage") được đánh số lại để tiêu chí tuần
 * (lessonEngine.sessionsOfWeek lọc theo tiền tố "w<tuần>-") và danh sách bài đã xong vẫn đúng tuần.
 * songRuns chỉ lưu mã BÀI HÁT (không có số tuần) → giữ nguyên.
 */
const OLD_FIRST = 20;
const OLD_LAST = 24;

/** Đánh số lại một mã từ rev 1 sang rev 2. */
export function renumberId(id: string): string {
  return id.replace(/^w(\d+)-/, (m, n: string) => {
    const w = Number(n);
    return w >= OLD_FIRST && w <= OLD_LAST ? `w${w + 1}-` : m;
  });
}

/**
 * GIÁO TRÌNH rev 2 (25 tuần) → rev 3 (30 tuần, giáo trình v5 — OWNER duyệt 2026-10-05).
 * Bảng OLD→NEW: tuần cũ → tuần MỚI nơi nội dung chính của tuần cũ nay nằm. Tuần mới không có tuần cũ tương ứng:
 * 5 (củng cố thế Đô), 9 (nhịp 2/4), 13 (củng cố hai tay), 18 (móc kép), 22 (dòng kẻ phụ & khuông lớn).
 */
export const REV3_WEEK_MAP: Readonly<Record<number, number>> = Object.freeze({
  1: 1, 2: 2, 3: 3, 4: 4,
  5: 6, // Sân khấu nhỏ (Bài ca niềm vui, to – nhỏ)
  6: 7, // Hồ Tấm Gương (tay trái)
  7: 8, // Thư viện Nốt (đọc khuông, nốt La)
  8: 10, // Lâu đài Âm nhạc (biểu diễn Cấp 1)
  9: 11, // Cầu Hai Tay
  10: 12, // Thung lũng Song Ca
  11: 14, // Núi Sol
  12: 15, // Vũ hội Valse
  13: 16, // Hang Phím Đen
  14: 17, // Sa mạc Nhịp Chấm
  15: 19, // Thác Gam
  16: 20, // Nhà hát Cấp 2
  17: 21, // Rừng Hợp Âm
  18: 23, // Biển Đổi Thế
  19: 24, // Thung lũng Vui Buồn
  20: 25, // Tháp Nốt Cao
  21: 28, // Cung điện Minuet
  22: 29, // Vườn Beethoven (Für Elise)
  23: 26, // Thư viện Lớn (đọc nhạc hai khóa)
  24: 27, // Đỉnh Hai Tay
  25: 30, // Đại hòa nhạc
});

/** Bài học được CHUYỂN sang tuần khác với tuần của nó (không theo bảng tuần). */
export const REV3_LESSON_MAP: Readonly<Record<string, string>> = Object.freeze({
  'w14-bkt': 'w18-bkt', // "Bắc kim thang" (có móc kép) → tuần 18 "Suối Móc Kép"
});

/** Đánh số lại một mã từ rev 2 sang rev 3 (mã bài học, "#hoạt động", "-song-", "-daily", "-stage"…). */
export function renumberIdRev3(id: string): string {
  const hash = id.indexOf('#');
  const base = hash >= 0 ? id.slice(0, hash) : id;
  const rest = hash >= 0 ? id.slice(hash) : '';
  if (REV3_LESSON_MAP[base]) return REV3_LESSON_MAP[base] + rest;
  return id.replace(/^w(\d+)-/, (m, n: string) => {
    const w = REV3_WEEK_MAP[Number(n)];
    return w ? `w${w}-` : m;
  });
}

/**
 * GIÁO TRÌNH rev 3 (30 tuần) → rev 4 (31 tuần, v5.1 — OWNER duyệt 2026-10-06 sau rà soát chuyên gia):
 * tuần 18 "Suối Móc Kép" quá tải (móc kép + Tập-tễnh + nghịch phách + dây nối) → TÁCH đôi:
 * tuần 18 giữ móc kép & Tập-tễnh (Thỏ con, Lý cây đa); tuần 19 MỚI "Phố Xích Lô" dạy nghịch phách & dây nối
 * (Xích lô dạo phố, Bắc kim thang). Tuần 19–30 cũ → 20–31 (+1).
 * Bài học CHUYỂN từ tuần 18 sang tuần 19 mới (đánh số chính xác, không theo bảng tuần):
 */
export const REV4_LESSON_MAP: Readonly<Record<string, string>> = Object.freeze({
  'w18-l3': 'w19-l1', // "Nghịch phách & dây nối" (Xích lô dạo phố)
  'w18-bkt': 'w19-bkt', // "Bắc kim thang"
});

/** Tuần rev 3 → rev 4: 1–18 giữ nguyên, ≥ 19 thì +1. */
export const rev4Week = (w: number): number => (w >= 19 ? w + 1 : w);

/** Đánh số lại một mã từ rev 3 sang rev 4 (mã bài học, "-song-", "-daily", "-stage"…). */
export function renumberIdRev4(id: string): string {
  const hash = id.indexOf('#');
  const base = hash >= 0 ? id.slice(0, hash) : id;
  const rest = hash >= 0 ? id.slice(hash) : '';
  if (REV4_LESSON_MAP[base]) return REV4_LESSON_MAP[base] + rest;
  return id.replace(/^w(\d+)-/, (_m, n: string) => `w${rev4Week(Number(n))}-`);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Đổi mã trong progress.lessonsCompleted và sessions[].lessonId; `week` đổi progress.currentWeek. */
function renumberAll(
  data: Record<string, unknown>,
  rev: number,
  id: (x: string) => string,
  week: (w: number) => number,
  keepDone: (x: string) => boolean = () => true,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data, curriculumRev: rev };
  if (isObj(data.progress)) {
    const prog = { ...data.progress };
    if (typeof prog.currentWeek === 'number') prog.currentWeek = week(prog.currentWeek);
    if (Array.isArray(prog.lessonsCompleted)) {
      prog.lessonsCompleted = prog.lessonsCompleted
        .filter((x) => typeof x !== 'string' || keepDone(x))
        .map((x) => (typeof x === 'string' ? id(x) : x));
    }
    out.progress = prog;
  }
  if (Array.isArray(data.sessions)) {
    out.sessions = data.sessions.map((s) =>
      isObj(s) && typeof s.lessonId === 'string' ? { ...s, lessonId: id(s.lessonId) } : s,
    );
  }
  return out;
}

/**
 * Chạy đúng MỘT lần cho mỗi bậc: dữ liệu thiếu `curriculumRev` = rev 1. rev 1 → 2 → 3 → 4 lần lượt; dữ liệu đã ở rev hiện tại
 * được trả về NGUYÊN (cùng object) — idempotent.
 */
export function migrateCurriculum(data: Record<string, unknown>): Record<string, unknown> {
  const rev = typeof data.curriculumRev === 'number' ? data.curriculumRev : 1;
  if (rev >= CURRICULUM_REV) return data;
  let out = data;
  if (rev < 2) {
    // Bé đang ở tuần 20 cũ (Minuet, chưa qua) → ở lại tuần 20 MỚI "Đọc nốt cao" để được chuẩn bị trước Minuet
    // (bài đã làm của tuần 20 cũ vẫn chuyển sang w21- nên không mất); từ tuần 21 cũ trở đi thì +1.
    out = renumberAll(out, 2, renumberId, (w) => (w > OLD_FIRST ? w + 1 : w));
  }
  if (rev < 3) {
    // Bé đang học dở tuần cũ X → sang tuần MỚI chứa nội dung của X (REV3_WEEK_MAP). Tuần mới chèn TRƯỚC đó coi như đã qua
    // (bé đã có kỹ năng — vẫn mở trong Thư viện/ôn tập). Dấu "đã xong một phần bài" ("<bài>#<i>") bị BỎ: nhiều bài được
    // thêm hoạt động khởi động kỹ thuật ở đầu nên số thứ tự hoạt động đã đổi — bài dở sẽ học lại trọn (an toàn hơn đánh dấu sai).
    out = renumberAll(out, 3, renumberIdRev3, (w) => REV3_WEEK_MAP[w] ?? (w > 25 ? w + 5 : w), (x) => !x.includes('#'));
  }
  if (rev < 4) {
    // Bé đang ở tuần 18 → ở lại tuần 18 (bài "Nghịch phách"/"Bắc kim thang" đã học vẫn được tính, nay ở tuần 19);
    // từ tuần 19 trở đi +1. Dấu "đã xong một phần bài" bị BỎ (v5.1 rút gọn buổi: bỏ hoạt động khởi động kỹ thuật
    // trong bài, dời lượt băng chuyền… → số thứ tự hoạt động đã đổi) — bài dở sẽ học lại trọn.
    out = renumberAll(out, 4, renumberIdRev4, rev4Week, (x) => !x.includes('#'));
  }
  return out;
}

/**
 * (+ 2026-10-06) Dữ liệu do BẢN APP MỚI HƠN ghi (schemaVersion hoặc curriculumRev lớn hơn bản này hiểu)?
 * ProgressStore KHÔNG được coi là hỏng / đặt lại / ghi đè — giữ nguyên và báo "hãy cập nhật app".
 */
export function isFutureData(raw: unknown): boolean {
  if (!isObj(raw)) return false;
  return (
    (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION) ||
    (typeof raw.curriculumRev === 'number' && raw.curriculumRev > CURRICULUM_REV)
  );
}

/** Nâng dữ liệu thô lên phiên bản hiện tại và điền mặc định cho trường thiếu. */
export function migrate(raw: unknown): AppData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new MigrationError('Dữ liệu không hợp lệ');
  }
  let data = raw as Record<string, unknown>;
  if (typeof data.schemaVersion !== 'number') throw new MigrationError('Thiếu schemaVersion');
  let v: number = data.schemaVersion;
  if (v > SCHEMA_VERSION) throw new MigrationError(`Dữ liệu từ phiên bản mới hơn (v${v})`);
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new MigrationError(`Không có migration từ v${v}`);
    data = step(data);
    v = data.schemaVersion as number;
  }
  // Trước fillDefaults (mặc định đã là rev mới — phải đọc rev của dữ liệu THÔ)
  data = migrateCurriculum(data);
  return fillDefaults(data);
}

function fillDefaults(d: Record<string, unknown>): AppData {
  const base = defaultData();
  const out = { ...base, ...d } as AppData;
  out.learner = { ...base.learner, ...(d.learner as object) };
  out.settings = { ...defaultSettings(), ...(d.settings as object) };
  // (2026-10-06) autoAdvance nay mặc định BẬT (bé tự sang nốt sau khi đúng). Dữ liệu cũ chưa có cờ → bật MỘT lần;
  // từ đó lựa chọn của phụ huynh được giữ nguyên (cờ autoAdvanceMigrated).
  if (!isObj(d.settings) || d.settings.autoAdvanceMigrated !== true) {
    out.settings.autoAdvance = true;
    out.settings.autoAdvanceMigrated = true;
  }
  out.progress = { ...base.progress, ...(d.progress as object) };
  out.sessions = Array.isArray(d.sessions)
    ? (d.sessions as Partial<Session>[]).map(
        (s) =>
          ({
          parentAssessments: [],
          appAssessments: [],
          micAssessments: [],
          songRuns: [],
          selfRating: null,
          startedAt: 0,
          endedAt: null,
          minutes: 0,
          completed: false,
          checklist: {},
          ...s,
          }) as Session, // id/date/lessonId được validateAppData kiểm tra sau

      )
    : [];
  // (+ 2026-10-07) Kỷ lục trò chơi: dễ tính — mục hỏng bị bỏ, không làm hỏng cả dữ liệu
  const games = sanitizeGames(d.games);
  if (games) out.games = games;
  else delete out.games;
  return out;
}
