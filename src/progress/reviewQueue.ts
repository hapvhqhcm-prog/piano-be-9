/**
 * (+ 2026-10-12, OWNER duyệt "Bé tự học, bố mẹ đỡ vất") 🕑 HÀNG CHỜ BỐ MẸ XEM — logic THUẦN (có test: tests/reviewQueue.test.ts).
 *
 * Khi bé TỰ HỌC (settings.studyMode), việc cần bố mẹ (phiếu 3 ý sau bài hát, "Đúng rồi" từng nốt khi micro tắt, micro
 * nghe chưa rõ → "Bố mẹ chấm giúp", thẻ xem tay Cấp 4, huy chương, thử thách "ngoài đời"…) KHÔNG chặn bé: app ghi một
 * mục chờ (AppData.reviews) gồm việc gì, lúc nào, nhận xét tạm của micro (nếu có) và (riêng) bản ghi âm lượt đó.
 *
 * QUY TẮC TIÊU CHÍ:
 * - Mục chờ KHÔNG tính gì cho tiêu chí tuần cho tới khi bố mẹ chấm "✅ Đạt".
 * - "✅ Đạt" = ghi đúng như bố mẹ đã chấm lúc bé đàn: lượt bài hát (source 'parent', phiếu 3 ý đều đạt) / PARENT_ASSESSMENT
 *   'correct' được chèn vào CHÍNH buổi đó (cùng session.date, cùng ts) → quy tắc "2 ngày khác nhau" (runDays theo
 *   session.date) và "lần chấm gần nhất" (thẻ Cấp 4, theo ts) tính đúng như khi bố mẹ ngồi cạnh. Buổi không còn (bị xoá)
 *   → tạo buổi tối thiểu cùng ngày & cùng mã bài.
 * - "🔁 Chưa đạt" = bỏ mục, không ghi gì (như lượt đó chưa từng được chấm). Kết quả micro chấm được thì vẫn ghi NGAY như
 *   trước (tính cho hôm nay) — hàng chờ chỉ chứa phần micro không chấm được.
 * - Thẻ chỉ NHÌN mới chấm được (xem tay: `relax:*`) → mục `visual`: không có "Đạt" — chỉ là lời nhắc "Lần sau ngồi cùng
 *   xem tay nhé"; tự xoá khi bố mẹ chấm đúng thẻ đó trong một buổi CÓ bố mẹ, hoặc bố mẹ bấm "Đã nhớ".
 * - Hết hạn sau REVIEW_EXPIRE_DAYS (14) ngày (chưa xem = không tính).
 * - Gộp lịch sử (compaction.ts) KHÔNG gộp buổi còn mục chờ (pinnedSessionIds) → duyệt muộn vẫn ghi đúng buổi.
 */
import { confirmSelfChallenge } from '../lessons/challenges';
import { bumpDataRev } from './history';
import {
  REVIEW_MAX_ITEMS,
  REVIEW_MAX_NOTES,
  localDateStr,
  type AppData,
  type ReviewItem,
  type Session,
  type Settings,
  type SongRun,
  type StudyMode,
} from './schema';

/** Mục chờ quá ngần này ngày thì tự bỏ (chưa xem = không tính). */
export const REVIEW_EXPIRE_DAYS = 14;
const DAY_MS = 86_400_000;

/** Cách học hôm nay: lựa chọn của HÔM NAY, không có thì mặc định của bố mẹ, không có nữa thì "Có bố mẹ". */
export function studyModeToday(settings: Readonly<Settings>, today: string): StudyMode {
  if (settings.studyMode && settings.studyMode.date === today) return settings.studyMode.mode;
  return settings.studyDefault ?? 'parent';
}

/** Thẻ chỉ NHÌN mới chấm được (bố mẹ xem tay — Cấp 4), micro / bản ghi âm không giúp được. */
export const isVisualNote = (note: string): boolean => note.startsWith('relax:');

/** Đầu vào khi hoãn một việc (id / ngày / buổi do hàm điền). */
export type ReviewInput = Omit<ReviewItem, 'id' | 'date' | 'ts'> & { ts?: number; date?: string };

const newId = (now: number, n: number) => `rv-${now.toString(36)}-${n.toString(36)}-${Math.floor(Math.random() * 1e5).toString(36)}`;

