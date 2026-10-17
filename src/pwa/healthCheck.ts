/**
 * (+ 2026-10-17, OWNER duyệt) 🩺 KIỂM TRA SỨC KHỎE APP hằng tháng (~3 phút, bố mẹ làm) — phần THUẦN (không DOM, test được).
 * Màn: src/ui/screens/healthCheck.ts (nạp muộn). Lời "⚠️" trên nút Phụ huynh: healthFlags().
 *
 * HỢP ĐỒNG với phần phát hiện đổi iPadOS / vắng lâu (agent "real-world", src/pwa): họ ĐIỀN `HealthEnv` (osChanged,
 * daysAway, wakeLockDenied, voiceLost…) — hai hàm dưới đây chỉ đọc env + dữ liệu, không tự đo gì. Muốn thêm lý do / cờ
 * mới: thêm một trường tùy chọn vào HealthEnv + một nhánh trong hàm (giữ hàm thuần, có test: tests/healthCheck.test.ts).
 *
 * Bản ghi lần kiểm tra gần nhất (HealthRecord) nằm trong localStorage RIÊNG của iPad này (không vào bản sao lưu — số đo
 * micro / độ trễ chỉ đúng cho đúng máy + đàn này).
 */
import { backupOverdue, daysSinceBackup } from '../progress/backup';
import { healthEnvFromOps, readOps } from './opsState';

const DAY_MS = 86_400_000;
/** Vắng từ ngần này ngày → nên kiểm tra lại khi quay lại */
export const HEALTH_AWAY_DAYS = 14;
/** Bố mẹ phải "Sửa" kết quả micro ≥ tỉ lệ này (14 ngày, ≥ HEALTH_MIC_MIN nốt) → micro nghe sai nhiều */
export const HEALTH_MIC_OVERRIDE = 0.2;
export const HEALTH_MIC_MIN = 10;
/** Cửa sổ xét micro (ngày) */
export const HEALTH_MIC_DAYS = 14;
/** Độ trễ loa → micro trên mức này: có lẽ đang dùng loa / tai nghe Bluetooth */
export const HEALTH_LATENCY_BT_MS = 120;
/** Chưa từng kiểm tra: chỉ nhắc khi bé đã tập ít nhất ngần này ngày (cài mới không bị làm phiền) */
export const HEALTH_MIN_DAYS = 3;

/** Môi trường cho hai hàm dưới — UI / agent khác điền; trường nào không biết thì bỏ trống. */
export interface HealthEnv {
  /** Bây giờ (ms) */
  now: number;
  /** Lần kiểm tra sức khỏe gần nhất (ms) — loadHealth()?.at; null/0 = chưa lần nào */
  lastCheckAt?: number | null;
  /** iPadOS đã đổi phiên bản kể từ lần kiểm tra trước (agent real-world điền) */
  osChanged?: boolean;
  /** Số ngày vắng của lần quay lại gần nhất (agent real-world điền); không có thì tự tính từ ngày tập */
  daysAway?: number | null;
  /** Số lỗi ghi trong nhật ký lỗi kể từ lần kiểm tra trước */
  errors?: number;
  /** Trình duyệt từ chối giữ màn hình sáng (wake lock) */
  wakeLockDenied?: boolean;
  /** Giọng đọc tiếng Việt từng có mà nay không thấy (vd sau khi cập nhật iPadOS) */
  voiceLost?: boolean;
}

export type HealthReason = 'month' | 'away' | 'os';

export const HEALTH_REASON_TEXT: Record<HealthReason, string> = {
  month: 'tháng này chưa kiểm tra',
  away: `bé vừa nghỉ ≥ ${HEALTH_AWAY_DAYS} ngày`,
  os: 'iPad vừa cập nhật iPadOS',
};

/** Dữ liệu tối thiểu hai hàm cần (AppData thỏa mãn). */
export interface HealthData {
  settings: { lastBackupAt?: number; micEnabled?: boolean };
  progress: { practiceDays?: Record<string, unknown> };
  sessions: ReadonlyArray<{
    date: string;
    micAssessments?: ReadonlyArray<{ parentOverride?: unknown }>;
  }>;
  history?: { firstDate?: string | null };
}

const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const msOfDay = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
};

/** Các ngày đã tập (YYYY-MM-DD, tăng dần) — gồm phần đã gộp (progress.practiceDays). */
function practiceDates(d: Readonly<HealthData>): string[] {
  const set = new Set<string>(Object.keys(d.progress.practiceDays ?? {}));
  for (const s of d.sessions) set.add(s.date);
  return [...set].filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
}

