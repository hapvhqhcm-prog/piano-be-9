import { describe, expect, it } from 'vitest';
import { LEVELS, MAX_SESSION_STEPS, MAX_WEEK, WEEKS, buildSessionPlan, estimateLessonMinutes, weekPassed } from '../src/lessons/lessonEngine';
import { MAIN_TEMPO_SONG } from '../src/lessons/challenges';
import { findTune } from '../src/music/exercises';
import { SONGS } from '../src/music/tune';
import { migrate, migrateCurriculum, renumberIdRev5, rev5Week } from '../src/progress/migrations';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import { CURRICULUM_REV, defaultData, validateAppData, type SongRun } from '../src/progress/schema';
import { fixtureWeek4Child } from './fixtures/week4Child';

/**
 * (2026-10-17, OWNER duyệt — rà soát giáo viên dài hạn) giáo trình rev 5:
 *  1. Tuần ÔN & BIỂU DIỄN 27 · 32 · 38 (đánh bóng 3 bài cũ, không học gì mới) + "🎤 Buổi diễn nhỏ" ~4 tuần một lần.
 *  2. Bớt "Bài ca niềm vui" làm tiêu chí: còn tuần 6 · 14 · 16 (sợi chỉ "một bài, nhiều giọng"); 8 · 12 · 17 · 22 đổi bài.
 *  3. Nhạc công nhỏ: dịch giọng, đệm hợp âm I – V7, song tấu với thầy, đàn theo tai (tests/musician.test.ts).
 * AN TOÀN TIẾN ĐỘ: bé thật đang ở tuần 4–5 — tuần 1–5 y nguyên; tuần 1–26 không đổi số; dữ liệu cũ đánh số lại MỘT lần.
 */

/** Bài học + hoạt động tuần 1–5 trước đợt này (bé thật có tiến độ "<bài>#<i>" ở đây) — phải y nguyên. */
const BEFORE_1_5: Record<string, string[]> = {"w1-l1":["notes:w1-b1","notes:w1-b1b"],"w1-l2":["notes:w1-b2","notes:w1-b3"],"w1-l3":["notes:w1-b4","notes:w1-detective","theory"],"w1-l4":["notes:w1-b5a","notes:w1-b5b"],"w1-test":["notes:w1-test-c4"],"w2-l1":["notes:w2-l1-a","notes:w2-l1-b"],"w2-l2":["notes:w2-echo","rhythm"],"w2-l3":["song:hot_cross_buns@wait","song:three_chicks@wait"],"w3-l1":["notes:w3-l1-a","notes:w3-stairs"],"w3-l2":["quiz:stepskip","notes:w3-skips","notes:w3-echo3"],"w3-l3":["song:mary_lamb@wait","song:snail_stroll@wait"],"w3-l4":["song:au_clair@wait","improv:black-keys"],"w4-l1":["rhythm"],"w4-l2":["song:ex_c_quarter@tempo","song:ex_cde_walk@tempo"],"w4-l3":["song:hot_cross_buns@tempo","song:choo_choo_train@wait","song:choo_choo_train@tempo"],"w4-l4":["song:go_tell_aunt_rhody@wait","song:go_tell_aunt_rhody@tempo","song:lightly_row@wait","improv:black-keys","theory"],"w5-l1":["song:frog_hop@wait","song:frog_hop@tempo","theory"],"w5-l2":["song:raindrops@wait","song:raindrops@tempo","theory"],"w5-l3":["dynamics","song:paper_boat@wait","improv:black-keys"],"w5-l4":["notes:w5-echo","song:lightly_row@tempo","song:lightly_row@tempo","theory"]};

