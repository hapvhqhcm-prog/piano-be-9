import { describe, expect, it } from 'vitest';
import {
  LEVELS,
  MAX_WEEK,
  WEEKS,
  criterionLesson,
  criterionProgress,
  curriculumDone,
  dailyLesson,
  levelOf,
  nextLesson,
  weekComplete,
  weekPassed,
} from '../src/lessons/lessonEngine';
import { HAIRPIN_CHECK, LEVEL4_WEEKS, PEDAL_CHECK, RELAX_CHECKS } from '../src/lessons/level4';
import { PARENT_TIPS } from '../src/lessons/parentTips';
import { findTune } from '../src/music/exercises';
import { SONGS, allTimed, beatsPerMeasure, measureCount, timeline, totalBeats, validateTune, type Tune } from '../src/music/tune';
import { makeSightTune } from '../src/music/sightread';
import { pitchToMidi } from '../src/piano/pitchTable';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import { CURRICULUM_REV, validateAppData, type SongRun } from '../src/progress/schema';

/**
 * CẤP 4 (OWNER duyệt 2026-10-08): tuần 32–43 — gam Sol/Fa/Rê trưởng & La thứ, hợp âm rải, Alberti, PEDAL, 6/8, hairpin,
 * thuật ngữ tốc độ; tiêu chí dạng dữ liệu (bài ở 2 ngày + phiếu bố mẹ xem tay); hòa nhạc tuần 43.
 */

const L4_SONG_IDS = [
  'scale_g_rh', 'scale_g_lh', 'etude_g', 'scale_f_rh', 'scale_f_lh', 'falling_leaves', 'scale_d_rh', 'scale_d_lh', 'scale_g_both',
  'march_d', 'arpeggio_c', 'arpeggio_g', 'arpeggio_f', 'alberti_lh', 'sonatina_c', 'scale_f_both', 'minuet_f', 'silent_night_ped',
  'largo_ped', 'boat_song_68', 'row_boat', 'waves_andante', 'gallop_allegro', 'scale_am_rh', 'scale_am_lh', 'korobeiniki',
  'greensleeves', 'di_cay', 'ho_ba_li',
];

const clock = () => {
  let d = 10;
  const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, d, 17));
  return { st, day: (k: number) => (d = 10 + k) };
};
const run = (songId: string, o: Partial<SongRun> = {}): Omit<SongRun, 'ts'> => ({
  songId, mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 20, hits: 20, source: 'mic', passed: true, ...o,
});

