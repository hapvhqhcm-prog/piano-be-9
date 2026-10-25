/**
 * (2026-10-25, OWNER: "tôi hầu như không có thời gian vào app, hãy bỏ phần phụ huynh ra") — app chạy TRỌN VẸN không cần bố mẹ.
 * - Tiêu chí MỌI tuần đạt được chỉ bằng micro / BÉ TỰ KIỂM TRA (kể cả phiếu tự xem tay Cấp 4, huy chương, tuần 1 Đô giữa).
 * - Không còn hàng chờ bố mẹ xem: không tạo mục mới; dữ liệu cũ được dọn một lần (reviewQueue.settleLegacyReviews).
 * - Kết quả bé tự kiểm tra được đóng dấu `by: 'self'`.
 * - Chữ trong màn của bé (màn chính, buổi học, bài hát, hoạt động, dữ liệu bài học) không bảo bé nhờ bố mẹ.
 * - Bé thật (fixture tuần 4): bài "Học tiếp" không đổi.
 */
import { describe, expect, it } from 'vitest';
import { MAX_QUIZ_ROUNDS, MAX_WEEK, WEEKS, buildSessionPlan, criterionProgress, nextLesson, weekComplete, weekPassed } from '../src/lessons/lessonEngine';
import { LEVELS } from '../src/lessons/curriculum';
import { RELAX_CHECKS } from '../src/lessons/level4';
import type { Lesson } from '../src/lessons/types';
import { makeQuestion, type QuizSpec } from '../src/practice/quiz';
import { MemoryStorage, ProgressStore, STORAGE_KEY } from '../src/progress/ProgressStore';
import { defaultData, type AppData, type ReviewItem } from '../src/progress/schema';
import { fixtureWeek4Child } from './fixtures/week4Child';

const PARENT_WORDS = /bố mẹ|phụ huynh|👪/iu;

/** Bé GIỎI học một mình, MICRO TẮT: mọi chỗ cần chấm là bé tự kiểm tra (👍 Rồi) — như các màn hiện nay ghi. */
function childAloneJourney(o: { maxSessions?: number } = {}) {
  let day = 0;
  let clock = 0;
  const now = () => new Date(2026, 10, 1 + day, 17, 0, clock++ % 60);
  const st = new ProgressStore(new MemoryStorage(), now, { autoCompact: false });
  let x = 7;
  const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const quiz = (sid: string, q: QuizSpec) => {
    let prev;
    for (let k = 0; k < Math.min(q.rounds, MAX_QUIZ_ROUNDS); k++) {
      prev = makeQuestion(q, rng, prev);
      st.addAppAssessment(sid, prev.expected, prev.expected); // trò tai nghe / đọc nốt: app tự chấm
    }
  };
  const play = (lesson: Lesson) => {
    const steps = buildSessionPlan(lesson, st.get());
    const s = st.startSession(lesson.id);
    for (const step of steps) if (step.kind === 'quiz') quiz(s.id, step.quiz);
    for (const a of lesson.activities) {
      // Thẻ / nốt (practice.ts): micro tắt → bé chạm "👍 Rồi" (selfOkButton) → hooks.record → addParentAssessment
      if (a.kind === 'notes') a.segment.targets.forEach((t) => st.addParentAssessment(s.id, t.noteId, 'correct'));
      else if (a.kind === 'quiz') quiz(s.id, a.quiz);
      else if (a.kind === 'song')
        // songResult.askSelf: bé tự kiểm tra 3 ý → "👍 Rồi" = lượt ĐẠT, phiếu 3 ý đều đạt (source 'parent')
        st.addSongRun(s.id, {
          songId: a.songId,
          mode: a.mode,
          level: a.mode === 'tempo' ? (a.level ?? 2) : undefined,
          bpm: 72,
          hints: a.hints,
          phrase: a.phrase ?? null,
          total: 8,
          hits: 8,
          source: 'parent',
          passed: true,
          checklist: { notes: true, beat: true, fingers: true },
          ...(a.hand ? { hand: a.hand } : {}),
        });
      else if (a.kind === 'sight')
        for (let k = 0; k < a.count; k++)
          st.addSongRun(s.id, {
            songId: `sight:${a.position}:${a.hand}`,
            mode: 'wait',
            bpm: 60,
            hints: a.hints,
            phrase: null,
            total: 8,
            hits: 8,
            source: 'parent',
            passed: true,
            checklist: { notes: true, beat: true, fingers: true },
          });
      // stage.ts: bé chạm "🏅 Nhận huy chương" (hooks.onMedal) — không cần bố mẹ trao
      else if (a.kind === 'stage') st.addParentAssessment(s.id, 'medal', 'correct');
    }
    st.setSelfRating(s.id, 'all');
    st.finishSession(s.id);
    st.markLessonCompleted(lesson.id);
    const w = st.get().progress.currentWeek;
    if (lesson.week === w && weekComplete(w, st.get()) && w < MAX_WEEK) st.setCurrentWeek(w + 1);
  };
  const stuck: number[] = [];
  const passed: number[] = [];
  let sessions = 0;
  const max = o.maxSessions ?? 400;
  while (sessions < max) {
    const w = st.get().progress.currentWeek;
    if (w === MAX_WEEK && weekComplete(MAX_WEEK, st.get())) break;
    play(nextLesson(st.get(), rng));
    sessions++;
    if (sessions % 2 === 0) day++;
    const now2 = st.get().progress.currentWeek;
    if (now2 > w) passed.push(w);
    if (now2 === w && st.get().sessions.filter((s) => s.lessonId.startsWith(`w${w}-`)).length > 14) {
      stuck.push(w);
      break;
    }
  }
  return { st, stuck, passed, sessions };
}

