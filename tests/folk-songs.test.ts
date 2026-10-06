import { describe, expect, it } from 'vitest';
import { WEEKS } from '../src/lessons/lessonEngine';
import { findSong, songsUpToWeek, totalBeats, validateTune, beatsPerMeasure, allTimed, measureCount, timeline, lhTimeline, phraseRanges, type Tune } from '../src/music/tune';
import { beamGroups } from '../src/music/engrave';
import { midiToPitch, pitchToMidi } from '../src/piano/pitchTable';

/**
 * Dân ca Việt Nam (OWNER yêu cầu 2026-10-05): giai điệu truyền thống, ký âm đối chiếu ≥ 2 nguồn.
 * Ghi đúng nhịp 2/4 và trường độ bản gốc (có móc kép) — mỗi ô bản ký âm = một ô. Mỗi bài nằm trong đúng tuần học được.
 */
const FOLK: Array<{ id: string; week: number; lessonId: string }> = [
  // v5 (OWNER duyệt 2026-10-05): mỗi bài đặt SAU tuần dạy nhịp của nó — 2/4 (tuần 9), móc kép (tuần 18)
  // v5.1 (2026-10-06): tách tuần 18 → Bắc kim thang ở tuần 19 mới (sau Tập-tễnh tuần 18); tuần ≥ 19 cũ +1
  { id: 'ly_cay_da', week: 18, lessonId: 'w18-l2' },
  { id: 'inh_la_oi', week: 9, lessonId: 'w9-l2' },
  { id: 'xoe_hoa', week: 9, lessonId: 'w9-l4' },
  { id: 'bac_kim_thang', week: 19, lessonId: 'w19-bkt' },
  { id: 'ly_ngua_o', week: 24, lessonId: 'w24-ngua' },
  { id: 'ly_cay_bong', week: 27, lessonId: 'w27-l1' },
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
};

// Lý ngựa ô (bản đầy đủ, 2026-10-06): đối chiếu ở phần "Bài Việt Nam bổ sung" bên dưới
describe.each(FOLK.filter((f) => SOURCE[f.id]))('dân ca $id — đúng từng nốt với bản ký âm 2/4', ({ id }) => {
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
  it('Lý cây đa (tuần 18, v5) chỉ dùng Đô Rê Mi, thế Đô — bài để tập nhịp móc kép', () => {
    const t = findSong('ly_cay_da')!;
    expect(new Set(melody(t).map((x) => x.split(':')[0]))).toEqual(new Set(['C4', 'D4', 'E4']));
    expect(t.position ?? 'C').toBe('C');
  });

  it('Bắc kim thang: lấy đà 2 móc đơn → ô 0 bắt đầu bằng lặng đen; có nhịp đơn chấm – móc kép (tuần 18)', () => {
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
    expect(lessonSongs('w19-bkt')).toEqual(['bac_kim_thang', 'bac_kim_thang']);
  });
});

// ======================================================================================================
/**
 * BÀI VIỆT NAM BỔ SUNG (OWNER 2026-10-06): 10 dân ca + 3 ca khúc public domain (nhạc sĩ mất trước 1946).
 * Giai điệu chép ĐÚNG TỪNG NỐT từ tư liệu nghiên cứu (≥ 2 bản ký âm độc lập mỗi bài) — RESEARCH dưới đây là bản ký âm
 * GIỌNG GỐC như tư liệu ("|" = vạch nhịp, ô đầu = nhịp lấy đà, có thể rỗng; "~" = dây nối). Chỉ cho phép các thay đổi
 * tư liệu ghi rõ: dịch giọng (`transpose`), đổi quãng tám một nốt (`octave`), mở dấu nhắc lại / bỏ nhắc lại (`order`).
 * Dây nối qua vạch nhịp → đàn lại nốt (app chưa có dây nối; như "Lý cây đa").
 * Ca khúc PD (Luật SHTT Điều 19, 43): ghi tên nhạc sĩ, giữ nguyên tên bài, ghi rõ "Bản giản lược cho trẻ học đàn", KHÔNG có lời.
 */
