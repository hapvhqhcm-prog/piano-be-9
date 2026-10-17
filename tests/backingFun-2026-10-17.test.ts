/**
 * (+ 2026-10-17, OWNER duyệt "Nhạc đệm + bài vui hơn"):
 * - bài QUEN không mở dưới 56 (chậm 40–50 chỉ cho bài mới; nhẹ tay chỉ kéo bài mới) — songStats.startTempoBpm;
 * - "Ếch con nhảy" (ex_c_quarter) vẫn 8 ô nốt đen (tiêu chí tuần 4) nhưng không còn một nốt lặp 4 lần mỗi ô;
 * - tên bước theo BÀI HÁT (lessons/stepTitle.ts);
 * - khởi động / ôn bài cũ không lặp bài của buổi liền trước (sessionSelectors).
 */
import { describe, expect, it } from 'vitest';
import { defaultData, type AppData, type Session, type SongRun } from '../src/progress/schema';
import { FAMILIAR_MIN_BPM, START_SLOW_HARD_BPM, startTempoBpm } from '../src/lessons/songStats';
import { findTune } from '../src/music/exercises';
import { SONGS, beatsPerMeasure, measureCount } from '../src/music/tune';
import { lessonStepTitle, stepTitle, tidyStepName } from '../src/lessons/stepTitle';
import { WEEKS, weekPlan } from '../src/lessons/lessonEngine';
import { findLesson } from '../src/lessons/curriculum';
import { lastSessionExtraSongs, pushWarmupSong, readWarmupSongs, reviewSongStep, warmupMusic } from '../src/lessons/sessionSelectors';

const DAY = 86400000;
const NOW = new Date(2026, 9, 17, 17).getTime();

function run(songId: string, ts: number, o: Partial<SongRun> = {}): SongRun {
  return { songId, mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 10, hits: 10, source: 'parent', passed: true, ts, ...o };
}
function session(lessonId: string, ts: number, runs: SongRun[]): Session {
  return {
    id: `s${ts}`,
    date: new Date(ts).toISOString().slice(0, 10),
    lessonId,
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: runs,
    selfRating: null,
    startedAt: ts,
    endedAt: ts + 600000,
    minutes: 10,
    completed: true,
    checklist: {},
  };
}
const fresh = (): AppData => {
  const d = defaultData(new Date(NOW - 60 * DAY));
  d.progress.currentWeek = 8;
  return d;
};

describe('tốc độ mở: bài quen ≥ 56', () => {
  const t = findTune('raindrops')!; // có móc đơn → bài mới mở 40
  it('bài mới: chậm như cũ (40 với móc đơn)', () => {
    expect(startTempoBpm(t, fresh())).toBe(Math.min(t.bpm, START_SLOW_HARD_BPM));
  });
  it('bài đã đạt (từng nốt, chưa theo nhịp) → không dưới 56', () => {
    const d = fresh();
    d.sessions.push(session('w5-l2', NOW - 2 * DAY, [run('raindrops', NOW - 2 * DAY, { mode: 'wait', level: undefined })]));
    expect(startTempoBpm(t, d)).toBe(Math.min(t.bpm, FAMILIAR_MIN_BPM));
    expect(startTempoBpm(t, d)).toBeGreaterThanOrEqual(56);
  });
  it('bài vốn viết chậm (40) giữ tốc độ bài', () => {
    const slow = SONGS.find((s) => s.bpm === 40)!;
    const d = fresh();
    d.sessions.push(session('w5-l2', NOW - 2 * DAY, [run(slow.id, NOW - 2 * DAY, { mode: 'wait', level: undefined, bpm: 40 })]));
    expect(startTempoBpm(slow, d)).toBe(40);
  });
});

describe('Ếch con nhảy (ex_c_quarter)', () => {
  const t = findTune('ex_c_quarter')!;
  it('8 ô 4/4 toàn nốt đen (tiêu chí tuần 4 không đổi), tên bài thật', () => {
    expect(measureCount(t)).toBe(8);
    expect(beatsPerMeasure(t)).toBe(4);
    expect(t.notes.every((n) => n.beats === 1 && !n.rest)).toBe(true);
    expect(t.titleVi).toBe('Ếch con nhảy');
  });
  it('không ô nào lặp một nốt 4 lần', () => {
    for (let m = 0; m < 8; m++) expect(new Set(t.notes.slice(m * 4, m * 4 + 4).map((n) => n.pitch)).size).toBeGreaterThan(1);
  });
});

