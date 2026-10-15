/**
 * (+ 2026-10-15) Rà soát của giáo viên có kinh nghiệm — app "quá dễ dãi". OWNER duyệt:
 * 1. tiêu chí tuần chỉ tính bằng chứng từ ngày bé học bài của tuần dạy điều đó (tuần 4: bài theo nhịp);
 * 2. bắt đầu chậm (≤ 50, 40 nếu có móc đơn / hai tay) khi bài chưa có lượt theo nhịp nào đạt;
 * 3. "thuộc bài" = 2 lượt đạt ở 2 NGÀY khác nhau (giữ nguyên quyền cho dữ liệu cũ); luyện chỗ khó chậm ×2 + đúng tốc độ ×1;
 * 4. khởi động bằng nhạc chỉ dùng bài THUỘC; 5. "Con làm thầy" theo bài + 📝 bài tập về nhà; 6. kết thúc bằng câu dễ.
 * AN TOÀN TIẾN ĐỘ: không bao giờ hạ tuần bé đang học; tuần đã qua (history.passedWeeks) giữ nguyên.
 */
import { describe, expect, it } from 'vitest';
import { fixtureWeek4Child } from './fixtures/week4Child';
import {
  WEEKS,
  buildSessionPlan,
  findLesson,
  masteredSongs,
  nextLesson,
  songMastered,
  songStats,
  weekPassed,
  weekPlan,
} from '../src/lessons/lessonEngine';
import { evidenceFrom } from '../src/lessons/weekCriteria';
import { hasEighths, startTempoBpm, stampMasteryRule } from '../src/lessons/songStats';
import { lessonTeach } from '../src/lessons/sessionPlan';
import { warmupMusic } from '../src/lessons/sessionSelectors';
import { islandPassed, earnedStickerIds } from '../src/lessons/stickers';
import { homeworkDone, homeworkText, makeHomework, pendingHomework, readHomework } from '../src/lessons/homework';
import { findTune } from '../src/music/exercises';
import { compactData } from '../src/progress/compaction';
import { emptyHistory } from '../src/progress/history';
import { MemoryStorage, ProgressStore, STORAGE_KEY } from '../src/progress/ProgressStore';
import { defaultData, localDateStr, type AppData, type Session, type SongRun } from '../src/progress/schema';
import { easyRange } from '../src/ui/screens/songResult';

const NOW = new Date(2026, 9, 15, 19);
const DAY = 86_400_000;

const tempoRun = (songId: string, ts: number, o: Partial<SongRun> = {}): SongRun => ({
  songId, mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 20, hits: 19, source: 'mic', passed: true, ts, ...o,
});

function session(lessonId: string, day: Date, runs: SongRun[]): Session {
  const t = day.getTime();
  return {
    id: `t-${lessonId}-${t}-${runs.length}`, date: localDateStr(day), lessonId, parentAssessments: [], appAssessments: [], micAssessments: [],
    songRuns: runs, selfRating: null, startedAt: t, endedAt: t + 600e3, minutes: 10, completed: true, checklist: {},
  };
}
const dayAt = (k: number) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + k, 17);

