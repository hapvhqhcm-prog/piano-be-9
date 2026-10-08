/**
 * (+ 2026-10-08, OWNER duyệt) "🎤 BIỂU DIỄN CHO CẢ NHÀ" — buổi diễn nhỏ HẰNG TUẦN.
 *
 * - Mỗi tuần giáo trình tối đa MỘT buổi diễn (và một sticker "🎤 Buổi diễn"), được MỜI (không bắt buộc) ở màn kết buổi
 *   khi tuần đó đã đạt tiêu chí — hoặc tuần vừa đi qua (đã xong / bố mẹ cho qua) mà chưa diễn.
 * - Tuần hòa nhạc cuối cấp (10 / 21 / 31 — sân khấu + huy chương, stage.ts) KHÔNG mời thêm: đã có buổi diễn riêng.
 * - Bé chọn MỘT bài đã chơi đạt / đã thuộc → đếm vào, đàn theo nhịp (songScreen chế độ sân khấu) → khán giả chạm 👏 ❤️ 🌟,
 *   ghi ai nghe → lưu nhật ký AppData.concerts (tách khỏi sessions: gộp lịch sử không đụng tới, không ảnh hưởng tiêu chí).
 * Hàm thuần — có test (tests/concert.test.ts).
 */
import { songsUpToWeek, type Tune } from '../music/tune';
import { bumpDataRev } from '../progress/history';
import { localDateStr, type AppData, type ConcertEntry } from '../progress/schema';
import { LEVELS, songMastered, songStats, weekPassed } from './lessonEngine';
import type { Sticker } from './stickers';

/** Tuần hòa nhạc cuối cấp (sân khấu riêng) — không mời buổi diễn hằng tuần. */
const RECITAL_WEEKS = new Set(LEVELS.map((l) => l.weeks[1]));
/** Giới hạn số buổi giữ trong nhật ký (≈ một buổi / tuần → dư cho nhiều năm) */
export const CONCERT_LOG_MAX = 300;
/** Chip "ai nghe" gợi ý */
export const AUDIENCE_CHIPS = ['Ông', 'Bà', 'Bố', 'Mẹ', 'Anh', 'Chị', 'Em', 'Cô', 'Chú', 'Bạn'] as const;
/** Tên khán giả gõ thêm: tối đa ngần này ký tự / người, ngần này người */
export const AUDIENCE_NAME_MAX = 24;
export const AUDIENCE_MAX = 12;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(9999, Math.floor(n)) : 0);

/** Một bản ghi buổi diễn hợp lệ? (bản ghi hỏng bị bỏ qua khi đọc, không làm hỏng cả dữ liệu) */
export function validConcert(c: unknown): c is ConcertEntry {
  return (
    isObj(c) &&
    typeof c.id === 'string' &&
    !!c.id &&
    typeof c.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(c.date) &&
    typeof c.ts === 'number' &&
    Number.isInteger(c.week) &&
    (c.week as number) >= 1 &&
    typeof c.songId === 'string' &&
    !!c.songId &&
    isObj(c.reactions) &&
    Array.isArray(c.audience) &&
    c.audience.every((a) => typeof a === 'string') &&
    (c.passed === undefined || typeof c.passed === 'boolean')
  );
}

/** Nhật ký buổi diễn (cũ → mới), đã lọc bản ghi hỏng. */
export function concertLog(data: Readonly<AppData>): ConcertEntry[] {
  const raw: unknown = data.concerts;
  if (!Array.isArray(raw)) return [];
  return raw.filter(validConcert).map((c) => ({
    ...c,
    reactions: { clap: count(c.reactions.clap), heart: count(c.reactions.heart), star: count(c.reactions.star) },
    audience: [...c.audience],
  }));
}

/** Đã có buổi diễn cho tuần giáo trình `week`? */
export function concertDone(data: Readonly<AppData>, week: number): boolean {
  return concertLog(data).some((c) => c.week === week);
}

/**
 * Bài bé có thể diễn: bài đã mở tới tuần hiện tại mà bé đã CHƠI TRỌN ĐẠT (đủ tay) hoặc đã thuộc.
 * Thứ tự: bài của tuần diễn trước, rồi bài đã thuộc, rồi bài mới hơn trước.
 */
