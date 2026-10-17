import { describe, expect, it } from 'vitest';
import {
  WEEKS,
  activityDoneId,
  buildSessionPlan,
  estimateLessonMinutes,
  findLesson,
  MAX_SESSION_STEPS,
  nextLesson,
} from '../src/lessons/lessonEngine';
import { THEORY, theoryCardAt, theoryQuestion, theoryUnlocked, type TheoryConcept } from '../src/lessons/theory';
import type { Activity, Lesson, TheoryId } from '../src/lessons/types';
import type { QuizSpec } from '../src/practice/quiz';
import { findTune } from '../src/music/exercises';
import { allTimed } from '../src/music/tune';
import { staffStep } from '../src/music/staff';
import { pitchToMidi } from '../src/piano/pitchTable';
import { CURRICULUM_REV, defaultData } from '../src/progress/schema';
import { fixtureWeek4Child } from './fixtures/week4Child';

/**
 * (OWNER duyệt 2026-10-12) "Nhạc lý nhẹ nhàng": thẻ "📘 Biết thêm" (kind 'theory'), "📘 Đố vui nhạc lý" (quiz 'theory'),
 * "📘 Từ điển nhạc nhỏ". Chặn: khái niệm DÙNG trước khi có thẻ quá 1 tuần; thẻ ở tuần 1–5 chỉ nằm CUỐI bài (tiến độ đã lưu
 * giữ nguyên nghĩa); buổi ≤ 12 phút / ≤ 7 màn; lời cho bé ngắn; Từ điển mở đúng theo tuần.
 */

const ORDERED = WEEKS.flatMap((w) => w.lessons.flatMap((lesson) => lesson.activities.map((a, i) => ({ week: w.week, lesson, a, i }))));
const words = (s: string) => s.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
const theoryActs = ORDERED.filter((x) => x.a.kind === 'theory') as Array<{ week: number; lesson: Lesson; a: Extract<Activity, { kind: 'theory' }>; i: number }>;

