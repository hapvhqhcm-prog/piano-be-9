import { describe, expect, it } from 'vitest';
import { WEEKS } from '../src/lessons/lessonEngine';
import { findSong, songsUpToWeek, totalBeats, validateTune, beatsPerMeasure, allTimed, type Tune } from '../src/music/tune';

/**
 * Dân ca Việt Nam (OWNER yêu cầu 2026-10-05): giai điệu truyền thống, ký âm đối chiếu ≥ 2 nguồn.
 * Bản gốc 2/4 → app ghi trường độ gấp đôi ở 4/4 (móc kép → móc đơn). Mỗi bài nằm trong đúng tuần học được.
 */
const FOLK: Array<{ id: string; week: number; lessonId: string }> = [
  { id: 'ly_cay_da', week: 2, lessonId: 'w2-l3' },
  { id: 'inh_la_oi', week: 7, lessonId: 'w7-l3' },
  { id: 'xoe_hoa', week: 8, lessonId: 'w8-l1' },
  { id: 'bac_kim_thang', week: 14, lessonId: 'w14-bkt' },
  { id: 'ly_ngua_o', week: 18, lessonId: 'w18-l1' },
  { id: 'ly_cay_bong', week: 23, lessonId: 'w23-l1' },
];

const lessonSongs = (lessonId: string) =>
  WEEKS.flatMap((w) => w.lessons)
    .filter((l) => l.id === lessonId)
    .flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : [])));

/** Các nốt có cao độ theo thứ tự thời gian (gộp hai tay). */
const melody = (t: Tune) =>
  allTimed(t)
    .filter((n) => !n.rest && n.pitch)
    .sort((a, b) => a.start - b.start)
    .map((n) => `${n.pitch}:${n.beats}`);

describe.each(FOLK)('dân ca $id', ({ id, week, lessonId }) => {
  const song = findSong(id)!;

  it('có trong thư viện, ghi rõ dân ca / public domain / ký âm cho app', () => {
    expect(song, id).toBeDefined();
    expect(song.composer).toContain('Dân ca');
    expect(song.titleVi).toContain('dân ca');
    expect(song.title).toContain('Vietnamese folk song');
    expect(song.sourceStatus).toBe('public-domain');
    expect(song.arrangementBy).toContain('Ký âm đơn giản cho app');
    expect(song.week).toBe(week);
    expect(songsUpToWeek(week).map((s) => s.id)).toContain(id);
    expect(songsUpToWeek(week - 1).map((s) => s.id)).not.toContain(id);
  });

  it('tròn ô nhịp (nhịp lấy đà bằng dấu lặng đầu bài), đúng thế tay & số ngón', () => {
    expect(song.timeSignature).toBe('4/4');
    expect(totalBeats(song) % beatsPerMeasure(song)).toBe(0);
    expect(validateTune(song)).toEqual([]);
  });

  it('nằm trong bài học của tuần mình', () => {
    expect(lessonId.startsWith(`w${week}-`)).toBe(true);
    expect(lessonSongs(lessonId)).toContain(id);
  });

  it('số ngón hợp lý: mỗi ngón chỉ một phím trong cả bài (không dời tay, không cùng ngón hai phím)', () => {
    for (const hand of ['RH', 'LH'] as const) {
      const byFinger = new Map<number, Set<string>>();
      for (const n of allTimed(song)) {
        if (n.rest || !n.pitch || n.hand !== hand) continue;
        byFinger.set(n.finger!, (byFinger.get(n.finger!) ?? new Set()).add(n.pitch));
      }
      for (const [f, keys] of byFinger) expect([...keys], `${id} ${hand} ngón ${f}`).toHaveLength(1);
    }
  });
});

describe('dân ca — giai điệu & vị trí trong giáo trình', () => {
  it('Lý cây đa (tuần 2) chỉ dùng Đô Rê Mi, thế Đô', () => {
    const t = findSong('ly_cay_da')!;
    expect(new Set(melody(t).map((x) => x.split(':')[0]))).toEqual(new Set(['C4', 'D4', 'E4']));
    expect(t.position ?? 'C').toBe('C');
  });

  it('Bắc kim thang: lấy đà 2 móc đơn → ô 0 bắt đầu bằng 2 phách lặng; có nhịp chấm dôi (tuần 14)', () => {
    const t = findSong('bac_kim_thang')!;
    expect(t.notes[0]).toMatchObject({ rest: true, beats: 2 });
    expect(melody(t).slice(0, 4)).toEqual(['A4:1', 'G4:1', 'F4:1.5', 'C4:0.5']);
  });

  it('Xòe hoa & Lý ngựa ô có nhịp lấy đà; Lý cây bông hai tay luân phiên, không đánh cùng lúc', () => {
    expect(findSong('xoe_hoa')!.notes[0]).toMatchObject({ rest: true, beats: 3 });
    expect(findSong('ly_ngua_o')!.notes[0]).toMatchObject({ rest: true, beats: 2 });
    const bong = findSong('ly_cay_bong')!;
    expect(bong.hand).toBe('BOTH');
    const starts = allTimed(bong).filter((n) => !n.rest).map((n) => n.start);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('"Cầu London — chấm dôi" (bài lặp) đã được thay bằng "Bắc kim thang"', () => {
    expect(findSong('london_bridge_dotted')).toBeUndefined();
    expect(lessonSongs('w14-bkt')).toEqual(['bac_kim_thang', 'bac_kim_thang']);
  });
});
