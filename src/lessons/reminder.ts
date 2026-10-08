/**
 * ⏰ NHẮC GIỜ TẬP (OWNER duyệt 2026-10-08) — tạo tệp lịch .ics (chuẩn iCalendar RFC 5545) cho Lịch của iPad:
 * MỘT sự kiện lặp HẰNG TUẦN vào các thứ bố mẹ chọn (RRULE BYDAY), báo thức đúng giờ bắt đầu (VALARM), giờ Việt Nam
 * (TZID Asia/Ho_Chi_Minh, kèm VTIMEZONE +07:00). App không có máy chủ → không gửi thông báo được; Lịch của iPad lo việc nhắc.
 * Hàm THUẦN — test: tests/homeLongTerm.test.ts.
 */

/** 0 = Chủ nhật … 6 = Thứ bảy (như Date.getDay). */
export const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

export const REMINDER_UID = 'piano-be-9-practice-reminder@hapvhqhcm-prog.github.io';
export const DEFAULT_REMINDER = { days: [1, 2, 3, 4, 5], time: '19:00' } as const;

export interface ReminderOpts {
  /** Các thứ (0–6), ít nhất một */
  days: readonly number[];
  /** "HH:MM" 24 giờ */
  time: string;
  /** Phút mỗi buổi (độ dài sự kiện) */
  minutes?: number;
  /** Lúc tạo (DTSTAMP, ngày bắt đầu tìm buổi đầu tiên) */
  now: Date;
  /** Tên bé (tùy chọn) cho tiêu đề */
  name?: string;
}

/** "HH:MM" hợp lệ → [giờ, phút]; sai → null. */
export function parseTime(t: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh <= 23 && mm <= 59 ? [hh, mm] : null;
}

/** Chuẩn hóa danh sách thứ: số nguyên 0–6, không trùng, tăng dần. */
export function normDays(days: readonly unknown[]): number[] {
  return [...new Set(days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort((a, b) => a - b);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const localStamp = (d: Date, hh: number, mm: number) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`;
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Ngày đầu tiên (từ hôm nay) rơi vào một trong các thứ đã chọn. */
export function firstOccurrence(now: Date, days: readonly number[]): Date {
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (days.includes(d.getDay())) return d;
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Thoát ký tự đặc biệt trong TEXT của iCalendar. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Gấp dòng dài > 75 BYTE (UTF-8 — chữ Việt nhiều byte), dòng nối bắt đầu bằng một dấu cách. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75; // dòng nối có 1 byte dấu cách đầu
    if (bytes + b > limit) {
      parts.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/** Tạo nội dung tệp .ics (dòng kết thúc CRLF). Ném lỗi nếu giờ / thứ không hợp lệ. */
export function buildReminderIcs(o: ReminderOpts): string {
  const days = normDays(o.days);
  const t = parseTime(o.time);
  if (!days.length) throw new Error('Chọn ít nhất một ngày');
  if (!t) throw new Error('Giờ không hợp lệ');
  const [hh, mm] = t;
  const first = firstOccurrence(o.now, days);
  const minutes = Math.max(5, Math.min(60, Math.round(o.minutes ?? 15)));
  const who = o.name?.trim() ? ` cùng ${o.name.trim()}` : '';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Piano be//Nhac gio tap//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Ho_Chi_Minh',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0700',
    'TZOFFSETTO:+0700',
    'TZNAME:+07',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${REMINDER_UID}`,
    // Tạo lại (đổi giờ) → SEQUENCE lớn hơn: Lịch cập nhật sự kiện cũ thay vì thêm bản thứ hai (nếu Lịch hỗ trợ)
    `SEQUENCE:${Math.floor(o.now.getTime() / 60000) % 2_000_000_000}`,
    `DTSTAMP:${utcStamp(o.now)}`,
    `DTSTART;TZID=Asia/Ho_Chi_Minh:${localStamp(first, hh, mm)}`,
    `DURATION:PT${minutes}M`,
    `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d]).join(',')}`,
    `SUMMARY:${icsEscape(`🎹 Giờ tập đàn${who} — Piano bé`)}`,
    `DESCRIPTION:${icsEscape('Mở app Piano bé, bấm "Học tiếp". 10–15 phút là đủ — nghỉ một hôm cũng không sao!')}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape('🎹 Đến giờ tập đàn rồi!')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Một dòng tóm tắt cho bố mẹ: "T2, T4, T6 lúc 19:00". */
export function reminderSummary(days: readonly number[], time: string): string {
  const d = normDays(days);
  const order = [...d.filter((x) => x !== 0), ...d.filter((x) => x === 0)]; // T2 … T7, CN
  return `${order.map((x) => WEEKDAY_LABELS[x]).join(', ')} lúc ${time}`;
}
