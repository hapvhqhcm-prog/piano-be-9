/**
 * "Học tiếp": bài tiếp theo của tuần, bài giúp đạt tiêu chí (giả lập buổi "hoàn hảo"), luyện tập mỗi ngày.
 */
import { makeQuestion, type QuizSpec } from '../practice/quiz';
import { SONGS } from '../music/tune';
import type { AppAssessment, AppData, Session } from '../progress/schema';
import type { Activity, Lesson } from './types';
import { MAX_QUIZ_ROUNDS, MAX_WEEK, weekPlan } from './curriculum';
import { lastWholePlay, masteredSongs } from './songStats';
import { curriculumDone, songFresh } from './freshness';
import { weekComplete, weekPassed } from './weekCriteria';
import { buildSessionPlan } from './sessionPlan';

/** Bài "Học tiếp": bài đầu tiên chưa xong → bài kiểm tra tuần (nếu chưa qua) → bài cuối để ôn. */
export function nextLesson(data: Readonly<AppData>, rng: () => number = Math.random, now: number | Date = Date.now()): Lesson {
  const plan = weekPlan(data.progress.currentWeek);
  // Đã xong cả giáo trình (MAX_WEEK tuần) → luyện tập mỗi ngày, không có điểm dừng
  if (plan.week === MAX_WEEK && weekComplete(MAX_WEEK, data)) return dailyLesson(data, rng, now);
  const done = new Set(data.progress.lessonsCompleted);
  const regular = plan.lessons.filter((l) => !l.isWeekTest);
  const firstUndone = regular.find((l) => !done.has(l.id));
  if (firstUndone) return firstUndone;
  const test = plan.lessons.find((l) => l.isWeekTest);
  if (test && !weekPassed(plan.week, data)) return test;
  // Học hết bài nhưng CHƯA đạt tiêu chí (v5: phải đạt ở 2 ngày khác nhau) → mời lại đúng bài giúp đạt tiêu chí.
  // QA 2026-10-05: trước đây luôn mời bài CUỐI tuần → 15/30 tuần kẹt mãi nếu chỉ bấm "Học tiếp".
  if (!weekPassed(plan.week, data)) {
    const helper = criterionLesson(plan.week, data);
    if (helper) return helper;
  }
  // Cấp 4 (2026-10-08): tuần XONG mà chưa sang tuần mới (vd bé xong tuần 31 trước khi có Cấp 4; tuần chỉ có buổi hòa nhạc)
  // → luyện tập mỗi ngày; xong buổi đó session.ts thấy tuần đã xong → sang tuần kế (lên Cấp 4).
  return regular[regular.length - 1] ?? dailyLesson(data, rng, now);
}

/* ---------- Bài nào giúp đạt tiêu chí tuần? (giả lập buổi học "hoàn hảo") ---------- */

/**
 * Một buổi giả lập: bé làm ĐÚNG hết mọi bước của buổi vào ngày `date`. v5.1: theo ĐÚNG kế hoạch buổi (buildSessionPlan) —
 * khởi động có thể bị bỏ (bài ≥ 3 bài hát, giới hạn số màn) → giả lập không được "cộng" khởi động mà buổi thật không có.
 */
function idealSession(lesson: Lesson, data: Readonly<AppData>, date: string, seq: number): Session {
  const parent: Session['parentAssessments'] = [];
  const app: AppAssessment[] = [];
  const runs: Session['songRuns'] = [];
  let x = seq * 7919 + 17;
  const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const answerQuiz = (q: QuizSpec) => {
    let prev;
    // v5.1: đúng số lượt buổi thật cho chơi (≤ MAX_QUIZ_ROUNDS) — không "cộng" lượt mà app không hỏi
    for (let k = 0; k < Math.min(q.rounds, MAX_QUIZ_ROUNDS); k++) {
      prev = makeQuestion(q, rng, prev);
      app.push({ expected: prev.expected, actual: prev.expected, correct: true, ts: 0 });
    }
  };
  const steps = buildSessionPlan(lesson, data);
  for (const st of steps) if (st.kind === 'quiz') answerQuiz(st.quiz);
  for (const a of lesson.activities) {
    switch (a.kind) {
      case 'notes':
        for (const t of a.segment.targets) parent.push({ note: t.noteId, result: 'correct', ts: 0 });
        break;
      case 'quiz':
        answerQuiz(a.quiz);
        break;
      case 'song':
        runs.push({ songId: a.songId, mode: a.mode, level: a.mode === 'tempo' ? (a.level ?? 2) : undefined, bpm: 72, hints: a.hints, phrase: a.phrase ?? null, total: 10, hits: 10, source: 'mic', passed: true, ts: 0, ...(a.hand ? { hand: a.hand } : {}) });
        break;
      case 'sight':
        for (let k = 0; k < a.count; k++)
          runs.push({ songId: `sight:${a.position}:${a.hand}`, mode: 'wait', bpm: 60, hints: a.hints, phrase: null, total: 10, hits: 10, source: 'mic', passed: true, ts: 0 });
        break;
      case 'stage':
        parent.push({ note: 'medal', result: 'correct', ts: 0 });
        break;
      default:
        break;
    }
  }
  return {
    id: `ideal-${seq}`, date, lessonId: lesson.id, parentAssessments: parent, appAssessments: app, micAssessments: [],
    songRuns: runs, selfRating: null, startedAt: 0, endedAt: 0, minutes: 10, completed: true, checklist: {},
  };
}

