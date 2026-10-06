import type { AppData, Session } from '../progress/schema';

/**
 * STICKER BẤT NGỜ 🎁 + TÓM TẮT BUỔI — hàm thuần, KHÔNG lưu gì thêm (tính lại từ lịch sử buổi học).
 *
 * - Buổi học đầu tiên (buổi bài học hoàn thành đầu tiên) → sticker "Chào mừng".
 * - Các buổi sau: ~1/4 buổi có "quả trứng bí ẩn" (băm id buổi — cố định, không đổi khi mở lại app);
 *   không bao giờ quá MAX_GAP buổi liền không có trứng. Sticker trong trứng: ưu tiên con CHƯA có (sưu tầm dần đủ bộ).
 * - Vì chỉ suy ra từ các buổi đã hoàn thành (mảng chỉ thêm vào cuối), kết quả của buổi cũ không bao giờ đổi.
 */

export interface BonusDef {
  key: string;
  emoji: string;
  title: string;
  /** Hai màu nền (sáng → đậm) của huy hiệu tròn */
  bg: [string, string];
}

export const WELCOME_STICKER: BonusDef = { key: 'welcome', emoji: '🎹', title: 'Chào mừng', bg: ['#fff3c4', '#ffcb3d'] };

/** Bộ sưu tập bất ngờ: rô-bốt, siêu nhân, khủng long, vũ trụ… (thứ tự cố định — đừng xếp lại, chỉ thêm vào cuối). */
export const BONUS_POOL: readonly BonusDef[] = [
  { key: 'robot', emoji: '🤖', title: 'Rô-bốt Tí Hon', bg: ['#dff3ff', '#7cc8f2'] },
  { key: 'rocket', emoji: '🚀', title: 'Tên lửa', bg: ['#ece7ff', '#8a6cff'] },
  { key: 'dino', emoji: '🦖', title: 'Khủng long Rex', bg: ['#c8f1dc', '#3ccf88'] },
  { key: 'hero', emoji: '🦸', title: 'Siêu nhân', bg: ['#ffd9cf', '#ff7a6b'] },
  { key: 'alien', emoji: '👽', title: 'Bạn ngoài hành tinh', bg: ['#e7f9f0', '#7fd47a'] },
  { key: 'planet', emoji: '🪐', title: 'Sao Thổ', bg: ['#fff8e1', '#ffcb3d'] },
  { key: 'bolt', emoji: '⚡', title: 'Tia chớp', bg: ['#fff3c4', '#f0a81c'] },
  { key: 'dragon', emoji: '🐉', title: 'Rồng xanh', bg: ['#c8f1dc', '#22b36b'] },
  { key: 'ufo', emoji: '🛸', title: 'Đĩa bay', bg: ['#dff3ff', '#4aa3dc'] },
  { key: 'shield', emoji: '🛡️', title: 'Khiên siêu nhân', bg: ['#e8e4ff', '#5b54d6'] },
  { key: 'sauropod', emoji: '🦕', title: 'Khủng long cổ dài', bg: ['#e7f9f0', '#4fd1a5'] },
  { key: 'astronaut', emoji: '🧑‍🚀', title: 'Phi hành gia', bg: ['#ece7ff', '#b9a8ff'] },
  { key: 'mech', emoji: '🦾', title: 'Cánh tay rô-bốt', bg: ['#f3f1ff', '#8c84b8'] },
  { key: 'comet', emoji: '☄️', title: 'Sao chổi', bg: ['#ffeed2', '#ff9f43'] },
  { key: 'ninja', emoji: '🥷', title: 'Ninja âm nhạc', bg: ['#e7e3f6', '#5b5680'] },
  { key: 'trex-egg', emoji: '🐣', title: 'Gà con phá vỏ', bg: ['#fff8e1', '#ffd96a'] },
];

/** Trung bình 1 trứng / EGG_EVERY buổi */
export const EGG_EVERY = 4;
/** Không bao giờ quá MAX_GAP buổi liền không có trứng */
export const MAX_GAP = 5;

/** FNV-1a 32 bit — băm chuỗi ổn định (không phụ thuộc máy). */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Buổi BÀI HỌC — không tính lượt chơi tự do ở Thư viện (`w{n}-song-…`) và buổi "▶ Làm ngay" của bố mẹ (`w{n}-parent-…`,
 * không qua màn kết thúc nên bé không thấy trứng).
 */
