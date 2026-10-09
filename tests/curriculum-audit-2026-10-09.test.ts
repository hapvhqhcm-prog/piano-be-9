import { describe, expect, it } from 'vitest';
import { WEEKS } from '../src/lessons/lessonEngine';
import type { Activity } from '../src/lessons/types';
import { findTune } from '../src/music/exercises';
import { allTimed, SONGS } from '../src/music/tune';
import { pitchToMidi, viName, type Pitch } from '../src/piano/pitchTable';

/**
 * (2026-10-09) Rà soát nhất quán toàn giáo trình sau nhiều đợt sửa song song — các lỗi tìm được có test chặn tái phát:
 * nốt / phím đen dùng trước khi dạy, trắng chấm (3 phách) trước tuần 6, ngón cùng một ngón trượt trong dấu luyến,
 * bàn tay "nhảy ngược hướng giai điệu" ở một bước liền (Greensleeves cũ).
 */

const ORDERED = WEEKS.flatMap((w) => w.lessons.flatMap((lesson) => lesson.activities.map((a, i) => ({ week: w.week, lesson, a, i }))));

const songPitches = (id: string): Pitch[] =>
  allTimed(findTune(id)!).flatMap((n) => (n.rest || !n.pitch ? [] : [n.pitch, ...(n.also ?? []).map((x) => x.pitch)]));

const actPitches = (a: Activity): Pitch[] => {
  switch (a.kind) {
    case 'notes':
      return a.segment.targets.flatMap((t) => t.keys);
    case 'song':
      return songPitches(a.songId);
    case 'dynamics':
      return a.rounds.flatMap((r) => r.pitches);
    case 'sing':
      return a.rounds.flatMap((r) => r.notes);
    default:
      return [];
  }
};

const introOf = (a: Activity): string => (a.kind === 'notes' ? `${a.segment.intro} ${a.segment.targets.map((t) => t.subtitle ?? '').join(' ')}` : 'intro' in a ? (a.intro ?? '') : '');

describe('Rà soát 2026-10-09: khái niệm trước khi dùng', () => {
  it('"Hát rồi đàn" chỉ hát nốt đã gặp ở hoạt động trước (vd không hát La trước thẻ dạy nốt La)', () => {
    const seen = new Set<string>();
    for (const x of ORDERED) {
      if (x.a.kind === 'sing') for (const p of x.a.rounds.flatMap((r) => r.notes)) expect(seen.has(p), `${x.lesson.id}#${x.i} ${p}`).toBe(true);
      for (const p of actPitches(x.a)) seen.add(p);
    }
  });

  it('mọi phím đen trong bài hát của giáo trình đã được dạy (thẻ nốt / nhại lại) hoặc gọi tên trước đó', () => {
    const taught = new Set<string>();
    let said = '';
    let lastWeek = 0;
    for (const x of ORDERED) {
      if (x.week !== lastWeek) {
        const w = WEEKS[x.week - 1];
        said += ` ${w.story} ${w.teach.text}`.toLowerCase();
        lastWeek = x.week;
      }
      said += ` ${introOf(x.a)}`.toLowerCase();
      if (x.a.kind === 'notes') for (const p of x.a.segment.targets.flatMap((t) => t.keys)) taught.add(viName(p).toLowerCase());
      if (x.a.kind !== 'song') continue;
      for (const p of songPitches(x.a.songId)) {
        if (p.length < 3) continue; // phím trắng
        const name = viName(p).toLowerCase();
        expect(taught.has(name) || said.includes(name), `${x.lesson.id}#${x.i} ${x.a.songId}: ${name}`).toBe(true);
      }
    }
  });

  it('bài dùng trong bài học trước tuần 6 không có nốt trắng chấm (3 phách) — chưa dạy', () => {
    for (const x of ORDERED.filter((y) => y.week < 6)) {
      if (x.a.kind !== 'song') continue;
      const bad = allTimed(findTune(x.a.songId)!).filter((n) => !n.rest && n.beats === 3);
      expect(bad.length, `${x.lesson.id} ${x.a.songId}`).toBe(0);
    }
  });
});

describe('Rà soát 2026-10-09: ngón tay', () => {
  it('trong một dấu luyến không có hai nốt khác phím liền nhau cùng một ngón (đàn LIỀN được)', () => {
    for (const t of SONGS) {
      for (const hand of ['RH', 'LH'] as const) {
        const ns = allTimed(t).filter((n) => !n.rest && n.pitch && n.hand === hand);
        let inSlur = false;
        for (let i = 0; i < ns.length; i++) {
          const n = ns[i];
          if (n.slur === 'start') inSlur = true;
          if (inSlur && i > 0 && ns[i - 1].slur !== 'end' && n.slur !== 'start') {
            const a = ns[i - 1];
            if (a.finger === n.finger && a.pitch !== n.pitch && !a.also && !n.also) {
              expect.fail(`${t.id} ${hand} nốt ${n.index}: ngón ${n.finger} ${a.pitch}→${n.pitch} trong dấu luyến`);
            }
          }
          if (n.slur === 'end') inSlur = false;
        }
      }
    }
  });

  it('bước liền (≤ 1 cung) không bắt bàn tay nhảy ngược hướng giai điệu / co 3+ ngón — trừ sau dấu lặng hoặc nốt dài', () => {
    const bad: string[] = [];
    for (const t of SONGS) {
      for (const hand of ['RH', 'LH'] as const) {
        const ns = allTimed(t).filter((n) => !n.rest && n.pitch && n.hand === hand && !n.also);
        for (let i = 1; i < ns.length; i++) {
          const a = ns[i - 1];
          const b = ns[i];
          if (a.finger == null || b.finger == null || a.also) continue;
          const dp = pitchToMidi(b.pitch!) - pitchToMidi(a.pitch!);
          if (dp === 0 || Math.abs(dp) > 2) continue;
          const df = (b.finger - a.finger) * (hand === 'RH' ? 1 : -1);
          const against = df !== 0 && Math.sign(df) !== Math.sign(dp) && a.finger !== 1 && b.finger !== 1;
          const squeeze = Math.abs(df) >= 3 && a.finger !== 1 && b.finger !== 1; // luồn ngón cái (4→1) là đúng kỹ thuật
          if (!against && !squeeze) continue;
          const gap = b.start - (a.start + a.beats) > 1e-9;
          if (gap || a.beats >= 1.5) continue;
          bad.push(`${t.id} ${hand} ô ${b.measure + 1}: ${a.pitch}/${a.finger}→${b.pitch}/${b.finger}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