/**
 * Thêm (hoặc GỘP) một mục chờ. Gộp khi cùng `group` và cùng buổi (mục `visual`: cùng group ở bất kỳ buổi — chỉ là lời
 * nhắc, giữ lần gần nhất). Trả về mã mục. SỬA TẠI CHỖ `data`.
 */
export function addReview(data: AppData, input: ReviewInput, now: number): string {
  const list = (data.reviews ??= []);
  const ts = input.ts ?? now;
  const s = input.sessionId ? data.sessions.find((x) => x.id === input.sessionId) : undefined;
  const date = input.date ?? s?.date ?? localDateStr(new Date(ts));
  const lessonId = input.lessonId ?? s?.lessonId;
  const same = list.find((r) => r.group === input.group && r.kind === input.kind && (input.visual ? r.visual : r.sessionId === input.sessionId && !r.visual));
  if (same && input.kind === 'check' && input.notes?.length) {
    const notes = (same.notes ??= []);
    for (const n of input.notes) {
      if (input.visual) {
        const i = notes.findIndex((x) => x.note === n.note);
        if (i >= 0) notes.splice(i, 1);
      }
      notes.push({ ...n });
    }
    if (notes.length > REVIEW_MAX_NOTES) notes.splice(0, notes.length - REVIEW_MAX_NOTES);
    if (input.visual) {
      same.ts = ts;
      same.date = date;
      if (input.sessionId) same.sessionId = input.sessionId;
      if (lessonId) same.lessonId = lessonId;
    }
    if (input.mic) same.mic = input.mic;
    bumpDataRev(data);
    return same.id;
  }
  if (same && input.kind === 'challenge') return same.id;
  const item: ReviewItem = {
    id: newId(now, list.length),
    kind: input.kind,
    group: input.group,
    label: input.label.slice(0, 120),
    date,
    ts,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(lessonId ? { lessonId } : {}),
    ...(input.run ? { run: { ...input.run, ...(input.run.phrase ? { phrase: [...input.run.phrase] as [number, number] } : {}) } } : {}),
    ...(input.notes ? { notes: input.notes.slice(-REVIEW_MAX_NOTES).map((n) => ({ ...n })) } : {}),
    ...(input.challenge ? { challenge: input.challenge } : {}),
    ...(input.visual ? { visual: true } : {}),
    ...(input.mic ? { mic: input.mic.slice(0, 120) } : {}),
    ...(input.audio ? { audio: true } : {}),
  };
  list.push(item);
  // Quá giới hạn → bỏ mục CŨ nhất (lời nhắc trước)
  while (list.length > REVIEW_MAX_ITEMS) {
    const i = list.findIndex((r) => r.visual);
    list.splice(i >= 0 ? i : 0, 1);
  }
  bumpDataRev(data);
  return item.id;
}

/** Các mục bố mẹ CHẤM được (không phải lời nhắc xem tay). */
export const gradable = (data: Readonly<AppData>): ReviewItem[] => (data.reviews ?? []).filter((r) => !r.visual);
/** Các lời nhắc "Lần sau ngồi cùng xem tay nhé". */
export const reminders = (data: Readonly<AppData>): ReviewItem[] => (data.reviews ?? []).filter((r) => r.visual);
/** Số mục chờ bố mẹ chấm (viên "🕑 Chờ bố mẹ xem (N)"). */
export const pendingCount = (data: Readonly<AppData>): number => gradable(data).length;

/** Buổi còn mục chờ — gộp lịch sử không được gộp các buổi này. */
export function pinnedSessionIds(data: Readonly<AppData>): Set<string> {
  return new Set((data.reviews ?? []).flatMap((r) => (r.sessionId ? [r.sessionId] : [])));
}

function removeAt(data: AppData, id: string): ReviewItem | null {
  const list = data.reviews ?? [];
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const [item] = list.splice(i, 1);
  if (!list.length) delete data.reviews;
  bumpDataRev(data);
  return item;
}

/** Bỏ mục quá hạn. Trả về mã các mục đã bỏ (để xoá bản ghi âm). */
export function expireReviews(data: AppData, now: number, days = REVIEW_EXPIRE_DAYS): string[] {
  const cut = now - days * DAY_MS;
  const old = (data.reviews ?? []).filter((r) => r.ts < cut).map((r) => r.id);
  for (const id of old) removeAt(data, id);
  return old;
}