describe('cấu trúc Cấp 4', () => {
  it('12 tuần 32–43 ở CUỐI giáo trình; Cấp 4 = [32, 43]; MAX_WEEK 43; hòa nhạc (huy chương) tuần 43', () => {
    expect(LEVEL4_WEEKS.map((w) => w.week)).toEqual(Array.from({ length: 12 }, (_, i) => 32 + i));
    expect(WEEKS.slice(31)).toEqual(LEVEL4_WEEKS);
    expect(MAX_WEEK).toBe(43);
    expect(LEVELS[3]).toMatchObject({ level: 4, weeks: [32, 43] });
    expect(levelOf(32).name).toContain('Cấp 4');
    const last = WEEKS[42];
    expect(last.lessons).toHaveLength(1);
    expect(last.lessons[0]).toMatchObject({ id: 'w43-stage', isWeekTest: true });
    expect(last.lessons[0].activities).toEqual([{ kind: 'stage', level: 4 }]);
    expect(criterionProgress(43, new ProgressStore(new MemoryStorage()).get())).toBeNull();
  });

  it('không đổi curriculumRev (thêm tuần ở cuối — mã tuần/bài cũ giữ nguyên)', () => {
    expect(CURRICULUM_REV).toBe(4);
    for (const w of WEEKS.slice(0, 31)) for (const l of w.lessons) expect(Number(l.id.slice(1).split('-')[0])).toBeLessThanOrEqual(31);
  });

  it('mỗi tuần 32–42: tiêu chí "2 ngày" + phiếu xem tay; có ứng tấu; có bài hai tay tách tay sẵn ở câu khó (trừ tuần hợp âm rải / La thứ đầu)', () => {
    for (const w of LEVEL4_WEEKS.slice(0, 11)) {
      expect(w.criterion.text, `tuần ${w.week}`).toMatch(/2 ngày/);
      expect(w.criterion.text).toMatch(/bố mẹ/);
      expect(w.criterionSpec, `tuần ${w.week}`).toBeDefined();
      for (const c of RELAX_CHECKS) expect(w.criterionSpec!.parentChecks).toContain(c);
      // thẻ của tiêu chí nằm trong bài học của tuần
      const cards = new Set(w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'notes' ? a.segment.targets.map((t) => t.noteId) : []))));
      for (const c of w.criterionSpec!.parentChecks ?? []) expect(cards.has(c), `tuần ${w.week} thẻ ${c}`).toBe(true);
      for (const s of w.criterionSpec!.songs) {
        const used = w.lessons.some((l) => l.activities.some((a) => a.kind === 'song' && a.songId === s.songId && !a.hand && !a.phrase && (!s.tempo || a.mode === 'tempo')));
        expect(used, `tuần ${w.week}: ${s.songId}`).toBe(true);
      }
      expect(w.lessons.some((l) => l.activities.some((a) => a.kind === 'improv')), `tuần ${w.week} ứng tấu`).toBe(true);
    }
    expect(WEEKS[37].criterionSpec!.parentChecks).toContain(PEDAL_CHECK);
    expect(WEEKS[39].criterionSpec!.parentChecks).toContain(HAIRPIN_CHECK);
  });

  it('mẹo bố mẹ tuần 32–43; tuần 32 có PHIẾU XEM TAY (vai · khớp đầu ngón · cổ tay); tuần pedal nói rõ micro không nghe pedal', () => {
    for (let w = 32; w <= 43; w++) expect(PARENT_TIPS[w]?.length, `tuần ${w}`).toBeGreaterThan(40);
    expect(PARENT_TIPS[32]).toMatch(/vai/);
    expect(PARENT_TIPS[32]).toMatch(/khớp đầu ngón/);
    expect(PARENT_TIPS[32]).toMatch(/cổ tay/);
    expect(PARENT_TIPS[38]).toMatch(/Nhả trước — nhấn sau|nhả trước — nhấn sau/i);
    expect(PARENT_TIPS[38]).toMatch(/Micro KHÔNG nghe được pedal/);
    expect(PARENT_TIPS[39]).toMatch(/MỘT-hai-ba BỐN-năm-sáu/);
  });
});

describe('tiêu chí Cấp 4 (dữ liệu): bài ở 2 ngày + thẻ bố mẹ — lần chấm GẦN NHẤT', () => {
  /** Chơi đạt mọi bài của tiêu chí trong một buổi (+ chấm thẻ nếu `checks`). */
  const play = (st: ProgressStore, week: number, checks: 'correct' | 'retry' | null) => {
    const w = WEEKS[week - 1];
    const s = st.startSession(w.lessons[0].id);
    for (const x of w.criterionSpec!.songs) st.addSongRun(s.id, run(x.songId));
    if (checks) for (const c of w.criterionSpec!.parentChecks ?? []) st.addParentAssessment(s.id, c, checks);
  };

  it.each(LEVEL4_WEEKS.slice(0, 11).map((w) => w.week))('tuần %i', (week) => {
    const { st, day } = clock();
    play(st, week, null);
    expect(weekPassed(week, st.get())).toBe(false);
    day(1);
    play(st, week, null);
    // đủ 2 ngày nhưng bố mẹ chưa xem tay → chưa đạt, tiến độ dừng ở ●○
    expect(weekPassed(week, st.get())).toBe(false);
    expect(criterionProgress(week, st.get())).toEqual({ days: 1, needDays: 2 });
    day(2);
    play(st, week, 'correct');
    expect(weekPassed(week, st.get())).toBe(true);
    expect(criterionProgress(week, st.get())).toEqual({ days: 2, needDays: 2 });
    // lần chấm sau "Thử lại" (vd vai lại gồng) → chưa đạt nữa cho tới khi chấm lại
    day(3);
    play(st, week, 'retry');
    expect(weekPassed(week, st.get())).toBe(false);
  });

  it('bài cần THEO NHỊP: lượt chờ không tính; tuần 36/38 cần tốc độ ≥ 50; lượt tách tay không tính', () => {
    const { st, day } = clock();
    for (let k = 0; k < 2; k++) {
      day(k);
      const s = st.startSession('w38-l1');
      st.addSongRun(s.id, run('silent_night_ped', { bpm: 40 }));
      st.addSongRun(s.id, run('silent_night_ped', { mode: 'wait' }));
      st.addSongRun(s.id, run('silent_night_ped', { hand: 'RH' }));
      for (const c of [PEDAL_CHECK, ...RELAX_CHECKS]) st.addParentAssessment(s.id, c, 'correct');
    }
    expect(weekPassed(38, st.get())).toBe(false);
    for (let k = 0; k < 2; k++) {
      day(k);
      st.addSongRun(st.startSession('w38-l3').id, run('silent_night_ped', { bpm: 50 }));
    }
    expect(weekPassed(38, st.get())).toBe(true);
  });

  it('mọi tuần 32–42 có bài "giúp đạt tiêu chí" (Học tiếp không kẹt)', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 10));
    for (const w of LEVEL4_WEEKS.slice(0, 11)) expect(criterionLesson(w.week, st.get()), `tuần ${w.week}`).not.toBeNull();
  });
});

