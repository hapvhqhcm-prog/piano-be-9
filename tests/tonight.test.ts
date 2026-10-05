import { describe, expect, it } from 'vitest';
import { actionFor, noteLabelForParent, tonightPlan, topStruggles } from '../src/ui/screens/tonight';
import { defaultData, type AppData, type Session } from '../src/progress/schema';

const NOW = new Date(2026, 9, 5, 19, 0, 0);
let seq = 0;
function session(p: Partial<Session> = {}): Session {
  seq++;
  return {
    id: `s${seq}`,
    date: '2026-10-03',
    lessonId: 'w2-l1',
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: [],
    selfRating: null,
    startedAt: 0,
    endedAt: null,
    minutes: 10,
    completed: true,
    checklist: {},
    ...p,
  };
}
function data(sessions: Session[], week = 2): AppData {
  const d = defaultData(NOW);
  d.sessions = sessions;
  d.progress.currentWeek = week;
  return d;
}
const pa = (note: string, result: 'correct' | 'retry') => ({ note, result, ts: 0 });

describe('Việc cần làm tối nay (màn Phụ huynh)', () => {
  it('3 chỗ khó nhất trong 2 tuần: Thử lại + micro nghe nhầm + bài chưa đạt; bỏ dữ liệu cũ hơn 2 tuần', () => {
    const d = data([
      session({ parentAssessments: [pa('D4', 'retry'), pa('D4', 'retry'), pa('C4', 'correct'), pa('teach-back', 'retry')] }),
      session({ micAssessments: [{ expected: 'E4', firstHeard: 'F4', firstTry: false, wrongCount: 9, ts: 0 }] }),
      session({ songRuns: [{ songId: 'mary_lamb', mode: 'wait', bpm: 60, hints: 'full', total: 20, hits: 10, source: 'mic', passed: false, ts: 0 }] }),
      // Cũ hơn 14 ngày → không tính
      session({ date: '2026-09-01', parentAssessments: [pa('G4', 'retry'), pa('G4', 'retry'), pa('G4', 'retry'), pa('G4', 'retry')] }),
    ]);
    const top = topStruggles(d, NOW);
    expect(top.map((x) => x.key)).toEqual(['E4', 'D4', 'song:mary_lamb']);
    expect(top[0]).toMatchObject({ kind: 'note', misses: 3, label: 'Nốt Mi (E4)' }); // micro sai tối đa 3/nốt
    expect(top[2].label).toMatch(/^Bài “/);
  });

  it('nhãn bằng lời thường, không có mã kỹ thuật', () => {
    expect(noteLabelForParent('C4').label).toBe('Nốt Đô (C4)');
    expect(noteLabelForParent('F#4').label).toBe('Nốt Fa thăng (F♯4)');
    expect(noteLabelForParent('C4+E4+G4').label).toBe('Hợp âm Đô–Mi–Sol');
    expect(noteLabelForParent('dyn:loud-soft:2')).toMatchObject({ kind: 'game' });
    expect(noteLabelForParent('twins-4').label).toBe('Sinh đôi');
  });

  it('một câu hành động cụ thể; không có chỗ khó → nhắc học đủ buổi hoặc khen', () => {
    expect(actionFor({ kind: 'note', key: 'D4', label: 'Nốt Rê (D4)', misses: 2 }, 2)).toContain('tìm Rê (D4) 5 lần');
    expect(actionFor({ kind: 'song', key: 'song:x', label: 'Bài “X”', misses: 1 }, 2)).toContain('Từng nốt');
    expect(actionFor(undefined, 1)).toContain('Học tiếp');
    expect(actionFor(undefined, 5)).toContain('làm tốt');
  });

  it('tiêu chí tuần bằng lời thường + còn mấy bài', () => {
    const t = tonightPlan(data([]), NOW);
    expect(t.goal.week).toBe(2);
    expect(t.goal.who).not.toMatch(/PARENT|MIC|APP|SELF/);
    expect(t.goal.lessonsLeft).toBeGreaterThan(0);
    expect(t.goal.passed).toBe(false);
    expect(t.struggles).toEqual([]);
  });
});