/** Chèn theo thứ tự thời gian (các hàm "lượt gần nhất" đọc phần tử cuối). */
function insertByTs<T extends { ts: number }>(arr: T[], x: T): void {
  let i = arr.length;
  while (i > 0 && arr[i - 1].ts > x.ts) i--;
  arr.splice(i, 0, x);
}

/** Buổi của mục (hoặc buổi tối thiểu cùng ngày & cùng mã bài nếu buổi đã bị xoá). */
function sessionFor(data: AppData, item: ReviewItem): Session {
  const s = item.sessionId ? data.sessions.find((x) => x.id === item.sessionId) : undefined;
  if (s) return s;
  const id = `rv-${item.id}`;
  const made = data.sessions.find((x) => x.id === id);
  if (made) return made;
  const stub: Session = {
    id,
    date: item.date,
    lessonId: item.lessonId ?? 'review',
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: [],
    selfRating: null,
    startedAt: item.ts,
    endedAt: item.ts,
    minutes: 0,
    completed: false,
    checklist: {},
  };
  // Giữ thứ tự thời gian của sessions (một số hàm đọc buổi cuối = gần nhất)
  let i = data.sessions.length;
  while (i > 0 && data.sessions[i - 1].startedAt > stub.startedAt) i--;
  data.sessions.splice(i, 0, stub);
  return stub;
}

/**
 * ✅ Đạt: ghi kết quả như bố mẹ chấm VÀO ĐÚNG BUỔI / NGÀY bé làm, rồi bỏ mục. Lời nhắc xem tay (visual) không "Đạt"
 * được (trả về null, không đổi gì). Trả về mục đã xử lý.
 */
export function approveReview(data: AppData, id: string): ReviewItem | null {
  const item = (data.reviews ?? []).find((r) => r.id === id);
  if (!item || item.visual) return null;
  switch (item.kind) {
    case 'song': {
      if (!item.run) break;
      const run: SongRun = {
        ...item.run,
        hits: item.run.total,
        source: 'parent',
        passed: true,
        checklist: { notes: true, beat: true, fingers: true },
        ts: item.ts,
      };
      insertByTs(sessionFor(data, item).songRuns, run);
      break;
    }
    case 'check': {
      const notes = (item.notes ?? []).filter((n) => !isVisualNote(n.note));
      if (!notes.length) break;
      const s = sessionFor(data, item);
      for (const n of notes) insertByTs(s.parentAssessments, { note: n.note, result: 'correct', ts: n.ts });
      break;
    }
    case 'challenge':
      if (item.challenge) confirmSelfChallenge(data, item.date, item.challenge, item.ts);
      break;
  }
  return removeAt(data, id);
}

/** 🔁 Chưa đạt / "Đã nhớ" (lời nhắc): bỏ mục, không ghi gì. */
export function dismissReview(data: AppData, id: string): ReviewItem | null {
  return removeAt(data, id);
}

/** ✅ Đạt hết: mọi mục chấm được (không đụng lời nhắc xem tay). Trả về các mục đã xử lý. */
export function approveAll(data: AppData): ReviewItem[] {
  const out: ReviewItem[] = [];
  // Cũ trước → chèn theo đúng thứ tự thời gian
  for (const r of [...gradable(data)].sort((a, b) => a.ts - b.ts)) {
    const done = approveReview(data, r.id);
    if (done) out.push(done);
  }
  return out;
}

/**
 * Bố mẹ vừa chấm thẻ `note` trong buổi CÓ bố mẹ → lời nhắc xem tay của thẻ đó đã xong (bỏ thẻ khỏi lời nhắc; hết thẻ thì
 * bỏ mục). Trả về mã các mục đã bỏ.
 */
export function resolveReminders(data: AppData, note: string): string[] {
  const gone: string[] = [];
  for (const r of reminders(data)) {
    if (!r.notes?.some((n) => n.note === note)) continue;
    r.notes = r.notes.filter((n) => n.note !== note);
    bumpDataRev(data);
    if (!r.notes.length) {
      removeAt(data, r.id);
      gone.push(r.id);
    }
  }
  return gone;
}

/** Đánh dấu mục đã có / không còn bản ghi âm. */
export function setReviewAudio(data: AppData, id: string, has: boolean): boolean {
  const r = (data.reviews ?? []).find((x) => x.id === id);
  if (!r || !!r.audio === has) return false;
  if (has) r.audio = true;
  else delete r.audio;
  bumpDataRev(data);
  return true;
}