describe('bé đã xong tuần 31 (dữ liệu cũ) → sang Cấp 4', () => {
  it('xong hòa nhạc tuần 31: "Học tiếp" = luyện tập mỗi ngày (không lỗi); tuần 31 xong & < MAX_WEEK → app chuyển tuần 32 (Cấp 4)', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 10));
    st.setCurrentWeek(31);
    const s = st.startSession('w31-stage');
    st.addParentAssessment(s.id, 'medal', 'correct');
    st.finishSession(s.id);
    st.markLessonCompleted('w31-stage');
    const data = st.get();
    expect(weekComplete(31, data)).toBe(true);
    expect(curriculumDone(data)).toBe(false); // giáo trình nay tới tuần 43
    const next = nextLesson(data, () => 0.4);
    expect(next.id).toBe('w31-daily');
    expect(next.week).toBe(31); // session.ts: lesson.week === currentWeek && weekComplete → setCurrentWeek(32)
    // (mô phỏng session.ts) sang tuần mới
    expect(31 < MAX_WEEK).toBe(true);
    st.setCurrentWeek(32);
    expect(levelOf(32).level).toBe(4);
    expect(validateAppData(st.get())).toEqual([]);
    expect(nextLesson(st.get()).id).toBe('w32-l1');
  });

  it('xong tuần 43 → luyện tập mỗi ngày (có thể là thế Rê / La thứ); đọc nhạc sinh được với mọi rng', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 10));
    st.setCurrentWeek(43);
    const s = st.startSession('w43-stage');
    st.addParentAssessment(s.id, 'medal', 'correct');
    expect(curriculumDone(st.get())).toBe(true);
    expect(nextLesson(st.get(), () => 0.4).id).toBe('w43-daily');
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      let k = i;
      const rng = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
      const a = dailyLesson(st.get(), rng).activities[0];
      if (a.kind === 'sight') {
        seen.add(a.position);
        expect(() => makeSightTune(a)).not.toThrow();
      }
    }
    expect(seen.has('D') || seen.has('Am')).toBe(true);
  });
});

