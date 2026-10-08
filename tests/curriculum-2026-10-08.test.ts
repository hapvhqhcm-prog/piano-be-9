import { describe, expect, it } from 'vitest';
import { WEEKS, activityDoneId, buildSessionPlan, estimateLessonMinutes, findLesson, MAX_SESSION_STEPS, weekPlan } from '../src/lessons/lessonEngine';
import type { Activity, Lesson } from '../src/lessons/types';
import { findTune } from '../src/music/exercises';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import { CURRICULUM_REV } from '../src/progress/schema';

/**
 * (2026-10-08, OWNER duyệt sau rà soát chuyên gia) — 5 thay đổi giáo trình:
 * 1. RÚT DẦN phím sáng (week4.ts "GỢI Ý RÚT DẦN")  2. LIỀN sớm (tuần 5) + dấu luyến từ tuần 6
 * 3. xem trước THẾ SOL (tuần 10) + NHỊP 3/4 sớm (tuần 11)  4. ứng tấu 1 phút MỖI tuần từ tuần 4
 * 5. lời cho bé ngắn (≤ 12 chữ) — chi tiết sang parentTips.
 * Bé ĐANG ở tuần 4 với tiến độ đã lưu theo mã "<bài>#<chỉ số hoạt động>" → tuần 1–4 chỉ được THÊM vào CUỐI bài.
 */

const ORDERED = WEEKS.flatMap((w) => w.lessons.map((lesson, idx) => ({ week: w.week, idx, lesson })));
const pos = (x: { week: number; idx: number }) => x.week * 100 + x.idx;
const sig = (a: Activity) =>
  a.kind === 'song'
    ? `song:${a.songId}@${a.mode}${a.level ?? ''}`
    : a.kind === 'notes'
      ? `notes:${a.segment.id}`
      : a.kind === 'quiz'
        ? `quiz:${a.quiz.variant}`
        : a.kind === 'improv'
          ? `improv:${a.mode}`
          : a.kind;

/** Tuần 1–4 NGAY TRƯỚC thay đổi 2026-10-08 (bé đang học tuần 4 trên bản này). */
const BEFORE: Record<string, string[]> = {
  'w1-l1': ['notes:w1-b1', 'notes:w1-b1b'],
  'w1-l2': ['notes:w1-b2', 'notes:w1-b3'],
  'w1-l3': ['notes:w1-b4', 'notes:w1-detective'],
  'w1-l4': ['notes:w1-b5a', 'notes:w1-b5b'],
  'w1-test': ['notes:w1-test-c4'],
  'w2-l1': ['notes:w2-l1-a', 'notes:w2-l1-b'],
  'w2-l2': ['notes:w2-echo', 'rhythm'],
  'w2-l3': ['song:hot_cross_buns@wait', 'song:three_chicks@wait'],
  'w3-l1': ['notes:w3-l1-a', 'notes:w3-stairs'],
  'w3-l2': ['quiz:stepskip', 'notes:w3-skips', 'notes:w3-echo3'],
  'w3-l3': ['song:mary_lamb@wait', 'song:snail_stroll@wait'],
  'w3-l4': ['song:au_clair@wait', 'improv:black-keys'],
  'w4-l1': ['rhythm'],
  'w4-l2': ['song:ex_c_quarter@tempo2', 'song:ex_cde_walk@tempo2'],
  'w4-l3': ['song:hot_cross_buns@tempo2', 'song:choo_choo_train@wait', 'song:choo_choo_train@tempo2'],
  'w4-l4': ['song:go_tell_aunt_rhody@wait', 'song:go_tell_aunt_rhody@tempo3', 'song:lightly_row@wait'],
};

/** Số "chữ" (từ có chữ cái / chữ số; bỏ dấu gạch, mũi tên, emoji). */
const words = (s: string) => s.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;

describe('AN TOÀN TIẾN ĐỘ tuần 1–4 (bé đang ở tuần 4)', () => {
  it('mã bài tuần 1–4 giữ nguyên; hoạt động cũ giữ nguyên CHỈ SỐ (chỉ thêm vào cuối); không đổi curriculumRev', () => {
    const ids = WEEKS.slice(0, 4).flatMap((w) => w.lessons.map((l) => l.id));
    expect(ids).toEqual(Object.keys(BEFORE));
    for (const [id, old] of Object.entries(BEFORE)) {
      const now = findLesson(id)!.activities.map(sig);
      expect(now.slice(0, old.length), id).toEqual(old);
    }
    expect(CURRICULUM_REV).toBe(4);
  });

  it('bản lưu giữa tuần 4: bài đã xong không mở lại; bài dở chỉ làm phần còn lại + ứng tấu mới ở cuối', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 8, 17));
    st.setCurrentWeek(4);
    ['w4-l1', 'w4-l2', 'w4-l3', activityDoneId('w4-l4', 0), activityDoneId('w4-l4', 1)].forEach((id) => st.markLessonCompleted(id));
    const plan = buildSessionPlan(findLesson('w4-l4')!, st.get());
    const acts = plan.flatMap((s) => (s.kind === 'activity' ? [s] : []));
    expect(acts.map((s) => s.index)).toEqual([2, 3]);
    expect(acts.map((s) => sig(s.activity))).toEqual(['song:lightly_row@wait', 'improv:black-keys']);
    expect(plan.length).toBeLessThanOrEqual(MAX_SESSION_STEPS);
  });
});