describe('Nhạc lý nhẹ nhàng — thẻ "📘 Biết thêm" trong giáo trình', () => {
  it('mỗi khái niệm có ĐÚNG một thẻ, ở đúng bài/tuần khai báo', () => {
    const placed = theoryActs.flatMap((x) => x.a.ids);
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual(THEORY.map((c) => c.id).sort());
    for (const c of THEORY) {
      const at = theoryCardAt(c.id)!;
      expect(at, c.id).toBeTruthy();
      expect(at.lessonId, c.id).toBe(c.lesson);
      expect(at.week, c.id).toBe(c.week);
    }
    // Đủ các khái niệm OWNER liệt kê
    for (const id of ['octave', 'step-skip', 'interval-45', 'key-sig-g', 'key-sig-f', 'tempo', 'dynamics', 'cresc-dim', 'legato', 'staccato', 'tie',
      'note-values', 'time-44', 'time-34', 'sharp-flat', 'natural', 'ledger', 'bass-clef', 'half-whole', 'major-minor', 'chords'] as TheoryId[])
      expect(THEORY.some((c) => c.id === id), id).toBe(true);
  });

  it('AN TOÀN TIẾN ĐỘ: tuần 1–5 thẻ chỉ nằm CUỐI bài (mã "<bài>#<i>" cũ giữ nguyên nghĩa), không thêm/bớt bài', () => {
    for (const w of WEEKS.filter((x) => x.week <= 5))
      for (const l of w.lessons) {
        const kinds = l.activities.map((a) => a.kind);
        const first = kinds.indexOf('theory');
        if (first < 0) continue;
        expect(kinds.slice(first).every((k) => k === 'theory'), l.id).toBe(true);
      }
    expect(WEEKS.slice(0, 5).map((w) => w.lessons.map((l) => l.id))).toEqual([
      ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4', 'w1-test'],
      ['w2-l1', 'w2-l2', 'w2-l3'],
      ['w3-l1', 'w3-l2', 'w3-l3', 'w3-l4'],
      ['w4-l1', 'w4-l2', 'w4-l3', 'w4-l4'],
      ['w5-l1', 'w5-l2', 'w5-l3', 'w5-l4'],
    ]);
    // Bài kiểm tra tuần không có thẻ (kết quả kiểm tra không lẫn)
    for (const x of theoryActs) expect(x.lesson.isWeekTest, x.lesson.id).toBeFalsy();
    expect(CURRICULUM_REV).toBe(5); // (2026-10-17) rev 5: tuần 1–26 không đổi số
  });

  it('bé thật (tuần 4, bản lưu): bài đã xong không mở lại; "Học tiếp" vẫn là bài cũ, thẻ mới ở cuối', () => {
    const d = fixtureWeek4Child(new Date(2026, 9, 12));
    const next = nextLesson(d, () => 0.3, new Date(2026, 9, 12, 17));
    expect(next.id).toBe('w4-l2');
    for (const id of ['w4-l1', 'w3-l2']) expect(d.progress.lessonsCompleted).toContain(id);
    // w4-l4 dở (xong hoạt động 0–1) → còn 2, 3 + thẻ 4
    d.progress.lessonsCompleted.push(activityDoneId('w4-l4', 0), activityDoneId('w4-l4', 1));
    const acts = buildSessionPlan(findLesson('w4-l4')!, d).flatMap((s) => (s.kind === 'activity' ? [`${s.index}:${s.activity.kind}`] : []));
    // (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") thẻ 4 không còn là bước — chip "📘 1 thẻ mới" ở màn kết; chỉ số giữ nguyên
    const plan = buildSessionPlan(findLesson('w4-l4')!, d);
    expect(acts).toEqual(['2:song', '3:improv']);
    const closing = plan[plan.length - 1];
    expect(closing.kind === 'closing' && closing.theory).toEqual(['step-skip']);
    const last = plan.filter((s) => s.kind === 'activity').pop()!;
    expect(last.kind === 'activity' && last.index === 3 && last.last).toBe(true);
  });

  it('buổi có thẻ vẫn ≤ 12 phút, ≤ 7 màn, ≤ 5 hoạt động; hoạt động của bài không bị cắt', () => {
    for (const x of theoryActs) {
      expect(estimateLessonMinutes(x.lesson), x.lesson.id).toBeLessThanOrEqual(12);
      expect(x.lesson.activities.length, x.lesson.id).toBeLessThanOrEqual(5);
      const plan = buildSessionPlan(x.lesson);
      expect(plan.length, x.lesson.id).toBeLessThanOrEqual(MAX_SESSION_STEPS);
      expect(plan.filter((s) => s.kind === 'activity')).toHaveLength(x.lesson.activities.filter((a) => a.kind !== 'theory').length); // thẻ 📘 ra khỏi buổi (2026-10-17)
      expect(x.a.ids.length, x.lesson.id).toBeLessThanOrEqual(2);
    }
  });

  it('lời cho bé ngắn: tên ≤ 8 chữ, 1–3 dòng ≤ 12 chữ, Từ điển ≤ 12 chữ, câu hỏi ≤ 12 chữ, 2–3 lựa chọn', () => {
    for (const c of THEORY) {
      expect(words(c.title), c.title).toBeLessThanOrEqual(8);
      expect(c.lines.length, c.id).toBeGreaterThanOrEqual(1);
      expect(c.lines.length, c.id).toBeLessThanOrEqual(3);
      for (const l of c.lines) expect(words(l), `${c.id}: ${l}`).toBeLessThanOrEqual(12);
      expect(words(c.short), c.short).toBeLessThanOrEqual(12);
      expect(c.terms.length, c.id).toBeGreaterThan(0);
      expect(c.checks.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.checks.length, c.id).toBeLessThanOrEqual(3);
      for (const q of c.checks) {
        expect(words(q.q), q.q).toBeLessThanOrEqual(12);
        expect(q.choices.length, q.q).toBeGreaterThanOrEqual(2);
        expect(q.choices.length, q.q).toBeLessThanOrEqual(3);
        expect(new Set(q.choices).size, q.q).toBe(q.choices.length);
        expect(q.answer, q.q).toBeLessThan(q.choices.length);
        for (const ch of q.choices) expect(words(ch), ch).toBeLessThanOrEqual(6);
      }
    }
  });
});

