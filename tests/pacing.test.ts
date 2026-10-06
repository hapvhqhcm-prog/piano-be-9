import { describe, expect, it } from 'vitest';
import {
  MAX_SESSION_STEPS,
  WEEKS,
  activityDoneId,
  buildSessionPlan,
  estimateLessonMinutes,
  findLesson,
  nextLesson,
  weekComplete,
  weekPassed,
  weekPlan,
} from '../src/lessons/lessonEngine';
import { findTune } from '../src/music/exercises';
import { phraseRanges, slice } from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';

let today = 5;
const store = () => new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, today));

/** Tuần 3: tiêu chí APP = đoán nốt đúng ≥ 5/6 trong một buổi (chơi thử 2026-10-06; trước 8/10) — ở 2 NGÀY khác nhau */
function passWeek3Criterion(st: ProgressStore): void {
  st.setCurrentWeek(3);
  for (const d of [5, 6]) {
    today = d;
    const s = st.startSession(weekPlan(3).lessons[0].id);
    for (let i = 0; i < 6; i++) st.addAppAssessment(s.id, 'E4', 'E4');
    st.finishSession(s.id);
  }
  today = 5;
}

describe('nhịp độ giáo trình (rà soát 2026-10-05)', () => {
  it('đạt tiêu chí nhưng CHƯA học hết bài → chưa qua tuần, "Học tiếp" mời bài còn thiếu', () => {
    const st = store();
    passWeek3Criterion(st);
    expect(weekPassed(3, st.get())).toBe(true);
    expect(weekComplete(3, st.get())).toBe(false);
    const regular = weekPlan(3).lessons.filter((l) => !l.isWeekTest);
    st.markLessonCompleted(regular[0].id);
    expect(nextLesson(st.get()).id).toBe(regular[1].id);
    regular.forEach((l) => st.markLessonCompleted(l.id));
    expect(weekComplete(3, st.get())).toBe(true);
  });

  it('hết giờ giữa bài → lần sau chỉ làm các hoạt động CÒN LẠI', () => {
    const st = store();
    const lesson = findLesson('w1-l1')!;
    expect(lesson.activities.length).toBeGreaterThan(1);
    st.markLessonCompleted(activityDoneId(lesson.id, 0));
    const acts = buildSessionPlan(lesson, st.get()).filter((s) => s.kind === 'activity');
    expect(acts.map((s) => (s.kind === 'activity' ? s.index : -1))).toEqual(lesson.activities.map((_, i) => i).slice(1));
    // "Chơi lại" vẫn đủ cả bài
    expect(buildSessionPlan(lesson, st.get(), { replay: true }).filter((s) => s.kind === 'activity').length).toBe(lesson.activities.length);
  });

  it('bài ĐẦU tuần chưa học: khởi động không hỏi điều tuần này mới dạy (tuần 9 không đọc khóa Fa trước)', () => {
    const st = store();
    st.setCurrentWeek(9);
    const first = weekPlan(9).lessons[0];
    const q = buildSessionPlan(first, st.get()).find((s) => s.kind === 'quiz');
    const w9 = weekPlan(9).warmup;
    if (q && q.kind === 'quiz' && w9) expect(q.quiz).not.toEqual(w9);
    // Sau khi học bài đầu → các bài sau dùng khởi động của tuần 9
    st.markLessonCompleted(first.id);
    const second = weekPlan(9).lessons[1];
    const q2 = buildSessionPlan(second, st.get()).find((s) => s.kind === 'quiz');
    if (w9) expect(q2 && q2.kind === 'quiz' && q2.quiz.variant).toBe(w9.variant);
  });

  it('tuần chấm bằng khởi động (tuần 26 đọc nốt cao): buổi đầu học bài TRƯỚC rồi mới khởi động-chấm', () => {
    const st = store();
    st.setCurrentWeek(26);
    const kinds = buildSessionPlan(weekPlan(26).lessons[0], st.get()).map((s) => s.kind);
    const firstAct = kinds.indexOf('activity');
    const quizAt = kinds.lastIndexOf('quiz');
    expect(quizAt).toBeGreaterThan(firstAct);
  });

  it('giả lập "bé giỏi": mọi bài thường của mọi tuần đều được học trước khi sang tuần', () => {
    const st = store();
    // Không giả lập tiêu chí; chỉ kiểm: nextLesson luôn mời bài thường chưa học trước bài kiểm tra
    for (let w = 1; w <= WEEKS.length; w++) {
      st.setCurrentWeek(w);
      const regular = weekPlan(w).lessons.filter((l) => !l.isWeekTest);
      for (const l of regular) {
        expect(nextLesson(st.get()).id).toBe(l.id);
        st.markLessonCompleted(l.id);
      }
    }
  });
});