describe('1. Tiêu chí tuần 4 phải THẬT (chỉ tính từ ngày học bài theo nhịp của tuần 4)', () => {
  it('bé thật (fixture tuần 4): lượt theo nhịp bài CŨ trong buổi tuần 4 trước bài Mức 2 → KHÔNG còn "đạt"', () => {
    const d = fixtureWeek4Child(NOW);
    // fixture: buổi w4-l1 (vỗ tay) có lượt "Bánh nóng"/"Chú cừu" theo nhịp ở 2 ngày — luật cũ coi là đạt
    expect(d.sessions.some((s) => s.lessonId === 'w4-l1' && s.songRuns.some((r) => r.mode === 'tempo' && r.passed))).toBe(true);
    expect(evidenceFrom(4, d.sessions.filter((s) => s.lessonId.startsWith('w4-')), (l) => l.activities.some((a) => a.kind === 'song' && a.mode === 'tempo'))).toBeNull();
    expect(weekPassed(4, d)).toBe(false);
    // AN TOÀN: tuần bé đang học không đổi; các đảo đã qua vẫn sáng
    expect(d.progress.currentWeek).toBe(4);
    for (const w of [1, 2, 3]) expect(islandPassed(w, d)).toBe(true);
    expect(nextLesson(d).week).toBe(4);
  });

  it('Thư viện chơi bài cũ theo nhịp TRƯỚC bài Mức 2 không tính; từ hôm học bài Mức 2 thì lượt Thư viện vẫn tính (2 ngày)', () => {
    const d = defaultData(dayAt(-10));
    d.progress.currentWeek = 4;
    // ngày -5, -4: chơi "Tàu hỏa" (8 ô) theo nhịp ở Thư viện — chưa học bài theo nhịp nào của tuần 4
    d.sessions.push(session('w4-song-choo_choo_train', dayAt(-5), [tempoRun('choo_choo_train', dayAt(-5).getTime())]));
    d.sessions.push(session('w4-song-choo_choo_train', dayAt(-4), [tempoRun('choo_choo_train', dayAt(-4).getTime())]));
    d.sessions.push(session('w4-l1', dayAt(-4), []));
    expect(weekPassed(4, d)).toBe(false);
    // ngày -3: học bài Mức 2 (w4-l2) → từ đây mới tính
    d.sessions.push(session('w4-l2', dayAt(-3), [tempoRun('ex_c_quarter', dayAt(-3).getTime(), { hints: 'full' })]));
    expect(weekPassed(4, d)).toBe(false); // mới 1 ngày
    d.sessions.push(session('w4-song-choo_choo_train', dayAt(-2), [tempoRun('choo_choo_train', dayAt(-2).getTime())]));
    expect(weekPassed(4, d)).toBe(true);
  });

  it('tuần ĐÃ đạt (history.passedWeeks) không bị xét lại; tuần bài hát chỉ tính từ NGÀY ĐẦU học bài của tuần (tuần 5)', () => {
    const d = defaultData(dayAt(-10));
    d.progress.currentWeek = 5;
    d.history = { ...emptyHistory(), passedWeeks: [4] };
    expect(weekPassed(4, d)).toBe(true);
    // "Ếch con" chơi ở Thư viện 2 ngày trước khi học bài nào của tuần 5 → chưa đạt
    const frogLesson = weekPlan(5).lessons.find((l) => l.activities.some((a) => a.kind === 'song' && a.songId === 'frog_hop'))!;
    expect(frogLesson).toBeDefined();
    d.sessions.push(session('w5-song-frog_hop', dayAt(-3), [tempoRun('frog_hop', dayAt(-3).getTime())]));
    d.sessions.push(session('w5-song-frog_hop', dayAt(-2), [tempoRun('frog_hop', dayAt(-2).getTime())]));
    expect(weekPassed(5, d)).toBe(false);
    d.sessions.push(session(weekPlan(5).lessons[0].id, dayAt(-2), [])); // ngày đầu của tuần 5 (bài bất kỳ)
    d.sessions.push(session('w5-song-frog_hop', dayAt(-1), [tempoRun('frog_hop', dayAt(-1).getTime())]));
    expect(weekPassed(5, d)).toBe(true);
  });

  it('gộp lịch sử (compaction) vẫn đúng: tuần đạt trước khi gộp vẫn đạt sau khi gộp', () => {
    const d = defaultData(dayAt(-100));
    d.progress.currentWeek = 6;
    d.sessions.push(session('w4-l2', dayAt(-90), [tempoRun('ex_c_quarter', dayAt(-90).getTime())]));
    d.sessions.push(session('w4-l2', dayAt(-89), [tempoRun('ex_c_quarter', dayAt(-89).getTime())]));
    expect(weekPassed(4, d)).toBe(true);
    compactData(d, NOW);
    expect(d.sessions.length).toBe(0);
    expect(weekPassed(4, d)).toBe(true);
  });
});

