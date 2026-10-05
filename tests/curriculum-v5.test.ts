import { describe, expect, it } from 'vitest';
import { LEVELS, WEEKS, estimateLessonMinutes, weekPassed } from '../src/lessons/lessonEngine';
import type { Activity, Lesson, RhythmSymbol, TechniqueDrill } from '../src/lessons/types';
import { findTune } from '../src/music/exercises';
import { gradeTiming, TIMING_WINDOWS } from '../src/music/timing';
import { SONGS, allTimed, type Tune } from '../src/music/tune';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import type { SongRun } from '../src/progress/schema';
import { SYMBOL } from '../src/ui/screens/rhythm';

/**
 * GIÁO TRÌNH v5 (OWNER duyệt 2026-10-05) — theo rà soát của chuyên gia sư phạm:
 * nhịp dạy TRƯỚC bài dùng nhịp đó, đọc nhạc theo nốt mốc & quãng, kỹ thuật, sáng tạo, tiêu chí 2 ngày, ~30 tuần, buổi ≤ 15'.
 */

/** Mọi bài học theo đúng thứ tự giáo trình, kèm vị trí (tuần, thứ tự bài). */
const ORDERED: Array<{ week: number; idx: number; lesson: Lesson }> = WEEKS.flatMap((w) => w.lessons.map((lesson, idx) => ({ week: w.week, idx, lesson })));
const pos = (x: { week: number; idx: number }) => x.week * 100 + x.idx;
const acts = (l: Lesson) => l.activities;

/** Vị trí bài ĐẦU TIÊN có hoạt động thỏa `pred`. */
function firstWhere(pred: (a: Activity) => boolean): { week: number; idx: number } {
  const hit = ORDERED.find((x) => acts(x.lesson).some(pred));
  if (!hit) throw new Error('không tìm thấy');
  return hit;
}
const rhythmHas = (sym: RhythmSymbol) => (a: Activity) => a.kind === 'rhythm' && a.patterns.some((p) => p.includes(sym));
const patternBeats = (p: RhythmSymbol[]) => p.reduce((s, x) => s + SYMBOL[x].beats, 0);

/** Mọi lần bài hát xuất hiện trong bài học: vị trí + chế độ. */
function songUses(id: string): Array<{ week: number; idx: number; mode: 'wait' | 'tempo' }> {
  return ORDERED.flatMap((x) => acts(x.lesson).flatMap((a) => (a.kind === 'song' && a.songId === id ? [{ week: x.week, idx: x.idx, mode: a.mode }] : [])));
}

/** Đặc điểm nhịp của một bài (theo từng bè). */
function features(t: Tune) {
  const f = { eighth: false, sixteenth: false, dotted8: false, dottedQ: false, sync: false };
  for (const v of [t.notes, t.lh ?? []]) {
    let s = 0;
    for (const n of v) {
      if (!n.rest) {
        if (n.beats === 0.5) f.eighth = true;
        if (n.beats < 0.5) f.sixteenth = true;
        if (n.beats === 0.75) f.dotted8 = true;
        if (n.beats === 1.5) f.dottedQ = true;
        // Nghịch phách: nốt bắt đầu lệch phách và vắt qua phách sau
        if (s % 1 > 1e-9 && s + n.beats > Math.ceil(s) + 1e-9) f.sync = true;
      }
      s += n.beats;
    }
  }
  return f;
}