/** Khoảng vắng (ngày) của lần quay lại gần nhất, nếu lần quay lại đó SAU lần kiểm tra gần nhất; ngược lại 0. */
export function returnGapDays(d: Readonly<HealthData>, now: number, lastCheckAt = 0): number {
  const dates = practiceDates(d);
  if (!dates.length) return 0;
  const today = dayKey(now);
  const last = dates[dates.length - 1];
  // Hôm nay chưa tập: khoảng từ ngày tập cuối tới hôm nay (đang "quay lại")
  if (last < today) {
    const gap = Math.round((msOfDay(today) - msOfDay(last)) / DAY_MS);
    return gap;
  }
  // Hôm nay đã tập: khoảng giữa hôm nay và ngày tập trước đó — chỉ tính nếu chưa kiểm tra từ khi quay lại
  const prev = dates[dates.length - 2];
  if (!prev || msOfDay(today) <= lastCheckAt) return 0;
  return Math.round((msOfDay(today) - msOfDay(prev)) / DAY_MS);
}

/**
 * Đến lúc kiểm tra sức khỏe app chưa? `reasons` theo thứ tự quan trọng (os → away → month).
 * - month: chưa kiểm tra lần nào TRONG THÁNG NÀY (từ ngày 1) — với bé đã tập ≥ HEALTH_MIN_DAYS ngày;
 * - away: vừa quay lại sau ≥ HEALTH_AWAY_DAYS ngày nghỉ (env.daysAway hoặc tự tính) và chưa kiểm tra từ đó;
 * - os: env.osChanged.
 */
export function healthCheckDue(d: Readonly<HealthData>, env: HealthEnv): { due: boolean; reasons: HealthReason[] } {
  const last = env.lastCheckAt ?? 0;
  const reasons: HealthReason[] = [];
  if (env.osChanged) reasons.push('os');
  const away = env.daysAway ?? returnGapDays(d, env.now, last);
  if (away !== null && away >= HEALTH_AWAY_DAYS) reasons.push('away');
  const n = new Date(env.now);
  const monthStart = new Date(n.getFullYear(), n.getMonth(), 1).getTime();
  if (last < monthStart && practiceDates(d).length >= HEALTH_MIN_DAYS) reasons.push('month');
  return { due: reasons.length > 0, reasons };
}

export type HealthFlagId = 'errors' | 'backup' | 'os' | 'mic' | 'screenAwake' | 'voice';

export interface HealthFlag {
  id: HealthFlagId;
  /** Một câu cho bố mẹ */
  text: string;
}

/** Tỉ lệ bố mẹ phải sửa kết quả micro trong `days` ngày gần nhất; null = chưa đủ HEALTH_MIC_MIN nốt. */
export function micOverrideRate(d: Readonly<HealthData>, now: number, days = HEALTH_MIC_DAYS): number | null {
  const since = dayKey(now - days * DAY_MS);
  let all = 0;
  let over = 0;
  for (const s of d.sessions) {
    if (s.date < since) continue;
    for (const a of s.micAssessments ?? []) {
      all++;
      if (a.parentOverride) over++;
    }
  }
  return all >= HEALTH_MIC_MIN ? over / all : null;
}

/**
 * Điều cần bố mẹ chú ý (⚠️ trên nút Phụ huynh, thẻ đầu màn Phụ huynh). Rỗng = mọi thứ ổn.
 * Thứ tự: mất dữ liệu trước (sao lưu), rồi lỗi, iPadOS, micro, màn hình, giọng đọc.
 */
export function healthFlags(d: Readonly<HealthData>, env: HealthEnv): HealthFlag[] {
  const out: HealthFlag[] = [];
  if (backupOverdue(d, env.now)) {
    const n = daysSinceBackup(d, env.now);
    out.push({
      id: 'backup',
      text: (d.settings.lastBackupAt ?? 0) > 0 ? `Đã ${n} ngày chưa sao lưu tiến độ của bé.` : 'Chưa sao lưu tiến độ của bé lần nào.',
    });
  }
  if ((env.errors ?? 0) > 0) out.push({ id: 'errors', text: `App ghi nhận ${env.errors} lỗi từ lần kiểm tra trước — gửi kết quả cho người hỗ trợ.` });
  if (env.osChanged) out.push({ id: 'os', text: 'iPad vừa cập nhật iPadOS — nên kiểm tra lại âm thanh, giọng đọc, micro.' });
  const rate = d.settings.micEnabled === false ? null : micOverrideRate(d, env.now);
  if (rate !== null && rate >= HEALTH_MIC_OVERRIDE) {
    out.push({ id: 'mic', text: `Bố mẹ phải sửa ${Math.round(rate * 100)}% kết quả micro 2 tuần qua — micro nghe chưa đúng.` });
  }
  if (env.wakeLockDenied) out.push({ id: 'screenAwake', text: 'iPad không cho giữ màn hình sáng — màn có thể tắt khi bé đang đàn.' });
  if (env.voiceLost) out.push({ id: 'voice', text: 'Giọng đọc tiếng Việt không còn trên iPad — cài lại trong Cài đặt.' });
  return out;
}

