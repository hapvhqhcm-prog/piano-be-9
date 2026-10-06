import { customTuneTitle } from '../../practice/parentSongs';
import { WEEKS, criterionProgress, daysThisWeek, weekComplete, weekPassed, weekPlan } from '../../lessons/lessonEngine';
import { findTune } from '../../music/exercises';
import { viName, type Pitch } from '../../piano/pitchTable';
import { firstDateOfWeek, lastSessionDate } from '../../progress/history';
import { localDateStr, type AppData, type Settings } from '../../progress/schema';
import { rhNote } from '../../lessons/targets';
import type { CriterionWho, Segment, Target } from '../../lessons/types';

/**
 * "VIỆC CẦN LÀM TỐI NAY" (màn Phụ huynh) — hàm thuần, có test (tests/tonight.test.ts).
 * Gom 2 tuần gần nhất: nốt hay phải "Thử lại" / micro nghe nhầm nhiều, bài hát chơi chưa đạt
 * → 3 chỗ khó nhất + MỘT việc cụ thể cho tối nay + tiêu chí tuần bằng lời thường.
 */

export interface Struggle {
  kind: 'note' | 'song' | 'game';
  key: string;
  /** Tên dễ hiểu cho bố mẹ, vd "Nốt Rê (D4)", "Bài “Bài ca niềm vui”" */
  label: string;
  /** Số lần vấp (Thử lại + nốt micro nghe nhầm + lượt chơi chưa đạt) */
  misses: number;
}

/** "▶ Làm ngay (5')": luyện riêng chỗ khó — các nốt (màn Từng nốt) hoặc một bài (màn bài hát, chế độ Từng nốt). */
export type TonightPractice = { kind: 'notes'; noteIds: string[] } | { kind: 'song'; songId: string };

export interface TonightPlan {
  struggles: Struggle[];
  action: string;
  /** Nghỉ ≥ WELCOME_BACK_DAYS ngày → lời "Mừng con quay lại", chỗ khó cũ hơn 7 ngày bị bỏ */
  welcomeBack: boolean;
  /** Số ngày từ buổi học gần nhất tới hôm nay (null = chưa học buổi nào) */
  daysAway: number | null;
  /** Việc "Làm ngay" (null = không có chỗ khó luyện riêng được) */
  practice: TonightPractice | null;
  goal: {
    week: number;
    text: string;
    who: string;
    passed: boolean;
    lessonsLeft: number;
    /** v5.1 — số NGÀY có học trong tuần lịch (thứ 2 → CN); mục tiêu 4–5 ngày */
    daysThisWeek: number;
  };
}

export const WHO_TEXT: Record<CriterionWho, string> = {
  PARENT: 'bố mẹ xác nhận',
  'PARENT/MIC': 'bố mẹ hoặc micro xác nhận',
  SELF: 'bé tự đánh giá',
  APP: 'app tự chấm',
};