describe('cấu trúc 30 tuần', () => {
  it('tổng số tuần 28–32; 3 cấp, mỗi cấp ~10 tuần, liền nhau', () => {
    expect(WEEKS.length).toBeGreaterThanOrEqual(28);
    expect(WEEKS.length).toBeLessThanOrEqual(32);
    expect(LEVELS[0].weeks[0]).toBe(1);
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].weeks[0]).toBe(LEVELS[i - 1].weeks[1] + 1);
    expect(LEVELS[LEVELS.length - 1].weeks[1]).toBe(WEEKS.length);
    for (const l of LEVELS) expect(l.weeks[1] - l.weeks[0] + 1).toBeGreaterThanOrEqual(9);
  });

  it('tuần 1 giữ nguyên nội dung (B1–B5 + thử thách Đô giữa)', () => {
    expect(WEEKS[0].lessons.map((l) => l.id)).toEqual(['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4', 'w1-test']);
  });

  it('Minuet & Für Elise ở cuối Cấp 3, sau ≥ 6 tuần chuẩn bị của Cấp 3', () => {
    const l3 = LEVELS[2];
    for (const id of ['minuet_g', 'fur_elise']) {
      const uses = songUses(id);
      expect(uses.length).toBeGreaterThan(0);
      for (const u of uses) {
        expect(u.week).toBeGreaterThanOrEqual(l3.weeks[0] + 6);
        expect(u.week).toBeLessThan(l3.weeks[1]);
      }
      expect(findTune(id)!.week).toBeGreaterThanOrEqual(l3.weeks[1] - 3);
    }
  });

  it('có tuần CỦNG CỐ: ≥ 3 tuần mới với ≥ 3 bài tự sáng tác mỗi tuần', () => {
    const consolidation = WEEKS.filter((w) => {
      const songs = new Set(w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : []))));
      return [...songs].filter((id) => findTune(id)?.arrangementBy?.includes('tự sáng tác')).length >= 3;
    });
    expect(consolidation.map((w) => w.week).length).toBeGreaterThanOrEqual(3);
  });

  it('giữ đủ 56 bài cũ + 14 bài tự sáng tác mới', () => {
    const NEW = ['three_chicks', 'frog_hop', 'raindrops', 'paper_boat', 'school_drum', 'ferry_song', 'bell_tower', 'two_friends',
      'echo_valley', 'rabbit_run', 'cyclo_ride', 'grand_duet', 'stepping_stones', 'lantern_parade'];
    for (const id of NEW) {
      const t = SONGS.find((s) => s.id === id);
      expect(t, id).toBeDefined();
      expect(t!.arrangementBy).toContain('tự sáng tác');
      expect(songUses(id).length, id).toBeGreaterThan(0);
    }
    expect(SONGS.length).toBe(56 + NEW.length);
  });

  it('mục tiêu cuối nói thật: ≈ Faber cấp 1 / đầu cấp 2', () => {
    expect(LEVELS[2].goal).toMatch(/Faber cấp 1/);
  });
});

