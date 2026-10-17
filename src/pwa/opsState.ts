/**
 * (+ 2026-10-17, OWNER duyệt — rà soát vận hành thực tế) DỮ LIỆU VẬN HÀNH của iPad (settings.ops) — phần logic THUẦN.
 *
 * Ghi lại những gì "đời thật" làm hỏng buổi học mà app không tự thấy: iPadOS vừa cập nhật, bé nghỉ lâu, iPad không cho giữ
 * màn hình sáng, giọng tiếng Việt bị mất, dữ liệu vừa nhập từ iPad khác (micro cần cài lại). Màn "Kiểm tra sức khỏe app"
 * (src/pwa/healthCheck.ts — agent khác) đọc qua healthEnvFromOps → các trường osChanged / daysAway / wakeLockDenied /
 * voiceLost / errors của HealthEnv.
 * Đọc MỀM (readOps — trường hỏng bị bỏ qua), không bao giờ ném lỗi.
 */
import { parseDevice } from './diagnostics';
import { lastSessionDate } from '../progress/history';
import type { AppData } from '../progress/schema';

const DAY_MS = 86_400_000;
/** Nghỉ ≥ ngần này ngày (tính từ buổi học gần nhất) → nên kiểm tra lại micro / âm thanh / giọng đọc */
export const LONG_ABSENCE_DAYS = 14;
/** Dấu hiệu (đổi iPadOS / nghỉ dài) tự hết sau ngần này ngày */
export const OPS_FLAG_TTL_DAYS = 30;

/** Lời khuyên MỘT lần cho bố mẹ khi iPad không cho giữ màn hình sáng */
export const WAKE_TIP = 'Cài đặt → Màn hình & Độ sáng → Tự động khóa: 5 phút (hoặc Không bao giờ khi tập)';
export const HEALTH_CHECK_HINT = 'nên chạy Kiểm tra sức khỏe app';

/** settings.ops — mọi trường tùy chọn; số = thời điểm (ms). */
export interface OpsState {
  /** Bản hệ điều hành thấy lần gần nhất ("iPadOS 26.6") */
  os?: string;
  /** Bản trước khi đổi + lúc thấy đổi */
  osPrev?: string;
  osChangedAt?: number;
  /** Lần nghỉ dài gần nhất: số ngày + lúc mở lại app */
  awayDays?: number;
  awayReturnAt?: number;
  /** iPad từ chối giữ màn hình sáng (lần gần nhất) / đã hiện lời khuyên Tự động khóa */
  wakeDeniedAt?: number;
  wakeTipAt?: number;
  /** Đã từng có giọng tiếng Việt trên iPad này / lúc thấy mất giọng */
  hadViVoice?: boolean;
  voiceLostAt?: number;
  /** Dữ liệu vừa nhập từ bản sao lưu (có thể là iPad khác) — micro cần cài lại (Cài micro 3 bước) */
  micSetupNeededAt?: number;
  /** Lần "🩺 Kiểm tra sức khỏe app" xong gần nhất (màn kiểm tra — src/pwa/healthCheck.ts — ghi) */
  healthAt?: number;
}

const NUM_KEYS = ['osChangedAt', 'awayDays', 'awayReturnAt', 'wakeDeniedAt', 'wakeTipAt', 'voiceLostAt', 'micSetupNeededAt', 'healthAt'] as const;