describe('2. Bắt đầu chậm', () => {
  it('bài chưa có lượt theo nhịp nào đạt → ≤ 50; có móc đơn / hai tay → 40; đã đạt → tốc độ của bài', () => {
    const d = defaultData(NOW);
    const ode = findTune('ode_to_joy_easy')!;
    expect(hasEighths(ode)).toBe(false);
    expect(startTempoBpm(ode, d)).toBe(Math.min(ode.bpm, 50));
    const choo = findTune('choo_choo_train')!;
    expect(hasEighths(choo)).toBe(true);
    expect(startTempoBpm(choo, d)).toBe(40);
    const both = findTune('ode_to_joy_both')!;
    expect(startTempoBpm(both, d)).toBe(40);
    d.sessions.push(session('w6-l1', dayAt(-1), [tempoRun('ode_to_joy_easy', dayAt(-1).getTime(), { bpm: 50 })]));
    expect(startTempoBpm(ode, d)).toBe(ode.bpm);
    // lượt một câu đạt không tính là "đã đạt theo nhịp"
    d.sessions.push(session('w4-l3', dayAt(-1), [tempoRun('choo_choo_train', dayAt(-1).getTime(), { phrase: [0, 2] })]));
    expect(startTempoBpm(choo, d)).toBe(40);
  });
});

describe('3. "Thuộc bài" = 2 ngày — dữ liệu cũ giữ nguyên quyền', () => {
  it('fixture bé thật: bài đã thuộc / sticker không đổi sau khi có mốc luật mới', () => {
    const before = fixtureWeek4Child(NOW);
    const mastered = masteredSongs(before);
    const stickers = earnedStickerIds(before);
    expect(mastered.length).toBeGreaterThan(0);
    const after = fixtureWeek4Child(NOW);
    stampMasteryRule(after, NOW.getTime());
    expect(masteredSongs(after)).toEqual(mastered);
    expect(earnedStickerIds(after)).toEqual(stickers);
    // ProgressStore bản mới mở dữ liệu cũ: mốc = lúc mở → bài cũ vẫn thuộc
    const kv = new MemoryStorage();
    kv.setItem(STORAGE_KEY, JSON.stringify(before));
    const st = new ProgressStore(kv, () => NOW, { pageEvents: false, autoCompact: false });
    expect(typeof st.get().settings.masteryRuleFrom).toBe('number');
    for (const id of mastered) expect(songMastered(st.get(), id)).toBe(true);
  });

  it('sau mốc: một lượt (hay nhiều lượt cùng ngày) chưa thuộc; lượt đạt ở ngày khác → thuộc; gộp lịch sử giữ nguyên', () => {
    const d: AppData = defaultData(dayAt(-200));
    stampMasteryRule(d, dayAt(-120).getTime());
    d.progress.currentWeek = 6;
    const t1 = dayAt(-100).getTime();
    d.sessions.push(session('w6-song-x', dayAt(-100), [tempoRun('ode_to_joy_easy', t1), tempoRun('ode_to_joy_easy', t1 + 60e3)]));
    expect(songMastered(d, 'ode_to_joy_easy')).toBe(false);
    expect(songStats(d).ode_to_joy_easy.md).toBe(localDateStr(dayAt(-100)));
    // tốc độ 50 / chưa đạt ở ngày khác → vẫn chưa
    d.sessions.push(session('w6-song-x', dayAt(-99), [tempoRun('ode_to_joy_easy', dayAt(-99).getTime(), { bpm: 50 }), tempoRun('ode_to_joy_easy', dayAt(-99).getTime() + 1, { passed: false })]));
    expect(songMastered(d, 'ode_to_joy_easy')).toBe(false);
    d.sessions.push(session('w6-song-x', dayAt(-98), [tempoRun('ode_to_joy_easy', dayAt(-98).getTime())]));
    expect(songMastered(d, 'ode_to_joy_easy')).toBe(true);
    // gộp (buổi > 56 ngày): kết quả đọc giống hệt
    const one: AppData = JSON.parse(JSON.stringify(d));
    one.sessions = one.sessions.slice(0, 1);
    compactData(one, NOW);
    expect(songMastered(one, 'ode_to_joy_easy')).toBe(false);
    one.sessions.push(session('w6-song-x', dayAt(-1), [tempoRun('ode_to_joy_easy', dayAt(-1).getTime())]));
    expect(songMastered(one, 'ode_to_joy_easy')).toBe(true);
  });
});