let journey: ReturnType<typeof childAloneJourney> | null = null;
/** Một hành trình dùng chung cho các test (chạy ~vài giây) */
const shared = () => (journey ??= childAloneJourney());

describe('tiêu chí mọi tuần đạt được KHÔNG CẦN bố mẹ (micro tắt — bé tự kiểm tra)', () => {
  const run = { get st() { return shared().st; }, get stuck() { return shared().stuck; }, get sessions() { return shared().sessions; } };
  it(`bé học một mình đi hết ${MAX_WEEK} tuần, không kẹt tuần nào`, () => {
    expect(run.stuck).toEqual([]);
    expect(weekComplete(MAX_WEEK, run.st.get())).toBe(true);
    for (let w = 1; w <= MAX_WEEK; w++) expect(weekPassed(w, run.st.get()), `tuần ${w}`).toBe(true);
    expect(run.sessions).toBeGreaterThan(MAX_WEEK * 2);
  }, 120_000);

  it('không tạo mục chờ bố mẹ xem; mọi kết quả không qua micro đều đóng dấu "bé tự kiểm tra"', () => {
    const d = run.st.get();
    expect(d.reviews).toBeUndefined();
    const pas = d.sessions.flatMap((s) => s.parentAssessments);
    expect(pas.length).toBeGreaterThan(100);
    expect(pas.every((a) => a.by === 'self')).toBe(true);
    const selfRuns = d.sessions.flatMap((s) => s.songRuns).filter((r) => r.source === 'parent');
    expect(selfRuns.length).toBeGreaterThan(100);
    expect(selfRuns.every((r) => r.by === 'self')).toBe(true);
    // store không còn API hoãn việc cho bố mẹ / chọn "Có bố mẹ"
    const api = run.st as unknown as Record<string, unknown>;
    for (const k of ['deferReview', 'studyMode', 'setStudyMode', 'approveReview', 'approveAllReviews', 'dismissReview', 'reviews']) expect(api[k], k).toBeUndefined();
  });

  it('Cấp 4: phiếu TỰ XEM TAY (vai / khớp ngón / cổ tay) do bé tự kiểm tra là đủ cho tiêu chí', () => {
    const lv4 = LEVELS[3];
    const d = run.st.get();
    for (let w = lv4.weeks[0]; w <= Math.min(lv4.weeks[1], MAX_WEEK); w++) {
      const spec = WEEKS[w - 1].criterionSpec;
      if (!spec?.parentChecks?.length) continue;
      const notes = d.sessions.filter((s) => s.lessonId.startsWith(`w${w}-`)).flatMap((s) => s.parentAssessments);
      for (const c of spec.parentChecks) expect(notes.some((a) => a.note === c && a.result === 'correct' && a.by === 'self'), `tuần ${w} ${c}`).toBe(true);
    }
    expect(RELAX_CHECKS.length).toBe(3);
  });
});

describe('Cấp 4: "🔁 Làm lại" ở lần tự kiểm tra GẦN NHẤT → chưa đủ (tự kiểm tra thật thà vẫn có ý nghĩa)', () => {
  it('thẻ tự xem tay: lần gần nhất "Làm lại" thì chưa đạt; tự kiểm tra lại "Rồi" thì đạt', () => {
    const d = JSON.parse(JSON.stringify(shared().st.get())) as AppData;
    const w = 34;
    delete d.history;
    d.progress.currentWeek = w;
    expect(weekPassed(w, d)).toBe(true);
    const maxTs = Math.max(...d.sessions.flatMap((s) => s.parentAssessments.map((a) => a.ts)));
    const last = [...d.sessions].reverse().find((s) => s.lessonId.startsWith(`w${w}-`))!;
    last.parentAssessments.push({ note: 'relax:wrist', result: 'retry', ts: maxTs + 1000, by: 'self' });
    expect(weekPassed(w, d)).toBe(false);
    last.parentAssessments.push({ note: 'relax:wrist', result: 'correct', ts: maxTs + 2000, by: 'self' });
    expect(weekPassed(w, d)).toBe(true);
  }, 120_000);
});

