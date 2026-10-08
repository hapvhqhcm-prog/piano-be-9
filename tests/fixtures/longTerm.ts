import { defaultData, localDateStr, type AppData, type Session, type SongRun } from '../../src/progress/schema';

/**
 * Dữ liệu dài hạn CỐ ĐỊNH (không ngẫu nhiên theo máy) — dùng để khóa "quá khứ không đổi" khi thêm thử thách mới /
 * thêm sticker bất ngờ (tests/longTermUnlocks.test.ts). Giá trị kỳ vọng được chụp TRƯỚC khi đổi code (2026-10-08).
 */
function lcg(seed: number) {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
}
const SONG_IDS = ['frog_hop', 'hot_cross_buns', 'mary_lamb', 'jingle_bells', 'ode_to_joy_easy', 'inh_la_oi', 'twinkle_easy', 'lightly_row'];

function run(songId: string, passed: boolean, bpm: number, ts: number, perfect: boolean): SongRun {
  return { songId, mode: 'tempo', level: 2, bpm, hints: 'names', phrase: null, total: 20, hits: perfect ? 20 : 17, source: 'mic', passed, ts };
}

/** ~5 tháng học (2026-05-04 → 2026-10-08), tuần giáo trình tăng dần 1 → 9, có trò chơi & thử thách đã lưu. */
export function fixtureChallenges(): AppData {
  const d = defaultData(new Date(2026, 4, 4));
  const rnd = lcg(7);
  const start = new Date(2026, 4, 4);
  for (let day = 0; day < 158; day++) {
    if (rnd() < 0.4) continue;
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day);
    const ds = localDateStr(date);
    const week = Math.min(9, 1 + Math.floor(day / 17));
    const t = date.getTime() + 18 * 3600e3;
    const runs: SongRun[] = [];
    const nRuns = Math.floor(rnd() * 3);
    for (let i = 0; i < nRuns; i++) {
      const id = SONG_IDS[Math.min(SONG_IDS.length - 1, Math.floor(rnd() * (1 + week)))];
      runs.push(run(id, rnd() < 0.7, rnd() < 0.5 ? 60 : 72, t + i * 1000, rnd() < 0.3));
    }
    const app = rnd() < 0.3 ? Array.from({ length: 6 }, (_, i) => ({ expected: 'C4', actual: 'C4', correct: i !== 2, ts: t })) : [];
    const s: Session = {
      id: `f-${day}`, date: ds, lessonId: `w${week}-l${1 + (day % 3)}`, parentAssessments: [], appAssessments: app, micAssessments: [],
      songRuns: runs, selfRating: null, startedAt: t, endedAt: t + 600e3, minutes: 10, completed: rnd() < 0.92, checklist: {},
    };
    d.sessions.push(s);
  }
  d.progress.currentWeek = 9;
  d.progress.challenges = { '2026-06-01': { id: 'days4', doneAt: 1 } };
  d.games = { noteRush: { best: 12, plays: 5, lastAt: new Date(2026, 8, 20).getTime() } };
  return d;
}

/** Các thứ 2 trong quá khứ (tới tuần hiện tại 2026-10-05). */
export function pastMondays(): string[] {
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const m = localDateStr(new Date(2026, 4, 4 + 7 * i));
    if (m > '2026-10-05') break;
    out.push(m);
  }
  return out;
}

/** 160 buổi bài học (2026-03-01 → 2026-10-08) — dòng thời gian trứng. */
export function fixtureEggs(): AppData {
  const d = defaultData(new Date(2026, 2, 1));
  const rnd = lcg(11);
  const start = new Date(2026, 2, 1);
  for (let i = 0; i < 160; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.floor(i * 1.4));
    const ds = localDateStr(date);
    if (ds > '2026-10-08') break;
    const t = date.getTime() + (17 + (i % 2)) * 3600e3;
    d.sessions.push({
      id: `e${i}-${(i * 7919).toString(36)}`, date: ds, lessonId: rnd() < 0.08 ? 'w4-song-x' : 'w4-l1', parentAssessments: [], appAssessments: [],
      micAssessments: [], songRuns: [], selfRating: null, startedAt: t, endedAt: t, minutes: 10, completed: rnd() < 0.95, checklist: {},
    });
  }
  return d;
}