describe('4. Khởi động bằng nhạc = bài THUỘC (sửa lỗi "prefer")', () => {
  it('bài "nên dùng" chưa đạt không được mời khởi động (trước đây hiện "bài con đã thuộc")', () => {
    const d = defaultData(NOW);
    d.progress.currentWeek = 6;
    d.sessions.push(session('w6-song-x', dayAt(-2), [tempoRun('mary_lamb', dayAt(-2).getTime(), { passed: false, hits: 5 })]));
    const lesson = findLesson('w6-l1')!;
    const w = warmupMusic(lesson, d, [], 'mary_lamb');
    expect(w.kind === 'song' && w.songId === 'mary_lamb').toBe(false);
    // bài đã thuộc thì vẫn được ưu tiên
    d.sessions.push(session('w6-song-y', dayAt(-1), [tempoRun('hot_cross_buns', dayAt(-1).getTime())]));
    const w2 = warmupMusic(lesson, d, [], 'hot_cross_buns');
    expect(w2.kind === 'song' && w2.songId).toBe('hot_cross_buns');
  });
});

describe('5. "Con làm thầy" theo bài + 📝 bài tập về nhà', () => {
  it('thẻ "Con làm thầy" không lặp y hệt trong tuần: bài đầu = của tuần, bài khác tạo từ nội dung bài', () => {
    for (const plan of WEEKS.slice(0, 10)) {
      const texts = plan.lessons.map((l) => lessonTeach(l).text);
      expect(texts[0]).toBe(plan.teach.text);
      const regular = plan.lessons.filter((l) => !l.isWeekTest);
      if (regular.length >= 3) expect(new Set(regular.map((l) => lessonTeach(l).text)).size).toBeGreaterThanOrEqual(3);
    }
    const closing = buildSessionPlan(findLesson('w4-l3')!).pop();
    expect(closing?.kind === 'closing' && closing.teach?.text).toContain('Tàu');
  });

  it('bài tập: dòng cho bố mẹ, mời đầu buổi HÔM SAU, xong khi đạt đúng chỗ; đọc mềm', () => {
    const hw = makeHomework({ songId: 'frog_hop', title: 'Ếch con nhảy', phrase: [2, 4], place: 'Câu 2', mode: 'tempo', bpm: 50, date: '2026-10-15', at: NOW.getTime() });
    expect(hw.text).toBe('Câu 2 “Ếch con nhảy” — chậm 40, 3 lần đúng liền');
    expect(homeworkText({ title: 'X', place: 'Cả bài', mode: 'wait', bpm: 60 })).toContain('từng nốt');
    const settings = { ...defaultData(NOW).settings, homework: hw };
    expect(readHomework(settings)).toEqual(hw);
    expect(pendingHomework(settings, '2026-10-15', NOW.getTime())).toBeNull(); // cùng ngày: chỉ ở màn kết
    expect(pendingHomework(settings, '2026-10-16', NOW.getTime() + DAY)).toEqual(hw);
    expect(pendingHomework(settings, '2026-11-15', NOW.getTime() + 31 * DAY)).toBeNull(); // quá cũ
    expect(homeworkDone(hw, { songId: 'frog_hop', passed: true, phrase: [2, 4] }, NOW.getTime() + 1)).toBe(true);
    expect(homeworkDone(hw, { songId: 'frog_hop', passed: true, phrase: null }, NOW.getTime() + 1)).toBe(true);
    expect(homeworkDone(hw, { songId: 'frog_hop', passed: true, phrase: [0, 2] }, NOW.getTime() + 1)).toBe(false);
    expect(homeworkDone(hw, { songId: 'frog_hop', passed: false, phrase: null }, NOW.getTime() + 1)).toBe(false);
    expect(homeworkDone(hw, { songId: 'frog_hop', passed: true, phrase: null, hand: 'RH' }, NOW.getTime() + 1)).toBe(false);
    expect(readHomework({ ...settings, homework: { songId: 1 } as never })).toBeNull();
    expect(readHomework({ ...settings, homework: { ...hw, phrase: [3, 1] } })).toBeNull();
  });
});

describe('6. Kết thúc bằng thành công', () => {
  it('câu dễ = câu ít lỗi nhất ở lượt vừa chơi (hoà → câu đầu), tối đa 2 ô', () => {
    const ranges: Array<[number, number]> = [[0, 4], [4, 8]];
    expect(easyRange(ranges, new Map([[1, 3], [5, 1]]))).toEqual([4, 6]);
    expect(easyRange(ranges, new Map())).toEqual([0, 2]);
    expect(easyRange([[0, 1]], new Map())).toEqual([0, 1]);
  });
});
