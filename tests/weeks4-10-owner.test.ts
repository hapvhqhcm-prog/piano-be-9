import { describe, expect, it } from 'vitest';
import { WEEKS, activityDoneId, buildSessionPlan, findLesson, nextLesson, weekComplete, weekPassed, weekPlan } from '../src/lessons/lessonEngine';
import { findTune } from '../src/music/exercises';
import { findSong, measureCount } from '../src/music/tune';
import { MemoryStorage, ProgressStore, STORAGE_KEY } from '../src/progress/ProgressStore';
import type { SongRun } from '../src/progress/schema';
import { SYMBOL } from '../src/ui/screens/rhythm';

/**
 * (2026-10-08, OWNER duyệt) Rà soát tuần 4–10: thêm bước vào bài tuần 4–5, tách bài tuần 10, nốt tròn, nốt Si…
 * Bé ĐANG ở tuần 4 với tiến độ đã lưu → tiến độ cũ phải giữ nguyên nghĩa (mã "<bài>#<i>" lưu THEO CHỈ SỐ hoạt động).
 */

const run = (o: Partial<SongRun>): Omit<SongRun, 'ts'> => ({
  songId: 'ex_c_quarter', mode: 'tempo', level: 2, bpm: 60, hints: 'full',
  phrase: null, total: 32, hits: 30, source: 'mic', passed: true, ...o,
});

function clockStore(kv = new MemoryStorage()) {
  let d = 4;
  const st = new ProgressStore(kv, () => new Date(2026, 9, d, 17));
  return { st, kv, day: (k: number) => (d = 4 + k) };
}

const songOf = (lessonId: string, i: number) => {
  const a = findLesson(lessonId)!.activities[i];
  return a.kind === 'song' ? `${a.songId}@${a.mode}${a.level ?? ''}` : a.kind;
};

/** Bản lưu tuần 4 như app (bản trước thay đổi) đã ghi: tuần 1–3 xong, tuần 4 xong bài 1–3, bài 4 dở (xong hoạt động 0). */
const W4_DONE = [
  ...WEEKS.slice(0, 3).flatMap((w) => w.lessons.filter((l) => !l.isWeekTest).map((l) => l.id)),
  'w4-l1#0', 'w4-l1', 'w4-l2#0', 'w4-l2#1', 'w4-l2', 'w4-l3#0', 'w4-l3', 'w4-l4#0',
];

describe('tiến độ tuần 4 đã lưu vẫn đúng sau rà soát 2026-10-08', () => {
  it('các hoạt động CŨ của tuần 4 giữ nguyên chỉ số (bước mới chỉ thêm vào CUỐI bài)', () => {
    expect(songOf('w4-l1', 0)).toBe('rhythm');
    expect(songOf('w4-l2', 0)).toBe('ex_c_quarter@tempo2');
    expect(songOf('w4-l2', 1)).toBe('ex_cde_walk@tempo2');
    expect(songOf('w4-l3', 0)).toBe('hot_cross_buns@tempo2');
    expect(songOf('w4-l4', 0)).toBe('go_tell_aunt_rhody@wait');
    expect(songOf('w4-l4', 1)).toBe('go_tell_aunt_rhody@tempo3');
    expect(songOf('w4-l4', 2)).toBe('lightly_row@wait');
    expect(weekPlan(4).lessons.map((l) => l.id)).toEqual(['w4-l1', 'w4-l2', 'w4-l3', 'w4-l4']);
    // bước mới: Tàu hỏa ở cuối bài 3
    expect(songOf('w4-l3', 1)).toBe('choo_choo_train@wait');
    expect(songOf('w4-l3', 2)).toBe('choo_choo_train@tempo2');
  });

  it('bản lưu tuần 4 nạp lại: cùng danh sách đã xong, "Học tiếp" vẫn là phần còn lại của bài 4', () => {
    const { st, kv } = clockStore();
    st.setCurrentWeek(4);
    W4_DONE.forEach((id) => st.markLessonCompleted(id));
    const raw = kv.getItem(STORAGE_KEY)!;
    expect(raw).toBeTruthy();
    const kv2 = new MemoryStorage();
    kv2.setItem(STORAGE_KEY, raw);
    const { st: st2 } = clockStore(kv2);
    const d = st2.get();
    expect(d.progress.currentWeek).toBe(4);
    expect(d.progress.lessonsCompleted).toEqual(W4_DONE);
    // Bài đã xong vẫn xong; bài dở chỉ còn hoạt động 1–2 (+ 3: ứng tấu thêm vào CUỐI ngày 2026-10-08) — không làm lại hoạt động 0
    expect(nextLesson(d).id).toBe('w4-l4');
    const acts = buildSessionPlan(findLesson('w4-l4')!, d).flatMap((s) => (s.kind === 'activity' ? [s.index] : []));
    expect(acts).toEqual([1, 2, 3]);
    // Bài 3 đã xong: không bị "mở lại" vì có thêm bước (Chơi lại / tiêu chí vẫn làm đủ bài)
    expect(d.progress.lessonsCompleted).toContain('w4-l3');
  });

  it('bài 3 dở (chỉ xong Bánh nóng, chưa ghi xong bài) → lần sau chỉ làm bước MỚI, không lặp Bánh nóng', () => {
    const { st } = clockStore();
    st.setCurrentWeek(4);
    st.markLessonCompleted(activityDoneId('w4-l3', 0));
    const acts = buildSessionPlan(findLesson('w4-l3')!, st.get()).flatMap((s) => (s.kind === 'activity' ? [s.index] : []));
    expect(acts).toEqual([1, 2]);
  });

  it('tiêu chí tuần 4 KHÔNG khó hơn: lượt cũ (bài tập 8 ô) vẫn đạt; Tàu hỏa (8 ô, Mức 2) cũng được tính', () => {
    const a = clockStore();
    a.st.setCurrentWeek(4);
    a.st.addSongRun(a.st.startSession('w4-l2').id, run({}));
    a.day(1);
    a.st.addSongRun(a.st.startSession('w4-l2').id, run({ songId: 'ex_cde_walk' }));
    expect(weekPassed(4, a.st.get())).toBe(true);
    // đủ bài + đạt tiêu chí → xong tuần (bước mới ở bài 3 không làm mất "xong")
    ['w4-l1', 'w4-l2', 'w4-l3', 'w4-l4'].forEach((id) => a.st.markLessonCompleted(id));
    expect(weekComplete(4, a.st.get())).toBe(true);

    expect(measureCount(findTune('choo_choo_train')!)).toBeGreaterThanOrEqual(8);
    const b = clockStore();
    b.st.setCurrentWeek(4);
    b.st.addSongRun(b.st.startSession('w4-l3').id, run({ songId: 'choo_choo_train' }));
    b.day(1);
    b.st.addSongRun(b.st.startSession('w4-l3').id, run({ songId: 'choo_choo_train' }));
    expect(weekPassed(4, b.st.get())).toBe(true);
  });

  it('nốt tròn "Đi-i-i-i" (4 phách) được dạy trong trò vỗ nhịp tuần 4', () => {
    expect(SYMBOL.long4).toMatchObject({ beats: 4, hits: [0] });
    const r = findLesson('w4-l1')!.activities[0];
    expect(r.kind === 'rhythm' && r.patterns.some((p) => p.includes('long4'))).toBe(true);
  });
});