describe('NHỊP: dạy trước, dùng sau', () => {
  const runAt = firstWhere(rhythmHas('run'));
  const sixteenthAt = firstWhere((a) => rhythmHas('run4')(a) || rhythmHas('run3')(a));
  const dotted8At = firstWhere(rhythmHas('dotted8'));
  const syncAt = firstWhere(rhythmHas('sync'));
  const tieAt = firstWhere(rhythmHas('tie'));
  const dottedAt = firstWhere(rhythmHas('dotted'));
  const twoFourAt = firstWhere((a) => a.kind === 'rhythm' && a.patterns.some((p) => patternBeats(p) === 2));
  const threeFourAt = firstWhere((a) => a.kind === 'rhythm' && a.patterns.some((p) => p.includes('long3')));

  it('thứ tự: móc đơn → 2/4 → 3/4 → chấm dôi → móc kép; dây nối & nghịch phách được dạy', () => {
    expect(pos(runAt)).toBeLessThan(pos(twoFourAt));
    expect(pos(twoFourAt)).toBeLessThan(pos(threeFourAt));
    expect(pos(dottedAt)).toBeLessThan(pos(sixteenthAt));
    expect(pos(runAt)).toBeLessThan(pos(sixteenthAt));
    expect(tieAt.week).toBeGreaterThan(0);
    expect(syncAt.week).toBeGreaterThan(0);
  });

  it('mọi bài có MÓC KÉP chỉ xuất hiện sau bài dạy móc kép (và tuần của bài ≥ tuần dạy)', () => {
    const songs = SONGS.filter((t) => features(t).sixteenth);
    expect(songs.map((t) => t.id)).toEqual(expect.arrayContaining(['ly_cay_da', 'bac_kim_thang', 'ly_cay_bong', 'rabbit_run']));
    for (const t of songs) {
      expect(t.week!, t.id).toBeGreaterThanOrEqual(sixteenthAt.week);
      for (const u of songUses(t.id)) expect(pos(u), `${t.id} @ tuần ${u.week}`).toBeGreaterThanOrEqual(pos(sixteenthAt));
    }
  });

  it('móc đơn chấm + móc kép ("Tập-tễnh") và nghịch phách: bài chỉ sau bài dạy', () => {
    for (const t of SONGS) {
      const f = features(t);
      for (const u of songUses(t.id)) {
        if (f.dotted8) expect(pos(u), t.id).toBeGreaterThanOrEqual(pos(dotted8At));
        if (f.sync) expect(pos(u), t.id).toBeGreaterThanOrEqual(pos(syncAt));
        if (f.dottedQ) expect(pos(u), t.id).toBeGreaterThanOrEqual(pos(dottedAt));
      }
    }
    expect(SONGS.some((t) => features(t).sync)).toBe(true); // có bài thực hành nghịch phách
  });

  it('mọi bài 2/4 chỉ xuất hiện sau bài nhịp 2/4; bài 3/4 sau bài nhịp 3', () => {
    for (const t of SONGS) {
      for (const u of songUses(t.id)) {
        if (t.timeSignature === '2/4') expect(pos(u), t.id).toBeGreaterThanOrEqual(pos(twoFourAt));
        if (t.timeSignature === '3/4') expect(pos(u), t.id).toBeGreaterThanOrEqual(pos(threeFourAt));
      }
      if (t.timeSignature === '2/4') expect(t.week!).toBeGreaterThanOrEqual(twoFourAt.week);
    }
  });

  it('bài có móc đơn chỉ chơi THEO NHỊP sau bài dạy "Chạy-chạy"', () => {
    for (const t of SONGS.filter((x) => features(x).eighth)) {
      for (const u of songUses(t.id)) if (u.mode === 'tempo') expect(pos(u), t.id).toBeGreaterThanOrEqual(pos(runAt));
    }
  });

  it('Lý cây đa KHÔNG còn ở tuần 2 (móc kép trước khi học nhịp)', () => {
    expect(songUses('ly_cay_da').every((u) => u.week >= 18)).toBe(true);
    expect(WEEKS[1].lessons.flatMap((l) => l.activities).some((a) => a.kind === 'song' && a.songId === 'ly_cay_da')).toBe(false);
  });
});

describe('từ vựng nhịp (rhythm.ts SYMBOL) — chấm micro được cho ký hiệu mới', () => {
  const used = new Set(WEEKS.flatMap((w) => w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'rhythm' ? a.patterns.flat() : [])))));

  it('mọi ký hiệu dùng trong bài học đều có trong SYMBOL; tiếng vỗ nằm trong ô, tăng dần', () => {
    for (const s of used) expect(SYMBOL[s], s).toBeDefined();
    for (const [k, v] of Object.entries(SYMBOL)) {
      expect(v.beats, k).toBeGreaterThan(0);
      for (let i = 0; i < v.hits.length; i++) {
        expect(v.hits[i]).toBeGreaterThanOrEqual(0);
        expect(v.hits[i]).toBeLessThan(v.beats);
        if (i) expect(v.hits[i]).toBeGreaterThan(v.hits[i - 1]);
      }
    }
    expect(SYMBOL.run4.hits).toEqual([0, 0.25, 0.5, 0.75]);
    expect(SYMBOL.sync).toMatchObject({ beats: 2, hits: [0, 0.5, 1.5] });
    expect(SYMBOL.tie).toMatchObject({ beats: 2, hits: [0] });
  });

  it('vỗ ĐÚNG lúc → chấm đúng hết (cửa sổ hẹp như màn nhịp); vỗ thiếu một tiếng móc kép → thiếu đúng 1', () => {
    const w = TIMING_WINDOWS.easy;
    for (const s of used) {
      const seq = [s, s];
      const expected: Array<{ index: number; start: number; midi: number }> = [];
      let b = 0;
      for (const x of seq) {
        for (const hb of SYMBOL[x].hits) expected.push({ index: expected.length, start: b + hb, midi: 0 });
        b += SYMBOL[x].beats;
      }
      const heard = expected.map((e) => ({ beat: e.start + 0.05, midi: 0 }));
      const v = gradeTiming(expected, heard, Math.min(w.early, 0.24), Math.min(w.late, 0.26));
      expect(v.every((x) => x.hit), s).toBe(true);
      if (expected.length > 1) {
        const v2 = gradeTiming(expected, heard.slice(1), Math.min(w.early, 0.24), Math.min(w.late, 0.26));
        expect(v2.filter((x) => x.hit).length, s).toBe(expected.length - 1);
      }
    }
  });
});