/**
 * Bài thường của tuần mà nếu bé làm tốt ở 2 ngày nữa thì tuần ĐẠT tiêu chí; ưu tiên bài lâu chưa học.
 * Tiêu chí cần hai bài (vd tuần gam: tay phải + tay trái) → thử theo cặp, trả bài lâu chưa học hơn trong cặp.
 */
export function criterionLesson(week: number, data: Readonly<AppData>): Lesson | null {
  const regular = weekPlan(week).lessons.filter((l) => !l.isWeekTest);
  const lastPlayed = (id: string) => Math.max(0, ...data.sessions.filter((s) => s.lessonId === id).map((s) => s.startedAt));
  const order = [...regular].sort((a, b) => lastPlayed(a.id) - lastPlayed(b.id));
  const passesWith = (ls: Lesson[]) => {
    const extra: Session[] = [];
    ['9998-01-01', '9998-01-02'].forEach((d, di) => ls.forEach((l, li) => extra.push(idealSession(l, data, d, di * 10 + li))));
    return weekPassed(week, { ...data, sessions: [...data.sessions, ...extra] } as AppData);
  };
  for (const l of order) if (passesWith([l])) return l;
  for (const a of order) for (const b of order) if (a !== b && passesWith([a, b])) return a;
  return null;
}

/**
 * LUYỆN TẬP MỖI NGÀY (sau tuần cuối MAX_WEEK, hoặc bất cứ lúc nào từ Cấp 2). Ngưỡng tuần theo giáo trình v5.1 (31 tuần):
 * ôn đọc nhạc + 1 bài CHƯA thuộc (từng nốt → theo nhịp) + 1 bài ĐÃ thuộc (giữ phong độ — ôn ngắt quãng).
 * v5: bài đã thuộc ưu tiên bài KHÔNG còn "tươi" (songFresh — lâu chưa chơi lại) = "ôn bài cũ".
 */
