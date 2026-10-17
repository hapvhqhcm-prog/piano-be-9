/**
 * (+ 2026-10-17, OWNER duyệt "Gộp phần thưởng, kết buổi 1 màn") QUY TẮC HIỂN THỊ PHẦN THƯỞNG cho bé — CHỈ đổi cách
 * hiện, KHÔNG đổi cách nhận: sticker / trứng / quà đảo đã nhận vẫn tính y như cũ (stickers.ts, bonusStickers.ts,
 * unlocks.ts) và luôn thấy trong sổ sticker.
 *
 *  - Sổ sticker: chỉ hiện sticker ĐÃ CÓ + tối đa 3 sticker "Sắp có" gần nhất (nextStickers) — không còn hàng dài bóng
 *    xám kiểu "Tập đàn 120 ngày".
 *  - MỘT BẤT NGỜ MỖI NGÀY (surpriseFree): quả trứng ở màn kết HOẶC màn "🎁 Quà mới" ở màn chính, không cả hai trong một
 *    ngày. Phần không hiện vẫn đã nhận (trứng nằm trong sổ; quà đảo "chưa xem" → hiện ở ngày sau).
 *  - Màn kết buổi MỘT màn (endScreenPlan): một thẻ nổi bật (cập bến đảo > cúp tuần > trứng / chào mừng > sticker mới),
 *    các thứ mới còn lại gộp thành một dòng "+N sticker mới trong sổ 📒"; tối đa MỘT lời mời (sessionFlow.pickEndOffer).
 * Hàm THUẦN + hai hàm đọc/ghi localStorage nhỏ (mất thì chỉ mừng thêm tối đa một lần). Test: tests/kidHome-2026-10-17.test.ts.
 */
import { FOLK_SONG_IDS, activeWeekCount, busyWeeks, practiceDayCount, type Sticker } from './stickers';
import type { BonusEvent } from './bonusStickers';
import type { AppData } from '../progress/schema';
import { levelOf } from './curriculum';
import { masteredSongs } from './songStats';
import { findSong } from '../music/tune';

// ------------------------------------------------------------------ Sổ sticker: "Sắp có"

/** Số đo tiến độ để xếp sticker "Sắp có". */
export interface StickerProgress {
  /** Số bài đã thuộc */
  songs: number;
  /** Số tuần chăm chỉ */
  busyWeeks: number;
  /** Số ngày có tập */
  days: number;
  /** Số tuần có tập */
  activeWeeks: number;
  /** Tuần giáo trình hiện tại */
  currentWeek: number;
  /** Tuần cuối của cấp hiện tại (tuần lên sân khấu nhận huy chương) */
  levelEndWeek: number;
  /** Micro đang bật (sticker "Đàn chuẩn" mới với tới được) */
  micEnabled: boolean;
  /** Đã mở bài dân ca (tuần hiện tại ≥ tuần bài dân ca đầu tiên) */
  folkOpen: boolean;
}

/** Số đo tiến độ của bé (đọc từ dữ liệu — cùng nguồn với stickers.ts). */
export function stickerProgress(data: Readonly<AppData>): StickerProgress {
  const week = data.progress.currentWeek;
  const folkWeeks = FOLK_SONG_IDS.map((id) => findSong(id)?.week ?? Infinity);
  return {
    songs: masteredSongs(data).length,
    busyWeeks: busyWeeks(data),
    days: practiceDayCount(data),
    activeWeeks: activeWeekCount(data),
    currentWeek: week,
    levelEndWeek: levelOf(week).weeks[1],
    micEnabled: !!data.settings.micEnabled,
    folkOpen: folkWeeks.some((w) => w <= week),
  };
}

/** Sticker nhận theo mốc số (n) — chỉ mốc CHƯA nhận nhỏ nhất của mỗi loại mới là "Sắp có". */
const COUNT_KINDS: Partial<Record<Sticker['kind'], keyof StickerProgress>> = {
  songs: 'songs',
  week: 'busyWeeks',
  days: 'days',
  activeWeeks: 'activeWeeks',
};

/**
 * Tối đa `max` sticker CHƯA có mà bé sắp với tới (gần xong nhất trước). Một loại theo mốc chỉ góp mốc kế tiếp; đảo chỉ
 * góp đảo hiện tại; huy chương chỉ khi đang ở tuần sân khấu; cúp tuần / buổi diễn / trứng không nằm ở đây (có mục riêng).
 */
export function nextStickers(all: readonly Sticker[], p: StickerProgress, max = 3): Sticker[] {
  const cands: Array<{ s: Sticker; left: number }> = [];
  const seenKind = new Set<string>();
  // Mốc nhỏ nhất chưa nhận của từng loại (sticker 'days' cũ id streak-* luôn là đã nhận nên không lọt vào)
  const sorted = [...all].sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  for (const s of sorted) {
    if (s.earned) continue;
    const key = COUNT_KINDS[s.kind];
    if (key && s.n) {
      if (seenKind.has(s.kind)) continue;
      seenKind.add(s.kind);
      const have = Number(p[key]) || 0;
      // Mốc trước (đã nhận) của cùng loại → phần CÒN LẠI của chặng này (0–1)
      const prev = Math.max(0, ...all.filter((x) => x.kind === s.kind && x.earned && (x.n ?? 0) < s.n!).map((x) => x.n ?? 0));
      const span = Math.max(1, s.n - prev);
      cands.push({ s, left: Math.min(1, Math.max(0, (s.n - have) / span)) });
      continue;
    }
    if (s.kind === 'island' && s.week === p.currentWeek) cands.push({ s, left: 0.3 });
    else if (s.kind === 'medal' && s.week === p.levelEndWeek && p.currentWeek === p.levelEndWeek) cands.push({ s, left: 0.2 });
    else if (s.kind === 'folk' && p.folkOpen) cands.push({ s, left: 0.8 });
    else if (s.kind === 'mic' && p.micEnabled) cands.push({ s, left: 0.85 });
  }
  return cands
    .sort((a, b) => a.left - b.left)
    .slice(0, Math.max(0, max))
    .map((c) => c.s);
}

