import { defaultData, localDateStr, type AppData, type Session, type SongRun } from '../../src/progress/schema';

/**
 * (+ 2026-10-09, UX QA "lần mở đầu sau cập nhật") Dữ liệu GIỐNG bé thật: đang ở TUẦN 4 (đã qua tuần 1–3), ~40 buổi trải
 * trong ~3 tuần (có hôm 2 buổi), vài bài đã thuộc / chơi trọn, micro BẬT, CHƯA sao lưu lần nào, buổi gần nhất HÔM QUA.
 * Dữ liệu tạo từ bản v0.17 → chưa có `settings.cosmetics` (chưa xem màn mừng quà), chưa có practice-day sticker nào được mừng.
 * Dùng cho cảnh chụp (scripts/shots*) và test — cố định theo `now` (không ngẫu nhiên theo máy).
 */
export function fixtureWeek4Child(now: Date = new Date()): AppData {
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 22);
  const d = defaultData(day0);
  d.learner.name = '';
  d.settings.onboardedAt = day0.getTime() + 3600e3;
  d.settings.micEnabled = true;
  d.settings.lastBackupAt = 0;
  const lessons = [
    ['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4', 'w1-test'],
    ['w2-l1', 'w2-l2', 'w2-l3'],
    ['w3-l1', 'w3-l2', 'w3-l3', 'w3-l4'],
    ['w4-l1'],
  ];
  // Ngày học (lùi từ hôm qua): bỏ vài ngày nghỉ; một số ngày 2 buổi → 40 buổi
  const offsets = [22, 21, 20, 20, 18, 17, 17, 16, 15, 14, 14, 13, 11, 10, 10, 9, 8, 8, 7, 7, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1];
  const run = (songId: string, passed: boolean, ts: number, mode: 'wait' | 'tempo' = 'tempo', bpm = 60, hits = passed ? 19 : 13): SongRun => ({
    songId, mode, level: mode === 'tempo' ? 2 : undefined, bpm, hints: 'names', phrase: null, total: 20, hits, source: 'mic', passed, ts,
  } as SongRun);
  let n = 0;
  const all = lessons.flat();
  for (let i = 0; i < 40; i++) {
    const off = offsets[Math.min(offsets.length - 1, Math.floor((i * offsets.length) / 40))];
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - off);
    const t = date.getTime() + (17 + (i % 3)) * 3600e3;
    const lessonId = all[Math.min(all.length - 1, Math.floor((i * all.length) / 38))];
    const week = Number(lessonId.slice(1, 2));
    const runs: SongRun[] = [];
    if (week >= 2) runs.push(run('hot_cross_buns', i % 3 !== 0, t + 1000, week === 2 ? 'wait' : 'tempo', 60));
    if (week >= 3) runs.push(run('mary_lamb', i % 2 === 0, t + 2000, 'tempo', 60));
    if (week >= 3 && i % 4 === 0) runs.push(run('three_chicks', true, t + 3000, 'tempo', 64, 20));
    if (week >= 3 && i % 5 === 1) runs.push(run('au_clair', false, t + 4000, 'wait', 56, 11));
    const s: Session = {
      id: `k4-${n++}`, date: localDateStr(date), lessonId,
      parentAssessments: week === 1 ? Array.from({ length: 10 }, () => ({ note: 'C4', result: 'correct' as const, ts: t })) : [],
      appAssessments: week === 3 ? Array.from({ length: 6 }, (_, k) => ({ expected: 'C4', actual: k === 5 ? 'D4' : 'C4', correct: k !== 5, ts: t })) : [],
      micAssessments: [], songRuns: runs, selfRating: i % 4 === 0 ? 'some' : 'all', startedAt: t, endedAt: t + 12 * 60e3, minutes: 12,
      completed: i !== 17, checklist: {},
    };
    d.sessions.push(s);
  }
  d.progress.currentWeek = 4;
  d.progress.lessonsCompleted = all.slice(0, -1).concat('w4-l1');
  return d;
}