/* ---------------- Dữ liệu VẬN HÀNH của iPad (settings.ops) ----------------
 * Định nghĩa gốc: src/pwa/opsState.ts (agent real-world) — ở đây chỉ re-export + envFromOps cho màn kiểm tra.
 * Màn "Kiểm tra sức khỏe app" xong → ghi ops.healthAt (mergeOps) để các dấu hiệu cũ hết hiệu lực.
 */
export { readOps, mergeOps, type OpsState } from './opsState';

/** HealthEnv từ settings.ops — UI cộng thêm số lỗi, lần kiểm tra trong localStorage (lastCheckAt lớn hơn thì dùng nó). */
export function envFromOps(settings: { ops?: unknown }, now: number, lastCheckAt = 0): HealthEnv {
  const ops = readOps(settings);
  const last = Math.max(ops.healthAt ?? 0, lastCheckAt || 0);
  const e = healthEnvFromOps({ settings } as unknown as Parameters<typeof healthEnvFromOps>[0], { now, lastCheckAt: last });
  return { now, lastCheckAt: last || null, osChanged: e.osChanged, daysAway: e.daysAway, wakeLockDenied: e.wakeLockDenied, voiceLost: e.voiceLost };
}

/* ---------------- Bản ghi lần kiểm tra (localStorage riêng của iPad) ---------------- */

export const HEALTH_KEY = 'piano-be-9:health';

/** Tóm tắt bài đo micro (so tháng này với tháng trước) */
export interface HealthMicSummary {
  hits: number;
  total: number;
  softHits: number;
  softTotal: number;
  sensitivity: string;
}

export interface HealthRecord {
  /** Lúc kiểm tra xong (ms) */
  at: number;
  /** Bước 1: đã sao lưu thành công */
  backup?: boolean;
  /** Bước 2: nghe rõ tiếng đàn / giọng đọc */
  sound?: 'yes' | 'no' | null;
  voice?: 'yes' | 'no' | null;
  mic?: HealthMicSummary | null;
  latencyMs?: number | null;
  /** Bước 5: các ý đã tích */
  checklist?: string[];
  /** Phiên bản iPadOS lúc kiểm tra (agent real-world có thể điền) */
  os?: string;
}

type KV = Pick<Storage, 'getItem' | 'setItem'>;
function kv(): KV | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadHealth(store: KV | null = kv()): HealthRecord | null {
  if (!store) return null;
  try {
    const v = JSON.parse(store.getItem(HEALTH_KEY) ?? 'null') as HealthRecord | null;
    return v && typeof v.at === 'number' && Number.isFinite(v.at) ? v : null;
  } catch {
    return null;
  }
}

export function saveHealth(r: HealthRecord, store: KV | null = kv()): void {
  if (!store) return;
  try {
    store.setItem(HEALTH_KEY, JSON.stringify(r));
  } catch {
    /* đầy / bị chặn — bỏ qua */
  }
}

/** Điểm micro để so sánh: % nốt nghe đúng, nốt nhẹ tính gấp đôi (lúc tập bé hay đàn nhẹ). */
export function micScore(m: Pick<HealthMicSummary, 'hits' | 'total' | 'softHits' | 'softTotal'>): number | null {
  const den = m.total + m.softTotal;
  return den > 0 ? (m.hits + m.softHits) / den : null;
}

export type MicTrend = 'better' | 'same' | 'worse' | null;

/** So bài đo micro tháng này với lần trước: chênh ≥ 10 điểm % mới tính là khác. null = không có gì để so. */
export function compareMic(now: HealthMicSummary | null | undefined, prev: HealthMicSummary | null | undefined): MicTrend {
  const a = now ? micScore(now) : null;
  const b = prev ? micScore(prev) : null;
  if (a === null || b === null) return null;
  if (a - b >= 0.1) return 'better';
  if (b - a >= 0.1) return 'worse';
  return 'same';
}

export const MIC_TREND_TEXT: Record<Exclude<MicTrend, null>, string> = {
  better: '📈 Micro nghe TỐT HƠN lần kiểm tra trước.',
  same: '➖ Micro nghe NHƯ CŨ so với lần kiểm tra trước.',
  worse: '📉 Micro nghe KÉM HƠN lần kiểm tra trước — thử đổi độ nhạy bên dưới, bớt tiếng ồn, đặt iPad trên giá nhạc.',
};
