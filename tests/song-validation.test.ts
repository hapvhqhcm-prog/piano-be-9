import { describe, expect, it } from 'vitest';
import {
  SONGS,
  accompaniment,
  allTimed,
  measureCount,
  onsets,
  phraseRanges,
  playable,
  slice,
  timeline,
  totalBeats,
  tuneRange,
  validateTune,
  type Tune,
} from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';

const ALLOWED = [
  'id', 'title', 'titleVi', 'vn', 'aka', 'composer', 'sourceStatus', 'arrangementBy', 'attributionRequired',
  'hand', 'bpm', 'timeSignature', 'week', 'extension', 'position', 'lh', 'lhPosition', 'phrases', 'notes',
];

it('có 82 bài hát (56 cũ + 14 bài tự sáng tác v5 + 12 bài Việt Nam 2026-10-06), id không trùng, đủ tuần 2–30 (trừ 21 — hòa nhạc Cấp 2; v5.1: 31 tuần)', () => {
  // 51 bài + 6 bài dân ca Việt Nam − "Cầu London — chấm dôi" (bài lặp, thay bằng "Bắc kim thang") — OWNER yêu cầu 2026-10-05
  // v5 (OWNER duyệt 2026-10-05): + 14 bài tự sáng tác cho tuần củng cố / tuần nhịp mới (giữ đủ 56 bài cũ)
  // 2026-10-06: + 9 dân ca + 3 ca khúc nhạc sĩ Việt Nam đã thuộc về công chúng (Lý ngựa ô thay bằng bản đầy đủ — cùng id)
  expect(SONGS).toHaveLength(82);
  expect(new Set(SONGS.map((s) => s.id)).size).toBe(82);
  const weeks = new Set(SONGS.map((s) => s.week));
  for (let w = 2; w <= 30; w++) if (w !== 21) expect(weeks.has(w), `tuần ${w}`).toBe(true);
});

it('bài Việt Nam (2026-10-06): 15 dân ca vn=folk; 3 ca khúc PD vn=composed; bài quen hát lời Việt vn=lyrics, tên gọi khác chỉ là tên', () => {
  const folk = SONGS.filter((s) => s.vn === 'folk').map((s) => s.id).sort();
  expect(folk).toEqual([
    'bac_kim_thang', 'beo_dat_may_troi', 'co_la', 'ga_gay', 'inh_la_oi', 'ly_cay_bong', 'ly_cay_da', 'ly_cay_xanh', 'ly_con_sao',
    'ly_ngua_o', 'mua_roi', 'ngay_mua_vui', 'nguoi_oi_nguoi_o_dung_ve', 'trong_com', 'xoe_hoa',
  ]);
  // mọi bài "Dân ca <vùng miền / dân tộc Việt Nam>" đều được đánh dấu
  for (const s of SONGS) if (/^Dân ca (Nam Bộ|Bắc Bộ|quan họ|Thái|Xá|Cống)/.test(s.composer ?? '')) expect(s.vn, s.id).toBe('folk');
  // Ca khúc nhạc sĩ Việt Nam đã thuộc về công chúng: ghi tên nhạc sĩ, "bản giản lược", chỉ giai điệu
  const composed = SONGS.filter((s) => s.vn === 'composed');
  expect(composed.map((s) => s.id).sort()).toEqual(['con_thuyen_khong_ben', 'dem_thu', 'xuan_va_tuoi_tre']);
  for (const s of composed) {
    expect(['La Hối', 'Đặng Thế Phong']).toContain(s.composer);
    expect(s.arrangementBy).toContain('Bản giản lược cho trẻ học đàn');
  }
  const lyrics = SONGS.filter((s) => s.vn === 'lyrics').map((s) => s.id);
  for (const id of ['frere_jacques_easy', 'twinkle_easy', 'birthday_both', 'jingle_bells']) expect(lyrics).toContain(id);
  expect(SONGS.find((s) => s.id === 'twinkle_easy')!.aka).toBe('Sao nhỏ lấp lánh');
  expect(SONGS.find((s) => s.id === 'jingle_bells')!.aka).toBe('Leng keng');
  expect(SONGS.find((s) => s.id === 'frere_jacques_easy')!.titleVi).toBe('Kìa con bướm vàng');
  for (const s of SONGS) {
    if (s.aka !== undefined) {
      expect(s.vn, s.id).toBeDefined();
      expect(s.aka.length, s.id).toBeLessThan(30);
    }
  }
});

it('giảm bài lặp (OWNER duyệt 2026-10-05): Bài ca niềm vui ≤ 6, Chú cừu ≤ 3; có 4 bài tự sáng tác mới', () => {
  expect(SONGS.filter((s) => s.id.startsWith('ode_to_joy')).length).toBeLessThanOrEqual(6);
  expect(SONGS.filter((s) => s.id.startsWith('mary')).length).toBeLessThanOrEqual(3);
  for (const id of ['robot_march', 'superhero_fly', 'ninja_tiptoe', 'drifting_boat']) {
    const s = SONGS.find((x) => x.id === id);
    expect(s, id).toBeDefined();
    expect(s!.arrangementBy).toContain('tự sáng tác');
  }
});

