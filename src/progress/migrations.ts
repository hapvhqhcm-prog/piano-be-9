import { CURRICULUM_REV, SCHEMA_VERSION, defaultData, defaultSettings, type AppData, type Session } from './schema';

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
 * Chạy đúng MỘT lần: dữ liệu thiếu `curriculumRev` (hoặc < 2) mới được đổi; sau đó gắn curriculumRev = 2.
 */
const OLD_FIRST = 20;
const OLD_LAST = 24;

export function renumberId(id: string): string {
  return id.replace(/^w(\d+)-/, (m, n: string) => {
    const w = Number(n);
    return w >= OLD_FIRST && w <= OLD_LAST ? `w${w + 1}-` : m;
  });
}

export function migrateCurriculum(data: Record<string, unknown>): Record<string, unknown> {
  const rev = typeof data.curriculumRev === 'number' ? data.curriculumRev : 1;
  if (rev >= CURRICULUM_REV) return data;
  const out: Record<string, unknown> = { ...data, curriculumRev: CURRICULUM_REV };
  const p = data.progress;
  if (typeof p === 'object' && p !== null && !Array.isArray(p)) {
    const prog = { ...(p as Record<string, unknown>) };
    // Bé đang ở tuần 20 cũ (Minuet, chưa qua) → ở lại tuần 20 MỚI "Đọc nốt cao" để được chuẩn bị trước Minuet
    // (bài đã làm của tuần 20 cũ vẫn chuyển sang w21- nên không mất); từ tuần 21 cũ trở đi thì +1.
    if (typeof prog.currentWeek === 'number' && prog.currentWeek > OLD_FIRST) prog.currentWeek = prog.currentWeek + 1;
    if (Array.isArray(prog.lessonsCompleted)) {
      prog.lessonsCompleted = prog.lessonsCompleted.map((x) => (typeof x === 'string' ? renumberId(x) : x));
    }
    out.progress = prog;
  }
  if (Array.isArray(data.sessions)) {
    out.sessions = data.sessions.map((s) =>
      typeof s === 'object' && s !== null && typeof (s as Record<string, unknown>).lessonId === 'string'
        ? { ...s, lessonId: renumberId((s as Record<string, unknown>).lessonId as string) }
        : s,
    );
  }
  return out;
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
  return out;
}