describe('hàng chờ bố mẹ xem CŨ trong dữ liệu đã lưu → dọn MỘT lần khi mở app', () => {
  const item = (p: Partial<ReviewItem>): ReviewItem => ({ id: 'rv-x', kind: 'song', group: 'g', label: 'l', date: '2026-10-20', ts: new Date(2026, 9, 20, 17).getTime(), ...p });
  const run = { songId: 'frog_hop', mode: 'tempo' as const, level: 2 as const, bpm: 60, hints: 'names' as const, phrase: null, total: 20 };

  it('lượt micro đã nghe ≥ 80% → tính như micro chấm (vào đúng buổi / ngày); phần còn lại bỏ; reviews biến mất', () => {
    const d = defaultData(new Date(2026, 9, 1));
    d.progress.currentWeek = 5;
    d.sessions.push({
      id: 's1',
      date: '2026-10-20',
      lessonId: 'w5-l1',
      parentAssessments: [],
      appAssessments: [],
      micAssessments: [],
      songRuns: [],
      selfRating: null,
      startedAt: new Date(2026, 9, 20, 17).getTime(),
      endedAt: null,
      minutes: 5,
      completed: true,
      checklist: {},
    });
    d.reviews = [
      item({ id: 'a', sessionId: 's1', run, mic: 'micro nghe chưa rõ (nghe được 18/20 nốt)' }),
      item({ id: 'b', sessionId: 's1', run, mic: 'micro nghe chưa rõ (nghe được 9/20 nốt)' }),
      item({ id: 'c', sessionId: 's1', run }),
      item({ id: 'd', kind: 'check', run: undefined, notes: [{ note: 'relax:wrist', ts: 1 }], visual: true }),
      item({ id: 'e', kind: 'challenge', run: undefined, challenge: 'teach' }),
    ];
    const kv = new MemoryStorage();
    kv.setItem(STORAGE_KEY, JSON.stringify(d));
    const st = new ProgressStore(kv, () => new Date(2026, 9, 21, 9), { autoCompact: false });
    const got = st.get();
    expect(got.reviews).toBeUndefined();
    expect(st.takeDroppedReviews().sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    const runs = got.sessions.find((s) => s.id === 's1')!.songRuns;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ songId: 'frog_hop', source: 'mic', passed: true, hits: 18, total: 20 });
    expect(got.sessions.flatMap((s) => s.parentAssessments)).toEqual([]);
    // đã ghi xuống bộ nhớ: mở lại không còn gì để dọn
    const st2 = new ProgressStore(kv, () => new Date(2026, 9, 21, 10), { autoCompact: false });
    expect(st2.get().reviews).toBeUndefined();
    expect(st2.takeDroppedReviews()).toEqual([]);
  });

  it('nhập bản sao lưu cũ còn hàng chờ → cũng được dọn', () => {
    const d = defaultData(new Date(2026, 9, 1));
    d.reviews = [item({ id: 'z', kind: 'challenge', challenge: 'c1' })];
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 21, 9), { autoCompact: false });
    expect(st.importJSON(JSON.stringify(d))).toEqual({ ok: true });
    expect(st.get().reviews).toBeUndefined();
    expect(st.takeDroppedReviews()).toEqual(['z']);
  });
});

describe('bé thật (fixture tuần 4) — không đổi gì về tiến độ', () => {
  it('qua kho (dọn hàng chờ không có gì): "Học tiếp" vẫn là w4-l2, tiêu chí như cũ', () => {
    const d = fixtureWeek4Child(new Date(2026, 9, 15, 12));
    const before = { next: nextLesson(d).id, passed: weekPassed(4, d), prog: criterionProgress(4, d) };
    expect(before.next).toBe('w4-l2');
    const kv = new MemoryStorage();
    kv.setItem(STORAGE_KEY, JSON.stringify(d));
    const st = new ProgressStore(kv, () => new Date(2026, 9, 15, 12), { autoCompact: false });
    const got = st.get();
    expect(nextLesson(got).id).toBe(before.next);
    expect(weekPassed(4, got)).toBe(before.passed);
    expect(criterionProgress(4, got)).toEqual(before.prog);
    expect(got.progress.currentWeek).toBe(4);
    // micro của bé thật giữ nguyên lựa chọn đã lưu (không bị đổi bởi mặc định mới)
    expect(got.settings.micEnabled).toBe(d.settings.micEnabled);
  });
  it('người dùng MỚI: micro bật sẵn', () => {
    expect(defaultData().settings.micEnabled).toBe(true);
  });
});

