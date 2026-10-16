/**
 * (+ 2026-10-16, OWNER duyệt — rà soát của giáo viên có kinh nghiệm) "👪 BỐ MẸ 30 GIÂY: HÔM NAY ĐỂ Ý…" — MỘT điều bố mẹ
 * để ý trong buổi hôm nay, chọn bằng luật từ nội dung bài hôm nay + lỗi gần đây. Chỉ là chữ (không đọc to, không ghi gì).
 * Hiện: đầu buổi (dải nhỏ trên màn khởi động / bài tập về nhà — đóng được) và thẻ "Việc cần làm tối nay" ở màn Phụ huynh.
 *
 * Thứ tự ưu tiên (điều cụ thể và mới nhất trước):
 *  1. bài mở THẾ TAY MỚI → "ngón cái đặt đúng <nốt>" (vd thế Sol: ngón cái tay phải trên Sol);
 *  2. bố mẹ vừa nhắc một lỗi tay / tư thế (handFocus, 14 ngày) → đúng điều đó;
 *  3. gần đây bé hay đàn lệch quãng 8 (middleC.octaveTrouble) → "Đô giữa";
 *  4. bài có đàn liền (trò Liền – Ngắt / bài hát mới của tuần có dấu luyến) → "các nốt có nối liền không"; chỉ đàn ngắt →
 *     "nốt ngắt có nảy ngắn không";
 *  5. bài có bài hát THEO NHỊP → "con có đếm thầm 1-2-3-4 không";
 *  6. bài đọc nhạc → "con nhìn bản nhạc, ít nhìn tay";
 *  7. còn lại → "ngón cong, cổ tay ngang".
 * Hàm thuần — test: tests/sessionHelpers-2026-10-16.test.ts.
 */
import { findTune } from '../music/exercises';
import { POSITIONS, type Hand, type PositionId } from '../piano/fingering';
import { viName, type Pitch } from '../piano/pitchTable';
import type { HandPrincipleId } from './handTechnique';
import { positionChange } from './middleC';
import type { Lesson } from './types';

export type ParentFocusId = 'position' | 'hand' | 'octave' | 'legato' | 'staccato' | 'tempo' | 'reading' | 'posture';

export interface ParentFocus {
  id: ParentFocusId;
  icon: string;
  /** Một dòng ngắn (≤ ~40 ký tự) sau "Hôm nay để ý:" */
  text: string;
  /** Câu đầy đủ cho bố mẹ (thẻ ở màn Phụ huynh) */
  detail: string;
}

/** Lỗi tay / tư thế bố mẹ vừa nhắc → điều để ý. */
const HAND_FOCUS: Record<HandPrincipleId, { text: string; detail: string }> = {
  shape: { text: 'mu bàn tay tròn như ôm quả bóng', detail: 'Lần trước bàn tay con hơi bẹp — nhìn xem mu bàn tay có tròn như ôm quả bóng nhỏ không.' },
  tip: { text: 'đầu ngón đứng vững, không bẹp khớp', detail: 'Lần trước khớp đầu ngón hay bị bẹp — nhìn xem đầu ngón con có đứng vững trên phím không.' },
  thumb: { text: 'ngón cái nằm nghiêng, không gồng', detail: 'Nhìn ngón cái: nằm nghiêng nhẹ trên phím, không cong gập hay gồng cứng.' },
  wrist: { text: 'cổ tay ngang phím, không võng', detail: 'Lần trước cổ tay hay võng / nhô — nhìn xem cổ tay con có ngang với phím không.' },
  weight: { text: 'vai thả lỏng, không gồng', detail: 'Lần trước vai con hơi gồng — nhìn xem vai có thả lỏng, cánh tay nặng tự nhiên không.' },
  quiet: { text: 'ngón nghỉ nằm yên trên phím', detail: 'Nhìn các ngón không đàn: nằm yên trên phím, không vểnh lên.' },
  sit: { text: 'ngồi thẳng, ghế đúng tầm', detail: 'Lần trước tư thế ngồi chưa đúng — nhìn xem con ngồi thẳng, khuỷu tay ngang phím, chân có chỗ tựa không.' },
  legato: { text: 'các nốt có nối liền, không hở', detail: 'Nghe xem các nốt có nối liền nhau như nước chảy, không hở tiếng không.' },
  staccato: { text: 'nốt ngắt có nảy thật ngắn', detail: 'Nghe xem nốt ngắt có nảy thật ngắn, như quả bóng chạm đất rồi bật lên không.' },
};

/** Tên phím ngón cái trong thế tay (Đô4 = "Đô giữa", Đô5 = "Đô cao"). */
export function thumbKeyName(position: Exclude<PositionId, 'free'>, hand: Hand): string | null {
  const map = POSITIONS[position]?.[hand];
  const p = map ? (Object.entries(map) as Array<[Pitch, number]>).find(([, f]) => f === 1)?.[0] : undefined;
  if (!p) return null;
  if (p === 'C4') return 'Đô giữa';
  if (p === 'C5') return 'Đô cao';
  return viName(p);
}

