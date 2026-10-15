/**
 * (+ 2026-10-15, OWNER: "tập trung vào phần đồ họa — ngón tay đánh đàn phải đúng tư thế để đủ lực") NGUYÊN TẮC THẾ TAY
 * trên đàn cơ — dữ liệu thuần (không DOM): mỗi nguyên tắc = tranh "Đúng ✓ / Chưa đúng ✗" + một câu ngắn (≤ 12 chữ, đọc to).
 * Tranh vẽ ở src/ui/components/handTechniqueArt.ts (nạp muộn).
 *
 * Không đổi giáo trình / tiêu chí: chỉ thêm tham chiếu tới tranh (bài khởi động tay → nguyên tắc; thẻ bố mẹ xem tay → nguyên tắc).
 */
import type { AppData } from '../progress/schema';
import type { TechniqueDrill } from './types';

export type HandPrincipleId = 'shape' | 'tip' | 'thumb' | 'wrist' | 'weight' | 'quiet' | 'sit' | 'legato' | 'staccato';
/** Biến thể tranh: đúng · chưa đúng (· kiểu sai thứ hai, vd cổ tay nhô). */
export type HandVariant = 'good' | 'bad' | 'bad2';

export interface HandPanel {
  variant: HandVariant;
  /** Nhãn dưới tranh (≤ 6 chữ) */
  label: string;
}

export interface HandPrinciple {
  id: HandPrincipleId;
  emoji: string;
  /** Tên ngắn (≤ 6 chữ) */
  title: string;
  /** Một câu cho bé (≤ 12 chữ) — hiện và đọc to */
  caption: string;
  panels: HandPanel[];
  /** Vì sao (cho bố mẹ, một câu) */
  why: string;
  /** Tranh có hoạt hình */
  animated?: boolean;
}