/* ---------------- chữ trong màn của bé ---------------- */

/** Bỏ chú thích (// … và /* … *\/) — chỉ giữ mã + chuỗi. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/(^|[^:'"`])\/\/(?![^'"`]*['"`][,)]).*$/, '$1')))
    .join('\n');
}
/** Mã nguồn src/ui (chuỗi thô) */
const UI_RAW = import.meta.glob('../src/ui/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
/** Màn chỉ vào được sau cổng ⚙️ Cài đặt (người lớn) — được nhắc tới bố mẹ. */
const ADULT_ONLY = new Set([
  'parent.ts',
  'parentAdvanced.ts',
  'parentGate.ts',
  'parentGuide.ts',
  'parentGuideData.ts',
  'parentHelp.ts',
  'parentProgressCards.ts',
  'parentShared.ts',
  'parentSongsCard.ts',
  'parentWeek.ts',
  'tonight.ts',
  'report.ts',
  'reportImage.ts',
  'weeklyReport.ts',
  'weeklyReportImage.ts',
  'healthCheck.ts',
  'diagnostics.ts',
  'micTest.ts',
  'micTestShared.ts',
  'micAutoReport.ts',
  'micSupportTools.ts',
  'micFiveNoteCheck.ts',
  'albumParent.ts',
  'songEditor.ts',
  'songRecord.ts',
]);

describe('không còn lời nhắc bé nhờ bố mẹ trong màn của bé', () => {
  it('src/ui (trừ màn sau cổng ⚙️): không có chuỗi "bố mẹ / phụ huynh / 👪"', () => {
    const files = Object.keys(UI_RAW).filter((f) => !ADULT_ONLY.has(f.split('/').pop()!));
    expect(files.length).toBeGreaterThan(80);
    const bad: string[] = [];
    for (const f of files) {
      const code = stripComments(UI_RAW[f]);
      code.split('\n').forEach((line, i) => {
        // teach.ts: bộ đổi lời "bố mẹ" → "Bé Nốt" trong dữ liệu cũ (không phải chữ hiện ra)
        if (PARENT_WORDS.test(line) && !/\.replace\(\//.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('dữ liệu bài học (tên, lời dẫn, mục tiêu, "Con làm thầy", câu chuyện) không bảo bé nhờ bố mẹ', () => {
    const bad: string[] = [];
    const check = (where: string, t: unknown) => {
      if (typeof t === 'string' && PARENT_WORDS.test(t)) bad.push(`${where}: ${t.slice(0, 80)}`);
    };
    for (const w of WEEKS) {
      check(`w${w.week}.story`, w.story);
      check(`w${w.week}.title`, w.title);
      check(`w${w.week}.kidGoal`, w.kidGoal);
      check(`w${w.week}.criterion`, w.criterion.text);
      check(`w${w.week}.teach`, w.teach?.text);
      for (const l of w.lessons) {
        check(l.id, l.title);
        check(`${l.id}.teach`, l.teach?.text);
        l.activities.forEach((a, i) => {
          const r = a as unknown as Record<string, unknown>;
          for (const k of ['title', 'intro', 'step', 'text']) check(`${l.id}#${i}.${k}`, r[k]);
          if (a.kind === 'notes') {
            check(`${l.id}#${i}.seg`, a.segment.title);
            check(`${l.id}#${i}.segIntro`, a.segment.intro);
            check(`${l.id}#${i}.segStep`, (a.segment as unknown as Record<string, unknown>).step);
            a.segment.targets.forEach((t) => {
              check(`${l.id}#${i}.${t.noteId}`, t.title);
              check(`${l.id}#${i}.${t.noteId}.sub`, t.subtitle);
            });
          }
        });
      }
    }
    expect(bad).toEqual([]);
  });

  it('màn chính không còn chip "Có bố mẹ / Con tự học", viên nhắc bố mẹ, dấu ⚠️; nút ⚙️ thay "👪 Phụ huynh"', () => {
    const home = UI_RAW['../src/ui/screens/home.ts'];
    for (const k of ['studyMode', 'parentPill', 'healthNow', 'parent-attn', 'Nhờ bố mẹ']) expect(home.includes(k), k).toBe(false);
    const lp = UI_RAW['../src/ui/components/longPress.ts'];
    expect(lp).toContain('⚙️');
    expect(stripComments(lp)).not.toMatch(PARENT_WORDS);
  });
});