type VnSpec = {
  id: string;
  composer: string;
  vn: 'folk' | 'composed';
  week: number;
  /** Bài học có bài này (nếu có) — còn lại nằm trong Thư viện, mở theo tuần */
  lessons?: string[];
  transpose?: number;
  octave?: Record<number, Record<number, number>>;
  order?: number[];
};
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
const NEW_VN: VnSpec[] = [
  { id: 'ga_gay', composer: 'Dân ca Cống', vn: 'folk', week: 10, lessons: ['w10-l2'] },
  { id: 'ly_cay_xanh', composer: 'Dân ca Nam Bộ', vn: 'folk', week: 11, lessons: ['w13-l2'] },
  { id: 'ngay_mua_vui', composer: 'Dân ca Thái', vn: 'folk', week: 13 },
  { id: 'ly_con_sao', composer: 'Dân ca Nam Bộ', vn: 'folk', week: 17 },
  // Bản giản lược: chơi một lượt, bỏ nhắc lại (đoạn A ô 1–12 + kết 2 ô 17–20; điệp khúc ô 21–34 + kết 2 ô 37–38)
  { id: 'xuan_va_tuoi_tre', composer: 'La Hối', vn: 'composed', week: 17, order: [...range(0, 13), ...range(17, 35), 37, 38] },
  { id: 'co_la', composer: 'Dân ca Bắc Bộ', vn: 'folk', week: 18, lessons: ['w20-l1'], transpose: -5 },
  { id: 'mua_roi', composer: 'Dân ca Xá', vn: 'folk', week: 18 },
  { id: 'trong_com', composer: 'Dân ca quan họ Bắc Ninh', vn: 'folk', week: 20 },
  { id: 'beo_dat_may_troi', composer: 'Dân ca Bắc Bộ', vn: 'folk', week: 24 },
  // Bản đầy đủ: nhắc lại ô 24–31 như bản in (lượt 2 vào kết 2, ô 32); Sol3 ô 29 lên quãng tám (tư liệu cho phép)
  { id: 'ly_ngua_o', composer: 'Dân ca Nam Bộ', vn: 'folk', week: 24, lessons: ['w24-ngua'], octave: { 29: { 1: 12 } }, order: [...range(0, 32), ...range(24, 30), 32] },
  { id: 'dem_thu', composer: 'Đặng Thế Phong', vn: 'composed', week: 25 },
  { id: 'con_thuyen_khong_ben', composer: 'Đặng Thế Phong', vn: 'composed', week: 26 },
  { id: 'nguoi_oi_nguoi_o_dung_ve', composer: 'Dân ca quan họ Bắc Ninh', vn: 'folk', week: 27 },
];