describe('tuần 5 & 10 (rà soát 2026-10-08)', () => {
  it('tuần 5 bài 4: Chèo thuyền nhẹ Mức 2 TRƯỚC Mức 3', () => {
    expect(findLesson('w5-l4')!.activities.map((_, i) => songOf('w5-l4', i))).toEqual(['notes', 'lightly_row@tempo2', 'lightly_row@tempo3']);
  });

  it('tuần 10: tách bài 2 → bài 3 "Nốt Si & Gà gáy"; thẻ dạy Si (vạch 3) đứng trước Gà gáy', () => {
    // (2026-10-08) + "w10-g": Bánh nóng thế Sol (xem trước tuần 14), trước buổi biểu diễn
    expect(weekPlan(10).lessons.map((l) => l.id)).toEqual(['w10-l1', 'w10-l2', 'w10-l3', 'w10-g', 'w10-stage']);
    expect(findLesson('w10-l2')!.activities.map((_, i) => songOf('w10-l2', i))).toEqual(['old_macdonald@wait', 'oh_susanna@wait']);
    const l3 = findLesson('w10-l3')!;
    const [card, song] = l3.activities;
    expect(card.kind).toBe('notes');
    if (card.kind !== 'notes') return;
    expect(card.segment.targets.every((t) => t.keys.includes('B4'))).toBe(true);
    expect(card.segment.targets.some((t) => t.staff && t.subtitle?.includes('vạch 3'))).toBe(true);
    expect(song.kind === 'song' && song.songId).toBe('ga_gay');
    // Si = ngón 5 như trong bài
    expect(findSong('ga_gay')!.notes.filter((n) => n.pitch === 'B4').every((n) => n.finger === 5)).toBe(true);
  });
});

describe('giai điệu & ngón (rà soát 2026-10-08)', () => {
  it('Kìa con bướm vàng: ô 3 và ô 4 (cùng Mi Fa Sol) cùng ngón 3-4-5', () => {
    const t = findSong('frere_jacques_easy')!;
    const bar = (m: number) => {
      let b = 0;
      return t.notes.filter((n) => {
        const ok = Math.floor(b / 4) === m;
        b += n.beats;
        return ok;
      });
    };
    expect(bar(2).map((n) => `${n.pitch}/${n.finger}`)).toEqual(['E4/3', 'F4/4', 'G4/5']);
    expect(bar(3).map((n) => `${n.pitch}/${n.finger}`)).toEqual(['E4/3', 'F4/4', 'G4/5']);
  });

  it('Ông lão vui tính: đủ lời "with a knick-knack paddy-whack, give a dog a bone" — 8 ô, 5 nốt Đô liền', () => {
    const t = findSong('this_old_man')!;
    expect(measureCount(t)).toBe(8);
    const seq = t.notes.map((n) => n.pitch).join(' ');
    expect(seq).toBe('G4 E4 G4 G4 E4 G4 A4 G4 F4 E4 D4 E4 F4 E4 F4 G4 C4 C4 C4 C4 C4 D4 E4 F4 G4 G4 D4 D4 F4 E4 D4 C4');
  });
});