/** Mã bài tuần 6–26 trước đợt này — giữ nguyên (đợt này chỉ THÊM bài mới vào cuối tuần, đổi bài tiêu chí). */
const BEFORE_6_26 = ["w6-l1","w6-l2","w6-l3","w6-l4","w7-l1","w7-l2","w7-l3","w7-l4","w8-l1","w8-l2","w8-l3","w8-l4","w9-l1","w9-l2","w9-l3","w9-l4","w10-l1","w10-l2","w10-l3","w10-g","w10-stage","w11-l1","w11-l2","w11-l3","w11-l4","w12-l1","w12-stac","w12-l3","w13-l1","w13-l2","w13-l3","w13-l4","w14-l1","w14-l2","w14-l3","w14-l4","w15-l1","w15-l2","w15-l3","w15-l4","w16-l1","w16-l2","w16-l3","w16-l4","w17-l1","w17-l2","w17-l4","w18-l1","w18-l2","w18-tt","w19-l1","w19-bkt","w19-l3","w20-l1","w20-l2","w20-l3","w21-l1","w21-stage","w22-l1","w22-l2","w22-l3","w22-l4","w23-l1","w23-l2","w23-l3","w23-l4","w24-l1","w24-l2","w24-ngua","w25-l1","w25-ninja","w26-l1","w26-l2","w26-l3"];

/** Mã bài tuần 27–43 của rev 4 (giáo trình 43 tuần) — mỗi mã đánh số lại (renumberIdRev5) vẫn là một bài của rev 5. */
const REV4_27_43 = [
  'w27-l1', 'w27-l2', 'w27-l3', 'w28-l1', 'w28-l2', 'w29-l1', 'w29-l2', 'w30-l1', 'w30-l2', 'w31-stage',
  ...[32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42].flatMap((w) => [1, 2, 3].map((k) => `w${w}-l${k}`)),
  'w43-stage',
];
/** Bài đặc trưng của tuần rev 4 → nay ở tuần rev5Week(…) */
const SIGNATURE_REV4: Record<number, string> = {
  27: 'canon', 28: 'saints_both', 29: 'minuet_g', 30: 'fur_elise', 32: 'scale_g_rh', 33: 'scale_f_rh', 34: 'scale_d_rh', 35: 'arpeggio_g',
  36: 'sonatina_c', 37: 'minuet_f', 38: 'silent_night_ped', 39: 'boat_song_68', 40: 'waves_andante', 41: 'korobeiniki', 42: 'greensleeves',
};

const sig = (a: (typeof WEEKS)[number]['lessons'][number]['activities'][number]) =>
  a.kind === 'song'
    ? `song:${a.songId}@${a.mode}${a.hand ?? ''}${a.phrase ? 'P' : ''}`
    : a.kind === 'notes'
      ? `notes:${a.segment.id}`
      : a.kind === 'quiz'
        ? `quiz:${a.quiz.variant}`
        : a.kind === 'improv'
          ? `improv:${a.mode}`
          : a.kind;
const lessonsOf = (w: number) => WEEKS[w - 1].lessons;
const ON_WEEKS = [27, 32, 38];