// ------------------------------------------------------------------ Một bất ngờ mỗi ngày

/** Khóa localStorage: ngày (YYYY-MM-DD) đã có bất ngờ (trứng mở ở màn kết / màn 🎁 Quà mới). */
export const SURPRISE_KEY = 'piano-be-9:surprise-day';

/** Hôm nay còn chỗ cho một bất ngờ không. */
export const surpriseFree = (lastDay: string | null, today: string): boolean => lastDay !== today;

export function readSurpriseDay(): string | null {
  try {
    return localStorage.getItem(SURPRISE_KEY);
  } catch {
    return null;
  }
}

export function markSurpriseDay(today: string): void {
  try {
    localStorage.setItem(SURPRISE_KEY, today);
  } catch {
    /* không có bộ nhớ → chỉ là mừng thêm tối đa một lần */
  }
}

// ------------------------------------------------------------------ Màn kết buổi: MỘT màn

export type EndHighlight =
  | { kind: 'island'; fromWeek: number; toWeek: number }
  | { kind: 'cup' }
  | { kind: 'welcome'; bonus: BonusEvent }
  | { kind: 'egg'; bonus: BonusEvent }
  | { kind: 'sticker'; sticker: Sticker };

export type EndOfferKind = 'stretch' | 'reward' | 'concert';

export interface EndPlanInput {
  /** Vừa sang tuần mới (cập bến đảo mới) */
  advanced: boolean;
  fromWeek: number;
  toWeek: number;
  /** Mừng hoàn thành thử thách tuần (một lần) */
  cheer: boolean;
  /** Sticker mới của buổi (đã bỏ cúp tuần nếu cheer) */
  fresh: readonly Sticker[];
  /** Sticker bất ngờ của buổi (trứng / chào mừng) */
  bonus: BonusEvent | null;
  /** Hôm nay còn chỗ cho một bất ngờ (surpriseFree) */
  surpriseFree: boolean;
  /** Lời mời DUY NHẤT do session chọn (pickEndOffer); null = không mời */
  offer: EndOfferKind | null;
}

export interface EndPlan {
  highlight: EndHighlight | null;
  /** Số thứ mới KHÔNG nằm trong thẻ nổi bật → một dòng "+N sticker mới trong sổ 📒" (0 = không hiện) */
  more: number;
  /** Thẻ nổi bật là bất ngờ của ngày → ghi markSurpriseDay */
  usesSurprise: boolean;
  /** Có gì để mừng → ghi "đã mừng" cho lần mở app này (celebrationQueue) */
  celebrate: boolean;
  offer: EndOfferKind | null;
}

/** Thứ tự nổi bật của sticker thường (hiếm trước) */
const RARE: Sticker['kind'][] = ['medal', 'concert', 'songs', 'folk', 'mic', 'dynamics', 'week', 'activeWeeks', 'days', 'streak', 'island', 'challenge'];

/** Bố cục màn kết buổi (hàm thuần). */
export function endScreenPlan(o: EndPlanInput): EndPlan {
  // Sticker đảo vừa qua đi cùng cảnh cập bến → không đếm hai lần
  const fresh = o.advanced ? o.fresh.filter((s) => !(s.kind === 'island' && s.week === o.fromWeek)) : [...o.fresh];
  const bonus = o.bonus;
  // Chào mừng (buổi đầu tiên) luôn hiện; trứng chỉ khi hôm nay chưa có bất ngờ
  const bonusShowable = !!bonus && (bonus.kind === 'welcome' || o.surpriseFree);
  let highlight: EndHighlight | null = null;
  if (o.advanced) highlight = { kind: 'island', fromWeek: o.fromWeek, toWeek: o.toWeek };
  else if (o.cheer) highlight = { kind: 'cup' };
  else if (bonus && bonusShowable) highlight = bonus.kind === 'welcome' ? { kind: 'welcome', bonus } : { kind: 'egg', bonus };
  else if (fresh.length) {
    const top = [...fresh].sort((a, b) => RARE.indexOf(a.kind) - RARE.indexOf(b.kind) || (b.n ?? 0) - (a.n ?? 0))[0];
    highlight = { kind: 'sticker', sticker: top };
  }
  const featuredSticker = highlight?.kind === 'sticker' ? 1 : 0;
  const featuredBonus = highlight?.kind === 'egg' || highlight?.kind === 'welcome' ? 1 : 0;
  const more = fresh.length - featuredSticker + (bonus ? 1 - featuredBonus : 0);
  return {
    highlight,
    more: Math.max(0, more),
    usesSurprise: highlight?.kind === 'egg' || highlight?.kind === 'welcome',
    celebrate: highlight !== null || more > 0,
    offer: o.offer,
  };
}
