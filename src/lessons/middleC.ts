/**
 * (+ 2026-10-16, OWNER duyệt — rà soát của giáo viên có kinh nghiệm) "📍 TÌM ĐÔ GIỮA TRÊN ĐÀN THẬT": bước phụ ≤ 20 giây,
 * bỏ qua được, ở ĐẦU buổi (cùng chấm tiến trình với phần mở đầu — không thêm màn). Chỉ hiện khi:
 *  (a) gần đây bé đàn LỆCH QUÃNG 8 (waitJudge 'octave' → nhật ký nhỏ trong máy, ≥ OCTAVE_MIN_EVENTS lần trong
 *      OCTAVE_LOOKBACK_DAYS ngày, tính từ lần tìm đúng Đô giữa gần nhất);
 *  (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") CHỈ lý do (a): trước đây còn (b) thế tay mới, (c) buổi đầu tuần ≤
 *  MIDDLE_C_MAX_WEEK — bỏ để mở đầu buổi ≤ 60 giây (positionChange vẫn dùng cho dải 👪 của bố mẹ — parentFocus.ts).
 * Tối đa MỘT lần mỗi ngày. KHÔNG ghi gì vào buổi / tiêu chí (chỉ nhật ký nhỏ trong máy, như phiếu "Bố mẹ xem tay").
 * Hàm thuần (bộ nhớ truyền vào) — test: tests/sessionHelpers-2026-10-16.test.ts.
 */
import { findTune } from '../music/exercises';
import type { AppData } from '../progress/schema';
import { POSITIONS, type Hand, type PositionId } from '../piano/fingering';
import { DAY_MS, MAX_WEEK, weekPlan } from './curriculum';
import type { Lesson } from './types';

/** Tuần ≤ ngần này: buổi đầu mỗi tuần có bước tìm Đô giữa. */
export const MIDDLE_C_MAX_WEEK = 6;
/** Xét các lần lệch quãng 8 trong ngần này ngày. */
export const OCTAVE_LOOKBACK_DAYS = 7;
/** Từ ngần này lần (cách nhau ≥ OCTAVE_EVENT_GAP_MS — mỗi "đợt" một lần) → mời tìm Đô giữa. */
export const OCTAVE_MIN_EVENTS = 2;
/** Các nốt lệch quãng 8 sát nhau (cùng một lượt) chỉ ghi một lần. */
export const OCTAVE_EVENT_GAP_MS = 60_000;
/** Giữ tối đa ngần này mốc. */
const OCTAVE_KEEP = 20;
/** Bước tìm Đô giữa dài tối đa ngần này (ms) rồi tự đi tiếp. */
export const MIDDLE_C_MS = 20_000;
/** Đô giữa (C4). */
export const MIDDLE_C_MIDI = 60;

export type MiddleCReason = 'octave' | 'position' | 'week-start';

/** Nhật ký nhỏ trong máy (localStorage) — chỉ để quyết định có mời tìm Đô giữa không. */
export interface OctaveLog {
  /** Mốc (ms) các lần bé đàn lệch quãng 8 (mỗi đợt một mốc) */
  events: number[];
  /** Lần gần nhất bé tìm đúng Đô giữa (micro nghe C4 / bố mẹ chạm "Đã tìm đúng") */
  foundAt?: number;
  /** Ngày (YYYY-MM-DD) đã hiện bước tìm Đô giữa — tối đa một lần mỗi ngày */
  shownOn?: string;
}

export const OCTAVE_LOG_KEY = 'piano-be-9-octave-log';

type Get = Pick<Storage, 'getItem'> | null | undefined;
type Set = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;
const st = <T>(s: T | undefined): T | null | undefined => (s === undefined ? (globalThis.localStorage as unknown as T | undefined) : s);

export function readOctaveLog(storage?: Get): OctaveLog {
  try {
    const raw = st(storage)?.getItem(OCTAVE_LOG_KEY);
    if (!raw) return { events: [] };
    const v = JSON.parse(raw) as Partial<OctaveLog>;
    const events = Array.isArray(v?.events) ? v.events.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : [];
    return {
      events,
      ...(typeof v.foundAt === 'number' ? { foundAt: v.foundAt } : {}),
      ...(typeof v.shownOn === 'string' ? { shownOn: v.shownOn } : {}),
    };
  } catch {
    return { events: [] };
  }
}

function write(log: OctaveLog, storage?: Set): void {
  try {
    st(storage)?.setItem(OCTAVE_LOG_KEY, JSON.stringify(log));
  } catch {
    /* bộ nhớ đầy / chế độ riêng tư — chỉ là lời nhắc */
  }
}