describe('bản đồ tuần rev 5 (46 tuần)', () => {
  it('46 tuần, 4 cấp liền nhau: 1–10 · 11–21 · 22–33 · 34–46; huy chương 10 / 21 / 33 / 46', () => {
    expect(CURRICULUM_REV).toBe(5);
    expect(MAX_WEEK).toBe(46);
    expect(WEEKS.map((w) => w.week)).toEqual(Array.from({ length: 46 }, (_, i) => i + 1));
    expect(LEVELS.map((l) => l.weeks)).toEqual([[1, 10], [11, 21], [22, 33], [34, 46]]);
    for (const w of [10, 21, 33, 46]) expect(lessonsOf(w).some((l) => l.activities.some((a) => a.kind === 'stage')), `tuần ${w}`).toBe(true);
  });

  it('rev5Week: 1–26 giữ nguyên · 27–30 +1 · 31–35 +2 · 36–43 +3; mọi bài rev 4 tuần 27–43 vẫn có, đúng tuần mới', () => {
    expect([1, 26, 27, 30, 31, 35, 36, 43].map(rev5Week)).toEqual([1, 26, 28, 31, 33, 37, 39, 46]);
    for (const id of REV4_27_43) {
      const now = renumberIdRev5(id);
      const w = Number(now.slice(1).split('-')[0]);
      expect(lessonsOf(w).some((l) => l.id === now), `${id} → ${now}`).toBe(true);
    }
    for (const [old, songId] of Object.entries(SIGNATURE_REV4)) {
      const w = rev5Week(Number(old));
      const songs = lessonsOf(w).flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : [])));
      expect(songs, `tuần rev 4 ${old} → ${w}`).toContain(songId);
      // tuần của bài hát (Thư viện mở theo tuần) cũng đánh số lại
      expect(findTune(songId)!.week, songId).toBe(w);
    }
    // tuần ôn không có tuần rev 4 tương ứng
    for (const w of ON_WEEKS) expect(Array.from({ length: 43 }, (_, i) => rev5Week(i + 1))).not.toContain(w);
  });

  it('tuần ÔN 27 · 32 · 38: "không học gì mới" — chỉ bài cũ (đánh bóng + bản thu + buổi diễn nhỏ), không bài hát mới, không thẻ nhạc lý mới', () => {
    for (const w of ON_WEEKS) {
      const plan = WEEKS[w - 1];
      expect(plan.title).toMatch(/Ôn & biểu diễn/);
      expect(SONGS.filter((s) => s.week === w), `tuần ${w}`).toEqual([]);
      const acts = plan.lessons.flatMap((l) => l.activities);
      for (const a of acts) {
        expect(['musician', 'song', 'notes'], `tuần ${w}: ${a.kind}`).toContain(a.kind);
        if (a.kind === 'song') expect(findTune(a.songId)!.week!, a.songId).toBeLessThan(w);
        if (a.kind === 'notes') expect(a.segment.id).toBe(`w${w}-handcheck`);
      }
      expect(acts.filter((a) => a.kind === 'musician' && a.task.type === 'polish')).toHaveLength(3);
      expect(plan.lessons.some((l) => l.id === `w${w}-recital`)).toBe(true);
      expect(plan.warmup?.variant).toBe('theory');
      expect(plan.criterionSpec?.spread).toBe(true);
      expect(plan.criterionSpec!.songs).toHaveLength(3);
      // tuần ôn ĐÚNG chỗ: sau chuỗi tuần mới, trước Đại hòa nhạc Cấp 3 / trước bass Alberti
      expect(WEEKS[w - 2].criterionSpec?.spread).not.toBe(true);
    }
    expect(WEEKS[32].title).toMatch(/hòa nhạc/i); // 33 sau tổng duyệt 32
    expect(WEEKS[38].title).toMatch(/Alberti/); // 39 sau tuần ôn 38
  });

  it('tiêu chí tuần ôn: mỗi bài đạt ≥ 1 lần THEO NHỊP ≥ 60, trải trên ≥ 2 ngày', () => {
    let d = 10;
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, d, 17));
    const run = (songId: string, o: Partial<SongRun> = {}): Omit<SongRun, 'ts'> => ({
      songId, mode: 'tempo', level: 2, bpm: 60, hints: 'staff', phrase: null, total: 20, hits: 20, source: 'mic', passed: true, ...o,
    });
    const w = WEEKS[26];
    const [a, b, c] = w.criterionSpec!.songs.map((x) => x.songId);
    st.addSongRun(st.startSession('w27-l1').id, run(a));
    st.addSongRun(st.startSession('w27-l2').id, run(b));
    st.addSongRun(st.startSession('w27-l3').id, run(c, { bpm: 50 })); // chậm quá
    expect(weekPassed(27, st.get())).toBe(false);
    d = 11;
    st.addSongRun(st.startSession('w27-l3').id, run(c));
    expect(weekPassed(27, st.get())).toBe(true);
  });
});