export const isLessonSession = (s: Pick<Session, 'lessonId'>): boolean => !/-song-|-parent-/.test(s.lessonId);

export interface BonusEvent {
  sessionId: string;
  date: string;
  kind: 'welcome' | 'egg';
  sticker: BonusDef;
}

/**
 * Trạng thái cộng dồn của sticker bất ngờ — để phần GỘP LỊCH SỬ (progress/compaction.ts, của DATA) có thể gộp buổi cũ
 * mà sổ sticker không đổi: lưu `history.bonus = stepBonus(history.bonus ?? initialBonusState(), buổi)` cho từng buổi gộp.
 * Chưa có `history.bonus` thì tính như mọi buổi đều còn trong `sessions`.
 */
export interface BonusState {
  /** Đã có buổi bài học hoàn thành (đã nhận "Chào mừng") */
  welcomed: boolean;
  /** Số buổi liền không có trứng kể từ quả trứng gần nhất */
  gap: number;
  /** Sticker bất ngờ đã nhận → số lần */
  owned: Record<string, number>;
}

export const initialBonusState = (): BonusState => ({ welcomed: false, gap: 0, owned: {} });

/** Cộng MỘT buổi vào trạng thái (sửa tại chỗ); trả về sticker của buổi đó (null = không có). */
export function stepBonus(st: BonusState, s: Readonly<Session>): BonusEvent | null {
  if (!s.completed || !isLessonSession(s)) return null;
  if (!st.welcomed) {
    st.welcomed = true;
    st.owned[WELCOME_STICKER.key] = (st.owned[WELCOME_STICKER.key] ?? 0) + 1;
    return { sessionId: s.id, date: s.date, kind: 'welcome', sticker: WELCOME_STICKER };
  }
  st.gap++;
  if (hashStr(s.id) % EGG_EVERY !== 0 && st.gap < MAX_GAP) return null;
  st.gap = 0;
  const start = hashStr(`${s.id}#pick`) % BONUS_POOL.length;
  let pick = BONUS_POOL[start];
  for (let k = 0; k < BONUS_POOL.length; k++) {
    const c = BONUS_POOL[(start + k) % BONUS_POOL.length];
    if (!st.owned[c.key]) {
      pick = c;
      break;
    }
  }
  st.owned[pick.key] = (st.owned[pick.key] ?? 0) + 1;
  return { sessionId: s.id, date: s.date, kind: 'egg', sticker: pick };
}

/** Trạng thái đã gộp (nếu DATA lưu `history.bonus`) — đọc mềm, không phụ thuộc kiểu History. */
function foldedState(data: Readonly<AppData>): BonusState {
  const b = (data as { history?: { bonus?: BonusState } }).history?.bonus;
  return b ? { welcomed: !!b.welcomed, gap: b.gap ?? 0, owned: { ...(b.owned ?? {}) } } : initialBonusState();
}

/** Sổ "bất ngờ" đầy đủ: trạng thái sau khi cộng cả buổi đã gộp lẫn các buổi còn trong `sessions`. */
function bonusState(data: Readonly<AppData>): { state: BonusState; events: BonusEvent[] } {
  const state = foldedState(data);
  const events: BonusEvent[] = [];
  // Buổi đã gộp (tóm tắt) + buổi còn giữ, xếp theo THỜI GIAN — kết quả không phụ thuộc buổi nào đã bị gộp
  const stubs = (data as { history?: { bonusStubs?: Array<{ id: string; date: string; lessonId: string; t: number }> } }).history
    ?.bonusStubs;
  const all: Session[] = stubs?.length
    ? [
        ...stubs.map((b) => ({ id: b.id, date: b.date, lessonId: b.lessonId, startedAt: b.t, completed: true }) as Session),
        ...data.sessions,
      ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startedAt - b.startedAt))
    : [...data.sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startedAt - b.startedAt));
  for (const s of all) {
    const e = stepBonus(state, s);
    if (e) events.push(e);
  }
  return { state, events };
}

/** Dòng thời gian sticker bất ngờ của các buổi CÒN trong `sessions` (theo thứ tự). */
export function bonusTimeline(data: Readonly<AppData>): BonusEvent[] {
  const kept = new Set(data.sessions.map((s) => s.id));
  return bonusState(data).events.filter((e) => kept.has(e.sessionId));
}