export function dailyLesson(data: Readonly<AppData>, rng: () => number = Math.random, now: number | Date = Date.now()): Lesson {
  const week = data.progress.currentWeek;
  const open = SONGS.filter((s) => (s.week ?? 1) <= week);
  const mastered = new Set(masteredSongs(data));
  const pick = <T,>(arr: T[]): T | undefined => arr[Math.floor(rng() * arr.length) % Math.max(1, arr.length)];
  // Ưu tiên bài GẦN trình độ hiện tại (8 tuần gần nhất) — tránh tuần 31 lại tập bài tay trái tuần 7
  const recent = open.filter((s) => (s.week ?? 1) >= week - 8);
  const notMastered = open.filter((s) => !mastered.has(s.id));
  const recentNotMastered = notMastered.filter((s) => recent.includes(s));
  const learning =
    (rng() < 0.75 ? pick(recentNotMastered) : undefined) ?? pick(notMastered) ?? pick(recent) ?? pick(open);
  const keepable = open.filter((s) => mastered.has(s.id) && s.id !== learning?.id);
  const stale = keepable.filter((s) => !songFresh(s.id, data, now));
  // Một lần rng như trước: có bài "phai" thì chọn trong đó
  let keep = pick(stale.length ? stale : keepable);
  // (+ 2026-10-06) Đã xong giáo trình (~40–50 bài đã thuộc): XOAY VÒNG — bài lâu chưa chơi cả bài nhất trước
  // (chọn ngẫu nhiên thì nhiều bài mãi không được ôn). Vẫn dùng đúng một lần rng ở trên để chuỗi rng không đổi.
  if (keepable.length && curriculumDone(data)) {
    keep = [...keepable].sort((a, b) => lastWholePlay(data, a.id) - lastWholePlay(data, b.id))[0];
  }
  const keepStale = !!keep && stale.includes(keep);
  const positions = week >= 34 ? (['C', 'G', 'C5', 'D', 'Am'] as const) : week >= 26 ? (['C', 'G', 'C5'] as const) : week >= 14 ? (['C', 'G'] as const) : (['C'] as const);
  const position = positions[Math.floor(rng() * positions.length) % positions.length];
  const activities: Activity[] = [
    {
      kind: 'sight',
      title: 'Đọc nhạc mỗi ngày',
      position,
      // Thế Đô cao chỉ có tay phải
      hand: week >= 11 && rng() < 0.3 && position !== 'C5' ? 'LH' : 'RH',
      count: 2,
      rhythm: week >= 17 ? 2 : 1,
      timeSignature: week >= 15 && rng() < 0.3 ? '3/4' : '4/4',
      hints: week >= 24 ? 'staff' : 'names',
    },
  ];
  if (learning) {
    activities.push({ kind: 'song', songId: learning.id, mode: 'wait', hints: week >= 24 ? 'names' : 'full', intro: 'Bài đang tập — từng nốt trước nhé.' });
    activities.push({ kind: 'song', songId: learning.id, mode: 'tempo', level: 2, hints: week >= 24 ? 'names' : 'full' });
  }
  // Xen kẽ cho đỡ nhàm: thường là ôn bài đã thuộc; thỉnh thoảng trò tai nghe hoặc to/nhỏ – ngắt/liền
  const extra = rng();
  if (extra < 0.2 && week >= 6) {
    activities.push({
      kind: 'dynamics',
      title: week >= 12 && rng() < 0.5 ? 'Ngắt hay liền?' : 'To hay nhỏ?',
      intro: 'Thầy đàn mẫu — con đàn lại thật rõ kiểu nhé!',
      ...(week >= 12 && rng() < 0.5
        ? {
            mode: 'stac-leg' as const,
            rounds: [
              { pitches: ['C4', 'D4', 'E4', 'F4'], want: 'leg' as const, fingers: [1, 2, 3, 4], hand: 'RH' as const },
              { pitches: ['G4', 'G4', 'G4'], want: 'stac' as const, fingers: [5, 5, 5], hand: 'RH' as const },
              { pitches: ['G4', 'F4', 'E4', 'D4'], want: 'leg' as const, fingers: [5, 4, 3, 2], hand: 'RH' as const },
              { pitches: ['C4', 'E4', 'G4'], want: 'stac' as const, fingers: [1, 3, 5], hand: 'RH' as const },
            ],
          }
        : {
            mode: 'loud-soft' as const,
            rounds: [
              { pitches: ['C4', 'E4', 'G4'], want: 'f' as const, fingers: [1, 3, 5], hand: 'RH' as const },
              { pitches: ['G4', 'E4', 'C4'], want: 'p' as const, fingers: [5, 3, 1], hand: 'RH' as const },
              { pitches: ['E4', 'D4', 'C4'], want: 'p' as const, fingers: [3, 2, 1], hand: 'RH' as const },
              { pitches: ['C4', 'D4', 'E4'], want: 'f' as const, fingers: [1, 2, 3], hand: 'RH' as const },
            ],
          }),
    });
  } else if (extra < 0.35 && week >= 3) {
    const quiz: QuizSpec =
      week >= 25 && rng() < 0.5
        ? { variant: 'majorminor', pool: ['C4', 'D4', 'F4', 'G4', 'A4'], rounds: 6 }
        : { variant: 'identify', pool: ['C4', 'D4', 'E4', 'F4', 'G4'], rounds: 6 };
    activities.push({ kind: 'quiz', title: quiz.variant === 'majorminor' ? 'Vui hay buồn? 😊😢' : 'Nốt nào đây? 👂', intro: 'Đôi tai giỏi — nghe rồi chọn nhé!', quiz });
  } else if (keep) {
    activities.push({ kind: 'song', songId: keep.id, mode: 'tempo', level: 3, hints: 'names', intro: keepStale ? '🔁 Ôn bài cũ — lâu rồi chưa chơi, mình đàn lại nhé!' : 'Bài con đã thuộc — chơi lại cho nhớ lâu!' });
  }
  return { id: `w${week}-daily`, week, title: 'Luyện tập mỗi ngày', emoji: '🔁', activities };
}