const HAND_VI: Record<Hand, string> = { RH: 'phải', LH: 'trái' };

/** Bài có đàn liền / đàn ngắt (trò Liền – Ngắt, hoặc bài hát MỚI của tuần có dấu luyến / chấm ngắt). */
function touchOf(lesson: Lesson): 'legato' | 'staccato' | null {
  let leg = false;
  let stac = false;
  let songStac = false;
  for (const a of lesson.activities) {
    if (a.kind === 'dynamics' && a.mode === 'stac-leg') {
      for (const r of a.rounds) {
        if (r.want === 'leg') leg = true;
        if (r.want === 'stac') stac = true;
      }
    }
    if (a.kind === 'song') {
      // Bài hát có dấu luyến / chấm ngắt: chỉ bài MỚI của tuần này (bài cũ đã quen cách đàn — để ý điều khác)
      const t = findTune(a.songId);
      if (!t || (t.week ?? 0) !== lesson.week) continue;
      for (const n of [...t.notes, ...(t.lh ?? [])]) {
        if (n.slur) leg = true;
        if (n.stac) songStac = true;
      }
    }
  }
  // Bài hát có chấm ngắt (hiếm, là điều MỚI) → ngắt; trò Liền – Ngắt / dấu luyến → liền
  return songStac ? 'staccato' : leg ? 'legato' : stac ? 'staccato' : null;
}

/** Bài có bài hát THEO NHỊP → số đếm của nhịp (vd "1-2-3-4"); không có → null. */
function tempoCount(lesson: Lesson): string | null {
  for (const a of lesson.activities) {
    if (a.kind !== 'song' || a.mode !== 'tempo') continue;
    const t = findTune(a.songId);
    const n = Number(t?.timeSignature.split('/')[0]) || 4;
    const per = n === 6 ? 2 : n; // 6/8: đếm "1-2" theo hai nhóm ba
    return Array.from({ length: Math.max(2, Math.min(per, 4)) }, (_, k) => k + 1).join('-');
  }
  return null;
}

/**
 * Điều bố mẹ để ý hôm nay cho bài `lesson`. `ctx.hand` = handFocus(...) (lỗi tay bố mẹ vừa nhắc); `ctx.octave` = bé gần đây
 * hay đàn lệch quãng 8 (middleC.octaveTrouble); `ctx.lessonDone` = bài đã học xong (thế tay không còn "mới").
 */
export function parentFocus(lesson: Lesson, ctx: { hand?: HandPrincipleId | null; octave?: boolean; lessonDone?: boolean } = {}): ParentFocus {
  const pos = ctx.lessonDone ? null : positionChange(lesson);
  const thumb = pos ? thumbKeyName(pos.position, pos.hand) : null;
  if (pos && thumb) {
    return {
      id: 'position',
      icon: '👍',
      text: `ngón cái tay ${HAND_VI[pos.hand]} đặt đúng ${thumb}`,
      detail: `Hôm nay con đổi sang thế tay mới — trước khi đàn, nhìn xem ngón cái tay ${HAND_VI[pos.hand]} đặt đúng phím ${thumb} chưa.`,
    };
  }
  if (ctx.hand) return { id: 'hand', icon: '✋', ...HAND_FOCUS[ctx.hand] };
  if (ctx.octave) {
    return {
      id: 'octave',
      icon: '📍',
      text: 'tay con đặt đúng Đô giữa chưa',
      detail: 'Mấy hôm nay con hay đàn đúng tên nốt nhưng lệch một quãng tám — trước khi đàn, nhắc con tìm Đô giữa (gần giữa đàn, dưới tên hãng đàn).',
    };
  }
  const touch = touchOf(lesson);
  if (touch) return { id: touch, icon: touch === 'legato' ? '🌊' : '🏀', ...HAND_FOCUS[touch] };
  const count = tempoCount(lesson);
  if (count) {
    return {
      id: 'tempo',
      icon: '🥁',
      text: `con có đếm thầm ${count} không`,
      detail: `Khi con đàn theo nhịp, nhìn môi con: có đếm thầm "${count}" không? Đều quan trọng hơn nhanh.`,
    };
  }
  if (lesson.activities.some((a) => a.kind === 'sight')) {
    return { id: 'reading', icon: '👀', text: 'con nhìn bản nhạc, ít nhìn tay', detail: 'Khi đọc nhạc, để ý con nhìn bản nhạc nhiều hơn nhìn tay — chậm cũng được.' };
  }
  return { id: 'posture', icon: '🖐️', text: 'ngón cong, cổ tay ngang', detail: 'Nhìn tay con khi đàn: ngón cong như ôm quả bóng, cổ tay ngang với phím.' };
}