/** Bản ký âm trong tư liệu nghiên cứu (giọng của tư liệu, chưa dịch giọng / mở nhắc lại) */
const RESEARCH: Record<string, string> = {
  co_la: 'C5:0.5 | G4:1 G4:0.5 C5:0.5 | G4:0.5 C5:0.5 G4:0.25 C5:0.25 A4:0.25 G4:0.25 | A4:1.5 A4:0.25 G4:0.25 | F4:1 F4:0.5 F4:0.25 G4:0.25 | C5:1.5 A4:0.25 G4:0.25 | A4:0.75 G4:0.25 A4:0.25 G4:0.25 A4:0.25 C5:0.25 | F4:1 F4:0.5 G4:0.25 C5:0.25 | A4:0.75 G4:0.25 A4:0.25 G4:0.25 A4:0.25 C5:0.25 | F4:1 G4:0.5 F4:0.5 | F4:1 G4:0.5 F4:0.5 | G4:0.75 A4:0.25 C4:0.5 F4:0.25 G4:0.25 | A4:0.75 G4:0.25 A4:0.25 C5:0.25 A4:0.25 G4:0.25 | F4:1 C4:0.5 F4:0.25 G4:0.25 | A4:0.75 G4:0.25 A4:0.25 C5:0.25 A4:0.25 G4:0.25 | F4:1 R:0.5',
  trong_com: 'D4:0.5 | D4:0.5 G4:0.5 G4:0.5 A4:0.25 G4:0.25 | D4:0.5 D4:0.5 D4:0.5 G4:0.5 | G4:0.5 G4:0.25 G4:0.25 D4:0.5 D4:0.25 C4:0.25 | D4:0.5 G4:0.25 G4:0.25 D4:0.5 D4:0.25 C4:0.25 | D4:1 R:0.5 G4:0.5 | G4:0.75 A4:0.25 G4:0.5 A4:0.5 | B4:1 R:0.5 G4:0.5 | G4:0.75 A4:0.25 G4:0.5 A4:0.5 | B4:0.5 B4:0.25 B4:0.25 D4:0.75 E4:0.25 | D4:0.75 E4:0.25 D4:0.25 E4:0.25 D4:0.25 E4:0.25 | G4:0.5 G4:0.25 G4:0.25 E4:0.25 D4:0.25 E4:0.25 G4:0.25 | D4:0.5 E4:0.5 G4:0.5 E4:0.5 | D4:1.5 D4:0.25 D4:0.25 | G4:0.5 G4:0.25 G4:0.25 D4:0.25 E4:0.25 D4:0.25 E4:0.25 | G4:1.5 D4:0.25 D4:0.25 | G4:0.5 G4:0.25 G4:0.25 D4:0.25 E4:0.25 D4:0.25 E4:0.25 | G4:1.5 G4:0.5 | G4:0.75 A4:0.25 G4:0.5 A4:0.5 | D4:1 D5:0.75 E5:0.25 | D5:0.75 D5:0.25 E5:0.5 B4:0.25 A4:0.25 | B4:1.5 B4:0.25 A4:0.25 | B4:0.75 D5:0.25 D5:0.5 B4:0.25 A4:0.25 | G4:0.5 E4:0.5 G4:0.5 E4:0.5 | D4:1.5 E4:0.25 D4:0.25 | B3:0.5 D4:0.5 B3:0.25 D4:0.25 B3:0.25 A3:0.25 | G3:1.5 E4:0.25 D4:0.25 | B3:0.5 D4:0.5 B3:0.25 D4:0.25 B3:0.25 A3:0.25 | G3:1.5',
  beo_dat_may_troi: 'R:1 G4:1 | G4:1 D5:0.5 B4:0.25 C5:0.25 | D5:1 E5:0.5 D5:0.5 | D5:1 B4:1 | B4:1 B4:0.25 A4:0.25 B4:0.25 D5:0.25 | G4:1 G4:0.25 B4:0.25 A4:0.25 G4:0.25 | D4:2 | D5:0.5 G5:0.5 B4:0.5 C5:0.5 | D5:1 B4:1 | B4:1 B4:0.25 A4:0.25 B4:0.25 D5:0.25 | G4:1 G4:0.25 B4:0.25 A4:0.25 G4:0.25 | D4:2 | E4:0.5 G4:0.5 G4:0.5 A4:0.25 B4:0.25 | B4:1.5 A4:0.5 | B4:1 B4:0.5 A4:0.5 | G4:0.75 A4:0.25 B4:0.25 A4:0.25 B4:0.25 D5:0.25 | G4:0.5 D4:1 G4:0.5 | D4:0.5 G4:0.5 A4:0.5 B4:0.25 A4:0.25 | G4:2',
  nguoi_oi_nguoi_o_dung_ve: 'G4:0.5 | G4:1 C5:1 | G4:0.5 C5:0.5 D5:0.25 C5:0.25 B4:0.25 D5:0.25 | C5:0.75 D5:0.25 C5:1 | D5:0.25 C5:0.25 D5:0.25 F5:0.25 D5:0.5 C5:0.5 | A4:1 G4:0.25 C5:0.25 A4:0.25 G4:0.25 | F4:2 | A4:0.5 G4:0.25 C5:0.25 A4:1 | G4:0.5 F4:0.5 D4:0.5 F4:0.5 | G4:0.5 A4:0.5 A4:0.25 G4:0.25 F4:0.25 G4:0.25 | A4:1 C4:0.5 C4:0.5 | D4:0.5 A4:0.5 G4:0.5 F4:0.5 | C4:1.5 F4:0.5 | C4:0.5 F4:0.5 A4:0.25 C5:0.25 A4:0.25 G4:0.25 | F4:1.5 F4:0.25 G4:0.25 | A4:0.5 A4:0.5 G4:0.25 C5:0.25 A4:0.25 G4:0.25 | F4:2',
  ly_cay_xanh: 'A4:0.5 | G4:1 G4:1 | G4:1 R:0.5 E4:0.5 | C5:1 A4:1 | G4:1 R:0.5 G4:0.5 | E4:0.5 G4:0.5 E4:0.5 D4:0.5 | C4:1 R:0.5 G4:0.5 | C5:1 A4:1 | G4:1 R:0.5 A4:0.5 | G4:0.5 E4:0.5 G4:0.5 A4:0.5 | G4:1 R:0.5 A4:0.5 | G4:0.5 E4:0.5 G4:0.5 A4:0.5 | G4:2',
  ly_con_sao: 'G4:1 | G4:1 G4:1 | G4:0.5 C5:0.5 B4:0.5 D5:0.5 | C5:2 | D5:1.5 E5:0.5 | D5:1 C5:0.5 B4:0.5 | G4:1 G4:1 | G4:0.5 C5:0.5 C5:0.5 B4:0.5 | C5:2 | D5:1.5 E5:0.5 | D5:1 B4:1 | C5:1 D5:1 | G4:1 R:1 | G4:1 D4:1 | G4:1 D4:1 | D4:1 A4:0.5 C5:0.5 | G4:1 R:1 | G4:1 D4:1 | G4:1 D4:1 | D4:1 A4:0.5 C5:0.5 | G4:2',
  mua_roi: 'G4:0.5 | G4:0.5 G4:0.5 A4:0.5 C5:0.5 | A4:1 G4:0.5 E4:0.5 | G4:0.5 E4:0.25 G4:0.25 C4:0.5 R:0.5 | R:1.5 G3:0.5 | G3:0.5 C4:0.5 C4:0.5 E4:0.5 | E4:0.5 G4:0.5 F4:0.5 A4:0.5~ | A4:1 G4:0.5 E4:0.5 | G4:0.5 E4:0.25 G4:0.25 C4:0.5 R:0.5 | R:1.5 G4:0.5 | G4:0.5 G4:0.5 A4:0.5 C5:0.5 | E4:1 G4:0.25 A4:0.25 E4:0.25 G4:0.25 | A4:1 G4:0.25 A4:0.25 E4:0.25 G4:0.25 | C4:0.5 R:1 G3:0.5 | G3:0.5 C4:0.5 C4:0.5 E4:0.5 | E4:0.5 G4:0.5 G4:0.5 F4:0.5 | A4:1 G4:0.5 E4:0.5 | G4:0.5 G3:0.5 E4:0.5 C4:0.5~ | C4:1 R:1',
  ngay_mua_vui: 'A4:0.5 | A4:1 E5:0.5 E5:0.5 | D5:1 R:0.5 D5:0.5 | D5:1 E5:0.5 D5:0.5 | B4:1 R:0.5 A4:0.5 | B4:0.5 A4:0.5 G4:0.5 A4:0.5 | A4:1 B4:0.5 D5:0.5 | B4:0.5 A4:0.5 G4:0.5 A4:0.5 | E4:1 R:0.5 D4:0.5 | E4:0.5 D4:0.5 E4:0.5 G4:0.5 | A4:1 B4:0.5 D5:0.5 | B4:0.5 A4:0.5 G4:0.5 A4:0.5 | A4:1 R:0.5 D4:0.5 | E4:0.5 D4:0.5 E4:0.5 G4:0.5 | A4:1 B4:0.5 D5:0.5 | B4:0.5 A4:0.5 G4:0.5 A4:0.5 | A4:1 R:0.5',
  ga_gay: ' | A4:0.5 G4:0.5 B4:0.5 A4:0.5 | B4:0.5 A4:0.5 G4:0.5 E4:0.5 | G4:2 | G4:1 R:1 | G4:0.5 B4:0.5 B4:0.5 A4:0.5 | B4:0.5 A4:0.5 G4:0.5 E4:0.5 | D4:2 | D4:1 R:1 | B4:1 B4:0.5 A4:0.5 | G4:1 D4:0.5 E4:0.5 | G4:0.5 A4:0.5 G4:0.5 E4:0.5 | A4:2 | A4:1 R:1 | D4:1 D4:0.5 E4:0.5 | G4:0.5 A4:0.5 G4:0.5 E4:0.5 | G4:2 | G4:1 R:1',
  ly_ngua_o: 'B4:0.5 A4:0.5 | G4:0.5 B4:0.5 E4:0.5 G4:0.5 | A4:1 R:0.5 B4:0.25 A4:0.25 | G4:0.5 B4:0.5 E4:0.5 G4:0.5 | A4:0.5 R:0.5 B4:0.5 A4:0.5 | G4:0.5 B4:0.5 E4:0.5 G4:0.5 | A4:1 R:0.5 E4:0.25 G4:0.25 | A4:1 A4:0.5 B4:0.5 | R:0.5 D5:1 B4:0.5 | D5:1 E4:0.5 G4:0.5 | A4:1 R:0.5 B4:0.25 A4:0.25 | G4:0.5 B4:0.5 A4:0.5 R:0.5 | R:1.5 A4:0.5 | A4:1 D5:1 | E4:0.5 G4:0.5 R:0.5 E4:0.5 | E4:0.5 G4:0.5 D4:1 | A4:1 B4:1 | R:0.5 A4:1 D5:0.5 | E4:0.5 G4:0.5 R:0.5 G4:0.5 | G4:1 D4:1 | B4:1 B4:0.5 A4:0.5 | R:0.5 G4:0.5 E4:0.5 D4:0.5 | D4:1.5 E4:0.5 | D4:1 A3:1 | E4:1 A4:0.5 R:0.5 | R:0.5 E4:1 D4:0.5 | A3:1 E4:0.5 R:0.5 | R:0.5 D4:0.5 A3:1 | R:1 E4:0.5 D4:0.5 | C4:1 G3:1 | D4:1.5 E4:0.5 | D4:1 A3:1 | D4:1 R:1',
  xuan_va_tuoi_tre: 'G4:1 | E5:2 D5:1 | C5:1 E4:1 G4:1 | B4:3 | B4:1 R:1 A4:1 | C5:2 B4:1 | A4:1 C4:1 E4:1 | G4:3 | G4:1 R:1 E4:1 | D4:2 E4:1 | C4:1 E4:1 G4:1 | A4:3 | A4:1 R:1 A4:1 | C5:2 C5:1 | B4:1 G4:1 A4:1 | E4:3 | E4:1 R:1 G4:1 | C5:2 B4:1 | A4:1 G4:1 A4:1 | C5:3 | C5:1 R:1 C5:0.5 D5:0.5 | C5:2 B4:0.5 C5:0.5 | B4:1.5 A4:0.5 B4:1 | E4:3 | E4:1 R:1 A4:0.5 B4:0.5 | A4:2 G4:0.5 A4:0.5 | G4:1.5 C4:0.5 D4:1 | E4:3 | E4:1 R:1 D4:0.5 E4:0.5 | C4:2 D4:0.5 E4:0.5 | G4:1.5 E4:0.5 G4:1 | A4:3 | A4:1 R:1 A4:0.5 C5:0.5 | B4:2 A4:0.5 B4:0.5 | A4:1.5 G4:0.5 A4:1 | E5:3 | D5:1 R:1 C5:0.5 D5:0.5 | C5:3 | C5:2 R:1',
  dem_thu: ' | E4:1 A4:1 C5:1 | E5:2 C5:0.5 E5:0.5 | B4:2 B4:0.5 C5:0.5 | A4:3 | E4:1 A4:1 C5:1 | E5:2 F5:1 | E5:2 D#5:1 | E5:3 | F5:1 E5:0.5 D5:0.5 A4:0.5 B4:0.5 | C5:3 | E5:1 D5:0.5 C5:0.5 E4:0.5 G#4:0.5 | B4:2 C5:1 | A4:3 | A4:3',
  con_thuyen_khong_ben: 'E4:0.5 E4:0.5 E4:0.5 E4:0.5 A3:1 D4:0.5 | E4:4 | R:0.5 A4:0.5 A4:0.5 A4:0.5 A4:0.5 E4:1 G4:0.5 | A4:4 | R:0.5 A4:0.5 B4:0.5 A4:0.5 C5:0.5 B4:1 A4:0.5 | E4:4 | R:0.5 E4:0.5 F4:0.5 E4:0.5 D4:0.5 A3:1 C4:0.5 | A3:4 | R:0.5 E4:0.5 E4:0.5 E4:0.5 E4:0.5 A3:1 D4:0.5 | E4:4 | R:0.5 A4:0.5 A4:0.5 A4:0.5 A4:0.5 E4:1 G4:0.5 | A4:4 | R:0.5 A4:0.5 B4:0.5 A4:0.5 C5:0.5 B4:1 A4:0.5 | E4:4 | R:0.5 E4:0.5 F4:0.5 E4:0.5 D4:0.5 G3:1 C4:0.5 | A3:4',
};