describe('stepTitle — tên bước theo bài hát', () => {
  it('bước bài hát → tên bài (không "Mức N:")', () => {
    const l = findLesson('w4-l2')!;
    expect(stepTitle(l.activities[0])).toBe('Ếch con nhảy');
    expect(lessonStepTitle(l)).toBe('Ếch con nhảy');
    expect(lessonStepTitle(l, 1)).toBe(tidyStepName(findTune('ex_cde_walk')!.titleVi));
  });
  it('tách tay ghi tay; tidy bỏ ngoặc & "Mức N:"', () => {
    expect(stepTitle({ kind: 'song', songId: 'ex_c_quarter', mode: 'wait', hints: 'full', hand: 'LH' })).toBe('Ếch con nhảy · tay trái');
    expect(tidyStepName('Mức 2: Mỗi phách một nốt (8 ô nhịp)')).toBe('Mỗi phách một nốt');
  });
  it('mọi hoạt động của mọi tuần có tên, không bắt đầu bằng "Mức N"', () => {
    for (const { week } of WEEKS)
      for (const l of weekPlan(week).lessons) {
        expect(/^Mức\s*\d/.test(lessonStepTitle(l)), l.id).toBe(false);
        for (const a of l.activities) {
          const s = stepTitle(a);
          expect(s.length, `${l.id} ${a.kind}`).toBeGreaterThan(0);
          expect(/^Mức\s*\d/.test(s), `${l.id}: ${s}`).toBe(false);
        }
      }
  });
});

describe('khởi động / ôn bài cũ: không lặp bài của buổi liền trước', () => {
  /** Bé tuần 8 đã thuộc 4 bài tuần 1–5 (lượt đạt ≥ 60 ở 2 ngày) */
  const known = ['hot_cross_buns', 'mary_lamb', 'go_tell_aunt_rhody', 'lightly_row'];
  const base = (): AppData => {
    const d = fresh();
    known.forEach((id, k) => {
      for (const day of [20, 19]) d.sessions.push(session('w4-l3', NOW - (day + 2 * k) * DAY, [run(id, NOW - (day + 2 * k) * DAY)]));
    });
    return d;
  };
  const lesson = weekPlan(8).lessons[0];

  it('warmupSongs: ghi mới → cũ, không trùng, ≤ 3', () => {
    expect(pushWarmupSong(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushWarmupSong(['a', 'b', 'c'], 'd')).toEqual(['d', 'a', 'b']);
    expect(readWarmupSongs({ warmupSongs: ['x', 3, 'y'] } as never)).toEqual(['x', 'y']);
  });

  it('khởi động hai buổi liền nhau (cùng số buổi) không cùng bài; bài quen ≥ 56', () => {
    const d = base();
    const w1 = warmupMusic(lesson, d);
    if (w1.kind !== 'song') throw new Error('cần bài khởi động');
    // buổi sau với cùng số buổi (vd buổi trước bỏ dở) — trước đây chọn lại đúng bài này
    d.settings.warmupSongs = pushWarmupSong([], w1.songId);
    const w2 = warmupMusic(lesson, d);
    if (w2.kind !== 'song') throw new Error('cần bài khởi động');
    expect(w2.songId).not.toBe(w1.songId);
    expect(w2.bpm).toBeGreaterThanOrEqual(FAMILIAR_MIN_BPM);
  });

  it('mười buổi liền: không buổi nào lặp bài khởi động của buổi trước', () => {
    const d = base();
    let prev = '';
    for (let i = 0; i < 10; i++) {
      const w = warmupMusic(lesson, d);
      if (w.kind !== 'song') throw new Error('cần bài khởi động');
      expect(w.songId).not.toBe(prev);
      prev = w.songId;
      d.settings.warmupSongs = pushWarmupSong(d.settings.warmupSongs ?? [], w.songId);
      d.sessions.push(session(lesson.id, NOW - (10 - i) * 3600000, [])); // buổi mới (đếm số buổi)
    }
  });

  it('ôn bài cũ: bài vừa ôn ở buổi liền trước nhường bài khác; bài đã đạt ≥ 56', () => {
    const d = base();
    const r1 = reviewSongStep(lesson, d, NOW, () => 0.5);
    if (!r1) throw new Error('cần bài ôn');
    d.sessions.push(session(lesson.id, NOW - 3600000, [run(r1.songId, NOW - 3600000, { phrase: r1.phrase })]));
    expect(lastSessionExtraSongs(d).has(r1.songId)).toBe(true);
    const r2 = reviewSongStep(lesson, d, NOW, () => 0.5)!;
    expect(r2.songId).not.toBe(r1.songId);
    expect(r1.bpm).toBeGreaterThanOrEqual(FAMILIAR_MIN_BPM);
    expect(r2.bpm).toBeGreaterThanOrEqual(FAMILIAR_MIN_BPM);
  });
});