export const HAND_PRINCIPLES: readonly HandPrinciple[] = [
  {
    id: 'shape',
    emoji: '⚽',
    title: 'Bàn tay ôm quả bóng',
    caption: 'Khum tay tròn, khớp gốc ngón cao và chắc như cây cầu.',
    panels: [
      { variant: 'good', label: 'Tay tròn, cầu cao' },
      { variant: 'bad', label: 'Tay bẹp, cầu sụp' },
    ],
    why: 'Khớp gốc ngón (cây cầu) đỡ sức nặng cánh tay — cầu sụp thì lực tản mất, tiếng đàn yếu.',
  },
  {
    id: 'tip',
    emoji: '👆',
    title: 'Đầu ngón đứng vững',
    caption: 'Chạm phím bằng đầu ngón, khớp đầu không gãy vào.',
    panels: [
      { variant: 'good', label: 'Đầu ngón đứng' },
      { variant: 'bad', label: 'Khớp đầu gãy' },
    ],
    why: 'Khớp đầu ngón bẹp vào là lý do số 1 khiến tiếng đàn cơ yếu và không đều.',
    animated: true,
  },
  {
    id: 'thumb',
    emoji: '👍',
    title: 'Ngón cái nằm nghiêng',
    caption: 'Ngón cái chạm bằng cạnh đầu ngón, mềm và hơi cong.',
    panels: [
      { variant: 'good', label: 'Cạnh ngón, hơi cong' },
      { variant: 'bad', label: 'Cứng, thõng xuống' },
    ],
    why: 'Ngón cái thõng hay gồng kéo cả bàn tay lệch, các ngón khác mất cây cầu.',
  },
  {
    id: 'wrist',
    emoji: '🌊',
    title: 'Cổ tay ngang phím',
    caption: 'Cẳng tay, cổ tay, bàn tay thẳng một đường ngang phím.',
    panels: [
      { variant: 'good', label: 'Thẳng hàng' },
      { variant: 'bad', label: 'Võng xuống' },
      { variant: 'bad2', label: 'Nhô lên' },
    ],
    why: 'Cổ tay võng hay nhô làm gãy đường truyền lực từ cánh tay xuống đầu ngón.',
  },
  {
    id: 'weight',
    emoji: '🪶',
    title: 'Thả sức nặng cánh tay',
    caption: 'Vai thả lỏng, thả tay rơi xuống phím rồi nhấc nhẹ.',
    panels: [
      { variant: 'good', label: 'Thả – nhấc' },
      { variant: 'bad', label: 'Gồng vai, ấn' },
    ],
    why: 'Tiếng to và ấm đến từ sức nặng cánh tay rơi qua ngón cong — không phải từ gồng vai hay ấn ngón.',
    animated: true,
  },
  {
    id: 'quiet',
    emoji: '🤫',
    title: 'Ngón nghỉ nằm yên',
    caption: 'Ngón không đánh nằm nhẹ trên phím, không vểnh lên.',
    panels: [
      { variant: 'good', label: 'Nằm nhẹ trên phím' },
      { variant: 'bad', label: 'Ngón út vểnh' },
    ],
    why: 'Ngón vểnh lên là đang gồng — tay mỏi nhanh và ngón sau tới phím chậm.',
  },
  {
    id: 'sit',
    emoji: '🪑',
    title: 'Ngồi đúng chỗ',
    caption: 'Khuỷu tay hơi trước người, cẳng tay ngang phím, chân đặt vững.',
    panels: [
      { variant: 'good', label: 'Ghế vừa, kê chân' },
      { variant: 'bad', label: 'Ngồi xa, chân lơ lửng' },
    ],
    why: 'Ghế quá thấp hay quá xa thì cổ tay võng và vai phải gồng. Thấp: kê gối. Chân hẫng: kê hộp.',
  },
  {
    id: 'legato',
    emoji: '🚶',
    title: 'Đàn liền: đi bộ trên phím',
    caption: 'Chuyển sức nặng từ ngón này sang ngón kia, như đi bộ.',
    panels: [
      { variant: 'good', label: 'Liền như đi bộ' },
      { variant: 'bad', label: 'Nhấc hết, tiếng hở' },
    ],
    why: 'Đàn liền (tuần 5): nốt trước chỉ nhả khi nốt sau đã vang — như bước chân, luôn có một chân chạm đất.',
    animated: true,
  },
  {
    id: 'staccato',
    emoji: '🐇',
    title: 'Đàn ngắt: nảy như bóng',
    caption: 'Cổ tay nảy nhẹ, đầu ngón chạm rồi bật lên ngay.',
    panels: [
      { variant: 'good', label: 'Nảy nhẹ từ cổ tay' },
      { variant: 'bad', label: 'Ấn cả cánh tay' },
    ],
    why: 'Đàn ngắt (tuần 12): nảy từ cổ tay mềm, không giật cả cánh tay.',
    animated: true,
  },
];

export function handPrinciple(id: HandPrincipleId): HandPrinciple {
  return HAND_PRINCIPLES.find((p) => p.id === id) ?? HAND_PRINCIPLES[0];
}

/** Câu đọc to của một thẻ. */
export function principleSpeech(p: HandPrinciple): string {
  return `${p.title}. ${p.caption}`;
}

/** Bài khởi động tay → tranh nguyên tắc hiện cạnh (technique.ts). */
export const DRILL_PRINCIPLE: Record<TechniqueDrill, HandPrincipleId> = {
  'arm-drop': 'weight',
  'wrist-circle': 'wrist',
  'finger-tap': 'tip',
  'five-finger': 'quiet',
  'thumb-under': 'thumb',
  'hand-shape': 'shape',
};

/**
 * THẺ TƯ THẾ ĐẦY ĐỦ (posture.ts): 4 thẻ ngắn — ngồi · dáng tay · đầu ngón · cổ tay & sức nặng cánh tay.
 * Mỗi thẻ tự sang thẻ sau sau POSTURE_CARD_MS (thẻ cuối chờ bé chạm "Xong rồi"); luôn có "Bỏ qua".
 */