const DAY = 86_400_000;
const isPitch = (s: string) => /^[A-G](#|b)?\d$/.test(s);
const SKIP_NOTES = new Set(['teach-back', 'medal']);

let titles: Map<string, string> | null = null;
/** noteId → tên trên màn (lấy từ giáo trình), vd "twins-4" → "Sinh đôi". */
function targetTitle(id: string): string | undefined {
  if (!titles) {
    titles = new Map();
    for (const w of WEEKS)
      for (const l of w.lessons)
        for (const a of l.activities)
          if (a.kind === 'notes') for (const t of a.segment.targets) titles.has(t.noteId) || titles.set(t.noteId, t.title.split(' / ')[0]);
  }
  return titles.get(id);
}

function pitchText(p: string): string {
  return `${viName(p)} (${p.replace('#', '♯').replace(/^([A-G])b/, '$1♭')})`;
}

/** Nhãn dễ hiểu cho một mã nốt / việc. */
export function noteLabelForParent(id: string): { kind: Struggle['kind']; label: string } {
  if (id.includes('+') && id.split('+').every(isPitch)) {
    return { kind: 'note', label: `Hợp âm ${id.split('+').map((p) => viName(p)).join('–')}` };
  }
  if (isPitch(id)) return { kind: 'note', label: `Nốt ${pitchText(id)}` };
  if (id.startsWith('dyn:loud-soft')) return { kind: 'game', label: 'Trò “To hay nhỏ?”' };
  if (id.startsWith('dyn:stac-leg')) return { kind: 'game', label: 'Trò “Ngắt hay liền?”' };
  if (id.startsWith('rhythm:')) return { kind: 'game', label: 'Vỗ nhịp' };
  const t = targetTitle(id);
  return { kind: 'note', label: t ?? id };
}

function songLabel(songId: string, data: Readonly<AppData>): string {
  if (songId.startsWith('sight')) return 'Đọc nhạc ngẫu nhiên';
  return `Bài “${findTune(songId)?.titleVi ?? customTuneTitle(songId, data) ?? songId}”`;
}

/** Tối đa 3 chỗ khó nhất trong `days` ngày gần nhất (nhiều lần vấp nhất trước). */
export function topStruggles(data: Readonly<AppData>, now: Date, days = 14, n = 3): Struggle[] {
  const since = localDateStr(new Date(now.getTime() - days * DAY));
  const m = new Map<string, Struggle>();
  const add = (key: string, kind: Struggle['kind'], label: string, k: number) => {
    if (k <= 0) return;
    const e = m.get(key) ?? { kind, key, label, misses: 0 };
    e.misses += k;
    m.set(key, e);
  };
  for (const s of data.sessions) {
    if (s.date < since) continue;
    for (const a of s.parentAssessments) {
      if (a.result !== 'retry' || SKIP_NOTES.has(a.note)) continue;
      const { kind, label } = noteLabelForParent(a.note);
      const key = kind === 'game' ? label : a.note;
      add(key, kind, label, 1);
    }
    for (const a of s.micAssessments) {
      // Mỗi lần micro nghe nhầm phím = 1 lần vấp (tối đa 3 / nốt để một lượt lóng ngóng không lấn át)
      const k = Math.min(3, a.wrongCount) + (a.parentOverride === 'retry' ? 1 : 0);
      const { kind, label } = noteLabelForParent(a.expected);
      add(a.expected, kind, label, k);
    }
    for (const r of s.songRuns) {
      if (r.passed) continue;
      const key = r.songId.startsWith('sight') ? 'song:sight' : `song:${r.songId}`;
      add(key, 'song', songLabel(r.songId, data), 1);
    }
  }
  return [...m.values()].sort((a, b) => b.misses - a.misses).slice(0, n);
}

/** Một câu hành động cụ thể cho tối nay. */
export function actionFor(top: Struggle | undefined, weekDays: number): string {
  if (!top) {
    return weekDays < 4
      ? 'Tối nay chỉ cần 10–15 phút: ngồi cạnh bé và bấm “Học tiếp”.'
      : 'Bé đang làm tốt! Tối nay cho bé chơi lại một bài đã thuộc và khen thật cụ thể (vd “ngón con cong đẹp quá”).';
  }
  if (top.kind === 'song') {
    return top.key === 'song:sight'
      ? 'Tối nay: đọc nhạc thật chậm — bé nói to tên từng nốt trước khi đàn, bố mẹ không giục.'
      : `Tối nay: mở ${top.label} ở chế độ Từng nốt, tập chậm chỗ hay vấp 3 lần rồi mới chơi theo nhịp.`;
  }
  if (top.kind === 'game') return `Tối nay: chơi lại ${top.label} — bố mẹ làm mẫu một lần trước, rồi đổi vai cho bé làm thầy.`;
  const name = top.label.replace(/^Nốt /, '');
  return `Tối nay 5 phút: cho bé tìm ${name} 5 lần — mỗi lần bé nói to tên nốt và số ngón rồi mới bấm.`;
}

/** Nghỉ từ bấy nhiêu ngày trở lên → "Mừng con quay lại" (ôn nhẹ) */
export const WELCOME_BACK_DAYS = 5;
/** Khi quay lại sau kỳ nghỉ: chỉ giữ chỗ khó trong bấy nhiêu ngày gần nhất */
export const WELCOME_BACK_WINDOW = 7;

/** "YYYY-MM-DD" → số ngày từ ngày đó tới `now` (theo lịch, giờ địa phương). */
export function daysSince(date: string, now: Date): number {
  const [y, m, d] = date.split('-').map(Number);
  const a = new Date(y, m - 1, d).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / DAY);
}

/** Số ngày từ buổi học (có nội dung) gần nhất — kể cả buổi đã gộp vào lịch sử; null = chưa học buổi nào. */
export function daysSinceLastPractice(data: Readonly<AppData>, now: Date): number | null {
  const last = lastSessionDate(data);
  return last ? Math.max(0, daysSince(last, now)) : null;
}

export const WELCOME_BACK_ACTION =
  'Mừng con quay lại! Buổi đầu ôn nhẹ: chơi lại một bài con đã thuộc, khen con thật cụ thể, rồi bấm “Học tiếp” — không cần học bù.';

