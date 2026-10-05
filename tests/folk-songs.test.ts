import { describe, expect, it } from 'vitest';
import { WEEKS } from '../src/lessons/lessonEngine';
import { findSong, songsUpToWeek, totalBeats, validateTune, beatsPerMeasure, allTimed, measureCount, timeline, lhTimeline, type Tune } from '../src/music/tune';
import { beamGroups } from '../src/music/engrave';
import { pitchToMidi } from '../src/piano/pitchTable';

/**
 * Dân ca Việt Nam (OWNER yêu cầu 2026-10-05): giai điệu truyền thống, ký âm đối chiếu ≥ 2 nguồn.
 * Ghi đúng nhịp 2/4 và trường độ bản gốc (có móc kép) — mỗi ô bản ký âm = một ô. Mỗi bài nằm trong đúng tuần học được.
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
    expect(song.timeSignature).toBe('2/4');
    expect(beatsPerMeasure(song)).toBe(2);
    expect(totalBeats(song) % 2).toBe(0);
    // Mỗi ô nhịp (cả hai bè) đúng 2 phách: không nốt nào vắt qua vạch nhịp
    for (const v of [timeline(song), lhTimeline(song)]) {
      for (const n of v) expect(Math.floor((n.start + n.beats - 1e-9) / 2), `${id} nốt ${n.index}`).toBe(n.measure);
    }
    expect([40, 60]).toContain(song.bpm); // theo nốt đen, trên thang 40–50–60–72 (có móc kép → khởi đầu 40)
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

  it('mỗi bàn tay không mở rộng quá quãng 6 (bé 9 tuổi)', () => {
    for (const hand of ['RH', 'LH'] as const) {
      const midis = allTimed(song).filter((n) => !n.rest && n.pitch && n.hand === hand).map((n) => pitchToMidi(n.pitch!));
      if (midis.length) expect(Math.max(...midis) - Math.min(...midis), `${id} ${hand}`).toBeLessThanOrEqual(9);
    }
  });

  it('gạch nối 2/4: mỗi nhóm nằm gọn trong một phách', () => {
    for (const v of [timeline(song), lhTimeline(song)]) {
      for (const g of beamGroups(v, 2)) {
        const beats = new Set(g.map((i) => Math.floor(v[i].start + 1e-9)));
        expect(beats.size).toBe(1);
      }
    }
  });
});

/**
 * Bản ký âm nguồn (nhịp 2/4, nốt đen = 1 phách; "|" = vạch nhịp; ô đầu ngắn = nhịp lấy đà) — đối chiếu ≥ 2 nguồn,
 * xem ghi chú trong scripts/gen-songs.py. Xòe hoa: ô cuối "Fa trắng" (đàn một lượt, không nhắc lại).
 */
const SOURCE: Record<string, string> = {
  bac_kim_thang: 'A4:0.5 G4:0.5 | F4:0.75 C4:0.25 F4:0.5 G4:0.25 F4:0.25 | D4:1 D4:0.5 F4:0.5 | C4:0.75 C4:0.25 C4:0.5 F4:0.5 | D4:1 A4:0.5 A4:0.5 | C4:0.75 D4:0.25 C4:0.5 D4:0.5 | A4:1 A4:0.5 A4:0.5 | A4:0.75 A4:0.25 D4:0.5 D4:0.25 F4:0.25 | G4:1 G4:0.5 G4:0.5 | G4:0.75 A4:0.25 A4:0.5 D4:0.25 F4:0.25 | C4:1 F4:0.5 C4:0.5 | D4:0.5 D4:0.25 F4:0.25 C4:0.5 A4:0.5 | F4:0.5 C4:0.5 F4:0.5 R:0.5',
  ly_cay_bong: 'A4:0.5 G4:0.5 | A4:1 A4:0.5 G4:0.25 A4:0.25 | C5:0.5 E4:0.5 G4:0.5 E4:0.5 | G4:1 A4:0.25 G4:0.25 E4:0.25 G4:0.25 | A4:1.5 A4:0.5 | A4:0.5 G4:0.5 C4:0.5 G4:0.5 | E4:0.75 G4:0.25 A4:0.25 G4:0.25 E4:0.25 G4:0.25 | A4:1.5 D4:0.5 | E4:0.75 G4:0.25 E4:0.25 D4:0.25 C4:0.5 | A3:2 | C4:0.5 G3:0.5 A3:0.25 C4:0.25 D4:0.25 E4:0.25 | D4:1.5 D4:0.5 | E4:0.75 G4:0.25 E4:0.5 D4:0.25 C4:0.25 | A3:2 | C4:0.5 G3:0.5 A3:0.25 C4:0.25 D4:0.25 E4:0.25 | D4:2',
  ly_cay_da: 'R:1 C4:1 | D4:1 D4:0.5 C4:0.25 D4:0.25 | E4:1 D4:0.5 C4:0.25 D4:0.25 | E4:0.5 E4:0.25 D4:0.25 C4:0.5 D4:0.5 | C4:0.5 C4:0.5 D4:0.5 C4:0.25 D4:0.25 | E4:0.5 E4:0.25 D4:0.25 C4:0.5 D4:0.5 | C4:0.5 C4:0.5 D4:0.5 C4:0.25 D4:0.25 | E4:0.5 E4:0.25 D4:0.25 C4:0.5 D4:0.5 | C4:2 | C4:1 R:1',
  inh_la_oi: 'A4:1 E4:0.5 G4:0.5 | A4:2 | G4:1 E4:1 | D4:2 | A4:1 E4:1 | D4:1 E4:1 | A4:1 A4:0.5 G4:0.5 | E4:1 G4:1 | D4:1 E4:1 | A4:1 E4:1 | G4:1 G4:0.5 E4:0.5 | D4:2 | A4:1 E4:0.5 G4:0.5 | A4:2 | G4:1 G4:0.5 E4:0.5 | G4:2',
  xoe_hoa: 'C4:0.5 | F4:1 A4:1 | G4:1 G4:0.5 G4:0.5 | A4:1 D4:0.5 F4:0.5 | F4:1 G4:0.5 A4:0.5 | G4:0.5 F4:0.5 D4:0.5 C4:0.5 | C4:1 G4:0.5 A4:0.5 | D4:0.5 F4:0.5 G4:0.5 F4:0.5 | D4:1 G4:0.5 A4:0.5 | G4:0.5 F4:0.5 D4:0.5 C4:0.5 | F4:2',
  ly_ngua_o: 'C5:0.5 A4:0.5 | D4:0.5 F4:0.5 D4:0.5 F4:0.5 | G4:2 | R:2 | R:1 C5:0.5 A4:0.5 | D4:0.5 F4:0.5 D4:0.5 F4:0.5 | G4:1.5 F4:0.5 | G4:1 G4:1 | C5:1.5 G4:0.5 | C5:0.5 A4:0.5 D4:0.5 F4:0.5 | G4:2 | A4:0.5 G4:0.5 F4:0.5 A4:0.5 | G4:2',
};