export interface PostureCard {
  principle: HandPrincipleId;
  emoji: string;
  /** Dòng to (≤ 6 chữ) */
  text: string;
  /** Dòng nhỏ (≤ 12 chữ) */
  sub: string;
}
export const POSTURE_CARDS: readonly PostureCard[] = [
  { principle: 'sit', emoji: '🪑', text: 'Ngồi thẳng, chân vững', sub: 'Khuỷu tay hơi trước người, cẳng tay ngang phím' },
  { principle: 'shape', emoji: '⚽', text: 'Tay tròn như ôm bóng', sub: 'Khớp gốc ngón cao như cây cầu' },
  { principle: 'tip', emoji: '👆', text: 'Đầu ngón đứng vững', sub: 'Chạm bằng đầu ngón, khớp đầu không gãy' },
  { principle: 'weight', emoji: '🪶', text: 'Cổ tay ngang, vai thả', sub: 'Thả nhẹ cánh tay xuống phím rồi nhấc' },
];
/** Thời gian tự chuyển mỗi thẻ (ms). 3 lần tự chuyển + thẻ cuối ≈ ≤ 40 giây. */
export const POSTURE_CARD_MS = 9000;
/** Tổng thời gian dự kiến của 4 thẻ khi bé không chạm gì (thẻ cuối tính như các thẻ khác). */
export const POSTURE_FLOW_MAX_MS = POSTURE_CARD_MS * POSTURE_CARDS.length;

/**
 * Thứ tự thẻ tư thế: nếu bố mẹ vừa nhắc một lỗi tay (handFocus) thì thẻ đó lên ĐẦU (vẫn đủ 4 thẻ, không dài thêm);
 * lỗi không có thẻ riêng (vd ngón cái) → thay thẻ "đầu ngón" bằng thẻ của lỗi đó.
 */
export function postureOrder(flag: HandPrincipleId | null | undefined): PostureCard[] {
  const cards = [...POSTURE_CARDS];
  if (!flag) return cards;
  const k = cards.findIndex((c) => c.principle === flag || (flag === 'wrist' && c.principle === 'weight'));
  if (k > 0) {
    const [c] = cards.splice(k, 1);
    cards.unshift(c);
  } else if (k < 0) {
    const p = handPrinciple(flag);
    const extra: PostureCard = { principle: flag, emoji: p.emoji, text: p.title, sub: p.caption };
    cards.splice(cards.findIndex((c) => c.principle === 'tip'), 1);
    cards.unshift(extra);
  }
  return cards;
}

/** Bộ điều khiển dãy thẻ tư thế (thuần — test được không cần DOM). */
export interface PostureFlow {
  readonly index: number;
  readonly total: number;
  /** Sang thẻ sau (thẻ cuối → xong). */
  next(): void;
  prev(): boolean;
  /** Bỏ qua cả dãy. */
  skip(): void;
  /** Trôi thời gian `ms` trên thẻ hiện tại (tự chuyển thẻ, trừ thẻ cuối). Trả về true nếu đã đổi thẻ. */
  tick(ms: number): boolean;
  readonly finished: boolean;
}
export function createPostureFlow(total: number, onDone: () => void, cardMs = POSTURE_CARD_MS): PostureFlow {
  let index = 0;
  let spent = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone();
  };
  return {
    get index() {
      return index;
    },
    total,
    get finished() {
      return finished;
    },
    next() {
      if (finished) return;
      spent = 0;
      if (index < total - 1) index++;
      else finish();
    },
    prev() {
      if (finished || index === 0) return false;
      index--;
      spent = 0;
      return true;
    },
    skip: finish,
    tick(ms: number) {
      if (finished || index >= total - 1) return false;
      spent += ms;
      if (spent < cardMs) return false;
      spent = 0;
      index++;
      return true;
    },
  };
}

/**
 * Thẻ bố mẹ chấm (PARENT_ASSESSMENT note) → nguyên tắc tay tương ứng. Lần chấm GẦN NHẤT là "Làm lại" → lần sau hiện tranh.
 * Chỉ ĐỌC dữ liệu đã có — không ghi gì, không đổi tiêu chí.
 */
export const CHECK_PRINCIPLE: Readonly<Record<string, HandPrincipleId>> = {
  'relax:joint': 'tip',
  'relax:wrist': 'wrist',
  'relax:shoulder': 'weight',
  'posture-hand': 'shape',
  'posture-wrist': 'wrist',
  'posture-back': 'sit',
  'tech:hand-shape': 'shape',
  'tech:finger-tap': 'tip',
  'tech:arm-drop': 'weight',
  'tech:wrist-circle': 'wrist',
  'tech:thumb-under': 'thumb',
};