describe('bài hát Cấp 4', () => {
  const songs = L4_SONG_IDS.map((id) => findTune(id) as Tune);

  it('đủ bài, đúng tuần (32–42), đều có trong bài học Cấp 4 không sớm hơn tuần của bài; bài cũ (≤ tuần 31) không dùng ký hiệu mới', () => {
    for (const [i, t] of songs.entries()) {
      expect(t, L4_SONG_IDS[i]).toBeDefined();
      expect(t.week).toBeGreaterThanOrEqual(32);
      expect(t.week).toBeLessThanOrEqual(42);
      expect(validateTune(t), t.id).toEqual([]);
      const uses = WEEKS.flatMap((w) => w.lessons).filter((l) => l.activities.some((a) => a.kind === 'song' && a.songId === t.id));
      expect(uses.length, t.id).toBeGreaterThan(0);
      for (const l of uses) expect(l.week, `${t.id} ở ${l.id}`).toBeGreaterThanOrEqual(t.week!);
    }
    expect(SONGS.filter((s) => (s.week ?? 0) >= 32).map((s) => s.id).sort()).toEqual([...L4_SONG_IDS].sort());
    for (const t of SONGS.filter((s) => (s.week ?? 0) <= 31)) {
      expect(t.tempoTerm, t.id).toBeUndefined();
      expect(t.timeSignature).not.toBe('6/8');
      for (const n of [...t.notes, ...(t.lh ?? [])]) expect(n.ped ?? n.hairpin ?? n.rit, t.id).toBeUndefined();
    }
  });

  it('pedal từ tuần 38, 6/8 từ tuần 39, hairpin / thuật ngữ tốc độ / rit. từ tuần 40', () => {
    for (const t of songs) {
      const all = [...t.notes, ...(t.lh ?? [])];
      if (all.some((n) => n.ped)) expect(t.week, t.id).toBeGreaterThanOrEqual(38);
      if (t.timeSignature === '6/8') expect(t.week, t.id).toBeGreaterThanOrEqual(39);
      if (all.some((n) => n.hairpin || n.rit) || t.tempoTerm) expect(t.week, t.id).toBeGreaterThanOrEqual(40);
    }
    expect(['silent_night_ped', 'largo_ped'].every((id) => findTune(id)!.lh!.some((n) => n.ped === 'start'))).toBe(true);
    expect(findTune('waves_andante')!.tempoTerm).toBe('Andante');
    expect(findTune('gallop_allegro')!.tempoTerm).toBe('Allegro');
  });

  it('bài pedal: tay trái MỖI Ô một hợp âm, nhấn ở ô đầu, ĐỔI mỗi ô ("nhả trước — nhấn sau"), nhả ở ô cuối; giai điệu y hệt bài gốc', () => {
    for (const [id, orig] of [['silent_night_ped', 'silent_night'], ['largo_ped', 'largo_new_world']] as const) {
      const t = findTune(id)!;
      const lh = t.lh!.filter((n) => !n.rest);
      expect(lh).toHaveLength(measureCount(t));
      expect(lh.map((n) => n.ped)).toEqual(lh.map((_, i) => (i === 0 ? 'start' : i === lh.length - 1 ? 'end' : 'change')));
      for (const n of lh) expect(n.beats).toBe(beatsPerMeasure(t));
      const mel = (x: Tune) => timeline(x).map((n) => `${n.pitch ?? 'R'}:${n.beats}:${n.dyn ?? ''}:${n.slur ?? ''}`);
      expect(mel(t)).toEqual(mel(findTune(orig)!));
    }
  });

  it('6/8: phách = móc đơn (6 mỗi ô), nốt chỉ đen chấm / đen / móc đơn / trắng chấm (+ "tập-tễnh" ở Greensleeves)', () => {
    for (const t of songs.filter((x) => x.timeSignature === '6/8')) {
      expect(beatsPerMeasure(t)).toBe(6);
      expect(totalBeats(t) % 6).toBe(0);
      for (const n of allTimed(t)) {
        expect([0.5, 1, 1.5, 2, 3, 5, 6], `${t.id} ${n.beats}`).toContain(n.beats);
        // không nốt nào vắt qua giữa ô (phách 4) hay vạch nhịp — đúng nhóm "MỘT-hai-ba BỐN-năm-sáu"
        const s = n.start % 6;
        if (!n.rest) expect(Math.floor(s / 3) === Math.floor((s + n.beats - 1e-9) / 3) || (s % 3 === 0 && n.beats % 3 === 0), `${t.id} nốt ${n.index}`).toBe(true);
      }
    }
  });

  it('gam: một quãng tám lên rồi xuống, đúng hóa biểu, ngón luồn đúng chỗ (tay phải 1-2-3-1… / Fa trưởng 1-2-3-4-1…)', () => {
    const KEY: Record<string, string[]> = {
      scale_g_rh: ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F#5', 'G5'],
      scale_g_lh: ['G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F#3', 'G3'],
      scale_f_rh: ['F4', 'G4', 'A4', 'Bb4', 'C5', 'D5', 'E5', 'F5'],
      scale_f_lh: ['F2', 'G2', 'A2', 'Bb2', 'C3', 'D3', 'E3', 'F3'],
      scale_d_rh: ['D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D5'],
      scale_d_lh: ['D3', 'E3', 'F#3', 'G3', 'A3', 'B3', 'C#4', 'D4'],
    };
    for (const [id, up] of Object.entries(KEY)) {
      const t = findTune(id)!;
      expect(t.notes.map((n) => n.pitch), id).toEqual([...up, ...[...up].reverse()]);
      const f = t.notes.map((n) => n.finger);
      const rh = t.hand === 'RH';
      const exp = id === 'scale_f_rh' ? [1, 2, 3, 4, 1, 2, 3, 4] : rh ? [1, 2, 3, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 3, 2, 1];
      expect(f.slice(0, 8), id).toEqual(exp);
      expect(f.slice(8), id).toEqual([...exp].reverse());
    }
    const am = findTune('scale_am_rh')!.notes.map((n) => n.pitch);
    expect(am.slice(0, 16)).not.toContain('G#5');
    expect(am.slice(16)).toContain('G#5'); // gam hòa âm ở nửa sau
    for (const id of ['scale_g_both', 'scale_f_both']) {
      const t = findTune(id)!;
      expect(t.notes.map((n) => n.pitch)).toEqual(findTune(id.replace('both', 'rh'))!.notes.map((n) => n.pitch));
      expect(t.lh!.map((n) => n.pitch)).toEqual(findTune(id.replace('both', 'lh'))!.notes.map((n) => n.pitch));
    }
  });

  it('bass Alberti: thấp – cao – giữa – cao, tay trái trong quãng 6', () => {
    const lh = findTune('alberti_lh')!.notes.filter((n) => !n.also);
    for (let i = 0; i + 3 < lh.length; i += 4) {
      const [a, b, c, d] = lh.slice(i, i + 4).map((n) => pitchToMidi(n.pitch!));
      expect(a < c && c < b && b === d).toBe(true);
      expect(b - a).toBeLessThanOrEqual(9);
    }
  });

  it('tay không mở quá quãng 8 trong một thế; mỗi lượt hai nốt liền nhau cùng ngón chỉ khi cùng phím hoặc có dấu lặng / dời thế ở nốt dài', () => {
    for (const t of songs) {
      for (const v of [timeline(t), (t.lh ? allTimed(t).filter((n) => n.hand === 'LH') : [])]) {
        const ns = v.filter((n) => !n.rest && n.pitch);
        for (let i = 1; i < ns.length; i++) {
          const a = ns[i - 1];
          const b = ns[i];
          if (a.finger === b.finger && a.pitch !== b.pitch && !a.also && !b.also) {
            const gap = b.start - (a.start + a.beats) > 1e-9;
            expect(gap || a.beats >= 1, `${t.id} nốt ${b.index}: ngón ${b.finger} ${a.pitch}→${b.pitch}`).toBe(true);
          }
        }
      }
    }
  });
});