describe('AN TOÀN TIẾN ĐỘ (bé thật ở tuần 4–5)', () => {
  it('tuần 1–5: mã bài & hoạt động Y NGUYÊN (không chèn, không đổi chỉ số)', () => {
    const now: Record<string, string[]> = {};
    for (const w of WEEKS.slice(0, 5)) for (const l of w.lessons) now[l.id] = l.activities.map(sig);
    expect(now).toEqual(BEFORE_1_5);
  });

  it('tuần 6–26: mọi mã bài cũ còn nguyên, cùng tuần, cùng thứ tự; bài mới chỉ THÊM (mã mới)', () => {
    const ids = WEEKS.slice(5, 26).flatMap((w) => w.lessons.map((l) => l.id));
    expect(ids.filter((id) => BEFORE_6_26.includes(id))).toEqual(BEFORE_6_26);
    for (const id of ids.filter((x) => !BEFORE_6_26.includes(x))) expect(id).toMatch(/^w\d+-(duet|ear|transpose|recital|v7|camel)$/);
  });

  it('dữ liệu bé tuần 4 (rev 4) qua migration: Y NGUYÊN, chỉ curriculumRev → 5', () => {
    const raw = JSON.parse(JSON.stringify(fixtureWeek4Child(new Date(2026, 9, 17)))) as Record<string, unknown>;
    raw.curriculumRev = 4;
    const d = migrate(JSON.parse(JSON.stringify(raw)));
    expect(validateAppData(d)).toEqual([]);
    expect(d.curriculumRev).toBe(5);
    expect(d.progress).toEqual(raw.progress);
    expect(d.sessions).toEqual(raw.sessions);
    expect(d.history ?? null).toEqual((raw.history as unknown) ?? null);
  });

  it('rev 4 → 5 đánh số lại MỌI chỗ lưu số tuần (bài, buổi, giữ tuần, buổi diễn, lịch sử gộp, hàng chờ); "#i" giữ; idempotent', () => {
    const raw = JSON.parse(JSON.stringify(defaultData(new Date(2026, 9, 17)))) as Record<string, unknown>;
    raw.curriculumRev = 4;
    raw.progress = { currentWeek: 36, lessonsCompleted: ['w5-l1#2', 'w26-l3', 'w27-l1', 'w31-stage', 'w36-l2#1', 'w43-l1'], practiceDays: {} };
    const sess = (id: string, lessonId: string) => ({
      id, date: '2026-10-01', lessonId, parentAssessments: [], appAssessments: [], micAssessments: [], songRuns: [], selfRating: null,
      startedAt: 1, endedAt: 2, minutes: 5, completed: true, checklist: {},
    });
    raw.sessions = [sess('a', 'w30-l2'), sess('b', 'w33-song-falling_leaves'), sess('c', 'w43-daily'), sess('d', 'w4-l2')];
    (raw.settings as Record<string, unknown>).holdWeek = 36;
    raw.concerts = [{ id: 'c1', date: '2026-10-01', ts: 1, week: 30, songId: 'fur_elise', reactions: { clap: 1, heart: 0, star: 0 }, audience: [] }];
    const out = migrateCurriculum(raw);
    expect(out.curriculumRev).toBe(5);
    const p = out.progress as { currentWeek: number; lessonsCompleted: string[] };
    expect(p.currentWeek).toBe(39);
    expect(p.lessonsCompleted).toEqual(['w5-l1#2', 'w26-l3', 'w28-l1', 'w33-stage', 'w39-l2#1', 'w46-l1']);
    expect((out.sessions as Array<{ lessonId: string }>).map((s) => s.lessonId)).toEqual(['w31-l2', 'w35-song-falling_leaves', 'w46-daily', 'w4-l2']);
    expect((out.settings as { holdWeek: number }).holdWeek).toBe(39);
    expect((out.concerts as Array<{ week: number }>)[0].week).toBe(31);
    // lịch sử gộp (compaction) + hàng chờ bố mẹ xem
    const h = {
      weekFirst: { '4': '2026-09-01', '28': '2026-09-02', x: '2026-09-03' },
      passedWeeks: [3, 27, 31, 40],
      stickers: ['island-3', 'island-36', 'medal-3', 'songs-10'],
      bonusStubs: [{ id: 's', date: '2026-09-01', lessonId: 'w35-l1', t: 1 }],
    };
    const out2 = migrateCurriculum({ ...raw, history: h, reviews: [{ id: 'r', lessonId: 'w42-l2' }, { id: 'r2' }] }) as Record<string, any>;
    expect(out2.history.weekFirst).toEqual({ '4': '2026-09-01', '29': '2026-09-02', x: '2026-09-03' });
    expect(out2.history.passedWeeks).toEqual([3, 28, 33, 43]);
    expect(out2.history.stickers).toEqual(['island-3', 'island-39', 'medal-3', 'songs-10']);
    expect(out2.history.bonusStubs[0].lessonId).toBe('w37-l1');
    expect(out2.reviews.map((r: { lessonId?: string }) => r.lessonId)).toEqual(['w45-l2', undefined]);
    // chạy lại: không đổi gì (cùng object)
    expect(migrateCurriculum(out2)).toBe(out2);
  });
});

