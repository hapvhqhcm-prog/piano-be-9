import { WEEKS, daysThisWeek, weekComplete, weekPassed, weekPlan } from '../../lessons/lessonEngine';
import { findTune } from '../../music/exercises';
import { viName } from '../../piano/pitchTable';
import { localDateStr, type AppData } from '../../progress/schema';
import type { CriterionWho } from '../../lessons/types';

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

export interface TonightPlan {
  struggles: Struggle[];
  action: string;
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

function songLabel(songId: string): string {
  if (songId.startsWith('sight')) return 'Đọc nhạc ngẫu nhiên';
  return `Bài “${findTune(songId)?.titleVi ?? songId}”`;
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
      add(key, 'song', songLabel(r.songId), 1);
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

export function tonightPlan(data: Readonly<AppData>, now: Date): TonightPlan {
  const week = data.progress.currentWeek;
  const plan = weekPlan(week);
  const done = new Set(data.progress.lessonsCompleted);
  const struggles = topStruggles(data, now);
  const days = daysThisWeek(data, now);
  return {
    struggles,
    action: actionFor(struggles[0], days),
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