describe('ĐỌC NHẠC: nốt mốc, quãng, dòng kẻ phụ, khuông lớn', () => {
  type Q = { week: number; quiz: Extract<Activity, { kind: 'quiz' }>['quiz'] };
  const quizzes: Q[] = [
    ...WEEKS.flatMap((w) => (w.warmup ? [{ week: w.week, quiz: w.warmup }] : [])),
    ...ORDERED.flatMap((x) => acts(x.lesson).flatMap((a) => (a.kind === 'quiz' ? [{ week: x.week, quiz: a.quiz }] : []))),
  ];

  it('nốt mốc khóa Sol ở Cấp 1 tuần 7–9; nốt mốc khóa Fa ở tuần ~11', () => {
    const lm = quizzes.filter((q) => q.quiz.variant === 'landmark');
    const treble = lm.filter((q) => q.quiz.clef !== 'bass');
    const bass = lm.filter((q) => q.quiz.clef === 'bass');
    expect(Math.min(...treble.map((q) => q.week))).toBeGreaterThanOrEqual(7);
    expect(Math.min(...treble.map((q) => q.week))).toBeLessThanOrEqual(9);
    expect(treble.some((q) => q.quiz.pool.includes('C4') && q.quiz.pool.includes('G4'))).toBe(true);
    expect(Math.min(...bass.map((q) => q.week))).toBeGreaterThanOrEqual(10);
    expect(Math.min(...bass.map((q) => q.week))).toBeLessThanOrEqual(12);
    expect(bass.some((q) => ['C4', 'F3', 'C3'].every((p) => q.quiz.pool.includes(p)))).toBe(true);
  });

  it('tuần có tiêu chí APP theo TÊN NỐT (tai nghe / đọc nốt) không có trò nốt mốc (câu trả lời cũng là tên nốt — sẽ lẫn vào tiêu chí)', () => {
    for (const w of WEEKS.filter((x) => x.criterion.who === 'APP' && x.warmup?.variant !== 'majorminor')) {
      expect(quizzes.some((q) => q.week === w.week && q.quiz.variant === 'landmark'), `tuần ${w.week}`).toBe(false);
    }
  });

  it('đọc QUÃNG: Cấp 1 tối đa quãng 3; Cấp 2–3 có tới quãng 5; trải nhiều tuần', () => {
    const iv = quizzes.filter((q) => q.quiz.variant === 'interval');
    expect(new Set(iv.map((q) => q.week)).size).toBeGreaterThanOrEqual(5);
    for (const q of iv) {
      expect(q.quiz.maxInterval, `tuần ${q.week}`).toBeDefined();
      if (q.week <= LEVELS[0].weeks[1]) expect(q.quiz.maxInterval!).toBeLessThanOrEqual(3);
    }
    expect(iv.some((q) => q.week <= LEVELS[0].weeks[1])).toBe(true);
    expect(iv.some((q) => q.week >= LEVELS[1].weeks[0] && q.quiz.maxInterval === 5)).toBe(true);
  });

  it('bài DÒNG KẺ PHỤ dạy trước khi bài hát dùng nốt dưới/trên khuông khóa Sol (La3, Si3, La5…)', () => {
    const ledgerLesson = firstWhere((a) => a.kind === 'notes' && a.segment.targets.some((t) => t.staff && (t.keys.includes('A3') || t.keys.includes('B3')) && t.clef !== 'bass'));
    const OUTSIDE = new Set(['A3', 'B3', 'A5', 'B5', 'C6']);
    for (const t of SONGS) {
      const rhOut = allTimed(t).some((n) => n.hand !== 'LH' && n.pitch && OUTSIDE.has(n.pitch));
      if (!rhOut) continue;
      for (const u of songUses(t.id)) expect(pos(u), t.id).toBeGreaterThanOrEqual(pos(ledgerLesson));
    }
  });

  it('đọc KHUÔNG LỚN hai tay (khóa Fa + khóa Sol) trước tuần đọc nhạc hai khóa của Cấp 3', () => {
    const grandWeek = WEEKS.find((w) => w.title.includes('khuông lớn'))!;
    expect(grandWeek).toBeDefined();
    const twoClef = WEEKS.find((w) => w.title.includes('hai khóa'))!;
    expect(grandWeek.week).toBeLessThan(twoClef.week);
    const a = grandWeek.lessons.flatMap((l) => l.activities);
    expect(a.some((x) => x.kind === 'quiz' && x.quiz.clef === 'bass')).toBe(true);
    expect(a.some((x) => x.kind === 'song' && findTune(x.songId)?.hand === 'BOTH')).toBe(true);
  });
});