describe('bớt "Bài ca niềm vui" làm tiêu chí', () => {
  it('chỉ còn tuần 6 · 14 · 16 (cùng một bài ở 3 giọng: Đô, Sol, Rê); tuần 8 · 12 · 17 · 22 dùng bài khác cùng kỹ năng', () => {
    const odeWeeks = WEEKS.filter((w) => /Bài ca niềm vui/.test(w.criterion.text)).map((w) => w.week);
    expect(odeWeeks).toEqual([6, 14, 16]);
    const main = Object.entries(MAIN_TEMPO_SONG).filter(([, v]) => v.songId.startsWith('ode_to_joy')).map(([w]) => Number(w));
    expect(main).toEqual([6, 14, 16]);
    expect(MAIN_TEMPO_SONG[8].songId).toBe('jingle_bells');
    expect(MAIN_TEMPO_SONG[12].songId).toBe('hot_cross_buns_both');
    expect(MAIN_TEMPO_SONG[17].songId).toBe('camel_walk');
    expect(MAIN_TEMPO_SONG[22].songId).toBe('twinkle_both');
    // bài thay cùng kỹ năng: tuần 8 bài tuần 6 thế Đô nhìn khuông; 12 hai tay cùng lúc; 17 có đen chấm dôi; 22 tay trái hợp âm
    expect(findTune('jingle_bells')!.week).toBe(6);
    expect(findTune('hot_cross_buns_both')!.lh!.length).toBeGreaterThan(0);
    expect(findTune('camel_walk')!.notes.some((n) => n.beats === 1.5)).toBe(true);
    expect(findTune('twinkle_both')!.lh!.some((n) => (n.also ?? []).length >= 1)).toBe(true);
  });
});

describe('nhạc công nhỏ & buổi diễn nhỏ trong giáo trình', () => {
  it('🎤 Buổi diễn nhỏ ~4 tuần một lần (cùng huy chương cuối cấp: không quá 5 tuần không biểu diễn từ tuần 10)', () => {
    const recitals = WEEKS.filter((w) => w.lessons.some((l) => l.id === `w${w.week}-recital`)).map((w) => w.week);
    expect(recitals).toEqual([15, 18, 25, 27, 32, 38, 42]);
    const shows = [...new Set([...recitals, 10, 21, 33, 46])].sort((a, b) => a - b);
    for (let i = 1; i < shows.length; i++) expect(shows[i] - shows[i - 1], `sau tuần ${shows[i - 1]}`).toBeLessThanOrEqual(5);
  });

  it('mọi bài có hoạt động nhạc công / song tấu: buổi ≤ ~12 phút, ≤ 7 màn', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 17));
    for (const w of WEEKS)
      for (const l of w.lessons) {
        const fresh = l.activities.some((a) => a.kind === 'musician' || (a.kind === 'song' && findTune(a.songId)?.duet));
        if (!fresh) continue;
        st.setCurrentWeek(w.week);
        expect(estimateLessonMinutes(l), l.id).toBeLessThanOrEqual(12);
        expect(buildSessionPlan(l, st.get()).length, l.id).toBeLessThanOrEqual(MAX_SESSION_STEPS);
      }
  });

  it('song tấu từ tuần 6 (Cấp 1 → Cấp 3), đàn theo tai từ tuần 9, dịch giọng từ tuần 14 (thế Sol), V7 tuần 24', () => {
    const at = (pred: (l: (typeof WEEKS)[number]['lessons'][number]) => boolean) =>
      WEEKS.flatMap((w) => w.lessons).filter(pred).map((l) => l.week);
    const duets = at((l) => l.activities.some((a) => a.kind === 'song' && !!findTune(a.songId)?.duet));
    expect(duets).toEqual([6, 9, 14, 20, 30]);
    expect(Math.min(...at((l) => l.activities.some((a) => a.kind === 'musician' && a.task.type === 'by-ear')))).toBe(9);
    expect(Math.min(...at((l) => l.activities.some((a) => a.kind === 'musician' && a.task.type === 'transpose')))).toBe(14);
    expect(Math.min(...at((l) => l.activities.some((a) => a.kind === 'musician' && a.task.type === 'accompany')))).toBe(24);
  });
});
