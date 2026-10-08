import type { AppData, Cosmetics } from '../progress/schema';
import { islandPassed } from './stickers';

/**
 * 🎁 QUÀ MỞ KHÓA THEO ĐẢO (OWNER duyệt 2026-10-08) — hàm THUẦN (test: tests/longTermUnlocks.test.ts).
 *
 * Mỗi mốc đảo (tuần) đã qua mở một món "để chơi": trang phục cho Bé Nốt, tiếng đàn mới ở Đàn tự do, kiểu nhạc đệm mới.
 * Đã mở = islandPassed (cùng quy tắc với bản đồ / sticker đảo — không mất khi bố mẹ lùi tuần) → không lưu thêm gì.
 * Chỉ LƯU (settings.cosmetics) món bé đang dùng + món đã xem màn mừng. Chỉ thêm vào cuối UNLOCKS.
 */

export type UnlockKind = 'outfit' | 'timbre' | 'backing';

export interface UnlockDef {
  /** Mã ổn định, vd "outfit:cap" */
  id: string;
  kind: UnlockKind;
  /** Mã món trong loại (mascot outfit / timbre / backing style) */
  key: string;
  /** Qua đảo tuần này thì mở */
  week: number;
  icon: string;
  title: string;
  /** Một dòng cho bé */
  desc: string;
}

const u = (kind: UnlockKind, key: string, week: number, icon: string, title: string, desc: string): UnlockDef => ({
  id: `${kind}:${key}`,
  kind,
  key,
  week,
  icon,
  title,
  desc,
});

export const UNLOCKS: readonly UnlockDef[] = [
  u('outfit', 'cap', 1, '🧢', 'Mũ lưỡi trai', 'Bé Nốt đội mũ lưỡi trai'),
  u('timbre', 'musicbox', 2, '🎶', 'Hộp nhạc', 'Đàn tự do kêu leng keng như hộp nhạc'),
  u('backing', 'march', 3, '🥁', 'Nhạc đệm Hành khúc', 'Nhạc đệm đi đều từng phách'),
  u('outfit', 'headphones', 4, '🎧', 'Tai nghe', 'Bé Nốt đeo tai nghe'),
  u('timbre', 'marimba', 5, '🪵', 'Đàn gỗ', 'Đàn tự do kêu cốc cốc như đàn gỗ'),
  u('backing', 'arpeggio', 6, '🌊', 'Nhạc đệm Rải', 'Nhạc đệm rải hợp âm lăn tăn'),
  u('outfit', 'bowtie', 8, '🎀', 'Nơ đỏ', 'Bé Nốt thắt nơ đi biểu diễn'),
  u('timbre', 'flute', 9, '🪈', 'Sáo', 'Đàn tự do thổi như cây sáo'),
  u('backing', 'bounce', 11, '🎵', 'Nhạc đệm Bùm-tách', 'Nhạc đệm trầm – cao, bùm – tách'),
  u('outfit', 'sunglasses', 12, '🕶️', 'Kính râm', 'Bé Nốt đeo kính siêu ngầu'),
  u('timbre', 'robot', 15, '🤖', 'Rô-bốt', 'Đàn tự do kêu bíp bíp như rô-bốt'),
  u('outfit', 'wizard', 18, '🧙', 'Mũ phù thủy', 'Bé Nốt đội mũ phù thủy âm nhạc'),
  u('timbre', 'bell', 21, '🔔', 'Chuông', 'Đàn tự do ngân như chuông'),
  u('outfit', 'mask', 24, '🦸', 'Mặt nạ siêu nhân', 'Bé Nốt thành siêu nhân'),
  u('timbre', 'organ', 26, '⛪', 'Đàn ống', 'Đàn tự do vang như đàn ống'),
  u('outfit', 'crown', 31, '👑', 'Vương miện', 'Bé Nốt đội vương miện nhà vô địch'),
];

export const findUnlock = (id: string): UnlockDef | undefined => UNLOCKS.find((x) => x.id === id);

/** Các món đã mở (theo thứ tự UNLOCKS). */
export function unlockedItems(data: Readonly<AppData>): UnlockDef[] {
  return UNLOCKS.filter((x) => islandPassed(x.week, data));
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' && x ? x : undefined);

/** Đọc MỀM settings.cosmetics (không có / hỏng → rỗng). */
export function storedCosmetics(data: Readonly<AppData>): Cosmetics {
  const c = (data.settings as { cosmetics?: unknown }).cosmetics;
  if (!isObj(c)) return {};
  const seen = Array.isArray(c.seen) ? c.seen.filter((x): x is string => typeof x === 'string') : undefined;
  return { outfit: str(c.outfit), timbre: str(c.timbre), backing: str(c.backing), ...(seen ? { seen } : {}) };
}

/** Món ĐANG DÙNG — chỉ trả món đã mở (mã lạ / chưa mở → không dùng). */
export function equipped(data: Readonly<AppData>): { outfit: string | null; timbre: string | null; backing: string | null } {
  const c = storedCosmetics(data);
  const open = new Set(unlockedItems(data).map((x) => x.id));
  const ok = (kind: UnlockKind, key: string | undefined) => (key && open.has(`${kind}:${key}`) ? key : null);
  return { outfit: ok('outfit', c.outfit), timbre: ok('timbre', c.timbre), backing: ok('backing', c.backing) };
}

/** Món đã mở mà chưa hiện màn mừng "🎁 Quà mới!". */
export function unseenUnlocks(data: Readonly<AppData>): UnlockDef[] {
  const seen = new Set(storedCosmetics(data).seen ?? []);
  return unlockedItems(data).filter((x) => !seen.has(x.id));
}

/** Cosmetics mới sau khi đánh dấu đã xem `ids` (giữ nguyên phần còn lại). */
export function withSeen(data: Readonly<AppData>, ids: readonly string[]): Cosmetics {
  const c = storedCosmetics(data);
  return { ...c, seen: [...new Set([...(c.seen ?? []), ...ids])] };
}

/**
 * Cosmetics mới sau khi bé chọn món `id` (đã mở): chọn lại món đang dùng = bỏ dùng (về mặc định).
 * Món mới mở lần đầu: tự đeo/dùng luôn (màn mừng) — xem `autoEquip`.
 */
export function withToggle(data: Readonly<AppData>, id: string): Cosmetics {
  const c = storedCosmetics(data);
  const d = findUnlock(id);
  if (!d || !unlockedItems(data).some((x) => x.id === id)) return c;
  return { ...c, [d.kind]: c[d.kind] === d.key ? undefined : d.key };
}

/**
 * Món vừa mở lần đầu → đánh dấu đã xem; TRANG PHỤC mới nhất được mặc luôn (bé thấy quà ngay). Tiếng đàn / nhạc đệm
 * không tự đổi (bé tự chọn trong Sổ sticker hoặc Đàn tự do) — nhạc đệm của buổi học không bất ngờ đổi kiểu.
 */
export function autoEquip(data: Readonly<AppData>, fresh: readonly UnlockDef[]): Cosmetics {
  const c = withSeen(data, fresh.map((x) => x.id));
  for (const d of fresh) if (d.kind === 'outfit') c.outfit = d.key;
  return c;
}