describe('KỸ THUẬT & SÁNG TẠO', () => {
  const DRILLS: TechniqueDrill[] = ['arm-drop', 'wrist-circle', 'finger-tap', 'five-finger', 'thumb-under', 'hand-shape'];
  const nonStage = WEEKS.filter((w) => !w.lessons.every((l) => l.activities.some((a) => a.kind === 'stage')));

  it('khởi động kỹ thuật ở ĐẦU bài đầu tiên của hầu hết các tuần (≥ 80% tuần có bài thường), drill hợp lệ', () => {
    const withTech = nonStage.filter((w) => {
      const first = w.lessons.find((l) => !l.isWeekTest)!;
      return first.activities[0]?.kind === 'technique';
    });
    expect(withTech.length / nonStage.length).toBeGreaterThanOrEqual(0.8);
    for (const w of WEEKS)
      for (const l of w.lessons)
        l.activities.forEach((a, i) => {
          if (a.kind !== 'technique') return;
          expect(i, l.id).toBe(0); // luôn mở đầu bài
          expect(a.drills.length).toBeGreaterThan(0);
          for (const d of a.drills) expect(DRILLS).toContain(d);
        });
  });

  it('luồn ngón cái bắt đầu 2–3 tuần TRƯỚC tuần gam; giai đoạn đầu chỉ thả tay / xoay cổ tay / tay tròn', () => {
    const scaleWeek = songUses('scale_c_rh')[0].week;
    const thumbWeeks = ORDERED.filter((x) => acts(x.lesson).some((a) => a.kind === 'technique' && a.drills.includes('thumb-under'))).map((x) => x.week);
    const first = Math.min(...thumbWeeks);
    expect(scaleWeek - first).toBeGreaterThanOrEqual(2);
    expect(scaleWeek - first).toBeLessThanOrEqual(3);
    for (let w = first; w <= scaleWeek; w++) expect(thumbWeeks, `tuần ${w}`).toContain(w);
    const early = ORDERED.filter((x) => x.week <= 3).flatMap((x) => acts(x.lesson)).filter((a) => a.kind === 'technique');
    expect(early.length).toBeGreaterThan(0);
    for (const a of early) if (a.kind === 'technique') for (const d of a.drills) expect(['arm-drop', 'wrist-circle', 'hand-shape']).toContain(d);
  });

  it('sáng tạo: phím đen ≥ 2 lần ở Cấp 1; hỏi – đáp cuối Cấp 1 & Cấp 2; sáng tác 4 ô ở Cấp 2 và Cấp 3', () => {
    const imp = ORDERED.flatMap((x) => acts(x.lesson).flatMap((a) => (a.kind === 'improv' ? [{ week: x.week, a }] : [])));
    const lvl = (w: number) => LEVELS.find((l) => w >= l.weeks[0] && w <= l.weeks[1])!.level;
    expect(imp.filter((x) => x.a.mode === 'black-keys' && lvl(x.week) === 1).length).toBeGreaterThanOrEqual(2);
    const qa = imp.filter((x) => x.a.mode === 'question-answer');
    expect(qa.some((x) => lvl(x.week) === 1 && x.week >= LEVELS[0].weeks[1] - 2)).toBe(true);
    expect(qa.some((x) => lvl(x.week) === 2)).toBe(true);
    const comp = imp.filter((x) => x.a.mode === 'compose');
    expect(comp.filter((x) => lvl(x.week) === 2).length).toBeGreaterThanOrEqual(1);
    expect(comp.filter((x) => lvl(x.week) === 3).length).toBeGreaterThanOrEqual(1);
    expect(comp.length).toBeGreaterThanOrEqual(3);
    for (const x of comp) {
      expect(x.a.bars).toBe(4);
      expect(x.a.position).toBeDefined();
    }
    for (const x of imp) expect(x.a.intro.length).toBeGreaterThan(20);
  });
});

