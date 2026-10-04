import { SCHEMA_VERSION, defaultData, defaultSettings, type AppData, type Session } from './schema';

/**
 * Migration theo schemaVersion. Hiện chỉ có v1 → chưa có bước nào.
 * Khi thêm v2: MIGRATIONS[1] = (d) => ({ ...d, schemaVersion: 2, ... }).
 */
type Migration = (data: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {};

export class MigrationError extends Error {}

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