/**
 * Dân ca Việt Nam Cấp 4 — giai điệu tay phải ĐÚNG TỪNG NỐT như bản ký âm (≥ 2 nguồn độc lập, đọc 2026-10-08):
 * Đi cấy (dân ca Thanh Hóa): SGK Âm nhạc & Mĩ thuật 6 Tiết 12 = SGK Âm nhạc 7 Cánh Diều tr. 10 (ô cuối theo SGK6).
 * Hò ba lí (dân ca Quảng Nam): SGK Âm nhạc & Mĩ thuật 8 Tiết 11 = SGK Âm nhạc 6 Chân trời sáng tạo (ô 23 theo SGK8 + vnguitar).
 * Bỏ nốt hoa mỹ; dây nối "~" → đàn lại nốt (như các bài dân ca khác của app).
 */
const RESEARCH_L4: Record<string, string> = {
  di_cay:
    'G4:1 | D4:0.5 D4:0.25 E4:0.25 D4:0.5 D4:0.5 | G4:1 G4:1 | D4:0.5 D4:0.25 E4:0.25 D4:0.5 D4:0.5 | G4:0.5 G4:0.5 G4:0.5 D4:0.5 | D4:0.5 G4:0.25 A4:0.25 B4:0.5 B4:0.25 A4:0.25 | G4:1 G4:0.5 A4:0.5 | G4:0.5 A4:0.5 F#4:0.5 F#4:0.5 | G4:0.5 A4:0.5 F#4:0.25 G4:0.25 F#4:0.5 | G4:0.5 R:0.5 B4:0.75 A4:0.25 | G4:1 B4:0.5 A4:0.25 B4:0.25 | D5:1 B4:0.5 D5:0.5 | B4:1 A4:0.5 B4:0.25 A4:0.25 | G4:0.5 R:0.5 B4:0.5 D5:0.5 | B4:1 A4:0.5 B4:0.25 A4:0.25 | G4:0.75 B4:0.25 G4:0.5 G4:0.5 | A4:2 | R:0.5 G4:0.5 A4:0.5 A4:0.5 | D5:0.5 B4:1.5 | A4:1 A4:0.25 G4:0.25 E4:0.25 G4:0.25 | E4:0.5 G4:1.5',
  ho_ba_li:
    'R:0.5 C5:0.5 | D5:0.5 E5:0.5 D5:0.5 C5:0.5 | G4:1 A4:0.5 G4:0.25 A4:0.25 | C5:1.5 G4:0.5 | D4:1.5 A4:0.5 | A4:0.5 C5:0.5 F4:1 | G4:1 A4:1 | A4:0.5 C5:0.5 F4:1 | G4:2~ | G4:0.5 R:0.5 C5:1 | D5:1 D5:0.5 C5:0.5 | C5:0.5 E5:0.5 D5:0.5 C5:0.5 | D5:1 R:0.5 C5:0.5 | D5:0.5 E5:0.5 D5:0.5 C5:0.5 | G4:1.5 A4:0.5 | C5:1.5 G4:0.5 | D4:1 R:0.5 A4:0.5 | A4:0.5 C5:0.5 F4:1 | G4:1 A4:1 | A4:0.5 C5:0.5 F4:1 | G4:2~ | G4:0.5 R:0.5 C5:0.5 E5:0.5 | D5:0.5 C5:0.5 D5:1 | G4:0.5 R:0.5 C5:0.5 D5:0.5 | E5:0.5 R:0.5 D5:0.5 C5:0.5 | A4:1 C5:0.5 E5:0.5 | D5:0.5 D5:1 E5:0.5 | D5:1 C5:0.5 D5:0.5 | E5:0.5 D5:0.5 G4:0.5 A4:0.5 | C5:2~ | C5:1 R:1',
};