/** Đọc MỀM settings.ops (trường hỏng bị bỏ qua). */
export function readOps(settings: { ops?: unknown } | null | undefined): OpsState {
  const o = settings?.ops;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const r = o as Record<string, unknown>;
  const out: OpsState = {};
  for (const k of ['os', 'osPrev'] as const) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 60);
  }
  for (const k of NUM_KEYS) {
    const v = r[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  if (typeof r.hadViVoice === 'boolean') out.hadViVoice = r.hadViVoice;
  return out;
}

/** Gộp bản vá vào ops (undefined trong bản vá = xóa trường). */
export function mergeOps(cur: OpsState, patch: { [K in keyof OpsState]?: OpsState[K] | undefined }): OpsState {
  const out: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out as OpsState;
}

/** "iPadOS 26.6" từ userAgent; null = không đọc được phiên bản. */
export function osVersionOf(ua: string, maxTouchPoints = 0): string | null {
  try {
    const d = parseDevice(ua || '', maxTouchPoints);
    return d.os && d.version ? `${d.os} ${d.version}` : null;
  } catch {
    return null;
  }
}

/** Nửa đêm (giờ địa phương) của ngày "YYYY-MM-DD" (ms); NaN nếu sai. */
function dayStart(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
}

/** Số ngày từ buổi học gần nhất tới `now` (null = chưa học buổi nào). */
export function daysSinceLastSession(data: Readonly<AppData>, now: number): number | null {
  let last: string | null = null;
  try {
    last = lastSessionDate(data);
  } catch {
    last = null;
  }
  if (!last) return null;
  const t = dayStart(last);
  if (!Number.isFinite(t)) return null;
  const n = new Date(now);
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  return Math.max(0, Math.round((today - t) / DAY_MS));
}

/**
 * Lúc MỞ APP (trước khi bé học buổi mới): ghi nhận đổi bản iPadOS + lần nghỉ dài. Trả về ops MỚI cần lưu, hoặc null nếu
 * không có gì đổi (không ghi mỗi lần mở).
 */
export function noteAppOpen(data: Readonly<AppData>, env: { now: number; osVersion: string | null }): OpsState | null {
  const cur = readOps(data.settings);
  const next: OpsState = { ...cur };
  let changed = false;
  const os = env.osVersion;
  if (os && os !== cur.os) {
    if (cur.os) {
      next.osPrev = cur.os;
      next.osChangedAt = env.now;
    }
    next.os = os;
    changed = true;
  }
  const away = daysSinceLastSession(data, env.now);
  if (away !== null && away >= LONG_ABSENCE_DAYS) {
    // Chỉ ghi MỘT lần cho mỗi lần nghỉ: lần ghi trước đã sau buổi học gần nhất → vẫn là lần nghỉ đó
    const lastStart = env.now - away * DAY_MS;
    if (!(cur.awayReturnAt !== undefined && cur.awayReturnAt >= lastStart)) {
      next.awayDays = away;
      next.awayReturnAt = env.now;
      changed = true;
    }
  }
  return changed ? next : null;
}

/** Số liệu đang thấy lúc này (màn hình / App điền). */
export interface OpsLive {
  now: number;
  /** Lần "Kiểm tra sức khỏe app" gần nhất (ms; healthCheck.loadHealth()?.at) — 0/null = chưa */
  lastCheckAt?: number | null;
  /** Bản iPadOS đang chạy (osVersionOf) */
  osVersion?: string | null;
  /** Lần mở app này iPad từ chối giữ sáng */
  wakeLockDenied?: boolean;
  /** Có giọng tiếng Việt (false = không; null/undefined = chưa biết — danh sách giọng chưa nạp) */
  voiceAvailable?: boolean | null;
  /** Số lỗi trong nhật ký lỗi (errorLog.ts) từ lần kiểm tra trước */
  errorsCount?: number;
}

/** Dấu hiệu còn hiệu lực: xảy ra SAU lần kiểm tra gần nhất và chưa quá OPS_FLAG_TTL_DAYS. */
const fresh = (at: number | undefined, since: number, now: number): boolean => at !== undefined && at > since && now - at < OPS_FLAG_TTL_DAYS * DAY_MS;

/**
 * Các trường vận hành của HealthEnv (src/pwa/healthCheck.ts): osChanged / daysAway / wakeLockDenied / voiceLost / errors.
 * Trải vào env: `healthFlags(data, { now, lastCheckAt, ...healthEnvFromOps(data, live) })`.
 */
export function healthEnvFromOps(
  data: Readonly<AppData>,
  live: OpsLive,
): { osChanged: boolean; daysAway: number | null; wakeLockDenied: boolean; voiceLost: boolean; errors: number } {
  const ops = readOps(data?.settings);
  const since = Math.max(live.lastCheckAt ?? 0, ops.healthAt ?? 0);
  const now = live.now;
  const osChanged = (!!live.osVersion && !!ops.os && live.osVersion !== ops.os) || fresh(ops.osChangedAt, since, now);
  const daysAway = fresh(ops.awayReturnAt, since, now) ? ops.awayDays ?? LONG_ABSENCE_DAYS : null;
  const wakeLockDenied = !!live.wakeLockDenied || fresh(ops.wakeDeniedAt, since, now);
  const voiceLost = (!!ops.hadViVoice && live.voiceAvailable === false) || (ops.voiceLostAt !== undefined && live.voiceAvailable !== true);
  return { osChanged, daysAway, wakeLockDenied, voiceLost, errors: Math.max(0, Math.floor(live.errorsCount || 0)) };
}

/** Dòng nhắc ngắn cho bố mẹ (🩺, màn Phụ huynh) từ dữ liệu vận hành — rỗng = không có gì. */
export function opsNotes(data: Readonly<AppData>, live: OpsLive): string[] {
  const e = healthEnvFromOps(data, live);
  const ops = readOps(data?.settings);
  const out: string[] = [];
  if (e.osChanged) out.push(`iPad vừa cập nhật ${ops.osPrev ? `${ops.osPrev} → ` : ''}${live.osVersion ?? ops.os ?? 'bản mới'} — ${HEALTH_CHECK_HINT}`);
  if (e.daysAway !== null) out.push(`Bé nghỉ ${e.daysAway} ngày — ${HEALTH_CHECK_HINT} (micro, âm thanh, giọng đọc)`);
  if (e.wakeLockDenied) out.push(`iPad không cho giữ màn hình sáng — ${WAKE_TIP}`);
  if (e.voiceLost) out.push('Giọng đọc tiếng Việt không còn trên iPad — cài lại giọng “Linh”');
  if (ops.micSetupNeededAt !== undefined && data.settings.micEnabled) out.push('Dữ liệu vừa nhập từ bản sao lưu — cần cài lại micro (Cài micro 3 bước)');
  return out;
}

/**
 * Giọng tiếng Việt: danh sách giọng ĐÃ NẠP mà không còn giọng vi (trước đó từng có) → bản vá + true = vừa mất (báo một lần).
 * Có giọng → nhớ hadViVoice (bỏ dấu mất). Chưa nạp danh sách → không kết luận (null).
 */
export function noteVoice(settings: { ops?: unknown }, has: boolean | null, now: number): { ops: OpsState; lost: boolean } | null {
  if (has === null) return null;
  const cur = readOps(settings);
  if (has) {
    if (cur.hadViVoice && cur.voiceLostAt === undefined) return null;
    return { ops: mergeOps(cur, { hadViVoice: true, voiceLostAt: undefined }), lost: false };
  }
  if (!cur.hadViVoice || cur.voiceLostAt !== undefined) return null;
  return { ops: mergeOps(cur, { voiceLostAt: now }), lost: true };
}