import { reviewSegment } from '../src/lessons/lessonEngine';
describe('Ôn nhanh ôn cả kiến thức gần đây (lỗi chuyên gia phát hiện)', () => {
  it('tuần 15: ôn được nốt của thế Sol / khóa Fa, không chỉ tìm phím tuần 1–7', () => {
    const st = store();
    st.setCurrentWeek(15);
    const seen = new Set<string>();
    for (let k = 0; k < 40; k++) {
      let x = k + 1;
      const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      const seg = reviewSegment(weekPlan(15).lessons[0], st.get(), rng);
      seg?.targets.forEach((t) => seen.add(`${t.keys[0]}|${t.staff ? 'staff' : ''}`));
    }
    expect([...seen].some((k) => k.endsWith('|staff'))).toBe(true);
  });
});

/**
 * v5.1 (OWNER duyệt 2026-10-06 sau rà soát chuyên gia): buổi NGẮN — ≤ 7 màn (tư thế + khởi động tay, ôn nhanh, khởi động
 * tai/đọc nốt, các hoạt động, ôn bài cũ, màn kết) và ≤ ~12 phút ước lượng.
 */
describe('v5.1 — buổi ngắn: ≤ 7 màn, ≤ 12 phút', () => {
  /** Kho "đang học tuần w" có lịch sử đủ để mọi bước phụ đều có thể xuất hiện (ôn nhanh, ôn bài cũ). */
  function storeAt(week: number, doneLessons: string[]): ProgressStore {
    const st = store();
    for (const w of WEEKS) if (w.week < week) for (const l of w.lessons) st.markLessonCompleted(l.id);
    doneLessons.forEach((id) => st.markLessonCompleted(id));
    st.setCurrentWeek(week);
    // vài buổi cũ → tư thế rút gọn, ôn bài cũ có ứng viên
    for (let i = 0; i < 4; i++) st.finishSession(st.startSession(WEEKS[Math.max(0, week - 3)].lessons[0].id).id);
    return st;
  }

  it(`mọi bài của mọi tuần: ≤ ${MAX_SESSION_STEPS} màn — buổi đầu tiên của bài và khi học lại (cả khi bật "Ôn bài cũ")`, () => {
    expect(MAX_SESSION_STEPS).toBe(7);
    const counts: string[] = [];
    for (const w of WEEKS) {
      const done: string[] = [];
      for (const l of w.lessons) {
        for (const rng of [() => 0.1, () => 0.7]) {
          const st = storeAt(w.week, done);
          const plan = buildSessionPlan(l, st.get(), { songReview: true, rng, now: new Date(2026, 9, 20) });
          expect(plan.length, `${l.id}: ${plan.map((x) => x.kind).join(',')}`).toBeLessThanOrEqual(MAX_SESSION_STEPS);
          // Màn kết luôn là bước cuối; hoạt động của bài không bao giờ bị cắt
          expect(plan[plan.length - 1].kind).toBe('closing');
          expect(plan.filter((x) => x.kind === 'activity')).toHaveLength(l.activities.length);
          counts.push(`${l.id}:${plan.length}`);
        }
        done.push(l.id);
      }
    }
    expect(counts.length).toBeGreaterThan(100);
  });

  it('ước lượng mỗi buổi ≤ 12 phút (bộ ba lượt chờ → nhịp → băng chuyền đã được tách)', () => {
    for (const w of WEEKS) for (const l of w.lessons) expect(estimateLessonMinutes(l), l.id).toBeLessThanOrEqual(12);
    // Không còn bài nào có ≥ 3 lượt cùng một bài hát (trừ bài tách tay: tay phải, tay trái, hai tay…)
    for (const w of WEEKS)
      for (const l of w.lessons) {
        const per = new Map<string, number>();
        for (const a of l.activities) if (a.kind === 'song' && !a.hand) per.set(a.songId, (per.get(a.songId) ?? 0) + 1);
        for (const [id, n] of per) expect(n, `${l.id} ${id}`).toBeLessThanOrEqual(2);
      }
  });

  it('bỏ khởi động tai/đọc nốt khi bài có ≥ 3 lượt bài hát (trừ tuần chấm bằng khởi động)', () => {
    for (const w of WEEKS) {
      if (!w.warmup) continue;
      for (const l of w.lessons) {
        const songs = l.activities.filter((a) => a.kind === 'song').length;
        if (songs < 3) continue;
        const st = storeAt(w.week, w.lessons.filter((x) => x !== l).map((x) => x.id));
        const hasWarm = buildSessionPlan(l, st.get()).some((x) => x.kind === 'quiz' && x.warmup);
        expect(hasWarm, l.id).toBe(w.criterion.who === 'APP');
      }
    }
  });

  it('"Ôn bài cũ": bài có móc kép (tốc độ mặc định 40) mở ở tốc độ 40', () => {
    // Tuần 21: ứng viên ôn là bài tuần 17–19 — gồm bài có móc kép (Lý cây đa, Thỏ con, Bắc kim thang…)
    let seen40 = false;
    for (let k = 0; k < 30; k++) {
      const st = storeAt(21, []);
      let x = k + 1;
      const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      const plan = buildSessionPlan(weekPlan(21).lessons[0], st.get(), { songReview: true, rng, now: new Date(2026, 9, 20) });
      const rs = plan.find((p) => p.kind === 'review-song');
      if (!rs || rs.kind !== 'review-song') continue;
      const t = findTune(rs.songId)!;
      if (t.bpm <= 40) {
        expect(rs.bpm, rs.songId).toBe(40);
        seen40 = true;
      } else expect(rs.bpm).toBeGreaterThanOrEqual(50);
    }
    expect(seen40).toBe(true);
  });

  it('tách tay sẵn ở bài hai tay đầu các tuần hai tay: chờ tay phải → chờ tay trái (CÂU KHÓ) → hai tay cả bài', () => {
    const lessonsWithHands = WEEKS.flatMap((w) => w.lessons).filter((l) => l.activities.some((a) => a.kind === 'song' && a.hand));
    const weeks = [...new Set(lessonsWithHands.map((l) => l.week))];
    for (const w of [12, 13, 22, 23, 27, 28]) expect(weeks, `tuần ${w}`).toContain(w);
    for (const l of lessonsWithHands) {
      const songs = l.activities.filter((a) => a.kind === 'song');
      const id = songs.find((a) => a.kind === 'song' && a.hand === 'RH')!;
      if (id.kind !== 'song') throw new Error();
      expect(findTune(id.songId)?.hand, l.id).toBe('BOTH');
      const seq = songs.filter((a) => a.kind === 'song' && a.songId === id.songId).map((a) => (a.kind === 'song' ? `${a.mode}:${a.hand ?? 'BOTH'}` : ''));
      expect(seq.slice(0, 3), l.id).toEqual(['wait:RH', 'wait:LH', 'wait:BOTH']);
    }
  });

  it('chơi thử 2026-10-06: tách tay chỉ trên MỘT câu khó (nhiều nốt + bước nhảy nhất), hai tay thì cả bài', () => {
    const lessonsWithHands = WEEKS.flatMap((w) => w.lessons).filter((l) => l.activities.some((a) => a.kind === 'song' && a.hand));
    expect(lessonsWithHands.map((l) => l.id).sort()).toEqual(['w12-l1', 'w13-l1', 'w22-l2', 'w23-l4', 'w27-l2', 'w28-l1']);
    /** Độ khó một câu: số nốt hai tay + số bước nhảy (≥ quãng 3 thứ) mỗi tay */
    const hardness = (songId: string, [a, b]: [number, number]) => {
      const t = slice(findTune(songId)!, a, b);
      const score = (v: typeof t.notes) => {
        const ms = v.filter((n) => !n.rest).map((n) => pitchToMidi(n.pitch!));
        return ms.length + ms.slice(1).filter((m, i) => Math.abs(m - ms[i]) >= 3).length;
      };
      return score(t.notes) + score(t.lh ?? []);
    };
    for (const l of lessonsWithHands) {
      const songs = l.activities.flatMap((a) => (a.kind === 'song' ? [a] : []));
      const apart = songs.filter((a) => a.hand);
      expect(apart.map((a) => a.hand), l.id).toEqual(['RH', 'LH']);
      const phrase = apart[0].phrase!;
      expect(phrase, l.id).toBeTruthy();
      expect(apart[1].phrase, l.id).toEqual(phrase);
      const ranges = phraseRanges(findTune(apart[0].songId)!);
      expect(ranges.length, l.id).toBeGreaterThan(1);
      expect(ranges, l.id).toContainEqual(phrase);
      const best = Math.max(...ranges.map((r) => hardness(apart[0].songId, r)));
      expect(hardness(apart[0].songId, phrase), `${l.id} chọn câu khó nhất`).toBe(best);
      // Hai tay: CẢ BÀI (không câu)
      for (const a of songs.filter((x) => !x.hand && x.songId === apart[0].songId)) expect(a.phrase, l.id).toBeUndefined();
      expect(songs.some((a) => !a.hand && a.songId === apart[0].songId && a.mode === 'wait'), l.id).toBe(true);
    }
  });
});