/** "👀 Bố mẹ xem tay con" — 3 ý nhìn nhanh (phiếu nhỏ, KHÔNG ghi vào tiêu chí). */
export const HAND_LOOK: ReadonlyArray<{ key: 'tip' | 'shape' | 'wrist'; label: string; hint: string }> = [
  { key: 'tip', label: 'Đầu ngón đứng', hint: 'Khớp đầu ngón không bẹp vào trong' },
  { key: 'shape', label: 'Khớp gốc cao', hint: 'Mu bàn tay tròn như cây cầu' },
  { key: 'wrist', label: 'Cổ tay ngang', hint: 'Không võng xuống, không nhô lên' },
];

/** Kết quả phiếu "Bố mẹ xem tay con" gần nhất (lưu riêng, chỉ để nhắc tranh). */
export interface HandLookResult {
  ts: number;
  missing: HandPrincipleId[];
}
export const HAND_LOOK_KEY = 'piano-be-9-hand-look';
/** Lời nhắc chỉ có hiệu lực trong ngần này ngày. */
export const HAND_FOCUS_DAYS = 14;

export function readHandLook(storage?: Pick<Storage, 'getItem'> | null): HandLookResult | null {
  try {
    const st = storage === undefined ? globalThis.localStorage : storage;
    const raw = st?.getItem(HAND_LOOK_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as HandLookResult;
    return typeof v?.ts === 'number' && Array.isArray(v.missing) ? v : null;
  } catch {
    return null;
  }
}
export function saveHandLook(missing: HandPrincipleId[], now = Date.now(), storage?: Pick<Storage, 'setItem'> | null): void {
  try {
    const st = storage === undefined ? globalThis.localStorage : storage;
    st?.setItem(HAND_LOOK_KEY, JSON.stringify({ ts: now, missing } satisfies HandLookResult));
  } catch {
    /* bộ nhớ đầy / chế độ riêng tư — chỉ là lời nhắc */
  }
}

/**
 * Lỗi tay bố mẹ vừa nhắc (gần nhất, trong HAND_FOCUS_DAYS ngày) → nguyên tắc để hiện tranh "lần sau". null = không có.
 * Nguồn: thẻ chấm (CHECK_PRINCIPLE) có lần chấm GẦN NHẤT là "Làm lại"; phiếu 3 ý bài hát có "ngón & dáng tay" chưa đạt ở
 * lượt gần nhất; phiếu "Bố mẹ xem tay con".
 */
export function handFocus(
  data: Readonly<Pick<AppData, 'sessions'>> | undefined,
  now: number = Date.now(),
  look: HandLookResult | null = null,
): HandPrincipleId | null {
  const since = now - HAND_FOCUS_DAYS * 86_400_000;
  const latest = new Map<string, { ts: number; retry: boolean }>();
  let song: { ts: number; bad: boolean } | null = null;
  for (const s of data?.sessions ?? []) {
    for (const a of s.parentAssessments ?? []) {
      if (!(a.note in CHECK_PRINCIPLE)) continue;
      const ts = a.ts || s.startedAt || 0;
      const prev = latest.get(a.note);
      if (!prev || ts >= prev.ts) latest.set(a.note, { ts, retry: a.result === 'retry' });
    }
    for (const r of s.songRuns ?? []) {
      if (!r.checklist || r.source !== 'parent') continue;
      if (!song || r.ts >= song.ts) song = { ts: r.ts, bad: !r.checklist.fingers };
    }
  }
  let best: { ts: number; id: HandPrincipleId } | null = null;
  for (const [note, v] of latest) {
    if (!v.retry || v.ts < since || v.ts > now + 60_000) continue;
    if (!best || v.ts > best.ts) best = { ts: v.ts, id: CHECK_PRINCIPLE[note] };
  }
  if (song?.bad && song.ts >= since && (!best || song.ts > best.ts)) best = { ts: song.ts, id: 'shape' };
  if (look && look.missing.length && look.ts >= since && (!best || look.ts > best.ts)) best = { ts: look.ts, id: look.missing[0] };
  return best?.id ?? null;
}