const songLessons = (id: string) =>
  WEEKS.flatMap((w) => w.lessons).filter((l) => l.activities.some((a) => a.kind === 'song' && a.songId === id));

describe.each(NEW_VN)('bài Việt Nam $id', (spec) => {
  const song = findSong(spec.id)!;
  const per = () => beatsPerMeasure(song);
  const both = () => [timeline(song), lhTimeline(song)];

  it('ghi đúng nguồn gốc: tác giả, public domain, tên Việt có xuất xứ, không có lời', () => {
    expect(song, spec.id).toBeDefined();
    expect(song.composer).toBe(spec.composer);
    expect(song.sourceStatus).toBe('public-domain');
    expect(song.attributionRequired).toBe(false);
    expect(song.vn).toBe(spec.vn);
    expect(song.aka).toBeUndefined();
    if (spec.vn === 'folk') {
      expect(song.titleVi).toMatch(/\((giai điệu )?dân ca /);
      expect(song.titleVi.toLowerCase()).toContain(spec.composer.replace(/^Dân ca /, '').toLowerCase());
      expect(song.arrangementBy).toContain('Ký âm đơn giản cho app');
    } else {
      expect(song.titleVi).toContain(`(nhạc ${spec.composer})`);
      expect(song.arrangementBy).toContain('Bản giản lược cho trẻ học đàn');
      expect(song.arrangementBy).toContain('không có lời');
    }
    // Chỉ giai điệu: không trường nào ngoài định dạng bài hát (không lời)
    const allowed = ['id', 'title', 'titleVi', 'vn', 'composer', 'sourceStatus', 'arrangementBy', 'attributionRequired',
      'hand', 'bpm', 'timeSignature', 'week', 'phrases', 'position', 'lhPosition', 'notes', 'lh'];
    for (const k of Object.keys(song)) expect(allowed, k).toContain(k);
    for (const n of [...song.notes, ...(song.lh ?? [])]) {
      for (const k of Object.keys(n)) expect(['pitch', 'beats', 'finger', 'rest', 'dyn', 'slur'], k).toContain(k);
    }
  });

  it('đúng tuần: mở trong Thư viện từ tuần của bài; bài học (nếu có) không sớm hơn', () => {
    expect(song.week).toBe(spec.week);
    expect(songsUpToWeek(spec.week).map((s) => s.id)).toContain(spec.id);
    expect(songsUpToWeek(spec.week - 1).map((s) => s.id)).not.toContain(spec.id);
    expect(songLessons(spec.id).map((l) => l.id).sort()).toEqual([...(spec.lessons ?? [])].sort());
    for (const l of songLessons(spec.id)) expect(l.week).toBeGreaterThanOrEqual(spec.week);
  });

  it('nhịp / phím / kỹ năng của bài đều đã được dạy trước tuần của bài', () => {
    const w = song.week!;
    if (song.timeSignature === '2/4') expect(w).toBeGreaterThanOrEqual(9);
    if (song.timeSignature === '3/4') expect(w).toBeGreaterThanOrEqual(15);
    if (song.hand === 'BOTH') expect(w).toBeGreaterThanOrEqual(11);
    for (const v of both()) {
      for (const n of v) {
        if (n.rest) continue;
        if (n.beats < 0.5) expect(w, 'móc kép').toBeGreaterThanOrEqual(18);
        if (n.beats === 0.75) expect(w, 'Tập-tễnh').toBeGreaterThanOrEqual(18);
        if (n.beats === 1.5) expect(w, 'đen chấm dôi').toBeGreaterThanOrEqual(17);
        if (n.start % 1 > 1e-9 && n.start + n.beats > Math.ceil(n.start) + 1e-9) expect(w, 'nghịch phách').toBeGreaterThanOrEqual(19);
        if (/[#b]/.test(n.pitch!.slice(1, -1))) expect(w, 'phím đen').toBeGreaterThanOrEqual(16);
        if (n.dyn) expect(w).toBeGreaterThanOrEqual(6);
        if (n.slur) expect(w).toBeGreaterThanOrEqual(12);
      }
    }
    expect(song.bpm).toBe([...song.notes, ...(song.lh ?? [])].some((n) => n.beats < 0.5) ? 40 : 60);
  });

  it('tròn ô nhịp: không nốt nào vắt qua vạch nhịp; số ngón hợp lệ', () => {
    expect(totalBeats(song) % per()).toBe(0);
    for (const v of both()) for (const n of v) expect(Math.floor((n.start + n.beats - 1e-9) / per()), `${spec.id} nốt ${n.index}`).toBe(n.measure);
    expect(validateTune(song)).toEqual([]);
  });

  it('hai tay LUÂN PHIÊN: không bao giờ đánh cùng lúc', () => {
    const starts = allTimed(song).filter((n) => !n.rest).map((n) => n.start);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('trong mỗi câu, mỗi bàn tay: một ngón ↔ một phím, ngón theo thứ tự phím, tầm ≤ quãng 6', () => {
    for (const [a, b] of phraseRanges(song)) {
      for (const hand of ['RH', 'LH'] as const) {
        const ns = allTimed(song).filter((n) => !n.rest && n.hand === hand && n.measure >= a && n.measure < b);
        const f2k = new Map<number, Set<string>>();
        const k2f = new Map<string, Set<number>>();
        for (const n of ns) {
          f2k.set(n.finger!, (f2k.get(n.finger!) ?? new Set()).add(n.pitch!));
          k2f.set(n.pitch!, (k2f.get(n.pitch!) ?? new Set()).add(n.finger!));
        }
        for (const [f, ks] of f2k) expect([...ks], `${spec.id} ô ${a}–${b} ${hand} ngón ${f}`).toHaveLength(1);
        for (const [k, fs] of k2f) expect([...fs], `${spec.id} ô ${a}–${b} ${hand} phím ${k}`).toHaveLength(1);
        const keys = [...k2f.keys()].sort((x, y) => pitchToMidi(x) - pitchToMidi(y));
        const fingers = keys.map((k) => [...k2f.get(k)!][0]);
        // tay phải: phím cao hơn → ngón số lớn hơn; tay trái ngược lại (không vắt / luồn ngón)
        for (let i = 1; i < fingers.length; i++) {
          expect(hand === 'RH' ? fingers[i] > fingers[i - 1] : fingers[i] < fingers[i - 1], `${spec.id} ${hand} ${keys.join(' ')}`).toBe(true);
        }
        if (keys.length) expect(pitchToMidi(keys[keys.length - 1]) - pitchToMidi(keys[0]), `${spec.id} ô ${a} ${hand}`).toBeLessThanOrEqual(9);
      }
    }
  });

  it('chỉ đổi thế tay ở đầu câu, khi tay đó còn ≥ 1 phách (đang nghỉ / nốt dài)', () => {
    const ranges = phraseRanges(song);
    for (const hand of ['RH', 'LH'] as const) {
      const ns = allTimed(song).filter((n) => !n.rest && n.hand === hand).sort((x, y) => x.start - y.start);
      const map = (r: [number, number]) => new Map(ns.filter((n) => n.measure >= r[0] && n.measure < r[1]).map((n) => [n.finger!, n.pitch!]));
      for (let i = 1; i < ranges.length; i++) {
        const prev = map(ranges[i - 1]);
        const changed = [...map(ranges[i])].filter(([f, k]) => prev.has(f) && prev.get(f) !== k).map(([f]) => f);
        if (!changed.length) continue;
        const last = ns.filter((n) => n.measure < ranges[i][0]).pop()!;
        const first = ns.find((n) => n.measure >= ranges[i][0] && changed.includes(n.finger!))!;
        expect(first.start - last.start, `${spec.id} ${hand} đổi thế ở ô ${ranges[i][0]}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('đúng TỪNG NỐT với bản ký âm trong tư liệu (cao độ, trường độ, thời điểm — gộp hai tay)', () => {
    const src = RESEARCH[spec.id].split('|').map((b) => b.trim().split(/\s+/).filter(Boolean).map((x) => x.replace('~', '').split(':')));
    const order = spec.order ?? range(src[0].length ? 0 : 1, src.length);
    const expected: string[] = [];
    let t = 0;
    order.forEach((i, k) => {
      const bar = src[i];
      const len = bar.reduce((s, [, b]) => s + Number(b), 0);
      if (k === 0 && len < per()) t = per() - len; // nhịp lấy đà
      else if (k < order.length - 1) expect(len, `${spec.id} ô ${i}`).toBe(per());
      bar.forEach(([p, b], j) => {
        if (p !== 'R') expected.push(`${t}@${midiToPitch(pitchToMidi(p) + (spec.transpose ?? 0) + (spec.octave?.[i]?.[j] ?? 0))}:${b}`);
        t += Number(b);
      });
    });
    const got = allTimed(song)
      .filter((n) => !n.rest && n.pitch)
      .sort((a, b) => a.start - b.start)
      .map((n) => `${n.start}@${n.pitch}:${n.beats}`);
    expect(got).toEqual(expected);
    expect(measureCount(song)).toBe(order.length);
    expect(totalBeats(song) - t).toBeGreaterThanOrEqual(0);
    expect(totalBeats(song) - t).toBeLessThan(per()); // ô cuối chỉ bù dấu lặng
  });
});

describe('bài Việt Nam bổ sung — tổng quát', () => {
  it('13 bài mới (10 dân ca, 3 ca khúc nhạc sĩ đã thuộc về công chúng); Lý ngựa ô là bản đầy đủ', () => {
    expect(NEW_VN.filter((s) => s.vn === 'folk')).toHaveLength(10);
    expect(NEW_VN.filter((s) => s.vn === 'composed').map((s) => s.composer).sort()).toEqual(['La Hối', 'Đặng Thế Phong', 'Đặng Thế Phong'].sort());
    expect(measureCount(findSong('ly_ngua_o')!)).toBe(39); // lấy đà + 31 ô + nhắc lại 6 ô + kết 2
  });

  it('Đêm thu giữ nốt cảm âm (phím đen) như bản gốc: Sol♯, Rê♯', () => {
    const ps = new Set(allTimed(findSong('dem_thu')!).flatMap((n) => (n.pitch ? [n.pitch] : [])));
    expect(ps.has('G#4') && ps.has('D#5')).toBe(true);
  });
});