describe('BUỔI ≤ 15 phút (ước lượng)', () => {
  it('mọi bài thường ước lượng ≤ 15 phút (kể cả tư thế, ôn nhanh, khởi động, con làm thầy)', () => {
    for (const x of ORDERED) {
      const m = estimateLessonMinutes(x.lesson);
      expect(m, `${x.lesson.id} ≈ ${m}'`).toBeLessThanOrEqual(15);
    }
  });
});

describe('TIÊU CHÍ TUẦN cần 2 NGÀY (bài hát)', () => {
  /** Đồng hồ: ngày 10/10/2026 + k (sau ngày phát hành v5). */
  function clock() {
    let d = 10;
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, d, 17));
    return { st, day: (k: number) => (d = 10 + k) };
  }
  const run = (songId: string, o: Partial<SongRun> = {}): Omit<SongRun, 'ts'> => ({
    songId, mode: 'tempo', level: 2, bpm: 60, hints: 'staff', phrase: null, total: 20, hits: 20, source: 'mic', passed: true, ...o,
  });
  /** Chơi đạt MỌI bài của tuần (và vài đoạn đọc nhạc) trong một ngày. */
  function playWeek(st: ProgressStore, week: number): void {
    const w = WEEKS[week - 1];
    const s = st.startSession(w.lessons[0].id);
    const songs = new Set(w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : []))));
    for (const id of songs) st.addSongRun(s.id, run(id));
    for (let i = 0; i < 5; i++) st.addSongRun(s.id, run('sight:C:RH', { mode: 'wait' }));
  }

  const songWeeks = WEEKS.filter((w) => w.criterion.who === 'PARENT/MIC' && w.week !== 1);

  it('mọi tuần tiêu chí bài hát ghi rõ "2 ngày"; không còn tiêu chí tự đánh giá (SELF)', () => {
    expect(songWeeks.length).toBeGreaterThanOrEqual(15);
    for (const w of songWeeks) expect(w.criterion.text, `tuần ${w.week}`).toMatch(/2 ngày/);
    expect(WEEKS.some((w) => w.criterion.who === 'SELF')).toBe(false);
  });

  it.each(songWeeks.map((w) => w.week))('tuần %i: đạt mọi bài trong MỘT ngày → chưa qua; thêm ngày thứ hai → qua', (week) => {
    const { st, day } = clock();
    playWeek(st, week);
    playWeek(st, week); // cùng ngày, hai buổi
    expect(weekPassed(week, st.get())).toBe(false);
    day(1);
    playWeek(st, week);
    expect(weekPassed(week, st.get())).toBe(true);
  });

  it('tuần 2: tiêu chí là bằng chứng "Bánh nóng" (micro / phiếu 3 ý), không phải bé tự chọn', () => {
    expect(WEEKS[1].criterion.who).toBe('PARENT/MIC');
    expect(WEEKS[1].criterion.text).toContain('Bánh nóng');
  });
});