/** Thêm một lần lệch quãng 8 (thuần): bỏ qua nếu sát lần trước (< OCTAVE_EVENT_GAP_MS); giữ OCTAVE_KEEP mốc gần nhất. */
export function withOctaveEvent(log: OctaveLog, now: number): OctaveLog {
  const last = log.events[log.events.length - 1];
  if (last !== undefined && now - last < OCTAVE_EVENT_GAP_MS && now >= last) return log;
  return { ...log, events: [...log.events, now].slice(-OCTAVE_KEEP) };
}

/** Ghi một lần bé đàn lệch quãng 8 (màn bài hát / Từng nốt — qua waitJudge.setOctaveObserver). */
export function noteOctaveEvent(now: number = Date.now(), storage?: Set): void {
  const log = readOctaveLog(storage);
  const next = withOctaveEvent(log, now);
  if (next !== log) write(next, storage);
}

export function markMiddleCShown(today: string, storage?: Set): void {
  write({ ...readOctaveLog(storage), shownOn: today }, storage);
}

export function markMiddleCFound(now: number = Date.now(), storage?: Set): void {
  write({ ...readOctaveLog(storage), foundAt: now }, storage);
}

/** Số đợt lệch quãng 8 gần đây (trong OCTAVE_LOOKBACK_DAYS ngày, sau lần tìm đúng Đô giữa gần nhất). */
export function recentOctaveEvents(log: OctaveLog | null | undefined, now: number): number {
  if (!log) return 0;
  const since = Math.max(now - OCTAVE_LOOKBACK_DAYS * DAY_MS, log.foundAt ?? -Infinity);
  return log.events.filter((t) => t > since && t <= now + 60_000).length;
}

/** Bé đang hay đàn lệch quãng 8? */
export function octaveTrouble(log: OctaveLog | null | undefined, now: number): boolean {
  return recentOctaveEvents(log, now) >= OCTAVE_MIN_EVENTS;
}

/** Thế tay CỦA RIÊNG bài (bài hát đầu tiên có thế tay cố định; thế 'free' bỏ qua) — null = bài không có bài hát. */
export function ownHandPosition(lesson: Lesson): { position: Exclude<PositionId, 'free'>; hand: Hand } | null {
  for (const a of lesson.activities) {
    if (a.kind !== 'song') continue;
    const t = findTune(a.songId);
    if (!t || t.id.startsWith('sight')) continue;
    const hand: Hand = a.hand ?? (t.hand === 'LH' ? 'LH' : 'RH');
    const pos = (hand === 'LH' && t.hand === 'BOTH' ? t.lhPosition : t.position) ?? 'C';
    if (pos === 'free' || !POSITIONS[pos]?.[hand]) continue;
    return { position: pos, hand };
  }
  return null;
}

/** Thế tay của bài TRƯỚC (theo thứ tự giáo trình) có thế tay riêng — null = không có. */
function previousPosition(lesson: Lesson): Exclude<PositionId, 'free'> | null {
  for (let w = Math.min(lesson.week, MAX_WEEK); w >= 1; w--) {
    const ls = weekPlan(w).lessons;
    const at = w === lesson.week ? ls.findIndex((l) => l.id === lesson.id) : ls.length;
    if (at < 0) return null;
    for (let i = at - 1; i >= 0; i--) {
      const p = ownHandPosition(ls[i]);
      if (p) return p.position;
    }
  }
  return null;
}

/**
 * Bài mở THẾ TAY MỚI: thế tay của bài khác thế tay của bài trước đó (vd thế Đô → thế Sol). Trả về thế tay mới (null = không đổi).
 * Bài không có bài hát / thế tự do → null.
 */
export function positionChange(lesson: Lesson): { position: Exclude<PositionId, 'free'>; hand: Hand } | null {
  const own = ownHandPosition(lesson);
  if (!own) return null;
  const prev = previousPosition(lesson);
  return prev && prev !== own.position ? own : null;
}

/**
 * Lý do hiện bước "📍 Tìm Đô giữa" ở đầu buổi của bài `lesson` (null = không hiện).
 * (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") CHỈ khi bé THẬT SỰ lệch quãng 8 gần đây (nhật ký octaveTrouble) —
 * không còn hiện vì "thế tay mới" / "buổi đầu tuần" (mở đầu buổi ≤ 60 giây). Đã hiện hôm nay (`log.shownOn === today`) → null.
 * ('position' / 'week-start' giữ trong kiểu MiddleCReason cho màn middleC.ts — không còn được chọn.)
 */
export function middleCReason(
  _lesson: Lesson,
  _data: Readonly<AppData> | undefined,
  o: { now: number; today: string; log?: OctaveLog | null },
): MiddleCReason | null {
  if (o.log?.shownOn === o.today) return null;
  return octaveTrouble(o.log, o.now) ? 'octave' : null;
}