describe('1. RÚT DẦN phím sáng (tuần 4–15)', () => {
  const seen = new Set<string>();
  const rows: Array<{ week: number; id: string; songId: string; mode: string; hints: string; first: boolean }> = [];
  for (const x of ORDERED) {
    for (const a of x.lesson.activities) {
      if (a.kind !== 'song' || a.hand || a.phrase) continue;
      rows.push({ week: x.week, id: x.lesson.id, songId: a.songId, mode: a.mode, hints: a.hints, first: !seen.has(a.songId) });
      seen.add(a.songId);
    }
  }
  const inRange = rows.filter((r) => r.week >= 4 && r.week <= 15);

  it('tuần 4–15: lượt THEO NHỊP của bài đã gặp không còn phím sáng (names/staff)', () => {
    for (const r of inRange.filter((r) => r.mode === 'tempo' && !r.first)) expect(r.hints, `${r.id} ${r.songId}`).not.toBe('full');
  });

  it('tuần 4–7: lần đầu gặp bài (chế độ chờ) vẫn phím sáng; chưa có "chỉ khuông"', () => {
    for (const r of inRange.filter((r) => r.week <= 7)) {
      if (r.mode === 'wait' && r.first) expect(r.hints, `${r.id} ${r.songId}`).toBe('full');
      expect(r.hints, r.id).not.toBe('staff');
    }
  });

  it('từ tuần 8: "chỉ khuông" xuất hiện dần (tuần 8, 9, 15), không có trước tuần 8', () => {
    const staffWeeks = new Set(rows.filter((r) => r.hints === 'staff').map((r) => r.week));
    expect(Math.min(...staffWeeks)).toBe(8);
    for (const w of [8, 9, 15]) expect(staffWeeks.has(w), `tuần ${w}`).toBe(true);
    // chỉ khuông chỉ dùng cho bài đã gặp trước đó
    for (const r of rows.filter((r) => r.hints === 'staff' && r.week <= 15)) expect(r.first, `${r.id} ${r.songId}`).toBe(false);
  });
});

describe('2. LIỀN sớm + dấu luyến', () => {
  const dyn = ORDERED.flatMap((x) => x.lesson.activities.flatMap((a) => (a.kind === 'dynamics' ? [{ ...x, a }] : [])));

  it('tuần 5: trò "Đàn liền" chỉ có lượt LIỀN (≥ 2 nốt/lượt); lượt NGẮT chỉ từ tuần 12', () => {
    const leg = dyn.find((d) => d.a.mode === 'stac-leg' && d.a.rounds.every((r) => r.want === 'leg'))!;
    expect(leg.week).toBe(5);
    for (const r of leg.a.rounds) expect(r.pitches.length).toBeGreaterThanOrEqual(2);
    const stacWeeks = dyn.filter((d) => d.a.rounds.some((r) => r.want === 'stac')).map((d) => d.week);
    expect(Math.min(...stacWeeks)).toBe(12);
  });

  it('bài có dấu luyến ở tuần 6–10 (Largo, Kìa con bướm vàng, Đò qua sông) — mọi lần dùng đều SAU trò "Đàn liền"', () => {
    const legAt = ORDERED.find((x) => x.lesson.activities.some((a) => a.kind === 'dynamics' && a.rounds.every((r) => r.want === 'leg')))!;
    const slurred = new Set<string>();
    for (const x of ORDERED) {
      for (const a of x.lesson.activities) {
        if (a.kind !== 'song') continue;
        const t = findTune(a.songId)!;
        if (![...t.notes, ...(t.lh ?? [])].some((n) => n.slur)) continue;
        expect(pos(x), `${a.songId} @ ${x.lesson.id}`).toBeGreaterThan(pos(legAt));
        if (x.week <= 10) slurred.add(a.songId);
      }
    }
    for (const id of ['largo_new_world', 'frere_jacques_easy', 'ferry_song']) expect(slurred.has(id), id).toBe(true);
    for (const id of ['largo_new_world', 'frere_jacques_easy', 'ferry_song']) expect(findTune(id)!.notes.some((n) => n.stac)).toBe(false);
  });
});

