/**
 * (+ 2026-10-17 tích hợp) "🎧 Nghe con vừa đàn" ở màn kết buổi: bản ghi trong bộ nhớ của buổi (src/ui/screens/sessionTakes.ts)
 * — hay nhất có điểm → bản cuối; chỉ bản từ lúc buổi bắt đầu.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { KEEP_SCORED, forgetTakes, rememberTake, scoreTake, sessionMemTake } from '../src/ui/screens/sessionTakes';

const blob = () => new Blob([new Uint8Array(4)]);
const take = (at: number, songId = 'frog') => rememberTake({ blob: blob(), seconds: 5, songId, title: songId, at });

describe('sessionTakes', () => {
  beforeEach(() => forgetTakes());

  it('không có bản ghi → null (nút ẩn)', () => {
    expect(sessionMemTake(0)).toBeNull();
  });

  it('chỉ có lượt chưa điểm (một câu / Album không lưu) → bản cuối', () => {
    take(100);
    const b = take(200);
    expect(sessionMemTake(50)).toBe(b);
  });

  it('có lượt có điểm → bản hay nhất của buổi, không phải bản cuối', () => {
    const a = take(100);
    scoreTake(a, { stars: 3, accuracy: 0.95 });
    const b = take(200);
    scoreTake(b, { stars: 2, accuracy: 0.99 });
    take(300);
    expect(sessionMemTake(50)).toBe(a);
  });

  it('bản của buổi trước không tính', () => {
    const old = take(100);
    scoreTake(old, { stars: 3, accuracy: 1 });
    expect(sessionMemTake(150)).toBeNull();
    const now = take(200);
    scoreTake(now, { stars: 1, accuracy: 0.5 });
    expect(sessionMemTake(150)).toBe(now);
  });

  it(`giữ tối đa ${KEEP_SCORED} lượt có điểm`, () => {
    for (let i = 0; i < KEEP_SCORED + 3; i++) scoreTake(take(i * 10), { stars: 1, accuracy: i / 10 });
    expect(sessionMemTake(0)?.at).toBe((KEEP_SCORED + 2) * 10);
  });
});