/** Chỗ khó đầu tiên luyện riêng được: nốt/hợp âm có phím (tối đa 3) hoặc một bài hát (không phải đọc nhạc ngẫu nhiên). */
export function practiceFor(struggles: readonly Struggle[]): TonightPractice | null {
  const top = struggles[0];
  if (!top) return null;
  if (top.kind === 'song') return top.key === 'song:sight' ? null : { kind: 'song', songId: top.key.slice(5) };
  if (top.kind !== 'note') return null;
  const noteIds = struggles.filter((s) => s.kind === 'note' && findTarget(s.key)).map((s) => s.key).slice(0, 3);
  return noteIds.length ? { kind: 'notes', noteIds } : null;
}

let targetIndex: Map<string, Target> | null = null;
/** Target của giáo trình theo mã (noteId, hoặc các phím nối "+" như micro ghi). Nốt rời không có trong giáo trình → tự tạo. */
export function findTarget(id: string): Target | undefined {
  if (!targetIndex) {
    targetIndex = new Map();
    for (const w of WEEKS)
      for (const l of w.lessons)
        for (const a of l.activities)
          if (a.kind === 'notes')
            for (const t of a.segment.targets) {
              if (!t.keys.length) continue;
              if (!targetIndex.has(t.noteId)) targetIndex.set(t.noteId, t);
              const k = t.keys.join('+');
              if (!targetIndex.has(k)) targetIndex.set(k, t);
            }
  }
  const t = targetIndex.get(id);
  if (t) return t;
  if (isPitch(id)) return rhNote(id as Pitch);
  return undefined;
}

/**
 * Đoạn "Từng nốt" ~5 phút cho các nốt hay vấp: 1 nốt → 5 lần; 2 nốt → mỗi nốt 3 lần; 3 nốt → mỗi nốt 2 lần (xen kẽ).
 */
export function tonightSegment(noteIds: readonly string[]): Segment {
  const ts = noteIds.map(findTarget).filter((t): t is Target => !!t);
  const reps = ts.length === 1 ? 5 : ts.length === 2 ? 3 : 2;
  const targets: Target[] = [];
  for (let r = 0; r < reps; r++) targets.push(...ts);
  return {
    id: 'tonight',
    step: 'Tối nay',
    title: 'Ôn chỗ hay vấp',
    intro: 'Mỗi lần: con nói to tên nốt và số ngón, rồi mới bấm.',
    targets,
  };
}

export function tonightPlan(data: Readonly<AppData>, now: Date): TonightPlan {
  const week = data.progress.currentWeek;
  const plan = weekPlan(week);
  const done = new Set(data.progress.lessonsCompleted);
  const daysAway = daysSinceLastPractice(data, now);
  const welcomeBack = daysAway !== null && daysAway >= WELCOME_BACK_DAYS;
  const struggles = topStruggles(data, now, welcomeBack ? WELCOME_BACK_WINDOW : 14);
  const days = daysThisWeek(data, now);
  return {
    struggles,
    action: welcomeBack ? WELCOME_BACK_ACTION : actionFor(struggles[0], days),
    welcomeBack,
    daysAway,
    practice: practiceFor(struggles),
    goal: {
      week,
      text: plan.criterion.text,
      who: WHO_TEXT[plan.criterion.who],
      passed: weekPassed(week, data) || weekComplete(week, data),
      lessonsLeft: plan.lessons.filter((l) => !l.isWeekTest && !done.has(l.id)).length,
      daysThisWeek: days,
    },
  };
}

// ---------------- Sẵn sàng sang tuần mới? (màn Phụ huynh) ----------------

/** Settings thêm (cộng dồn, không cần migration): bố mẹ GIỮ bé ở lại một tuần. */
export interface HoldSettings {
  /** Số tuần đang giữ (app không tự sang tuần mới khi currentWeek === holdWeek); null/không có = không giữ */
  holdWeek?: number | null;
}

/** Bố mẹ đang giữ bé ở lại tuần `week`? (session.ts kiểm tra trước khi tự sang tuần mới) */
export function weekHeld(settings: Readonly<Settings>, week: number): boolean {
  return (settings as Settings & HoldSettings).holdWeek === week;
}

/** Ở một tuần từ bấy nhiêu ngày → cảnh báo "học lâu ở một tuần" */
export const STUCK_DAYS = 14;