/** Sticker bất ngờ của một buổi (null = buổi này không có). */
export function bonusForSession(data: Readonly<AppData>, sessionId: string): BonusEvent | null {
  return bonusTimeline(data).find((e) => e.sessionId === sessionId) ?? null;
}

/** Sổ sticker — mục "🎁 Bất ngờ": mỗi sticker đã có + số lần nhận (theo thứ tự nhận lần đầu). */
export function bonusCollection(data: Readonly<AppData>): Array<{ sticker: BonusDef; count: number }> {
  const { owned } = bonusState(data).state;
  return [WELCOME_STICKER, ...BONUS_POOL].filter((d) => (owned[d.key] ?? 0) > 0).map((d) => ({ sticker: d, count: owned[d.key] }));
}

/** Buổi vừa xong (hoàn thành gần nhất). */
export function lastFinishedSession(data: Readonly<AppData>): Session | null {
  let best: Session | null = null;
  for (const s of data.sessions) {
    if (!s.completed) continue;
    if (!best || (s.endedAt ?? s.startedAt) >= (best.endedAt ?? best.startedAt)) best = s;
  }
  return best;
}

// ------------------------------------------------------------------ Tóm tắt buổi

/** Ghi nhận của bố mẹ KHÔNG phải nốt đàn (kỹ thuật, sắc thái, sáng tạo, nhịp vỗ tay, con làm thầy…). */
const NOT_A_NOTE = /^(tech|dyn|improv|rhythm|posture)[:-]|^(teach-back|medal)$/;

export interface SessionRecap {
  /** Số nốt con đàn đúng (bố mẹ chấm + micro nghe + bài hát) */
  notes: number;
  /** Số câu đố trả lời đúng */
  quizzes: number;
  /** Tỉ lệ đúng NGAY LẦN ĐẦU (0–1); null = không có dữ liệu chấm */
  firstTry: number | null;
  /** 1–3 sao: KHÔNG BAO GIỜ dưới 1; không có dữ liệu → 3 */
  stars: 1 | 2 | 3;
}

export function sessionRecap(s: Readonly<Session>): SessionRecap {
  let notes = 0;
  let items = 0;
  let good = 0;
  // Bố mẹ chấm: một nốt "đúng ngay lần đầu" khi không có "Thử lại" nào trước nó (kể từ lần đúng trước của nốt đó)
  const pending = new Set<string>();
  for (const a of s.parentAssessments) {
    if (NOT_A_NOTE.test(a.note)) continue;
    if (a.result === 'retry') {
      pending.add(a.note);
      continue;
    }
    notes++;
    items++;
    if (!pending.has(a.note)) good++;
    pending.delete(a.note);
  }
  items += pending.size; // nốt bỏ qua sau nhiều lần thử: tính là chưa đúng ngay
  for (const m of s.micAssessments) {
    notes++;
    items++;
    if (m.firstTry || m.wrongCount === 0) good++;
  }
  let quizzes = 0;
  for (const a of s.appAssessments) {
    items++;
    if (a.correct) {
      quizzes++;
      good++;
    }
  }
  for (const r of s.songRuns) {
    if (r.total <= 0) continue;
    notes += Math.max(0, Math.min(r.hits, r.total));
    items++;
    good += Math.max(0, Math.min(1, r.hits / r.total));
  }
  const firstTry = items ? good / items : null;
  const stars: 1 | 2 | 3 = firstTry === null || firstTry >= 0.8 ? 3 : firstTry >= 0.5 ? 2 : 1;
  return { notes, quizzes, firstTry, stars };
}

/** Một dòng tóm tắt cho bé ("Hôm nay con đàn 23 nốt!"); null = không có gì để kể. */
export function recapLine(r: SessionRecap): string | null {
  if (r.notes > 0 && r.quizzes > 0) return `Hôm nay con đàn ${r.notes} nốt và đoán đúng ${r.quizzes} câu đố!`;
  if (r.notes > 0) return `Hôm nay con đàn ${r.notes} nốt!`;
  if (r.quizzes > 0) return `Hôm nay con đoán đúng ${r.quizzes} câu đố!`;
  return null;
}