export function concertSongs(data: Readonly<AppData>, week: number = data.progress.currentWeek): Tune[] {
  const stats = songStats(data);
  const upTo = Math.max(week, data.progress.currentWeek);
  const ok = songsUpToWeek(upTo).filter((t) => stats[t.id]?.h === 1 || stats[t.id]?.m !== undefined);
  const rank = (t: Tune) => (t.week === week ? 2 : 0) + (songMastered(data, t.id) ? 1 : 0);
  return ok.sort((a, b) => rank(b) - rank(a) || (b.week ?? 0) - (a.week ?? 0));
}

/**
 * Tuần được MỜI biểu diễn ở cuối buổi (null = không mời):
 * - tuần hiện tại đã ĐẠT tiêu chí mà chưa diễn → tuần hiện tại;
 * - tuần hiện tại chưa đạt → tuần vừa đi qua (đã xong / bố mẹ cho qua) nếu chưa diễn;
 * - bỏ tuần hòa nhạc cuối cấp (đã có sân khấu riêng); cần ít nhất một bài bé chơi được.
 */
export function concertOfferWeek(data: Readonly<AppData>): number | null {
  const cur = data.progress.currentWeek;
  const w = weekPassed(cur, data) ? cur : cur - 1;
  if (w < 1 || RECITAL_WEEKS.has(w) || concertDone(data, w)) return null;
  return concertSongs(data, w).length ? w : null;
}

/** Danh sách khán giả gọn gàng: bỏ khoảng trắng thừa / trùng / rỗng, cắt độ dài. */
export function cleanAudience(list: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const a = raw.replace(/\s+/g, ' ').trim().slice(0, AUDIENCE_NAME_MAX);
    if (a && !out.some((x) => x.toLowerCase() === a.toLowerCase())) out.push(a);
    if (out.length >= AUDIENCE_MAX) break;
  }
  return out;
}

/** Tách ô "Ai nữa?" (phân cách bằng dấu phẩy / chấm phẩy / "và") thành tên. */
export function splitAudience(text: string): string[] {
  return text.split(/[,;、]|\s+và\s+/u).map((s) => s.trim()).filter(Boolean);
}

/** Tạo bản ghi buổi diễn mới. */
export function makeConcert(o: {
  week: number;
  songId: string;
  reactions: ConcertEntry['reactions'];
  audience: readonly string[];
  passed?: boolean;
  now?: Date;
}): ConcertEntry {
  const now = o.now ?? new Date();
  return {
    id: `concert-${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    date: localDateStr(now),
    ts: now.getTime(),
    week: o.week,
    songId: o.songId,
    reactions: { clap: count(o.reactions.clap), heart: count(o.reactions.heart), star: count(o.reactions.star) },
    audience: cleanAudience(o.audience),
    ...(o.passed !== undefined ? { passed: o.passed } : {}),
  };
}

/**
 * Thêm / thay (cùng id) một buổi diễn vào dữ liệu — SỬA TẠI CHỖ. Mỗi tuần chỉ giữ MỘT buổi (buổi mới thay buổi cũ cùng
 * tuần khác id thì bị bỏ qua → một sticker / tuần). Trả về false nếu không thêm.
 */
export function upsertConcert(data: AppData, c: ConcertEntry): boolean {
  if (!validConcert(c)) return false;
  const list = Array.isArray(data.concerts) ? data.concerts : (data.concerts = []);
  const i = list.findIndex((x) => isObj(x) && x.id === c.id);
  if (i >= 0) list[i] = c;
  else {
    if (list.some((x) => validConcert(x) && x.week === c.week)) return false;
    list.push(c);
    if (list.length > CONCERT_LOG_MAX) list.splice(0, list.length - CONCERT_LOG_MAX);
  }
  bumpDataRev(data);
  return true;
}

/** Sticker "🎤 Buổi diễn": MỘT sticker cho mỗi tuần giáo trình có buổi diễn (theo thứ tự tuần). */
export function concertStickers(data: Readonly<AppData>): Sticker[] {
  const byWeek = new Map<number, ConcertEntry>();
  for (const c of concertLog(data)) if (!byWeek.has(c.week)) byWeek.set(c.week, c);
  return [...byWeek.values()]
    .sort((a, b) => a.week - b.week)
    .map((c) => ({
      id: `concert-w${c.week}`,
      kind: 'concert' as const,
      title: `Buổi diễn tuần ${c.week}`,
      hint: 'Biểu diễn cho cả nhà',
      earned: true,
      week: c.week,
      n: c.reactions.clap + c.reactions.heart + c.reactions.star,
    }));
}