describe('3. THẾ SOL và NHỊP 3/4 sớm hơn', () => {
  it('tuần 10: "Bánh nóng — thế Sol" (bài quen, thế Sol, chỉ Sol La Si) SAU thẻ nốt Si, 4 tuần trước tuần thế Sol', () => {
    const t = findTune('hot_cross_buns_g')!;
    expect(t.position).toBe('G');
    expect(new Set(t.notes.filter((n) => !n.rest).map((n) => n.pitch))).toEqual(new Set(['G4', 'A4', 'B4']));
    const w = weekPlan(10).lessons.map((l) => l.id);
    expect(w.indexOf('w10-g')).toBeGreaterThan(w.indexOf('w10-l3')); // thẻ nốt Si ở w10-l3
    const acts = findLesson('w10-g')!.activities.map(sig);
    expect(acts.slice(0, 2)).toEqual(['song:hot_cross_buns_g@wait', 'song:hot_cross_buns_g@tempo2']);
    const gWeek = WEEKS.find((x) => x.title === 'Thế Sol')!.week;
    expect(gWeek - 10).toBeGreaterThanOrEqual(3);
  });

  it('bài 3/4 đầu tiên trước tuần 15, ngay sau trò vỗ "MỘT-hai-ba" (có "Đi-i-i") — cùng bài học', () => {
    const first = ORDERED.find((x) => x.lesson.activities.some((a) => a.kind === 'song' && findTune(a.songId)?.timeSignature === '3/4'))!;
    expect(first.week).toBeLessThan(15);
    const acts = first.lesson.activities;
    const ri = acts.findIndex((a) => a.kind === 'rhythm' && a.patterns.some((p) => p.includes('long3')));
    const si = acts.findIndex((a) => a.kind === 'song' && findTune(a.songId)?.timeSignature === '3/4');
    expect(ri).toBeGreaterThanOrEqual(0);
    expect(ri).toBeLessThan(si);
    const r = acts[ri];
    expect(r.kind === 'rhythm' && r.intro).toContain('MỘT-hai-ba');
    const song = acts[si];
    expect(song.kind === 'song' && song.songId).toBe('swing_waltz');
    // bài 3/4 đầu: thế Đô, chỉ nốt đen / trắng / trắng chấm
    const t = findTune('swing_waltz')!;
    expect(t.position ?? 'C').toBe('C');
    for (const n of t.notes) expect([1, 2, 3]).toContain(n.beats);
  });
});

describe('4. ỨNG TẤU 1 phút mỗi tuần từ tuần 4', () => {
  const improvWeeks = new Set(ORDERED.filter((x) => x.lesson.activities.some((a) => a.kind === 'improv')).map((x) => x.week));

  it('mọi tuần 4–30 có ứng tấu (trừ tuần 21 — hòa nhạc; tuần 31 chỉ có hòa nhạc)', () => {
    for (let w = 4; w <= 30; w++) if (w !== 21) expect(improvWeeks.has(w), `tuần ${w}`).toBe(true);
  });

  it('Hỏi – Đáp ở đúng thế tay đã học của tuần (không dùng thế tay chưa dạy)', () => {
    const POS_WEEK: Record<string, number> = { C: 1, G: 14, D: 16, Am: 23, C5: 26 };
    for (const x of ORDERED) {
      for (const a of x.lesson.activities) {
        if (a.kind !== 'improv' || a.mode !== 'question-answer') continue;
        expect(a.bars, x.lesson.id).toBe(2);
        expect(x.week, `${x.lesson.id} thế ${a.position}`).toBeGreaterThanOrEqual(POS_WEEK[a.position ?? 'C']);
      }
    }
  });

  it('bài có ứng tấu mới vẫn ≤ 12 phút và ≤ 5 hoạt động (buổi ≤ 7 màn)', () => {
    for (const x of ORDERED.filter((y) => y.week >= 4)) {
      if (!x.lesson.activities.some((a) => a.kind === 'improv')) continue;
      expect(estimateLessonMinutes(x.lesson), x.lesson.id).toBeLessThanOrEqual(12);
      expect(x.lesson.activities.length, x.lesson.id).toBeLessThanOrEqual(5);
      expect(buildSessionPlan(x.lesson).length, x.lesson.id).toBeLessThanOrEqual(MAX_SESSION_STEPS);
    }
  });
});

describe('5. LỜI CHO BÉ ngắn (tuần 4–31)', () => {
  const texts = (l: Lesson) =>
    l.activities.flatMap((a) => {
      // hoạt động "sing" (hát rồi đàn) thuộc phần việc khác — không kiểm ở đây
      if (a.kind === 'sing') return [];
      const intro = a.kind === 'notes' ? a.segment.intro : 'intro' in a ? a.intro : undefined;
      const title = a.kind === 'notes' ? a.segment.title : 'title' in a ? a.title : undefined;
      return [{ intro, title }];
    });

  it('lời dẫn ≤ 12 chữ, tiêu đề ≤ 8 chữ, mục tiêu tuần của bé ≤ 12 chữ', () => {
    for (const w of WEEKS.filter((x) => x.week >= 4)) {
      if (w.kidGoal) expect(words(w.kidGoal), `tuần ${w.week}: ${w.kidGoal}`).toBeLessThanOrEqual(12);
      for (const l of w.lessons) {
        expect(words(l.title), l.title).toBeLessThanOrEqual(8);
        for (const { intro, title } of texts(l)) {
          if (intro) expect(words(intro), `${l.id}: ${intro}`).toBeLessThanOrEqual(12);
          if (title) expect(words(title), `${l.id}: ${title}`).toBeLessThanOrEqual(8);
        }
      }
    }
  });
});
