import { describe, expect, it } from 'vitest';
import { bonusCollection } from '../src/lessons/bonusStickers';
import { compactData } from '../src/progress/compaction';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';

/** Sổ sticker "🎁 Bất ngờ" phải giữ nguyên sau khi gộp các buổi cũ (> 56 ngày) vào history. */
describe('sticker bất ngờ sau khi gộp dữ liệu', () => {
  it('bộ sưu tập giống hệt trước/sau gộp', () => {
    let day = 0;
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 0, 1 + day, 18));
    for (day = 0; day < 200; day += 2) {
      const s = st.startSession(`w${1 + Math.floor(day / 14)}-l1`);
      st.addParentAssessment(s.id, 'C4', 'correct');
      st.finishSession(s.id);
    }
    const before = JSON.stringify(bonusCollection(st.get()));
    const data = JSON.parse(JSON.stringify(st.get()));
    compactData(data, new Date(2026, 0, 1 + 200, 18));
    expect(data.sessions.length).toBeLessThan(st.get().sessions.length + 1);
    expect(JSON.stringify(bonusCollection(data))).toBe(before);
  });
});