describe.each(FOLK)('dân ca $id — đúng từng nốt với bản ký âm 2/4', ({ id }) => {
  it('cao độ, trường độ và thời điểm (gộp hai tay) khớp bản gốc; mỗi ô bản gốc = một ô', () => {
    const bars = SOURCE[id].split('|').map((b) => b.trim().split(/\s+/).map((x) => x.split(':')));
    const expected: string[] = [];
    let t = 0;
    bars.forEach((bar, i) => {
      const len = bar.reduce((s, [, b]) => s + Number(b), 0);
      if (i === 0 && len < 2) t = 2 - len; // nhịp lấy đà: bù lặng ở đầu ô 0
      else expect(len, `${id} ô ${i}`).toBe(2);
      for (const [p, b] of bar) {
        if (p !== 'R') expected.push(`${t}@${p}:${b}`);
        t += Number(b);
      }
    });
    const song = findSong(id)!;
    const got = allTimed(song)
      .filter((n) => !n.rest && n.pitch)
      .sort((a, b) => a.start - b.start)
      .map((n) => `${n.start}@${n.pitch}:${n.beats}`);
    expect(got).toEqual(expected);
    expect(totalBeats(song)).toBe(t);
    expect(measureCount(song)).toBe(bars.length);
  });
});

describe('dân ca — giai điệu & vị trí trong giáo trình', () => {
  it('Lý cây đa (tuần 2) chỉ dùng Đô Rê Mi, thế Đô', () => {
    const t = findSong('ly_cay_da')!;
    expect(new Set(melody(t).map((x) => x.split(':')[0]))).toEqual(new Set(['C4', 'D4', 'E4']));
    expect(t.position ?? 'C').toBe('C');
  });

  it('Bắc kim thang: lấy đà 2 móc đơn → ô 0 bắt đầu bằng lặng đen; có nhịp đơn chấm – móc kép (tuần 14)', () => {
    const t = findSong('bac_kim_thang')!;
    expect(t.notes[0]).toMatchObject({ rest: true, beats: 1 });
    expect(melody(t).slice(0, 4)).toEqual(['A4:0.5', 'G4:0.5', 'F4:0.75', 'C4:0.25']);
    expect(measureCount(t)).toBe(13); // ô lấy đà + 12 ô như bản ký âm
  });

  it('Xòe hoa & Lý ngựa ô có nhịp lấy đà; Lý cây bông hai tay luân phiên, không đánh cùng lúc', () => {
    expect(findSong('xoe_hoa')!.notes[0]).toMatchObject({ rest: true, beats: 1.5 });
    expect(findSong('ly_ngua_o')!.notes[0]).toMatchObject({ rest: true, beats: 1 });
    // Lý cây bông & Lý ngựa ô: chia theo âm vực, hai tay luân phiên — không bao giờ đánh cùng lúc
    for (const id of ['ly_cay_bong', 'ly_ngua_o']) {
      const t = findSong(id)!;
      expect(t.hand).toBe('BOTH');
      const starts = allTimed(t).filter((n) => !n.rest).map((n) => n.start);
      expect(new Set(starts).size, id).toBe(starts.length);
    }
  });

  it('"Cầu London — chấm dôi" (bài lặp) đã được thay bằng "Bắc kim thang"', () => {
    expect(findSong('london_bridge_dotted')).toBeUndefined();
    expect(lessonSongs('w14-bkt')).toEqual(['bac_kim_thang', 'bac_kim_thang']);
  });
});
