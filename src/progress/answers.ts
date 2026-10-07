/**
 * Xếp loại câu trả lời trò chơi app chấm theo kỹ năng (đọc nốt / tai nghe / nhịp) — tách khỏi report.ts để
 * compaction.ts (luôn nạp lúc mở app, qua ProgressStore) không kéo theo cả báo cáo + tonight + parentSongs + solfege.
 * report.ts xuất lại các hàm này (giữ nguyên API cũ).
 */
import { MAX_WEEK, findLesson, weekPlan } from '../lessons/lessonEngine';
import type { QuizVariant } from '../practice/quiz';
import type { SkillKind } from './report';
import type { Session } from './schema';

/* ---------------- Trò chơi app chấm: xếp loại kỹ năng ---------------- */

const isPitch = (s: string) => /^[A-G](#|b)?-?\d$/.test(s);
const EAR_CODES = new Set(['up', 'down', 'step', 'skip', 'major', 'minor']);
const INTERVAL_RE = /^(same|(step|skip|4th|5th)-(up|down))$/;
const EAR_PITCH: ReadonlySet<QuizVariant> = new Set(['identify']);
const READ_PITCH: ReadonlySet<QuizVariant> = new Set(['read', 'landmark']);

/** Các kiểu trò có thể xuất hiện trong buổi `s` (trò trong bài + khởi động tuần này / tuần trước). */
export function sessionQuizVariants(s: Pick<Session, 'lessonId'>): Set<QuizVariant> {
  const out = new Set<QuizVariant>();
  const m = /^w(\d+)-/.exec(s.lessonId);
  const week = m ? Number(m[1]) : 0;
  const lesson = findLesson(s.lessonId);
  for (const a of lesson?.activities ?? []) if (a.kind === 'quiz') out.add(a.quiz.variant);
  if (/^w\d+-daily$/.test(s.lessonId)) {
    out.add('identify');
    out.add('majorminor');
  }
  if (week >= 1 && week <= MAX_WEEK) {
    const w = weekPlan(week).warmup;
    if (w) out.add(w.variant);
    if (week > 1) {
      const p = weekPlan(week - 1).warmup;
      if (p) out.add(p.variant);
    }
  }
  return out;
}

/** Kỹ năng của một câu trả lời app chấm (null = không xếp được). */
export function classifyAppAssessment(expected: string, variants: ReadonlySet<QuizVariant>): 'reading' | 'ear' | null {
  if (EAR_CODES.has(expected)) return 'ear';
  if (INTERVAL_RE.test(expected)) return 'reading';
  if (!isPitch(expected)) return null;
  const ear = [...variants].some((v) => EAR_PITCH.has(v));
  const read = [...variants].some((v) => READ_PITCH.has(v));
  if (ear && !read) return 'ear';
  if (read && !ear) return 'reading';
  return null;
}

/** Các câu trả lời (theo kỹ năng) của MỘT buổi — dùng chung cho báo cáo và gộp lịch sử (compaction.ts). */
export function sessionAnswers(s: Session): Array<{ skill: SkillKind; ok: boolean }> {
  const out: Array<{ skill: SkillKind; ok: boolean }> = [];
  if (s.appAssessments.length) {
    const v = sessionQuizVariants(s);
    for (const a of s.appAssessments) {
      const k = classifyAppAssessment(a.expected, v);
      if (k) out.push({ skill: k, ok: a.correct });
    }
  }
  for (const a of s.parentAssessments) {
    if (a.note.startsWith('rhythm:')) out.push({ skill: 'rhythm', ok: a.result === 'correct' });
  }
  return out;
}