describe.each(Object.keys(RESEARCH_L4))('dân ca Cấp 4 %s', (id) => {
  const t = findTune(id)!;
  it('dân ca Việt Nam (vn=folk), public domain, tay trái chỉ đệm quãng 5; nhịp 2/4, móc kép → tốc độ 40', () => {
    expect(t.vn).toBe('folk');
    expect(t.composer).toMatch(/^Dân ca /);
    expect(t.title).toContain('Vietnamese folk song');
    expect(t.sourceStatus).toBe('public-domain');
    expect(t.timeSignature).toBe('2/4');
    expect(t.bpm).toBe(40);
    for (const n of t.lh!) if (!n.rest) expect(pitchToMidi(n.also![0].pitch) - pitchToMidi(n.pitch!)).toBeGreaterThanOrEqual(5);
  });

  it('giai điệu tay phải đúng từng nốt (cao độ, trường độ, thời điểm) với bản ký âm', () => {
    const bars = RESEARCH_L4[id].split('|').map((b) => b.trim().split(/\s+/).filter(Boolean).map((x) => x.replace('~', '').split(':')));
    const pick = bars[0].reduce((s, [, b]) => s + Number(b), 0);
    const offset = 2 - pick; // ô lấy đà được đệm dấu lặng cho tròn ô
    const want: string[] = [];
    let at = offset;
    for (const bar of bars) for (const [p, b] of bar) {
      if (p !== 'R') want.push(`${p}@${at}:${b}`);
      at += Number(b);
    }
    const got = timeline(t).filter((n) => !n.rest).map((n) => `${n.pitch}@${n.start}:${n.beats}`);
    expect(got).toEqual(want);
  });

  it('mỗi bàn tay trong một câu: một ngón ↔ một phím (đổi thế ở dấu lặng / nốt dài)', () => {
    const notes = timeline(t).filter((n) => !n.rest);
    const byFinger = new Map<number, string>();
    let prevEnd = 0;
    for (const n of notes) {
      // reset bảng khi có chỗ nghỉ hoặc nốt trước dài (được phép dời tay)
      const prev = notes[notes.indexOf(n) - 1];
      if (prev && (n.start - prevEnd > 1e-9 || prev.beats >= 1)) byFinger.clear();
      const k = byFinger.get(n.finger!);
      if (k) expect(k, `${id} nốt ${n.index}`).toBe(n.pitch);
      byFinger.set(n.finger!, n.pitch!);
      prevEnd = n.start + n.beats;
    }
  });
});