/** Tuần (và vị trí) khái niệm được DÙNG lần đầu trong giáo trình — tính từ dữ liệu bài, không khai báo tay. */
function firstUses(): Map<TheoryId, { week: number; at: string }> {
  const out = new Map<TheoryId, { week: number; at: string }>();
  const use = (id: TheoryId, week: number, at: string) => out.has(id) || out.set(id, { week, at });
  const quizUse = (q: QuizSpec, week: number, at: string) => {
    if (q.variant === 'stepskip' || q.variant === 'interval') use('step-skip', week, at);
    if (q.variant === 'interval' && (q.maxInterval ?? 3) >= 4) use('interval-45', week, at);
    if (q.variant === 'majorminor') use('major-minor', week, at);
    if ((q.variant === 'read' || q.variant === 'landmark') && (q.clef === 'bass' || q.pool.some((p) => pitchToMidi(p) < 57))) use('bass-clef', week, at);
    // Dòng kẻ phụ (trừ Đô giữa "đội mũ" — nốt mốc dạy từ tuần 8)
    if ((q.variant === 'read' || q.variant === 'landmark') && q.clef !== 'bass' && q.pool.some((p) => p !== 'C4' && pitchToMidi(p) >= 57 && (staffStep(p, 'treble') < -1 || staffStep(p, 'treble') > 9)))
      use('ledger', week, at);
  };
  for (const w of WEEKS) {
    if (w.warmup) quizUse(w.warmup, w.week, `w${w.week} khởi động`);
    for (const l of w.lessons)
      l.activities.forEach((a, i) => {
        const at = `${l.id}#${i}`;
        if (a.kind === 'quiz') quizUse(a.quiz, w.week, at);
        if (a.kind === 'rhythm') {
          // Tuần 2 chỉ vỗ "Đi – Đi" (nốt đen); trường độ khác nhau + đếm 4 phách/ô dạy từ "Ngôn ngữ nhịp" (tuần 4)
          if (a.patterns.flat().some((s) => s !== 'walk')) {
            use('note-values', w.week, at);
            use('time-44', w.week, at);
          }
          if (a.patterns.flat().includes('tie')) use('tie', w.week, at);
          if (a.patterns.flat().includes('dotted')) use('dotted', w.week, at);
        }
        if (a.kind === 'dynamics') use(a.mode === 'loud-soft' ? 'dynamics' : a.rounds.some((r) => r.want === 'stac') ? 'staccato' : 'legato', w.week, at);
        if (a.kind === 'notes' && /hợp âm/i.test(a.segment.title)) use('chords', w.week, at);
        if (a.kind !== 'song') return;
        const t = findTune(a.songId)!;
        if (t.timeSignature === '2/4') use('time-24', w.week, at);
        if (t.timeSignature === '3/4') use('time-34', w.week, at);
        if (/^scale_g/.test(t.id)) use('key-sig-g', w.week, at);
        if (/^scale_f/.test(t.id)) use('key-sig-f', w.week, at);
        if (t.tempoTerm) use('tempo', w.week, at);
        for (const n of allTimed(t)) {
          if (n.dyn) use('dynamics', w.week, at);
          if (n.stac) use('staccato', w.week, at);
          if (n.slur) use('legato', w.week, at);
          if (n.hairpin) use('cresc-dim', w.week, at);
          if (n.rit) use('tempo', w.week, at);
          if (!n.rest && n.beats === 3) use('dotted-half', w.week, at);
          if (!n.rest && n.beats === 1.5) use('dotted', w.week, at);
          if (n.pitch && /[#b]/.test(n.pitch.slice(1))) use('sharp-flat', w.week, at);
          if (n.also?.length) use('chords', w.week, at);
        }
      });
  }
  return out;
}

describe('Nhạc lý — khái niệm có thẻ trước (hoặc ngay tuần sau) khi được DÙNG', () => {
  it('mọi khái niệm dò được: tuần thẻ ≤ tuần dùng đầu tiên + 1', () => {
    const uses = firstUses();
    const report: string[] = [];
    for (const [id, u] of uses) {
      const c = THEORY.find((x) => x.id === id)!;
      report.push(`${id}: dùng ${u.at} (tuần ${u.week}) — thẻ tuần ${c.week}`);
      expect(c.week, `${id}: dùng lần đầu ở ${u.at}, thẻ ở tuần ${c.week}`).toBeLessThanOrEqual(u.week + 1);
    }
    // phần lớn khái niệm dò được tự động
    expect(uses.size, report.join('\n')).toBeGreaterThanOrEqual(18);
  });

  it('câu hỏi / lựa chọn của thẻ không dùng THUẬT NGỮ của thẻ tuần sau', () => {
    for (const c of THEORY) {
      const later = THEORY.filter((x) => x.week > c.week).flatMap((x) => x.terms).filter((t) => t.length >= 5).map((t) => t.toLowerCase());
      const text = [...c.lines, ...c.checks.flatMap((q) => [q.q, ...q.choices])].join(' | ').toLowerCase();
      for (const t of later) expect(text.includes(t), `${c.id} nhắc "${t}" (chưa học)`).toBe(false);
    }
  });

  it('"📘 Đố vui nhạc lý" (khởi động thỉnh thoảng) chỉ hỏi khái niệm có thẻ ở tuần TRƯỚC', () => {
    const quizzes: Array<{ week: number; q: QuizSpec; at: string }> = [];
    for (const w of WEEKS) {
      if (w.warmup?.variant === 'theory') quizzes.push({ week: w.week, q: w.warmup, at: `w${w.week} khởi động` });
      for (const l of w.lessons) l.activities.forEach((a, i) => a.kind === 'quiz' && a.quiz.variant === 'theory' && quizzes.push({ week: w.week, q: a.quiz, at: `${l.id}#${i}` }));
    }
    expect(quizzes.length).toBeGreaterThanOrEqual(4);
    // "thỉnh thoảng": không quá 1/6 số tuần
    expect(quizzes.length).toBeLessThanOrEqual(Math.ceil(WEEKS.length / 6));
    for (const x of quizzes) {
      expect(x.q.theoryUpTo, x.at).toBeDefined();
      expect(x.q.theoryUpTo!, x.at).toBeLessThan(x.week);
      expect(x.q.rounds, x.at).toBeLessThanOrEqual(6);
      let k = 1;
      const rng = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
      let prev: string | undefined;
      const allowedIv = new Set(['Quãng 2', 'Quãng 3']);
      const known = THEORY.filter((c) => c.week <= x.q.theoryUpTo!).map((c) => c.id);
      if (known.includes('interval-45')) ['Quãng 4', 'Quãng 5'].forEach((v) => allowedIv.add(v));
      if (known.includes('octave')) allowedIv.add('Quãng 8');
      for (let r = 0; r < 200; r++) {
        const q = theoryQuestion(x.q.theoryUpTo, rng, prev);
        expect(q.key, x.at).not.toBe(prev);
        prev = q.key;
        if (q.key.startsWith('iv:')) {
          expect(known, x.at).toContain('staff-treble');
          for (const ch of q.choices) expect(allowedIv.has(ch), `${x.at}: ${ch}`).toBe(true);
          expect(q.choices[q.answer]).toMatch(/^Quãng \d$/);
        } else {
          const id = q.key.split(':')[0] as TheoryId;
          expect(known, `${x.at}: ${q.key}`).toContain(id);
        }
      }
    }
  });

  it('"Quãng mấy?" đáp án đúng theo bậc trên khuông', () => {
    let k = 3;
    const rng = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
    let n = 0;
    for (let r = 0; r < 300; r++) {
      const q = theoryQuestion(undefined, rng);
      if (!q.key.startsWith('iv:') || q.pic?.kind !== 'staff') continue;
      n++;
      const [a, b] = q.pic.notes.map((x) => x.pitch!);
      const d = staffStep(b, 'treble') - staffStep(a, 'treble');
      expect(q.choices[q.answer]).toBe(`Quãng ${d + 1}`);
    }
    expect(n).toBeGreaterThan(30);
  });
});

describe('📘 Từ điển nhạc nhỏ — mở theo tuần', () => {
  const at = (week: number, done: string[] = []) => {
    const d = defaultData(new Date(2026, 9, 1));
    d.progress.currentWeek = week;
    d.progress.lessonsCompleted = done;
    return theoryUnlocked(d).map((c: TheoryConcept) => c.id);
  };

  it('tuần 1 chưa học gì: trống; xong bài có thẻ → mở', () => {
    expect(at(1)).toEqual([]);
    expect(at(1, ['w1-l3'])).toEqual(['octave']);
    expect(at(1, [activityDoneId('w1-l3', 2)])).toEqual(['octave']);
  });

  it('bé thật tuần 4: mở quãng 8; quãng 2–3 chỉ mở khi làm tới thẻ ở cuối bài 4', () => {
    const d = fixtureWeek4Child(new Date(2026, 9, 12));
    expect(theoryUnlocked(d).map((c) => c.id)).toEqual(['octave']);
    d.progress.lessonsCompleted.push(activityDoneId('w4-l4', 4));
    expect(theoryUnlocked(d).map((c) => c.id)).toEqual(['octave', 'step-skip']);
  });

  it('tuần sau mở mọi thẻ tuần trước; tuần cuối mở tất cả', () => {
    expect(at(6)).toEqual(THEORY.filter((c) => c.week <= 5).map((c) => c.id));
    expect(at(12)).toEqual(THEORY.filter((c) => c.week < 12).map((c) => c.id));
    expect(at(WEEKS.length)).toEqual(THEORY.map((c) => c.id));
  });
});