export interface Readiness {
  level: 'ready' | 'more' | 'slow';
  /** "🟢 Sẵn sàng sang tuần mới" · "🟡 Cần thêm vài ngày" · "🔴 Nên chậm lại" */
  title: string;
  /** Lý do bằng lời thường (1–3 ý) */
  reasons: string[];
  /** Số ngày từ buổi đầu tiên của tuần hiện tại tới hôm nay (0 = chưa học / mới hôm nay) */
  daysOnWeek: number;
  /** ≥ STUCK_DAYS ngày ở cùng một tuần */
  stuck: boolean;
  held: boolean;
}

/**
 * Đèn tín hiệu cho bố mẹ: dựa trên tiêu chí tuần (criterionProgress / weekPassed), số ngày đã ở tuần này,
 * số buổi bé chọn "Khó" gần đây và tỉ lệ "Thử lại" 7 ngày.
 */
export function readiness(data: Readonly<AppData>, now: Date): Readiness {
  const week = data.progress.currentWeek;
  const plan = weekPlan(week);
  // Ngày đầu tiên có buổi của tuần — gồm cả buổi đã gộp lịch sử (history.weekFirst)
  const first = firstDateOfWeek(data, week) ?? '';
  const daysOnWeek = first ? Math.max(0, daysSince(first, now)) : 0;
  const stuck = daysOnWeek >= STUCK_DAYS;
  const passed = weekPassed(week, data);
  const done = new Set(data.progress.lessonsCompleted);
  const lessonsLeft = plan.lessons.filter((l) => !l.isWeekTest && !done.has(l.id)).length;
  const cp = criterionProgress(week, data);
  // "Khó" trong 3 lần bé tự đánh giá gần nhất
  const rated = data.sessions.filter((s) => s.selfRating).slice(-3);
  const hard = rated.filter((s) => s.selfRating === 'hard').length;
  // Tỉ lệ "Thử lại" (bố mẹ + micro nghe nhầm) 7 ngày gần nhất
  const since = localDateStr(new Date(now.getTime() - 7 * DAY));
  let tries = 0;
  let misses = 0;
  for (const s of data.sessions) {
    if (s.date < since) continue;
    for (const a of s.parentAssessments) {
      if (SKIP_NOTES.has(a.note)) continue;
      tries++;
      if (a.result === 'retry') misses++;
    }
    for (const a of s.micAssessments) {
      tries++;
      if (!a.firstTry || a.parentOverride === 'retry') misses++;
    }
  }
  const retryRate = tries ? misses / tries : 0;

  const reasons: string[] = [];
  let level: Readiness['level'];
  const slowSigns: string[] = [];
  if (hard >= 2) slowSigns.push(`bé chọn “Khó” ${hard}/${rated.length} buổi gần đây`);
  if (tries >= 8 && retryRate >= 0.5) slowSigns.push(`còn “Thử lại” ${Math.round(retryRate * 100)}% số lần trong 7 ngày`);
  if (stuck) slowSigns.push(`đã ở tuần ${week} được ${daysOnWeek} ngày`);
  if (slowSigns.length) {
    level = 'slow';
    reasons.push(`Vì ${slowSigns.join(', ')}.`);
    reasons.push('Tập chậm hơn, mỗi buổi ngắn hơn; có thể bấm “Ở lại tuần này thêm”.');
  } else if (passed) {
    level = 'ready';
    const heldNow = weekHeld(data.settings, week);
    reasons.push(
      heldNow
        ? 'Đã đạt mục tiêu tuần — đang “Ở lại tuần này thêm” nên app CHƯA sang tuần mới (tắt nút đó khi muốn đi tiếp).'
        : lessonsLeft > 0
          ? `Đã đạt mục tiêu tuần — học nốt ${lessonsLeft} bài là app tự sang tuần mới.`
          : 'Đã đạt mục tiêu tuần.',
    );
  } else {
    level = 'more';
    if (cp && cp.needDays > 0) reasons.push(`Mục tiêu tuần: đạt ${Math.min(cp.days, cp.needDays)}/${cp.needDays} ngày.`);
    else reasons.push('Chưa đạt mục tiêu tuần.');
    if (lessonsLeft > 0) reasons.push(`Còn ${lessonsLeft} bài chưa học.`);
  }
  const title = level === 'ready' ? '🟢 Sẵn sàng sang tuần mới' : level === 'more' ? '🟡 Cần thêm vài ngày' : '🔴 Nên chậm lại';
  return { level, title, reasons, daysOnWeek, stuck, held: weekHeld(data.settings, week) };
}