describe.each(SONGS.map((s) => [s.id, s] as const))('bài hát %s', (_id, song: Tune) => {
  it('chỉ có các trường định dạng v3, public domain', () => {
    for (const k of Object.keys(song)) expect(ALLOWED).toContain(k);
    expect(song.sourceStatus).toBe('public-domain');
    expect(song.attributionRequired).toBe(false);
    expect(['4/4', '3/4', '2/4']).toContain(song.timeSignature);
    // Tốc độ theo nốt đen, trên thang 40–50–60–72; bài có móc kép (dân ca 2/4) khởi đầu chậm ở 40
    const has16th = [...song.notes, ...(song.lh ?? [])].some((n) => n.beats < 0.5);
    expect(song.bpm).toBe(has16th ? 40 : 60);
  });

  it('sắc thái / ngắt / luyến (v4) hợp lệ: p/mf/f từ tuần 6, ngắt & luyến từ tuần 12, luyến đóng mở đúng', () => {
    for (const v of [song.notes, song.lh ?? []]) {
      let open = false;
      let cur: string | undefined;
      let prev: string | undefined;
      for (const n of v) {
        if (n.dyn !== undefined) {
          expect(['p', 'mf', 'f']).toContain(n.dyn);
          expect(n.dyn).not.toBe(cur); // không ghi lặp cùng một sắc thái
          cur = n.dyn;
          expect(song.week).toBeGreaterThanOrEqual(6);
        }
        if (n.rest) {
          expect(n.stac ?? n.slur).toBeUndefined();
          continue;
        }
        if (n.stac !== undefined || n.slur !== undefined) expect(song.week).toBeGreaterThanOrEqual(12);
        if (n.stac !== undefined) {
          expect(n.stac).toBe(true);
          expect(open).toBe(false); // không ngắt trong dấu luyến
        }
        // Trong dấu luyến không lặp cùng một phím (không thể đàn liền hai lần cùng phím)
        if (open && n.slur !== 'start') expect(n.pitch, `${song.id}: luyến lặp phím`).not.toBe(prev);
        prev = n.pitch;
        if (n.slur === 'start') {
          expect(open).toBe(false);
          open = true;
        } else if (n.slur === 'end') {
          expect(open).toBe(true);
          open = false;
        }
      }
      expect(open).toBe(false);
    }
  });

  it('mọi nốt đúng thế tay & số ngón (§6 + thế mới); hai bè dài bằng nhau', () => {
    expect(validateTune(song)).toEqual([]);
  });

  it('nốt La duỗi chỉ ở thế Đô từ tuần 8; tay trái / hai tay đúng tuần', () => {
    if ((song.position ?? 'C') === 'C' && song.notes.some((n) => n.pitch === 'A4')) {
      expect(song.extension).toBe('A4');
      expect(song.week).toBeGreaterThanOrEqual(8);
    }
    if (song.hand === 'LH') expect(song.week).toBeGreaterThanOrEqual(7);
    if (song.hand === 'BOTH') expect(song.week).toBeGreaterThanOrEqual(11);
  });

  it('câu nhạc phủ kín bài; bàn phím ảo chứa mọi nốt', () => {
    const ranges = phraseRanges(song);
    expect(ranges[0][0]).toBe(0);
    expect(ranges[ranges.length - 1][1]).toBe(measureCount(song));
    const sliced = ranges.map(([a, b]) => totalBeats(slice(song, a, b)));
    expect(sliced.reduce((x, y) => x + y, 0)).toBe(totalBeats(song));
    const [lo, hi] = tuneRange(song).map(pitchToMidi);
    for (const n of allTimed(song)) if (n.pitch) expect(pitchToMidi(n.pitch)).toBeGreaterThanOrEqual(lo), expect(pitchToMidi(n.pitch)).toBeLessThanOrEqual(hi);
    if (!song.lh) expect(accompaniment(song).filter((a) => a.start % 1 === 0).length).toBeGreaterThan(0);
  });
});

describe('tune helpers', () => {
  const t: Tune = {
    id: 't', title: 't', titleVi: 't', hand: 'RH', bpm: 60, timeSignature: '4/4',
    notes: [
      { pitch: 'C4', beats: 1, finger: 1 },
      { rest: true, beats: 1 },
      { pitch: 'E4', beats: 2, finger: 3 },
      { pitch: 'G4', beats: 4, finger: 5 },
    ],
  };
  it('timeline tính phách bắt đầu & ô nhịp; playable bỏ dấu lặng', () => {
    expect(timeline(t).map((n) => [n.start, n.measure])).toEqual([[0, 0], [1, 0], [2, 0], [4, 1]]);
    expect(playable(t).map((n) => n.pitch)).toEqual(['C4', 'E4', 'G4']);
  });
  it('validateTune bắt lỗi ngón sai & nốt ngoài tầm', () => {
    const bad: Tune = { ...t, notes: [{ pitch: 'A4', beats: 2, finger: 5 }, { pitch: 'D4', beats: 2, finger: 3 }] };
    const errs = validateTune(bad);
    expect(errs.some((e) => e.includes('A4'))).toBe(true);
    expect(errs.some((e) => e.includes('D4'))).toBe(true);
  });
  it('bài hai tay: nhóm nốt cùng lúc gộp cả hai tay + hợp âm', () => {
    const both: Tune = {
      ...t, hand: 'BOTH',
      notes: [{ pitch: 'E4', beats: 2, finger: 3 }, { pitch: 'D4', beats: 2, finger: 2 }],
      lh: [{ pitch: 'C3', beats: 4, finger: 5, also: [{ pitch: 'G3', finger: 1 }] }],
    };
    expect(validateTune(both)).toEqual([]);
    const os = onsets(both);
    expect(os.map((o) => [o.start, o.pitches])).toEqual([[0, ['E4', 'C3', 'G3']], [2, ['D4']]]);
  });
});
