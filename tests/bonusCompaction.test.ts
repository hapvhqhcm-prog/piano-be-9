import { describe, expect, it } from 'vitest';
import { bonusCollection, bonusForSession } from '../src/lessons/bonusStickers';
import { compactData } from '../src/progress/compaction';
import type { AppData, Session } from '../src/progress/schema';
import { defaultData } from '../src/progress/schema';

/**
 * Sổ sticker "🎁 Bất ngờ" phải giữ nguyên sau khi gộp các buổi cũ — kể cả khi gộp KHÔNG theo thứ tự ngày
 * (bé ở lâu tuần 5 chưa đạt, thỉnh thoảng ôn bài tuần 3: buổi tuần 5 cũ được giữ, buổi tuần 3 cũ bị gộp).
 */
function makeData(seed: number): AppData {
  const d = defaultData(new Date(2026, 0, 1));
  d.progress.currentWeek = 5;
  let x = seed;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  for (let day = 0; day < 160; day++) {
    if (rnd() < 0.35) continue;
    const date = new Date(2026, 0, 1 + day);
    const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const lessonId = rnd() < 0.3 ? 'w3-l2' : rnd() < 0.1 ? 'w5-song-x' : 'w5-l1';
    const s: Session = {
      id: `s${seed}-${day}`, date: ds, lessonId, parentAssessments: [], appAssessments: [], micAssessments: [], songRuns: [],
      selfRating: null, startedAt: date.getTime() + 18 * 3600e3, endedAt: null, minutes: 10, completed: rnd() < 0.9, checklist: {},
    };
    d.sessions.push(s);
  }
  return d;
}

describe('sticker bất ngờ sau khi gộp dữ liệu', () => {
  it('bộ sưu tập + trứng của từng buổi còn giữ giống hệt trước/sau gộp (30 biến thể, gộp không theo thứ tự)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const d = makeData(seed);
      const before = JSON.stringify(bonusCollection(d));
      const beforeEach = new Map(d.sessions.map((s) => [s.id, JSON.stringify(bonusForSession(d, s.id))]));
      const after = JSON.parse(JSON.stringify(d)) as AppData;
      const r = compactData(after, new Date(2026, 0, 1 + 160));
      expect(r.folded).toBeGreaterThan(0);
      expect(JSON.stringify(bonusCollection(after))).toBe(before);
      for (const s of after.sessions) expect(JSON.stringify(bonusForSession(after, s.id))).toBe(beforeEach.get(s.id));
    }
  });

  it('buổi "▶ Làm ngay" của bố mẹ không tiêu trứng', () => {
    const d = makeData(3);
    const before = JSON.stringify(bonusCollection(d));
    d.sessions.push({ ...d.sessions[d.sessions.length - 1], id: 'pnow', lessonId: 'w5-parent-now', completed: true, startedAt: Date.now() });
    expect(JSON.stringify(bonusCollection(d))).toBe(before);
  });
});
